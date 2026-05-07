"use client";

import { LogIn } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserProfileDialog } from "@/components/user-profile-dialog";
import { useAuthStore } from "@/lib/stores/auth-store";

export function AuthButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const clearAuth = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout();
    clearAuth();
  };

  if (authenticated) {
    return <UserProfileDialog onLogout={handleLogout} />;
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={!ready}
          onClick={() =>
            login({
              loginMethods: ["email", "google", "twitter", "wallet"],
              walletChainType: "solana-only",
            })
          }
          className="h-10 min-[381px]:h-11 md:h-14 px-3 md:px-4 rounded-full bg-gradient-to-br from-[hsl(var(--glass-gradient-start))]/20 to-[hsl(var(--glass-gradient-end))]/20 backdrop-blur-md backdrop-saturate-150 border border-white/20 shadow-[0_4px_8px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.1)] flex items-center gap-2 text-white hover:from-[hsl(var(--glass-gradient-start))]/30 hover:to-[hsl(var(--glass-gradient-end))]/30 transition-all duration-300 disabled:cursor-wait disabled:opacity-60"
          aria-label="Log in"
        >
          <LogIn className="w-4 h-4 md:w-5 md:h-5" />
          <span className="hidden md:inline text-sm font-medium">Login</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Login</p>
      </TooltipContent>
    </Tooltip>
  );
}
