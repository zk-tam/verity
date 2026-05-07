import { Request } from 'express';
import promBundle from 'express-prom-bundle';
import { APP_PREFIX } from '../metrics/metrics';

const PATH_PATTERNS = [
  {
    // /wallets/0x0000000000000000000000000000000000000000 -> /wallets/:address
    pattern: /^\/wallets\/[0-9a-zA-Z]{40}$/,
    replacement: '/wallets/:address'
  },
  {
    // /swaps/0x0... -> /swaps/:txHash
    pattern: /^\/swaps\/[0-9a-zA-Z]+$/,
    replacement: '/swaps/:txHash'
  },
  {
    pattern: /^\/token\/[0-9a-zA-Z]{40}$/,
    replacement: '/token/:tokenAddress'
  },
  {
    // /token/LAMBO -> /token/:tokenId
    pattern: /^\/token\/[0-9a-zA-Z]+$/,
    replacement: '/token/:tokenId'
  },
  {
    // /tokens/0x0.../holders -> /tokens/:tokenAddress/holders
    pattern: /^\/tokens\/[0-9a-zA-Z]{40}\/holders$/,
    replacement: '/tokens/:tokenAddress/holders'
  },
  {
    // /devices/abcde123-4567-89ab-cdef-0123456789ab -> /devices/:id
    pattern: /^\/devices\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    replacement: '/devices/:id'
  },
  {
    // /auth/pairing/pairingSessions/abcde123-4567-89ab-cdef-0123456789ab -> /auth/pairing/pairingSessions/:sessionId
    pattern: /^\/auth\/pairing\/pairingSessions\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    replacement: '/auth/pairing/pairingSessions/:sessionId'
  }
];

export const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: {
    app: `${process.env.NODE_ENV}-arena-fun-backend`,
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
  excludeRoutes: ['/health-check', '/metrics'],
});
