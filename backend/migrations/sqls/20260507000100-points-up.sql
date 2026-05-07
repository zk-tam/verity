-- Player + referral points. Awarded on every paid gacha pull:
--   player    gets price_usd / POINTS_PLAY_DIVISOR
--   referrer  gets price_usd / POINTS_PLAY_DIVISOR / POINTS_REFERRAL_DIVISOR
-- Forced drops (usd_spent = 0) award no points.

CREATE TABLE IF NOT EXISTS user_points (
  user_id      TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  total_points NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leaderboard hot path: ORDER BY total_points DESC.
CREATE INDEX IF NOT EXISTS user_points_total_idx
  ON user_points (total_points DESC);

-- Append-only audit trail. One row per award; lets us reconstruct totals
-- and trace any leaderboard entry back to the rolls that produced it.
CREATE TABLE IF NOT EXISTS user_points_ledger (
  id              BIGSERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  points          NUMERIC(18,4) NOT NULL CHECK (points >= 0),
  source          TEXT NOT NULL CHECK (source IN ('gacha_play', 'gacha_referral')),
  -- The roll that triggered the award. For 'gacha_referral' source, the
  -- ledger row's user_id is the referrer and source_referee_id is the
  -- player whose roll produced the points.
  source_roll_id     INTEGER REFERENCES gacha_rolls(id) ON DELETE CASCADE,
  source_referee_id  TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_points_ledger_user_idx
  ON user_points_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_points_ledger_roll_idx
  ON user_points_ledger (source_roll_id) WHERE source_roll_id IS NOT NULL;
