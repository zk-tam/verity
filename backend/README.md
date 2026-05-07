# Verity Backend

Verity Backend powers the API layer for Verity, a Solana-based Pokemon TCG gacha app. It owns the server-side game state, Privy user sync, waitlist persistence, wallet metadata, gacha rolls, inventory, and operational jobs behind the web experience.

## Current Stage

Verity is currently in **waitlist stage**.

The live product focuses on onboarding users before the full gacha launch. Users connect through Privy with email, Google, X, or wallet login, then the backend persists their Verity user record and waitlist entry without relying on Supabase native auth.

## Product Surface

The backend is designed for the full gacha flow:

- Privy-authenticated user and wallet sync.
- Waitlist entry creation and lookup.
- Gacha machine, card stock, roll, sellback, and recent win APIs.
- Points and referral accounting for paid pulls.
- Admin routes for inventory, banners, machines, and app settings.

During waitlist stage, the waitlist and auth endpoints are the public conversion path while the gacha APIs remain the foundation for launch.

## Integrations

Verity Backend integrates with Postgres, Privy, Supabase Storage, Solana RPC, Graphile Worker, Telegram alerts, and PriceCharting when the corresponding environment variables are configured.

Secrets and environment files are intentionally not tracked. Start from `.env.example` when configuring a local or deployed environment.

## App

This is an Express + TypeScript service backed by PostgreSQL migrations through `db-migrate`.
