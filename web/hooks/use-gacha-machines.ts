"use client";

import { assetUrl } from "@/lib/assets";

export interface Card {
  id: number;
  name: string;
  image_small: string;
  image_large: string;
  market_price: string;
  rarity: string;
  set_name: string;
  artist: string;
  hp: number;
  types: string[];
  supertype: string;
  attacks?: any[];
  abilities?: any[];
  tcgplayer_url: string;
  token_type: string;
  year: string;
  grading_company?: string;
  grade?: string;
  uri_content: {
    name: string;
    image: string;
    price: string;
    tcg_player_url: string;
  };
  amount_buyback_insured: number;
}

export interface GachaMachine {
  id: number;
  name: string;
  description: string;
  image_url: string;
  amount: string;
  amount_currency: string;
  is_active: boolean;
  odds_description?: {
    ev: number;
    odds: Record<string, number>;
  };
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  cards?: Card[];
}

// Hardcoded demo chase cards
const DEMO_CHASE_CARDS: Card[] = [
  {
    id: 1,
    name: "Muk & Alolan Muk GX",
    image_small:
      "https://storage.googleapis.com/images.pricecharting.com/baf19227c34fc251094fef6e0ac2956985187b52cc230387cd232ab729c8247e/1600.jpg",
    image_large:
      "https://storage.googleapis.com/images.pricecharting.com/baf19227c34fc251094fef6e0ac2956985187b52cc230387cd232ab729c8247e/1600.jpg",
    market_price: "12.41",
    rarity: "SR",
    set_name: "Japanese Double Blaze",
    artist: "",
    hp: 270,
    types: ["Darkness"],
    supertype: "Pokémon",
    tcgplayer_url:
      "https://www.pricecharting.com/game/pokemon-japanese-double-blaze/muk-&-alolan-muk-gx-98",
    token_type: "pokemon",
    year: "2019",
    uri_content: {
      name: "Muk & Alolan Muk GX",
      image:
        "https://storage.googleapis.com/images.pricecharting.com/baf19227c34fc251094fef6e0ac2956985187b52cc230387cd232ab729c8247e/1600.jpg",
      price: "12.41",
      tcg_player_url:
        "https://www.pricecharting.com/game/pokemon-japanese-double-blaze/muk-&-alolan-muk-gx-98",
    },
    amount_buyback_insured: 9.93,
  },
  {
    id: 2,
    name: "Gengar EX",
    image_small:
      "https://storage.googleapis.com/images.pricecharting.com/ergsyandbx2r2njs/240.jpg",
    image_large:
      "https://storage.googleapis.com/images.pricecharting.com/ergsyandbx2r2njs/240.jpg",
    market_price: "32.00",
    rarity: "RR",
    set_name: "Japanese Phantom Gate",
    artist: "",
    hp: 170,
    types: ["Psychic"],
    supertype: "Pokémon",
    tcgplayer_url:
      "https://www.pricecharting.com/game/pokemon-japanese-phantom-gate/gengar-ex-33",
    token_type: "pokemon",
    year: "2014",
    uri_content: {
      name: "Gengar EX",
      image:
        "https://storage.googleapis.com/images.pricecharting.com/ergsyandbx2r2njs/240.jpg",
      price: "32.00",
      tcg_player_url:
        "https://www.pricecharting.com/game/pokemon-japanese-phantom-gate/gengar-ex-33",
    },
    amount_buyback_insured: 25.6,
  },
  {
    id: 3,
    name: "Rowlet & Alolan Exeggutor GX",
    image_small:
      "https://storage.googleapis.com/images.pricecharting.com/eb4198aa49234ce3d9cb6df635a7a2208feedd02f53994eeb3fc2e1b34ef7a6a/1600.jpg",
    image_large:
      "https://storage.googleapis.com/images.pricecharting.com/eb4198aa49234ce3d9cb6df635a7a2208feedd02f53994eeb3fc2e1b34ef7a6a/1600.jpg",
    market_price: "14.54",
    rarity: "Ultra Rare",
    set_name: "Unified Minds",
    artist: "",
    hp: 270,
    types: ["Grass"],
    supertype: "Pokémon",
    tcgplayer_url:
      "https://www.pricecharting.com/game/pokemon-unified-minds/rowlet-&-alolan-exeggutor-gx-1",
    token_type: "pokemon",
    year: "2019",
    uri_content: {
      name: "Rowlet & Alolan Exeggutor GX",
      image:
        "https://storage.googleapis.com/images.pricecharting.com/eb4198aa49234ce3d9cb6df635a7a2208feedd02f53994eeb3fc2e1b34ef7a6a/1600.jpg",
      price: "14.54",
      tcg_player_url:
        "https://www.pricecharting.com/game/pokemon-unified-minds/rowlet-&-alolan-exeggutor-gx-1",
    },
    amount_buyback_insured: 11.63,
  },
];

// Hardcoded demo gacha machines
const DEMO_GACHA_MACHINES: GachaMachine[] = [
  {
    id: 1,
    name: "Pack $50",
    description: "Demo gacha machine with Muk & Alolan Muk GX",
    image_url: assetUrl("gacha_machine_card.png"),
    amount: "1.00",
    amount_currency: "USDC",
    is_active: true,
    odds_description: {
      ev: 0.95,
      odds: {
        "$0-$1": 0.5,
        "$1-$10": 0.3,
        "$10-$50": 0.15,
        "$10-$35": 0.05,
      },
    },
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cards: [DEMO_CHASE_CARDS[0]],
  },
  {
    id: 2,
    name: "Pack $100",
    description: "Demo gacha machine with Gengar EX",
    image_url: assetUrl("gacha_machine_card.png"),
    amount: "5.00",
    amount_currency: "USDC",
    is_active: true,
    odds_description: {
      ev: 4.75,
      odds: {
        "$0-$5": 0.5,
        "$5-$20": 0.3,
        "$20-$50": 0.15,
        "$10-$35": 0.05,
      },
    },
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cards: [DEMO_CHASE_CARDS[1]],
  },
  {
    id: 3,
    name: "Pack $250",
    description: "Demo gacha machine with Rowlet & Alolan Exeggutor GX",
    image_url: assetUrl("gacha_machine_card.png"),
    amount: "10.00",
    amount_currency: "USDC",
    is_active: true,
    odds_description: {
      ev: 9.5,
      odds: {
        "$0-$10": 0.5,
        "$10-$25": 0.3,
        "$25-$50": 0.15,
        "$10-$35": 0.05,
      },
    },
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cards: [DEMO_CHASE_CARDS[2]],
  },
];

// Demo version - returns 3 hardcoded gacha machines
export function useGachaMachines() {
  return {
    data: DEMO_GACHA_MACHINES,
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };
}
