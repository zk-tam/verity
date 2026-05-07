# Verity

Verity is a Solana-based Pokemon TCG gacha app. It is built around opening on-chain card packs, chasing premium TCG pulls, and turning digital ownership into a game-like collecting experience.

## Current Stage

Verity is currently in **waitlist stage**.

The public app focuses on onboarding users before the full gacha launch. Users can connect with Privy through email, Google, X, or wallet login, then reserve their launch spot on the waitlist.

## Monorepo

This repository contains the public Verity web and backend apps:

- `web`: the Next.js frontend for the waitlist and gacha experience.
- `backend`: the Express + TypeScript API for Privy auth sync, waitlist persistence, user data, gacha state, inventory, and operational jobs.

## Web

The web app presents the Verity landing and waitlist flow, connects users through Privy, and routes server-side API calls to the backend.

Frontend media is served from the Verity Supabase Storage assets bucket. Large videos, audio, images, and gacha animations are intentionally not tracked in this repository.

## Backend

The backend owns the server-side product state:

- Privy-authenticated user and wallet sync.
- Waitlist entry creation and lookup.
- Gacha machine, card stock, roll, sellback, and recent win APIs.
- Points and referral accounting for paid pulls.
- Admin routes for inventory, banners, machines, and app settings.

During waitlist stage, the waitlist and auth endpoints are the public conversion path while the gacha APIs remain the foundation for launch.

## Configuration

Secrets and environment files are intentionally not tracked. Start from each app's `.env.example` when configuring local or deployed environments:

- `web/.env.example`
- `backend/.env.example`
