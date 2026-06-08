"use client";

import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { usdc, krw, pct } from "@/lib/money";
import { getLeaderboard, type Category, type Period } from "@/lib/leaderboard";

type Accent = "cyan" | "magenta";

const CATEGORIES: { id: Category; label: string; accent: Accent }[] = [
  { id: "tap", label: "TAP TRADING", accent: "cyan" },
  { id: "death", label: "DEATH FUN", accent: "magenta" },
];

const PERIODS: Period[] = ["1D", "7D", "30D"];

// Full literal class strings so Tailwind's JIT scanner emits them.
const TITLE_CLS: Record<Accent, string> = {
  cyan: "text-cyan neon-cyan",
  magenta: "text-magenta neon-magenta",
};
const SEG_ACTIVE: Record<Accent, string> = {
  cyan: "border border-cyan bg-cyan/10 text-cyan animate-glow",
  magenta: "border border-magenta bg-magenta/10 text-magenta animate-glow",
};
const TAB_ACTIVE: Record<Accent, string> = {
  cyan: "border border-cyan bg-cyan/10 text-cyan neon-cyan",
  magenta: "border border-magenta bg-magenta/10 text-magenta neon-magenta",
};

export default function LeaderboardPage() {
  const [category, setCategory] = useState<Category>("tap");
  const [period, setPeriod] = useState<Period>("7D");

  const rows = useMemo(() => getLeaderboard(category, period), [category, period]);
  const accent: Accent = category === "tap" ? "cyan" : "magenta";

  return (
    <div className="flex h-full flex-col gap-4 p-5 md:p-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className={`font-display text-2xl font-black tracking-[0.12em] md:text-3xl ${TITLE_CLS[accent]}`}
          >
            LEADERBOARD
          </h1>
          <p className="mt-1 font-mono text-[11px] tracking-[0.18em] text-faint">
            Top players by realized PnL · USDC
          </p>
        </div>

        {/* period selector */}
        <div className="panel clip flex items-center gap-1 p-1">
          {PERIODS.map((p) => {
            const active = p === period;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`clip px-3.5 py-1.5 font-mono text-[12px] font-bold tabular tracking-wide transition ${
                  active ? SEG_ACTIVE[accent] : "border border-transparent text-muted hover:text-txt"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* category sub-tabs */}
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIES.map((c) => {
          const active = c.id === category;
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`clip py-2.5 font-display text-[13px] font-bold tracking-[0.14em] transition ${
                active
                  ? TAB_ACTIVE[c.accent]
                  : "border border-line bg-ink-2 text-muted hover:border-line-strong hover:text-txt"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* table */}
      <div className="panel clip flex min-h-0 flex-1 flex-col">
        {/* head */}
        <div className="grid grid-cols-[56px_1fr_auto_110px] items-center gap-3 border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">Total PnL</span>
          <span className="text-right">Return</span>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((r) => {
            const pnlPos = r.pnl >= 0;
            const retPos = r.returnPct >= 0;
            const rankColor =
              r.rank === 1 ? "text-gold" : r.rank === 2 ? "text-cyan" : r.rank === 3 ? "text-magenta" : "text-faint";
            const rankGlow =
              r.rank === 1 ? "neon-lime" : r.rank === 2 ? "neon-cyan" : r.rank === 3 ? "neon-magenta" : "";

            return (
              <div
                key={r.rank}
                className="grid grid-cols-[56px_1fr_auto_110px] items-center gap-3 border-b border-line/40 px-4 py-2.5 transition hover:bg-white/[0.02]"
              >
                {/* rank */}
                <div className={`tabular flex items-center gap-1.5 text-[15px] font-black ${rankColor}`}>
                  {r.rank === 1 && <Trophy size={14} className="text-gold" strokeWidth={2.5} />}
                  <span className={r.rank <= 3 ? rankGlow : ""}>#{r.rank}</span>
                </div>

                {/* player */}
                <div className="truncate font-mono text-[13px] font-semibold text-txt">{r.handle}</div>

                {/* total pnl */}
                <div className="text-right">
                  <div className={`tabular text-[14px] font-bold ${pnlPos ? "text-lime" : "text-magenta"}`}>
                    {pnlPos ? "+" : "−"}
                    {usdc(Math.abs(r.pnl))}
                  </div>
                  <div className="tabular text-[11px] text-faint">{krw(Math.abs(r.pnl))}</div>
                </div>

                {/* return % */}
                <div
                  className={`tabular text-right text-[14px] font-bold ${
                    retPos ? "text-lime neon-lime" : "text-magenta neon-magenta"
                  }`}
                >
                  {pct(r.returnPct)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
