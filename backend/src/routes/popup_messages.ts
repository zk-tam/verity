import express, { Router, Request, Response } from "express";
import winston from "winston";
import { Pool, PoolClient } from "pg";
import { z, ZodError } from "zod";
import { createJWTTokenAuth } from "../middlewares/JWTTokenAuth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { withDBTransaction } from "../db/tx";

const CreatePopupMessageSchema = z
  .object({
    title: z.string().max(200).nullable().optional(),
    body: z.string().min(1).max(2000),
    target_all_users: z.boolean().default(false),
    user_ids: z.array(z.string()).max(50000).optional(),
    is_active: z.boolean().default(true),
    starts_at: z.string().datetime().nullable().optional(),
    ends_at: z.string().datetime().nullable().optional(),
  })
  .refine(
    (v) => v.target_all_users || (v.user_ids && v.user_ids.length > 0),
    { message: "user_ids required when target_all_users is false" },
  );

const UpdatePopupMessageSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(2000).optional(),
  target_all_users: z.boolean().optional(),
  user_ids: z.array(z.string()).max(50000).optional(),
  is_active: z.boolean().optional(),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
});

interface PopupMessageRow {
  id: number;
  title: string | null;
  body: string;
  target_all_users: boolean;
  is_active: boolean;
  starts_at: Date | null;
  ends_at: Date | null;
  created_by: string | null;
  created_at: Date;
}

export interface PopupMessageForUser {
  id: number;
  title: string | null;
  body: string;
  created_at: string;
}

// Used by GET /popups (default.ts) to embed messages in the popup payload.
// Returns active messages targeted at this user that they haven't dismissed,
// honouring the optional starts_at/ends_at window.
export async function getActivePopupMessagesForUser(
  pool: Pool,
  userId: string,
): Promise<PopupMessageForUser[]> {
  const { rows } = await pool.query<{
    id: number;
    title: string | null;
    body: string;
    created_at: Date;
  }>(
    `SELECT pm.id, pm.title, pm.body, pm.created_at
     FROM popup_messages pm
     WHERE pm.is_active = TRUE
       AND (pm.starts_at IS NULL OR pm.starts_at <= NOW())
       AND (pm.ends_at   IS NULL OR pm.ends_at   >  NOW())
       AND (
         pm.target_all_users = TRUE
         OR EXISTS (
           SELECT 1 FROM popup_message_targets t
           WHERE t.popup_message_id = pm.id AND t.user_id = $1
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM popup_message_dismissals d
         WHERE d.popup_message_id = pm.id AND d.user_id = $1
       )
     ORDER BY pm.created_at DESC, pm.id DESC`,
    [userId],
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    created_at: r.created_at.toISOString(),
  }));
}

export function createPopupMessagesRouter(
  logger: winston.Logger,
  pool: Pool,
): Router {
  const router = express.Router();
  const tx = withDBTransaction(pool);

  // Dedupe caller-supplied user_ids and split into existing vs unknown so
  // the admin sees typos in a bulk paste instead of silently dropping them.
  const resolveAudience = async (
    client: PoolClient | Pool,
    userIds: string[] | undefined,
  ): Promise<{ ids: string[]; unknown_user_ids: string[] }> => {
    const idsIn = Array.from(new Set((userIds ?? []).filter(Boolean)));
    if (idsIn.length === 0) return { ids: [], unknown_user_ids: [] };

    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM "user" WHERE id = ANY($1::text[])`,
      [idsIn],
    );
    const found = new Set(rows.map((r) => r.id));
    const ids: string[] = [];
    const unknown_user_ids: string[] = [];
    idsIn.forEach((id) => (found.has(id) ? ids.push(id) : unknown_user_ids.push(id)));
    return { ids, unknown_user_ids };
  };

  // POST /api/v1/popup-messages — staff only, create a message.
  // Body: { title?, body, target_all_users, user_ids?, is_active?, starts_at?, ends_at? }
  // user_ids accepts a bulk list; unknown IDs come back in the response so
  // the admin can fix typos.
  router.post(
    "/",
    createJWTTokenAuth(pool),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = CreatePopupMessageSchema.parse(req.body);
        const createdBy = req.user?.id ?? null;

        const audience = parsed.target_all_users
          ? { ids: [], unknown_user_ids: [] }
          : await resolveAudience(pool, parsed.user_ids);

        if (!parsed.target_all_users && audience.ids.length === 0) {
          return res.status(400).json({
            success: false,
            error: "NO_VALID_TARGETS",
            details: { unknown_user_ids: audience.unknown_user_ids },
          });
        }

        const result = await tx(async (client: PoolClient) => {
          const { rows } = await client.query<PopupMessageRow>(
            `INSERT INTO popup_messages
               (title, body, target_all_users, is_active, starts_at, ends_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, title, body, target_all_users, is_active,
                       starts_at, ends_at, created_by, created_at`,
            [
              parsed.title ?? null,
              parsed.body,
              parsed.target_all_users,
              parsed.is_active,
              parsed.starts_at ?? null,
              parsed.ends_at ?? null,
              createdBy,
            ],
          );
          const msg = rows[0];

          if (!parsed.target_all_users && audience.ids.length > 0) {
            await client.query(
              `INSERT INTO popup_message_targets (popup_message_id, user_id)
               SELECT $1, UNNEST($2::text[])
               ON CONFLICT DO NOTHING`,
              [msg.id, audience.ids],
            );
          }

          return msg;
        });

        res.status(201).json({
          success: true,
          data: {
            ...serializePopupMessage(result, audience.ids),
            matched_count: audience.ids.length,
            unknown_user_ids: audience.unknown_user_ids,
          },
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            success: false,
            error: "INVALID_INPUT",
            details: error.issues,
          });
        }
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  // GET /api/v1/popup-messages — staff only, paginated list with target counts.
  router.get(
    "/",
    createJWTTokenAuth(pool),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const limit = z.coerce
          .number()
          .int()
          .positive()
          .default(100)
          .parse(req.query.limit);
        const offset = z.coerce
          .number()
          .int()
          .nonnegative()
          .default(0)
          .parse(req.query.offset);

        const [listResult, countResult] = await Promise.all([
          pool.query<
            PopupMessageRow & {
              target_count: string;
              dismissal_count: string;
            }
          >(
            `SELECT pm.id, pm.title, pm.body, pm.target_all_users, pm.is_active,
                    pm.starts_at, pm.ends_at, pm.created_by, pm.created_at,
                    COALESCE((SELECT COUNT(*)::text FROM popup_message_targets t WHERE t.popup_message_id = pm.id), '0') AS target_count,
                    COALESCE((SELECT COUNT(*)::text FROM popup_message_dismissals d WHERE d.popup_message_id = pm.id), '0') AS dismissal_count
             FROM popup_messages pm
             ORDER BY pm.created_at DESC, pm.id DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset],
          ),
          pool.query<{ total: string }>(
            `SELECT COUNT(*)::text AS total FROM popup_messages`,
          ),
        ]);

        res.json({
          success: true,
          data: listResult.rows.map((r) => ({
            ...serializePopupMessage(r, null),
            target_count: parseInt(r.target_count, 10),
            dismissal_count: parseInt(r.dismissal_count, 10),
          })),
          pagination: {
            total: parseInt(countResult.rows[0].total, 10),
            limit,
            offset,
          },
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            success: false,
            error: "INVALID_INPUT",
            details: error.issues,
          });
        }
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  // GET /api/v1/popup-messages/:id — staff only, fetch a single message + targets.
  router.get(
    "/:id",
    createJWTTokenAuth(pool),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ success: false, error: "INVALID_ID" });
        }

        const { rows } = await pool.query<PopupMessageRow>(
          `SELECT id, title, body, target_all_users, is_active,
                  starts_at, ends_at, created_by, created_at
           FROM popup_messages WHERE id = $1`,
          [id],
        );
        if (rows.length === 0) {
          return res.status(404).json({ success: false, error: "NOT_FOUND" });
        }

        const { rows: targets } = await pool.query<{ user_id: string }>(
          `SELECT user_id FROM popup_message_targets WHERE popup_message_id = $1`,
          [id],
        );

        res.json({
          success: true,
          data: serializePopupMessage(
            rows[0],
            targets.map((t) => t.user_id),
          ),
        });
      } catch (error) {
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  // PATCH /api/v1/popup-messages/:id — staff only, update message fields.
  // Passing user_ids replaces the existing target list with the resolved IDs.
  router.patch(
    "/:id",
    createJWTTokenAuth(pool),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ success: false, error: "INVALID_ID" });
        }

        const parsed = UpdatePopupMessageSchema.parse(req.body);
        const replacingAudience = parsed.user_ids !== undefined;
        const audience = replacingAudience
          ? await resolveAudience(pool, parsed.user_ids)
          : { ids: [], unknown_user_ids: [] };

        const updated = await tx(async (client: PoolClient) => {
          const { rows } = await client.query<PopupMessageRow>(
            `UPDATE popup_messages SET
               title            = CASE WHEN $2::boolean THEN $3       ELSE title            END,
               body             = COALESCE($4, body),
               target_all_users = COALESCE($5, target_all_users),
               is_active        = COALESCE($6, is_active),
               starts_at        = CASE WHEN $7::boolean THEN $8       ELSE starts_at        END,
               ends_at          = CASE WHEN $9::boolean THEN $10      ELSE ends_at          END
             WHERE id = $1
             RETURNING id, title, body, target_all_users, is_active,
                       starts_at, ends_at, created_by, created_at`,
            [
              id,
              parsed.title !== undefined,
              parsed.title ?? null,
              parsed.body ?? null,
              parsed.target_all_users ?? null,
              parsed.is_active ?? null,
              parsed.starts_at !== undefined,
              parsed.starts_at ?? null,
              parsed.ends_at !== undefined,
              parsed.ends_at ?? null,
            ],
          );
          if (rows.length === 0) return null;

          if (replacingAudience) {
            await client.query(
              `DELETE FROM popup_message_targets WHERE popup_message_id = $1`,
              [id],
            );
            if (audience.ids.length > 0) {
              await client.query(
                `INSERT INTO popup_message_targets (popup_message_id, user_id)
                 SELECT $1, UNNEST($2::text[])
                 ON CONFLICT DO NOTHING`,
                [id, audience.ids],
              );
            }
          }

          return rows[0];
        });

        if (!updated) {
          return res.status(404).json({ success: false, error: "NOT_FOUND" });
        }

        res.json({
          success: true,
          data: {
            ...serializePopupMessage(updated, replacingAudience ? audience.ids : null),
            ...(replacingAudience && {
              matched_count: audience.ids.length,
              unknown_user_ids: audience.unknown_user_ids,
            }),
          },
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            success: false,
            error: "INVALID_INPUT",
            details: error.issues,
          });
        }
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  // DELETE /api/v1/popup-messages/:id — staff only.
  router.delete(
    "/:id",
    createJWTTokenAuth(pool),
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ success: false, error: "INVALID_ID" });
        }

        const { rowCount } = await pool.query(
          "DELETE FROM popup_messages WHERE id = $1",
          [id],
        );
        if (rowCount === 0) {
          return res.status(404).json({ success: false, error: "NOT_FOUND" });
        }

        res.json({ success: true });
      } catch (error) {
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  // POST /api/v1/popup-messages/:id/dismiss — authenticated user marks
  // a message as seen so it stops appearing in GET /popups.
  router.post(
    "/:id/dismiss",
    createJWTTokenAuth(pool),
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          return res.status(400).json({ success: false, error: "INVALID_ID" });
        }

        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        await pool.query(
          `INSERT INTO popup_message_dismissals (popup_message_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [id, userId],
        );

        res.json({ success: true });
      } catch (error) {
        logger.error(error);
        res.status(500).json({ success: false, error: "UNKNOWN_ERROR" });
      }
    },
  );

  return router;
}

function serializePopupMessage(row: PopupMessageRow, userIds: string[] | null) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    target_all_users: row.target_all_users,
    is_active: row.is_active,
    starts_at: row.starts_at ? row.starts_at.toISOString() : null,
    ends_at: row.ends_at ? row.ends_at.toISOString() : null,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    user_ids: userIds,
  };
}
