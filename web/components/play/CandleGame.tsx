"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Bitcoin, Flame } from "lucide-react";
import { usePlay } from "./PlayProvider";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";
import { usdc } from "@/lib/money";

const PAYOUT = 1.9; // payout multiplier on a correct call
const PRESETS = [1, 5, 10, 25];
const TFS = [
  { sec: 60, label: "1m", hot: true },
  { sec: 180, label: "3m", hot: false },
  { sec: 300, label: "5m", hot: false },
];

type Bet = { dir: "up" | "down"; stake: number; open: number };

export default function CandleGame() {
  const { mode, balance, adjust } = usePlay();
  const toast = useToast();
  const [stake, setStake] = useState(5);
  const [, force] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // mutable game state kept in refs; we re-render on a tick
  const price = useRef(63250);
  const history = useRef<number[]>([]);
  const open = useRef<Record<number, number>>({ 60: 63250, 180: 63250, 300: 63250 });
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

    const id = setInterval(() => {
      price.current = Math.max(1000, price.current + price.current * 0.0006 * gauss());
      history.current.push(price.current);
      if (history.current.length > 120) history.current.shift();
      const now = Date.now();
      for (const tf of TFS) {
        const b = Math.floor(now / (tf.sec * 1000));
        if (bucket.current[tf.sec] === undefined) bucket.current[tf.sec] = b;
        if (b !== bucket.current[tf.sec]) {
          // candle closed — settle
          const bt = bet.current[tf.sec];
          if (bt) {
            const up = price.current >= bt.open;
            const win = up === (bt.dir === "up");
            if (win) {
              adjust(modeRef.current, bt.stake * PAYOUT);
              sfx.win();
              toast.push("win", `BTC ${tf.label} ${bt.dir.toUpperCase()} ✓ +${usdc(bt.stake * PAYOUT)}`, "candle closed");
            } else {
              sfx.lose();
              toast.push("lose", `BTC ${tf.label} ${bt.dir.toUpperCase()} ✗ −${usdc(bt.stake)}`, "candle closed");
            }
            flash.current[tf.sec] = { win, at: now };
          }
          bet.current[tf.sec] = null;
          open.current[tf.sec] = price.current;
          bucket.current[tf.sec] = b;
        }
      }
      force((t) => t + 1);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const place = (sec: number, dir: "up" | "down") => {
    if (bet.current[sec]) return;
    if (stake <= 0 || balance[modeRef.current] < stake) return;
    sfx.place();
    adjust(modeRef.current, -stake);
    bet.current[sec] = { dir, stake, open: open.current[sec] };
    force((t) => t + 1);
  };

  if (!mounted) return <div className="h-full" />;
  const now = Date.now();
  const featured = TFS[0];
  const rest = TFS.slice(1);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* controls */}
      <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-line bg-ink/40 p-4 md:w-[260px] md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 font-display text-sm font-bold tracking-wide text-gold">
          <Bitcoin size={16} /> NEXT CANDLE
        </div>
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">PLAY BALANCE</div>
          <div className="tabular text-[26px] font-black leading-none text-cyan neon-cyan">{usdc(balance[mode])}</div>
        </div>
        <div>
          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">STAKE (USDC)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((b) => (
              <button
                key={b}
                onClick={() => {
                  sfx.select();
                  setStake(b);
                }}
                className={`clip py-2.5 font-mono text-[13px] font-bold tabular transition ${
                  b === stake ? "border border-gold bg-gold/10 text-gold" : "border border-line bg-ink-2 text-muted hover:text-txt"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-auto space-y-1.5 border-t border-line pt-3 font-sans text-[12px] leading-relaxed text-muted">
          <p>
            <span className="text-gold">›</span> Call the next <span className="text-lime">UP</span> /{" "}
            <span className="text-magenta">DOWN</span> close. Win <span className="text-lime">{PAYOUT}×</span>.
          </p>
          <p className="text-faint">BTC only · demo play money · resolves at candle close.</p>
        </div>
      </aside>

      {/* arena */}
      <main className="grid min-w-0 flex-1 content-start gap-5 overflow-y-auto p-5 md:p-6">
        <Featured tf={featured} price={price.current} open={open.current[featured.sec]} bet={bet.current[featured.sec]} flash={flash.current[featured.sec]} now={now} stake={stake} onBet={place} history={history.current} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {rest.map((tf) => (
            <Mini key={tf.sec} tf={tf} price={price.current} open={open.current[tf.sec]} bet={bet.current[tf.sec]} flash={flash.current[tf.sec]} now={now} stake={stake} onBet={place} />
          ))}
        </div>
      </main>
    </div>
  );
}

function remaining(sec: number, now: number) {
  const ms = sec * 1000;
  const left = ms - (now % ms);
  return { left, frac: left / ms, s: Math.ceil(left / 1000) };
}

function Ring({ frac, size, color }: { frac: number; size: number; color: string }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dashoffset .15s linear" }} />
    </svg>
  );
}

function delta(price: number, open: number) {
  const d = price - open;
  const pct = (d / open) * 100;
  return { d, pct, up: d >= 0 };
}

function Featured({ tf, price, open, bet, flash, now, stake, onBet, history }: any) {
  const { frac, s } = remaining(tf.sec, now);
  const dl = delta(price, open);
  const flashing = flash && now - flash.at < 1200;
  return (
    <div
      className="panel clip relative overflow-hidden p-6 animate-glow"
      style={{ borderColor: flashing ? (flash.win ? "#39ff14" : "#ff2bd6") : "rgba(255,210,63,0.5)", boxShadow: `0 0 26px ${flashing ? (flash.win ? "rgba(57,255,20,.4)" : "rgba(255,43,214,.4)") : "rgba(255,210,63,.22)"}` }}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/10 blur-3xl" />
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#f7931a] text-black">
            <Bitcoin size={18} />
          </span>
          <div className="leading-none">
            <div className="font-display text-base font-black tracking-wide text-txt">BTC / USD</div>
            <div className="font-mono text-[10px] tracking-wider text-faint">NEXT CANDLE</div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 border border-gold/60 bg-gold/15 px-3 py-1 font-display text-[13px] font-black tracking-widest text-gold clip animate-glow">
          <Flame size={14} /> {tf.label} · HOT
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <div className="tabular font-display text-5xl font-black text-txt neon-cyan">
            ${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
          <div className={`tabular mt-1 text-sm font-bold ${dl.up ? "text-lime" : "text-magenta"}`}>
            {dl.up ? "▲" : "▼"} ${Math.abs(dl.d).toFixed(0)} ({dl.pct >= 0 ? "+" : ""}
            {dl.pct.toFixed(2)}%) this candle
          </div>
          <MiniLine data={history} up={dl.up} />
        </div>
        <div className="relative grid place-items-center">
          <Ring frac={frac} size={120} color={frac < 0.2 ? "#ff2bd6" : "#ffd23f"} />
          <div className="absolute text-center">
            <div className="tabular font-display text-3xl font-black text-txt">{s}</div>
            <div className="font-mono text-[9px] tracking-widest text-faint">SEC</div>
          </div>
        </div>
      </div>

      {bet ? (
        <BetState bet={bet} price={price} big />
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <BigBtn dir="up" onClick={() => onBet(tf.sec, "up")} stake={stake} />
          <BigBtn dir="down" onClick={() => onBet(tf.sec, "down")} stake={stake} />
        </div>
      )}
    </div>
  );
}

function Mini({ tf, price, open, bet, flash, now, stake, onBet }: any) {
  const { frac, s } = remaining(tf.sec, now);
  const dl = delta(price, open);
  const flashing = flash && now - flash.at < 1200;
  return (
    <div className="panel clip p-4" style={{ borderColor: flashing ? (flash.win ? "#39ff14" : "#ff2bd6") : undefined }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-sm font-black tracking-widest text-txt">{tf.label}</span>
        <span className="flex items-center gap-2">
          <span className="tabular font-mono text-[12px] text-faint">{s}s</span>
          <Ring frac={frac} size={28} color={frac < 0.2 ? "#ff2bd6" : "#22d3ee"} />
        </span>
      </div>
      <div className="tabular font-display text-2xl font-black text-txt">${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
      <div className={`tabular text-[12px] font-bold ${dl.up ? "text-lime" : "text-magenta"}`}>
        {dl.up ? "▲" : "▼"} {dl.pct >= 0 ? "+" : ""}
        {dl.pct.toFixed(2)}%
      </div>
      {bet ? (
        <BetState bet={bet} price={price} />
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SmallBtn dir="up" onClick={() => onBet(tf.sec, "up")} />
          <SmallBtn dir="down" onClick={() => onBet(tf.sec, "down")} />
        </div>
      )}
    </div>
  );
}

function BetState({ bet, price, big }: { bet: Bet; price: number; big?: boolean }) {
  const winning = (price >= bet.open) === (bet.dir === "up");
  return (
    <div className={`clip mt-4 flex items-center justify-between border px-3 ${big ? "py-3" : "py-2"} ${winning ? "border-lime/60 bg-lime/10" : "border-magenta/60 bg-magenta/10"}`}>
      <span className={`flex items-center gap-1.5 font-display font-black tracking-wide ${bet.dir === "up" ? "text-lime" : "text-magenta"} ${big ? "text-base" : "text-[13px]"}`}>
        {bet.dir === "up" ? <ArrowUp size={big ? 18 : 14} /> : <ArrowDown size={big ? 18 : 14} />} {bet.dir.toUpperCase()} · {usdc(bet.stake)}
      </span>
      <span className={`tabular font-mono text-[11px] font-bold ${winning ? "text-lime" : "text-magenta"}`}>{winning ? "WINNING" : "LOSING"}</span>
    </div>
  );
}

function BigBtn({ dir, onClick, stake }: { dir: "up" | "down"; onClick: () => void; stake: number }) {
  const up = dir === "up";
  return (
    <button
      onClick={onClick}
      className={`clip flex items-center justify-center gap-2 py-4 font-display text-lg font-black tracking-widest transition ${
        up ? "border border-lime bg-lime/15 text-lime hover:bg-lime/25" : "border border-magenta bg-magenta/15 text-magenta hover:bg-magenta/25"
      }`}
      style={{ boxShadow: `0 0 16px ${up ? "rgba(57,255,20,.3)" : "rgba(255,43,214,.3)"}` }}
    >
      {up ? <ArrowUp size={22} /> : <ArrowDown size={22} />} {dir.toUpperCase()}
      <span className="font-mono text-[11px] opacity-70">{usdc(stake)}</span>
    </button>
  );
}

function SmallBtn({ dir, onClick }: { dir: "up" | "down"; onClick: () => void }) {
  const up = dir === "up";
  return (
    <button
      onClick={onClick}
      className={`clip flex items-center justify-center gap-1 py-2.5 font-display text-[13px] font-bold tracking-wide transition ${
        up ? "border border-lime/60 bg-lime/10 text-lime hover:bg-lime/20" : "border border-magenta/60 bg-magenta/10 text-magenta hover:bg-magenta/20"
      }`}
    >
      {up ? <ArrowUp size={15} /> : <ArrowDown size={15} />} {dir.toUpperCase()}
    </button>
  );
}

function MiniLine({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return <div className="mt-2 h-8" />;
  const w = 220;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * h}`).join(" ");
  const col = up ? "#39ff14" : "#ff2bd6";
  return (
    <svg width={w} height={h} className="mt-2 max-w-full">
      <polyline points={pts} fill="none" stroke={col} strokeWidth={1.6} style={{ filter: `drop-shadow(0 0 4px ${col})` }} />
    </svg>
  );
}
