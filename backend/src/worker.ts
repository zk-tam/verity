import { Pool } from "pg";
import { Logger, makeWorkerUtils, run, WorkerUtils } from "graphile-worker";
import winston from "winston";
import { env } from "./environments";
import { refreshPricechartingCsv } from "./tasks/refresh_pricecharting";

export const REFRESH_PRICECHARTING = "refresh_pricecharting";

export interface WorkerSetupResult {
  workerUtils: WorkerUtils;
  workerPool: Pool;
}

/**
 * Spins up the graphile-worker runtime with the cron schedule below.
 *
 * Schedule: refresh_pricecharting fires daily at 00:00 in WORKER_TIMEZONE
 * (default UTC). Crontab options follow graphile-worker's syntax — see
 * https://worker.graphile.org/docs/cron for the spec.
 */
export async function setupWorker(
  pool: Pool,
  logger: winston.Logger,
): Promise<WorkerSetupResult> {
  // Dedicated pool: graphile-worker uses prepared statements + LISTEN/NOTIFY
  // and shouldn't share a pgbouncer transaction-mode pooler with the API.
  const workerPool = new Pool({
    connectionString: env.DATABASE_DIRECT_URL || env.DATABASE_URL,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 3,
  });

  const workerUtils = await makeWorkerUtils({ pgPool: workerPool });
  await workerUtils.migrate();

  if (!env.PRICECHARTING_API_KEY) {
    logger.warn(
      "[worker] PRICECHARTING_API_KEY is unset; refresh_pricecharting cron will fail at run time",
    );
  }

  const taskList = {
    [REFRESH_PRICECHARTING]: async () => {
      if (!env.PRICECHARTING_API_KEY) {
        throw new Error("PRICECHARTING_API_KEY is required for refresh_pricecharting");
      }
      await refreshPricechartingCsv(pool, env.PRICECHARTING_API_KEY, logger);
    },
  };

  // Cron: minute hour dom month dow task ?opts
  // 0 0 * * *  →  midnight, every day. tz comes from WORKER_TIMEZONE.
  const crontab = `0 0 * * * ${REFRESH_PRICECHARTING} ?tz=${env.WORKER_TIMEZONE}`;

  const runner = await run({
    pgPool: workerPool,
    concurrency: 2,
    taskList,
    crontab,
    logger: new Logger((scope) => (level, message, meta) => {
      if (level === "info" && /^(Completed task |Found task )/.test(message)) return;
      const lvl =
        level === "warning" ? "warn" : level === "error" ? "error" : "info";
      logger[lvl](`[${meta?.workerId || "worker"}] ${message}`, meta);
    }),
  });

  runner.events.on("job:failed", ({ worker, job }) =>
    logger.error(
      `[${worker.workerId}] failed ${job.task_identifier} job #${job.id}`,
      { payload: job.payload },
    ),
  );

  logger.info(
    `[worker] started — cron: "${crontab}" (timezone: ${env.WORKER_TIMEZONE})`,
  );

  return { workerUtils, workerPool };
}
