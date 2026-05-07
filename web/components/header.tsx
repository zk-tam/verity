"use client";

import { useCallback, useEffect, useState } from "react";
import { LiquidGlass } from "./liquid-glass";
import { GradientLiquidGlass } from "./gradient-liquid-glass";
import { X } from "lucide-react";
import Link from "next/link";
import { Logomark, LogoTypography } from "./icons";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AUDIO_IDS, AUDIO_PRESETS, useAudio } from "@/hooks/use-audio";
import { HamburgerMenu } from "./hamburger-menu";
import { useUSDCBalance } from "@/hooks/use-usdc-balance";
import { USDCWalletDialog } from "./usdc-wallet-dialog";
import { AuthButton } from "./auth-button";
import { assetUrl } from "@/lib/assets";

export function Header() {
  const { play } = useAudio();
  const { balance } = useUSDCBalance();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleEnterGachaClick = useCallback(() => {
    const preset = AUDIO_PRESETS.enterGachaPage;
    play(AUDIO_IDS.ENTER_GACHA_PAGE, preset.src, {
      volume: preset.volume,
    });
  }, [play]);

  const handleNavigationClick = useCallback(
    (href: string) => {
      if (href === "/gacha") {
        handleEnterGachaClick();
      }
      setMobileMenuOpen(false);
    },
    [handleEnterGachaClick]
  );

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileMenuOpen]);

  const navigationItems = [
    { label: "Gacha", href: "/gacha" },
    { label: "Cardsweep", href: "/cardsweep", disabled: true },
    { label: "Marketplace", href: "/marketplace", disabled:true },
  ];

  return (
    <TooltipProvider>
      <header className="w-full mx-auto max-w-[1600px] p-4 py-3 flex items-center gap-3 md:gap-4">
        <div className="hidden md:block flex-1">
          <LiquidGlass
            className="rounded-[50px] bg-gradient-to-r from-[hsl(var(--glass-gradient-start))]/40 to-[hsl(var(--glass-gradient-end))]/40"
            padding="sm"
          >
            <div className="w-full h-full px-5 lg:px-8 flex items-center justify-between">
              <Link href="/explore" className="flex items-center gap-3">
                <Logomark className="w-9 h-9 text-white drop-shadow-2xl" />
                <LogoTypography className="h-4 w-auto text-white hidden lg:block" />
              </Link>
              <nav className="flex items-center gap-6">
                {navigationItems.map((item) => (
                  <>
                  {item.disabled ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-white font-medium opacity-70 cursor-progress">
                          {item.label}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Coming soon</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => handleNavigationClick(item.href)}
                      className="text-white font-medium hover:text-white transition-colors font-medium"
                    >
                      {item.label}
                    </Link>
                  )}
                  </>
                ))}
              </nav>
            </div>
          </LiquidGlass>
        </div>

        <Link
          href="/explore"
          aria-label="Go to explore"
          className="md:hidden w-10 h-10 min-[381px]:w-11 min-[381px]:h-11 flex items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--glass-gradient-start))]/20 to-[hsl(var(--glass-gradient-end))]/20 backdrop-blur-md backdrop-saturate-150 border border-white/20 text-white shadow-[0_4px_8px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.1)] hover:from-[hsl(var(--glass-gradient-start))]/30 hover:to-[hsl(var(--glass-gradient-end))]/30 transition-all duration-300"
        >
          <Logomark className="w-5 h-5 min-[381px]:w-6 min-[381px]:h-6" />
        </Link>

        <div className="flex items-center gap-3 md:gap-4 ml-auto">
          <USDCWalletDialog>
            <button className="h-10 min-[381px]:h-11 md:h-14 px-2 min-[381px]:px-3 md:px-3 rounded-full bg-gradient-to-br from-[hsl(var(--glass-gradient-start))]/20 to-[hsl(var(--glass-gradient-end))]/20 backdrop-blur-md backdrop-saturate-150 border border-white/20 shadow-[0_4px_8px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.1)] flex items-center gap-1 min-[381px]:gap-1.5 md:gap-3 cursor-pointer hover:from-[hsl(var(--glass-gradient-start))]/30 hover:to-[hsl(var(--glass-gradient-end))]/30 transition-all duration-300">
              <div className="relative w-7 h-7 min-[381px]:w-8 min-[381px]:h-8 md:w-10 md:h-10">
                <Image
                  src={assetUrl("balance_icon.png")}
                  alt="Balance"
                  fill
                  className="object-contain"
                />
              </div>
              <div className="flex items-center gap-1 min-[381px]:gap-1.5 md:gap-2 text-white">
                <span className="font-medium text-[11px] min-[381px]:text-xs md:text-sm">
                  {balance}
                </span>
                <span className="text-[9px] min-[381px]:text-[10px] md:text-xs opacity-80">USDC</span>
              </div>
            </button>
          </USDCWalletDialog>

          <AuthButton />

          <HamburgerMenu isOpen={mobileMenuOpen} onClick={toggleMobileMenu} />
        </div>

        {/* Mobile Navigation Overlay */}
        <div
          aria-hidden={!mobileMenuOpen}
          className={`fixed inset-0 z-[120] md:hidden transition-all duration-300 ${
            mobileMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <GradientLiquidGlass
            role="dialog"
            aria-modal="true"
            padding="md"
            className="absolute right-4 left-4 top-24 rounded-[32px]"
          >
            <div className="px-4 py-5 space-y-6 text-white">
              <div className="flex items-center justify-between">
                <LogoTypography className="h-3 w-auto text-white" />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="space-y-3">
                {navigationItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => handleNavigationClick(item.href)}
                    className="block rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base font-medium text-white transition hover:bg-white/10"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </GradientLiquidGlass>
        </div>
      </header>
    </TooltipProvider>
  );
}
