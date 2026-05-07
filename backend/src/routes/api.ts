import express, { Router } from "express";
import winston from "winston";
import { Pool } from "pg";
import { z, ZodError } from "zod";
import { createJWTTokenAuth } from "../middlewares/JWTTokenAuth";
import { createRequireNotBanned } from "../middlewares/requireNotBanned";
import { userRateLimitMiddleware } from "../middleware/rateLimit";
import { ResponseError } from "./errors";
import { UserService } from "../services/users";
import { GachaRollService } from "../services/gacha_rolls";
import { GachaMachineService } from "../services/gacha_machine";
import { CardStockService } from "../services/card_stock";
import { ReferralService } from "../services/referrals";
import { PointsService } from "../services/points";
import { UpdateProfileSchema } from "../models/users";
import { MachineIdParamSchema } from "../models/gacha_machine";
import { BulkRollRequestSchema } from "../models/gacha_rolls";
import { ReferralCodeSchema } from "../models/referrals";
import { getUsdcBalance } from "../lib/solana";
import { exportPrivateKey } from "../lib/privy";
import { syncPrivyUser, type AuthUser } from "../lib/auth";

function handleError(
  logger: winston.Logger,
  res: express.Response,
  error: unknown,
  req?: express.Request,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, error: "VALIDATION_ERROR", details: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  // Map known domain errors to HTTP statuses.
  switch (message) {
    case ResponseError.MACHINE_NOT_FOUND:
    case ResponseError.WALLET_NOT_FOUND:
      res.status(404).json({ success: false, error: message });
      return;
    case ResponseError.MACHINE_NOT_AVAILABLE:
    case ResponseError.NO_CARDS_AVAILABLE:
    case ResponseError.FORCED_CARD_OUT_OF_STOCK:
      res.status(400).json({ success: false, error: message });
      return;
    case ResponseError.STOCK_CONTENTION:
      res.status(409).json({ success: false, error: message });
      return;
    case ResponseError.INSUFFICIENT_USDC:
      res.status(402).json({ success: false, error: message });
      return;
    case ResponseError.WAITLIST_CONTACT_REQUIRED:
      res.status(400).json({ success: false, error: message });
      return;
    case ResponseError.WAITLIST_ENTRY_EXISTS:
      res.status(409).json({ success: false, error: message });
      return;
    case ResponseError.REFERRAL_WINDOW_EXPIRED:
      res.status(410).json({ success: false, error: message });
      return;
  }
  logger.error("api error", { path: req?.path, message });
  res.status(500).json({ success: false, error: "Internal Server Error" });
}

function serializeAuthUser(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    x_handle: user.x_handle,
    image: user.image,
    role: user.role,
    privy_did: user.privy_did,
    created_at: user.created_at,
    updated_at: user.updated_at,
    solana_address: user.solana_address,
    embedded_address: user.wallet?.address ?? null,
    embedded_wallet_id: user.wallet?.privy_wallet_id ?? null,
    wallet: user.wallet,
  };
}

const JoinWaitlistSchema = z.object({
  email: z
    .string()
    .email()
    .max(320)
    .optional()
    .nullable()
    .transform((value) => value?.trim().toLowerCase() || null),
  xHandle: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .nullable()
    .transform((value) => normalizeXHandle(value)),
});

function normalizeXHandle(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function createApiV1Router(logger: winston.Logger, pool: Pool): Router {
  const router = express.Router();

  router.use(createJWTTokenAuth(pool));
  router.use(createRequireNotBanned(pool));
  router.use(userRateLimitMiddleware());

  // ── Waitlist ───────────────────────────────────────────────────────────
  router.get("/waitlist/me", async (req, res) => {
    try {
      const privyDid = req.user?.privy_did;
      if (!privyDid) throw new Error(ResponseError.INVALID_USER_ID);

      const user = await syncPrivyUser(privyDid);
      const result = await pool.query<{
        id: string;
        email: string | null;
        x_handle: string | null;
        solana_address: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, email, x_handle, solana_address, created_at, updated_at
           FROM waitlist_entries
          WHERE user_id = $1 OR privy_did = $2
          LIMIT 1`,
        [user.id, user.privy_did],
      );

      res.json({ success: true, data: result.rows[0] ?? null });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  router.post("/waitlist", async (req, res) => {
    try {
      const privyDid = req.user?.privy_did;
      if (!privyDid) throw new Error(ResponseError.INVALID_USER_ID);

      const user = await syncPrivyUser(privyDid);
      const payload = JoinWaitlistSchema.parse(req.body ?? {});
      const email = payload.email ?? user.email;
      const xHandle = payload.xHandle ?? normalizeXHandle(user.x_handle);
      const solanaAddress = user.solana_address;

      if (!email && !xHandle && !solanaAddress) {
        throw new Error(ResponseError.WAITLIST_CONTACT_REQUIRED);
      }

      const result = await pool.query<{
        id: string;
        email: string | null;
        x_handle: string | null;
        solana_address: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO waitlist_entries (
            user_id,
            privy_did,
            email,
            x_handle,
            solana_address,
            source,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'privy', NOW(), NOW())
          ON CONFLICT (user_id) DO UPDATE
            SET email = COALESCE(EXCLUDED.email, waitlist_entries.email),
                x_handle = COALESCE(EXCLUDED.x_handle, waitlist_entries.x_handle),
                solana_address = COALESCE(EXCLUDED.solana_address, waitlist_entries.solana_address),
                privy_did = COALESCE(EXCLUDED.privy_did, waitlist_entries.privy_did),
                updated_at = NOW()
          RETURNING id, email, x_handle, solana_address, created_at, updated_at`,
        [user.id, user.privy_did, email, xHandle, solanaAddress],
      );

      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        handleError(logger, res, new Error(ResponseError.WAITLIST_ENTRY_EXISTS), req);
        return;
      }
      handleError(logger, res, error, req);
    }
  });

  // ── Users ──────────────────────────────────────────────────────────────
  router.get("/users/me", async (req, res) => {
    try {
      const privyDid = req.user?.privy_did;
      if (!privyDid) throw new Error(ResponseError.INVALID_USER_ID);
      const user = await syncPrivyUser(privyDid);

      res.json({
        success: true,
        data: serializeAuthUser(user),
      });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  router.post("/users/me", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const payload = UpdateProfileSchema.parse(req.body);
      const userService = new UserService({ pool });
      const user = await userService.updateProfile(userId, payload);
      if (!user) return res.status(404).json({ success: false, error: "User not found" });
      res.json({ success: true, data: user });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  // ── Wallet ─────────────────────────────────────────────────────────────
  router.get("/wallet", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const walletRow = await pool
        .query<{
          address: string;
          chain_type: string;
          privy_wallet_id: string | null;
          wallet_client: string | null;
          wallet_client_type: string | null;
          connector_type: string | null;
        }>(
          `SELECT address, chain_type, privy_wallet_id, wallet_client, wallet_client_type, connector_type
             FROM user_wallets
            WHERE user_id = $1`,
          [userId],
        )
        .then((r) => r.rows[0]);
      if (!walletRow) throw new Error(ResponseError.WALLET_NOT_FOUND);
      const balance = await getUsdcBalance(walletRow.address);
      res.json({
        success: true,
        data: {
          address: walletRow.address,
          chain: walletRow.chain_type,
          privy_wallet_id: walletRow.privy_wallet_id,
          wallet_client: walletRow.wallet_client,
          wallet_client_type: walletRow.wallet_client_type,
          connector_type: walletRow.connector_type,
          usdc_balance: balance,
        },
      });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  /** Sensitive: returns the caller's wallet private key. */
  router.post("/wallet/export", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const walletRow = await pool
        .query<{ privy_wallet_id: string | null; address: string }>(
          `SELECT privy_wallet_id, address FROM user_wallets WHERE user_id = $1`,
          [userId],
        )
        .then((r) => r.rows[0]);
      if (!walletRow?.privy_wallet_id) throw new Error(ResponseError.WALLET_NOT_FOUND);

      logger.info("[wallet/export] exporting", { userId, address: walletRow.address });
      const result = await exportPrivateKey(walletRow.privy_wallet_id);
      res.json({
        success: true,
        data: { address: walletRow.address, private_key: result.private_key },
      });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  // ── Machines + EV ──────────────────────────────────────────────────────
  router.get("/machines", async (req, res) => {
    try {
      const service = new GachaRollService({ pool });
      const machines = await service.listAvailableMachines();
      const withEv = await Promise.all(
        machines.map(async (m) => ({
          ...m,
          ev_usd: await service.computeEv(m.id),
        })),
      );
      res.json({ success: true, data: withEv });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  router.get("/machines/:machineId", async (req, res) => {
    try {
      const machineId = MachineIdParamSchema.parse(req.params.machineId);
      const service = new GachaRollService({ pool });
      const machine = await service.getMachine(machineId);
      if (!machine) throw new Error(ResponseError.MACHINE_NOT_FOUND);
      const ev_usd = await service.computeEv(machineId);
      const stockSvc = new CardStockService({ pool });
      const stock = await stockSvc.listByMachine(machineId);
      res.json({
        success: true,
        data: { ...machine, ev_usd, stock },
      });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  // ── Roll (the gacha pull) ──────────────────────────────────────────────
  router.post("/roll/:machineId", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const machineId = MachineIdParamSchema.parse(req.params.machineId);

      const service = new GachaRollService({ pool });
      const result = await service.roll({ userId, machineId });
      res.json({ success: true, data: result });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  router.post("/roll/:machineId/bulk", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const machineId = MachineIdParamSchema.parse(req.params.machineId);
      const { qty } = BulkRollRequestSchema.parse(req.body);

      const service = new GachaRollService({ pool });
      const result = await service.bulkRoll({ userId, machineId, qty });
      res.json({ success: true, data: result });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  // ── Roll history ───────────────────────────────────────────────────────
  router.get("/rolls", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const limit = z.coerce.number().int().positive().max(200).default(50).parse(req.query.limit);
      const offset = z.coerce.number().int().nonnegative().default(0).parse(req.query.offset);
      const service = new GachaRollService({ pool });
      const result = await service.listUserRolls(userId, limit, offset);
      res.json({
        success: true,
        data: result.rolls,
        pagination: { total: result.total, limit, offset },
      });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  // Sellback: treasury pays user 90% of card_value_usd within 1 hour of pull.
  router.post("/rolls/:rollId/sellback", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const rollId = z.coerce.number().int().positive().parse(req.params.rollId);
      const service = new GachaRollService({ pool });
      const updated = await service.sellback({ userId, rollId });
      res.json({ success: true, data: updated });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  // ── Referrals (link store only) ────────────────────────────────────────
  router.get("/referrals/code", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const service = new ReferralService({ pool });
      const referral = await service.getOrCreate(userId);
      res.json({
        success: true,
        data: { code: referral.referral_code, referred_by: referral.referred_by },
      });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  router.post("/referrals/apply", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const { code } = ReferralCodeSchema.parse(req.body);
      const service = new ReferralService({ pool });
      const referrer = await service.getByCode(code);
      if (!referrer) return res.status(404).json({ success: false, error: "Code not found" });
      if (referrer.user_id === userId) {
        return res.status(400).json({ success: false, error: "Cannot refer yourself" });
      }
      // Ensure the caller has their own referrals row before setting referred_by.
      await service.getOrCreate(userId);
      const updated = await service.setReferredBy(userId, referrer.user_id);
      // getOrCreate guarantees the row exists, so a null result here means the
      // 1-minute apply window (enforced in SQL against "user"."createdAt") has
      // closed.
      if (!updated) throw new Error(ResponseError.REFERRAL_WINDOW_EXPIRED);
      res.json({ success: true, data: updated });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  // ── Points + leaderboard ───────────────────────────────────────────────
  // Top users by total_points, banned + internal accounts excluded. Order
  // is total_points DESC, "createdAt" ASC (older account wins ties).
  router.get("/leaderboard", async (req, res) => {
    try {
      const limit = z.coerce.number().int().positive().max(200).default(50).parse(req.query.limit);
      const offset = z.coerce.number().int().nonnegative().default(0).parse(req.query.offset);
      const service = new PointsService({ pool });
      const result = await service.getLeaderboard({ limit, offset });
      res.json({
        success: true,
        data: result.entries,
        pagination: { total: result.total, limit, offset },
      });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  router.get("/points/me", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error(ResponseError.INVALID_USER_ID);
      const service = new PointsService({ pool });
      const points = await service.getUserPoints(userId);
      res.json({ success: true, data: points });
    } catch (error) {
      handleError(logger, res, error, req);
    }
  });

  // ── Heartbeat (DAU + presence) ─────────────────────────────────────────
  router.post("/heartbeat", (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
    res.json({ success: true });
  });

  return router;
}
