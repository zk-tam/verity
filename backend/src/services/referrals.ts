import { Pool, PoolClient } from "pg";
import { BaseService } from "./base";
import { Referral, ReferralModel } from "../models/referrals";
import { generateReferralCode } from "../lib/utils";

/** Users have this long after signup to apply someone else's referral code. */
export const REFERRAL_APPLY_WINDOW = "1 minute";

/**
 * Pure link store. The system records who referred whom, but pays out no
 * commissions — that whole engine has been retired.
 */
export class ReferralService extends BaseService {
  constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
    super({ pool, client });
  }

  /** Idempotent: returns the user's referral row, creating one with a code if missing. */
  public async getOrCreate(userId: string): Promise<ReferralModel> {
    const existing = await this.getByUserId(userId);
    if (existing) return existing;

    // Retry on collision; codes are short.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode();
      try {
        const result = await this.query<Referral>(
          `INSERT INTO referrals (user_id, referral_code) VALUES ($1, $2) RETURNING *`,
          [userId, code],
        );
        return new ReferralModel(result.rows[0]);
      } catch (err) {
        if (attempt === 4) throw err;
      }
    }
    throw new Error("Could not allocate referral code");
  }

  public async getByUserId(userId: string): Promise<ReferralModel | null> {
    const result = await this.query<Referral>(
      `SELECT * FROM referrals WHERE user_id = $1`,
      [userId],
    );
    return result.rows.length ? new ReferralModel(result.rows[0]) : null;
  }

  public async getByCode(code: string): Promise<ReferralModel | null> {
    const result = await this.query<Referral>(
      `SELECT * FROM referrals WHERE referral_code = $1`,
      [code],
    );
    return result.rows.length ? new ReferralModel(result.rows[0]) : null;
  }

  /**
   * Sets the caller's referrer, but only while the apply window is open.
   * Returns null if the window has elapsed (or if the referrals row does not
   * exist — callers should guarantee that with `getOrCreate` first).
   */
  public async setReferredBy(
    userId: string,
    referrerId: string,
  ): Promise<ReferralModel | null> {
    const result = await this.query<Referral>(
      `UPDATE referrals
          SET referred_by = $2, updated_at = NOW()
        WHERE user_id = $1
          AND EXISTS (
            SELECT 1 FROM "user" u
             WHERE u.id = referrals.user_id
               AND u."createdAt" > NOW() - INTERVAL '${REFERRAL_APPLY_WINDOW}'
          )
        RETURNING *`,
      [userId, referrerId],
    );
    return result.rows.length ? new ReferralModel(result.rows[0]) : null;
  }
}
