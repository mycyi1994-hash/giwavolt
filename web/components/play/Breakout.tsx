"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Radio } from "lucide-react";
import { usePlay } from "./PlayProvider";
import ModeToggle from "./ModeToggle";
import LiveFeed from "./LiveFeed";
import QuoteTicker from "@/components/ui/QuoteTicker";
import { useToast } from "@/components/ui/Toast";
import { useLivePrice } from "@/lib/useLivePrice";
import { sfx } from "@/lib/sound";
import { usdc } from "@/lib/money";

const HOUSE_EDGE = 0.05; // baked into the payout (not displayed)
const PAYOUT = +(2 * (1 - HOUSE_EDGE)).toFixed(2); // symmetric barriers ⇒ ~50/50 → 1.90×
const PRESETS = [1, 5, 10, 25];
const DIST = [
  { label: "0.25%", pct: 0.0025 },
  { label: "0.5%", pct: 0.005 },
  { label: "1%", pct: 0.01 },
];

type Bet = { dir: "up" | "down"; stake: number; entry: number; up: number; down: number };

export default function Breakout() {
  const { mode, balance, adjust } = usePlay();
  const toast = useToast();
  const liveBtc = useLivePrice(63500);
  const [stake, setStake] = useState(5);
  const [distI, setDistI] = useState(1);
  const [, force] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const price = useRef(63500);
  const histRef = useRef<number[]>([]);
  const bet = useRef<Bet | null>(null);
  const status = useRef<"idle" | "live" | "win" | "lose">("idle");
  const flashAt = useRef(0);
  const ctxRef = useRef({ mode, stake, distI, bal: balance });
  ctxRef.current = { mode, stake, distI, bal: balance };

  useEffect(() => {
    const id = setInterval(() => {
      const p = liveBtc.getPrice();
      price.current = p;
      const h = histRef.current;
      h.push(p);
      if (h.length > 90) h.shift();

      const b = bet.current;
      if (b && status.current === "live") {
        if (p >= b.up || p <= b.down) {
          const touchedUp = p >= b.up;
          const won = (touchedUp && b.dir === "up") || (!touchedUp && b.dir === "down");
          if (won) {
            adjust(ctxRef.current.mode, b.stake * PAYOUT);
            sfx.win();
            toast.push("win", `BREAKOUT ${b.dir.toUpperCase()} ✓ +${usdc(b.stake * PAYOUT)}`, `touched ${touchedUp ? "UP" : "DOWN"}`);
          } else {
            sfx.lose();
            toast.push("lose", `BREAKOUT ${b.dir.toUpperCase()} ✗ −${usdc(b.stake)}`, `touched ${touchedUp ? "UP" : "DOWN"}`);
          }
          status.current = won ? "win" : "lose";
          flashAt.current = Date.now();
          setTimeout(() => {
            bet.current = null;
            status.current = "idle";
            force((t) => t + 1);
          }, 1600);
        }
      }
      force((t) => t + 1);
    }, 80);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const place = (dir: "up" | "down") => {
    if (status.current !== "idle") return;
    const { mode: md, stake: st, distI: di, bal } = ctxRef.current;
    if (st <= 0 || bal[md] < st) return;
    const entry = price.current;
    const d = DIST[di].pct;
    sfx.place();
    adjust(md, -st);
    bet.current = { dir, stake: st, entry, up: entry * (1 + d), down: entry * (1 - d) };
    status.current = "live";
    force((t) => t + 1);
  };

  if (!mounted) return <div className="h-full" />;
  const b = bet.current;
  const live = status.current === "live";
  const flashing = (status.current === "win" || status.current === "lose") && Date.now() - flashAt.current < 1600;

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-line bg-ink/40 p-4 md:w-[250px] md:border-b-0 md:border-r">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-sm font-bold tracking-wide text-cyan">
            <Radio size={15} /> BREAKOUT
          </div>
          <ModeToggle />
        </div>
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">{mode === "real" ? "DEPOSITED" : "BALANCE"}</div>
          <div className="tabular text-[26px] font-black leading-none text-cyan neon-cyan">{usdc(balance[mode])}</div>
        </div>
        <div className={live ? "pointer-events-none opacity-40" : ""}>
          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">STAKE (USDC)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((v) => (
              <button key={v} onClick={() => { sfx.select(); setStake(v); }} className={`clip py-2.5 font-mono text-[13px] font-bold tabular transition ${v === stake ? "border border-cyan bg-cyan/10 text-cyan" : "border border-line bg-ink-2 text-muted hover:text-txt"}`}>{v}</button>
            ))}
          </div>
        </div>
        <div className={live ? "pointer-events-none opacity-40" : ""}>
          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">BARRIER DISTANCE</div>
          <div className="grid grid-cols-3 gap-1.5">
            {DIST.map((d, i) => (
              <button key={d.label} onClick={() => { sfx.select(); setDistI(i); }} className={`clip py-2 font-display text-[11px] font-bold transition ${i === distI ? "border border-cyan bg-cyan/10 text-cyan" : "border border-line bg-ink-2 text-muted hover:text-txt"}`}>{d.label}</button>
            ))}
          </div>
          <p className="mt-1 font-mono text-[9px] text-faint">±{(DIST[distI].pct * 100).toFixed(2)}% · payout {PAYOUT}×</p>
        </div>
        <div className="mt-auto">
          <QuoteTicker />
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-hidden bg-[#070710]">
        {/* full-bleed race track */}
        <Track hist={histRef.current} bet={b} price={price.current} flashing={flashing} win={status.current === "win"} />

        <LiveFeed className="absolute bottom-24 left-3 top-3 z-20 hidden w-56 overflow-hidden lg:block" />

        {/* header overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-center justify-between px-4">
          <span className="flex items-center gap-1.5 border border-lime/50 bg-ink/70 px-2.5 py-1 font-mono text-[10px] tracking-wider text-lime clip backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-lime animate-flicker" /> LIVE · BINANCE BTC/USD
          </span>
          <span className="tabular font-display text-3xl font-black text-txt neon-cyan">${price.current.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
        </div>

        {/* controls overlay */}
        <div className="absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4">
          {live ? (
            <div className="panel clip flex items-center justify-center gap-2 border border-cyan/50 bg-cyan/10 px-6 py-3 font-display text-sm font-black tracking-widest text-cyan animate-glow">
              <Radio size={16} /> LIVE — {b?.dir.toUpperCase()} · first touch wins · {PAYOUT}×
            </div>
          ) : flashing ? (
            <div className={`panel clip border px-6 py-3 text-center font-display text-base font-black tracking-widest ${status.current === "win" ? "border-lime text-lime" : "border-magenta text-magenta"}`}>
              {status.current === "win" ? `WON +${usdc((b?.stake ?? 0) * PAYOUT)}` : "MISSED"}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-10">
              <RoundBtn dir="up" onClick={() => place("up")} stake={stake} payout={PAYOUT} />
              <RoundBtn dir="down" onClick={() => place("down")} stake={stake} payout={PAYOUT} />
            </div>
          )}
          <p className="pointer-events-none font-mono text-[10px] tracking-wider text-faint">Real Binance price · house can’t move the market · barrier ±{(DIST[distI].pct * 100).toFixed(2)}%</p>
        </div>
      </main>
    </div>
  );
}

function Track({ hist, bet, price, flashing, win }: { hist: number[]; bet: Bet | null; price: number; flashing: boolean; win: boolean }) {
  const w = 760;
  const h = 280;
  // vertical range: around barriers (if bet) or recent history
  let lo: number;
  let hi: number;
  if (bet) {
    const pad = (bet.up - bet.down) * 0.4;
    lo = bet.down - pad;
    hi = bet.up + pad;
  } else {
    const recent = hist.slice(-60);
    const mn = Math.min(...recent, price);
    const mx = Math.max(...recent, price);
    const pad = (mx - mn) * 0.3 + price * 0.0002;
    lo = mn - pad;
    hi = mx + pad;
  }
  const rng = hi - lo || 1;
  const y = (p: number) => h - ((p - lo) / rng) * h;
  const pts = hist.slice(-80);
  const line = pts.map((p, i) => `${(i / Math.max(1, pts.length - 1)) * w},${y(p)}`).join(" ");
  const col = flashing ? (win ? "#39ff14" : "#ff2bd6") : "#00e5ff";

  return (
    <div className="absolute inset-0 transition-shadow" style={{ boxShadow: flashing ? `inset 0 0 90px ${col}44` : undefined }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
        {/* faint grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} y1={h * f} x2={w} y2={h * f} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}
        {bet && (
          <>
            <rect x={0} y={y(bet.up)} width={w} height={Math.max(0, y(bet.down) - y(bet.up))} fill="rgba(0,229,255,0.03)" />
            <BarrierLine y={y(bet.up)} w={w} color="#39ff14" label={`UP  ${bet.up.toFixed(0)}`} />
            <BarrierLine y={y(bet.down)} w={w} color="#ff2bd6" label={`DOWN  ${bet.down.toFixed(0)}`} bottom />
            <line x1={0} y1={y(bet.entry)} x2={w} y2={y(bet.entry)} stroke="rgba(255,255,255,0.28)" strokeWidth={1} strokeDasharray="4 5" />
          </>
        )}
        <polyline points={line} fill="none" stroke={col} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 6px ${col})` }} />
        {pts.length > 0 && <circle cx={w} cy={y(price)} r={5} fill="#eafff0" style={{ filter: `drop-shadow(0 0 8px ${col})` }} />}
      </svg>
    </div>
  );
}

function BarrierLine({ y, w, color, label, bottom }: { y: number; w: number; color: string; label: string; bottom?: boolean }) {
  return (
    <g>
      <line x1={0} y1={y} x2={w} y2={y} stroke={color} strokeWidth={2} strokeDasharray="10 6" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      <text x={10} y={y + (bottom ? 16 : -8)} fill={color} fontSize={13} fontFamily="var(--font-mono, monospace)" fontWeight="700">{label}</text>
    </g>
  );
}

function RoundBtn({ dir, onClick, stake, payout }: { dir: "up" | "down"; onClick: () => void; stake: number; payout: number }) {
  const up = dir === "up";
  return (
    <button onClick={onClick} className={`grid h-28 w-28 place-items-center rounded-full border-2 transition hover:scale-105 active:scale-95 ${up ? "border-lime bg-lime/15 text-lime hover:bg-lime/25" : "border-magenta bg-magenta/15 text-magenta hover:bg-magenta/25"}`} style={{ boxShadow: `0 0 28px ${up ? "rgba(57,255,20,.45)" : "rgba(255,43,214,.45)"}` }}>
      <div className="flex flex-col items-center leading-none">
        {up ? <ArrowUp size={34} strokeWidth={2.6} /> : <ArrowDown size={34} strokeWidth={2.6} />}
        <span className="mt-1 font-display text-sm font-black tracking-widest">{up ? "UP" : "DOWN"}</span>
        <span className="mt-1 font-mono text-[10px] opacity-70">{usdc(stake)} → {payout}×</span>
      </div>
    </button>
  );
}
