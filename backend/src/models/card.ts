import { z } from "zod";

export type CardType = "card" | "item";

// Global catalog row. cards.id IS the verity_id — we expose it as such in
// API responses. value_usd is the FMV the pricecharting worker keeps fresh.
export interface Card {
  id: number;
  name: string;
  value_usd: number;
  image_url: string | null;
  entity: string | null;
  grade: number | null;
  type: CardType;
  pricecharting_id: string | null;
  tcgplayer_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class CardModel implements Card {
  id: number;
  name: string;
  value_usd: number;
  image_url: string | null;
  entity: string | null;
  grade: number | null;
  type: CardType;
  pricecharting_id: string | null;
  tcgplayer_id: string | null;
  created_at: Date;
  updated_at: Date;

  constructor(data: Card) {
    this.id = data.id;
    this.name = data.name;
    this.value_usd = Number(data.value_usd);
    this.image_url = data.image_url;
    this.entity = data.entity;
    this.grade = data.grade != null ? Number(data.grade) : null;
    this.type = data.type ?? "card";
    this.pricecharting_id = data.pricecharting_id ?? null;
    this.tcgplayer_id = data.tcgplayer_id ?? null;
    this.created_at = new Date(data.created_at);
    this.updated_at = new Date(data.updated_at);
  }

  /** API alias — admin/UI display uses verity_id as the card-type identifier. */
  get verity_id(): number {
    return this.id;
  }
}

export const CardCreateSchema = z.object({
  name: z.string().trim().min(1),
  value_usd: z.coerce.number().nonnegative().default(0),
  image_url: z.string().url().nullable().optional(),
  entity: z.string().nullable().optional(),
  grade: z.coerce.number().nullable().optional(),
  type: z.enum(["card", "item"]).default("card"),
  pricecharting_id: z.string().trim().nullable().optional(),
  tcgplayer_id: z.string().trim().nullable().optional(),
});

export const CardUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  value_usd: z.coerce.number().nonnegative().optional(),
  image_url: z.string().nullable().optional(),
  entity: z.string().nullable().optional(),
  grade: z.coerce.number().nullable().optional(),
  type: z.enum(["card", "item"]).optional(),
  pricecharting_id: z.string().trim().nullable().optional(),
  tcgplayer_id: z.string().trim().nullable().optional(),
});
