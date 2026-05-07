-- ============================================================================
-- Verity backend — fresh baseline.
--
-- Currency: all amounts are denominated in USDC (1 USDC = 1 USD).
-- Auth: Privy access tokens; linked email/social/wallet identities are mirrored
--       into Postgres so app users are owned by Verity, not Supabase Auth.
-- Gacha: per-machine card stock — each card_stock row is one physical card on
--        one machine. Pulls pick a uniformly random unconsumed row and flip
--        its consumed_at flag. Admin can force a specific card via
--        user_forced_drops; per-card release_pnl_threshold_usd gates entry
--        into the pickable pool until the machine's cached_pnl_usd crosses it.
-- ============================================================================

-- ── 1. USERS ────────────────────────────────────────────────────────────────
CREATE TABLE "user" (
  id                    TEXT PRIMARY KEY,
  privy_did             TEXT UNIQUE,
  name                  TEXT,
  email                 TEXT UNIQUE,
  x_handle              TEXT,
  image                 TEXT,
  role                  TEXT,
  is_internal_account   BOOLEAN NOT NULL DEFAULT FALSE,
  banned                BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason            TEXT,
  email_verified_at     TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_role_idx ON "user" (role) WHERE role IS NOT NULL;

-- ── 2. PRIVY-LINKED AUTH ACCOUNTS + SOLANA WALLETS ────────────────────────
CREATE TABLE user_auth_accounts (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  provider_user_id    TEXT NOT NULL,
  email               TEXT,
  username            TEXT,
  name                TEXT,
  image               TEXT,
  address             TEXT,
  chain_type          TEXT,
  wallet_client       TEXT,
  wallet_client_type  TEXT,
  connector_type      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX user_auth_accounts_user_idx ON user_auth_accounts (user_id);

CREATE TABLE user_wallets (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  privy_wallet_id     TEXT UNIQUE,
  address             TEXT NOT NULL UNIQUE,
  chain_type          TEXT NOT NULL DEFAULT 'solana',
  wallet_client       TEXT,
  wallet_client_type  TEXT,
  connector_type      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. ACTIVITY / ANTI-ABUSE ────────────────────────────────────────────────
CREATE TABLE user_daily_activity (
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, activity_date)
);
CREATE INDEX user_daily_activity_date_idx ON user_daily_activity (activity_date);

CREATE TABLE user_device_ip_log (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  ip            TEXT,
  device_id     TEXT,
  threat_score  INTEGER,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_device_ip_log_unique UNIQUE NULLS NOT DISTINCT (user_id, ip, device_id)
);
CREATE INDEX user_device_ip_log_user_idx ON user_device_ip_log (user_id);
CREATE INDEX user_device_ip_log_device_idx ON user_device_ip_log (device_id) WHERE device_id IS NOT NULL;
CREATE INDEX user_device_ip_log_ip_idx ON user_device_ip_log (ip) WHERE ip IS NOT NULL;

-- ── 4. GACHA MACHINES ───────────────────────────────────────────────────────
-- cached_pnl_usd is a single per-machine counter (revenue in − card values
-- out). It feeds the per-card release threshold check below. Resetting it
-- to 0 re-locks every threshold-gated card.
CREATE TABLE gacha_machines (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  image_url       TEXT,
  price_usd       NUMERIC(12,2) NOT NULL CHECK (price_usd > 0),
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  cached_pnl_usd  NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. CARDS (global catalog; the site-wide source of card metadata) ───────
-- One row per unique card identity. Deduped at upload time by pricecharting_id
-- when present. The pricecharting refresh worker writes value_usd here so a
-- single price update propagates to every machine's stock in one place.
--
-- cards.id IS the verity_id — admin/UI presents it as the per-card-type
-- identifier. card_stock rows reference cards.id, so each physical instance
-- shares its card's verity_id (with cert_id distinguishing graded slabs).
CREATE TABLE cards (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  value_usd           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (value_usd >= 0),
  image_url           TEXT,
  entity              TEXT,
  grade               NUMERIC(3,1),
  type                TEXT NOT NULL DEFAULT 'card' CHECK (type IN ('card', 'item')),
  pricecharting_id    TEXT,
  tcgplayer_id        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Pricecharting_id is the dedupe key for upserts. Null pricecharting_id rows
-- aren't deduped (each upload creates a new card row).
CREATE UNIQUE INDEX cards_pricecharting_id_uidx
  ON cards (pricecharting_id) WHERE pricecharting_id IS NOT NULL;
CREATE INDEX cards_tcgplayer_idx
  ON cards (tcgplayer_id) WHERE tcgplayer_id IS NOT NULL;
CREATE INDEX cards_value_idx ON cards (value_usd);

-- ── 6. CARD STOCK (per-machine physical instances) ──────────────────────────
-- One row = one physical card on one machine. Always 1 qty per row — never
-- squashed, even when cert_id is NULL on multiple rows of the same card_id.
-- Machine A and machine B's stock are fully isolated. Card metadata
-- (name/value/image/etc.) is read off cards via card_id; admin reprices by
-- updating cards.value_usd and every machine sees it.
--
-- consumed_at is the "gone" flag (NULL = available, NOT NULL = awarded).
-- Rows are kept after consumption for audit + roll traceability.
--
-- release_pnl_threshold_usd: NULL = always pickable (subject to is_disabled
-- and consumed_at). Otherwise the row joins the weighted pool only when
-- the machine's cached_pnl_usd >= this threshold. Forced drops bypass
-- both the threshold check and is_disabled.
CREATE TABLE card_stock (
  id                          SERIAL PRIMARY KEY,
  card_id                     INTEGER NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  machine_id                  INTEGER NOT NULL REFERENCES gacha_machines(id) ON DELETE CASCADE,
  -- cert_id may be NULL for raw cards; UNIQUE (when set) catches duplicate
  -- slabs, which would be a data error.
  cert_id                     TEXT,
  is_disabled                 BOOLEAN NOT NULL DEFAULT FALSE,
  release_pnl_threshold_usd   NUMERIC(14,2)
    CHECK (release_pnl_threshold_usd IS NULL OR release_pnl_threshold_usd >= 0),
  consumed_at                 TIMESTAMPTZ,
  consumed_by_roll_id         INTEGER, -- FK added below (gacha_rolls created later)
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX card_stock_machine_idx ON card_stock (machine_id);
CREATE INDEX card_stock_card_idx    ON card_stock (card_id);
CREATE UNIQUE INDEX card_stock_cert_id_uidx ON card_stock (cert_id) WHERE cert_id IS NOT NULL;
-- Hot path: pick a random pickable row on machine X.
CREATE INDEX card_stock_pickable_idx ON card_stock (machine_id)
  WHERE consumed_at IS NULL AND is_disabled = FALSE;

-- ── 6. GACHA ROLLS ──────────────────────────────────────────────────────────
-- payment_signature is the Solana tx signature for the USDC transfer from
-- the user's Privy wallet → app treasury. UNIQUE provides idempotency: a
-- retry with the same signature collapses rather than double-rolls.
CREATE TABLE gacha_rolls (
  id                  SERIAL PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  machine_id          INTEGER NOT NULL REFERENCES gacha_machines(id) ON DELETE RESTRICT,
  card_stock_id       INTEGER NOT NULL REFERENCES card_stock(id) ON DELETE RESTRICT,
  card_value_usd      NUMERIC(12,2) NOT NULL,
  card_image_url      TEXT,
  usd_spent           NUMERIC(12,2) NOT NULL CHECK (usd_spent >= 0),
  payment_signature           TEXT UNIQUE,
  source                      TEXT NOT NULL DEFAULT 'paid' CHECK (source IN ('paid', 'forced')),
  -- Sellback lifecycle. 'unhandled' = user owns it; 'sold_back' = user
  -- exercised the 1-hour sellback window and treasury paid them sellback_amount_usd.
  status                      TEXT NOT NULL DEFAULT 'unhandled'
                              CHECK (status IN ('unhandled', 'sold_back')),
  status_changed_at           TIMESTAMPTZ,
  -- Sellback metadata. NULL until the user sells the card back to treasury.
  -- sellback_amount_usd is captured at sellback time (= ROUND(card_value_usd * 0.9, 2)).
  -- sellback_payout_signature is the Solana tx for the treasury → user USDC
  -- transfer; UNIQUE provides idempotency across retries.
  sold_back_at                TIMESTAMPTZ,
  sellback_amount_usd         NUMERIC(12,2)
    CHECK (sellback_amount_usd IS NULL OR sellback_amount_usd >= 0),
  sellback_payout_signature   TEXT UNIQUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX gacha_rolls_user_idx ON gacha_rolls (user_id, created_at DESC);
CREATE INDEX gacha_rolls_machine_idx ON gacha_rolls (machine_id, created_at DESC);

-- Now that gacha_rolls exists, wire up the card_stock → roll FK.
ALTER TABLE card_stock
  ADD CONSTRAINT card_stock_consumed_by_roll_fk
    FOREIGN KEY (consumed_by_roll_id) REFERENCES gacha_rolls(id) ON DELETE SET NULL;

-- ── 7. ADMIN-FORCED DROPS ───────────────────────────────────────────────────
-- Admin pushes a row; the user's next pull on that machine pops the oldest
-- pending row and forces that card_stock_id (skips the weighted pick and
-- bypasses is_disabled / threshold). If the target card has no available
-- copies on the machine the drop is marked 'unfulfillable' and the roll
-- falls through to a normal pick — unfulfillable drops are not retried.
CREATE TABLE user_forced_drops (
  id              BIGSERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  machine_id      INTEGER NOT NULL REFERENCES gacha_machines(id) ON DELETE CASCADE,
  card_stock_id   INTEGER NOT NULL REFERENCES card_stock(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'claimed', 'unfulfillable')),
  created_by      TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at      TIMESTAMPTZ,
  claimed_roll_id INTEGER REFERENCES gacha_rolls(id) ON DELETE SET NULL,
  unfulfilled_at  TIMESTAMPTZ
);
CREATE INDEX user_forced_drops_pending_idx
  ON user_forced_drops (user_id, machine_id, created_at)
  WHERE status = 'pending';

-- ── 9. REFERRALS (link store only — no commission engine) ───────────────────
CREATE TABLE referrals (
  user_id       TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  referred_by   TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX referrals_referred_by_idx ON referrals (referred_by) WHERE referred_by IS NOT NULL;

-- ── 10. WAITLIST ────────────────────────────────────────────────────────────
CREATE TABLE waitlist_entries (
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT UNIQUE REFERENCES "user"(id) ON DELETE SET NULL,
  privy_did      TEXT UNIQUE,
  email          TEXT,
  x_handle       TEXT,
  solana_address TEXT,
  source         TEXT NOT NULL DEFAULT 'privy',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX waitlist_entries_email_uidx
  ON waitlist_entries (LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX waitlist_entries_x_handle_uidx
  ON waitlist_entries (LOWER(x_handle)) WHERE x_handle IS NOT NULL;

-- ── 11. APP SETTINGS (k/v) ──────────────────────────────────────────────────
CREATE TABLE app_settings (
  id            SERIAL PRIMARY KEY,
  setting_key   VARCHAR(255) NOT NULL UNIQUE,
  setting_value VARCHAR(255) NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 12. BANNERS ─────────────────────────────────────────────────────────────
CREATE TABLE banners (
  id            SERIAL PRIMARY KEY,
  filename      TEXT NOT NULL UNIQUE,
  redirect_url  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 13. POPUP MESSAGES ──────────────────────────────────────────────────────
CREATE TABLE popup_messages (
  id                SERIAL PRIMARY KEY,
  title             TEXT,
  body              TEXT NOT NULL,
  target_all_users  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  created_by        TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX popup_messages_active_idx ON popup_messages (is_active, starts_at, ends_at);

CREATE TABLE popup_message_targets (
  popup_message_id INTEGER NOT NULL REFERENCES popup_messages(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  PRIMARY KEY (popup_message_id, user_id)
);
CREATE INDEX popup_message_targets_user_idx ON popup_message_targets (user_id);

CREATE TABLE popup_message_dismissals (
  popup_message_id INTEGER NOT NULL REFERENCES popup_messages(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  dismissed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (popup_message_id, user_id)
);
CREATE INDEX popup_message_dismissals_user_idx ON popup_message_dismissals (user_id);

-- ── 14. PRICECHARTING IMPORT (raw CSV cache) ────────────────────────────────
CREATE TABLE pricecharting_csv (
  pc_id               TEXT PRIMARY KEY,
  loose_price         TEXT NOT NULL DEFAULT '',
  cib_price           TEXT NOT NULL DEFAULT '',
  new_price           TEXT NOT NULL DEFAULT '',
  graded_price        TEXT NOT NULL DEFAULT '',
  bgs_10_price        TEXT NOT NULL DEFAULT '',
  condition_17_price  TEXT NOT NULL DEFAULT '',
  condition_18_price  TEXT NOT NULL DEFAULT '',
  manual_only_price   TEXT NOT NULL DEFAULT ''
);
