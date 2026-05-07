import { Pool, PoolClient } from "pg";
import winston from "winston";

/**
 * Pricing flow:
 *   1. Download the bulk CSV from PriceCharting.
 *   2. Cache the relevant columns into pricecharting_csv (one row per pc_id).
 *   3. For every `cards` row with a matching pricecharting_id, recompute
 *      value_usd = base_price × MARKUP and bulk-update. Because card_stock
 *      reads value_usd off cards via FK, a single update propagates to
 *      every machine's stock.
 *
 * No exchange rate / MYR conversion — everything is USD-native now.
 */

const MARKUP = 1.5; // 50% price hike on top of the PriceCharting base price.
const CSV_FETCH_TIMEOUT_MS = 30_000;
const INSERT_BATCH_SIZE = 2000;
const UPDATE_BATCH_SIZE = 1000;

const CSV_KEEP_FIELDS = new Set<string>([
  "id",
  "loose-price",
  "cib-price",
  "new-price",
  "graded-price",
  "bgs-10-price",
  "condition-17-price",
  "condition-18-price",
  "manual-only-price",
]);

interface CsvRow {
  id: string;
  "loose-price": string;
  "cib-price": string;
  "new-price": string;
  "graded-price": string;
  "bgs-10-price": string;
  "condition-17-price": string;
  "condition-18-price": string;
  "manual-only-price": string;
}

interface PcCsvDbRow {
  pc_id: string;
  loose_price: string;
  cib_price: string;
  new_price: string;
  graded_price: string;
  bgs_10_price: string;
  condition_17_price: string;
  condition_18_price: string;
  manual_only_price: string;
}

// PriceCharting CSV uses cents-as-integer strings (e.g. "1234" = $12.34).
// Empty/0 means no listing.
function centsStringToUsd(cents: string | null | undefined): number {
  if (!cents) return 0;
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / 100;
}

/**
 * Picks the base USD price for a card based on its grade. Mirrors the
 * pre-rewrite heuristic — adjust here if the grading taxonomy changes.
 */
function pickBasePriceUsd(row: PcCsvDbRow, grade: number | null): number {
  // Common rule of thumb:
  //   ungraded (grade IS NULL) → loose_price
  //   graded 10               → BGS-10 price (highest tier)
  //   graded ≥ 9              → graded_price (generic graded)
  //   else                    → loose_price
  // Operators can re-tune the cutoffs as needed.
  if (grade == null) return centsStringToUsd(row.loose_price);
  if (grade >= 10) {
    const bgs = centsStringToUsd(row.bgs_10_price);
    if (bgs > 0) return bgs;
    return centsStringToUsd(row.graded_price);
  }
  if (grade >= 9) return centsStringToUsd(row.graded_price);
  return centsStringToUsd(row.loose_price);
}

function parseCsvLine(line: string): string[] {
  // Minimal CSV parser supporting quoted fields with embedded commas.
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

async function fetchCsv(token: string, logger: winston.Logger): Promise<CsvRow[]> {
  const url = `https://www.pricecharting.com/price-guide/download-custom?t=${encodeURIComponent(
    token,
  )}&category=pokemon-cards`;
  logger.info("[pricecharting] fetching bulk CSV");

  const resp = await fetch(url, { signal: AbortSignal.timeout(CSV_FETCH_TIMEOUT_MS) });
  if (!resp.ok) {
    throw new Error(`CSV download HTTP ${resp.status}: ${await resp.text()}`);
  }
  const text = await resp.text();
  const lines = text.split("\n");
  if (lines.length < 2) throw new Error("CSV has no data rows");

  const headers = lines[0].split(",");
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      if (CSV_KEEP_FIELDS.has(headers[j])) {
        row[headers[j]] = values[j] ?? "";
      }
    }
    rows.push(row as unknown as CsvRow);
  }
  logger.info(`[pricecharting] parsed ${rows.length} rows`);
  return rows;
}

function csvRowToDbRow(r: CsvRow): PcCsvDbRow {
  return {
    pc_id: r.id ?? "",
    loose_price: r["loose-price"] ?? "",
    cib_price: r["cib-price"] ?? "",
    new_price: r["new-price"] ?? "",
    graded_price: r["graded-price"] ?? "",
    bgs_10_price: r["bgs-10-price"] ?? "",
    condition_17_price: r["condition-17-price"] ?? "",
    condition_18_price: r["condition-18-price"] ?? "",
    manual_only_price: r["manual-only-price"] ?? "",
  };
}

async function upsertPcCsvCache(client: PoolClient, dbRows: PcCsvDbRow[]): Promise<void> {
  for (let i = 0; i < dbRows.length; i += INSERT_BATCH_SIZE) {
    const batch = dbRows.slice(i, i + INSERT_BATCH_SIZE);
    const valueClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const r of batch) {
      valueClauses.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`,
      );
      params.push(
        r.pc_id, r.loose_price, r.cib_price, r.new_price, r.graded_price,
        r.bgs_10_price, r.condition_17_price, r.condition_18_price, r.manual_only_price,
      );
    }
    await client.query(
      `INSERT INTO pricecharting_csv
         (pc_id, loose_price, cib_price, new_price, graded_price, bgs_10_price,
          condition_17_price, condition_18_price, manual_only_price)
       VALUES ${valueClauses.join(", ")}
       ON CONFLICT (pc_id) DO UPDATE SET
         loose_price = EXCLUDED.loose_price,
         cib_price = EXCLUDED.cib_price,
         new_price = EXCLUDED.new_price,
         graded_price = EXCLUDED.graded_price,
         bgs_10_price = EXCLUDED.bgs_10_price,
         condition_17_price = EXCLUDED.condition_17_price,
         condition_18_price = EXCLUDED.condition_18_price,
         manual_only_price = EXCLUDED.manual_only_price`,
      params,
    );
  }
}

async function applyPriceUpdates(
  client: PoolClient,
  updates: Array<{ id: number; valueUsd: number }>,
): Promise<void> {
  for (let i = 0; i < updates.length; i += UPDATE_BATCH_SIZE) {
    const batch = updates.slice(i, i + UPDATE_BATCH_SIZE);
    await client.query(
      `UPDATE cards c
          SET value_usd = u.value_usd,
              updated_at = NOW()
         FROM (SELECT unnest($1::int[]) AS id,
                      unnest($2::numeric[]) AS value_usd) AS u
        WHERE c.id = u.id`,
      [batch.map((u) => u.id), batch.map((u) => u.valueUsd)],
    );
  }
}

/**
 * Top-level entrypoint. Pulls fresh prices and propagates them to card_stock.
 * Safe to run repeatedly. Returns counts for logging / admin response.
 */
export async function refreshPricechartingCsv(
  pool: Pool,
  apiKey: string,
  logger: winston.Logger,
): Promise<{ csv_rows: number; cards_updated: number }> {
  const csvRows = await fetchCsv(apiKey, logger);
  const dbRows = csvRows.map(csvRowToDbRow).filter((r) => r.pc_id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await upsertPcCsvCache(client, dbRows);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Compute new value_usd per cards row that has a pricecharting_id.
  const cardRowsRes = await pool.query<{
    id: number;
    grade: number | null;
    pricecharting_id: string;
  }>(
    `SELECT id, grade, pricecharting_id
       FROM cards
      WHERE pricecharting_id IS NOT NULL AND pricecharting_id <> ''`,
  );

  if (cardRowsRes.rows.length === 0) {
    logger.info("[pricecharting] no cards rows with pricecharting_id; skipping update");
    return { csv_rows: dbRows.length, cards_updated: 0 };
  }

  const pcMap = new Map<string, PcCsvDbRow>(dbRows.map((r) => [r.pc_id, r]));
  const updates: Array<{ id: number; valueUsd: number }> = [];
  for (const card of cardRowsRes.rows) {
    const pc = pcMap.get(card.pricecharting_id);
    if (!pc) continue;
    const base = pickBasePriceUsd(pc, card.grade != null ? Number(card.grade) : null);
    const valueUsd = +(base * MARKUP).toFixed(2);
    updates.push({ id: card.id, valueUsd });
  }

  if (updates.length > 0) {
    const updateClient = await pool.connect();
    try {
      await updateClient.query("BEGIN");
      await applyPriceUpdates(updateClient, updates);
      await updateClient.query("COMMIT");
    } catch (err) {
      await updateClient.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      updateClient.release();
    }
  }

  logger.info(
    `[pricecharting] refreshed ${dbRows.length} CSV rows; updated ${updates.length} cards value_usd`,
  );
  return { csv_rows: dbRows.length, cards_updated: updates.length };
}
