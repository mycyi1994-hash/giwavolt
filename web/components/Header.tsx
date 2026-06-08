"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Zap } from "lucide-react";

export default function Header() {
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-4 border-b border-line bg-ink/70 px-4 backdrop-blur">
      {/* brand */}
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center bg-gradient-to-br from-cyan to-magenta text-[#06060e] clip animate-glow">
          <Zap size={17} strokeWidth={2.6} />
        </div>
        <div className="leading-none">
          <div className="font-display text-[17px] font-black tracking-[0.18em] text-txt neon-cyan">
            VOLT
          </div>
          <div className="font-mono text-[9px] tracking-[0.25em] text-faint">TAP·TRADING</div>
        </div>
      </div>

      <span className="ml-2 hidden items-center gap-1.5 border border-line bg-ink-2 px-2.5 py-1 font-mono text-[10px] tracking-wider text-cyan clip sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-flicker" />
        GIWA SEPOLIA · 91342
      </span>

      <div className="ml-auto flex items-center gap-3">
        <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
      </div>

      {/* neon underline */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan/60 to-transparent" />
    </header>
  );
}
