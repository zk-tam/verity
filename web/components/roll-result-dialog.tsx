"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RollResponse, Token } from "@/hooks/use-roll";
import { GradientLiquidGlass } from "./gradient-liquid-glass";
import { CardHolo } from "./CardHolo";
import { Flame, PackageOpen } from "lucide-react";
import { useAudio, AUDIO_PRESETS, AUDIO_IDS } from "@/hooks/use-audio";
import Image from "next/image";
import { Card } from "@/hooks/use-gacha-machines";
import { useUSDCBalance } from "@/hooks/use-usdc-balance";
import { toast } from "sonner";

const buildCardName = (card: Card) => {
  return (card.year ?? "") + " " + card.name + " " + card.set_name;
};

interface DialogCloseOptions {
  preserveAudio?: boolean;
}

interface RollResultDialogProps {
  isOpen: boolean;
  onClose: (options?: DialogCloseOptions) => void;
  rollResult: RollResponse | null;
  gachaMachineOdds?: {
    ev: number;
    odds: Record<string, number>;
  };
}

export function RollResultDialog({
  isOpen,
  onClose,
  rollResult,
  gachaMachineOdds,
}: RollResultDialogProps) {
  const { addBalance } = useUSDCBalance();
  const audio = useAudio({ cleanupOnUnmount: false });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [hasPlayedAudio, setHasPlayedAudio] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setSelectedCards(new Set());
      setHasPlayedAudio(false);
    }
  }, [isOpen]);

  // Play audio when dialog opens - must be before any conditional returns
  useEffect(() => {
    if (
      isOpen &&
      rollResult &&
      rollResult.tokens.length > 0 &&
      !hasPlayedAudio
    ) {
      // Determine tier for audio selection based on the best card
      const getBestTier = () => {
        if (!gachaMachineOdds) return "Unknown";

        let bestTier = "Common";
        const tierOrder = ["Epic", "Rare", "Uncommon", "Common"];

        for (const token of rollResult.tokens) {
          const price = token.market_price;
          const sortedRanges = Object.entries(gachaMachineOdds.odds).sort(
            ([, a], [, b]) => b - a,
          );

          const tierNames = ["Common", "Uncommon", "Rare", "Epic"];

          for (let i = 0; i < sortedRanges.length; i++) {
            const [range] = sortedRanges[i];
            const cleanRange = range.replace(/\$/g, "");
            const rangeParts = cleanRange.split("-");

            if (rangeParts.length === 2) {
              const [min, max] = rangeParts.map(Number);

              if (!isNaN(min) && !isNaN(max) && price >= min && price <= max) {
                const currentTier = tierNames[i];
                if (
                  tierOrder.indexOf(currentTier) < tierOrder.indexOf(bestTier)
                ) {
                  bestTier = currentTier;
                }
                break;
              }
            }
          }
        }

        return bestTier;
      };

      const bestTier = getBestTier();
      const isCommonOrUncommon =
        bestTier === "Common" || bestTier === "Uncommon";
      const audioPreset = isCommonOrUncommon
        ? AUDIO_PRESETS.postGachaMeh
        : AUDIO_PRESETS.postGacha;

      audio.play(AUDIO_IDS.POST_GACHA, audioPreset.src, {
        volume: audioPreset.volume,
      });

      setHasPlayedAudio(true);
    }
  }, [isOpen, rollResult, gachaMachineOdds, hasPlayedAudio, audio]);

  if (!rollResult || !rollResult.tokens || rollResult.tokens.length === 0)
    return null;

  const currentToken = rollResult.tokens[currentIndex];
  const currentCard = currentToken.card;
  const isSingleCard = rollResult.tokens.length === 1;
  const currentCardName = buildCardName(currentCard);
  const currentGradeLabel = currentToken.grading_company
    ? `${currentToken.grading_company} ${currentToken.grade}`
    : undefined;

  // const isCurrentUngraded =
  //   typeof currentToken.grade === "string" &&
  //   currentToken.grade.toLowerCase() === "ungraded";

  // const tierGradeLabel = !isCurrentUngraded ? currentGradeLabel : undefined;

  const handleSellSelected = () => {
    if (!rollResult || selectedCards.size === 0) return;

    const selectedCount = selectedCards.size;
    const totalBuyback = rollResult.tokens
      .filter((t) => selectedCards.has(t.id))
      .reduce((sum, t) => sum + t.amount_buyback_insured, 0);

    addBalance(totalBuyback);
    const preset = AUDIO_PRESETS.buybackSuccess;
    audio.play(AUDIO_IDS.BUYBACK_SUCCESS, preset.src, {
      volume: preset.volume,
    });
    onClose({ preserveAudio: true });
    toast.success(
      `Sold ${selectedCount} card${selectedCount > 1 ? "s" : ""} for $${totalBuyback.toFixed(2)}`,
    );
  };

  const handleSellAll = () => {
    if (!rollResult) return;

    const totalBuyback = rollResult.tokens.reduce(
      (sum, t) => sum + t.amount_buyback_insured,
      0,
    );

    addBalance(totalBuyback);
    const preset = AUDIO_PRESETS.buybackSuccess;
    audio.play(AUDIO_IDS.BUYBACK_SUCCESS, preset.src, {
      volume: preset.volume,
    });
    onClose({ preserveAudio: true });
    toast.success(`Sold all cards for $${totalBuyback.toFixed(2)}`);
  };

  const handleToggleCard = (tokenId: number) => {
    const newSelected = new Set(selectedCards);
    if (newSelected.has(tokenId)) {
      newSelected.delete(tokenId);
    } else {
      newSelected.add(tokenId);
    }
    setSelectedCards(newSelected);
  };

  // Determine tier based on market price
  const getTierInfo = (token: Token) => {
    if (!gachaMachineOdds)
      return { tier: "Unknown", color: "#666", gradient: "#666" };

    const price = token.market_price;
    const sortedRanges = Object.entries(gachaMachineOdds.odds).sort(
      ([, a], [, b]) => b - a,
    );

    const tierNames = ["Common", "Uncommon", "Rare", "Epic"];
    const tierColors = [
      ["hsla(219, 14%, 51%, 1)", "hsla(205, 28%, 72%, 1)"],
      ["hsla(157, 57%, 44%, 1)", "hsla(89, 33%, 69%, 1)"],
      ["hsla(217, 49%, 46%, 1)", "hsla(201, 100%, 67%, 1)"],
      ["hsla(234, 59%, 60%, 1)", "hsla(254, 52%, 69%, 1)"],
    ];

    for (let i = 0; i < sortedRanges.length; i++) {
      const [range] = sortedRanges[i];
      const cleanRange = range.replace(/\$/g, "");
      const rangeParts = cleanRange.split("-");

      if (rangeParts.length === 2) {
        const [min, max] = rangeParts.map(Number);

        if (!isNaN(min) && !isNaN(max) && price >= min && price <= max) {
          return {
            tier: tierNames[i],
            color: tierColors[i][1],
            gradient: `linear-gradient(to right, ${tierColors[i][0]}, ${tierColors[i][1]})`,
          };
        }
      }
    }

    return { tier: "Unknown", color: "#666", gradient: "#666" };
  };

  // const { tier, gradient } = getTierInfo(currentToken);

  const isSelected = selectedCards.has(currentToken.id);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="w-[700px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-0 border-0 bg-transparent">
        <GradientLiquidGlass className="w-full">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-loos-extra-wide-medium text-white">
              {isSingleCard
                ? currentCardName
                : `Your Catches (${currentIndex + 1}/${rollResult.tokens.length})`}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {/* Main Card Display */}
            <div
              className={`relative mx-auto transition-all ${
                isSingleCard ? "w-full" : "w-2/3"
              }`}
              onClick={() => !isSingleCard && handleToggleCard(currentToken.id)}
            >
              <CardHolo
                card={{
                  name: currentCardName,
                  image_large: currentToken.uri_content.image,
                }}
                badge={currentGradeLabel}
                onClick={() => {}}
              />
              {!isSingleCard && isSelected && (
                <div className="absolute top-2 right-16 bg-orange-500 text-white rounded-full p-2">
                  <Flame className="size-5" />
                </div>
              )}
            </div>

            {/* Thumbnail Grid for Multiple Cards */}
            {!isSingleCard && (
              <div className="mt-10">
                <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                  {rollResult.tokens.map((token, index) => {
                    const isCurrentCard = index === currentIndex;
                    const isCardSelected = selectedCards.has(token.id);
                    const { tier: cardTier } = getTierInfo(token);
                    const cardName = buildCardName(token.card);

                    return (
                      <div
                        key={token.id}
                        className={`relative cursor-pointer transition-all duration-200 rounded-md overflow-hidden w-16 ${
                          isCurrentCard
                            ? "ring-1 ring-white ring-offset-1 ring-offset-transparent scale-105 z-20"
                            : "hover:scale-105 z-0"
                        } ${isCardSelected ? "ring-1 ring-orange-500" : ""}`}
                        onClick={() => {
                          setCurrentIndex(index);
                          if (isCardSelected) {
                            handleToggleCard(token.id);
                          }
                        }}
                      >
                        <div className="relative aspect-[3/4] w-full">
                          <Image
                            src={token.uri_content.image}
                            alt={cardName}
                            fill
                            sizes="64px"
                            className="object-cover"
                            unoptimized
                          />

                          {/* Tier indicator */}
                          <div className="absolute top-0.5 left-0.5">
                            <div
                              className="w-1.5 h-1.5 rounded-full"
                              style={{
                                background:
                                  cardTier === "Epic"
                                    ? "#9333ea"
                                    : cardTier === "Rare"
                                      ? "#2563eb"
                                      : cardTier === "Uncommon"
                                        ? "#059669"
                                        : "#6b7280",
                              }}
                            />
                          </div>

                          {/* Selection indicator */}
                          {isCardSelected && (
                            <div className="absolute top-0.5 right-0.5 bg-orange-500 text-white rounded-full p-0.5">
                              <Flame className="w-2 h-2" />
                            </div>
                          )}

                          {/* Price overlay */}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] py-0.5 px-1 text-center">
                            ${token.market_price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Card Details */}
            <div className="flex flex-wrap justify-center items-center space-y-2 mt-8">
              {!isSingleCard && (
                <div className="w-full text-center text-lg font-semibold text-white">
                  {currentCardName}
                </div>
              )}

              {/* Tier Badge */}
              {/* <div className="flex justify-center mb-4">
                <span
                  className="px-4 py-2 rounded-full text-white font-semibold text-lg"
                  style={{
                    background: gradient,
                    boxShadow: "0 0 10px 0 rgba(255, 255, 255, 0.5)",
                  }}
                >
                  {tier}
                  {tierGradeLabel && ` • ${tierGradeLabel}`}
                </span>
              </div> */}

              {/* <p
                className="text-2xl font-semibold text-contrast"
                style={{ textShadow: "0 0 2px #ffffff81" }}
              >
                ${currentToken.market_price.toFixed(2)}
              </p> */}

              <div className="items-center justify-center border-2 border-white/20 bg-gradient-to-b from-[#FDFFA3]/0 via-[#91B9BF]/41 to-[#FDFFA3]/83 rounded-xl p-2 px-3">
                <div
                  className="text-lg text-white font-bold text-contrast"
                  style={{ textShadow: "0 0 2px #ffffff81" }}
                >
                  ${currentToken.market_price.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Actions */}
            {isSingleCard ? (
              <div className="flex justify-center gap-3 mt-5">
                <Button
                  variant="outline"
                  className="flex-shrink-0"
                  onClick={() => onClose()}
                >
                  <PackageOpen className="w-4 h-4 mr-2" />
                  Keep to Bag
                </Button>
                <Button
                  className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 flex-shrink-0"
                  onClick={() => {
                    const amount = currentToken.amount_buyback_insured;
                    addBalance(amount);
                    const preset = AUDIO_PRESETS.buybackSuccess;
                    audio.play(AUDIO_IDS.BUYBACK_SUCCESS, preset.src, {
                      volume: preset.volume,
                    });
                    onClose({ preserveAudio: true });
                    toast.success(`Sold for $${amount.toFixed(2)}`);
                  }}
                >
                  <Flame className="w-4 h-4 mr-2" />
                  {`Sell Back ($${currentToken.amount_buyback_insured.toFixed(2)})`}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 mt-5">
                {/* Selection Summary */}
                {selectedCards.size > 0 && (
                  <div className="text-center text-sm text-white/80">
                    {selectedCards.size} card{selectedCards.size > 1 ? "s" : ""}{" "}
                    selected for sale • Total value: $
                    {rollResult.tokens
                      .filter((t) => selectedCards.has(t.id))
                      .reduce((sum, t) => sum + t.amount_buyback_insured, 0)
                      .toFixed(2)}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => handleToggleCard(currentToken.id)}
                    className="flex-shrink-0"
                  >
                    <Flame className="w-4 h-4 mr-2" />
                    {isSelected ? "Unselect" : "Select"} Current
                  </Button>

                  {selectedCards.size > 0 && (
                    <Button
                      className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 flex-shrink-0"
                      onClick={handleSellSelected}
                    >
                      <Flame className="w-4 h-4 mr-2" />
                      {`Sell Selected (${selectedCards.size})`}
                    </Button>
                  )}

                  <Button
                    className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 flex-shrink-0"
                    onClick={handleSellAll}
                  >
                    <Flame className="w-4 h-4 mr-2" />
                    {`Sell All ($${rollResult.amount_buyback_insured.toFixed(2)})`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </GradientLiquidGlass>
      </DialogContent>
    </Dialog>
  );
}
