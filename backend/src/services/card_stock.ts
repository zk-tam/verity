import { Pool, PoolClient } from "pg";
import { BaseService } from "./base";
import { CardStock, CardStockModel, StockUploadEntry } from "../models/card_stock";
import { CardModel } from "../models/card";
import { CardService } from "./card";

/**
 * Joined view of a card_stock row with its parent card metadata. The roll
 * picker, EV calc, and admin listings all want both sides.
 */
export interface StockRowWithCard extends CardStock {
  card: CardModel;
}

export interface CardStockUpdate {
  cert_id?: string | null;
  is_disabled?: boolean;
  release_pnl_threshold_usd?: number | null;
  machine_id?: number;
}

export class CardStockService extends BaseService {
  constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
    super({ pool, client });
  }

  /**
   * Bulk-upload stock to a machine. For each entry: resolve to an existing
   * cards.id by pricecharting_id (or insert a new cards row if no match),
   * then create a card_stock row referencing that card.
   *
   * One transaction so a partial failure doesn't half-create stock. Two-ish
   * queries for cards resolution + one INSERT for the card_stock rows,
   * regardless of batch size.
   */
  public async uploadToMachine(
    machineId: number,
    entries: ReadonlyArray<StockUploadEntry>,
  ): Promise<CardStockModel[]> {
    if (!entries.length) return [];
    if (!this.pool) throw new Error("uploadToMachine requires a pool");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cards = new CardService({ pool: this.pool });
      const cardIds = await cards.resolveCardIdsForUpload(
        client,
        entries.map((e) => ({
          name: e.name,
          value_usd: e.value_usd,
          image_url: e.image_url ?? null,
          entity: e.entity ?? null,
          grade: e.grade ?? null,
          type: e.type ?? "card",
          pricecharting_id: e.pricecharting_id ?? null,
          tcgplayer_id: e.tcgplayer_id ?? null,
        })),
      );

      const placeholders: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        placeholders.push(
          `($${p++}, $${p++}, $${p++}, $${p++})`,
        );
        params.push(
          cardIds[i],
          machineId,
          e.cert_id ?? null,
          e.release_pnl_threshold_usd ?? null,
        );
      }
      const insRes = await client.query<CardStock>(
        `INSERT INTO card_stock
           (card_id, machine_id, cert_id, release_pnl_threshold_usd)
         VALUES ${placeholders.join(",")}
         RETURNING *`,
        params,
      );
      await client.query("COMMIT");
      return insRes.rows.map((r) => new CardStockModel(r));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * List all stock rows on a machine with their card metadata joined in.
   * Optional filters: include_disabled, include_consumed.
   */
  public async listByMachine(
    machineId: number,
    opts: { includeDisabled?: boolean; includeConsumed?: boolean } = {},
  ): Promise<StockRowWithCard[]> {
    const conditions: string[] = ["cs.machine_id = $1"];
    const params: unknown[] = [machineId];
    if (!opts.includeDisabled) conditions.push("cs.is_disabled = FALSE");
    if (!opts.includeConsumed) conditions.push("cs.consumed_at IS NULL");
    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await this.query<CardStockJoinedRow>(
      `SELECT cs.*,
              c.id AS c_id, c.name AS c_name, c.value_usd AS c_value_usd,
              c.image_url AS c_image_url, c.entity AS c_entity,
              c.grade AS c_grade, c.type AS c_type,
              c.pricecharting_id AS c_pricecharting_id,
              c.tcgplayer_id AS c_tcgplayer_id,
              c.created_at AS c_created_at, c.updated_at AS c_updated_at
         FROM card_stock cs
         JOIN cards c ON c.id = cs.card_id
        ${where}
        ORDER BY c.value_usd DESC, cs.id ASC`,
      params,
    );
    return result.rows.map(joinedRowToModel);
  }

  public async getById(id: number): Promise<StockRowWithCard | null> {
    const result = await this.query<CardStockJoinedRow>(
      `SELECT cs.*,
              c.id AS c_id, c.name AS c_name, c.value_usd AS c_value_usd,
              c.image_url AS c_image_url, c.entity AS c_entity,
              c.grade AS c_grade, c.type AS c_type,
              c.pricecharting_id AS c_pricecharting_id,
              c.tcgplayer_id AS c_tcgplayer_id,
              c.created_at AS c_created_at, c.updated_at AS c_updated_at
         FROM card_stock cs
         JOIN cards c ON c.id = cs.card_id
        WHERE cs.id = $1`,
      [id],
    );
    return result.rows.length ? joinedRowToModel(result.rows[0]) : null;
  }

  public async update(
    id: number,
    payload: CardStockUpdate,
  ): Promise<CardStockModel | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      params.push(value);
    }
    if (!sets.length) {
      const cur = await this.query<CardStock>(
        `SELECT * FROM card_stock WHERE id = $1`,
        [id],
      );
      return cur.rows.length ? new CardStockModel(cur.rows[0]) : null;
    }
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const result = await this.query<CardStock>(
      `UPDATE card_stock SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return result.rows.length ? new CardStockModel(result.rows[0]) : null;
  }

  /** Delete an unconsumed row. Refuses if a roll already references it. */
  public async deleteById(id: number): Promise<boolean> {
    const result = await this.query<{ id: number }>(
      `DELETE FROM card_stock WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

interface CardStockJoinedRow extends CardStock {
  c_id: number;
  c_name: string;
  c_value_usd: string;
  c_image_url: string | null;
  c_entity: string | null;
  c_grade: number | null;
  c_type: "card" | "item";
  c_pricecharting_id: string | null;
  c_tcgplayer_id: string | null;
  c_created_at: Date;
  c_updated_at: Date;
}

function joinedRowToModel(row: CardStockJoinedRow): StockRowWithCard {
  const stock = new CardStockModel(row);
  const card = new CardModel({
    id: row.c_id,
    name: row.c_name,
    value_usd: Number(row.c_value_usd),
    image_url: row.c_image_url,
    entity: row.c_entity,
    grade: row.c_grade,
    type: row.c_type,
    pricecharting_id: row.c_pricecharting_id,
    tcgplayer_id: row.c_tcgplayer_id,
    created_at: row.c_created_at,
    updated_at: row.c_updated_at,
  });
  return Object.assign(stock, { card });
}
