import { Request, Response, NextFunction } from "express";

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ success: false, error: "Forbidden: Requires admin role" });
    return;
  }
  next();
};
