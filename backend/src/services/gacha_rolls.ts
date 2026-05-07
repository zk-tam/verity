import { Pool, PoolClient } from "pg";
import { BaseService } from "./base";
import {
  GachaRoll,
  GachaRollModel,
  SELLBACK_PAYOUT_FRACTION,
  SELLBACK_WINDOW_MS,
} from "../models/gacha_rolls";
import { GachaMachine, GachaMachineModel } from "../models/gacha_machine";
import { withDBTransaction } from "../db/tx";
import { chargeUserUsdc, getUsdcBalance, treasurySendUsdc } from "../lib/solana";
import { pushRecentWinIfQualifies } from "../lib/recent-wins-cache";
import { ResponseError } from "../routes/errors";
import { PointsService } from "./points";

interface PickedCard {
  /** card_stock.id — the unique physical card on the machine. */
  card_stock_id: number;
  value_usd: number;
  image_url: string | null;
  source: "paid" | "forced";
  forced_drop_id: number | null;
}

export interface RollResult {
  roll: GachaRollModel;
}

export interface BulkRollResult {
  rolls: GachaRollModel[];
  charged_usd: number;
  requested_qty: number;
  fulfilled_qty: number;
}

export class GachaRollService extends BaseService {
  constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
    super({ pool, client });
  }

  /**
   * Single-pull entrypoint. Four phases:
   *   1. Wallet + balance pre-flight (fail fast on INSUFFICIENT_USDC).
   *   2. DB tx: reserve a card_stock row (forced drop first, then uniform
   *      random over the machine's card_stock where consumed_at IS NULL,
   *      !is_disabled, and (release_pnl_threshold_usd IS NULL OR
   *      machine.cached_pnl_usd >= threshold)). Reservation = SET
   *      consumed_at = NOW() on that row.
   *   3. On-chain: charge user USDC. On failure, undo the reservation.
   *   4. DB tx: insert roll, link consumed row to roll, update cached_pnl_usd,
   *      mark forced drop claimed.
   *
   * If a forced drop's target card has no available rows, the forced drop
   * is marked status='unfulfillable' (not retried on a future roll) and
   * the roll falls through to a normal weighted pick so the user still
   * gets a card.
   *
   * If phase 4 fails after a successful payment, the orphan signature is
   * logged for reconciliation.
   */
  public async roll(opts: {
    userId: string;
    machineId: number;
  }): Promise<RollResult> {
    const { userId, machineId } = opts;
    if (!this.pool) throw new Error("GachaRollService requires a pool for roll()");
    const pool = this.pool;
    const runInTx = withDBTransaction(pool);

    // ── Phase 1: wallet + balance ───────────────────────────────────────────
    const machinePrice = await this.fetchMachinePrice(pool, machineId);
    const wallet = await this.fetchWallet(pool, userId);
    const balance = await getUsdcBalance(wallet.address);
    if (balance < machinePrice) throw new Error(ResponseError.INSUFFICIENT_USDC);

    // ── Phase 2: pick + reserve ─────────────────────────────────────────────
    const reservation = await runInTx(async (client: PoolClient) => {
      const machineRes = await client.query<MachineRow>(
        `SELECT id, price_usd, is_available, cached_pnl_usd
           FROM gacha_machines
          WHERE id = $1
          FOR UPDATE`,
        [machineId],
      );
      if (!machineRes.rows.length) throw new Error(ResponseError.MACHINE_NOT_FOUND);
      const machine = machineRes.rows[0];
      if (!machine.is_available) throw new Error(ResponseError.MACHINE_NOT_AVAILABLE);
      const machinePnl = Number(machine.cached_pnl_usd);

      const forced = await client.query<{ id: number; card_stock_id: number }>(
        `SELECT id, card_stock_id
           FROM user_forced_drops
          WHERE user_id = $1 AND machine_id = $2 AND status = 'pending'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED`,
        [userId, machineId],
      );

      if (forced.rows.length) {
        const fd = forced.rows[0];
        // Forced drops bypass is_disabled and the threshold check.
        const reserved = await reserveCard(client, fd.card_stock_id, machineId);
        if (reserved) {
          return {
            machine,
            picked: {
              card_stock_id: reserved.card_stock_id,
              value_usd: reserved.value_usd,
              image_url: reserved.image_url,
              source: "forced" as const,
              forced_drop_id: fd.id,
            },
          };
        }
        // Target card is missing or already consumed on this machine. Mark
        // the forced drop unfulfillable and fall through to a weighted pick.
        await client.query(
          `UPDATE user_forced_drops
              SET status = 'unfulfillable', unfulfilled_at = NOW()
            WHERE id = $1`,
          [fd.id],
        );
        console.warn("[gacha.roll] forced drop unfulfillable, falling through", {
          userId,
          machineId,
          forcedDropId: fd.id,
          cardStockId: fd.card_stock_id,
        });
      }

      const reserved = await reserveWeighted(client, machineId, machinePnl);
      if (!reserved) throw new Error(ResponseError.NO_CARDS_AVAILABLE);
      return {
        machine,
        picked: {
          card_stock_id: reserved.card_stock_id,
          value_usd: reserved.value_usd,
          image_url: reserved.image_url,
          source: "paid" as const,
          forced_drop_id: null,
        } satisfies PickedCard,
      };
    });

    const { picked } = reservation;
    const priceUsd = Number(reservation.machine.price_usd);

    // ── Phase 3: on-chain payment ──────────────────────────────────────────
    let paymentSignature: string;
    try {
      paymentSignature = await chargeUserUsdc({
        privyWalletId: wallet.privy_wallet_id,
        fromAddress: wallet.address,
        amountUsd: priceUsd,
      });
    } catch (err) {
      await unreserveCards(pool, [picked.card_stock_id]).catch((e) => {
        console.error("[gacha.roll] unreserve failed after charge failure", {
          userId,
          machineId,
          cardStockId: picked.card_stock_id,
          error: e instanceof Error ? e.message : String(e),
        });
      });
      if (err instanceof Error && err.message === "INSUFFICIENT_USDC_BALANCE") {
        throw new Error(ResponseError.INSUFFICIENT_USDC);
      }
      throw err;
    }

    // ── Phase 4: persist roll + PnL ────────────────────────────────────────
    try {
      const roll = await runInTx(async (client: PoolClient) => {
        const inserted = await client.query<GachaRoll>(
          `INSERT INTO gacha_rolls (
              user_id, machine_id, card_stock_id, card_value_usd, card_image_url,
              usd_spent, payment_signature, source, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unhandled')
            RETURNING *`,
          [
            userId,
            machineId,
            picked.card_stock_id,
            picked.value_usd,
            picked.image_url,
            priceUsd,
            paymentSignature,
            picked.source,
          ],
        );
        const rollRow = inserted.rows[0];

        await client.query(
          `UPDATE card_stock
              SET consumed_by_roll_id = $2, updated_at = NOW()
            WHERE id = $1`,
          [picked.card_stock_id, rollRow.id],
        );

        await client.query(
          `UPDATE gacha_machines
              SET cached_pnl_usd = cached_pnl_usd + $2 - $3,
                  updated_at = NOW()
            WHERE id = $1`,
          [machineId, priceUsd, picked.value_usd],
        );

        if (picked.forced_drop_id) {
          await client.query(
            `UPDATE user_forced_drops
                SET status = 'claimed',
                    claimed_at = NOW(),
                    claimed_roll_id = $2
              WHERE id = $1`,
            [picked.forced_drop_id, rollRow.id],
          );
        }

        // Points: scaled off usd_spent so any free-pull path (usd_spent = 0)
        // is automatically a no-op; admin-forced paid pulls still earn.
        await new PointsService({ client }).awardForRoll({
          rollId: rollRow.id,
          usdSpent: Number(rollRow.usd_spent),
          userId,
        });

        return new GachaRollModel(rollRow);
      });

      void this.recordRecentWinIfQualifies(roll, userId, picked.card_stock_id).catch(
        (err) =>
          console.error("[gacha.roll] recent-win cache push failed", {
            error: err instanceof Error ? err.message : String(err),
          }),
      );

      return { roll };
    } catch (err) {
      console.error("[gacha.roll] payment landed but DB persist failed", {
        userId,
        machineId,
        cardStockId: picked.card_stock_id,
        signature: paymentSignature,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Bulk-pull entrypoint. Forced drops are consumed first (in created_at
   * order) up to the requested qty; remaining slots are uniform-random
   * over unconsumed, non-disabled, threshold-satisfied card_stock rows on
   * the machine. A forced drop whose target card has no available row is
   * marked status='unfulfillable'; the roll falls through to a normal
   * pick. effective_qty = min(qty, fulfillable_picks).
   */
  public async bulkRoll(opts: {
    userId: string;
    machineId: number;
    qty: number;
  }): Promise<BulkRollResult> {
    const { userId, machineId, qty } = opts;
    if (!this.pool) throw new Error("GachaRollService requires a pool for bulkRoll()");
    if (qty < 1) throw new Error(ResponseError.NO_CARDS_AVAILABLE);
    const pool = this.pool;
    const runInTx = withDBTransaction(pool);

    // ── Phase 1: wallet + worst-case balance check ──────────────────────────
    const priceUsd = await this.fetchMachinePrice(pool, machineId);
    const wallet = await this.fetchWallet(pool, userId);
    const balance = await getUsdcBalance(wallet.address);
    if (balance < priceUsd * qty) throw new Error(ResponseError.INSUFFICIENT_USDC);

    // ── Phase 2: simulate + reserve ─────────────────────────────────────────
    const reservation = await runInTx(async (client: PoolClient) => {
      const machineRes = await client.query<MachineRow>(
        `SELECT id, price_usd, is_available, cached_pnl_usd
           FROM gacha_machines
          WHERE id = $1
          FOR UPDATE`,
        [machineId],
      );
      if (!machineRes.rows.length) throw new Error(ResponseError.MACHINE_NOT_FOUND);
      const machine = machineRes.rows[0];
      if (!machine.is_available) throw new Error(ResponseError.MACHINE_NOT_AVAILABLE);
      const machinePnl = Number(machine.cached_pnl_usd);

      // Load every unconsumed card_stock row on the machine, joined to
      // cards for value/image. Forced drops can target disabled / locked
      // cards too, so we don't filter at SQL level — partition in memory.
      const stockRes = await client.query<{
        id: number;
        value_usd: string;
        image_url: string | null;
        is_disabled: boolean;
        release_pnl_threshold_usd: string | null;
      }>(
        `SELECT cs.id, c.value_usd, c.image_url,
                cs.is_disabled, cs.release_pnl_threshold_usd
           FROM card_stock cs
           JOIN cards c ON c.id = cs.card_id
          WHERE cs.machine_id = $1 AND cs.consumed_at IS NULL`,
        [machineId],
      );

      type RowData = {
        card_stock_id: number;
        value_usd: number;
        image_url: string | null;
        weighted_eligible: boolean;
      };
      const rowsById = new Map<number, RowData>();
      const eligibleIds: number[] = [];
      for (const r of stockRes.rows) {
        const threshold = r.release_pnl_threshold_usd != null
          ? Number(r.release_pnl_threshold_usd)
          : null;
        const pnlReleased = threshold == null || machinePnl >= threshold;
        const data: RowData = {
          card_stock_id: r.id,
          value_usd: Number(r.value_usd),
          image_url: r.image_url,
          weighted_eligible: !r.is_disabled && pnlReleased,
        };
        rowsById.set(r.id, data);
        if (data.weighted_eligible) eligibleIds.push(r.id);
      }

      const forcedRes = await client.query<{ id: number; card_stock_id: number }>(
        `SELECT id, card_stock_id
           FROM user_forced_drops
          WHERE user_id = $1 AND machine_id = $2 AND status = 'pending'
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED`,
        [userId, machineId],
      );

      const authoritativePrice = Number(machine.price_usd);
      const picks: PickedCard[] = [];
      const consumed = new Set<number>();
      const usedForcedDropIds: number[] = [];
      const unfulfillableForcedDropIds: number[] = [];
      let forcedIdx = 0;

      for (let i = 0; i < qty; i++) {
        let pickedFromForced = false;

        while (forcedIdx < forcedRes.rows.length) {
          const fd = forcedRes.rows[forcedIdx++];
          const r = rowsById.get(fd.card_stock_id);
          if (r && !consumed.has(fd.card_stock_id)) {
            consumed.add(fd.card_stock_id);
            picks.push({
              card_stock_id: fd.card_stock_id,
              value_usd: r.value_usd,
              image_url: r.image_url,
              source: "forced",
              forced_drop_id: fd.id,
            });
            usedForcedDropIds.push(fd.id);
            pickedFromForced = true;
            break;
          }
          // Target card is missing or already consumed in this batch.
          unfulfillableForcedDropIds.push(fd.id);
          console.warn("[gacha.bulkRoll] forced drop unfulfillable, falling through", {
            userId,
            machineId,
            forcedDropId: fd.id,
            cardStockId: fd.card_stock_id,
          });
        }
        if (pickedFromForced) continue;

        const remaining: number[] = [];
        for (const id of eligibleIds) {
          if (!consumed.has(id)) remaining.push(id);
        }
        if (remaining.length === 0) break;
        const pickedId = remaining[Math.floor(Math.random() * remaining.length)];
        consumed.add(pickedId);
        const r = rowsById.get(pickedId)!;
        picks.push({
          card_stock_id: pickedId,
          value_usd: r.value_usd,
          image_url: r.image_url,
          source: "paid",
          forced_drop_id: null,
        });
      }

      if (unfulfillableForcedDropIds.length) {
        await client.query(
          `UPDATE user_forced_drops
              SET status = 'unfulfillable', unfulfilled_at = NOW()
            WHERE id = ANY($1::int[])`,
          [unfulfillableForcedDropIds],
        );
      }

      if (picks.length === 0) throw new Error(ResponseError.NO_CARDS_AVAILABLE);

      const consumedIds = picks.map((p) => p.card_stock_id);
      const updRes = await client.query<{ id: number }>(
        `UPDATE card_stock
            SET consumed_at = NOW(), updated_at = NOW()
          WHERE id = ANY($1::int[]) AND consumed_at IS NULL
          RETURNING id`,
        [consumedIds],
      );
      if (updRes.rowCount !== consumedIds.length) {
        // Should be impossible under the machine FOR UPDATE lock.
        throw new Error(ResponseError.STOCK_CONTENTION);
      }

      return { machine, picks, usedForcedDropIds, authoritativePrice };
    });

    const { picks, usedForcedDropIds, authoritativePrice } = reservation;
    const fulfilledQty = picks.length;
    const chargedUsd = authoritativePrice * fulfilledQty;

    // ── Phase 3: on-chain payment ──────────────────────────────────────────
    let paymentSignature: string;
    try {
      paymentSignature = await chargeUserUsdc({
        privyWalletId: wallet.privy_wallet_id,
        fromAddress: wallet.address,
        amountUsd: chargedUsd,
      });
    } catch (err) {
      await unreserveCards(pool, picks.map((p) => p.card_stock_id)).catch((e) => {
        console.error("[gacha.bulkRoll] unreserve failed after charge failure", {
          userId,
          machineId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
      if (err instanceof Error && err.message === "INSUFFICIENT_USDC_BALANCE") {
        throw new Error(ResponseError.INSUFFICIENT_USDC);
      }
      throw err;
    }

    // ── Phase 4: persist rolls + PnL ───────────────────────────────────────
    try {
      const rolls = await runInTx(async (client: PoolClient) => {
        const placeholders: string[] = [];
        const values: unknown[] = [];
        let i = 1;
        for (const p of picks) {
          placeholders.push(
            `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, 'unhandled')`,
          );
          values.push(
            userId,
            machineId,
            p.card_stock_id,
            p.value_usd,
            p.image_url,
            authoritativePrice,
            paymentSignature,
            p.source,
          );
        }
        const inserted = await client.query<GachaRoll>(
          `INSERT INTO gacha_rolls (
              user_id, machine_id, card_stock_id, card_value_usd, card_image_url,
              usd_spent, payment_signature, source, status
            ) VALUES ${placeholders.join(",")}
            RETURNING *`,
          values,
        );

        // Link each consumed card to its roll (picks and inserted.rows share order).
        const cardIds = picks.map((p) => p.card_stock_id);
        const rollIds = inserted.rows.map((r) => r.id);
        await client.query(
          `UPDATE card_stock cs
              SET consumed_by_roll_id = m.roll_id, updated_at = NOW()
             FROM unnest($1::int[], $2::int[]) AS m(card_stock_id, roll_id)
            WHERE cs.id = m.card_stock_id`,
          [cardIds, rollIds],
        );

        const totalCardValue = picks.reduce((s, p) => s + p.value_usd, 0);
        await client.query(
          `UPDATE gacha_machines
              SET cached_pnl_usd = cached_pnl_usd + $2 - $3,
                  updated_at = NOW()
            WHERE id = $1`,
          [machineId, chargedUsd, totalCardValue],
        );

        if (usedForcedDropIds.length) {
          const fdToRollId: Array<[number, number]> = [];
          for (let k = 0; k < picks.length; k++) {
            const fdId = picks[k].forced_drop_id;
            if (fdId != null) fdToRollId.push([fdId, inserted.rows[k].id]);
          }
          const fdIds = fdToRollId.map(([fd]) => fd);
          const fdRollIds = fdToRollId.map(([, rid]) => rid);
          await client.query(
            `UPDATE user_forced_drops ufd
                SET status = 'claimed',
                    claimed_at = NOW(),
                    claimed_roll_id = m.roll_id
               FROM unnest($1::int[], $2::int[]) AS m(forced_drop_id, roll_id)
              WHERE ufd.id = m.forced_drop_id`,
            [fdIds, fdRollIds],
          );
        }

        // Points: one ledger row per roll, scaled off each row's usd_spent.
        // Free-pull paths (usd_spent = 0) are no-ops inside the service.
        const pointsService = new PointsService({ client });
        await pointsService.awardForRolls({
          userId,
          rolls: inserted.rows.map((r) => ({
            rollId: r.id,
            usdSpent: Number(r.usd_spent),
          })),
        });

        return inserted.rows.map((r) => new GachaRollModel(r));
      });

      for (const r of rolls) {
        if (r.source !== "paid") continue;
        void this.recordRecentWinIfQualifies(r, userId, r.card_stock_id).catch(
          (err) =>
            console.error("[gacha.bulkRoll] recent-win cache push failed", {
              error: err instanceof Error ? err.message : String(err),
            }),
        );
      }

      return {
        rolls,
        charged_usd: chargedUsd,
        requested_qty: qty,
        fulfilled_qty: fulfilledQty,
      };
    } catch (err) {
      console.error("[gacha.bulkRoll] payment landed but DB persist failed", {
        userId,
        machineId,
        signature: paymentSignature,
        chargedUsd,
        fulfilledQty,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * EV = mean value over every non-disabled, unconsumed card on the
   * machine. Locked cards (release_pnl_threshold_usd not yet crossed)
   * count too — EV is a stable "what's-on-the-machine" signal rather
   * than the strict expectation of the next pull.
   */
  public async computeEv(machineId: number): Promise<number> {
    const result = await this.query<{ ev: string | null }>(
      `SELECT
         CASE WHEN COUNT(*) = 0 THEN 0
              ELSE SUM(c.value_usd) / COUNT(*)
         END AS ev
        FROM card_stock cs
        JOIN cards c ON c.id = cs.card_id
       WHERE cs.machine_id = $1
         AND cs.consumed_at IS NULL
         AND cs.is_disabled = FALSE`,
      [machineId],
    );
    return Number(result.rows[0]?.ev ?? 0);
  }

  public async getMachine(machineId: number): Promise<GachaMachineModel | null> {
    const result = await this.query<GachaMachine>(
      `SELECT * FROM gacha_machines WHERE id = $1`,
      [machineId],
    );
    return result.rows.length ? new GachaMachineModel(result.rows[0]) : null;
  }

  public async listAvailableMachines(): Promise<GachaMachineModel[]> {
    const result = await this.query<GachaMachine>(
      `SELECT * FROM gacha_machines WHERE is_available = TRUE ORDER BY id ASC`,
    );
    return result.rows.map((r) => new GachaMachineModel(r));
  }

  public async listUserRolls(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ rolls: GachaRollModel[]; total: number }> {
    // Join through card_stock → cards to expose the live FMV (cards.value_usd,
    // refreshed daily by the pricecharting worker). The model also surfaces
    // sellback_price_usd derived from the pull-time snapshot card_value_usd.
    const [rolls, total] = await Promise.all([
      this.query<GachaRoll & { fmv_usd: string | null }>(
        `SELECT gr.*, c.value_usd AS fmv_usd
           FROM gacha_rolls gr
           LEFT JOIN card_stock cs ON cs.id = gr.card_stock_id
           LEFT JOIN cards c ON c.id = cs.card_id
          WHERE gr.user_id = $1
          ORDER BY gr.created_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
      this.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM gacha_rolls WHERE user_id = $1`,
        [userId],
      ),
    ]);
    return {
      rolls: rolls.rows.map((r) => new GachaRollModel(r)),
      total: Number(total.rows[0].count),
    };
  }

  /**
   * Sell a card back to treasury for SELLBACK_PAYOUT_FRACTION (90%) of the
   * pull-time card_value_usd. Only available within SELLBACK_WINDOW_MS
   * (1 hour) of the roll. Three phases:
   *   1. DB tx: atomically claim the roll (UPDATE … WHERE status='unhandled'
   *      AND created_at >= NOW() - 1h, RETURNING). Concurrent sellback
   *      attempts on the same roll fail here — only one wins.
   *   2. On-chain: treasury → user USDC transfer for sellback_amount_usd.
   *      On failure, revert the claim (status back to 'unhandled', sellback
   *      fields cleared) so the user can retry within the window.
   *   3. DB tx: record the payout signature.
   *
   * card_stock stays consumed — the physical card is with Verity but does
   * not auto-return to the machine's pickable pool. cached_pnl_usd is left
   * alone: it tracks the machine's release-gating signal (revenue in − card
   * value out at pull time), not Verity's overall P&L. Sellbacks are a
   * treasury-side refund and don't unlock/relock release-gated cards.
   */
  public async sellback(opts: {
    userId: string;
    rollId: number;
  }): Promise<GachaRollModel> {
    const { userId, rollId } = opts;
    if (!this.pool) throw new Error("GachaRollService requires a pool for sellback()");
    const pool = this.pool;

    // ── Phase 1: atomic claim ─────────────────────────────────────────────
    // Single UPDATE prevents the double-sellback race: if two requests land
    // at once, the second one sees status='sold_back' and the WHERE clause
    // returns 0 rows.
    const cutoffMs = Date.now() - SELLBACK_WINDOW_MS;
    const claimRes = await pool.query<GachaRoll>(
      `UPDATE gacha_rolls
          SET status = 'sold_back',
              status_changed_at = NOW(),
              sold_back_at = NOW(),
              sellback_amount_usd = ROUND(card_value_usd * $4, 2)
        WHERE id = $1
          AND user_id = $2
          AND status = 'unhandled'
          AND created_at >= to_timestamp($3 / 1000.0)
        RETURNING *`,
      [rollId, userId, cutoffMs, SELLBACK_PAYOUT_FRACTION],
    );
    if (!claimRes.rows.length) {
      // Distinguish the failure: row missing? already sold? expired?
      const probe = await pool.query<{ status: string; created_at: Date }>(
        `SELECT status, created_at FROM gacha_rolls
          WHERE id = $1 AND user_id = $2`,
        [rollId, userId],
      );
      if (!probe.rows.length) throw new Error(ResponseError.ROLL_NOT_FOUND);
      if (probe.rows[0].status === "sold_back") {
        throw new Error(ResponseError.ROLL_ALREADY_SOLD_BACK);
      }
      throw new Error(ResponseError.SELLBACK_WINDOW_EXPIRED);
    }
    const claimed = claimRes.rows[0];
    const sellbackAmount = Number(claimed.sellback_amount_usd);

    // ── Phase 2: on-chain payout ──────────────────────────────────────────
    const wallet = await this.fetchWallet(pool, userId);
    let payoutSignature: string;
    try {
      payoutSignature = await treasurySendUsdc({
        toAddress: wallet.address,
        amountUsd: sellbackAmount,
      });
    } catch (err) {
      // Revert the claim so the user can retry within the window.
      await pool
        .query(
          `UPDATE gacha_rolls
              SET status = 'unhandled',
                  status_changed_at = NULL,
                  sold_back_at = NULL,
                  sellback_amount_usd = NULL
            WHERE id = $1`,
          [rollId],
        )
        .catch((e) =>
          console.error("[gacha.sellback] revert failed after payout failure", {
            userId,
            rollId,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      throw err;
    }

    // ── Phase 3: persist signature ─────────────────────────────────────────
    // card_stock stays consumed; cached_pnl_usd is left alone (sellback is
    // a treasury refund, not part of the machine's release-gating signal).
    try {
      const finalRoll = await pool.query<GachaRoll>(
        `UPDATE gacha_rolls
            SET sellback_payout_signature = $2
          WHERE id = $1
          RETURNING *`,
        [rollId, payoutSignature],
      );
      return new GachaRollModel(finalRoll.rows[0]);
    } catch (err) {
      // Payout landed but DB persist failed — orphan-payout case. Log
      // signature for manual reconciliation; the gacha_rolls row is in a
      // half-state (status=sold_back, no signature recorded).
      console.error("[gacha.sellback] payout landed but DB persist failed", {
        userId,
        rollId,
        signature: payoutSignature,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /** Looks up card name + user profile, pushes a public ticker win if it qualifies. */
  private async recordRecentWinIfQualifies(
    roll: GachaRollModel,
    userId: string,
    cardStockId: number,
  ): Promise<void> {
    if (Number(roll.usd_spent) <= 0) return; // forced drops, free pulls
    const result = await this.query<{
      card_name: string;
      user_name: string | null;
      user_image: string | null;
    }>(
      `SELECT c.name AS card_name, u.name AS user_name, u.image AS user_image
         FROM card_stock cs
         JOIN cards c ON c.id = cs.card_id,
              "user" u
        WHERE cs.id = $1 AND u.id = $2`,
      [cardStockId, userId],
    );
    const row = result.rows[0];
    if (!row) return;
    pushRecentWinIfQualifies({
      card_name: row.card_name,
      card_image_url: roll.card_image_url,
      card_value_usd: Number(roll.card_value_usd),
      pull_price_usd: Number(roll.usd_spent),
      user_name: row.user_name,
      user_image: row.user_image,
    });
  }

  /** Reads on-chain USDC balance via Solana RPC. */
  public async getUserUsdcBalance(userId: string): Promise<number> {
    const result = await this.query<{ address: string }>(
      `SELECT address FROM user_wallets WHERE user_id = $1`,
      [userId],
    );
    if (!result.rows.length) return 0;
    return getUsdcBalance(result.rows[0].address);
  }

  private async fetchMachinePrice(pool: Pool, machineId: number): Promise<number> {
    const res = await pool.query<{ price_usd: string; is_available: boolean }>(
      `SELECT price_usd, is_available FROM gacha_machines WHERE id = $1`,
      [machineId],
    );
    if (!res.rows.length) throw new Error(ResponseError.MACHINE_NOT_FOUND);
    if (!res.rows[0].is_available) throw new Error(ResponseError.MACHINE_NOT_AVAILABLE);
    return Number(res.rows[0].price_usd);
  }

  private async fetchWallet(
    pool: Pool,
    userId: string,
  ): Promise<{ privy_wallet_id: string; address: string }> {
    const res = await pool.query<{ privy_wallet_id: string | null; address: string }>(
      `SELECT privy_wallet_id, address FROM user_wallets WHERE user_id = $1`,
      [userId],
    );
    if (!res.rows.length) throw new Error(ResponseError.WALLET_NOT_FOUND);
    const wallet = res.rows[0];
    if (!wallet.privy_wallet_id) throw new Error(ResponseError.WALLET_NOT_FOUND);
    return { privy_wallet_id: wallet.privy_wallet_id, address: wallet.address };
  }
}

interface MachineRow {
  id: number;
  price_usd: string;
  is_available: boolean;
  cached_pnl_usd: string;
}

interface ReservedCard {
  card_stock_id: number;
  value_usd: number;
  image_url: string | null;
}

/**
 * Mark the given card_stock row consumed and return its data. Used for
 * forced drops — the threshold and is_disabled filters are intentionally
 * NOT applied so admin can force any card the machine carries. The
 * machineId guard ensures the forced drop's card actually lives on the
 * targeted machine.
 */
async function reserveCard(
  client: PoolClient,
  cardStockId: number,
  machineId: number,
): Promise<ReservedCard | null> {
  const res = await client.query<{ id: number; value_usd: string; image_url: string | null }>(
    `UPDATE card_stock cs
        SET consumed_at = NOW(), updated_at = NOW()
       FROM cards c
      WHERE cs.id = $1
        AND cs.machine_id = $2
        AND cs.consumed_at IS NULL
        AND c.id = cs.card_id
     RETURNING cs.id, c.value_usd, c.image_url`,
    [cardStockId, machineId],
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    card_stock_id: r.id,
    value_usd: Number(r.value_usd),
    image_url: r.image_url,
  };
}

/**
 * Pick a uniformly random unconsumed, non-disabled, threshold-satisfied
 * card_stock row on the machine and mark it consumed atomically. Returns
 * null when nothing is in the pickable pool. Each row = 1 physical card,
 * so uniform-over-rows means weighted by how many copies of each card
 * the machine carries.
 */
async function reserveWeighted(
  client: PoolClient,
  machineId: number,
  cachedPnlUsd: number,
): Promise<ReservedCard | null> {
  const res = await client.query<{ id: number; value_usd: string; image_url: string | null }>(
    `UPDATE card_stock cs
        SET consumed_at = NOW(), updated_at = NOW()
       FROM cards c
      WHERE cs.id = (
        SELECT id FROM card_stock
         WHERE machine_id = $1
           AND consumed_at IS NULL
           AND is_disabled = FALSE
           AND (release_pnl_threshold_usd IS NULL
                OR release_pnl_threshold_usd <= $2)
         ORDER BY random()
         LIMIT 1
      )
        AND c.id = cs.card_id
     RETURNING cs.id, c.value_usd, c.image_url`,
    [machineId, cachedPnlUsd],
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    card_stock_id: r.id,
    value_usd: Number(r.value_usd),
    image_url: r.image_url,
  };
}

/** Undo reservations by clearing consumed_at. Used on payment failure. */
async function unreserveCards(pool: Pool, cardStockIds: number[]): Promise<void> {
  if (!cardStockIds.length) return;
  await pool.query(
    `UPDATE card_stock
        SET consumed_at = NULL, updated_at = NOW()
      WHERE id = ANY($1::int[])`,
    [cardStockIds],
  );
}
