import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { CHAIN_LABEL } from "@/lib/chain";

export const metadata: Metadata = {
  title: `VOLT ⚡ tap-trading on ${CHAIN_LABEL}`,
  description: `Full on-chain tap-trading game on ${CHAIN_LABEL}. Tap the grid — the live price line decides.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
