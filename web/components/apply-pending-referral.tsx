"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  consumeReferralCode,
  storeReferralCode,
} from "@/lib/referral";

const scrubRefFromUrl = () => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("ref")) return;
  url.searchParams.delete("ref");
  window.history.replaceState({}, "", url.toString());
};

export function ApplyPendingReferral() {
  const searchParams = useSearchParams();
  const { ready, authenticated, getAccessToken } = usePrivy();
  const inFlightRef = useRef(false);

  const tryApply = async () => {
    if (inFlightRef.current) return;
    const code = consumeReferralCode();
    if (!code) return;

    inFlightRef.current = true;
    try {
      const token = await getAccessToken();
      if (!token) {
        storeReferralCode(code);
        return;
      }

      const response = await fetch("/api/referrals/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        console.warn("Referral apply rejected:", data?.error ?? response.status);
      }
    } catch (error) {
      console.warn("Referral apply failed:", error);
    } finally {
      scrubRefFromUrl();
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    const refParam = searchParams.get("ref");
    if (refParam) {
      storeReferralCode(refParam);
      if (ready && authenticated) {
        tryApply();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    tryApply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  return null;
}
