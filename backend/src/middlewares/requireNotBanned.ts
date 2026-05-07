import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";

export const createRequireNotBanned = (pool: Pool) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    try {
      const { rows } = await pool.query<{ banned: boolean; ban_reason: string | null }>(
        `SELECT banned, ban_reason FROM "user" WHERE id = $1`,
        [userId],
      );

      if (rows[0]?.banned) {
        res.status(403).json({
          success: false,
          error: "ACCOUNT_BANNED",
          message: rows[0].ban_reason || "Your account has been banned",
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Ban check middleware error:", error);
      res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  };
