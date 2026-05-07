CREATE TABLE IF NOT EXISTS waitlist_entries (
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

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_email_uidx
  ON waitlist_entries (LOWER(email)) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_x_handle_uidx
  ON waitlist_entries (LOWER(x_handle)) WHERE x_handle IS NOT NULL;
