"use client";

import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth-store";
import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { Copy, Wallet } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { assetUrl } from "@/lib/assets";
// import { toast } from 'sonner' // Unused for now

interface UserProfileDialogProps {
  onLogout: () => void;
}

export function UserProfileDialog({ onLogout }: UserProfileDialogProps) {
  const { user: storeUser } = useAuthStore();
  const { user: privyUser, linkWallet } = usePrivy();
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const walletAddress =
    storeUser?.wallet?.address ??
    storeUser?.solana_address ??
    storeUser?.embedded_address ??
    privyUser?.wallet?.address ??
    null;
  const solanaWallets =
    privyUser?.linkedAccounts?.filter(
      (account: any) =>
        account.type === "wallet" &&
        (account.chainType === "solana" || account.chain_type === "solana")
    ) ?? [];

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    setIsOpen(false);
    onLogout();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button className="w-10 h-10 min-[381px]:w-11 min-[381px]:h-11 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-[hsl(var(--glass-gradient-start))]/20 to-[hsl(var(--glass-gradient-end))]/20 backdrop-blur-md backdrop-saturate-150 border border-white/20 shadow-[0_4px_8px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.1)] flex items-center justify-center hover:from-[hsl(var(--glass-gradient-start))]/30 hover:to-[hsl(var(--glass-gradient-end))]/30 transition-all duration-300">
              <div className="relative w-7 h-7 min-[381px]:w-8 min-[381px]:h-8 md:w-10 md:h-10">
                <Image
                  src={assetUrl("profile_icon.png")}
                  alt="Profile"
                  fill
                  className="object-contain"
                />
              </div>
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Profile</p>
        </TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>

        {!showLogoutConfirm ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-sm">
                {storeUser?.name ||
                  privyUser?.email?.address?.split("@")[0] ||
                  "Not provided"}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="text-sm">
                {storeUser?.email ||
                  privyUser?.email?.address ||
                  "Not provided"}
              </p>
            </div>

            {storeUser?.x_handle && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">X</p>
                <p className="text-sm">@{storeUser.x_handle}</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Referral Code
              </p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono">
                  {storeUser?.referral_code || "Not available"}
                </p>
                <button
                  onClick={() => {
                    if (storeUser?.referral_code) {
                      navigator.clipboard.writeText(storeUser.referral_code);
                      toast.success("Referral code copied to clipboard");
                    }
                  }}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <Copy className="!size-4" />
                </button>
              </div>
            </div>

            {/* Wallets Section */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  Connected Wallets
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => linkWallet({ walletChainType: "solana-only" })}
                >
                  Link wallet
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {walletAddress && (
                  <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs break-all">
                        {walletAddress}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(walletAddress);
                          toast.success("Wallet address copied to clipboard");
                        }}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Copy address"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {solanaWallets
                  .filter((wallet: any) => wallet.address !== walletAddress)
                  .map((wallet: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <Wallet className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {wallet.walletClientType || wallet.connectorType || "Solana wallet"}
                        </p>
                        <p className="text-xs font-mono truncate">{wallet.address}</p>
                      </div>
                    </div>
                  ))}

                {!walletAddress && solanaWallets.length === 0 && (
                    <div className="text-center py-4">
                      <Wallet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No wallets connected
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Connect a Solana wallet to get started
                      </p>
                    </div>
                  )}
              </div>
            </div>

            <div className="w-full pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowLogoutConfirm(true)}
              >
                Logout
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">Are you sure you want to logout?</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleLogout}
              >
                Logout
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
