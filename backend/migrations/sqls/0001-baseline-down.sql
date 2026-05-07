-- Tear down everything created by the baseline. Order matters — drop FKs
-- before targets via CASCADE.
DROP TABLE IF EXISTS pricecharting_csv          CASCADE;
DROP TABLE IF EXISTS popup_message_dismissals   CASCADE;
DROP TABLE IF EXISTS popup_message_targets      CASCADE;
DROP TABLE IF EXISTS popup_messages             CASCADE;
DROP TABLE IF EXISTS banners                    CASCADE;
DROP TABLE IF EXISTS app_settings               CASCADE;
DROP TABLE IF EXISTS waitlist_entries           CASCADE;
DROP TABLE IF EXISTS referrals                  CASCADE;
DROP TABLE IF EXISTS user_forced_drops          CASCADE;
DROP TABLE IF EXISTS gacha_rolls                CASCADE;
DROP TABLE IF EXISTS gacha_machines             CASCADE;
DROP TABLE IF EXISTS card_stock                 CASCADE;
DROP TABLE IF EXISTS cards                      CASCADE;
DROP TABLE IF EXISTS user_device_ip_log         CASCADE;
DROP TABLE IF EXISTS user_daily_activity        CASCADE;
DROP TABLE IF EXISTS user_wallets               CASCADE;
DROP TABLE IF EXISTS user_auth_accounts         CASCADE;
DROP TABLE IF EXISTS "user"                     CASCADE;
