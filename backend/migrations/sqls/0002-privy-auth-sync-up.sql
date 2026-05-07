ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS x_handle TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_auth_accounts (
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

CREATE INDEX IF NOT EXISTS user_auth_accounts_user_idx
  ON user_auth_accounts (user_id);

ALTER TABLE user_wallets
  ALTER COLUMN privy_wallet_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS wallet_client TEXT,
  ADD COLUMN IF NOT EXISTS wallet_client_type TEXT,
  ADD COLUMN IF NOT EXISTS connector_type TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
