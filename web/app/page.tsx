"use client";

import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Zap, Rocket, Terminal } from "lucide-react";
import DiceHand from "@/components/landing/DiceHand";
import { useWalletGate } from "@/lib/walletGate";

export default function Landing() {
  const router = useRouter();
  const { requireWallet } = useWalletGate();

  // any interaction requires a wallet first
  const go = (path: string) => () => requireWallet(() => router.push(path));

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center px-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center bg-gradient-to-br from-cyan to-magenta text-[#06060e] clip animate-glow">
            <Zap size={17} strokeWidth={2.6} />
          </div>
          <span className="font-display text-[16px] font-black tracking-[0.2em] text-txt neon-cyan">VOLT</span>
        </div>
        <div className="ml-auto">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>
      </header>

      {/* hero */}
      <main className="grid min-h-0 flex-1 place-items-center px-6">
        <div className="grid w-full max-w-5xl grid-cols-1 items-center gap-8 md:grid-cols-2">
          {/* left: copy + CTAs */}
          <div className="order-2 md:order-1">
            <div className="mb-3 inline-flex items-center gap-2 border border-line bg-ink-2 px-3 py-1 font-mono text-[10px] tracking-[0.25em] text-cyan clip">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-flicker" /> ON-CHAIN · GIWA SEPOLIA
            </div>
            <h1 className="font-display text-6xl font-black leading-[0.95] tracking-tight sm:text-7xl">
              <span className="block text-txt neon-cyan">BET</span>
              <span className="block text-magenta neon-magenta">FUN</span>
            </h1>
            <p className="mt-4 max-w-md font-sans text-[15px] leading-relaxed text-muted">
              Tap the line. Dodge the skulls. Provably-fair, fully on-chain games settled in{" "}
              <span className="text-cyan">USDC</span> &amp; <span className="text-lime">KRW</span> on GIWA.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                onClick={go("/swap")}
                className="btn-neon clip flex items-center gap-2 bg-cyan/10 px-6 py-3 font-display text-sm font-bold tracking-wide text-cyan"
              >
                <Rocket size={17} /> LAUNCH APP
              </button>
              <button
                onClick={go("/terminal/tap")}
                className="clip flex items-center gap-2 border border-magenta/60 bg-magenta/10 px-6 py-3 font-display text-sm font-bold tracking-wide text-magenta transition hover:bg-magenta/20"
                style={{ boxShadow: "0 0 14px rgba(255,43,214,.25)" }}
              >
                <Terminal size={17} /> LAUNCH TERMINAL
              </button>
            </div>
            <p className="mt-3 font-mono text-[11px] text-faint">
              Connect a wallet to enter · Launch App → swap · Launch Terminal → games
            </p>
          </div>

          {/* right: art */}
          <div className="order-1 flex justify-center md:order-2">
            <DiceHand className="w-[320px] max-w-full drop-shadow-[0_0_40px_rgba(255,43,214,0.25)] sm:w-[400px]" />
          </div>
        </div>
      </main>

      <footer className="shrink-0 px-6 pb-4 text-center font-mono text-[10px] tracking-widest text-faint">
        VOLT · BET FUN — Tap Trading · Death Fun · Leaderboard
      </footer>
    </div>
  );
}
