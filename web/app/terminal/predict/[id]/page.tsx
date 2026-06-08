"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, TrendingUp, AlertTriangle, Layers, Combine } from "lucide-react";
import { useMarkets } from "@/components/predict/MarketsProvider";
import { genBook, genHistory, marketBuy, fmtVolume, type Market } from "@/lib/predict";
import { useWalletGate } from "@/lib/walletGate";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";

export default function MarketDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const { markets } = useMarkets();
  const m = markets.find((x) => x.id === id);

  if (!m) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="font-display text-lg text-muted">Market not found.</p>
          <Link href="/terminal/predict" className="mt-3 inline-block text-cyan">← Back to Predict</Link>
        </div>
      </div>
    );
  }
  return <Detail m={m} />;
}

function Detail({ m }: { m: Market }) {
  const book = useMemo(() => genBook(m), [m]);
  const history = useMemo(() => genHistory(m), [m]);
  const { requireWallet } = useWalletGate();
  const toast = useToast();

  const [side, setSide] = useState<"yes" | "no">("yes");
  const [type, setType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState(side === "yes" ? m.yes : 100 - m.yes);
  const [shares, setShares] = useState(100);
  const [splitAmt, setSplitAmt] = useState(50);

  const bestAsk = book.asks[0]?.price ?? m.yes;
  const bestBid = book.bids[0]?.price ?? m.yes;
  const mkt = marketBuy(book, shares);
  const slipHigh = mkt.slippagePct > 2.5;
  const cost = type === "market" ? (mkt.avg * shares) / 100 : (price * shares) / 100;

  const submit = () => {
    if (!!m.resolved) return;
    requireWallet(() => {
      sfx.place();
      if (type === "market" && slipHigh) {
        toast.push("info", `⚠ HIGH SLIPPAGE ${mkt.slippagePct.toFixed(1)}%`, "filled anyway (demo)");
      }
      const px = type === "market" ? Math.round(mkt.avg) : price;
      toast.push("info", `BUY ${side.toUpperCase()} ${shares} @ ${px}¢`, `≈ $${cost.toFixed(2)} · ${type}`);
    });
  };
  const doSplit = () =>
    requireWallet(() => {
      sfx.select();
      toast.push("info", `SPLIT ${splitAmt} USDC`, `→ ${splitAmt} YES + ${splitAmt} NO`);
    });
  const doMerge = () =>
    requireWallet(() => {
      sfx.select();
      toast.push("info", `MERGE ${splitAmt} sets`, `→ ${splitAmt} USDC`);
    });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-6">
        {/* header */}
        <Link href="/terminal/predict" className="mb-3 inline-flex items-center gap-1.5 font-mono text-[12px] text-muted hover:text-cyan">
          <ArrowLeft size={14} /> PREDICT
        </Link>
        <div className="panel clip mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 font-mono text-[10px] tracking-wider">
              <span className="border border-line bg-ink-2 px-2 py-0.5 text-cyan clip">{m.category.toUpperCase()}</span>
              {m.resolved ? (
                <span className={`clip px-2 py-0.5 font-bold ${m.resolved === "yes" ? "bg-lime/20 text-lime" : "bg-magenta/20 text-magenta"}`}>RESOLVED · {m.resolved.toUpperCase()}</span>
              ) : (
                <span className="flex items-center gap-1 text-faint"><Clock size={11} /> {m.ends}</span>
              )}
            </div>
            <h1 className="font-display text-xl font-black leading-snug text-txt md:text-2xl">{m.question}</h1>
            <div className="mt-1 font-mono text-[11px] text-faint">Vol {fmtVolume(m.volume)} · spread {bestBid}–{bestAsk}¢</div>
          </div>
          <div className="text-right">
            <div className="tabular font-display text-5xl font-black text-cyan neon-cyan">{m.yes}%</div>
            <div className="font-mono text-[10px] text-faint">YES probability</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
          {/* left: chart + order book */}
          <div className="flex flex-col gap-5">
            <section className="panel clip p-4">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-faint">
                <TrendingUp size={12} /> YES PRICE
              </div>
              <Chart data={history} />
            </section>

            <section className="panel clip p-4">
              <div className="mb-3 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-faint">
                <span><Layers size={12} className="mr-1 inline" /> ORDER BOOK · YES</span>
                <span>PRICE / SIZE</span>
              </div>
              <OrderBook book={book} onPick={(p) => { setType("limit"); setPrice(p); }} bestAsk={bestAsk} bestBid={bestBid} />
            </section>
          </div>

          {/* right: trade + split/merge */}
          <div className="flex flex-col gap-5">
            <section className="panel clip p-4">
              {/* YES / NO */}
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {(["yes", "no"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSide(s); setPrice(s === "yes" ? m.yes : 100 - m.yes); }}
                    className={`clip py-2.5 font-display text-sm font-black tracking-wide transition ${
                      side === s
                        ? s === "yes" ? "border border-lime bg-lime/15 text-lime" : "border border-magenta bg-magenta/15 text-magenta"
                        : "border border-line bg-ink-2 text-muted hover:text-txt"
                    }`}
                  >
                    {s.toUpperCase()} {s === "yes" ? m.yes : 100 - m.yes}¢
                  </button>
                ))}
              </div>

              {/* limit / market */}
              <div className="mb-3 inline-flex w-full border border-line bg-ink-2 p-0.5 clip text-[12px] font-bold">
                {(["limit", "market"] as const).map((t) => (
                  <button key={t} onClick={() => setType(t)} className={`flex-1 py-1.5 clip transition ${type === t ? "bg-cyan/15 text-cyan" : "text-faint hover:text-txt"}`}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* price (limit only) */}
              {type === "limit" && (
                <Field label="LIMIT PRICE (¢)">
                  <input type="number" min={1} max={99} value={price} onChange={(e) => setPrice(clamp(+e.target.value, 1, 99))} className="tabular w-full bg-transparent text-right text-[15px] text-txt outline-none" />
                </Field>
              )}
              <Field label="SHARES">
                <input type="number" min={1} value={shares} onChange={(e) => setShares(Math.max(1, +e.target.value || 1))} className="tabular w-full bg-transparent text-right text-[15px] text-txt outline-none" />
              </Field>

              {/* market estimate + slippage warning */}
              {type === "market" && (
                <div className="mb-2 space-y-1 font-mono text-[11px]">
                  <Row k="Est. avg price" v={`${mkt.avg.toFixed(1)}¢`} />
                  <Row k="Slippage" v={`${mkt.slippagePct.toFixed(2)}%`} cls={slipHigh ? "text-magenta" : "text-lime"} />
                  {slipHigh && (
                    <div className="flex items-start gap-1.5 border border-magenta/50 bg-magenta/10 px-2.5 py-2 text-magenta clip">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>High slippage — this market order walks the book ~{mkt.slippagePct.toFixed(1)}%. Consider a limit order.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-3 flex items-center justify-between border-t border-line pt-2 font-mono text-[12px]">
                <span className="text-faint">Est. cost</span>
                <span className="tabular font-bold text-cyan">${cost.toFixed(2)}</span>
              </div>

              <button
                onClick={submit}
                disabled={!!m.resolved}
                className={`btn-neon clip w-full py-3 font-display text-sm font-black tracking-widest disabled:opacity-30 ${side === "yes" ? "bg-lime/15 text-lime" : "bg-magenta/15 text-magenta"}`}
                style={{ borderColor: side === "yes" ? "rgba(57,255,20,.6)" : "rgba(255,43,214,.6)" }}
              >
                {m.resolved ? "RESOLVED" : `BUY ${side.toUpperCase()}`}
              </button>
            </section>

            {/* split / merge */}
            <section className="panel clip p-4">
              <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">SPLIT / MERGE · complete sets</div>
              <p className="mb-3 font-sans text-[12px] leading-relaxed text-muted">
                <span className="text-cyan">Split</span>: 1 USDC → 1 YES + 1 NO. <span className="text-cyan">Merge</span>: 1 YES + 1 NO → 1 USDC.
              </p>
              <div className="mb-3 flex items-center gap-2 border border-line bg-ink-2 px-3 py-2 clip">
                <input type="number" min={1} value={splitAmt} onChange={(e) => setSplitAmt(Math.max(1, +e.target.value || 1))} className="tabular w-full bg-transparent text-[14px] text-txt outline-none" />
                <span className="font-mono text-[11px] text-cyan">USDC</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={doSplit} className="clip flex items-center justify-center gap-1.5 border border-lime/50 bg-lime/10 py-2.5 font-display text-[13px] font-bold text-lime hover:bg-lime/20">
                  <Layers size={14} /> SPLIT
                </button>
                <button onClick={doMerge} className="clip flex items-center justify-center gap-1.5 border border-cyan/50 bg-cyan/10 py-2.5 font-display text-[13px] font-bold text-cyan hover:bg-cyan/20">
                  <Combine size={14} /> MERGE
                </button>
              </div>
            </section>
          </div>
        </div>
        <p className="mt-4 font-mono text-[10px] text-faint">Demo market — orders, split/merge and fills are simulated. On-chain settlement (hybrid CLOB) is the next step.</p>
      </div>
    </div>
  );
}

function OrderBook({ book, onPick, bestAsk, bestBid }: { book: ReturnType<typeof genBook>; onPick: (p: number) => void; bestAsk: number; bestBid: number }) {
  const maxSize = Math.max(...book.asks.map((l) => l.size), ...book.bids.map((l) => l.size), 1);
  return (
    <div className="space-y-0.5 font-mono text-[12px]">
      {[...book.asks].reverse().map((l, i) => (
        <Lvl key={`a${i}`} l={l} max={maxSize} color="magenta" onClick={() => onPick(l.price)} />
      ))}
      <div className="flex items-center justify-between px-1 py-1 text-[11px] text-faint">
        <span>spread</span>
        <span className="tabular">{bestBid}–{bestAsk}¢ ({bestAsk - bestBid}¢)</span>
      </div>
      {book.bids.map((l, i) => (
        <Lvl key={`b${i}`} l={l} max={maxSize} color="lime" onClick={() => onPick(l.price)} />
      ))}
    </div>
  );
}

function Lvl({ l, max, color, onClick }: { l: { price: number; size: number }; max: number; color: "lime" | "magenta"; onClick: () => void }) {
  const pct = (l.size / max) * 100;
  const c = color === "lime" ? "57,255,20" : "255,43,214";
  return (
    <button onClick={onClick} className="relative flex w-full items-center justify-between px-2 py-1 clip transition hover:bg-white/5">
      <span className="absolute inset-y-0 right-0 clip" style={{ width: `${pct}%`, background: `rgba(${c},0.12)` }} />
      <span className={`tabular relative z-10 font-bold ${color === "lime" ? "text-lime" : "text-magenta"}`}>{l.price}¢</span>
      <span className="tabular relative z-10 text-muted">{l.size.toLocaleString()}</span>
    </button>
  );
}

function Chart({ data }: { data: number[] }) {
  const w = 560;
  const h = 130;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 12) - 6}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  const col = up ? "#39ff14" : "#ff2bd6";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[130px] w-full">
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={`rgba(${up ? "57,255,20" : "255,43,214"},0.06)`} stroke="none" />
      <polyline points={pts} fill="none" stroke={col} strokeWidth={2} style={{ filter: `drop-shadow(0 0 5px ${col})` }} />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between border border-line bg-ink-2 px-3 py-2 clip">
      <span className="font-mono text-[10px] tracking-wider text-faint">{label}</span>
      {children}
    </div>
  );
}
function Row({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-faint">{k}</span>
      <span className={`tabular font-bold ${cls ?? "text-txt"}`}>{v}</span>
    </div>
  );
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Number.isNaN(n) ? lo : n));
}
