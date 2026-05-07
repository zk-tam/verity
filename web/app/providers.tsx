"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { ReactNode, useState } from "react";
import { AuthSyncProvider } from "@/components/auth-sync-provider";

const solanaRpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const solanaRpcSubscriptionsUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_WS_URL ||
  solanaRpcUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
const privyAppId =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID ||
  "0000000000000000000000000";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  );

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#000000",
          logo: "",
          walletChainType: "solana-only",
        },

        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors({
              shouldAutoConnect: false,
            }),
          },
        },
        solana: {
          rpcs: {
            "solana:mainnet": {
              rpc: createSolanaRpc(solanaRpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                solanaRpcSubscriptionsUrl
              ),
              blockExplorerUrl: "https://explorer.solana.com",
            },
          },
        },
        loginMethods: ["email", "google", "twitter", "wallet"],
      }}
    >
      <AuthSyncProvider>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </AuthSyncProvider>
    </PrivyProvider>
  );
}
