"use client";

import { useState } from "react";
import {
  Send,
  Loader,
  Copy,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUSDCBalance } from "@/hooks/use-usdc-balance";
import { toast } from "sonner";
import Image from "next/image";
import { useAuthStore } from "@/lib/stores/auth-store";
import { assetUrl } from "@/lib/assets";

interface USDCWalletDialogProps {
  children?: React.ReactNode;
}

export function USDCWalletDialog({ children }: USDCWalletDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const { user: authUser } = useAuthStore();
  const {
    balance: usdcBalance,
    isLoading: isLoadingUSDC,
    refetch: refetchUSDC,
  } = useUSDCBalance();

  const handleCopyAddress = () => {
    if (authUser?.embedded_address) {
      navigator.clipboard.writeText(authUser.embedded_address);
      toast.success("Wallet address copied to clipboard");
    }
  };

  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      refetchUSDC();
    }
  };

  const handleRefreshBalance = () => {
    refetchUSDC();
  };
  return null;
  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image
              src={assetUrl("balance_icon.png")}
              alt="Wallet"
              width={0}
              height={0}
              className="w-10 h-10"
              unoptimized
            />
            Wallet Manager
          </DialogTitle>
          <DialogDescription>
            Deposit or withdraw tokens on Avalanche
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex rounded-lg bg-gray-100 dark:bg-gray-900 p-1">
            <button
              onClick={() => setActiveTab("deposit")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === "deposit"
                  ? "bg-white dark:bg-gray-800 shadow-sm"
                  : "hover:bg-gray-200 dark:hover:bg-gray-800"
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              Deposit
            </button>
            <button
              onClick={() => setActiveTab("withdraw")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === "withdraw"
                  ? "bg-white dark:bg-gray-800 shadow-sm"
                  : "hover:bg-gray-200 dark:hover:bg-gray-800"
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              Withdraw
            </button>
          </div>

          {/* Current Balance */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  USDC Balance
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold">
                    {isLoadingUSDC ? (
                      <Loader className="w-5 h-5 animate-spin" />
                    ) : (
                      `${usdcBalance} USDC`
                    )}
                  </p>
                  <button
                    onClick={handleRefreshBalance}
                    disabled={isLoadingUSDC}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Refresh balance"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${
                        isLoadingUSDC ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Network</p>
                <p className="text-sm font-medium">Avalanche</p>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "deposit" ? (
            <>
              {/* Deposit Options */}
              <div className="space-y-3">
                {/* Transfer from External Wallet */}
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <Send className="w-5 h-5" />
                      <p className="font-medium">
                        Transfer from External Wallet
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Send USDC on Avalanche
                    </p>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground">
                          Your address on
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full font-medium">
                          Avalanche
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopyAddress}
                          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                          title="Copy address"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <div className="flex-1 p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs break-all">
                          0x...
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Deposit Info */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-2">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  💡 USDC deposits typically arrive within 1-2 minutes.
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                  ⚠️ Important: Only send USDC on Avalanche. Sending on wrong
                  network may result in loss of funds.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <Button disabled className="w-full cursor-wait">
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                  Withdraw USDC
                </Button>
              </div>

              {/* Withdrawal Info */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg space-y-2">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  ⏱️ Withdrawals on Avalanche coming soon.
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
