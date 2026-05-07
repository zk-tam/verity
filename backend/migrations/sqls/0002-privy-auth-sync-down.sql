DROP INDEX IF EXISTS user_auth_accounts_user_idx;
DROP TABLE IF EXISTS user_auth_accounts;

DELETE FROM user_wallets WHERE privy_wallet_id IS NULL;

ALTER TABLE user_wallets
  ALTER COLUMN privy_wallet_id SET NOT NULL,
  DROP COLUMN IF EXISTS wallet_client,
  DROP COLUMN IF EXISTS wallet_client_type,
  DROP COLUMN IF EXISTS connector_type,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE "user"
  DROP COLUMN IF EXISTS x_handle,
  DROP COLUMN IF EXISTS email_verified_at,
  DROP COLUMN IF EXISTS last_login_at;
