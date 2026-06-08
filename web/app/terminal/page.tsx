"use client";

import Link from "next/link";
import { LineChart, Skull, Trophy, ArrowUpRight } from "lucide-react";
import DiceHand from "@/components/landing/DiceHand";
import { usePlay } from "@/components/play/PlayProvider";
import { usdc, krw } from "@/lib/money";

const CARDS = [
  { href: "/terminal/tap", label: "Tap Trading", desc: "Tap the live price grid. Win stake × multiplier.", icon: LineChart, cls: "text-cyan border-cyan/40", glow: "rgba(0,229,255,.25)" },
  { href: "/terminal/death", label: "Death Fun", desc: "Dodge hidden skulls, climb the leverage, cash out.", icon: Skull, cls: "text-magenta border-magenta/40", glow: "rgba(255,43,214,.25)" },
  { href: "/terminal/leaderboard", label: "Leaderboard", desc: "Top players by realized PnL — 1D / 7D / 30D.", icon: Trophy, cls: "text-gold border-gold/40", glow: "rgba(255,210,63,.2)" },
];

export default function TerminalHome() {
  const { mode, balance } = usePlay();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* hero */}
        <div className="panel clip grid grid-cols-1 items-center gap-4 p-6 md:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 border border-line bg-ink-2 px-2.5 py-1 font-mono text-[10px] tracking-[0.25em] text-cyan clip">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-flicker" /> WELCOME
            </div>
            <h1 className="font-display text-5xl font-black leading-[0.95]">
              <span className="text-txt neon-cyan">BET</span> <span className="text-magenta neon-magenta">FUN</span>
            </h1>
            <p className="mt-3 max-w-md font-sans text-[14px] text-muted">
              Provably-fair, fully on-chain games on GIWA. All play in{" "}
              <span className="text-cyan">USDC</span> & <span className="text-lime">KRW</span>.
            </p>
            <div className="mt-4 inline-flex items-center gap-4 border border-line bg-ink-2 px-4 py-2 clip">
              <span className="font-mono text-[10px] tracking-[0.2em] text-faint">{mode.toUpperCase()} BALANCE</span>
              <span className="tabular font-display text-lg font-bold text-cyan">{usdc(balance[mode])}</span>
              <span className="tabular text-[11px] text-faint">{krw(balance[mode])}</span>
            </div>
          </div>
          <DiceHand className="hidden w-[220px] md:block" />
        </div>

        {/* quick launch */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={`panel clip group relative flex flex-col gap-3 border p-5 transition hover:-translate-y-0.5 ${c.cls}`}
              style={{ boxShadow: `0 0 0 1px transparent` }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 0 22px ${c.glow}`)}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              <c.icon size={26} />
              <div className="font-display text-lg font-bold tracking-wide text-txt">{c.label}</div>
              <p className="font-sans text-[13px] leading-relaxed text-muted">{c.desc}</p>
              <ArrowUpRight size={16} className="absolute right-4 top-4 opacity-40 transition group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
