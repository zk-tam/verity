# Verity

Verity is a Solana-based Pokemon TCG gacha app. It is built around opening on-chain card packs, chasing premium TCG pulls, and turning digital ownership into a game-like collecting experience.

## Current Stage

Verity is currently in **waitlist stage**.

The live app focuses on onboarding users before the full gacha launch. Users can connect with Privy through email, Google, X, or wallet login, then reserve their launch spot on the waitlist.

## Game Experience

The core product is a Pokemon TCG gacha flow:

- Browse available gacha machines.
- View chase cards, odds tiers, and pack pricing.
- Open packs through a cinematic roll experience.
- Receive card results and supported wallet/account state through the app.

During waitlist stage, the gacha experience is present as the product direction, while public conversion is centered on joining the waitlist.

## Assets

Frontend media is served from the Verity Supabase Storage assets bucket. Large videos, audio, images, and gacha animations are intentionally not tracked in this repository.

The app expects `NEXT_PUBLIC_STORAGE_BASE_URL` to point at the public storage base URL.

## App

This is a Next.js app using Privy for wallet/auth onboarding and Next API routes as a server-side proxy to the Verity backend.
