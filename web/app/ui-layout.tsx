"use client";

import { ReactNode, useEffect, useMemo, useRef } from "react";
import { Header } from "@/components/header";
// import { SessionSignerDialog } from "@/components/session-signer-dialog";
import { usePathname } from "next/navigation";
import { MuteToggle } from "@/components/mute-toggle";
import { useAudio, AUDIO_PRESETS, AUDIO_IDS } from "@/hooks/use-audio";
import { MarqueeBanner } from "@/components/marquee-banner";

interface UILayoutProps {
  children: ReactNode;
}

export function UILayout({ children }: UILayoutProps) {
  const pathname = usePathname();
  const { play, stop, isPlaying } = useAudio({ cleanupOnUnmount: false });
  const hasInteractedRef = useRef(false);

  const showHeader = pathname !== "/";

  useEffect(() => {
    const isGachaRoute = pathname?.startsWith("/gacha");
    const preset = AUDIO_PRESETS.loungeBgm;

    if (isGachaRoute) {
      stop(AUDIO_IDS.LOUNGE_BGM);
      return;
    }

    if (hasInteractedRef.current && !isPlaying(AUDIO_IDS.LOUNGE_BGM)) {
      play(AUDIO_IDS.LOUNGE_BGM, preset.src, {
        volume: preset.volume,
        loop: preset.loop,
      });
    }
  }, [pathname, play, stop, isPlaying]);

  useEffect(() => {
    const handleInteraction = () => {
      if (!hasInteractedRef.current) {
        hasInteractedRef.current = true;
      }

      const isGachaRoute = pathname?.startsWith("/gacha");
      if (!isGachaRoute && !isPlaying(AUDIO_IDS.LOUNGE_BGM)) {
        const preset = AUDIO_PRESETS.loungeBgm;
        play(AUDIO_IDS.LOUNGE_BGM, preset.src, {
          volume: preset.volume,
          loop: preset.loop,
        });
      }

      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };

    window.addEventListener("pointerdown", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("touchstart", handleInteraction, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, [pathname, play, isPlaying]);

  const showMarquee = useMemo(() => !["/", "/gacha"].includes(pathname), [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      {showHeader && <Header />}
      <main className="flex-1 relative pb-10">{children}</main>
      {
        showMarquee && (
          <MarqueeBanner
            messages={[
              "Catch the epic cards like Mew EX with a bonus catch rate boost!",
              "Earn Special Event Raffle Tickets by playing Gacha Catch!",
              "Catch, Flex, Repeat — see what the community just caught!",
            ]}
          />
        )
      }
      <MuteToggle />
      {/* <SessionSignerDialog /> */}
    </div>
  );
}
