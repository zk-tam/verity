"use client";

import { useQuery } from "@tanstack/react-query";
import { getAccessToken } from "@privy-io/react-auth";
import { Card } from "./use-gacha-machines";

export interface Holding {
  privy_id: string;
  wallet_address: string;
  collection_address: string;
  token_id: number;
  amount: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  card: Card;
}

export type HoldingsResponse = Holding[];

async function fetchHoldings(): Promise<HoldingsResponse> {
  const privyToken = await getAccessToken();

  const response = await fetch(`/api/holdings`, {
    headers: {
      "Authorization": `Bearer ${privyToken}`,
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    cache: "no-store", // Next.js fetch option
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to fetch holdings");
  }

  return response.json();
}

export function useHoldings(walletAddress?: string) {
  return useQuery({
    queryKey: ["holdings", walletAddress],
    queryFn: () => fetchHoldings(),
    enabled: !!walletAddress,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0, // Data is considered stale immediately
    gcTime: 0, // Don't cache in memory (formerly cacheTime)
  });
}
