import { Pool, PoolClient } from "pg";
import { BaseService } from "./base";
import { GachaMachine, GachaMachineModel } from "../models/gacha_machine";

export interface MachineInput {
  name: string;
  description?: string | null;
  image_url?: string | null;
  price_usd: number;
  is_available?: boolean;
}

export class GachaMachineService extends BaseService {
  constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
    super({ pool, client });
  }

  public async getById(id: number): Promise<GachaMachineModel | null> {
    const result = await this.query<GachaMachine>(
      `SELECT * FROM gacha_machines WHERE id = $1`,
      [id],
    );
    return result.rows.length ? new GachaMachineModel(result.rows[0]) : null;
  }

  public async list(opts: { onlyAvailable?: boolean } = {}): Promise<GachaMachineModel[]> {
    const where = opts.onlyAvailable ? `WHERE is_available = TRUE` : "";
    const result = await this.query<GachaMachine>(
      `SELECT * FROM gacha_machines ${where} ORDER BY id ASC`,
    );
    return result.rows.map((r) => new GachaMachineModel(r));
  }

  public async create(payload: MachineInput): Promise<GachaMachineModel> {
    const result = await this.query<GachaMachine>(
      `INSERT INTO gacha_machines (name, description, image_url, price_usd, is_available)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        payload.name,
        payload.description ?? null,
        payload.image_url ?? null,
        payload.price_usd,
        payload.is_available ?? true,
      ],
    );
    return new GachaMachineModel(result.rows[0]);
  }

  public async update(
    id: number,
    payload: Partial<MachineInput>,
  ): Promise<GachaMachineModel | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      params.push(value);
    }
    if (!sets.length) return this.getById(id);
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const result = await this.query<GachaMachine>(
      `UPDATE gacha_machines SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return result.rows.length ? new GachaMachineModel(result.rows[0]) : null;
  }

}
