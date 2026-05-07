"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RecentPull } from "@/hooks/use-recent-pulls";
import { GradientLiquidGlass } from "./gradient-liquid-glass";
import { CardHolo } from "./CardHolo";

interface RecentPullsCarouselProps {
  pulls: RecentPull[];
}

export function RecentPullsCarousel({ pulls }: RecentPullsCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [centerIndex, setCenterIndex] = useState(3); // Start at index 3 (first real card after 3 dummies)
  const [isScrolling, setIsScrolling] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window === "undefined" ? 1024 : window.innerWidth
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const isCompact = viewportWidth <= 640;
  const isTablet = viewportWidth > 640 && viewportWidth <= 1024;

  const baseScale = isCompact ? 0.8 : isTablet ? 0.9 : 1;

  const overlapLarge = isCompact ? -110 : isTablet ? -65 : -80;
  const overlapMedium = isCompact ? -145 : isTablet ? -100 : -120;
  const overlapSmall = isCompact ? -180 : isTablet ? -135 : -140;

  const spacerWidth = Math.max(
    8,
    Math.round(
      viewportWidth / 2 - (isCompact ? 120 : isTablet ? 260 : 400)
    )
  );

  const scrollToIndex = (index: number) => {
    if (!scrollContainerRef.current || isScrolling) return;

    setIsScrolling(true);
    const container = scrollContainerRef.current;
    const cards = container.querySelectorAll(".carousel-card");
    if (cards.length === 0) return;

    const targetCard = cards[index] as HTMLElement;
    const containerWidth = container.offsetWidth;
    const cardLeft = targetCard.offsetLeft;
    const cardWidth = targetCard.offsetWidth;
    const scrollPosition = cardLeft - containerWidth / 2 + cardWidth / 2;

    container.scrollTo({
      left: scrollPosition,
      behavior: "smooth",
    });

    setCenterIndex(index);
    setTimeout(() => setIsScrolling(false), 300);
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current || isScrolling) return;

    const container = scrollContainerRef.current;
    const cards = container.querySelectorAll(".carousel-card");
    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.width / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;

    cards.forEach((card) => {
      const cardElement = card as HTMLElement;
      const cardOpacity = parseFloat(getComputedStyle(cardElement).opacity);

      // Skip invisible cards (opacity 0)
      if (cardOpacity === 0) return;

      const cardRect = card.getBoundingClientRect();
      const cardCenter =
        cardRect.left - containerRect.left + cardRect.width / 2;
      const distance = Math.abs(cardCenter - containerCenter);
      const realIndex = parseInt(cardElement.dataset.index || "0");

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = realIndex;
      }
    });

    if (closestIndex !== centerIndex) {
      setCenterIndex(closestIndex);
    }
  };

  useEffect(() => {
    // Scroll to first real card (index 3) on mount with a small delay to ensure DOM is ready
    if (scrollContainerRef.current && pulls.length > 0) {
      const centerIdx = 3; // First real card after 3 dummy cards
      setTimeout(() => {
        if (!scrollContainerRef.current) return;

        const container = scrollContainerRef.current;
        const cards = container.querySelectorAll(".carousel-card");
        if (cards.length === 0) return;

        const targetCard = cards[centerIdx] as HTMLElement;
        const containerWidth = container.offsetWidth;
        const cardLeft = targetCard.offsetLeft;
        const cardWidth = targetCard.offsetWidth;
        const scrollPosition = cardLeft - containerWidth / 2 + cardWidth / 2;

        container.scrollTo({
          left: scrollPosition,
          behavior: "smooth",
        });

        setCenterIndex(centerIdx);
      }, 100);
    }
  }, [pulls.length]);

  const selectedPull = centerIndex >= 3 ? pulls[centerIndex - 3] : null;

  const targetCardName = useMemo(() => {
    if (!selectedPull) return "";

    const parts = [
      selectedPull.year ?? "",
      selectedPull.name,
      selectedPull.set_name ?? "",
      selectedPull.rarity,
      selectedPull.grading_company
        ? `${selectedPull.grading_company} ${selectedPull.grade}`
        : undefined,
    ];

    return parts.filter(Boolean).join(" ");
  }, [selectedPull]);

  if (pulls.length === 0) return null;

  return (
    <GradientLiquidGlass className="space-y-8" padding="lg" rounded="2xl">
      {/* Carousel Header */}
      <div className="text-center space-y-2">
        <h2
          className="text-3xl font-loos-extended-bold text-white"
          style={{
            textShadow: "0 5px 5px rgba(0,0,0,0.5)",
          }}
        >
          Recent Catches
        </h2>
      </div>

      {/* Cards Carousel */}
      <div className="relative">
        {/* Navigation Buttons */}
        <button
          onClick={() => scrollToIndex(Math.max(3, centerIndex - 1))}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
          disabled={centerIndex === 3}
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>

        <button
          onClick={() =>
            scrollToIndex(Math.min(pulls.length + 2, centerIndex + 1))
          }
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
          disabled={centerIndex === pulls.length + 2}
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>

        {/* Cards Container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="overflow-x-auto scrollbar-hide scroll-smooth relative"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div className="flex items-center py-8 relative">
            {/* Left spacer */}
            <div
              className="flex-shrink-0"
              style={{
                minWidth: `${spacerWidth}px`,
                height: "20px",
              }}
            />

            {/* Dummy cards at the beginning */}
            {[...Array(3)].map((_, dummyIndex) => {
              const adjustedIndex = dummyIndex - 3; // Negative indices for dummy cards
              const distance = Math.abs(adjustedIndex - centerIndex);
              let scale, opacity;

              if (distance === 0) {
                scale = 1;
                opacity = 1;
              } else if (distance === 1) {
                scale = 0.85;
                opacity = 0.7;
              } else if (distance === 2) {
                scale = 0.7;
                opacity = 0.4;
              } else if (distance === 3) {
                scale = 0.55;
                opacity = 0.2;
              } else {
                scale = 0.55;
                opacity = 0;
              }

              const zIndex = pulls.length - distance;

              // Calculate margin for dummy cards
              let marginLeft;
              if (dummyIndex === 0) {
                marginLeft = 0;
              } else {
                const prevDistance = Math.abs(adjustedIndex - 1 - centerIndex);
                let prevScale;

                if (prevDistance === 0) prevScale = 1;
                else if (prevDistance === 1) prevScale = 0.85;
                else if (prevDistance === 2) prevScale = 0.7;
                else prevScale = 0.55;

                const minScale = Math.min(scale, prevScale);

                if (minScale >= 0.85) marginLeft = overlapLarge;
                else if (minScale >= 0.7) marginLeft = overlapMedium;
                else marginLeft = overlapSmall;
              }

              return (
                <div
                  key={`dummy-${dummyIndex}`}
                  className="carousel-card flex-shrink-0 transition-all duration-300"
                  data-index={adjustedIndex}
                  style={{
                    transform: `scale(${scale * baseScale})`,
                    opacity: opacity,
                    zIndex,
                    marginLeft: `${marginLeft}px`,
                    pointerEvents: "none", // Make dummy cards non-interactive
                  }}
                >
                  {/* Always show card back for dummy cards */}
                  <div className="relative w-80 h-[450px] rounded-2xl overflow-hidden">
                    <Image
                      src="https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg"
                      alt="Pokemon card back"
                      fill
                      className="object-contain"
                    />
                  </div>
                </div>
              );
            })}

            {pulls.map((pull, index) => {
              const adjustedIndex = index + 3; // Shift real cards by 3 positions
              const distance = Math.abs(adjustedIndex - centerIndex);
              let scale, opacity;

              if (distance === 0) {
                // Center card - largest
                scale = 1;
                opacity = 1;
              } else if (distance === 1) {
                // Adjacent cards - medium-large
                scale = 0.85;
                opacity = 0.7;
              } else if (distance === 2) {
                // Second tier - medium
                scale = 0.7;
                opacity = 0.4;
              } else if (distance === 3) {
                // Third tier - smallest but visible
                scale = 0.55;
                opacity = 0.2;
              } else {
                // Beyond 7-card view - fade out
                scale = 0.55;
                opacity = 0;
              }

              const zIndex = pulls.length - distance;

              // Dynamic spacing based on the smaller of current and previous card scales
              let marginLeft;
              if (adjustedIndex === 3) {
                // First real card (after 3 dummies)
                marginLeft = overlapSmall; // Connect to last dummy card
              } else {
                const prevDistance = Math.abs(adjustedIndex - 1 - centerIndex);
                let prevScale;

                if (prevDistance === 0) prevScale = 1;
                else if (prevDistance === 1) prevScale = 0.85;
                else if (prevDistance === 2) prevScale = 0.7;
                else prevScale = 0.55;

                // Use the smaller scale to determine overlap - smaller cards need more overlap
                const minScale = Math.min(scale, prevScale);

                if (minScale >= 0.85) marginLeft = overlapLarge; // Large cards
                else if (minScale >= 0.7) marginLeft = overlapMedium; // Medium cards
                else marginLeft = overlapSmall; // Small cards
              }

              const gradeLabel = pull.grading_company
                ? `${pull.grading_company} ${pull.grade}`
                : "";

              return (
                <div
                  key={pull.id}
                  className="carousel-card flex-shrink-0 cursor-pointer transition-all duration-300"
                  data-index={adjustedIndex}
                  style={{
                    transform: `scale(${scale * baseScale})`,
                    opacity: opacity,
                    zIndex,
                    marginLeft: `${marginLeft}px`,
                  }}
                  onClick={() => scrollToIndex(adjustedIndex)}
                >
                  {distance === 0 ? (
                    <div className="relative w-80 h-[450px]">
                      <CardHolo
                        card={pull}
                        badge={gradeLabel}
                        onClick={() => scrollToIndex(adjustedIndex)}
                      />
                    </div>
                  ) : (
                    <div className="relative w-80 h-[450px] group rounded-2xl overflow-hidden">
                      {gradeLabel && (
                        <div className="absolute bottom-[10px] right-[10px] z-30 badge">
                          {gradeLabel}
                        </div>
                      )}
                      <Image
                        src={pull.image_large}
                        alt={pull.name}
                        fill
                        className="object-contain"
                        priority={distance <= 2}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Right spacer */}
            <div
              className="flex-shrink-0"
              style={{
                minWidth: `${spacerWidth}px`,
                height: "20px",
              }}
            />
          </div>
        </div>
      </div>

      {/* Selected Card Details */}
      {selectedPull && (
        <div className="w-full mx-auto p-4">
          <div className="text-center space-y-2 text-white font-loose-">
            <h3 className="text-xl font-loos-extra-wide-medium uppercase">
              {targetCardName}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div className="flex md:hidden items-center justify-center border-2 border-white/20 bg-gradient-to-b from-[#FDFFA3]/0 via-[#91B9BF]/41 to-[#FDFFA3]/83  rounded-xl p-2 py-3">
                <div
                  className="text-lg text-white font-bold text-contrast"
                  style={{ textShadow: "0 0 2px #ffffff81" }}
                >
                  ${selectedPull.market_price}
                </div>
              </div>

              <div className="border-2 border-white/20 rounded-xl p-2 py-3">
                <p className="text-white/60 text-xs">Year</p>
                <p className="font-medium">{selectedPull.year ?? "N/A"}</p>
              </div>

              <div className="hidden md:flex items-center justify-center border-2 border-white/20 bg-gradient-to-b from-[#FDFFA3]/0 via-[#91B9BF]/41 to-[#FDFFA3]/83  rounded-xl p-2 py-3">
                <div
                  className="text-lg text-white font-bold text-contrast"
                  style={{ textShadow: "0 0 2px #ffffff81" }}
                >
                  ${selectedPull.market_price}
                </div>
              </div>

              <div className="border-2 border-white/20 rounded-xl p-2 py-3">
                <p className="text-white/60 text-xs">Grade</p>
                <p className="font-medium capitalize">
                  {selectedPull.grading_company
                    ? selectedPull.grading_company + " " + selectedPull.grade
                    : selectedPull.grade}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </GradientLiquidGlass>
  );
}
