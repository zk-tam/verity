import {
  Commitment,
  Connection,
  Keypair,
  ParsedInstruction,
  PublicKey,
  SignatureResult,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import bs58 from "bs58";
import { env } from "../environments";
import { privy } from "./privy";

export const USDC_DECIMALS = 6;

type SolanaConfig = {
  connection: Connection;
  usdcMint: PublicKey;
  treasury: Keypair;
};

let cachedConfig: SolanaConfig | null = null;

function getSolanaConfig(): SolanaConfig {
  if (cachedConfig) return cachedConfig;
  if (!env.SOLANA_RPC_URL || !env.SOLANA_USDC_MINT || !env.SOLANA_TREASURY_SECRET_KEY) {
    throw new Error("SOLANA_NOT_CONFIGURED");
  }

  cachedConfig = {
    connection: new Connection(env.SOLANA_RPC_URL, env.SOLANA_COMMITMENT),
    usdcMint: new PublicKey(env.SOLANA_USDC_MINT),
    treasury: loadTreasuryKeypair(env.SOLANA_TREASURY_SECRET_KEY),
  };
  return cachedConfig;
}

export function treasuryAddress() {
  return getSolanaConfig().treasury.publicKey;
}

function loadTreasuryKeypair(raw: string): Keypair {
  const trimmed = raw.trim();
  const bytes = trimmed.startsWith("[")
    ? Uint8Array.from(JSON.parse(trimmed))
    : bs58.decode(trimmed);
  return Keypair.fromSecretKey(bytes);
}

function toBaseUnits(usd: number | string): bigint {
  // Decimal-safe: convert via fixed-precision string to avoid float drift.
  const n = Number(usd);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid USDC amount: ${usd}`);
  const [whole, frac = ""] = n.toFixed(USDC_DECIMALS).split(".");
  const padded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(padded);
}

function fromBaseUnits(units: bigint): number {
  return Number(units) / 10 ** USDC_DECIMALS;
}

/** USDC balance for an arbitrary wallet. 0 if no ATA exists yet. */
export async function getUsdcBalance(walletAddress: string): Promise<number> {
  const { connection, usdcMint } = getSolanaConfig();
  const owner = new PublicKey(walletAddress);
  const ata = await getAssociatedTokenAddress(usdcMint, owner, true);
  try {
    const account = await getAccount(connection, ata, env.SOLANA_COMMITMENT);
    return fromBaseUnits(account.amount);
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError) return 0;
    throw err;
  }
}

/**
 * Charges `amountUsd` USDC from the user's Privy server wallet to the treasury,
 * with the treasury sponsoring SOL gas (and ATA rent if needed).
 *
 * Flow (mirrors solgacha-prototype's admin-paid pattern):
 *   1. Build a legacy Transaction with treasury as feePayer.
 *   2. Treasury partial-signs (covers fees + any ATA-create rent).
 *   3. Privy server-wallet API adds the user's signature for the SPL transfer.
 *   4. We submit the fully-signed tx via our RPC and confirm.
 *
 * Returns the on-chain signature.
 */
export async function chargeUserUsdc(opts: {
  privyWalletId: string;
  fromAddress: string;
  amountUsd: number | string;
}): Promise<string> {
  const { connection, usdcMint, treasury } = getSolanaConfig();
  const { privyWalletId, fromAddress, amountUsd } = opts;
  const owner = new PublicKey(fromAddress);
  const baseUnits = toBaseUnits(amountUsd);
  if (baseUnits <= 0n) throw new Error("amountUsd must be > 0");

  const fromAta = await getAssociatedTokenAddress(usdcMint, owner, true);
  const toAta = await getAssociatedTokenAddress(usdcMint, treasury.publicKey, true);

  // Pre-flight balance check — fail fast with a typed error rather than letting
  // the on-chain tx burn a slot.
  const fromAcct = await getAccount(connection, fromAta, env.SOLANA_COMMITMENT).catch(
    (err) => {
      if (err instanceof TokenAccountNotFoundError) return null;
      throw err;
    },
  );
  if (!fromAcct) throw new Error("USDC_ACCOUNT_NOT_FOUND");
  if (fromAcct.amount < baseUnits) throw new Error("INSUFFICIENT_USDC_BALANCE");

  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
  ];

  // First-ever payment: treasury hasn't received USDC yet, so its ATA needs
  // creating. Treasury pays the rent (~0.002 SOL one-time).
  const treasuryAtaInfo = await connection
    .getAccountInfo(toAta, env.SOLANA_COMMITMENT)
    .catch(() => null);
  if (!treasuryAtaInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        treasury.publicKey,
        toAta,
        treasury.publicKey,
        usdcMint,
      ),
    );
  }

  ixs.push(
    createTransferCheckedInstruction(
      fromAta,
      usdcMint,
      toAta,
      owner,
      baseUnits,
      USDC_DECIMALS,
    ),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    env.SOLANA_COMMITMENT,
  );

  const tx = new Transaction();
  tx.add(...ixs);
  tx.feePayer = treasury.publicKey;
  tx.recentBlockhash = blockhash;

  // Treasury signs first (fee payer + optional ATA-create authority).
  tx.partialSign(treasury);

  // Hand the partially-signed tx to Privy. The server wallet (`owner`) adds
  // its signature for the transferChecked, then returns the fully-signed bytes.
  const serializedUnsigned = tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");

  // signTransaction (Solana) takes only the tx; caip2 is a signAndSend-only field.
  const privyResp = await privy
    .wallets()
    .solana()
    .signTransaction(privyWalletId, { transaction: serializedUnsigned });

  const signedBytes = Buffer.from(privyResp.signed_transaction, "base64");
  const signature = await connection.sendRawTransaction(signedBytes, {
    skipPreflight: false,
    maxRetries: 3,
  });

  // We have the signature now (it's the hash of the signed tx, deterministic
  // from contents). Use it to figure out what actually happened on-chain:
  //   1. Wait for confirmation. If confirmTransaction throws (most often a
  //      TransactionExpiredBlockheightExceededError or websocket drop), the
  //      tx may still have landed — fall back to a synchronous status poll.
  //   2. If the resolved status carries an `err`, the tx is on-chain but
  //      the SPL transfer reverted. User was NOT charged. Throw so Phase 3
  //      unreserves the card.
  //
  // No paranoid getParsedTransaction effect-check: transferChecked enforces
  // mint + decimals at program level, and source/dest/amount are baked into
  // the bytes Privy signs. err === null ⇒ USDC moved as specified.
  let result: SignatureResult;
  try {
    const conf = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      env.SOLANA_COMMITMENT,
    );
    result = conf.value;
  } catch (err) {
    const polled = await pollSignatureStatus(
      connection,
      signature,
      env.SOLANA_COMMITMENT,
    );
    if (!polled) {
      throw new Error(
        `PAYMENT_UNCONFIRMED (sig: ${signature}, cause: ${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }
    result = polled;
  }
  if (result.err) {
    throw new Error(
      `PAYMENT_TX_FAILED (sig: ${signature}): ${JSON.stringify(result.err)}`,
    );
  }

  // Defense-in-depth: re-fetch the on-chain tx and verify it actually moved
  // USDC from the user's ATA to the treasury's ATA for the right amount.
  // Catches the (unlikely but unverifiable from .err alone) case where Privy
  // signed something other than the bytes we sent.
  await verifyUsdcTransfer(connection, signature, {
    fromAta,
    toAta,
    mint: usdcMint,
    baseUnits,
    commitment: env.SOLANA_COMMITMENT,
  });

  return signature;
}

/**
 * Re-fetch a confirmed tx and verify the SPL transfer matches what we built:
 * mint = USDC, source = user ATA, destination = treasury ATA, amount = ours.
 * We require transferChecked specifically (the unchecked `transfer` variant
 * doesn't carry the mint, so we can't verify the asset off the instruction
 * alone). Throws on any mismatch with the signature embedded for triage.
 */
async function verifyUsdcTransfer(
  connection: Connection,
  signature: string,
  expected: {
    fromAta: PublicKey;
    toAta: PublicKey;
    mint: PublicKey;
    baseUnits: bigint;
    commitment: Commitment;
  },
): Promise<void> {
  // getParsedTransaction takes Finality, not Commitment ("processed" excluded).
  const finality = expected.commitment === "finalized" ? "finalized" : "confirmed";
  const tx = await connection.getParsedTransaction(signature, {
    commitment: finality,
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error(`PAYMENT_TX_NOT_FOUND (sig: ${signature})`);
  if (tx.meta?.err) {
    throw new Error(
      `PAYMENT_TX_REVERTED (sig: ${signature}): ${JSON.stringify(tx.meta.err)}`,
    );
  }

  const transferIx = tx.transaction.message.instructions.find(
    (ix): ix is ParsedInstruction =>
      "parsed" in ix &&
      ix.program === "spl-token" &&
      (ix.parsed?.type === "transferChecked" || ix.parsed?.type === "transfer"),
  );
  if (!transferIx) {
    throw new Error(`PAYMENT_TX_NO_SPL_TRANSFER (sig: ${signature})`);
  }
  if (transferIx.parsed.type !== "transferChecked") {
    // `transfer` (unchecked) doesn't include the mint in the instruction —
    // we can't prove asset identity from it. We always build transferChecked,
    // so anything else is a red flag.
    throw new Error(`PAYMENT_TX_USED_UNCHECKED_TRANSFER (sig: ${signature})`);
  }

  const info = transferIx.parsed.info as {
    source?: string;
    destination?: string;
    mint?: string;
    tokenAmount?: { amount?: string; decimals?: number };
  };
  const expectedMint = expected.mint.toBase58();
  const expectedFrom = expected.fromAta.toBase58();
  const expectedTo = expected.toAta.toBase58();
  const expectedAmount = expected.baseUnits.toString();

  if (info.mint !== expectedMint) {
    throw new Error(
      `PAYMENT_TX_MINT_MISMATCH (sig: ${signature}): got ${info.mint}, expected ${expectedMint}`,
    );
  }
  if (info.destination !== expectedTo) {
    throw new Error(
      `PAYMENT_TX_DEST_MISMATCH (sig: ${signature}): got ${info.destination}, expected ${expectedTo}`,
    );
  }
  if (info.source !== expectedFrom) {
    throw new Error(
      `PAYMENT_TX_SRC_MISMATCH (sig: ${signature}): got ${info.source}, expected ${expectedFrom}`,
    );
  }
  if (info.tokenAmount?.amount !== expectedAmount) {
    throw new Error(
      `PAYMENT_TX_AMOUNT_MISMATCH (sig: ${signature}): got ${info.tokenAmount?.amount}, expected ${expectedAmount}`,
    );
  }
}

/**
 * Synchronous status poll for a known signature. Used when confirmTransaction
 * throws (blockhash expired, RPC dropped) — the tx may still have landed, so
 * we use the signature we already have to find out. Returns the on-chain
 * status (commitment ≥ requested + err state) or null if still unknown after
 * the timeout.
 */
async function pollSignatureStatus(
  connection: Connection,
  signature: string,
  commitment: Commitment,
  timeoutMs = 15_000,
  intervalMs = 1_500,
): Promise<SignatureResult | null> {
  const reached = (status: "processed" | "confirmed" | "finalized") => {
    if (commitment === "finalized") return status === "finalized";
    if (commitment === "confirmed") return status === "confirmed" || status === "finalized";
    return true;
  };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const s = res.value[0];
    if (s) {
      if (s.err) return { err: s.err };
      if (s.confirmationStatus && reached(s.confirmationStatus)) {
        return { err: null };
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/**
 * Treasury sends USDC to a user wallet (sellback / forced-drop refund / payout).
 * Treasury covers SOL gas and recipient ATA rent if needed. Fully signed and
 * submitted by us — no Privy round-trip required.
 */
export async function treasurySendUsdc(opts: {
  toAddress: string;
  amountUsd: number | string;
}): Promise<string> {
  const { connection, usdcMint, treasury } = getSolanaConfig();
  const recipient = new PublicKey(opts.toAddress);
  const baseUnits = toBaseUnits(opts.amountUsd);
  if (baseUnits <= 0n) throw new Error("amountUsd must be > 0");

  const fromAta = await getAssociatedTokenAddress(usdcMint, treasury.publicKey, true);
  const toAta = await getAssociatedTokenAddress(usdcMint, recipient, true);

  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
  ];

  const recipientAtaInfo = await connection
    .getAccountInfo(toAta, env.SOLANA_COMMITMENT)
    .catch(() => null);
  if (!recipientAtaInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        treasury.publicKey,
        toAta,
        recipient,
        usdcMint,
      ),
    );
  }

  ixs.push(
    createTransferCheckedInstruction(
      fromAta,
      usdcMint,
      toAta,
      treasury.publicKey,
      baseUnits,
      USDC_DECIMALS,
    ),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    env.SOLANA_COMMITMENT,
  );
  const tx = new Transaction();
  tx.add(...ixs);
  tx.feePayer = treasury.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(treasury);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    env.SOLANA_COMMITMENT,
  );
  return signature;
}

function caip2ForCluster(): string {
  // Mainnet: 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d
  // Devnet:  EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
  // Testnet: 4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY
  const url = env.SOLANA_RPC_URL?.toLowerCase() ?? "";
  if (url.includes("devnet")) return "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  if (url.includes("testnet")) return "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
  return "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
}
