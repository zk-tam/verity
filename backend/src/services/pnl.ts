import { Pool, PoolClient } from "pg";
import { BaseService } from "./base";

export interface MachinePnL {
  machine_id: number;
  name: string;
  cached_pnl_usd: number;
  ev_usd: number;
  total_quantity: number;
  total_value_usd: number;
}

export interface PlatformPnL {
  total_revenue_usd: number;
  total_card_value_out_usd: number;
  net_pnl_usd: number;
  rolls_count: number;
  user_count: number;
  new_user_count: number;
}

/**
 * Slim PnL service. Now that everything is denominated in USDC and there's
 * no off-chain credit ledger, PnL is just (revenue in − card values out)
 * computed off gacha_rolls + gacha_machines.
 */
export class PnlService extends BaseService {
  constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
    super({ pool, client });
  }

  public async getPlatformPnl(opts: { dateFrom?: string; dateTo?: string } = {}): Promise<PlatformPnL> {
    const { dateFrom, dateTo } = opts;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (dateFrom) {
      conditions.push(`gr.created_at >= $${idx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`gr.created_at < $${idx++}`);
      params.push(dateTo);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rolls, users] = await Promise.all([
      this.query<{
        revenue: string;
        value_out: string;
        rolls: string;
      }>(
        `SELECT
           COALESCE(SUM(usd_spent), 0)       AS revenue,
           COALESCE(SUM(card_value_usd), 0)  AS value_out,
           COUNT(*)                           AS rolls
         FROM gacha_rolls gr ${where}`,
        params,
      ),
      this.query<{ user_count: string; new_user_count: string }>(
        `SELECT
           COUNT(*) AS user_count,
           COUNT(*) FILTER (
             WHERE "createdAt" >= COALESCE($1::timestamptz, "createdAt")
               AND "createdAt" <  COALESCE($2::timestamptz, "createdAt" + INTERVAL '1 second')
           ) AS new_user_count
         FROM "user"
         WHERE is_internal_account = FALSE`,
        [dateFrom ?? null, dateTo ?? null],
      ),
    ]);

    const revenue = Number(rolls.rows[0]?.revenue ?? 0);
    const valueOut = Number(rolls.rows[0]?.value_out ?? 0);
    return {
      total_revenue_usd: revenue,
      total_card_value_out_usd: valueOut,
      net_pnl_usd: revenue - valueOut,
      rolls_count: Number(rolls.rows[0]?.rolls ?? 0),
      user_count: Number(users.rows[0]?.user_count ?? 0),
      new_user_count: Number(users.rows[0]?.new_user_count ?? 0),
    };
  }

  /**
   * Per-machine snapshot: cached PnL + live EV. Each card_stock row is one
   * physical copy on one machine. EV averages over every non-disabled,
   * unconsumed row including PnL-locked ones, so EV reflects "what's on
   * the machine" rather than the strict expectation of the next pull.
   */
  public async getMachinesPnl(): Promise<MachinePnL[]> {
    const result = await this.query<{
      machine_id: number;
      name: string;
      cached_pnl_usd: string;
      ev_usd: string;
      total_quantity: string;
      total_value_usd: string;
    }>(
      `SELECT
         m.id   AS machine_id,
         m.name AS name,
         m.cached_pnl_usd,
         CASE WHEN COUNT(cs.id) = 0 THEN 0
              ELSE SUM(c.value_usd) / COUNT(cs.id)
         END AS ev_usd,
         COUNT(cs.id)                  AS total_quantity,
         COALESCE(SUM(c.value_usd), 0) AS total_value_usd
        FROM gacha_machines m
        LEFT JOIN card_stock cs
          ON cs.machine_id = m.id
         AND cs.consumed_at IS NULL
         AND cs.is_disabled = FALSE
        LEFT JOIN cards c ON c.id = cs.card_id
       GROUP BY m.id, m.name, m.cached_pnl_usd
       ORDER BY m.id`,
    );
    return result.rows.map((r) => ({
      machine_id: r.machine_id,
      name: r.name,
      cached_pnl_usd: Number(r.cached_pnl_usd),
      ev_usd: Number(r.ev_usd),
      total_quantity: Number(r.total_quantity),
      total_value_usd: Number(r.total_value_usd),
    }));
  }
}
