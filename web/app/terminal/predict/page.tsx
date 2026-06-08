"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, Clock, Search, Settings, Flame } from "lucide-react";
import { CATEGORIES, fmtVolume, genHistory, type Market } from "@/lib/predict";
import { useMarkets } from "@/components/predict/MarketsProvider";
import { useWalletGate } from "@/lib/walletGate";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";

export default function PredictPage() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [q, setQ] = useState("");
  const { markets: all } = useMarkets();
  const { requireWallet } = useWalletGate();
  const toast = useToast();

  const markets = useMemo(
    () => all.filter((m) => (cat === "All" || m.category === cat) && m.question.toLowerCase().includes(q.toLowerCase())),
    [all, cat, q]
  );

  const trade = (e: React.MouseEvent, m: Market, side: "yes" | "no") => {
    e.preventDefault();
    e.stopPropagation();
    if (m.resolved) return;
    requireWallet(() => {
      sfx.place();
      const price = side === "yes" ? m.yes : 100 - m.yes;
      toast.push("info", `BOUGHT ${side.toUpperCase()} @ ${price}¢`, m.question.slice(0, 38) + "…");
    });
  };

  const featured = markets[0];
  const smalls = markets.slice(1, 5);
  const rest = markets.slice(5);

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
              Trade <span className="text-lime">YES</span> / <span className="text-magenta">NO</span> on real-world events — click a market for the order book.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 border border-line bg-ink-2 px-3 py-2 clip">
              <Search size={14} className="text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search markets…" className="w-40 bg-transparent text-[13px] text-txt outline-none placeholder:text-faint" />
            </div>
            <Link href="/terminal/admin" className="flex items-center gap-1.5 border border-line bg-ink-2 px-3 py-2 font-display text-[12px] font-bold text-muted clip transition hover:border-cyan/50 hover:text-cyan">
              <Settings size={14} /> MANAGE
            </Link>
          </div>
        </div>

        {/* categories */}
        <div className="mb-5 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`clip px-3.5 py-1.5 font-display text-[12px] font-bold tracking-wide transition ${
                c === cat ? "border border-cyan bg-cyan/10 text-cyan animate-glow" : "border border-line bg-ink-2 text-muted hover:text-txt"
              }`}
            >
              {c.toUpperCase()}
            </button>
          ))}
        </div>

        {markets.length === 0 && <p className="py-16 text-center font-mono text-sm text-faint">No markets match.</p>}

        {/* featured */}
        {featured && <Featured m={featured} onTrade={trade} />}

        {/* small row */}
        {smalls.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {smalls.map((m) => (
              <SmallCard key={m.id} m={m} onTrade={trade} />
            ))}
          </div>
        )}

        {/* full grid */}
        {rest.length > 0 && (
          <>
            <div className="mb-3 mt-7 font-mono text-[10px] tracking-[0.25em] text-faint">ALL MARKETS</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((m) => (
                <MarketCard key={m.id} m={m} onTrade={trade} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type TradeFn = (e: React.MouseEvent, m: Market, s: "yes" | "no") => void;

function YesNo({ m, onTrade, size = "md" }: { m: Market; onTrade: TradeFn; size?: "sm" | "md" }) {
  const pad = size === "sm" ? "py-1.5 text-[12px]" : "py-2 text-[13px]";
  return (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={(e) => onTrade(e, m, "yes")} disabled={!!m.resolved} className={`clip border border-lime/50 bg-lime/10 font-display font-bold text-lime transition hover:bg-lime/20 disabled:opacity-30 ${pad}`}>
        YES {m.yes}¢
      </button>
      <button onClick={(e) => onTrade(e, m, "no")} disabled={!!m.resolved} className={`clip border border-magenta/50 bg-magenta/10 font-display font-bold text-magenta transition hover:bg-magenta/20 disabled:opacity-30 ${pad}`}>
        NO {100 - m.yes}¢
      </button>
    </div>
  );
}

function Tag({ m }: { m: Market }) {
  return (
    <div className="flex items-center justify-between font-mono text-[10px] tracking-wider">
      <span className="border border-line bg-ink-2 px-2 py-0.5 text-cyan clip">{m.category.toUpperCase()}</span>
      {m.resolved ? (
        <span className={`clip px-2 py-0.5 font-bold ${m.resolved === "yes" ? "bg-lime/20 text-lime" : "bg-magenta/20 text-magenta"}`}>RESOLVED · {m.resolved.toUpperCase()}</span>
      ) : (
        <span className="flex items-center gap-1 text-faint"><Clock size={11} /> {m.ends}</span>
      )}
    </div>
  );
}

function Featured({ m, onTrade }: { m: Market; onTrade: TradeFn }) {
  const hist = genHistory(m, 40);
  const up = hist[hist.length - 1] >= hist[0];
  const col = up ? "#39ff14" : "#ff2bd6";
  const w = 520;
  const h = 90;
  const min = Math.min(...hist);
  const max = Math.max(...hist);
  const rng = max - min || 1;
  const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * w},${h - ((v - min) / rng) * (h - 8) - 4}`).join(" ");
  return (
    <Link href={`/terminal/predict/${m.id}`} className="panel clip block p-5 transition hover:-translate-y-0.5 animate-glow" style={{ borderColor: "rgba(0,229,255,0.4)" }}>
      <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex items-center gap-1.5 border border-gold/60 bg-gold/15 px-2.5 py-0.5 font-display text-[11px] font-black tracking-widest text-gold clip">
              <Flame size={12} /> FEATURED
            </span>
            <Tag m={m} />
          </div>
          <h2 className="font-display text-2xl font-black leading-tight text-txt">{m.question}</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="tabular font-display text-4xl font-black text-cyan neon-cyan">{m.yes}%</span>
            <span className={`font-mono text-[12px] font-bold ${m.change >= 0 ? "text-lime" : "text-magenta"}`}>{m.change >= 0 ? "▲" : "▼"} {Math.abs(m.change)}pts</span>
            <span className="font-mono text-[11px] text-faint">· Vol {fmtVolume(m.volume)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <svg viewBox={`0 0 ${w} ${h}`} className="h-[90px] w-full">
            <polyline points={`0,${h} ${pts} ${w},${h}`} fill={`rgba(${up ? "57,255,20" : "255,43,214"},0.07)`} />
            <polyline points={pts} fill="none" stroke={col} strokeWidth={2} style={{ filter: `drop-shadow(0 0 5px ${col})` }} />
          </svg>
          <YesNo m={m} onTrade={onTrade} />
        </div>
      </div>
    </Link>
  );
}

function SmallCard({ m, onTrade }: { m: Market; onTrade: TradeFn }) {
  return (
    <Link href={`/terminal/predict/${m.id}`} className="panel clip flex flex-col gap-2 p-3 transition hover:-translate-y-0.5">
      <Tag m={m} />
      <p className="line-clamp-2 min-h-[34px] font-display text-[13px] font-bold leading-snug text-txt">{m.question}</p>
      <div className="flex items-baseline gap-1">
        <span className="tabular font-display text-xl font-black text-cyan">{m.yes}%</span>
        <span className="font-mono text-[9px] text-faint">YES</span>
      </div>
      <YesNo m={m} onTrade={onTrade} size="sm" />
    </Link>
  );
}

function MarketCard({ m, onTrade }: { m: Market; onTrade: TradeFn }) {
  const up = m.change >= 0;
  const w = 84;
  const h = 30;
  const min = Math.min(...m.spark);
  const max = Math.max(...m.spark);
  const rng = max - min || 1;
  const pts = m.spark.map((v, i) => `${(i / (m.spark.length - 1)) * w},${h - ((v - min) / rng) * h}`).join(" ");
  const col = up ? "#39ff14" : "#ff2bd6";
  return (
    <Link href={`/terminal/predict/${m.id}`} className="panel clip flex flex-col gap-3 p-4 transition hover:-translate-y-0.5">
      <Tag m={m} />
      <p className="min-h-[40px] font-display text-[15px] font-bold leading-snug text-txt">{m.question}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="tabular font-display text-3xl font-black text-cyan neon-cyan">{m.yes}%</span>
          <span className="font-mono text-[10px] text-faint">YES</span>
        </div>
        <svg width={w} height={h} className="overflow-visible">
          <polyline points={pts} fill="none" stroke={col} strokeWidth={1.6} style={{ filter: `drop-shadow(0 0 4px ${col})` }} />
        </svg>
      </div>
      <YesNo m={m} onTrade={onTrade} />
      <div className="flex items-center justify-between font-mono text-[11px] text-faint">
        <span>Vol {fmtVolume(m.volume)}</span>
        <span className={up ? "text-lime" : "text-magenta"}>{up ? "▲" : "▼"} {Math.abs(m.change)}pts 24h</span>
      </div>
    </Link>
  );
}
