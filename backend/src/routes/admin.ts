import express, { Router } from "express";
import winston from "winston";
import { Pool } from "pg";
import { z, ZodError } from "zod";
import { createJWTTokenAuth } from "../middlewares/JWTTokenAuth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { GachaMachineService } from "../services/gacha_machine";
import { CardStockService } from "../services/card_stock";
import { GachaRollService } from "../services/gacha_rolls";
import { UserService } from "../services/users";
import { PnlService } from "../services/pnl";
import {
  MachineCreateSchema,
  MachineUpdateSchema,
} from "../models/gacha_machine";
import { CardStockUpdateSchema, StockUploadSchema } from "../models/card_stock";
import { CardCreateSchema, CardUpdateSchema } from "../models/card";
import { CardService } from "../services/card";
import { refreshPricechartingCsv } from "../tasks/refresh_pricecharting";
import { env } from "../environments";

function handleError(
  logger: winston.Logger,
  res: express.Response,
  error: unknown,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, error: "VALIDATION_ERROR", details: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error("admin error", { message });
  res.status(500).json({ success: false, error: "Internal Server Error" });
}

const machineIdParam = z.coerce.number().int().positive();
const cardStockIdParam = z.coerce.number().int().positive();

const ForcedDropCreateSchema = z.object({
  machine_id: z.coerce.number().int().positive(),
  card_stock_id: z.coerce.number().int().positive(),
});

export function createAdminRouter(logger: winston.Logger, pool: Pool): Router {
  const router = express.Router();
  router.use(createJWTTokenAuth(pool));
  router.use(requireAdmin);

  // ── Machines ───────────────────────────────────────────────────────────
  router.get("/machines", async (_req, res) => {
    try {
      const machines = await new GachaMachineService({ pool }).list();
      const rolls = new GachaRollService({ pool });
      const withEv = await Promise.all(
        machines.map(async (m) => ({ ...m, ev_usd: await rolls.computeEv(m.id) })),
      );
      res.json({ success: true, data: withEv });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  router.post("/machines", async (req, res) => {
    try {
      const payload = MachineCreateSchema.parse(req.body);
      const created = await new GachaMachineService({ pool }).create(payload);
      res.json({ success: true, data: created });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  router.get("/machines/:machineId", async (req, res) => {
    try {
      const machineId = machineIdParam.parse(req.params.machineId);
      const service = new GachaMachineService({ pool });
      const machine = await service.getById(machineId);
      if (!machine) return res.status(404).json({ success: false, error: "Not found" });
      const ev = await new GachaRollService({ pool }).computeEv(machineId);
      const stock = await new CardStockService({ pool }).listByMachine(machineId);
      res.json({ success: true, data: { ...machine, ev_usd: ev, stock } });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  router.put("/machines/:machineId", async (req, res) => {
    try {
      const machineId = machineIdParam.parse(req.params.machineId);
      const payload = MachineUpdateSchema.parse(req.body);
      const updated = await new GachaMachineService({ pool }).update(machineId, payload);
      if (!updated) return res.status(404).json({ success: false, error: "Not found" });
      res.json({ success: true, data: updated });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  // ── Per-machine card stock ─────────────────────────────────────────────
  // List the physical stock on one machine, joined with each card's metadata.
  router.get("/machines/:machineId/stock", async (req, res) => {
    try {
      const machineId = machineIdParam.parse(req.params.machineId);
      const includeDisabled = req.query.include_disabled === "true";
      const includeConsumed = req.query.include_consumed === "true";
      const stock = await new CardStockService({ pool }).listByMachine(machineId, {
        includeDisabled,
        includeConsumed,
      });
      res.json({ success: true, data: stock });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  // Bulk upload to a machine. Each entry carries enough card-level fields
  // to upsert a `cards` row (deduped by pricecharting_id) plus the
  // instance-level fields for the new card_stock row. Single transaction:
  // resolve all card_ids, then bulk-insert card_stock — sub-second for
  // ~2000-entry uploads.
  router.post("/machines/:machineId/stock", async (req, res) => {
    try {
      const machineId = machineIdParam.parse(req.params.machineId);
      const payload = StockUploadSchema.parse(req.body);
      const created = await new CardStockService({ pool }).uploadToMachine(
        machineId,
        payload.entries,
      );
      res.json({ success: true, data: created });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  // ── Card stock (single-row update / delete) ─────────────────────────────
  router.put("/card-stock/:id", async (req, res) => {
    try {
      const id = cardStockIdParam.parse(req.params.id);
      const payload = CardStockUpdateSchema.parse(req.body);
      const updated = await new CardStockService({ pool }).update(id, payload);
      if (!updated) return res.status(404).json({ success: false, error: "Not found" });
      res.json({ success: true, data: updated });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  router.delete("/card-stock/:id", async (req, res) => {
    try {
      const id = cardStockIdParam.parse(req.params.id);
      const ok = await new CardStockService({ pool }).deleteById(id);
      if (!ok) return res.status(404).json({ success: false, error: "Not found or already consumed" });
      res.json({ success: true });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  // ── Cards (global catalog) ──────────────────────────────────────────────
  // The pricecharting worker writes value_usd here; admin can also edit.
  router.get("/cards", async (req, res) => {
    try {
      const limit = z.coerce.number().int().positive().max(500).default(100).parse(req.query.limit);
      const offset = z.coerce.number().int().nonnegative().default(0).parse(req.query.offset);
      const search = z.string().optional().parse(req.query.search);
      const result = await new CardService({ pool }).list({ limit, offset, search });
      res.json({
        success: true,
        data: result.cards,
        pagination: { total: result.total, limit, offset },
      });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  router.post("/cards", async (req, res) => {
    try {
      const payload = CardCreateSchema.parse(req.body);
      const created = await new CardService({ pool }).create({
        name: payload.name,
        value_usd: payload.value_usd,
        image_url: payload.image_url ?? null,
        entity: payload.entity ?? null,
        grade: payload.grade ?? null,
        type: payload.type,
        pricecharting_id: payload.pricecharting_id ?? null,
        tcgplayer_id: payload.tcgplayer_id ?? null,
      });
      res.json({ success: true, data: created });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  router.put("/cards/:id", async (req, res) => {
    try {
      const id = cardStockIdParam.parse(req.params.id);
      const payload = CardUpdateSchema.parse(req.body);
      const updated = await new CardService({ pool }).update(id, payload);
      if (!updated) return res.status(404).json({ success: false, error: "Not found" });
      res.json({ success: true, data: updated });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  // ── Forced drops (admin: "next pull on machine X for user Y is card Z") ─
  router.get("/users/:userId/forced-drops", async (req, res) => {
    try {
      const userId = z.string().min(1).parse(req.params.userId);
      const result = await pool.query(
        `SELECT fd.*, c.name AS card_name, c.value_usd, m.name AS machine_name
           FROM user_forced_drops fd
           JOIN card_stock cs ON cs.id = fd.card_stock_id
           JOIN cards c ON c.id = cs.card_id
           JOIN gacha_machines m ON m.id = fd.machine_id
          WHERE fd.user_id = $1
          ORDER BY fd.created_at DESC`,
        [userId],
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  router.post("/users/:userId/forced-drops", async (req, res) => {
    try {
      const userId = z.string().min(1).parse(req.params.userId);
      const adminId = req.user?.id ?? null;
      const payload = ForcedDropCreateSchema.parse(req.body);
      const result = await pool.query(
        `INSERT INTO user_forced_drops (user_id, machine_id, card_stock_id, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, payload.machine_id, payload.card_stock_id, adminId],
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  router.delete("/forced-drops/:id", async (req, res) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const result = await pool.query(
        `DELETE FROM user_forced_drops WHERE id = $1 AND status <> 'claimed' RETURNING id`,
        [id],
      );
      if (!result.rowCount) {
        return res.status(404).json({ success: false, error: "Not found or already claimed" });
      }
      res.json({ success: true });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  // ── Users ──────────────────────────────────────────────────────────────
  router.get("/users", async (req, res) => {
    try {
      const limit = z.coerce.number().int().positive().max(500).default(100).parse(req.query.limit);
      const offset = z.coerce.number().int().nonnegative().default(0).parse(req.query.offset);
      const search = z.string().optional().parse(req.query.search);
      const role = z.string().optional().parse(req.query.role);
      const result = await new UserService({ pool }).list({ limit, offset, search, role });
      res.json({
        success: true,
        data: result.users,
        pagination: { total: result.total, limit, offset },
      });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  const PatchUserSchema = z.object({
    role: z.string().nullable().optional(),
    banned: z.boolean().optional(),
    ban_reason: z.string().nullable().optional(),
    is_internal_account: z.boolean().optional(),
  });

  router.patch("/users/:userId", async (req, res) => {
    try {
      const userId = z.string().min(1).parse(req.params.userId);
      const payload = PatchUserSchema.parse(req.body);
      const userService = new UserService({ pool });

      if (payload.banned !== undefined) {
        await userService.setBanStatus(userId, payload.banned, payload.ban_reason ?? null);
      }
      if (payload.is_internal_account !== undefined) {
        await userService.setInternalAccountStatus(userId, payload.is_internal_account);
      }
      if (payload.role !== undefined) {
        await pool.query(
          `UPDATE "user" SET role = $2, "updatedAt" = NOW() WHERE id = $1`,
          [userId, payload.role],
        );
      }
      const user = await userService.getById(userId);
      if (!user) return res.status(404).json({ success: false, error: "Not found" });
      res.json({ success: true, data: user });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  // ── PnL ────────────────────────────────────────────────────────────────
  router.get("/pnl", async (req, res) => {
    try {
      const dateFrom = z.string().optional().parse(req.query.date_from);
      const dateTo = z.string().optional().parse(req.query.date_to);
      const platform = await new PnlService({ pool }).getPlatformPnl({ dateFrom, dateTo });
      res.json({ success: true, data: platform });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  router.get("/pnl/machines", async (_req, res) => {
    try {
      const machines = await new PnlService({ pool }).getMachinesPnl();
      res.json({ success: true, data: machines });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  // ── Pricecharting refresh (manual trigger) ─────────────────────────────
  router.post("/pricecharting/refresh", async (_req, res) => {
    try {
      if (!env.PRICECHARTING_API_KEY) {
        return res
          .status(400)
          .json({ success: false, error: "PRICECHARTING_API_KEY not configured" });
      }
      const result = await refreshPricechartingCsv(pool, env.PRICECHARTING_API_KEY, logger);
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(logger, res, err);
    }
  });

  return router;
}
