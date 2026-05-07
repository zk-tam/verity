"use client";

export interface RecentPull {
  id: string;
  tcg_card_id: string;
  name: string;
  image_small: string;
  image_large: string;
  market_price: string;
  rarity: string;
  set_name: string;
  grade: string;
  grading_company?: string;
  year: string;
  release_date: string;
}

export type RecentPullsResponse = RecentPull[];

// Hardcoded demo recent pulls
const DEMO_RECENT_PULLS: RecentPull[] = [
  {
    id: "1",
    tcg_card_id: "base1-4",
    name: "Charizard",
    image_small: "https://images.pokemontcg.io/base1/4.png",
    image_large: "https://images.pokemontcg.io/base1/4_hires.png",
    market_price: "350.00",
    rarity: "Holo Rare",
    set_name: "Base Set",
    grade: "9",
    grading_company: "PSA",
    year: "1999",
    release_date: "1999-01-09",
  },
  {
    id: "2",
    tcg_card_id: "base1-58",
    name: "Pikachu",
    image_small: "https://images.pokemontcg.io/base1/58.png",
    image_large: "https://images.pokemontcg.io/base1/58_hires.png",
    market_price: "125.00",
    rarity: "Common",
    set_name: "Base Set",
    grade: "10",
    grading_company: "PSA",
    year: "1999",
    release_date: "1999-01-09",
  },
  {
    id: "3",
    tcg_card_id: "base1-2",
    name: "Blastoise",
    image_small: "https://images.pokemontcg.io/base1/2.png",
    image_large: "https://images.pokemontcg.io/base1/2_hires.png",
    market_price: "85.00",
    rarity: "Holo Rare",
    set_name: "Base Set",
    grade: "8.5",
    grading_company: "CGC",
    year: "1999",
    release_date: "1999-01-09",
  },
  {
    id: "4",
    tcg_card_id: "base1-15",
    name: "Venusaur",
    image_small: "https://images.pokemontcg.io/base1/15.png",
    image_large: "https://images.pokemontcg.io/base1/15_hires.png",
    market_price: "45.00",
    rarity: "Holo Rare",
    set_name: "Base Set",
    grade: "Raw",
    year: "1999",
    release_date: "1999-01-09",
  },
  {
    id: "5",
    tcg_card_id: "base1-8",
    name: "Machamp",
    image_small: "https://images.pokemontcg.io/base1/8.png",
    image_large: "https://images.pokemontcg.io/base1/8_hires.png",
    market_price: "0.75",
    rarity: "Holo Rare",
    set_name: "Base Set",
    grade: "Raw",
    year: "1999",
    release_date: "1999-01-09",
  },
];

// Demo version - returns hardcoded recent pulls
export function useRecentPulls() {
  return {
    data: DEMO_RECENT_PULLS,
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };
}
