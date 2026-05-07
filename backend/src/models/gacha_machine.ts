import { z } from "zod";

export interface GachaMachine {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price_usd: number;
  is_available: boolean;
  cached_pnl_usd: number;
  created_at: Date;
  updated_at: Date;
}

export class GachaMachineModel implements GachaMachine {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price_usd: number;
  is_available: boolean;
  cached_pnl_usd: number;
  created_at: Date;
  updated_at: Date;

  constructor(data: GachaMachine) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.image_url = data.image_url;
    this.price_usd = Number(data.price_usd);
    this.is_available = Boolean(data.is_available);
    this.cached_pnl_usd = Number(data.cached_pnl_usd ?? 0);
    this.created_at = new Date(data.created_at);
    this.updated_at = new Date(data.updated_at);
  }
}

export const MachineIdParamSchema = z.coerce.number().int().positive();

export const MachineCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  image_url: z.string().optional(),
  price_usd: z.coerce.number().positive(),
  is_available: z.boolean().default(true),
});

export const MachineUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  image_url: z.string().optional(),
  price_usd: z.coerce.number().positive().optional(),
  is_available: z.boolean().optional(),
});
