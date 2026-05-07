"use client";

import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import { SquareArrowOutUpRight } from "lucide-react";
import { createElement } from "react";

export interface WithdrawalParams {
  pre_fee_amount: string;
  to_wallet: string;
}

export interface WithdrawalResponse {
  hash: string;
  fee_tx_hash: string;
  pre_fee_amount_withdrawn: number;
  from_wallet: string;
  to_wallet: string;
  fee_amount: number;
  fee_recipient: string;
}

export function useWithdrawal() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const withdrawFunds = async ({
    pre_fee_amount,
    to_wallet,
  }: WithdrawalParams): Promise<WithdrawalResponse> => {
    // Get Privy access token
    const privyToken = await getAccessToken();
    if (!privyToken) {
      throw new Error("Authentication required");
    }

    const response = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${privyToken}`,
      },
      body: JSON.stringify({ pre_fee_amount, to_wallet }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to withdraw funds");
    }

    return response.json();
  };

  return useMutation({
    mutationFn: withdrawFunds,
    onSuccess: (data) => {
      const amountAfterFee = data.pre_fee_amount_withdrawn + data.fee_amount;
      const shortAddress = `${data.to_wallet.slice(
        0,
        6
      )}...${data.to_wallet.slice(-4)}`;

      queryClient.invalidateQueries({ queryKey: ['usdc-balance'] })

      toast.success(
        `Successfully withdrew ${amountAfterFee} USDC to ${shortAddress}`,
        {
          duration: 8000,
          action: {
            label: createElement(
              "div",
              { className: "flex items-center gap-1" },
              "View Tx",
              createElement(SquareArrowOutUpRight, { size: 14 })
            ),
            onClick: () =>
              window.open(
                `https://explorer.aptoslabs.com/txn/${data.hash}?network=mainnet`,
                "_blank"
              ),
          },
        }
      );
    },
    onError: (error: Error) => {
      console.error("Withdrawal error:", error);
      toast.error(error.message || "Failed to withdraw funds");
    },
  });
}
