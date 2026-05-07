import { Request } from "express";
import promBundle from "express-prom-bundle";
import { APP_PREFIX } from "../metrics/metrics";
import { env } from "../environments";

const PATH_PATTERNS: { pattern: RegExp; replacement: string }[] = [];

export const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: {
    app: `${env.NODE_ENV}-tcg-backend`,
  },
  promClient: {
    collectDefaultMetrics: {
      prefix: APP_PREFIX,
    },
  },
  normalizePath: (req: Request) => {
    const path = req.path;
    for (const { pattern, replacement } of PATH_PATTERNS) {
      if (pattern.test(path)) return replacement;
    }
    return path;
  },
  excludeRoutes: ["/health-check", "/metrics"],
});
