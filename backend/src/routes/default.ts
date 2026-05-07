import express, { Router, Request, Response } from "express";
import winston from "winston";
import { Pool } from "pg";
import { getRecentWins } from "../lib/recent-wins-cache";

export function createDefaultRouter(
  _logger: winston.Logger,
  _pool: Pool,
): Router {
  const defaultRouter: Router = express.Router();

  defaultRouter.get("/health-check", (_req: Request, res: Response) => {
    res.json({ message: "API is running" });
  });

  defaultRouter.get("/api/v1/healthcheck", (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: "OK" });
  });

  // Public ticker: rolls where card value > 1.5× pull price, last 10 minutes.
  defaultRouter.get("/api/v1/recent-wins", (_req: Request, res: Response) => {
    res.json({ success: true, data: getRecentWins() });
  });

  return defaultRouter;
}
