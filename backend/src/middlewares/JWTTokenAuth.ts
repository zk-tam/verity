import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { UserService } from "../services/users";
import { getClientIp } from "../middleware/rateLimit";
import { getCurrentUser } from "../lib/auth";

// Factory function that creates the auth middleware. When a pool is provided,
// each authenticated request fire-and-forget records DAU + (user_id, ip,
// device_id) into user_daily_activity / user_device_ip_log.
export const createJWTTokenAuth = (pool?: Pool) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await getCurrentUser(req);

      if (!user) {
        res.status(401).json({ success: false, error: "UNAUTHORIZED" });
        return;
      }

      req.user = {
        id: user.id,
        isAdmin: user.role === "admin",
        role: user.role,
        privy_did: user.privy_did,
        solana_address: user.solana_address ?? undefined,
        wallet: user.wallet ?? undefined,
        email: user.email ?? undefined,
      };

      // For compatibility with legacy code expecting x-user-id
      req.headers["x-user-id"] = user.id;

      if (pool) {
        const userId = user.id;
        const ip = getClientIp(req);
        const deviceId =
          (req.headers["x-device-id"] as string | undefined) ?? null;
        const threatScoreRaw = req.headers["x-threat-score"] as
          | string
          | undefined;
        const parsed = threatScoreRaw ? parseInt(threatScoreRaw, 10) : NaN;
        const threatScore =
          Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
            ? parsed
            : null;
        const userService = new UserService({ pool });
        userService
          .trackDailyActivity(userId)
          .catch((err) =>
            console.error("trackDailyActivity failed", userId, err?.message),
          );
        userService
          .trackDeviceAndIp(userId, ip || null, deviceId, threatScore)
          .catch((err) =>
            console.error("trackDeviceAndIp failed", userId, err?.message),
          );
      }

      next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  };
