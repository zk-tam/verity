import { randomUUID } from "crypto";

export interface RecentWin {
  card_name: string;
  card_image_url: string | null;
  card_value_usd: number;
  pull_price_usd: number;
  multiplier: number; // card_value_usd / pull_price_usd, captured at win time
  user_name: string | null;
  user_image: string | null;
  time: string; // ISO timestamp
}

interface RecentWinWithId extends RecentWin {
  win_id: string;
}

// Threshold: a "win" is a roll where the card is worth more than 1.5× the
// pull price. Forced drops (admin-funded, pull_price = 0) never qualify.
export const WIN_MULTIPLIER_THRESHOLD = 1.5;

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 200;

interface CacheEntry {
  win: RecentWinWithId;
  expiresAt: number;
}

// Newest-first so reads need no transformation.
const entries: CacheEntry[] = [];

function prune() {
  const now = Date.now();
  while (entries.length > 0 && entries[entries.length - 1].expiresAt <= now) {
    entries.pop();
  }
}

/**
 * Records a roll in the public ticker if the card's value exceeds the
 * configured multiplier of the pull price. Returns true if the win was
 * recorded, false otherwise.
 */
export function pushRecentWinIfQualifies(payload: {
  card_name: string;
  card_image_url: string | null;
  card_value_usd: number;
  pull_price_usd: number;
  user_name: string | null;
  user_image: string | null;
}): boolean {
  if (payload.pull_price_usd <= 0) return false;
  const multiplier = payload.card_value_usd / payload.pull_price_usd;
  if (multiplier <= WIN_MULTIPLIER_THRESHOLD) return false;

  prune();
  const win: RecentWinWithId = {
    win_id: randomUUID(),
    card_name: payload.card_name,
    card_image_url: payload.card_image_url,
    card_value_usd: payload.card_value_usd,
    pull_price_usd: payload.pull_price_usd,
    multiplier,
    user_name: payload.user_name,
    user_image: payload.user_image,
    time: new Date().toISOString(),
  };
  entries.unshift({ win, expiresAt: Date.now() + TTL_MS });

  // Cap memory; oldest entries fall off if the cache is hot.
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  return true;
}

export function getRecentWins(): RecentWinWithId[] {
  prune();
  return entries.map((e) => e.win);
}
