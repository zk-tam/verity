import { z } from "zod";

export interface User {
  id: string;
  privy_did: string | null;
  name: string | null;
  email: string | null;
  x_handle: string | null;
  image: string | null;
  role: string | null;
  is_internal_account: boolean;
  banned: boolean;
  ban_reason: string | null;
  email_verified_at: Date | null;
  last_login_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserModel implements User {
  id: string;
  privy_did: string | null;
  name: string | null;
  email: string | null;
  x_handle: string | null;
  image: string | null;
  role: string | null;
  is_internal_account: boolean;
  banned: boolean;
  ban_reason: string | null;
  email_verified_at: Date | null;
  last_login_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Snake-case mirrors for legacy consumers.
  created_at: Date;
  updated_at: Date;

  constructor(payload: User) {
    this.id = payload.id;
    this.privy_did = payload.privy_did ?? null;
    this.name = payload.name;
    this.email = payload.email;
    this.x_handle = payload.x_handle ?? null;
    this.image = payload.image;
    this.role = payload.role ?? null;
    this.is_internal_account = Boolean(payload.is_internal_account);
    this.banned = Boolean(payload.banned);
    this.ban_reason = payload.ban_reason ?? null;
    this.email_verified_at = payload.email_verified_at ? new Date(payload.email_verified_at) : null;
    this.last_login_at = payload.last_login_at ? new Date(payload.last_login_at) : null;
    this.createdAt = new Date(payload.createdAt);
    this.updatedAt = new Date(payload.updatedAt);
    this.created_at = this.createdAt;
    this.updated_at = this.updatedAt;
  }
}

export const UserIdSchema = z.string();

export const UpdateProfileSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[\p{L}\p{N}\s._#-]+$/u, "Name has invalid characters")
    .transform((v) => v.trim())
    .optional(),
  image: z
    .string()
    .url()
    .max(500)
    .nullable()
    .optional(),
});
