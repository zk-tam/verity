import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { AppSettingsService } from "../services/app_settings";
import { getCurrentUser } from "../lib/auth";

const CACHE_TTL_MS = 10_000;

let cached: { value: boolean; expiresAt: number } | null = null;

/**
 * Middleware that blocks all requests with 503 when maintenance mode is enabled.
 * The result is cached for 10 seconds to avoid hitting the DB on every request.
 * Admin users are allowed through even during maintenance.
 */
export function maintenanceGate(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!cached || Date.now() >= cached.expiresAt) {
        const service = new AppSettingsService({ pool });
        const value = await service.isMaintenanceMode();
        cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      }

      if (cached.value) {
        // Allow admin users through.
        try {
          const user = await getCurrentUser(req);
          if (user?.role === "admin") {
            return next();
          }
        } catch {
          // No valid session — block as normal
        }

        return res.status(503).json({
          success: false,
          error: "MAINTENANCE_MODE",
          message: "Server is under maintenance",
        });
      }
    } catch {
      // If the check fails, let the request through rather than blocking everything
    }

    next();
  };
}
