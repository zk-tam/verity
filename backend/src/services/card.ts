import { Pool, PoolClient } from "pg";
import { BaseService } from "./base";
import { Card, CardModel, CardType } from "../models/card";

export interface CardCreate {
  name: string;
  value_usd: number;
  image_url?: string | null;
  entity?: string | null;
  grade?: number | null;
  type?: CardType;
  pricecharting_id?: string | null;
  tcgplayer_id?: string | null;
}

export interface CardUpdate {
  name?: string;
  value_usd?: number;
  image_url?: string | null;
  entity?: string | null;
  grade?: number | null;
  type?: CardType;
  pricecharting_id?: string | null;
  tcgplayer_id?: string | null;
}

export class CardService extends BaseService {
  constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
    super({ pool, client });
  }

  public async list(opts: {
    limit?: number;
    offset?: number;
    search?: string;
  } = {}): Promise<{ cards: CardModel[]; total: number }> {
    const { limit = 100, offset = 0, search } = opts;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR entity ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows, total] = await Promise.all([
      this.query<Card>(
        `SELECT * FROM cards ${where}
          ORDER BY id DESC
          LIMIT $${idx++} OFFSET $${idx}`,
        [...params, limit, offset],
      ),
      this.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM cards ${where}`,
        params,
      ),
    ]);
    return {
      cards: rows.rows.map((r) => new CardModel(r)),
      total: Number(total.rows[0].count),
    };
  }

  public async getById(id: number): Promise<CardModel | null> {
    const result = await this.query<Card>(`SELECT * FROM cards WHERE id = $1`, [id]);
    return result.rows.length ? new CardModel(result.rows[0]) : null;
  }

  public async create(payload: CardCreate): Promise<CardModel> {
    const result = await this.query<Card>(
      `INSERT INTO cards
         (name, value_usd, image_url, entity, grade, type,
          pricecharting_id, tcgplayer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        payload.name,
        payload.value_usd,
        payload.image_url ?? null,
        payload.entity ?? null,
        payload.grade ?? null,
        payload.type ?? "card",
        payload.pricecharting_id ?? null,
        payload.tcgplayer_id ?? null,
      ],
    );
    return new CardModel(result.rows[0]);
  }

  public async update(id: number, payload: CardUpdate): Promise<CardModel | null> {
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
    const result = await this.query<Card>(
      `UPDATE cards SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return result.rows.length ? new CardModel(result.rows[0]) : null;
  }

  /**
   * Resolve every entry to a cards.id. For entries with a pricecharting_id,
   * upsert into cards (existing rows on conflict are left untouched — the
   * pricecharting worker is the source of truth for value_usd, and admin
   * uploads shouldn't clobber a newer FMV with stale CSV input). For
   * entries without a pricecharting_id, insert a fresh row each time
   * (no dedupe possible). Returns the list of card_ids in input order.
   *
   * Two queries total regardless of batch size: one INSERT...ON CONFLICT
   * for pc_id-bearing entries (with RETURNING + a subsequent SELECT for
   * the conflicting rows whose RETURNING was suppressed), one INSERT for
   * the no-pc_id entries.
   */
  public async resolveCardIdsForUpload(
    client: PoolClient,
    entries: ReadonlyArray<CardCreate>,
  ): Promise<number[]> {
    if (!entries.length) return [];
    const cardIds = new Array<number | null>(entries.length).fill(null);

    // Group entries by whether they carry a pricecharting_id.
    const withPc: Array<{ idx: number; entry: CardCreate; pc: string }> = [];
    const noPc: Array<{ idx: number; entry: CardCreate }> = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pc = e.pricecharting_id?.trim();
      if (pc) withPc.push({ idx: i, entry: e, pc });
      else noPc.push({ idx: i, entry: e });
    }

    // ── Path A: dedupe-by-pricecharting_id ────────────────────────────────
    if (withPc.length) {
      // First, look up existing cards for these pc_ids in one shot.
      const pcIds = Array.from(new Set(withPc.map((r) => r.pc)));
      const existingRes = await client.query<{ id: number; pricecharting_id: string }>(
        `SELECT id, pricecharting_id FROM cards
          WHERE pricecharting_id = ANY($1::text[])`,
        [pcIds],
      );
      const pcToId = new Map<string, number>();
      for (const r of existingRes.rows) {
        pcToId.set(r.pricecharting_id, r.id);
      }

      // Insert any pc_ids that don't exist yet. Use the *first* entry per
      // pc_id as the source of truth for card metadata.
      const newPcIds = pcIds.filter((pc) => !pcToId.has(pc));
      if (newPcIds.length) {
        const seenPc = new Set<string>();
        const inserts: CardCreate[] = [];
        for (const r of withPc) {
          if (!pcToId.has(r.pc) && !seenPc.has(r.pc)) {
            seenPc.add(r.pc);
            inserts.push(r.entry);
          }
        }
        const placeholders: string[] = [];
        const params: unknown[] = [];
        let p = 1;
        for (const e of inserts) {
          placeholders.push(
            `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
          );
          params.push(
            e.name,
            e.value_usd,
            e.image_url ?? null,
            e.entity ?? null,
            e.grade ?? null,
            e.type ?? "card",
            e.pricecharting_id,
            e.tcgplayer_id ?? null,
          );
        }
        // ON CONFLICT DO NOTHING handles a concurrent insert from another
        // upload; we re-SELECT below to fill in ids the RETURNING missed.
        const insRes = await client.query<{ id: number; pricecharting_id: string }>(
          `INSERT INTO cards
             (name, value_usd, image_url, entity, grade, type,
              pricecharting_id, tcgplayer_id)
           VALUES ${placeholders.join(",")}
           ON CONFLICT (pricecharting_id) DO NOTHING
           RETURNING id, pricecharting_id`,
          params,
        );
        for (const r of insRes.rows) {
          pcToId.set(r.pricecharting_id, r.id);
        }
        // Catch any rows skipped by ON CONFLICT (rare race with another tx).
        const stillMissing = newPcIds.filter((pc) => !pcToId.has(pc));
        if (stillMissing.length) {
          const refetch = await client.query<{ id: number; pricecharting_id: string }>(
            `SELECT id, pricecharting_id FROM cards
              WHERE pricecharting_id = ANY($1::text[])`,
            [stillMissing],
          );
          for (const r of refetch.rows) {
            pcToId.set(r.pricecharting_id, r.id);
          }
        }
      }

      for (const r of withPc) {
        const id = pcToId.get(r.pc);
        if (id == null) {
          throw new Error(
            `failed to resolve cards.id for pricecharting_id=${r.pc}`,
          );
        }
        cardIds[r.idx] = id;
      }
    }

    // ── Path B: no pricecharting_id → fresh row per entry ─────────────────
    if (noPc.length) {
      const placeholders: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (const r of noPc) {
        placeholders.push(
          `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
        );
        params.push(
          r.entry.name,
          r.entry.value_usd,
          r.entry.image_url ?? null,
          r.entry.entity ?? null,
          r.entry.grade ?? null,
          r.entry.type ?? "card",
          null,
          r.entry.tcgplayer_id ?? null,
        );
      }
      const insRes = await client.query<{ id: number }>(
        `INSERT INTO cards
           (name, value_usd, image_url, entity, grade, type,
            pricecharting_id, tcgplayer_id)
         VALUES ${placeholders.join(",")}
         RETURNING id`,
        params,
      );
      // INSERT...RETURNING preserves input order in PostgreSQL.
      for (let k = 0; k < noPc.length; k++) {
        cardIds[noPc[k].idx] = insRes.rows[k].id;
      }
    }

    if (cardIds.some((id) => id == null)) {
      throw new Error("CardService.resolveCardIdsForUpload: unresolved entry");
    }
    return cardIds as number[];
  }
}
