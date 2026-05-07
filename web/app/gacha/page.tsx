"use client";

import { useEffect, useState, Suspense, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useGachaMachines,
  type GachaMachine,
  type Card,
} from "@/hooks/use-gacha-machines";
import { GradientLiquidGlass } from "@/components/gradient-liquid-glass";
import { NeuButton } from "@/components/neu-button";
import { Loader } from "lucide-react";
import Image from "next/image";
import { useRoll, type RollResponse } from "@/hooks/use-roll";
import { RollResultDialog } from "@/components/roll-result-dialog";
import { useAudio, AUDIO_PRESETS, AUDIO_IDS } from "@/hooks/use-audio";
import { EpicChaseCardsCarousel } from "@/components/epic-chase-cards-carousel";
import { assetUrl, staticAssetUrl } from "@/lib/assets";

type OddsTierMeta = {
  label: string;
  probability: number;
  min: number;
  max: number;
  tierName?: string;
};

const parseCurrencyValue = (value?: string | number | null) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parsePriceRangeBounds = (range: string): { min: number; max: number } => {
  const sanitized = range.replace(/,/g, "");
  const numberMatches = sanitized.match(/\d+(\.\d+)?/g);
  let min = 0;
  let max = Infinity;

  if (!numberMatches || numberMatches.length === 0) {
    return { min, max };
  }

  const numbers = numberMatches.map(Number);
  const hasPlus = /\+/.test(range);
  const hasUnder = /(under|below|less)/i.test(range);
  const hasOver = /(over|above|more)/i.test(range);

  if (numbers.length === 1) {
    if (hasUnder) {
      return { min: 0, max: numbers[0] };
    }

    if (hasOver || hasPlus) {
      return { min: numbers[0], max: Infinity };
    }

    return { min: numbers[0], max: numbers[0] };
  }

  min = Math.min(numbers[0], numbers[1]);
  max = Math.max(numbers[0], numbers[1]);

  if (hasPlus || hasOver) {
    max = Infinity;
  }

  return { min, max };
};

const groupCardsByOddsTier = (
  cards: Card[],
  tiers: OddsTierMeta[],
): Record<string, Card[]> => {
  const groups = tiers.reduce<Record<string, Card[]>>((acc, tier) => {
    acc[tier.label] = [];
    return acc;
  }, {});

  if (tiers.length === 0 || cards.length === 0) {
    return groups;
  }

  const lowestTier = tiers[0];
  const highestTier = tiers[tiers.length - 1];

  cards.forEach((card) => {
    const price = parseCurrencyValue(
      card.market_price ?? card.uri_content?.price ?? 0,
    );

    const matchingTier =
      tiers.find((tier) => price >= tier.min && price <= tier.max) ||
      (price >= highestTier.min ? highestTier : lowestTier);

    groups[matchingTier.label].push(card);
  });

  return groups;
};

function GachaPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const { data: gachaMachines, isLoading, error } = useGachaMachines();
  const rollMutation = useRoll();
  const [selectedMachine, setSelectedMachine] = useState<GachaMachine | null>(
    null,
  );
  const [rollResult, setRollResult] = useState<RollResponse | null>(null);
  const [showRollAnimation, setShowRollAnimation] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const degenMode = 1;
  // const [turboMode, setTurboMode] = useState(false);
  const [showWhiteTransition, setShowWhiteTransition] = useState(false);
  const [whiteTransitionOpacity, setWhiteTransitionOpacity] = useState(0);
  const [fadeOutAnimation, setFadeOutAnimation] = useState(false);
  const [isWaitingForResult, setIsWaitingForResult] = useState(false);
  const [animationEnded, setAnimationEnded] = useState(false);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousMachineIdRef = useRef<number | null>(null);
  const { play, stop, stopAll, stopAllExcept, setVolume, isPlaying } =
    useAudio();

  const tierNames = useMemo(() => ["Common", "Uncommon", "Rare", "Epic"], []);
  const tierColors: [string, string][] = [
    ["#F4F4F4", "#A1A1A1"],
    ["#B8EB7A", "#3EC79E"],
    ["#BEC2FF", "#FFBD66"],
  ];
  const tierColorMap = tierNames.reduce<Record<string, [string, string]>>(
    (acc, name, index) => {
      if (tierColors[index]) {
        acc[name] = tierColors[index];
      }
      return acc;
    },
    {},
  );

  const getTierColor = (tierName?: string): [string, string] => {
    if (tierName && tierColorMap[tierName]) {
      return tierColorMap[tierName];
    }
    return tierColors[tierColors.length - 1];
  };

  const oddsTiers = useMemo<OddsTierMeta[]>(() => {
    if (!selectedMachine?.odds_description) return [];

    const tiers = Object.entries(selectedMachine.odds_description.odds)
      .map(([label, probability]) => {
        const { min, max } = parsePriceRangeBounds(label);
        return {
          label,
          probability,
          min,
          max,
        };
      })
      .sort((a, b) => a.min - b.min);

    return tiers.map((tier, index) => ({
      ...tier,
      tierName: tierNames[index],
    }));
  }, [selectedMachine?.odds_description, tierNames]);

  const cardsByOddsTier = useMemo(
    () => groupCardsByOddsTier(selectedMachine?.cards ?? [], oddsTiers),
    [selectedMachine?.cards, oddsTiers],
  );

  const getCardTiers = useMemo(
    () =>
      oddsTiers.reduce<
        Record<
          string,
          {
            oddsPct: number;
            priceRange: string;
            cards: Card[];
            tierName?: string;
          }
        >
      >((acc, tier) => {
        acc[tier.label] = {
          oddsPct: tier.probability * 100,
          priceRange: tier.label,
          cards: cardsByOddsTier[tier.label] ?? [],
          tierName: tier.tierName,
        };
        return acc;
      }, {}),
    [oddsTiers, cardsByOddsTier],
  );

  const highestOddsTier =
    oddsTiers.length > 0 ? oddsTiers[oddsTiers.length - 1] : undefined;

  const epicChaseCards = useMemo(
    () => gachaMachines?.flatMap((m) => m.cards ?? []) ?? [],
    [gachaMachines],
  );

  const epicChaseCardMetadata = useMemo(() => {
    if (!highestOddsTier) {
      return {
        priceRange: "N/A",
        oddsPct: 0,
        tierName: "Epic",
      };
    }

    const tierData = getCardTiers[highestOddsTier.label];
    const tierTitle =
      tierData?.tierName ?? highestOddsTier.tierName ?? highestOddsTier.label;

    return {
      priceRange: tierData?.priceRange ?? highestOddsTier.label,
      oddsPct: tierData?.oddsPct ?? highestOddsTier.probability * 100,
      tierName: tierTitle,
    };
  }, [highestOddsTier, getCardTiers]);

  const nonEpicTierSections = useMemo(() => {
    if (!highestOddsTier) return [];

    return oddsTiers
      .filter((tier) => tier.label !== highestOddsTier.label)
      .map((tier) => {
        const tierData = getCardTiers[tier.label];
        return {
          key: tier.label,
          title: tierData?.tierName ?? tier.tierName ?? tier.label,
          priceRange: tierData?.priceRange ?? tier.label,
          oddsPct: tierData?.oddsPct ?? tier.probability * 100,
          cards: tierData?.cards ?? [],
        };
      })
      .filter((section) => section.cards.length > 0)
      .sort((a, b) => a.oddsPct - b.oddsPct);
  }, [highestOddsTier, oddsTiers, getCardTiers]);

  const handleResultDialogClose = (options?: { preserveAudio?: boolean }) => {
    setShowResultDialog(false);
    setAnimationEnded(false);
    setIsWaitingForResult(false);
    setRollResult(null);
    setShowRollAnimation(false);
    setShowWhiteTransition(false);
    setWhiteTransitionOpacity(0);
    setFadeOutAnimation(false);
    // Clear any existing timeouts
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
    // Stop audio while optionally preserving success chime
    if (options?.preserveAudio) {
      stopAllExcept([AUDIO_IDS.BUYBACK_SUCCESS]);
    } else {
      stopAll();
    }
    const bgmPreset = AUDIO_PRESETS.loungeBgm;
    play(AUDIO_IDS.ENTER_GACHA_PAGE, bgmPreset.src, {
      volume: showRollAnimation ? 0 : bgmPreset.volume,
      loop: true,
    });
  };

  useEffect(() => {
    const preset = AUDIO_PRESETS.loungeBgm;

    const startPlayback = () => {
      if (!isPlaying(AUDIO_IDS.ENTER_GACHA_PAGE)) {
        play(AUDIO_IDS.ENTER_GACHA_PAGE, preset.src, {
          volume: preset.volume,
          loop: true,
        });
      }
    };

    startPlayback();

    const handleInteraction = () => {
      startPlayback();
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };

    window.addEventListener("pointerdown", handleInteraction, { once: false });
    window.addEventListener("keydown", handleInteraction, { once: false });
    window.addEventListener("touchstart", handleInteraction, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
      stop(AUDIO_IDS.ENTER_GACHA_PAGE);
    };
  }, [play, stop, isPlaying]);

  useEffect(() => {
    const preset = AUDIO_PRESETS.loungeBgm;
    if (showRollAnimation) {
      setVolume(AUDIO_IDS.ENTER_GACHA_PAGE, 0);
    } else {
      setVolume(AUDIO_IDS.ENTER_GACHA_PAGE, preset.volume);
    }
  }, [showRollAnimation, setVolume]);

  // All machines reuse the same gacha_1 assets (single image/video set)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getPriceFromName = (_name: string): string => "1";

  useEffect(() => {
    if (!gachaMachines || gachaMachines.length === 0) return;

    if (id) {
      // Find machine by id (convert string to number)
      const machine = gachaMachines.find((m) => m.id === parseInt(id));
      if (machine) {
        setSelectedMachine(machine);
      } else {
        // If id not found, redirect to first machine
        router.push(`/gacha?id=${gachaMachines[0].id}`);
      }
    } else {
      // No id provided, redirect to first machine
      router.push(`/gacha?id=1`);
    }
  }, [id, gachaMachines, router]);

  useEffect(() => {
    if (!selectedMachine) return;

    if (
      previousMachineIdRef.current !== null &&
      previousMachineIdRef.current !== selectedMachine.id
    ) {
      const preset = AUDIO_PRESETS.machineChange;
      play(AUDIO_IDS.GACHA_MACHINE_CHANGE, preset.src, {
        volume: preset.volume,
      });
    }

    previousMachineIdRef.current = selectedMachine.id;
  }, [selectedMachine, play]);

  // Effect to handle when result arrives after animation has ended
  useEffect(() => {
    if (
      rollResult &&
      animationEnded &&
      isWaitingForResult &&
      !showRollAnimation
    ) {
      setShowResultDialog(true);
      setIsWaitingForResult(false);
    }
  }, [rollResult, animationEnded, isWaitingForResult, showRollAnimation]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader className="w-8 h-8 animate-spin text-white" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-white">
          <p>Error loading gacha machines</p>
        </div>
      </div>
    );
  }

  if (!selectedMachine) {
    return null;
  }

  return (
    <div className="w-full max-w-[1600px] container mx-auto px-4 mt-4">
      <GradientLiquidGlass className="rounded-3xl p-4 md:p-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left side - Gacha Console (1/4 width) */}
          <div className="w-full lg:w-1/4">
            <div className="flex gap-3">
              {gachaMachines?.map((machine) => (
                <div
                  key={machine.id}
                  className={`relative group cursor-pointer transition-all duration-300 backdrop-blur-sm rounded-lg overflow-hidden ${
                    selectedMachine?.id != machine.id &&
                    "hover:translate-y-[20%]"
                  }`}
                  style={
                    selectedMachine?.id === machine.id
                      ? {
                          transform: "translateY(60%)",
                        }
                      : {}
                  }
                  onClick={() => router.push(`/gacha?id=${machine.id}`)}
                >
                  <div className="relative w-full">
                    <Image
                      src={assetUrl("gacha_machine_card.png")}
                      alt="Gacha Machine Card"
                      width={150}
                      height={100}
                      className="w-full h-auto"
                      priority
                    />

                    {/* Card Image */}
                    <div className="absolute w-[80%] h-[60%] z-10 bottom-[10%] left-1/2 -translate-x-1/2">
                      <Image
                        src={staticAssetUrl(`gacha_${getPriceFromName(
                          machine.name,
                        )}_thumbnail_still.webp`)}
                        alt={machine.name}
                        fill
                        className="object-cover block group-hover:hidden"
                      />
                      <Image
                        src={staticAssetUrl(`gacha_${getPriceFromName(
                          machine.name,
                        )}_thumbnail.webp`)}
                        alt={machine.name}
                        fill
                        className="object-cover hidden group-hover:block"
                      />
                    </div>

                    {/* Card Details */}
                    <div
                      className="absolute w-[80%] h-[30%] top-[10%] z-10 left-1/2 -translate-x-1/2 backdrop-blur-sm rounded-t-lg"
                      // style={{
                      //   background: `linear-gradient(to left, ${
                      //     gachaOptionCardGradient[machine.id][0]
                      //   }, ${gachaOptionCardGradient[machine.id][1]})`,
                      // }}
                    >
                      <div className="relative w-full h-full">
                        <div className="absolute w-[80%] text-center top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-[80%] text-white">
                          {machine.name}
                        </div>
                      </div>
                      {/* <p className="hidden md:block text-xs text-white text-center line-clamp-2">
                        {machine.description}
                      </p> */}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative w-full">
              {/* Console Background */}
              <Image
                src={assetUrl("gacha_console.png")}
                alt="Gacha Console"
                width={800}
                height={600}
                className="w-full h-auto"
                priority
              />

              {/* Machine Image inside Console Screen */}
              <div className="absolute z-10 top-[5%] left-1/2 -translate-x-1/2 w-[80%] h-[46%] rounded-lg overflow-hidden bg-white">
                <div className="relative aspect-[1/1] h-full">
                  <motion.div
                    key={selectedMachine.id}
                    className="absolute inset-0"
                    initial={{ opacity: 0, filter: "blur(30px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  >
                    <Image
                      src={staticAssetUrl(`gacha_${getPriceFromName(
                        selectedMachine.name,
                      )}_thumbnail.webp`)}
                      alt={selectedMachine.name}
                      fill
                      className="object-cover"
                      priority
                      loading="eager"
                      fetchPriority="high"
                    />
                  </motion.div>
                </div>
              </div>

              <div className="absolute top-[57%] left-1/2 -translate-x-1/2 w-[80%]">
                <div className="flex flex-col justify-center items-center mt-5 space-y-3">
                  <NeuButton
                    onClick={() => {
                      // Play pre-gacha sound
                      play(AUDIO_IDS.PRE_GACHA, AUDIO_PRESETS.preGacha.src, {
                        volume: AUDIO_PRESETS.preGacha.volume,
                      });

                      // Reset states
                      setRollResult(null);
                      setAnimationEnded(false);
                      setIsWaitingForResult(false);

                      // Reset mutation state before starting new roll
                      rollMutation.reset();

                      // Start the roll mutation
                      rollMutation.mutate(
                        {
                          gacha_machine_id: selectedMachine.id,
                          batch_roll_count: degenMode,
                        },
                        {
                          onSuccess: (data) => {
                            setRollResult(data);
                            // If animation already ended, show result immediately
                            if (animationEnded) {
                              setShowResultDialog(true);
                              setIsWaitingForResult(false);
                            }
                          },
                          onError: () => {
                            // Clear animation timeout if it exists
                            if (animationTimeoutRef.current) {
                              clearTimeout(animationTimeoutRef.current);
                              animationTimeoutRef.current = null;
                            }

                            // Reset all states on error
                            setShowRollAnimation(false);
                            setShowWhiteTransition(false);
                            setWhiteTransitionOpacity(0);
                            setFadeOutAnimation(false);
                            setAnimationEnded(false);
                            setIsWaitingForResult(false);
                          },
                        },
                      );

                      // Start animation after 500ms regardless of mutation result
                      animationTimeoutRef.current = setTimeout(() => {
                        // Always start animation (don't check mutation error state)
                        // Start white fade in
                        setShowWhiteTransition(true);
                        setTimeout(() => {
                          setWhiteTransitionOpacity(1);
                        }, 50);
                        // After fade in completes, start animation and fade out white screen
                        setTimeout(() => {
                          setShowRollAnimation(true);
                          setWhiteTransitionOpacity(0);
                        }, 1000);
                        // Remove white screen after fade out completes
                        setTimeout(() => {
                          setShowWhiteTransition(false);
                        }, 1500);
                      }, 500);
                    }}
                    variant="sm"
                    className="uppercase"
                    disabled={
                      rollMutation.isPending ||
                      showRollAnimation ||
                      isWaitingForResult
                    }
                  >
                    {rollMutation.isPending ||
                    showRollAnimation ||
                    isWaitingForResult ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin mr-2 inline" />
                      </>
                    ) : (
                      "Catch Now"
                    )}
                  </NeuButton>
                </div>
              </div>
            </div>
          </div>
          <div className="w-full lg:w-3/4">
            <div>
              <EpicChaseCardsCarousel
                cards={epicChaseCards!}
                epicMetadata={epicChaseCardMetadata}
              />
            </div>
          </div>
        </div>

        {/* Top Chase Cards - Other Tiers */}
        {nonEpicTierSections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10 items-stretch">
            {nonEpicTierSections.map(
              ({ key, title, priceRange, oddsPct, cards }) => {
                const colorPair = getTierColor(title);
                return (
                  <div
                    key={key}
                    className="bg-white/30 backdrop-md rounded-3xl p-6 max-h-[520px] flex flex-col"
                    style={{
                      boxShadow: "inset 0 0 5px 0 rgba(0, 0, 0, 0.3)",
                      border: "3px solid rgba(255, 255, 255, 0.2)",
                      background: `${colorPair[1]}50`,
                    }}
                  >
                    <div
                      className="sticky top-0 z-10 pb-4 rounded-2xl px-4 pt-3 text-black/70"
                      style={{
                        background: `linear-gradient(180deg, ${colorPair[0]}, ${colorPair[1]})`,
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-2xl font-loos-extra-wide-medium uppercase">
                            {title}
                          </div>
                          <p className="text-sm text-[#040404]/40">
                            {priceRange}
                          </p>
                        </div>
                        <div className="text-sm text-lg font-bold bg-black/30 text-white rounded-full px-4 py-1">
                          {oddsPct.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex-1 overflow-y-auto scrollbar-hide pr-1">
                      <div className="grid grid-cols-2 gap-4 items-stretch">
                        {cards.map((card) => {
                          const cardName =
                            (card.year ?? "") +
                            " " +
                            card.name +
                            " " +
                            card.set_name;

                          return (
                            <div
                              key={card.id}
                              className="group h-full flex flex-col hover:scale-[1.02] transition-transform duration-300 p-1"
                            >
                              <div className="space-y-2 flex-1 flex flex-col">
                                <div className="relative aspect-[3/4] w-full">
                                  <Image
                                    src={card.image_large || card.image_small}
                                    alt={card.name}
                                    fill
                                    className="object-contain rounded-md"
                                  />
                                  {card.grading_company && card.grade && (
                                    <div className="absolute bottom-[10px] right-[10px] z-30 !text-[9px] badge">
                                      {card.grading_company} {card.grade}
                                    </div>
                                  )}
                                </div>
                                <div className="text-center space-y-1 mt-2">
                                  <p className="text-[10px] md:text-xs font-medium text-white line-clamp-2">
                                    {cardName}
                                  </p>
                                  {card.market_price && (
                                    <p className="text-sm font-bold text-white">
                                      ${card.market_price}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        ) : (
          selectedMachine.cards &&
          selectedMachine.cards.length > 0 && (
            <div className="space-y-4 mt-10">
              <h3 className="text-2xl font-loos-extra-wide-medium uppercase text-white">
                Top Chase Cards
              </h3>
              <div className="overflow-x-auto scrollbar-hide">
                <div
                  className="flex gap-4 pb-2"
                  style={{ width: "max-content" }}
                >
                  {selectedMachine.cards.map((card) => {
                    const cardName =
                      (card.year ?? "") + " " + card.name + " " + card.set_name;

                    return (
                      <div
                        key={card.id}
                        className="group cursor-pointer hover:scale-105 transition-transform duration-300 p-3 rounded-lg flex-shrink-0"
                        style={{ width: "200px" }}
                      >
                        <div className="space-y-2">
                          <div className="relative aspect-[3/4] w-full">
                            <Image
                              src={card.image_large || card.image_small}
                              alt={card.name}
                              fill
                              className="object-contain rounded-md"
                            />
                            {card.grading_company && card.grade && (
                              <div className="absolute bottom-[10px] right-[10px] z-30 !text-[9px] badge">
                                {card.grading_company} {card.grade}
                              </div>
                            )}
                          </div>
                          <div className="text-center space-y-1">
                            <p className="text-sm font-medium text-white">
                              {cardName}
                            </p>
                            {card.market_price && (
                              <p className="text-sm font-bold text-contrast">
                                ${card.market_price}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        )}

        {/* Roll Result Dialog */}
        <RollResultDialog
          isOpen={showResultDialog}
          onClose={handleResultDialogClose}
          rollResult={rollResult}
          gachaMachineOdds={selectedMachine?.odds_description}
        />
      </GradientLiquidGlass>

      {/* White Transition Overlay */}
      {showWhiteTransition && (
        <div
          className="fixed inset-0 bg-white z-50 transition-opacity duration-500 ease-in-out"
          style={{ opacity: whiteTransitionOpacity }}
        />
      )}

      {/* Full Screen Roll Animation */}
      {showRollAnimation && (
        <div
          className={`fixed inset-0 bg-black z-50 flex items-center justify-center transition-opacity duration-1000 ${
            fadeOutAnimation ? "opacity-0" : "opacity-100"
          }`}
        >
          <video
            ref={(el) => {
              if (el) el.volume = 0.2;
            }}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            onEnded={() => {
              setAnimationEnded(true);

              // Check if result is ready
              if (rollResult) {
                // Start fade out
                setFadeOutAnimation(true);
                // After fade out, hide animation and show result
                setTimeout(() => {
                  setShowRollAnimation(false);
                  setFadeOutAnimation(false);
                  setShowResultDialog(true);
                  setIsWaitingForResult(false);
                }, 1000);
              } else {
                // Keep waiting for result
                setIsWaitingForResult(true);
                // Hide animation but keep button in "Catching..." state
                setFadeOutAnimation(true);
                setTimeout(() => {
                  setShowRollAnimation(false);
                  setFadeOutAnimation(false);
                }, 1000);
              }
            }}
          >
            <source
              src={staticAssetUrl(`gacha_${getPriceFromName(
                selectedMachine.name,
              )}_animation.webm`)}
              type="video/webm"
            />
          </video>
        </div>
      )}
    </div>
  );
}

export default function GachaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white"></div>
        </div>
      }
    >
      <GachaPageContent />
    </Suspense>
  );
}
