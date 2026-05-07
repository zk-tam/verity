"use client";

import { useCallback, useEffect, useState } from "react";
import { ExploreBanner } from "@/components/explore-banner";
import { useRecentPulls } from "@/hooks/use-recent-pulls";
import { RecentPullsCarousel } from "@/components/recent-pulls-carousel";
import { Loader, LockIcon } from "lucide-react";
import Image from "next/image";
import { BlackButton } from "@/components/black-button";
import { AUDIO_IDS, AUDIO_PRESETS, useAudio } from "@/hooks/use-audio";
import { assetUrl } from "@/lib/assets";

export default function ExplorePage() {
  const { data: recentPullsData, isLoading } = useRecentPulls();
  const [fadeIn, setFadeIn] = useState(false);
  const { play } = useAudio({ cleanupOnUnmount: false });

  const handleEnterGachaClick = useCallback(() => {
    const preset = AUDIO_PRESETS.enterGachaPage;
    play(AUDIO_IDS.ENTER_GACHA_PAGE, preset.src, {
      volume: preset.volume,
    });
  }, [play]);

  // Trigger fade in animation on mount
  useEffect(() => {
    setFadeIn(true);
  }, []);

  const shortcutBtns = [
    {
      name: "Gacha Catch",
      href: "/gacha",
      btn_label: "Catch Now",
      thumbnail: assetUrl("explore_gacha_thumbnail.png"),
      description: "Catch the top chase cards from our gacha players!",
    },
    {
      name: "Cardsweeper",
      href: "/cardsweeper",
      btn_label: "Sweep Now",
      thumbnail: assetUrl("explore_cardsweeper_thumbnail.png"),
      description: "Challenge yourself in minesweeping for card prizes!",
      disabled: true,
    },
    {
      name: "Marketplace",
      href: "/marketplace",
      btn_label: "Explore Now",
      thumbnail: assetUrl("explore_marketplace_thumbnail.png"),
      description: "Buy & Sell Your Catches.",
      disabled: true,
    },
  ];

  return (
    <>
      {/* White fade overlay */}
      <div
        className={`fixed inset-0 bg-white pointer-events-none z-50 transition-opacity duration-1000 ease-out ${
          fadeIn ? "opacity-0" : "opacity-100"
        }`}
      />

      <div className="relative min-h-screen">
        <div className="mx-auto max-w-[1600px] mt-4 px-4 sm:px-6 space-y-6 pb-10">
          {/* Explore Banner */}
          <ExploreBanner />

          <div className="w-full flex flex-col xl:flex-row gap-4 xl:gap-6">
            <div className="order-2 xl:order-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4 xl:w-[32%]">
              {shortcutBtns.map((btn) => (
                <div
                  key={btn.name}
                  className="relative w-full h-[220px] sm:h-[240px] overflow-hidden rounded-2xl group"
                >
                  <div className="absolute inset-0">
                    <Image
                      src={btn.thumbnail}
                      alt={btn.name}
                      fill
                      className="object-cover"
                      priority
                    />
                    <div className="absolute h-[120px] sm:h-[130px] w-full top-0 transition-all duration-300 group-hover:backdrop-blur-md group-hover:bg-white/10 bg-black/10" />

                    {btn.disabled && (
                      <>
                        <div className="absolute right-4 top-4">
                          <LockIcon className="size-5 text-white" />
                        </div>

                        <div className="absolute top-[45%] -translate-y-1/2 right-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="text-xs text-contrast">
                            <Loader className="size-4 animate-spin" />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="absolute inset-0 p-4 sm:p-5 text-white flex flex-col">
                      <h3
                        className="text-xl sm:text-2xl font-loos-extra-wide-medium"
                        style={{
                          textShadow: "0 0 10px #ffffff81",
                        }}
                      >
                        {btn.name}
                      </h3>
                      <p className="mt-2 text-sm max-w-[260px]">
                        {btn.description}
                      </p>
                    </div>

                    <div className="absolute bottom-4 sm:bottom-6 right-4">
                      <BlackButton
                        href={btn.href}
                        onClick={
                          btn.href === "/gacha"
                            ? handleEnterGachaClick
                            : undefined
                        }
                        className="px-4 py-2 text-sm"
                        disabled={btn.disabled}
                      >
                        {btn.disabled ? "Coming Soon" : btn.btn_label}
                      </BlackButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="order-1 xl:order-2 xl:flex-1 xl:max-w-[calc(100%-360px)] xl:ml-auto">
              {/* Recent Pulls Carousel */}
              {isLoading ? (
                <div className="flex justify-center py-20">
                  <Loader className="w-8 h-8 animate-spin text-white" />
                </div>
              ) : recentPullsData && recentPullsData.length > 0 ? (
                <RecentPullsCarousel pulls={recentPullsData} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
