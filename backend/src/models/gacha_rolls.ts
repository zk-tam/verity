import { z } from "zod";

export type RollSource = "paid" | "forced";
export type RollStatus = "unhandled" | "sold_back";

export interface GachaRoll {
  id: number;
  user_id: string;
  machine_id: number;
  card_stock_id: number;
  card_value_usd: number;
  card_image_url: string | null;
  usd_spent: number;
  payment_signature: string | null;
  source: RollSource;
  status: RollStatus;
  status_changed_at: Date | null;
  sold_back_at: Date | null;
  sellback_amount_usd: number | null;
  sellback_payout_signature: string | null;
  created_at: Date;
}

export class GachaRollModel implements GachaRoll {
  id: number;
  user_id: string;
  machine_id: number;
  card_stock_id: number;
  card_value_usd: number;
  card_image_url: string | null;
  usd_spent: number;
  payment_signature: string | null;
  source: RollSource;
  status: RollStatus;
  status_changed_at: Date | null;
  sold_back_at: Date | null;
  sellback_amount_usd: number | null;
  sellback_payout_signature: string | null;
  created_at: Date;

  /**
   * Sellback price the user can claim within the 1h window: card_value_usd
   * (snapshot at pull time) × SELLBACK_PAYOUT_FRACTION. Independent of the
   * current FMV — the rate the user sees in the UI is locked at pull.
   */
  sellback_price_usd: number;

  /**
   * Current FMV of the underlying card (cards.value_usd, refreshed daily by
   * the pricecharting worker). Display-only — it does NOT drive the sellback
   * price. May be null when the model is constructed from contexts that
   * don't join the cards table (e.g. immediately after INSERT…RETURNING *).
   */
  fmv_usd: number | null;

  constructor(data: GachaRoll & { fmv_usd?: number | string | null }) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.machine_id = data.machine_id;
    this.card_stock_id = data.card_stock_id;
    this.card_value_usd = Number(data.card_value_usd);
    this.card_image_url = data.card_image_url;
    this.usd_spent = Number(data.usd_spent);
    this.payment_signature = data.payment_signature;
    this.source = data.source ?? "paid";
    this.status = data.status ?? "unhandled";
    this.status_changed_at = data.status_changed_at
      ? new Date(data.status_changed_at)
      : null;
    this.sold_back_at = data.sold_back_at ? new Date(data.sold_back_at) : null;
    this.sellback_amount_usd =
      data.sellback_amount_usd != null ? Number(data.sellback_amount_usd) : null;
    this.sellback_payout_signature = data.sellback_payout_signature ?? null;
    this.created_at = new Date(data.created_at);
    // Derived: rounded to 2 decimals to match NUMERIC(12,2) on payout.
    this.sellback_price_usd = Math.round(
      this.card_value_usd * SELLBACK_PAYOUT_FRACTION * 100,
    ) / 100;
    this.fmv_usd = data.fmv_usd != null ? Number(data.fmv_usd) : null;
  }

  /**
   * API response shape. card_value_usd is the pull-time snapshot used
   * internally for sellback math + PnL accounting; it's not surfaced to
   * the user — they see sellback_price_usd (the firm payout rate) and
   * fmv_usd (the current value, optics only) instead.
   */
  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      machine_id: this.machine_id,
      card_stock_id: this.card_stock_id,
      card_image_url: this.card_image_url,
      usd_spent: this.usd_spent,
      payment_signature: this.payment_signature,
      source: this.source,
      status: this.status,
      status_changed_at: this.status_changed_at,
      sold_back_at: this.sold_back_at,
      sellback_amount_usd: this.sellback_amount_usd,
      sellback_payout_signature: this.sellback_payout_signature,
      created_at: this.created_at,
      sellback_price_usd: this.sellback_price_usd,
      fmv_usd: this.fmv_usd,
    };
  }
}

export const BulkRollRequestSchema = z.object({
  qty: z.coerce.number().int().min(1).max(100),
});

/** Sellback business rules. Treasury pays user 90% of card_value_usd, only
 *  within the first hour after the roll. */
export const SELLBACK_PAYOUT_FRACTION = 0.9;
export const SELLBACK_WINDOW_MS = 60 * 60 * 1000; // 1 hour
