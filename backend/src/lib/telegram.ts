import { createLogger, TelegramBot } from "@intuition-bends/common-js";
import { env } from "../environments";

const logger = createLogger("telegram-alerts");

const TELEGRAM_ALERT_BOT_TOKEN = process.env.TELEGRAM_ALERT_BOT_TOKEN || "";
const TELEGRAM_ALERT_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID || "";

let bot: TelegramBot | null = null;

export function initTelegramBot() {
  if (!env.TELEGRAM_ALERTS_ENABLED) {
    logger.info("Telegram alerts disabled via TELEGRAM_ALERTS_ENABLED");
    return;
  }
  if (!TELEGRAM_ALERT_BOT_TOKEN || !TELEGRAM_ALERT_CHAT_ID) {
    logger.warn("Telegram alert bot not configured — skipping");
    return;
  }
  bot = new TelegramBot(logger, TELEGRAM_ALERT_BOT_TOKEN);
  logger.info("Telegram alert bot initialized");
}

async function send(message: string) {
  if (!bot || !TELEGRAM_ALERT_CHAT_ID) return;
  try {
    await bot.sendMessage(TELEGRAM_ALERT_CHAT_ID, message);
  } catch (err) {
    logger.error("Failed to send Telegram alert", { error: err });
  }
}

// ── Alert functions ──────────────────────────────────────────────────

export async function alertServerStarted() {
  await send(
    `✅ Verity Backend started\n\nEnv: ${env.NODE_ENV}\nTime: ${new Date().toISOString()}`,
  );
}

export async function alertInternalServerError(
  method: string,
  path: string,
  error: unknown,
) {
  const errMsg = error instanceof Error ? error.message : String(error);
  await send(
    `🚨 500 Internal Server Error\n\n` +
      `Endpoint: ${method} ${path}\n` +
      `Error: ${errMsg.slice(0, 500)}\n` +
      `Env: ${env.NODE_ENV}`,
  );
}

export async function alertHighValueWin(
  userId: string,
  userName: string | null,
  userEmail: string | null,
  userLevel: number,
  cardName: string,
  cardCategory: string,
  cardValueRm: number,
  machineName: string,
) {
  await send(
    `🎰 High Value Win (RM ${cardValueRm.toFixed(2)})\n\n` +
      `User: ${userName ?? "Unknown"} (${userId})\n` +
      `Email: ${userEmail ?? "Unknown"}\n` +
      `Level: ${userLevel}\n` +
      `Card: ${cardName} [${cardCategory}]\n` +
      `Machine: ${machineName}`,
  );
}

export async function alertLargeTopup(
  userId: string,
  userName: string | null,
  userEmail: string | null,
  amountRm: number,
  creditAmount: number,
  bonusAmount: number,
) {
  const bonusLine = bonusAmount > 0 ? ` (+${bonusAmount} bonus)` : "";
  await send(
    `💵 Large Topup (RM ${amountRm.toFixed(2)})\n\n` +
      `User: ${userName ?? "Unknown"} (${userId})\n` +
      `Email: ${userEmail ?? "Unknown"}\n` +
      `Credits: ${creditAmount}${bonusLine}`,
  );
}

export async function alertWatchedUserTopup(
  userId: string,
  userName: string | null,
  userEmail: string | null,
  amountRm: number,
  creditAmount: number,
  bonusAmount: number,
) {
  const bonusLine = bonusAmount > 0 ? ` (+${bonusAmount} bonus)` : "";
  await send(
    `👀 Watched User Topup (RM ${amountRm.toFixed(2)})\n\n` +
      `User: ${userName ?? "Unknown"} (${userId})\n` +
      `Email: ${userEmail ?? "Unknown"}\n` +
      `Credits: ${creditAmount}${bonusLine}`,
  );
}

export async function alertPriceMovements(
  changes: {
    name: string;
    entity: string | null;
    grade: number | null;
    oldPriceRm: number;
    newPriceRm: number;
    changePercent: number;
  }[],
) {
  if (!changes.length) return;

  const TOP_N = 10;
  const sorted = [...changes].sort((a, b) => b.newPriceRm - a.newPriceRm);
  const lines = sorted.slice(0, TOP_N).map((c) => {
    const arrow = c.changePercent > 0 ? "📈" : "📉";
    const suffix = [c.entity, c.grade !== null ? String(c.grade) : null]
      .filter(Boolean)
      .join(" ");
    const label = suffix ? `${c.name} [${suffix}]` : c.name;
    return `${arrow} ${label}\n   RM${c.oldPriceRm} → RM${c.newPriceRm} (${c.changePercent > 0 ? "+" : ""}${c.changePercent}%)`;
  });

  const header = `💹 Price Movement Alert — ${changes.length} card${changes.length === 1 ? "" : "s"} moved >10%`;
  const truncatedNote =
    changes.length > TOP_N ? `\n\n... and ${changes.length - TOP_N} more` : "";
  await send(`${header}\n\n${lines.join("\n\n")}${truncatedNote}`);
}

export async function alertRateLimitHit(
  limiterName: string,
  limit: number,
  windowSec: number,
  clientIp: string,
  method: string,
  path: string,
  user?: { id: string; email?: string; name?: string | null } | null,
) {
  const userLine = user
    ? `User: ${user.name ?? "Unknown"} (${user.id})${user.email ? ` — ${user.email}` : ""}`
    : `User: anonymous`;
  await send(
    `🛑 Rate Limit Hit — ${limiterName}\n\n` +
      `Limit: ${limit} req / ${windowSec}s\n` +
      `${userLine}\n` +
      `IP: ${clientIp}\n` +
      `Endpoint: ${method} ${path}`,
  );
}

export async function alertCloudflareEvent(
  alertType: string,
  description: string,
  data: Record<string, unknown>,
) {
  const details = Object.entries(data)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  await send(
    `🛡 Cloudflare Alert — ${alertType}\n\n` +
      `${description}\n` +
      (details ? `\n${details}` : "") +
      `\n\nTime: ${new Date().toISOString()}`,
  );
}

export async function alertHighFrequencyMachinePlay(
  userId: string,
  userName: string | null,
  userEmail: string | null,
  machineName: string,
) {
  await send(
    `🎯 High Frequency Machine Play\n\n` +
      `User: ${userName ?? "Unknown"} (${userId})\n` +
      `Email: ${userEmail ?? "Unknown"}\n` +
      `Machine: ${machineName}\n` +
      `Played 15 times in the last 24 hours.`,
  );
}
