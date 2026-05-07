"use client";

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAuthStore, type AuthWallet, type User } from "@/lib/stores/auth-store";

interface BackendAuthResponse {
  success?: boolean;
  data?: {
    id: string;
    privy_did?: string;
    privy_id?: string;
    name?: string | null;
    email?: string | null;
    x_handle?: string | null;
    image?: string | null;
    role?: string | null;
    solana_address?: string | null;
    embedded_address?: string | null;
    embedded_wallet_id?: string | null;
    wallet?: AuthWallet | null;
    referral_code?: string | null;
    referrer_privy_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  error?: string;
}

export function useAuthSync() {
  const { ready, authenticated, user: privyUser, getAccessToken } = usePrivy();
  const { setAuth, logout, setLoading, setError, user, isLoading, error } =
    useAuthStore();
  const lastSyncedPrivyId = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) {
      setLoading(true);
      return;
    }

    if (!authenticated) {
      lastSyncedPrivyId.current = null;
      logout();
      return;
    }

    if (!privyUser?.id) return;

    const privyId = privyUser.id;

    if (lastSyncedPrivyId.current === privyId && user?.privy_id === privyId) {
      return;
    }

    let cancelled = false;

    async function syncAuthenticatedUser() {
      setLoading(true);

      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Missing Privy access token");

        const response = await fetch("/api/auth", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache",
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as BackendAuthResponse;
        if (!response.ok || payload.error || !payload.data) {
          throw new Error(payload.error || "Failed to sync auth user");
        }

        if (cancelled) return;

        const syncedUser = normalizeUser(payload.data, privyId);
        setAuth(syncedUser);
        lastSyncedPrivyId.current = privyId;
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Auth sync failed";
        setError(message);
      }
    }

    syncAuthenticatedUser();

    return () => {
      cancelled = true;
    };
  }, [
    authenticated,
    getAccessToken,
    logout,
    privyUser?.id,
    ready,
    setAuth,
    setError,
    setLoading,
    user?.privy_id,
  ]);

  return {
    isAuthenticated: authenticated && Boolean(user),
    user,
    isLoading: !ready || isLoading,
    error,
  };
}

function normalizeUser(data: NonNullable<BackendAuthResponse["data"]>, privyId: string): User {
  const walletAddress =
    data.wallet?.address ??
    data.solana_address ??
    data.embedded_address ??
    null;

  return {
    id: data.id,
    privy_id: data.privy_did ?? data.privy_id ?? privyId,
    privy_did: data.privy_did ?? data.privy_id ?? privyId,
    name: data.name ?? null,
    email: data.email ?? null,
    x_handle: data.x_handle ?? null,
    image: data.image ?? null,
    role: data.role ?? null,
    solana_address: walletAddress,
    embedded_address: walletAddress,
    embedded_wallet_id:
      data.wallet?.privy_wallet_id ?? data.embedded_wallet_id ?? null,
    wallet: data.wallet ?? null,
    referral_code: data.referral_code ?? null,
    referrer_privy_id: data.referrer_privy_id ?? null,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  };
}
