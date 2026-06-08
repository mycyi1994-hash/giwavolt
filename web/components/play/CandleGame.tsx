"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Bitcoin, Flame, Lock } from "lucide-react";
import { usePlay } from "./PlayProvider";
import LiveFeed from "./LiveFeed";
import QuoteTicker from "@/components/ui/QuoteTicker";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";
import { usdc } from "@/lib/money";

const PAYOUT = 1.9; // payout multiplier on a correct call
const PRESETS = [1, 5, 10, 25];
const TFS = [
  { sec: 60, label: "1m" },
  { sec: 180, label: "3m" },
  { sec: 300, label: "5m" },
];
// betting locks once the candle is half over
const lockMs = (sec: number) => (sec * 1000) / 2;

type Bet = { dir: "up" | "down"; stake: number; open: number };
type Candle = { open: number; high: number; low: number; close: number };

export default function CandleGame() {
  const { mode, balance, adjust } = usePlay();
  const toast = useToast();
  const [stake, setStake] = useState(5);
  const [, force] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const price = useRef(63250);
  const cur = useRef<Record<number, Candle>>({
    60: { open: 63250, high: 63250, low: 63250, close: 63250 },
    180: { open: 63250, high: 63250, low: 63250, close: 63250 },
    300: { open: 63250, high: 63250, low: 63250, close: 63250 },
  });
  const hist = useRef<Record<number, Candle[]>>({ 60: [], 180: [], 300: [] });
  const bucket = useRef<Record<number, number>>({});
  const bet = useRef<Record<number, Bet | null>>({ 60: null, 180: null, 300: null });
  const flash = useRef<Record<number, { win: boolean; at: number } | null>>({ 60: null, 180: null, 300: null });

  useEffect(() => {
    let spare: number | null = null;
    const gauss = () => {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    };
    for (const tf of TFS) bucket.current[tf.sec] = Math.floor(Date.now() / (tf.sec * 1000));

    // seed varied past candles (independent per timeframe) so the strip isn't empty/identical
    for (const tf of TFS) {
      let base = 63250 + (Math.random() - 0.5) * 400;
      const arr: Candle[] = [];
      for (let i = 0; i < 10; i++) {
        const open = base;
        const close = open + (Math.random() - 0.5) * base * 0.005;
        const high = Math.max(open, close) + Math.random() * base * 0.0025;
        const low = Math.min(open, close) - Math.random() * base * 0.0025;
        arr.push({ open, high, low, close });
        base = close;
      }
      hist.current[tf.sec] = arr;
      cur.current[tf.sec] = { open: base, high: base, low: base, close: base };
      if (tf.sec === 60) price.current = base;
    }

    const id = setInterval(() => {
      price.current = Math.max(1000, price.current + price.current * 0.0007 * gauss());
      const p = price.current;
      const now = Date.now();
      for (const tf of TFS) {
        const c = cur.current[tf.sec];
        c.high = Math.max(c.high, p);
        c.low = Math.min(c.low, p);
        c.close = p;
        const b = Math.floor(now / (tf.sec * 1000));
        if (bucket.current[tf.sec] === undefined) bucket.current[tf.sec] = b;
        if (b !== bucket.current[tf.sec]) {
          // settle bet
          const bt = bet.current[tf.sec];
          if (bt) {
            const win = p >= bt.open === (bt.dir === "up");
            adjust(modeRef.current, win ? bt.stake * PAYOUT : 0);
            win ? sfx.win() : sfx.lose();
            toast.push(win ? "win" : "lose", `BTC ${tf.label} ${bt.dir.toUpperCase()} ${win ? "✓ +" + usdc(bt.stake * PAYOUT) : "✗ −" + usdc(bt.stake)}`, "candle closed");
            flash.current[tf.sec] = { win, at: now };
          }
          // archive the closed candle, open a fresh one
          hist.current[tf.sec] = [...hist.current[tf.sec], { ...c }].slice(-12);
          bet.current[tf.sec] = null;
          cur.current[tf.sec] = { open: p, high: p, low: p, close: p };
          bucket.current[tf.sec] = b;
        }
      }
      force((t) => t + 1);
    }, 120);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const place = (sec: number, dir: "up" | "down") => {
    if (bet.current[sec]) return;
    const left = sec * 1000 - (Date.now() % (sec * 1000));
    if (left < lockMs(sec)) return; // locked past the halfway point
    if (stake <= 0 || balance[modeRef.current] < stake) return;
    sfx.place();
    adjust(modeRef.current, -stake);
    bet.current[sec] = { dir, stake, open: cur.current[sec].open };
    force((t) => t + 1);
  };

  if (!mounted) return <div className="h-full" />;
  const now = Date.now();

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-line bg-ink/40 p-4 md:w-[240px] md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 font-display text-sm font-bold tracking-wide text-gold">
          <Bitcoin size={16} /> NEXT CANDLE
        </div>
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">{mode === "real" ? "DEPOSITED" : "PLAY BALANCE"}</div>
          <div className="tabular text-[26px] font-black leading-none text-cyan neon-cyan">{usdc(balance[mode])}</div>
        </div>
        <div>
          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">STAKE (USDC)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((b) => (
              <button key={b} onClick={() => { sfx.select(); setStake(b); }} className={`clip py-2.5 font-mono text-[13px] font-bold tabular transition ${b === stake ? "border border-gold bg-gold/10 text-gold" : "border border-line bg-ink-2 text-muted hover:text-txt"}`}>
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-auto">
          <QuoteTicker />
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-5">
        <LiveFeed className="absolute bottom-3 right-3 z-30 hidden w-52 xl:block" />
        <Featured tf={TFS[0]} c={cur.current[60]} hist={hist.current[60]} bet={bet.current[60]} flash={flash.current[60]} now={now} stake={stake} onBet={place} />
        <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {TFS.slice(1).map((tf) => (
            <Mini key={tf.sec} tf={tf} c={cur.current[tf.sec]} hist={hist.current[tf.sec]} bet={bet.current[tf.sec]} flash={flash.current[tf.sec]} now={now} onBet={place} />
          ))}
        </div>
      </main>
    </div>
  );
}

function remaining(sec: number, now: number) {
  const ms = sec * 1000;
  const left = ms - (now % ms);
  return { left, frac: left / ms, s: Math.ceil(left / 1000), locked: left < lockMs(sec) };
}

function Ring({ frac, size, color }: { frac: number; size: number; color: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dashoffset .12s linear" }} />
    </svg>
  );
}

// a single candlestick (음/양봉)
function CandleStick({ c, w = "w-full", glow = true }: { c: Candle; w?: string; glow?: boolean }) {
  const pad = (c.high - c.low) * 0.18 + 0.5;
  const top = c.high + pad;
  const bot = c.low - pad;
  const range = top - bot || 1;
  const y = (p: number) => ((top - p) / range) * 100;
  const up = c.close >= c.open;
  const col = up ? "#39ff14" : "#ff2bd6";
  const bodyTop = y(Math.max(c.open, c.close));
  const bodyH = Math.max(1.5, Math.abs(y(c.open) - y(c.close)));
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`h-full ${w}`} style={glow ? { filter: `drop-shadow(0 0 8px ${col}88)` } : undefined}>
      <line x1="50" y1={y(c.high)} x2="50" y2={y(c.low)} stroke={col} strokeWidth="2" />
      <rect x="22" y={bodyTop} width="56" height={bodyH} fill={up ? "rgba(57,255,20,0.28)" : "rgba(255,43,214,0.28)"} stroke={col} strokeWidth="2" />
    </svg>
  );
}

// row of last-N up/down results
function Results({ hist, n = 10 }: { hist: Candle[]; n?: number }) {
  const last = hist.slice(-n);
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 font-mono text-[9px] tracking-widest text-faint">LAST</span>
      {Array.from({ length: n }).map((_, i) => {
        const c = last[last.length - n + i];
        if (!c) return <span key={i} className="h-3 w-3 rounded-[2px] border border-line" />;
        const up = c.close >= c.open;
        return <span key={i} className="grid h-3.5 w-3.5 place-items-center rounded-[2px] text-[8px] font-black" style={{ background: up ? "rgba(57,255,20,0.22)" : "rgba(255,43,214,0.22)", color: up ? "#39ff14" : "#ff2bd6" }}>{up ? "▲" : "▼"}</span>;
      })}
    </div>
  );
}

// small previous candles strip
function PrevCandles({ hist, n = 5 }: { hist: Candle[]; n?: number }) {
  const last = hist.slice(-n);
  return (
    <div className="flex h-full items-stretch gap-1.5">
      {Array.from({ length: n }).map((_, i) => {
        const c = last[last.length - n + i];
        return (
          <div key={i} className="h-full w-5 opacity-80">
            {c ? <CandleStick c={c} glow={false} /> : <div className="h-full w-full" />}
          </div>
        );
      })}
    </div>
  );
}

function Featured({ tf, c, hist, bet, flash, now, stake, onBet }: any) {
  const { frac, s, locked } = remaining(tf.sec, now);
  const up = c.close >= c.open;
  const pct = ((c.close - c.open) / c.open) * 100;
  const flashing = flash && now - flash.at < 1300;
  const col = flashing ? (flash.win ? "#39ff14" : "#ff2bd6") : "#ffd23f";
  return (
    <div className="panel clip relative flex min-h-[56vh] flex-1 flex-col overflow-hidden p-5 animate-glow md:p-6" style={{ borderColor: flashing ? col : "rgba(255,210,63,0.5)", boxShadow: `0 0 30px ${col}33` }}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f7931a] text-black"><Bitcoin size={20} /></span>
          <div className="leading-none">
            <div className="font-display text-lg font-black tracking-wide text-txt">BTC / USD</div>
            <div className="font-mono text-[10px] tracking-widest text-faint">1-MINUTE CANDLE</div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 border border-gold/60 bg-gold/15 px-3 py-1 font-display text-sm font-black tracking-widest text-gold clip animate-glow"><Flame size={15} /> {tf.label} · HOT</span>
      </div>

      <div className="mb-3"><Results hist={hist} n={10} /></div>

      {/* body: prev candles | big candle | side info */}
      <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr_auto] items-stretch gap-4">
        <div className="hidden py-2 sm:block"><PrevCandles hist={hist} n={5} /></div>
        <div className="relative min-h-0">
          <CandleStick c={c} />
          <div className="absolute left-1 top-1 font-mono text-[10px] leading-relaxed text-faint">
            <div>O {c.open.toFixed(0)}</div>
            <div className="text-lime">H {c.high.toFixed(0)}</div>
            <div className="text-magenta">L {c.low.toFixed(0)}</div>
          </div>
        </div>
        <div className="flex w-[170px] flex-col items-center justify-center gap-3">
          <div className="tabular text-center font-display text-4xl font-black text-txt neon-cyan">${c.close.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
          <div className={`tabular text-sm font-bold ${up ? "text-lime" : "text-magenta"}`}>{up ? "▲" : "▼"} {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</div>
          <div className="relative grid place-items-center">
            <Ring frac={frac} size={128} color={locked ? "#ff2bd6" : "#ffd23f"} />
            <div className="absolute text-center">
              <div className="tabular font-display text-4xl font-black text-txt">{s}</div>
              <div className="font-mono text-[9px] tracking-widest text-faint">SEC</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 shrink-0">
        {bet ? (
          <BetState bet={bet} close={c.close} big />
        ) : locked ? (
          <div className="clip flex items-center justify-center gap-2 border border-magenta/50 bg-magenta/10 py-4 font-display text-base font-black tracking-widest text-magenta">
            <Lock size={18} /> BETTING LOCKED · opens next candle
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <BigBtn dir="up" onClick={() => onBet(tf.sec, "up")} stake={stake} />
            <BigBtn dir="down" onClick={() => onBet(tf.sec, "down")} stake={stake} />
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ tf, c, hist, bet, flash, now, onBet }: any) {
  const { frac, s, locked } = remaining(tf.sec, now);
  const up = c.close >= c.open;
  const pct = ((c.close - c.open) / c.open) * 100;
  const flashing = flash && now - flash.at < 1300;
  return (
    <div className="panel clip flex items-center gap-3 p-4" style={{ borderColor: flashing ? (flash.win ? "#39ff14" : "#ff2bd6") : undefined }}>
      <div className="hidden h-20 py-1 md:block"><PrevCandles hist={hist} n={3} /></div>
      <div className="h-20 w-10 shrink-0"><CandleStick c={c} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-black tracking-widest text-txt">{tf.label}</span>
          <span className="flex items-center gap-2"><span className="tabular font-mono text-[12px] text-faint">{s}s</span><Ring frac={frac} size={26} color={locked ? "#ff2bd6" : "#22d3ee"} /></span>
        </div>
        <div className="tabular font-display text-xl font-black text-txt">${c.close.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
        <div className={`tabular text-[12px] font-bold ${up ? "text-lime" : "text-magenta"}`}>{up ? "▲" : "▼"} {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</div>
        {bet ? (
          <BetState bet={bet} close={c.close} />
        ) : locked ? (
          <div className="mt-2 flex items-center justify-center gap-1 border border-magenta/40 py-1.5 font-mono text-[11px] font-bold text-magenta clip"><Lock size={12} /> LOCKED</div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <SmallBtn dir="up" onClick={() => onBet(tf.sec, "up")} />
            <SmallBtn dir="down" onClick={() => onBet(tf.sec, "down")} />
          </div>
        )}
      </div>
    </div>
  );
}

function BetState({ bet, close, big }: { bet: Bet; close: number; big?: boolean }) {
  const winning = close >= bet.open === (bet.dir === "up");
  return (
    <div className={`clip ${big ? "mt-0" : "mt-2"} flex items-center justify-between border px-3 ${big ? "py-3.5" : "py-2"} ${winning ? "border-lime/60 bg-lime/10" : "border-magenta/60 bg-magenta/10"}`}>
      <span className={`flex items-center gap-1.5 font-display font-black tracking-wide ${bet.dir === "up" ? "text-lime" : "text-magenta"} ${big ? "text-base" : "text-[12px]"}`}>
        {bet.dir === "up" ? <ArrowUp size={big ? 18 : 13} /> : <ArrowDown size={big ? 18 : 13} />} {bet.dir.toUpperCase()} · {usdc(bet.stake)}
      </span>
      <span className={`tabular font-mono text-[11px] font-bold ${winning ? "text-lime" : "text-magenta"}`}>{winning ? "WINNING" : "LOSING"}</span>
    </div>
  );
}

function BigBtn({ dir, onClick, stake }: { dir: "up" | "down"; onClick: () => void; stake: number }) {
  const up = dir === "up";
  return (
    <button onClick={onClick} className={`clip flex items-center justify-center gap-2 py-4 font-display text-xl font-black tracking-widest transition ${up ? "border border-lime bg-lime/15 text-lime hover:bg-lime/25" : "border border-magenta bg-magenta/15 text-magenta hover:bg-magenta/25"}`} style={{ boxShadow: `0 0 18px ${up ? "rgba(57,255,20,.3)" : "rgba(255,43,214,.3)"}` }}>
      {up ? <ArrowUp size={24} /> : <ArrowDown size={24} />} {dir.toUpperCase()}
      <span className="font-mono text-[11px] opacity-70">{usdc(stake)}</span>
    </button>
  );
}

function SmallBtn({ dir, onClick }: { dir: "up" | "down"; onClick: () => void }) {
  const up = dir === "up";
  return (
    <button onClick={onClick} className={`clip flex items-center justify-center gap-1 py-2 font-display text-[12px] font-bold tracking-wide transition ${up ? "border border-lime/60 bg-lime/10 text-lime hover:bg-lime/20" : "border border-magenta/60 bg-magenta/10 text-magenta hover:bg-magenta/20"}`}>
      {up ? <ArrowUp size={14} /> : <ArrowDown size={14} />} {dir.toUpperCase()}
    </button>
  );
}
