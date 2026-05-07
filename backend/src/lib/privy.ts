import { PrivyClient, verifyAccessToken } from "@privy-io/node";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { env } from "../environments";

const PRIVY_API_URL = "https://api.privy.io";

export const privy = new PrivyClient({
  appId: env.PRIVY_APP_ID,
  appSecret: env.PRIVY_APP_SECRET,
  jwtVerificationKey: env.PRIVY_JWT_VERIFICATION_KEY,
});

// Token-verification key. Static PEM if pinned in env (test/airgapped), else a
// JWKS fetched on demand — jose caches keys with a TTL so this is cheap reuse.
const verificationKey: string | JWTVerifyGetKey = env.PRIVY_JWT_VERIFICATION_KEY
  ? env.PRIVY_JWT_VERIFICATION_KEY
  : createRemoteJWKSet(new URL(`${PRIVY_API_URL}/v1/apps/${env.PRIVY_APP_ID}/jwks.json`));

/**
 * Verifies a Privy access token. Returns the payload (including `user_id` =
 * the Privy DID) on success; throws on invalid/expired tokens.
 */
export async function verifyPrivyAccessToken(accessToken: string) {
  return verifyAccessToken({
    access_token: accessToken,
    app_id: env.PRIVY_APP_ID,
    verification_key: verificationKey,
  });
}

/** Fetches the canonical Privy user so we can mirror linked accounts locally. */
export async function getPrivyUser(userId: string) {
  return (privy.users() as any)._get(userId);
}

/** Creates a Solana server wallet owned by the app. */
export async function createSolanaWallet(opts?: { externalId?: string }) {
  const wallet = await privy.wallets().create({
    chain_type: "solana",
    ...(opts?.externalId ? { external_id: opts.externalId } : {}),
  });
  return { id: wallet.id, address: wallet.address };
}

/**
 * Exports a server wallet's private key. Only callable from the backend; users
 * cannot invoke this directly. Use behind an authenticated, audited route.
 */
export async function exportPrivateKey(walletId: string) {
  return privy.wallets().exportPrivateKey(walletId, {});
}
