"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Zap } from "lucide-react";
import SwapCard from "@/components/swap/SwapCard";

export default function SwapPage() {
  return (
    <div className="flex h-screen flex-col">
      {/* slim top bar */}
      <header className="relative flex h-14 shrink-0 items-center gap-4 border-b border-line bg-ink/70 px-4 backdrop-blur">
        {/* brand */}
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center bg-gradient-to-br from-cyan to-magenta text-[#06060e] clip animate-glow">
            <Zap size={17} strokeWidth={2.6} />
          </div>
          <div className="font-display text-[17px] font-black tracking-[0.18em] text-txt neon-cyan">
            VOLT
          </div>
        </div>

        <Link
          href="/"
          className="ml-2 border border-line bg-ink-2 px-2.5 py-1 font-mono text-[10px] tracking-wider text-muted transition hover:border-line-strong hover:text-cyan clip"
        >
          ← HOME
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>

        {/* neon underline */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan/60 to-transparent" />
      </header>

      {/* centered swap card */}
      <main className="flex flex-1 items-center justify-center overflow-auto p-4">
        <SwapCard />
      </main>
    </div>
  );
}
