"use client";

import { useMemo, useState } from "react";
import { TrendingUp, Clock, Search } from "lucide-react";
import { MARKETS, CATEGORIES, fmtVolume, type Market } from "@/lib/predict";
import { useWalletGate } from "@/lib/walletGate";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";

export default function PredictPage() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [q, setQ] = useState("");
  const { requireWallet } = useWalletGate();
  const toast = useToast();

  const markets = useMemo(
    () =>
      MARKETS.filter((m) => (cat === "All" || m.category === cat) && m.question.toLowerCase().includes(q.toLowerCase())),
    [cat, q]
  );

  const trade = (m: Market, side: "yes" | "no") => {
    requireWallet(() => {
      sfx.place();
      const price = side === "yes" ? m.yes : 100 - m.yes;
      toast.push("info", `BOUGHT ${side.toUpperCase()} @ ${price}¢`, m.question.slice(0, 38) + "…");
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-6">
        {/* header */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-3xl font-black tracking-wide text-txt neon-cyan">
              <TrendingUp size={26} className="text-cyan" /> PREDICT
            </h1>
            <p className="mt-1 font-sans text-[13px] text-muted">
              Trade <span className="text-lime">YES</span> / <span className="text-magenta">NO</span> on real-world events — price = implied odds.
            </p>
          </div>
          <div className="flex items-center gap-2 border border-line bg-ink-2 px-3 py-2 clip">
            <Search size={14} className="text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search markets…"
              className="w-44 bg-transparent text-[13px] text-txt outline-none placeholder:text-faint"
            />
          </div>
        </div>

        {/* category chips */}
        <div className="mb-5 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const active = c === cat;
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`clip px-3.5 py-1.5 font-display text-[12px] font-bold tracking-wide transition ${
                  active ? "border border-cyan bg-cyan/10 text-cyan animate-glow" : "border border-line bg-ink-2 text-muted hover:text-txt"
                }`}
              >
                {c.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* market grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => (
            <MarketCard key={m.id} m={m} onTrade={trade} />
          ))}
        </div>
        {markets.length === 0 && <p className="py-16 text-center font-mono text-sm text-faint">No markets match.</p>}
      </div>
    </div>
  );
}

function MarketCard({ m, onTrade }: { m: Market; onTrade: (m: Market, s: "yes" | "no") => void }) {
  const up = m.change >= 0;
  return (
    <div className="panel clip flex flex-col gap-3 p-4 transition hover:-translate-y-0.5">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-wider">
        <span className="border border-line bg-ink-2 px-2 py-0.5 text-cyan clip">{m.category.toUpperCase()}</span>
        <span className="flex items-center gap-1 text-faint">
          <Clock size={11} /> {m.ends}
        </span>
      </div>

      <p className="min-h-[40px] font-display text-[15px] font-bold leading-snug text-txt">{m.question}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="tabular font-display text-3xl font-black text-cyan neon-cyan">{m.yes}%</span>
          <span className="font-mono text-[10px] text-faint">YES</span>
        </div>
        <Spark data={m.spark} up={up} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onTrade(m, "yes")}
          className="clip border border-lime/50 bg-lime/10 py-2 font-display text-[13px] font-bold text-lime transition hover:bg-lime/20"
        >
          YES {m.yes}¢
        </button>
        <button
          onClick={() => onTrade(m, "no")}
          className="clip border border-magenta/50 bg-magenta/10 py-2 font-display text-[13px] font-bold text-magenta transition hover:bg-magenta/20"
        >
          NO {100 - m.yes}¢
        </button>
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] text-faint">
        <span>Vol {fmtVolume(m.volume)}</span>
        <span className={up ? "text-lime" : "text-magenta"}>
          {up ? "▲" : "▼"} {Math.abs(m.change)}pts 24h
        </span>
      </div>
    </div>
  );
}

function Spark({ data, up }: { data: number[]; up: boolean }) {
  const w = 84;
  const h = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * h}`)
    .join(" ");
  const col = up ? "#39ff14" : "#ff2bd6";
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={col} strokeWidth={1.6} style={{ filter: `drop-shadow(0 0 4px ${col})` }} />
    </svg>
  );
}
