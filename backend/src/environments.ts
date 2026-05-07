import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalNonEmptyString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalMin32String = z.preprocess(
  emptyToUndefined,
  z.string().min(32).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["dev", "staging", "production"]).default("dev"),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: optionalNonEmptyString,
  FE_URL: z.string().min(1),

  // Auth (Privy)
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
  // Optional: pin the JWT verification key (PEM SPKI) instead of fetching JWKS.
  // Useful in tests/airgapped envs. If unset, the SDK fetches JWKS on demand.
  PRIVY_JWT_VERIFICATION_KEY: optionalNonEmptyString,

  // Solana (USDC settlement)
  // Treasury keypair pays SOL gas + rent for ATA creation, partially signs txs;
  // the user wallet (Privy server wallet) adds its signature for the SPL transfer.
  // Format: bs58-encoded secret key OR a JSON array string like "[1,2,3,...]".
  SOLANA_RPC_URL: optionalUrl,
  SOLANA_USDC_MINT: optionalMin32String,
  SOLANA_TREASURY_SECRET_KEY: optionalMin32String,
  SOLANA_COMMITMENT: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),

  // Telegram Alert Bot
  TELEGRAM_ALERT_BOT_TOKEN: optionalNonEmptyString,
  TELEGRAM_ALERT_CHAT_ID: optionalNonEmptyString,
  TELEGRAM_ALERTS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((val) => val === "true"),

  // Cloudflare Webhook
  CLOUDFLARE_WEBHOOK_SECRET: optionalNonEmptyString,

  // Workers — single switch now that only the pricing pipeline runs in-process.
  WORKERS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((val) => val === "true"),
  // IANA timezone for cron schedules (e.g. "Asia/Kuala_Lumpur"). Default UTC.
  WORKER_TIMEZONE: z.string().default("UTC"),

  // Supabase Storage
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString,

  // PriceCharting API
  PRICECHARTING_API_KEY: optionalNonEmptyString,

  // Backend URL (used for webhook callbacks etc.)
  BACKEND_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
