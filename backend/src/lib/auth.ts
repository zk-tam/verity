import type { Request, Response, NextFunction } from "express";
import { Pool, PoolClient } from "pg";
import { randomBytes } from "crypto";
import { getPrivyUser, verifyPrivyAccessToken } from "./privy";
import { generateReferralCode } from "./utils";

export type AuthRole = "user" | "admin";

type LinkedAccount = Record<string, unknown>;

interface SyncedAuthAccount {
  provider: string;
  provider_user_id: string;
  email: string | null;
  username: string | null;
  name: string | null;
  image: string | null;
  address: string | null;
  chain_type: string | null;
  wallet_client: string | null;
  wallet_client_type: string | null;
  connector_type: string | null;
}

export interface AuthWallet {
  address: string;
  chain_type: string;
  privy_wallet_id: string | null;
  wallet_client: string | null;
  wallet_client_type: string | null;
  connector_type: string | null;
}

export interface AuthUser {
  id: string;
  privy_did: string;
  role: AuthRole;
  name: string | null;
  email: string | null;
  x_handle: string | null;
  image: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  solana_address: string | null;
  wallet: AuthWallet | null;
}

interface AuthRow {
  id: string;
  role: string | null;
  name: string | null;
  email: string | null;
  x_handle: string | null;
  image: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  address: string | null;
  chain_type: string | null;
  privy_wallet_id: string | null;
  wallet_client: string | null;
  wallet_client_type: string | null;
  connector_type: string | null;
}

let poolRef: Pool | null = null;
export function bindAuthPool(pool: Pool) {
  poolRef = pool;
}

function toAuthRole(raw: string | null): AuthRole {
  return raw === "admin" ? "admin" : "user";
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers["authorization"];
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Resolves the Privy access token on a request to a local Verity user. The
 * middleware path stays cheap for existing users; first-seen users are synced
 * from Privy so we always have an app-owned user row.
 */
export async function getCurrentUser(req: Request): Promise<AuthUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  let payload;
  try {
    payload = await verifyPrivyAccessToken(token);
  } catch {
    return null;
  }

  const did = payload.user_id;
  if (!poolRef) throw new Error("auth pool not bound; call bindAuthPool() at startup");

  const existing = await selectAuthUser(poolRef, did);
  if (existing) return existing;

  return syncPrivyUser(did);
}

export async function syncPrivyUser(did: string): Promise<AuthUser> {
  if (!poolRef) throw new Error("auth pool not bound");

  const privyUser = await getPrivyUser(did);
  const profile = extractPrivyProfile(did, privyUser);
  const client = await poolRef.connect();

  try {
    await client.query("BEGIN");

    const userRow = await upsertUserFromProfile(client, profile);
    await syncLinkedAccounts(client, userRow.id, profile.accounts);
    await syncPrimaryWallet(client, userRow.id, profile.wallet);
    if (userRow.created) {
      await assignReferralCode(client, userRow.id);
    }

    await client.query("COMMIT");

    const synced = await selectAuthUser(poolRef, did);
    if (!synced) throw new Error("AUTH_SYNC_FAILED");
    return synced;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function selectAuthUser(pool: Pool, did: string): Promise<AuthUser | null> {
  const result = await pool.query<AuthRow>(
    `SELECT
        u.id,
        u.role,
        u.name,
        u.email,
        u.x_handle,
        u.image,
        u."createdAt" AS created_at,
        u."updatedAt" AS updated_at,
        w.address,
        w.chain_type,
        w.privy_wallet_id,
        w.wallet_client,
        w.wallet_client_type,
        w.connector_type
       FROM "user" u
       LEFT JOIN user_wallets w ON w.user_id = u.id
      WHERE u.privy_did = $1`,
    [did],
  );

  return result.rows.length ? authUserFromRow(did, result.rows[0]) : null;
}

function authUserFromRow(did: string, row: AuthRow): AuthUser {
  const wallet =
    row.address && row.chain_type
      ? {
          address: row.address,
          chain_type: row.chain_type,
          privy_wallet_id: row.privy_wallet_id,
          wallet_client: row.wallet_client,
          wallet_client_type: row.wallet_client_type,
          connector_type: row.connector_type,
        }
      : null;

  return {
    id: row.id,
    privy_did: did,
    role: toAuthRole(row.role),
    name: row.name,
    email: row.email,
    x_handle: row.x_handle,
    image: row.image,
    created_at: row.created_at,
    updated_at: row.updated_at,
    solana_address: wallet?.address ?? null,
    wallet,
  };
}

async function upsertUserFromProfile(
  client: PoolClient,
  profile: ReturnType<typeof extractPrivyProfile>,
): Promise<{ id: string; role: string | null; created: boolean }> {
  const existing = await client.query<{ id: string }>(
    `SELECT id
       FROM "user"
      WHERE privy_did = $1
         OR ($2::text IS NOT NULL AND email = $2 AND (privy_did IS NULL OR privy_did = $1))
      ORDER BY CASE WHEN privy_did = $1 THEN 0 ELSE 1 END
      LIMIT 1`,
    [profile.did, profile.email],
  );

  if (existing.rows[0]) {
    const result = await client.query<{ id: string; role: string | null }>(
      `UPDATE "user"
          SET privy_did = COALESCE("user".privy_did, $2),
              name = COALESCE($3, "user".name),
              email = COALESCE($4, "user".email),
              x_handle = COALESCE($5, "user".x_handle),
              image = COALESCE($6, "user".image),
              email_verified_at = COALESCE($7, "user".email_verified_at),
              last_login_at = NOW(),
              "updatedAt" = NOW()
        WHERE id = $1
        RETURNING id, role`,
      [
        existing.rows[0].id,
        profile.did,
        profile.name,
        profile.email,
        profile.x_handle,
        profile.image,
        profile.email_verified_at,
      ],
    );
    return { ...result.rows[0], created: false };
  }

  const id = randomBytes(16).toString("hex");
  const inserted = await client.query<{ id: string; role: string | null }>(
    `INSERT INTO "user" (
        id,
        privy_did,
        name,
        email,
        x_handle,
        image,
        email_verified_at,
        last_login_at,
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
      RETURNING id, role`,
    [
      id,
      profile.did,
      profile.name,
      profile.email,
      profile.x_handle,
      profile.image,
      profile.email_verified_at,
    ],
  );
  return { ...inserted.rows[0], created: true };
}

/**
 * Allocates a referral row + code for a freshly-created user. Uses savepoints
 * so a referral_code collision can be retried without aborting the enclosing
 * sync transaction. ON CONFLICT (user_id) DO NOTHING makes this safe under
 * concurrent first-syncs of the same user.
 */
async function assignReferralCode(client: PoolClient, userId: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    await client.query("SAVEPOINT alloc_referral");
    try {
      await client.query(
        `INSERT INTO referrals (user_id, referral_code)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, code],
      );
      await client.query("RELEASE SAVEPOINT alloc_referral");
      return;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT alloc_referral");
      if ((err as { code?: string })?.code === "23505" && attempt < 4) continue;
      throw err;
    }
  }
}

async function syncLinkedAccounts(
  client: PoolClient,
  userId: string,
  accounts: SyncedAuthAccount[],
): Promise<void> {
  await client.query(`DELETE FROM user_auth_accounts WHERE user_id = $1`, [userId]);

  for (const account of accounts) {
    await client.query(
      `INSERT INTO user_auth_accounts (
          user_id,
          provider,
          provider_user_id,
          email,
          username,
          name,
          image,
          address,
          chain_type,
          wallet_client,
          wallet_client_type,
          connector_type,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        ON CONFLICT (provider, provider_user_id) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              email = EXCLUDED.email,
              username = EXCLUDED.username,
              name = EXCLUDED.name,
              image = EXCLUDED.image,
              address = EXCLUDED.address,
              chain_type = EXCLUDED.chain_type,
              wallet_client = EXCLUDED.wallet_client,
              wallet_client_type = EXCLUDED.wallet_client_type,
              connector_type = EXCLUDED.connector_type,
              updated_at = NOW()`,
      [
        userId,
        account.provider,
        account.provider_user_id,
        account.email,
        account.username,
        account.name,
        account.image,
        account.address,
        account.chain_type,
        account.wallet_client,
        account.wallet_client_type,
        account.connector_type,
      ],
    );
  }
}

async function syncPrimaryWallet(
  client: PoolClient,
  userId: string,
  wallet: AuthWallet | null,
): Promise<void> {
  if (!wallet) return;

  await client.query(
    `INSERT INTO user_wallets (
        user_id,
        privy_wallet_id,
        address,
        chain_type,
        wallet_client,
        wallet_client_type,
        connector_type,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET privy_wallet_id = EXCLUDED.privy_wallet_id,
            address = EXCLUDED.address,
            chain_type = EXCLUDED.chain_type,
            wallet_client = EXCLUDED.wallet_client,
            wallet_client_type = EXCLUDED.wallet_client_type,
            connector_type = EXCLUDED.connector_type,
            updated_at = NOW()`,
    [
      userId,
      wallet.privy_wallet_id,
      wallet.address,
      wallet.chain_type,
      wallet.wallet_client,
      wallet.wallet_client_type,
      wallet.connector_type,
    ],
  );
}

function extractPrivyProfile(did: string, privyUser: any) {
  const linkedAccounts = getLinkedAccounts(privyUser);
  const emailAccount = linkedAccounts.find((account) => readType(account) === "email");
  const googleAccount = linkedAccounts.find((account) => readType(account) === "google_oauth");
  const twitterAccount = linkedAccounts.find((account) => readType(account) === "twitter_oauth");

  const email =
    readString(emailAccount, ["address", "email"]) ??
    readString(googleAccount, ["email", "address"]) ??
    null;
  const xHandle = readString(twitterAccount, ["username"]) ?? null;
  const name =
    readString(googleAccount, ["name"]) ??
    readString(twitterAccount, ["name", "username"]) ??
    (email ? email.split("@")[0] : null);
  const twitterImage = normalizeTwitterAvatarUrl(
    readString(twitterAccount, [
      "profile_picture_url",
      "profilePictureUrl",
      "profile_image_url",
      "profileImageUrl",
      "avatar_url",
      "avatarUrl",
      "image_url",
      "imageUrl",
      "image",
      "picture",
    ]),
  );
  const image =
    twitterImage ??
    readString(googleAccount, ["picture", "image"]) ??
    null;

  return {
    did,
    name,
    email,
    x_handle: xHandle,
    image,
    email_verified_at: readDate(emailAccount, ["verified_at", "verifiedAt"]),
    accounts: linkedAccounts.map(normalizeLinkedAccount).filter(Boolean) as SyncedAuthAccount[],
    wallet: selectPrimarySolanaWallet(linkedAccounts),
  };
}

function getLinkedAccounts(privyUser: any): LinkedAccount[] {
  const accounts = privyUser?.linked_accounts ?? privyUser?.linkedAccounts ?? [];
  return Array.isArray(accounts) ? accounts : [];
}

function normalizeLinkedAccount(account: LinkedAccount): SyncedAuthAccount | null {
  const type = readType(account);
  const chainType = readString(account, ["chain_type", "chainType"]);
  const rawAddress = readString(account, ["address", "public_key", "publicKey"]);
  const address = type === "wallet" ? rawAddress : null;
  const provider = providerForAccount(type, chainType);
  const providerUserId = providerUserIdForAccount(account, provider, chainType, rawAddress);

  if (!providerUserId) return null;

  const image = readString(account, [
    "profile_picture_url",
    "profilePictureUrl",
    "profile_image_url",
    "profileImageUrl",
    "avatar_url",
    "avatarUrl",
    "image_url",
    "imageUrl",
    "image",
    "picture",
  ]);

  return {
    provider,
    provider_user_id: providerUserId,
    email: type === "wallet" ? readString(account, ["email"]) : readString(account, ["email", "address"]),
    username: readString(account, ["username"]),
    name: readString(account, ["name"]),
    image: type === "twitter_oauth" ? normalizeTwitterAvatarUrl(image) : image,
    address,
    chain_type: chainType,
    wallet_client: readString(account, ["wallet_client", "walletClient"]),
    wallet_client_type: readString(account, ["wallet_client_type", "walletClientType"]),
    connector_type: readString(account, ["connector_type", "connectorType"]),
  };
}

function selectPrimarySolanaWallet(accounts: LinkedAccount[]): AuthWallet | null {
  const wallets = accounts.filter((account) => {
    const type = readType(account);
    const chainType = readString(account, ["chain_type", "chainType"]);
    const address = readString(account, ["address", "public_key", "publicKey"]);
    return type === "wallet" && chainType === "solana" && Boolean(address);
  });

  if (!wallets.length) return null;

  const embedded = wallets.find((account) => {
    const connectorType = readString(account, ["connector_type", "connectorType"]);
    const walletClientType = readString(account, ["wallet_client_type", "walletClientType"]);
    const walletClient = readString(account, ["wallet_client", "walletClient"]);
    return connectorType === "embedded" || walletClientType === "privy" || walletClient === "privy";
  });
  const wallet = embedded ?? wallets[0];
  const address = readString(wallet, ["address", "public_key", "publicKey"]);
  if (!address) return null;

  const chainType = readString(wallet, ["chain_type", "chainType"]) ?? "solana";
  const connectorType = readString(wallet, ["connector_type", "connectorType"]);
  const walletClient = readString(wallet, ["wallet_client", "walletClient"]);
  const walletClientType = readString(wallet, ["wallet_client_type", "walletClientType"]);
  const isPrivySignable =
    connectorType === "embedded" || walletClientType === "privy" || walletClient === "privy";

  return {
    address,
    chain_type: chainType,
    privy_wallet_id: isPrivySignable ? readString(wallet, ["id"]) : null,
    wallet_client: walletClient,
    wallet_client_type: walletClientType,
    connector_type: connectorType,
  };
}

function providerForAccount(type: string | null, chainType: string | null): string {
  if (type === "google_oauth") return "google";
  if (type === "twitter_oauth") return "twitter";
  if (type === "email") return "email";
  if (type === "wallet") return chainType === "solana" ? "solana_wallet" : "wallet";
  return type || "unknown";
}

function providerUserIdForAccount(
  account: LinkedAccount,
  provider: string,
  chainType: string | null,
  address: string | null,
): string | null {
  if (provider === "email") return readString(account, ["address", "email"]);
  if (provider === "google") return readString(account, ["subject", "id", "email"]);
  if (provider === "twitter") return readString(account, ["subject", "id", "username"]);
  if (provider === "solana_wallet" || provider === "wallet") {
    return address ? `${chainType ?? "unknown"}:${address.toLowerCase()}` : null;
  }
  return readString(account, ["subject", "id", "address", "email"]);
}

function readType(account: LinkedAccount | undefined): string | null {
  return readString(account, ["type"]);
}

function readString(account: LinkedAccount | undefined, keys: string[]): string | null {
  if (!account) return null;
  const profile = account.profile as LinkedAccount | undefined;
  const user = account.user as LinkedAccount | undefined;
  for (const key of keys) {
    const value = account[key] ?? profile?.[key] ?? user?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeTwitterAvatarUrl(value: string | null): string | null {
  if (!value) return null;

  const querySized = value.replace(
    /([?&]name=)normal(?=(&|$))/i,
    (_, prefix: string) => `${prefix}400x400`,
  );
  if (querySized !== value) return querySized;

  return value.replace(
    /_normal(?=(?:\.[a-z0-9]+)?(?:[?#]|$))/i,
    "_400x400",
  );
}

function readDate(account: LinkedAccount | undefined, keys: string[]): Date | null {
  const value = readString(account, keys);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toRequestUser(user: AuthUser) {
  return {
    id: user.id,
    isAdmin: user.role === "admin",
    role: user.role,
    privy_did: user.privy_did,
    solana_address: user.solana_address ?? undefined,
    wallet: user.wallet ?? undefined,
    email: user.email ?? undefined,
  };
}

/**
 * Standalone middleware for routes that should 401 on missing/invalid auth.
 * Most routes use createJWTTokenAuth() instead.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  getCurrentUser(req)
    .then((user) => {
      if (!user) {
        res.status(401).json({ success: false, error: "UNAUTHORIZED" });
        return;
      }
      req.user = toRequestUser(user);
      next();
    })
    .catch((err) => {
      console.error("requireAuth error:", err);
      res.status(500).json({ success: false, error: "Internal Server Error" });
    });
}
