import express, { Router, Request, Response } from "express";
import winston from "winston";
import { Pool } from "pg";
import { z } from "zod";
import { randomBytes } from "crypto";
import multer from "multer";
import NodeCache from "node-cache";
import { supabase } from "../lib/supabase";
import { createJWTTokenAuth } from "../middlewares/JWTTokenAuth";
import { requireAdmin } from "../middlewares/requireAdmin";

const BUCKET = "banners";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const ReorderSchema = z.object({
  order: z.array(z.object({ id: z.number().int(), sort_order: z.number().int() })).min(1),
});

const UpdateBannerSchema = z.object({
  redirect_url: z.string().nullable().optional(),
});

// Cache with 1 hour TTL
const bannersCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const BANNERS_CACHE_KEY = "banners_list";

export function createBannersRouter(
  logger: winston.Logger,
  pool: Pool,
): Router {
  const router = express.Router();

  // GET /api/v1/banners - public, list all banner images sorted by sort_order (cached 1h)
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const cached = bannersCache.get(BANNERS_CACHE_KEY);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const { rows } = await pool.query<{
        id: number;
        filename: string;
        sort_order: number;
        redirect_url: string | null;
        created_at: Date;
      }>("SELECT id, filename, sort_order, redirect_url, created_at FROM banners ORDER BY sort_order ASC, id ASC");

      const banners = rows.map((row) => {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(row.filename);
        return {
          id: row.id,
          filename: row.filename,
          url: data.publicUrl,
          sort_order: row.sort_order,
          redirect_url: row.redirect_url,
          created_at: row.created_at,
        };
      });

      bannersCache.set(BANNERS_CACHE_KEY, banners);
      res.json({ success: true, data: banners });
    } catch (error) {
      logger.error(error);
      res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
    }
  });

  // POST /api/v1/banners - admin only, upload a banner image
  // Accepts multipart/form-data: image (file), redirect_url (optional text field)
  router.post(
    "/",
    createJWTTokenAuth(pool),
    requireAdmin,
    upload.single("image"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, error: "INVALID_UPLOAD" });
        }

        const redirect_url = req.body.redirect_url || null;

        const ext = req.file.originalname.split(".").pop();
        const filename = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(filename, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          logger.error(uploadError);
          return res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
        }

        const { rows } = await pool.query<{ id: number; sort_order: number }>(
          `INSERT INTO banners (filename, sort_order, redirect_url)
           VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM banners), 0), $2)
           RETURNING id, sort_order`,
          [filename, redirect_url],
        );

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
        bannersCache.del(BANNERS_CACHE_KEY);

        res.status(201).json({
          success: true,
          data: {
            id: rows[0].id,
            filename,
            url: urlData.publicUrl,
            sort_order: rows[0].sort_order,
            redirect_url,
          },
        });
      } catch (error) {
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  // PATCH /api/v1/banners/reorder - admin only, update sort_order for banners
  router.patch(
    "/reorder",
    createJWTTokenAuth(pool),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const { order } = ReorderSchema.parse(req.body);

        await Promise.all(
          order.map(({ id, sort_order }) =>
            pool.query("UPDATE banners SET sort_order = $1 WHERE id = $2", [sort_order, id]),
          ),
        );

        bannersCache.del(BANNERS_CACHE_KEY);
        res.json({ success: true });
      } catch (error) {
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  // PATCH /api/v1/banners/:id - admin only, update banner fields
  router.patch(
    "/:id",
    createJWTTokenAuth(pool),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ success: false, error: "INVALID_UPLOAD" });
        }

        const { redirect_url } = UpdateBannerSchema.parse(req.body);

        const { rows } = await pool.query<{ id: number }>(
          "UPDATE banners SET redirect_url = $1 WHERE id = $2 RETURNING id",
          [redirect_url ?? null, id],
        );

        if (rows.length === 0) {
          return res.status(404).json({ success: false, error: "NOT_FOUND" });
        }

        bannersCache.del(BANNERS_CACHE_KEY);
        res.json({ success: true });
      } catch (error) {
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  // DELETE /api/v1/banners/:id - admin only, remove a banner
  router.delete(
    "/:id",
    createJWTTokenAuth(pool),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ success: false, error: "INVALID_UPLOAD" });
        }

        const { rows } = await pool.query<{ filename: string }>(
          "DELETE FROM banners WHERE id = $1 RETURNING filename",
          [id],
        );

        if (rows.length === 0) {
          return res.status(404).json({ success: false, error: "NOT_FOUND" });
        }

        const { error } = await supabase.storage.from(BUCKET).remove([rows[0].filename]);
        if (error) logger.error(error);

        bannersCache.del(BANNERS_CACHE_KEY);
        res.json({ success: true });
      } catch (error) {
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  return router;
}
