'use client'

import { useMutation } from '@tanstack/react-query'
import { Card } from './use-gacha-machines'

export interface RollParams {
  gacha_machine_id: number
  batch_roll_count?: number
}

export interface Token {
  id: number
  collection_address: string
  type: string
  pokemon_id: number
  pokemon_card_id: string
  name?: string
  set_name?: string
  uri: string
  uri_content: {
    name: string
    image: string
    price: string
    tcg_player_url: string
  }
  cert_id: string | null
  grading_company: string | null
  grade: string
  year?: string
  rarity?: string
  image_large?: string
  created_at: string
  updated_at: string
  market_price: number
  amount_current_fmv: number
  amount_buyback_insured: number
  card: Card
}

export interface RollResponse {
  tokens: Token[]
  txHash: string
  gachaMachine: {
    id: number
    amount: string
  }
  amount_paid_by_user: number
  amount_current_fmv: number
  amount_buyback_insured: number
  amount_currency: string
  batch_roll_count: number
}

// Hardcoded cards per machine (keyed by gacha_machine_id)
const DEMO_CARDS: Record<number, { card: Card; token: Token; amount: string }> = {
  1: (() => {
    const card: Card = {
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
    };
    return {
      card,
      amount: "1.00",
      token: {
        id: 1,
        collection_address: "0xdemo",
        type: "pokemon",
        pokemon_id: 89,
        pokemon_card_id: "sm10-98",
        name: card.name,
        set_name: card.set_name,
        uri: "https://demo.uri",
        uri_content: card.uri_content,
        cert_id: null,
        grading_company: null,
        grade: "Raw",
        year: card.year,
        rarity: card.rarity,
        image_large: card.image_large,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        market_price: parseFloat(card.market_price),
        amount_current_fmv: parseFloat(card.market_price),
        amount_buyback_insured: card.amount_buyback_insured,
        card,
      } as Token,
    };
  })(),
  2: (() => {
    const card: Card = {
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
    };
    return {
      card,
      amount: "5.00",
      token: {
        id: 2,
        collection_address: "0xdemo",
        type: "pokemon",
        pokemon_id: 94,
        pokemon_card_id: "xy4-33",
        name: card.name,
        set_name: card.set_name,
        uri: "https://demo.uri",
        uri_content: card.uri_content,
        cert_id: null,
        grading_company: null,
        grade: "Raw",
        year: card.year,
        rarity: card.rarity,
        image_large: card.image_large,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        market_price: parseFloat(card.market_price),
        amount_current_fmv: parseFloat(card.market_price),
        amount_buyback_insured: card.amount_buyback_insured,
        card,
      } as Token,
    };
  })(),
  3: (() => {
    const card: Card = {
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
    };
    return {
      card,
      amount: "10.00",
      token: {
        id: 3,
        collection_address: "0xdemo",
        type: "pokemon",
        pokemon_id: 103,
        pokemon_card_id: "sm11-1",
        name: card.name,
        set_name: card.set_name,
        uri: "https://demo.uri",
        uri_content: card.uri_content,
        cert_id: null,
        grading_company: null,
        grade: "Raw",
        year: card.year,
        rarity: card.rarity,
        image_large: card.image_large,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        market_price: parseFloat(card.market_price),
        amount_current_fmv: parseFloat(card.market_price),
        amount_buyback_insured: card.amount_buyback_insured,
        card,
      } as Token,
    };
  })(),
};

// Demo version - returns a different card per machine
export function useRoll() {
  const rollGacha = async ({ gacha_machine_id, batch_roll_count = 1 }: RollParams): Promise<RollResponse> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const demo = DEMO_CARDS[gacha_machine_id] ?? DEMO_CARDS[1];

    return {
      tokens: [demo.token],
      txHash: "0xdemo_tx_hash",
      gachaMachine: {
        id: gacha_machine_id,
        amount: demo.amount,
      },
      amount_paid_by_user: parseFloat(demo.amount) * batch_roll_count,
      amount_current_fmv: parseFloat(demo.card.market_price),
      amount_buyback_insured: demo.card.amount_buyback_insured,
      amount_currency: "USDC",
      batch_roll_count: batch_roll_count,
    };
  };

  return useMutation({
    mutationFn: rollGacha,
  });
}
