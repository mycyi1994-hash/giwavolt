"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp, Skull, Coins, Flame } from "lucide-react";

type Kind = "win" | "cash" | "bust" | "bet";
type Ev = { id: number; user: string; game: string; kind: Kind; mult?: number; amount: number; mega: boolean };

const GAMES = ["TAP", "CANDLE", "DEATH"];
let seq = 0;
const rndUser = () => "0x" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0") + "…" + Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");

function gen(): Ev {
  const r = Math.random();
  const game = GAMES[Math.floor(Math.random() * GAMES.length)];
  if (r < 0.46) {
    const mult = +(1.2 + Math.pow(Math.random(), 3) * 95).toFixed(1);
    return { id: ++seq, user: rndUser(), game, kind: "win", mult, amount: +(mult * (0.5 + Math.random() * 25)).toFixed(2), mega: mult > 22 };
  }
  if (r < 0.7) {
    const mult = +(1.1 + Math.pow(Math.random(), 2) * 18).toFixed(2);
    return { id: ++seq, user: rndUser(), game: "DEATH", kind: "cash", mult, amount: +(mult * (0.5 + Math.random() * 18)).toFixed(2), mega: mult > 7 };
  }
  if (r < 0.9) return { id: ++seq, user: rndUser(), game: "DEATH", kind: "bust", amount: +(1 + Math.random() * 140).toFixed(2), mega: false };
  return { id: ++seq, user: rndUser(), game, kind: "bet", amount: +(1 + Math.random() * 60).toFixed(2), mega: false };
}

const META: Record<Kind, { cls: string; icon: React.ReactNode; verb: string; sign: string }> = {
  win: { cls: "text-lime", icon: <TrendingUp size={12} />, verb: "won", sign: "+" },
  cash: { cls: "text-lime", icon: <Coins size={12} />, verb: "cashed", sign: "+" },
  bust: { cls: "text-magenta", icon: <Skull size={12} />, verb: "busted", sign: "−" },
  bet: { cls: "text-cyan", icon: <span className="text-[10px]">◆</span>, verb: "bet", sign: "" },
};

export default function LiveFeed({ className = "" }: { className?: string }) {
  const [items, setItems] = useState<Ev[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const tick = () => {
      setItems((x) => [gen(), ...x].slice(0, 30));
      timer.current = setTimeout(tick, 300 + Math.random() * 600);
    };
    setItems(Array.from({ length: 20 }, gen));
    tick();
    return () => clearTimeout(timer.current);
  }, []);

  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden>
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.25em] text-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-lime animate-flicker" /> LIVE
      </div>
      <div className="flex flex-col gap-1">
        {items.map((e, i) => {
          const m = META[e.kind];
          const fade = Math.max(0.18, 1 - i / 34);
          return (
            <div
              key={e.id}
              className={`flex items-center gap-1.5 border border-line/60 bg-ink/70 px-2 py-1 font-mono clip backdrop-blur-sm ${e.mega ? "animate-rise" : ""}`}
              style={{ opacity: fade, boxShadow: e.mega ? `0 0 12px ${e.kind === "bust" ? "rgba(255,43,214,.5)" : "rgba(57,255,20,.5)"}` : undefined, borderColor: e.mega ? (e.kind === "bust" ? "rgba(255,43,214,.6)" : "rgba(57,255,20,.6)") : undefined }}
            >
              <span className={m.cls}>{m.icon}</span>
              <span className="tabular text-[10px] text-muted">{e.user}</span>
              <span className="rounded bg-ink-2 px-1 text-[8px] text-faint">{e.game}</span>
              {e.mult && <span className={`tabular text-[10px] font-bold ${e.mega ? "text-gold" : m.cls}`}>{e.mult}×</span>}
              <span className={`tabular ml-auto text-[11px] font-bold ${m.cls}`}>
                {m.sign}${e.amount}
              </span>
              {e.mega && <Flame size={11} className="text-gold" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
