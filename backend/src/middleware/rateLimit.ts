import { Request, Response, NextFunction } from "express";
import {
  RateLimiterMemory,
  RateLimiterRes,
} from "rate-limiter-flexible";
import { alertRateLimitHit } from "../lib/telegram";

/**
 * Extract the real client IP from request headers.
 *
 * Trust hierarchy:
 * 1. x-client-ip — forwarded by our Next.js serverless layer
 * 2. x-forwarded-for — first entry (set by Vercel/ALB)
 * 3. req.ip — Express parsed IP (respects trust proxy)
 */
export function getClientIp(req: Request): string {
  const xClientIp = req.headers["x-client-ip"];
  const xff = req.headers["x-forwarded-for"];

  if (typeof xClientIp === "string" && xClientIp) {
    return xClientIp.trim();
  }

  if (typeof xff === "string" && xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

// --- Rate limiters (in-memory, resets on pod restart) ---

// Global per-IP: 600 req / 60s
const IP_LIMIT = 600;
const IP_WINDOW = 60;
const ipLimiter = new RateLimiterMemory({
  keyPrefix: "rl_ip",
  points: IP_LIMIT,
  duration: IP_WINDOW,
});

// Per user+IP: 300 req / 60s (authenticated endpoints)
const USER_LIMIT = 300;
const USER_WINDOW = 60;
const userLimiter = new RateLimiterMemory({
  keyPrefix: "rl_user",
  points: USER_LIMIT,
  duration: USER_WINDOW,
});

// Dedupe Telegram alerts: one alert per key per 5 min
const ALERT_DEDUPE_MS = 5 * 60 * 1000;
const lastAlertAt = new Map<string, number>();
function shouldAlert(key: string): boolean {
  const now = Date.now();
  const prev = lastAlertAt.get(key);
  if (prev && now - prev < ALERT_DEDUPE_MS) return false;
  lastAlertAt.set(key, now);
  return true;
}


function sendTooManyRequests(res: Response, rlRes: RateLimiterRes): void {
  const retryAfter = Math.ceil(rlRes.msBeforeNext / 1000);
  res.set("Retry-After", String(retryAfter));
  res.status(429).json({
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    retryAfter,
  });
}

/**
 * Block requests whose Cloudflare threat score exceeds `threshold` (default 30).
 * Works on both authenticated and unauthenticated routes — `x-threat-score` is
 * a plain request header forwarded from CF via our Next.js proxy, so it's
 * available before auth runs. If the header is missing or unparseable, the
 * request passes through (fail-open on missing CF signal).
 */
export function threatScoreGate(opts: { threshold?: number; label?: string } = {}) {
  const threshold = opts.threshold ?? 30;
  const label = opts.label ?? "action";
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.headers["x-threat-score"];
    const score = typeof raw === "string" ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(score) && score > threshold) {
      const clientIp = getClientIp(req);
      const alertKey = `threat:${label}:${clientIp}`;
      if (shouldAlert(alertKey)) {
        void alertRateLimitHit(
          `High CF threat (${label})`,
          threshold,
          0,
          clientIp,
          req.method,
          req.path,
          req.user ? { id: req.user.id } : null,
        );
      }
      res.status(403).json({
        success: false,
        error: "HIGH_THREAT_SCORE",
        message:
          "This request was blocked due to elevated security risk on your network. Please try again from a different connection.",
      });
      return;
    }
    next();
  };
}

/**
 * Global IP-based rate limiting middleware.
 * Applies per-IP limits to all requests.
 * Mount AFTER body parser, BEFORE route handlers.
 */
export function ipRateLimitMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientIp = getClientIp(req);

    try {
      await ipLimiter.consume(clientIp);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        if (shouldAlert(`ip:${clientIp}`)) {
          void alertRateLimitHit(
            "Global IP",
            IP_LIMIT,
            IP_WINDOW,
            clientIp,
            req.method,
            req.path,
            req.user ? { id: req.user.id } : null,
          );
        }
        return sendTooManyRequests(res, err);
      }
    }

    next();
  };
}

/**
 * Per-user rate limiting middleware.
 * Chain AFTER auth middleware so req.user is available.
 * Applies per user+IP limits to all authenticated requests.
 */
export function userRateLimitMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) return next();

    const clientIp = getClientIp(req);
    const key = `${userId}:${clientIp}`;

    try {
      await userLimiter.consume(key);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        if (shouldAlert(`user:${key}`)) {
          void alertRateLimitHit(
            "Per user+IP",
            USER_LIMIT,
            USER_WINDOW,
            clientIp,
            req.method,
            req.path,
            { id: userId },
          );
        }
        return sendTooManyRequests(res, err);
      }
      return next();
    }

    next();
  };
}
