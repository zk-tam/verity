import { env } from "./environments";
import { Pool, types } from "pg";
import bodyParser from "body-parser";

// Return DATE columns as plain "YYYY-MM-DD" strings instead of JS Date objects.
// Prevents timezone shifts (e.g. "2026-03-16" becoming "2026-03-15" when the
// server's local timezone is behind UTC).
types.setTypeParser(1082, (val: string) => val);

import express from "express";
import { createLogger } from "@intuition-bends/common-js";
import cors from "cors";
import { metricsMiddleware } from "./middleware/metrics";
import { ipRateLimitMiddleware } from "./middleware/rateLimit";
import { maintenanceGate } from "./middleware/maintenance";
import { createApiV1Router } from "./routes/api";
import { createAdminRouter } from "./routes/admin";
import { createDefaultRouter } from "./routes/default";
import { createBannersRouter } from "./routes/banners";
import { createPopupMessagesRouter } from "./routes/popup_messages";
import { createWebhooksRouter } from "./routes/webhooks";
import { initTelegramBot, alertServerStarted } from "./lib/telegram";
import { bindAuthPool } from "./lib/auth";
import { refreshPricechartingCsv } from "./tasks/refresh_pricecharting";
import { setupWorker } from "./worker";

const logger = createLogger("verity-backend");

export const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: env.FE_URL.split(",").map((u) => u.trim()), credentials: true }));
app.use(metricsMiddleware);

const main = async () => {
  logger.info(`load config`);

  logger.info(`connect to postgres`);
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err) => {
    logger.error("Unexpected pool error", { error: err.message });
  });

  await pool.query("SELECT 1");
  logger.info("Database pool warmed up");

  bindAuthPool(pool);

  // Seed pricecharting_csv on first boot if empty. Subsequent refreshes are
  // admin-triggered via POST /admin/pricecharting/refresh.
  if (env.PRICECHARTING_API_KEY) {
    const { rows: [{ count }] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pricecharting_csv`,
    );
    if (count === "0") {
      logger.info("[startup] pricecharting_csv empty, populating");
      await refreshPricechartingCsv(pool, env.PRICECHARTING_API_KEY, logger).catch((err) =>
        logger.error("[startup] pricecharting seed failed", { error: err?.message }),
      );
    } else {
      logger.info(`[startup] pricecharting_csv already has ${count} rows`);
    }
  }

  let workerPool: Pool | undefined;
  if (env.WORKERS_ENABLED) {
    const result = await setupWorker(pool, logger);
    workerPool = result.workerPool;
  }

  initTelegramBot();
  await alertServerStarted();

  logger.info(`start server`);

  app.use(bodyParser.json());
  app.use(ipRateLimitMiddleware());

  const maintenance = maintenanceGate(pool);
  app.use("", maintenance, createDefaultRouter(logger, pool));
  app.use("/api/v1/banners", maintenance, createBannersRouter(logger, pool));
  app.use("/api/v1/popup-messages", maintenance, createPopupMessagesRouter(logger, pool));
  app.use("/api/v1", maintenance, createApiV1Router(logger, pool));
  app.use("/webhooks", createWebhooksRouter(logger, pool));
  app.use("/admin", createAdminRouter(logger, pool));

  const server = app.listen(env.PORT, () => {
    logger.info(`server running on port ${env.PORT}`);
  });

  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info("HTTP server closed");
    });
    await workerPool?.end();
    await pool.end();
    process.exit(0);
  };
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
};

main().catch((error) => {
  if (error instanceof Error) {
    logger.error(`Error in main: ${error.message}`);
  } else {
    logger.error(`Error in main: ${error}`);
  }
  if (error instanceof Error && error.stack) logger.error(error.stack);
  process.exit(1);
});
