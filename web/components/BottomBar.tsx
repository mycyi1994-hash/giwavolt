"use client";

import { useAccount } from "wagmi";
import { money } from "@/lib/format";

export default function BottomBar({ balance, live, price }: { balance: number; live: number; price: number }) {
  const { isConnected } = useAccount();
  return (
    <div className="relative flex h-8 shrink-0 items-center gap-5 border-t border-line bg-ink/70 px-4 font-mono text-[11px] tracking-wider text-muted backdrop-blur">
      <span className="flex items-center gap-1.5 text-cyan">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-flicker" /> ONLINE · GIWA SEPOLIA
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        WALLET
        <span className={isConnected ? "text-lime" : "text-faint"}>{isConnected ? "CONNECTED" : "—"}</span>
      </span>
      <span className="hidden sm:inline">
        ETH <span className="text-lime tabular">{money(price, 2)}</span>
      </span>
      <div className="ml-auto flex items-center gap-5">
        <span>
          LIVE BETS <span className="text-magenta tabular">{live}</span>
        </span>
        <span>
          BAL <span className="text-cyan tabular">{money(balance)}</span>
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-magenta/50 to-transparent" />
    </div>
  );
}
