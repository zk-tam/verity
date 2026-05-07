"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useHoldings } from "@/hooks/use-holdings";
import { GradientLiquidGlass } from "@/components/gradient-liquid-glass";
import { Flame, Loader } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { CardHolo } from "@/components/CardHolo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Holding } from "@/hooks/use-holdings";
import { Button } from "@/components/ui/button";
import { useBatchBuyback } from "@/hooks/use-batch-buyback";
import { useRouter } from "next/navigation";
import { Card } from "@/hooks/use-gacha-machines";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { NeuButton } from "@/components/neu-button";
import { AUDIO_IDS, AUDIO_PRESETS, useAudio } from "@/hooks/use-audio";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function InventoryPage() {
  const { user, ready, authenticated } = usePrivy();
  const { user: authUser } = useAuthStore();
  const router = useRouter();
  const walletAddress =
    authUser?.solana_address ??
    authUser?.embedded_address ??
    authUser?.wallet?.address ??
    user?.wallet?.address;
  const {
    data: holdings,
    isLoading,
    error,
  } = useHoldings(walletAddress ?? undefined);
  const [selectedCard, setSelectedCard] = useState<Holding | null>(null);
  const batchBuybackMutation = useBatchBuyback();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<
    "value-desc" | "value-asc" | "name-asc" | "newest" | "oldest"
  >("newest");
  const queryClient = useQueryClient();
  const audio = useAudio({ cleanupOnUnmount: false });

  const getCardName = (card: Card) => {
    return (card.year ?? "") + " " + card.name + " " + card.set_name;
  };

  const processedHoldings = useMemo(() => {
    if (!holdings) return [];

    const search = searchTerm.trim().toLowerCase();

    const toValue = (holding: Holding) =>
      parseFloat(holding.card.market_price) * holding.amount;

    const filtered = holdings.filter((holding) => {
      if (!search) return true;
      const name = getCardName(holding.card).toLowerCase();
      const setName = holding.card.set_name.toLowerCase();
      const grade = (holding.card.grade ?? "").toLowerCase();
      const company = (holding.card.grading_company ?? "").toLowerCase();
      const rarity = (holding.card.rarity ?? "").toLowerCase();

      return (
        name.includes(search) ||
        setName.includes(search) ||
        grade.includes(search) ||
        company.includes(search) ||
        rarity.includes(search)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case "name-asc":
          return getCardName(a.card).localeCompare(getCardName(b.card));
        case "value-asc":
          return toValue(a) - toValue(b);
        case "newest":
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case "oldest":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case "value-desc":
        default:
          return toValue(b) - toValue(a);
      }
    });

    return sorted;
  }, [holdings, searchTerm, sortOption]);

  const totalValue = useMemo(() => {
    if (!holdings) return 0;

    return holdings.reduce(
      (sum, holding) =>
        sum + parseFloat(holding.card.market_price) * holding.amount,
      0
    );
  }, [holdings]);

  // Redirect to explore page if not logged in
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/explore");
    }
  }, [ready, authenticated, router]);

  const handleSellCard = (tokenId: number) => {
    const currentHolding = holdings?.find((h) => h.token_id === tokenId);
    const sellAmount = currentHolding?.card.amount_buyback_insured ?? 0;
    const cardName = currentHolding ? getCardName(currentHolding.card) : "card";

    batchBuybackMutation.mutate(
      { token_ids: [tokenId] },
      {
        onSuccess: () => {
          const preset = AUDIO_PRESETS.buybackSuccess;
          audio.play(AUDIO_IDS.BUYBACK_SUCCESS, preset.src, {
            volume: preset.volume,
          });
          setSelectedCard(null);
          queryClient.invalidateQueries({ queryKey: ["holdings"] });
          toast.success(`Sold ${cardName} for $${sellAmount.toFixed(2)}`);
        },
      }
    );
  };

  if (!ready || isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <GradientLiquidGlass className="text-center" padding="lg" rounded="xl">
          <p className="text-red-500">Failed to load inventory</p>
          <p className="text-sm text-gray-500 mt-2">{error.message}</p>
        </GradientLiquidGlass>
      </div>
    );
  }

  if (!holdings || holdings.length === 0) {
    return (
      <div className="h-[80vh] p-4 flex items-center justify-center">
        <div className="w-full h-full p-8 text-center mt-4 text-white !bg-black/5 rounded-2xl flex items-center justify-center">
          <div>
            <div
              className="text-xl font-semibold mb-2"
              style={{ textShadow: "0 0 10px rgba(255, 255, 255, 0.5)" }}
            >
              Your Inventory is Empty
            </div>
            <div className="text-sm font-semibold mb-2">
              All Great Journey Starts Small.
            </div>
            <div className="w-full flex justify-center mt-4">
              <NeuButton variant="sm" onClick={() => router.push("/gacha")}>
                Catch Now
              </NeuButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1600px] p-4 space-y-8">
        {/* Header */}
        <GradientLiquidGlass className="text-center" padding="lg" rounded="xl">
          <h1
            className="text-4xl font-loos-extended-bold text-white mb-4"
            style={{ textShadow: "0 5px 5px rgba(0,0,0,0.5)" }}
          >
            My Inventory
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-3 items-center justify-center gap-4 max-w-2xl mx-auto">
            <div className="items-center justify-center border-2 border-white/20 bg-gradient-to-b from-[#FDFFA3]/0 via-[#91B9BF]/41 to-[#FDFFA3]/83 rounded-xl p-2 px-3">
              <p className="text-sm text-white/60">Total Cards</p>
              <p className="text-2xl font-bold text-white">{holdings.length}</p>
            </div>
            <div className="items-center justify-center border-2 border-white/20 bg-gradient-to-b from-[#FDFFA3]/0 via-[#91B9BF]/41 to-[#FDFFA3]/83 rounded-xl p-2 px-3">
              <p className="text-sm text-white/60">Unique Cards</p>
              <p className="text-2xl font-bold text-white">
                {new Set(holdings.map((h) => h.card.name)).size}
              </p>
            </div>
            <div className="items-center justify-center border-2 border-white/20 bg-gradient-to-b from-[#FDFFA3]/0 via-[#91B9BF]/41 to-[#FDFFA3]/83 rounded-xl p-2 px-3">
              <p className="text-sm text-white/60">Total Value</p>
              <p
                className="text-2xl font-bold text-white"
                style={{ textShadow: "0 0 2px #ffffff81" }}
              >
                ${totalValue.toFixed(2)}
              </p>
            </div>
          </div>
        </GradientLiquidGlass>

        {/* Cards Grid */}
        <GradientLiquidGlass padding="lg" rounded="xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, set, grade, or rarity"
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            />
            <div className="flex items-center gap-2">
              <select
                value={sortOption}
                onChange={(event) =>
                  setSortOption(event.target.value as typeof sortOption)
                }
                className="bg-white/10 border border-white/20 text-white text-sm px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-contrast"
              >
                <option value="value-desc">Value (High to Low)</option>
                <option value="value-asc">Value (Low to High)</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {processedHoldings.length === 0 ? (
              <div className="col-span-full py-16 text-center text-white/60">
                No cards match your search.
              </div>
            ) : (
              processedHoldings.map((holding, index) => (
                <div
                  key={holding.token_id}
                  className="group cursor-pointer hover:scale-105 transition-transform duration-300 relative bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20"
                  onClick={() => setSelectedCard(holding)}
                >
                  <div className="relative">
                    {/* Card Image */}
                    <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-white/5 backdrop-blur-sm">
                      {holding.card.grading_company && (
                        <div className="absolute top-2 right-2 z-20 rounded-full bg-white/90 text-contrast shadow-md border border-white/40 px-2 py-1 text-[10px] font-semibold uppercase">
                          {holding.card.grading_company} {holding.card.grade}
                        </div>
                      )}
                      <Image
                        src={holding.card.image_large}
                        alt={holding.card.name}
                        fill
                        className="object-contain"
                        priority={index < 10}
                      />
                    </div>

                    {/* Card Details */}
                    <div className="mt-4 space-y-2">
                      <h3 className="font-semibold text-white text-sm truncate">
                        {getCardName(holding.card)}
                      </h3>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/60">
                          {holding.card.set_name}
                        </span>
                        <span className="text-white/60">
                          {holding.card.rarity}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">FMV</span>
                        <span className="text-sm font-semibold text-contrast">
                          ${holding.card.market_price}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </GradientLiquidGlass>

        {/* Card Detail Dialog */}
        <Dialog
          open={!!selectedCard}
          onOpenChange={() => setSelectedCard(null)}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-transparent p-0">
            <GradientLiquidGlass className="w-full">
              {selectedCard && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-4">
                  {/* Left side - Metadata */}
                  <div className="space-y-8">
                    <div className="w-full text-3xl font-loos-extra-wide-medium text-white">
                      {getCardName(selectedCard.card)}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4 border border-white">
                        <span className="text-sm text-contrast block">Set</span>
                        <span className="text-contrast font-semibold">
                          {selectedCard.card.set_name}
                        </span>
                      </div>
                      <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4 border border-white">
                        <span className="text-sm text-contrast block">
                          Rarity
                        </span>
                        <span className="text-contrast font-semibold">
                          {selectedCard.card.rarity}
                        </span>
                      </div>
                      <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4 border border-white">
                        <span className="text-sm text-contrast block">
                          Acquired
                        </span>
                        <span className="text-contrast font-semibold">
                          {new Date(
                            selectedCard.created_at
                          ).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4 border border-white">
                        <span className="text-sm text-contrast block">
                          Year
                        </span>
                        <span className="text-contrast font-semibold text-lg">
                          {selectedCard.card.year ?? "N/A"}
                        </span>
                      </div>
                    </div>

                    <div className="w-full text-center">
                      <p
                        className="text-2xl font-semibold text-contrast"
                        style={{ textShadow: "0 0 2px #ffffff81" }}
                      >
                        ${selectedCard.card.market_price}
                      </p>
                      <p className="text-sm text-title">Fair Market Value</p>
                    </div>
                  </div>

                  {/* Right side - CardHolo */}
                  <div className="flex justify-center">
                    <GradientLiquidGlass className="w-full max-w-md px-8 py-10 rounded-2xl">
                      <CardHolo
                        card={{
                          name: selectedCard.card.name,
                          image_large: selectedCard.card.image_large,
                        }}
                        badge={
                          selectedCard.card.grading_company
                            ? `${selectedCard.card.grading_company} ${selectedCard.card.grade}`
                            : undefined
                        }
                      />
                    </GradientLiquidGlass>
                  </div>

                  {selectedCard.card.tcgplayer_url && (
                    <div className="flex justify-center gap-2 mt-8 col-span-2">
                      {/* <Button
                        variant="outline"
                        className=""
                        onClick={() =>
                          window.open(selectedCard.card.tcgplayer_url, "_blank")
                        }
                      >
                        <ExternalLink />
                        View Card
                      </Button> */}
                      <Button
                        className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600"
                        onClick={() => handleSellCard(selectedCard.token_id)}
                        disabled={batchBuybackMutation.isPending}
                      >
                        <Flame />
                        {batchBuybackMutation.isPending ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          `Instant Sell ($${selectedCard.card.amount_buyback_insured.toFixed(
                            2
                          )})`
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </GradientLiquidGlass>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
