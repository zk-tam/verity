import { Pool, PoolClient } from "pg";
import { BaseService } from "./base";
import { LeaderboardEntry, UserPoints } from "../models/points";

/**
 * Divisor applied to a roll's price_usd to compute the player's award.
 * priceUsd / POINTS_PLAY_DIVISOR  →  points credited to the user who rolled.
 */
export const POINTS_PLAY_DIVISOR = 5;

/**
 * Second divisor applied on top of the play divisor for the referrer's cut.
 * priceUsd / POINTS_PLAY_DIVISOR / POINTS_REFERRAL_DIVISOR
 *  →  points credited to the user that referred the player.
 * No-op when the player has no referrer.
 */
export const POINTS_REFERRAL_DIVISOR = 5;

interface AwardArgs {
  /** Roll id this award is attributable to (FK into gacha_rolls). */
  rollId: number;
  /** USD spent on this single pull (machines.price_usd). */
  usdSpent: number;
  /** Player who rolled. */
  userId: string;
}

/**
 * Points + leaderboard. Awards happen inside the gacha-roll transaction so
 * a successful pull and its points are committed atomically (no partial
 * state where a roll is recorded but the user's points are missing). For
 * that to work the service is constructed with the same PoolClient as the
 * tx and uses upsert into user_points + an append to user_points_ledger.
 *
 * Forced drops (usd_spent = 0) award nothing — there's no spend to scale
 * off. Referral points only fire when the player's referrals.referred_by
 * is set, and they're computed off the same priceUsd, not off the player's
 * award (so changing one divisor doesn't compound into the other).
 */
export class PointsService extends BaseService {
  constructor({ pool, client }: { pool?: Pool; client?: PoolClient }) {
    super({ pool, client });
  }

  /**
   * Credit one player + (optionally) their referrer for one roll. Safe to
   * call inside the gacha tx — uses the service's bound client. Idempotent
   * at the ledger level only by virtue of the parent tx rolling back; this
   * method itself does not de-dupe by rollId.
   */
  public async awardForRoll(args: AwardArgs): Promise<void> {
    const { rollId, usdSpent, userId } = args;
    if (usdSpent <= 0) return;

    const playerPoints = usdSpent / POINTS_PLAY_DIVISOR;
    await this.creditUser({
      userId,
      points: playerPoints,
      source: "gacha_play",
      sourceRollId: rollId,
      sourceRefereeId: null,
    });

    // Referrer cut. Look up the player's referrals row; if referred_by is
    // null there's no payout. Self-referral is impossible because
    // referrals.setReferredBy refuses to write user_id == referrer_id at
    // the route layer.
    const referrerRes = await this.query<{ referred_by: string | null }>(
      `SELECT referred_by FROM referrals WHERE user_id = $1`,
      [userId],
    );
    const referrerId = referrerRes.rows[0]?.referred_by ?? null;
    if (!referrerId) return;

    const referrerPoints =
      usdSpent / POINTS_PLAY_DIVISOR / POINTS_REFERRAL_DIVISOR;
    await this.creditUser({
      userId: referrerId,
      points: referrerPoints,
      source: "gacha_referral",
      sourceRollId: rollId,
      sourceRefereeId: userId,
    });
  }

  /**
   * Convenience for bulk pulls: one call per consumed roll. Splits so the
   * ledger has one row per roll (matches the single-pull case for analytics
   * and lets a sellback-style reversal hook in cleanly later if needed).
   */
  public async awardForRolls(
    args: { userId: string; rolls: Array<{ rollId: number; usdSpent: number }> },
  ): Promise<void> {
    for (const r of args.rolls) {
      await this.awardForRoll({
        rollId: r.rollId,
        usdSpent: r.usdSpent,
        userId: args.userId,
      });
    }
  }

  private async creditUser(opts: {
    userId: string;
    points: number;
    source: "gacha_play" | "gacha_referral";
    sourceRollId: number | null;
    sourceRefereeId: string | null;
  }): Promise<void> {
    if (opts.points <= 0) return;
    await this.query(
      `INSERT INTO user_points (user_id, total_points, updated_at)
         VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET total_points = user_points.total_points + EXCLUDED.total_points,
             updated_at   = NOW()`,
      [opts.userId, opts.points],
    );
    await this.query(
      `INSERT INTO user_points_ledger
         (user_id, points, source, source_roll_id, source_referee_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        opts.userId,
        opts.points,
        opts.source,
        opts.sourceRollId,
        opts.sourceRefereeId,
      ],
    );
  }

  public async getUserPoints(userId: string): Promise<UserPoints> {
    const res = await this.query<{ total_points: string; updated_at: Date }>(
      `SELECT total_points, updated_at FROM user_points WHERE user_id = $1`,
      [userId],
    );
    if (!res.rows.length) {
      return { user_id: userId, total_points: 0, updated_at: new Date(0) };
    }
    return {
      user_id: userId,
      total_points: Number(res.rows[0].total_points),
      updated_at: new Date(res.rows[0].updated_at),
    };
  }

  /**
   * Top-N by total_points. Excludes banned + internal accounts so the
   * public leaderboard reflects organic players only. Rank is dense over
   * the returned page (offset + 1, offset + 2, …); a tie-aware DENSE_RANK
   * isn't applied because totals are NUMERIC(18,4) and exact ties are rare.
   */
  public async getLeaderboard(
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ entries: LeaderboardEntry[]; total: number }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.query<{
        user_id: string;
        name: string | null;
        image: string | null;
        total_points: string;
      }>(
        `SELECT up.user_id, u.name, u.image, up.total_points
           FROM user_points up
           JOIN "user" u ON u.id = up.user_id
          WHERE u.banned = FALSE
            AND u.is_internal_account = FALSE
            AND up.total_points > 0
          ORDER BY up.total_points DESC, u."createdAt" ASC
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      this.query<{ count: string }>(
        `SELECT COUNT(*) AS count
           FROM user_points up
           JOIN "user" u ON u.id = up.user_id
          WHERE u.banned = FALSE
            AND u.is_internal_account = FALSE
            AND up.total_points > 0`,
      ),
    ]);

    return {
      entries: rows.rows.map((r, i) => ({
        rank: offset + i + 1,
        user_id: r.user_id,
        name: r.name,
        image: r.image,
        total_points: Number(r.total_points),
      })),
      total: Number(total.rows[0]?.count ?? 0),
    };
  }
}
