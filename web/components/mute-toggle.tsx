"use client";

import { useEffect, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useAudio } from "@/hooks/use-audio";
import { SpinningText } from "./ui/spinning-text";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function MuteToggle() {
  const { isMuted, toggleMuted } = useAudio({ cleanupOnUnmount: false });

  const isLandingPage = usePathname() === "/";

  useEffect(() => {
    const styleId = "mute-toggle-animations";
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes mute-wave {
        0% {
          transform: scale(1);
          opacity: 0.6;
        }
        100% {
          transform: scale(1.8);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const applyMuteState = useCallback(
    (element: HTMLMediaElement) => {
      element.muted = isMuted;
      if (isMuted) {
        element.dataset.prevVolume = element.volume.toString();
        element.volume = 0;
      } else {
        const prevVolume = element.dataset.prevVolume;
        if (prevVolume !== undefined) {
          const parsed = Number(prevVolume);
          if (!Number.isNaN(parsed)) {
            element.volume = Math.max(0, Math.min(1, parsed));
          }
        }
        if (element.volume === 0) {
          element.volume = 1;
        }
        delete element.dataset.prevVolume;
        if (element.paused) {
          element
            .play()
            .catch((error) => console.debug("Media play blocked", error));
        }
      }
    },
    [isMuted]
  );

  useEffect(() => {
    const mediaSelector = "video, audio";

    const updateAllMedia = () => {
      document
        .querySelectorAll<HTMLMediaElement>(mediaSelector)
        .forEach(applyMuteState);
    };

    const handleMediaPlay = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLMediaElement) {
        applyMuteState(target);
      }
    };

    updateAllMedia();
    document.addEventListener("play", handleMediaPlay, true);

    return () => {
      document.removeEventListener("play", handleMediaPlay, true);
    };
  }, [applyMuteState]);

  return (
    <div className={cn("fixed z-[100] bottom-8", isLandingPage ? " left-1/2 -translate-x-1/2" : "right-8")}>
      <button
        onClick={toggleMuted}
        aria-label={isMuted ? "Unmute all media" : "Mute all media"}
        aria-pressed={isMuted}
        className="relative w-12 h-12 min-[381px]:h-16 min-[381px]:w-16 rounded-full bg-gradient-to-br from-[hsl(var(--glass-gradient-start))]/20 to-[hsl(var(--glass-gradient-end))]/20 backdrop-blur-md backdrop-saturate-150 border border-white/20 shadow-[0_4px_8px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.1)] flex items-center justify-center text-white hover:from-[hsl(var(--glass-gradient-start))]/30 hover:to-[hsl(var(--glass-gradient-end))]/30 transition-all duration-300 relative overflow-visible"
      >
        {isMuted && (
          <SpinningText
            reverse
            className="absolute font-bold top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 uppercase text-[8px] min-[381px]:text-[10px] text-white"
            style={{
              textShadow: "0 0 2px #000",
            }}
            duration={4}
            radius={6}
          >
            Turn Up For Best Experience
          </SpinningText>
        )}
        <span
          aria-hidden
          className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
            isMuted ? "opacity-0" : "opacity-100"
          }`}
        >
          <span
            className="absolute inset-0 rounded-full border-2 border-white"
            style={{ animation: "mute-wave 1.2s ease-out infinite" }}
          />
          <span
            className="absolute inset-0 rounded-full border-2 border-white"
            style={{
              animation: "mute-wave 1.2s ease-out infinite",
              animationDelay: "0.3s",
            }}
          />
          <span
            className="absolute inset-0 rounded-full border-2 border-white"
            style={{
              animation: "mute-wave 1.2s ease-out infinite",
              animationDelay: "0.6s",
            }}
          />
          <span
            className="absolute inset-0 rounded-full border-2 border-white"
            style={{
              animation: "mute-wave 1.2s ease-out infinite",
              animationDelay: "0.9s",
            }}
          />
        </span>
        {isMuted ? (
          <VolumeX className="w-6 h-6 min-[381px]:w-8 min-[381px]:h-8" />
        ) : (
          <Volume2 className="w-6 h-6 min-[381px]:w-8 min-[381px]:h-8" />
        )}
      </button>
    </div>
  );
}
