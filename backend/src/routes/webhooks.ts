import express, { Router } from "express";
import winston from "winston";
import { Pool } from "pg";
import type { WorkerUtils } from "graphile-worker";
import { alertCloudflareEvent } from "../lib/telegram";
import { env } from "../environments";

export function createWebhooksRouter(
  logger: winston.Logger,
  _pool: Pool,
  _workerUtils?: WorkerUtils,
): Router {
  const router = express.Router();

  // Cloudflare Notifications webhook — verified via shared secret
  router.post("/cloudflare", express.json(), async (req, res) => {
    try {
      const secret = req.headers["cf-webhook-auth"] as string | undefined;
      if (
        !env.CLOUDFLARE_WEBHOOK_SECRET ||
        secret !== env.CLOUDFLARE_WEBHOOK_SECRET
      ) {
        logger.warn("Cloudflare webhook: invalid secret");
        return res.status(403).json({ error: "Invalid secret" });
      }

      const body = req.body as Record<string, unknown>;
      const alertType = (body.alert_type as string) ?? "Unknown";
      const description = (body.description as string) ?? "";

      // Forward relevant fields — Cloudflare sends varying payloads per alert type
      const { alert_type, description: _, ...rest } = body;
      await alertCloudflareEvent(alertType, description, rest);

      logger.info("Cloudflare webhook processed", { alertType });
      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error("Cloudflare webhook error", { error });
      res.status(500).json({ ok: false });
    }
  });

  // TODO(solana): mount the Solana payment webhook handler here once payments
  // are wired. Until then, return 501 so callers see "not configured" rather
  // than a silent 404.
  router.post("/payment", express.json(), (_req, res) => {
    res.status(501).json({ error: "PAYMENTS_NOT_CONFIGURED" });
  });

  return router;
}
