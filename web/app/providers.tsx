"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { PlayProvider } from "@/components/play/PlayProvider";
import { MarketsProvider } from "@/components/predict/MarketsProvider";
import { DepositProvider } from "@/components/account/DepositModal";
import { ToastProvider } from "@/components/ui/Toast";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({ accentColor: "#00e5ff", accentColorForeground: "#06060e", borderRadius: "medium" })}
        >
          <PlayProvider>
            <MarketsProvider>
              <ToastProvider>
                <DepositProvider>{children}</DepositProvider>
              </ToastProvider>
            </MarketsProvider>
          </PlayProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
