import { Sparkles } from "lucide-react";
import Image from "next/image";
import { useCallback, useState, useEffect } from "react";
import { BlackButton } from "./black-button";
import { AUDIO_IDS, AUDIO_PRESETS, useAudio } from "@/hooks/use-audio";
import { assetUrl } from "@/lib/assets";

export function ExploreBanner() {
  const [timeLeft, setTimeLeft] = useState({
    days: 10,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const { play } = useAudio({ cleanupOnUnmount: false });

  const handleEnterGachaClick = useCallback(() => {
    const preset = AUDIO_PRESETS.enterGachaPage;
    play(AUDIO_IDS.ENTER_GACHA_PAGE, preset.src, {
      volume: preset.volume,
    });
  }, [play]);

  useEffect(() => {
    // Set target date to 10 days from now
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 10);

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      if (distance > 0) {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
        );
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        setTimeLeft({ days, hours, minutes, seconds });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-[200px] overflow-hidden rounded-2xl">
      {/* Background with blur overlay */}
      <div className="absolute inset-0">
        <Image
          src={assetUrl("explore_banner_1.png")}
          alt="Explore Banner Background"
          fill
          className="object-cover"
          priority
        />
        {/* Blur overlay */}
        <div className="absolute inset-0 backdrop-blur-[10px] bg-black/20" />
      </div>

      <div className="absolute top-2 left-0">
        <div
          className="text-xs md:text-base bg-subtitle px-3 py-2 flex gap-2 items-center explore-banner-ribbon"
          style={{
            textShadow: "0 0 5px #ffffff81",
            color: "hsl(48, 69%, 34%)",
          }}
        >
          <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
          Special Event
        </div>
      </div>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-wrap py-1 px-4 mt-10 md:mt-12 justify-start z-10">
        <div className="text-white">
          <h1
            className="text-base md:text-3xl text-white font-loos-extended-bold uppercase drop-shadow-2xl"
            style={{
              textShadow: "0 5px 3px rgba(0,0,0,0.5)",
            }}
          >
            Verity Raffles
          </h1>
          <p className="text-xs md:text-base">
            Own the legendary Mario & Luigi Pikachu card duo —{" "}
            <span className="font-bold text-sm md:text-xl">$25,000</span> with every gacha
            roll!
          </p>
        </div>
      </div>

      <div className="absolute bottom-3 md:bottom-2 left-4 z-40">
        <div className="w-full flex items-center gap-4 justify-center">
          <div className="flex items-center gap-2 text-black/80">
            <div>
              <div className="bg-white/80 shadow-[0_0_3px_3px_#ffffff50] backdrop-blur-sm rounded w-12 h-12 flex items-center justify-center text-xl font-sora">
                {timeLeft.days}
              </div>
              <div className="text-xs mt-1 text-center text-title">days</div>
            </div>
            <div>
              <div className="bg-white/80 shadow-[0_0_3px_3px_#ffffff50] backdrop-blur-sm rounded w-12 h-12 flex items-center justify-center text-xl font-sora">
                {timeLeft.hours.toString().padStart(2, "0")}
              </div>
              <div className="text-xs mt-1 text-center text-title">hours</div>
            </div>
            <div>
              <div className="bg-white/80 shadow-[0_0_3px_3px_#ffffff50] backdrop-blur-sm rounded w-12 h-12 flex items-center justify-center text-xl font-sora">
                {timeLeft.minutes.toString().padStart(2, "0")}
              </div>
              <div className="text-xs mt-1 text-center text-title">minutes</div>
            </div>
            <div>
              <div className="bg-white/80 shadow-[0_0_3px_3px_#ffffff50] backdrop-blur-sm rounded w-12 h-12 flex items-center justify-center text-xl font-sora">
                {timeLeft.seconds.toString().padStart(2, "0")}
              </div>
              <div className="text-xs mt-1 text-center text-title">seconds</div>
            </div>
          </div>
        </div>
      </div>

      <BlackButton
        className="absolute top-2 md:top-4 right-2 md:right-4 z-30 text-xs md:text-base"
        href="/gacha"
        onClick={handleEnterGachaClick}
      >
        Earn Ticket
      </BlackButton>

      {/* Bottom right items */}
      <div className="absolute top-1/2 translate-y-[10%] md:translate-y-[-50%] -right-[50px] md:-right-[20px] z-20">
        <Image
          src={assetUrl("explore_banner_1_item.png")}
          alt="Banner Items"
          height={0}
          width={0}
          className="h-[180px] md:h-[400px] w-auto"
          unoptimized
        />
      </div>
    </div>
  );
}
