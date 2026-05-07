import { z } from "zod";

// One physical card on one machine. Card-type metadata (name, value_usd,
// image_url, entity, grade, type, pricecharting_id, tcgplayer_id) lives on
// the global `cards` table — this row just references it via card_id.
//
// Each row = 1 physical instance, never deduped: two rows of the same
// card_id mean two distinct physical copies on the same machine, even if
// cert_id is NULL on both. cert_id (when set) is globally unique, catching
// duplicate slabs as a hard data error.
//
// consumed_at is the "gone" flag (NULL = available, NOT NULL = awarded).
// release_pnl_threshold_usd: NULL = always pickable; otherwise the row
// joins the weighted pool only when machine.cached_pnl_usd >= threshold.
// Forced drops bypass both is_disabled and the threshold check.
export interface CardStock {
  id: number;
  card_id: number;
  machine_id: number;
  cert_id: string | null;
  is_disabled: boolean;
  release_pnl_threshold_usd: number | null;
  consumed_at: Date | null;
  consumed_by_roll_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export class CardStockModel implements CardStock {
  id: number;
  card_id: number;
  machine_id: number;
  cert_id: string | null;
  is_disabled: boolean;
  release_pnl_threshold_usd: number | null;
  consumed_at: Date | null;
  consumed_by_roll_id: number | null;
  created_at: Date;
  updated_at: Date;

  constructor(data: CardStock) {
    this.id = data.id;
    this.card_id = data.card_id;
    this.machine_id = data.machine_id;
    this.cert_id = data.cert_id ?? null;
    this.is_disabled = Boolean(data.is_disabled);
    this.release_pnl_threshold_usd =
      data.release_pnl_threshold_usd != null
        ? Number(data.release_pnl_threshold_usd)
        : null;
    this.consumed_at = data.consumed_at ? new Date(data.consumed_at) : null;
    this.consumed_by_roll_id = data.consumed_by_roll_id ?? null;
    this.created_at = new Date(data.created_at);
    this.updated_at = new Date(data.updated_at);
  }
}

// Mirrors the legacy DB CHECK: a card with both `entity` and `grade` must
// carry a `cert_id` (graded slabs are uniquely identified by their cert_id).
// The check now spans the cards/card_stock split, so it's enforced at the
// service layer rather than the DB.
export const requiresCertIdWhenGraded = <
  T extends { entity?: string | null; grade?: number | null; cert_id?: string | null },
>(
  d: T,
) => !(d.entity != null && d.grade != null) || (d.cert_id != null && d.cert_id !== "");

// Bulk upload to a specific machine. Each entry carries enough card-level
// fields to upsert into `cards` (deduped by pricecharting_id) plus the
// instance-level fields for the new card_stock row. machine_id comes from
// the URL, not the entry.
export const StockUploadEntrySchema = z
  .object({
    // ── Card-level (resolved to a cards row by upsert-by-pricecharting_id) ──
    name: z.string().trim().min(1),
    value_usd: z.coerce.number().nonnegative().default(0),
    image_url: z.string().url().nullable().optional(),
    entity: z.string().nullable().optional(),
    grade: z.coerce.number().nullable().optional(),
    type: z.enum(["card", "item"]).default("card"),
    pricecharting_id: z.string().trim().nullable().optional(),
    tcgplayer_id: z.string().trim().nullable().optional(),
    // ── Instance-level (one card_stock row) ─────────────────────────────────
    cert_id: z.string().trim().min(1).nullable().optional(),
    release_pnl_threshold_usd: z.coerce.number().nonnegative().nullable().optional(),
  })
  .refine(requiresCertIdWhenGraded, {
    message: "cert_id is required when both entity and grade are set",
    path: ["cert_id"],
  });

export const StockUploadSchema = z.object({
  entries: z.array(StockUploadEntrySchema).min(1),
});

export type StockUploadEntry = z.infer<typeof StockUploadEntrySchema>;

// Update payload for a single card_stock row. Only instance-level fields
// — card-level edits go through PUT /cards/:id.
export const CardStockUpdateSchema = z.object({
  cert_id: z.string().trim().min(1).nullable().optional(),
  is_disabled: z.boolean().optional(),
  release_pnl_threshold_usd: z.coerce.number().nonnegative().nullable().optional(),
  machine_id: z.coerce.number().int().positive().optional(),
});
