import { Pool, PoolClient } from "pg";
import { BaseService } from "./base";
import { User, UserModel } from "../models/users";
import { randomBytes } from "crypto";

export class UserService extends BaseService {
  constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
    super({ pool, client });
  }

  public async getById(id: string): Promise<UserModel | null> {
    const result = await this.query<User>(
      `SELECT * FROM "user" WHERE id = $1`,
      [id],
    );
    return result.rows.length ? new UserModel(result.rows[0]) : null;
  }

  public async getByEmail(email: string): Promise<UserModel | null> {
    const result = await this.query<User>(
      `SELECT * FROM "user" WHERE email = $1`,
      [email],
    );
    return result.rows.length ? new UserModel(result.rows[0]) : null;
  }

  /**
   * Stable read: resolves an id to a row, inserting a stub if missing. Used by
   * routes that have a verified userId from the auth middleware but want to
   * be safe against a deleted row mid-session.
   */
  public async getOrCreate(id: string): Promise<UserModel> {
    const existing = await this.getById(id);
    if (existing) return existing;
    const result = await this.query<User>(
      `INSERT INTO "user" (id) VALUES ($1) RETURNING *`,
      [id],
    );
    return new UserModel(result.rows[0]);
  }

  public async upsertUser(payload: {
    id?: string;
    privy_did?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }): Promise<UserModel> {
    const id = payload.id ?? randomBytes(16).toString("hex");
    const result = await this.query<User>(
      `INSERT INTO "user" (id, privy_did, name, email, image)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET privy_did = COALESCE(EXCLUDED.privy_did, "user".privy_did),
             name      = COALESCE(EXCLUDED.name, "user".name),
             email     = COALESCE(EXCLUDED.email, "user".email),
             image     = COALESCE(EXCLUDED.image, "user".image),
             "updatedAt" = NOW()
       RETURNING *`,
      [
        id,
        payload.privy_did ?? null,
        payload.name ?? null,
        payload.email ?? null,
        payload.image ?? null,
      ],
    );
    return new UserModel(result.rows[0]);
  }

  public async updateProfile(
    userId: string,
    payload: { name?: string; image?: string | null },
  ): Promise<UserModel | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (payload.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(payload.name);
    }
    if (payload.image !== undefined) {
      sets.push(`image = $${idx++}`);
      params.push(payload.image);
    }
    if (!sets.length) return this.getById(userId);
    sets.push(`"updatedAt" = NOW()`);
    params.push(userId);
    const result = await this.query<User>(
      `UPDATE "user" SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return result.rows.length ? new UserModel(result.rows[0]) : null;
  }

  public async setInternalAccountStatus(
    userId: string,
    isInternalAccount: boolean,
  ): Promise<UserModel | null> {
    const result = await this.query<User>(
      `UPDATE "user" SET is_internal_account = $2, "updatedAt" = NOW()
        WHERE id = $1 RETURNING *`,
      [userId, isInternalAccount],
    );
    return result.rows.length ? new UserModel(result.rows[0]) : null;
  }

  public async setBanStatus(
    userId: string,
    banned: boolean,
    banReason: string | null,
  ): Promise<UserModel | null> {
    const result = await this.query<User>(
      `UPDATE "user" SET banned = $2, ban_reason = $3, "updatedAt" = NOW()
        WHERE id = $1 RETURNING *`,
      [userId, banned, banReason],
    );
    return result.rows.length ? new UserModel(result.rows[0]) : null;
  }

  // ── Activity / device tracking (DAU + anti-abuse) ──────────────────────
  public async trackDailyActivity(userId: string): Promise<void> {
    await this.query(
      `INSERT INTO user_daily_activity (user_id, activity_date)
       VALUES ($1, CURRENT_DATE)
       ON CONFLICT (user_id, activity_date) DO NOTHING`,
      [userId],
    );
  }

  public async trackDeviceAndIp(
    userId: string,
    ip: string | null,
    deviceId: string | null,
    threatScore: number | null,
  ): Promise<void> {
    await this.query(
      `INSERT INTO user_device_ip_log (user_id, ip, device_id, threat_score)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT user_device_ip_log_unique DO UPDATE
         SET last_seen_at = NOW(),
             threat_score = COALESCE(EXCLUDED.threat_score, user_device_ip_log.threat_score)`,
      [userId, ip, deviceId, threatScore],
    );
  }

  public async getDailyActiveUsers(date: string): Promise<number> {
    const result = await this.query<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id) AS count
         FROM user_daily_activity
        WHERE activity_date = $1`,
      [date],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  // ── Admin: paginated user list ─────────────────────────────────────────
  public async list(opts: {
    limit?: number;
    offset?: number;
    search?: string;
    role?: string;
    banned?: boolean;
    isInternalAccount?: boolean;
  }): Promise<{ users: UserModel[]; total: number }> {
    const { limit = 100, offset = 0, search, role, banned, isInternalAccount } = opts;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (search) {
      conditions.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.id ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (role !== undefined) {
      conditions.push(`u.role = $${idx++}`);
      params.push(role);
    }
    if (banned !== undefined) {
      conditions.push(`u.banned = $${idx++}`);
      params.push(banned);
    }
    if (isInternalAccount !== undefined) {
      conditions.push(`u.is_internal_account = $${idx++}`);
      params.push(isInternalAccount);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows, total] = await Promise.all([
      this.query<User>(
        `SELECT u.* FROM "user" u ${where}
         ORDER BY u."createdAt" DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        [...params, limit, offset],
      ),
      this.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM "user" u ${where}`,
        params,
      ),
    ]);
    return {
      users: rows.rows.map((r) => new UserModel(r)),
      total: Number(total.rows[0].count),
    };
  }
}
