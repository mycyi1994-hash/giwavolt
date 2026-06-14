"use client";

import { useEffect, useState } from "react";
import { Skull, Shuffle, Hand, Gem } from "lucide-react";
import { usePlay } from "./PlayProvider";
import ModeToggle from "./ModeToggle";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import QuoteTicker from "@/components/ui/QuoteTicker";
import LiveFeed from "./LiveFeed";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";
import { newBoard, multiplierAfter, revealAll, DIFFICULTIES, DIFFICULTY_ORDER, totalTiles } from "@/lib/death";
import type { Difficulty } from "@/lib/types";
import { krw, amt } from "@/lib/money";
import { useGameStake } from "@/lib/useGameStake";
import GameBalance from "./GameBalance";

export default function DeathFun() {
  const { balance, adjust, death, setDeath } = usePlay();
  const { mode, real, stake, setStake, presets } = useGameStake();
  const toast = useToast();
  const [custom, setCustom] = useState("");
  const [diff, setDiff] = useState<Difficulty>("medium");
  const [shake, setShake] = useState(false);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (!death) setDeath(newBoard(mode, diff));
    else setDiff(death.difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (death && death.status !== "playing" && death.mode !== mode) setDeath(newBoard(mode, diff));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (!death) return null;

  const playing = death.status === "playing";
  const total = totalTiles(death);
  const value = +(death.stake * death.multiplier).toFixed(2);
  const nextMult = multiplierAfter(death.picks + 1, death.bombs, total);

  // tile size scales with the board so even ULTRA fits on screen, capped at
  // 64px so small boards still read big.
  const gap = death.dim > 13 ? 4 : 8;
  const BOARD_MAX = 600; // px the square board may occupy in the play area
  const tilePx = Math.max(16, Math.min(64, Math.floor((BOARD_MAX - (death.dim - 1) * gap) / death.dim)));
  const animate = death.dim <= 13;

  const start = () => {
    if (death.status !== "idle") return;
    if (stake <= 0 || balance[mode] < stake) return;
    sfx.place();
    adjust(mode, -stake);
    setDeath({
      ...death,
      stake,
      tiles: death.tiles.map((t) => (t === "void" ? "void" : "hidden")), // keep the board shape
      picks: 0,
      multiplier: 1,
      status: "playing",
      cashout: 0,
    });
  };
  const reveal = (i: number) => {
    if (!playing || death.tiles[i] !== "hidden") return;
    if (death.bombsIdx.includes(i)) {
      sfx.skull();
      setShake(true);
      setTimeout(() => setShake(false), 400);
      const tiles = revealAll({ ...death, tiles: death.tiles.map((t, k) => (k === i ? "skull" : t)) });
      setDeath({ ...death, tiles, status: "busted", cashout: 0 });
      toast.push("skull", `BUSTED −${amt(death.mode === "real", death.stake)}`, "hit a skull");
    } else {
      sfx.reveal();
      const tiles = death.tiles.slice();
      tiles[i] = "safe";
      const picks = death.picks + 1;
      setDeath({ ...death, tiles, picks, multiplier: multiplierAfter(picks, death.bombs, total) });
    }
  };
  const stop = () => {
    if (!playing) return;
    const cashout = +(death.stake * death.multiplier).toFixed(2);
    sfx.cashout();
    adjust(death.mode, cashout);
    setDeath({ ...death, tiles: revealAll(death), status: "stopped", cashout });
    toast.push("cash", `CASHED OUT +${amt(death.mode === "real", cashout)}`, `${death.multiplier.toFixed(2)}× · ${death.picks} safe`);
    setBurst(true);
    setTimeout(() => setBurst(false), 1000);
  };
  const stageReset = () => {
    if (playing) return;
    sfx.tick();
    setDeath(newBoard(mode, diff));
  };
  const chooseDiff = (d: Difficulty) => {
    if (playing) return;
    sfx.select();
    setDiff(d);
    setDeath(newBoard(mode, d));
  };
  const applyCustom = (v: string) => {
    setCustom(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) setStake(+n.toFixed(2));
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* controls */}
      <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-b border-line bg-ink/40 p-4 md:w-[272px] md:border-b-0 md:border-r">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-sm font-bold tracking-wide text-magenta">
            <Skull size={16} /> DEATH FUN
          </div>
          <ModeToggle />
        </div>

        {/* difficulty */}
        <div className={playing ? "pointer-events-none opacity-40" : ""}>
          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">DIFFICULTY</div>
          <div className="grid grid-cols-2 gap-1.5">
            {DIFFICULTY_ORDER.map((d) => {
              const cfg = DIFFICULTIES[d];
              const active = d === diff;
              return (
                <button
                  key={d}
                  onClick={() => chooseDiff(d)}
                  className={`clip flex flex-col items-center py-2 font-display text-[12px] font-bold transition ${
                    active ? "border border-magenta bg-magenta/15 text-magenta" : "border border-line bg-ink-2 text-muted hover:text-txt"
                  }`}
                >
                  {cfg.label}
                  <span className="font-mono text-[9px] text-faint">
                    {cfg.dim}×{cfg.dim}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <GameBalance real={real} amount={balance[mode]} demoLabel="BALANCE" demoSub={krw(balance.demo)} />
        </div>

        <div className={playing ? "pointer-events-none opacity-40" : ""}>
          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">BET SIZE ({real ? "tKRW" : "USDC"})</div>
          <div className="grid grid-cols-4 gap-1.5">
            {presets.map((b) => {
              const active = b === stake && custom === "";
              return (
                <button
                  key={b}
                  onClick={() => {
                    sfx.select();
                    setCustom("");
                    setStake(b);
                  }}
                  className={`clip py-2 font-mono text-[12px] font-bold tabular transition ${
                    active ? "border border-magenta bg-magenta/10 text-magenta" : "border border-line bg-ink-2 text-muted hover:text-txt"
                  }`}
                >
                  {real ? b.toLocaleString() : b}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2 border border-line bg-ink-2 px-3 py-2 clip">
            <input
              value={custom}
              onChange={(e) => applyCustom(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="Custom amount"
              className="tabular w-full bg-transparent text-[14px] text-txt outline-none placeholder:text-faint"
            />
            <span className="font-mono text-[11px] text-cyan">{real ? "tKRW" : "USDC"}</span>
          </div>
        </div>

        {playing ? (
          <button onClick={stop} className="clip border border-lime bg-lime/15 py-3 font-display text-sm font-black tracking-widest text-lime animate-glow">
            STOP · CASH OUT {amt(real, value)}
          </button>
        ) : death.status === "idle" ? (
          <button
            onClick={start}
            disabled={balance[mode] < stake}
            className="btn-neon clip bg-magenta/15 py-3 font-display text-sm font-black tracking-widest text-magenta disabled:opacity-40"
            style={{ borderColor: "rgba(255,43,214,.6)", boxShadow: "0 0 14px rgba(255,43,214,.3)" }}
          >
            BET {amt(real, stake)}
          </button>
        ) : (
          <button onClick={stageReset} className="btn-neon clip flex items-center justify-center gap-1.5 bg-cyan/15 py-3 font-display text-sm font-black tracking-widest text-cyan">
            <Shuffle size={15} /> NEW BOARD
          </button>
        )}

        {death.status === "idle" && (
          <button
            onClick={stageReset}
            className="clip flex items-center justify-center gap-1.5 border border-line bg-ink-2 py-2.5 font-display text-[12px] font-bold tracking-wide text-muted transition hover:text-txt"
          >
            <Shuffle size={14} /> STAGE RESET
          </button>
        )}

        <div className="mt-auto">
          <QuoteTicker />
        </div>
      </aside>

      {/* board */}
      <main className="relative grid min-w-0 flex-1 place-items-center overflow-auto p-6">
        <LiveFeed className="absolute bottom-3 left-3 top-3 z-20 hidden w-56 overflow-hidden lg:block" />
        <div className="absolute inset-x-0 top-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 font-mono text-[12px]">
          <Tag label="SKULLS" value={`${death.bombs}`} cls="text-magenta" />
          <span className="flex items-center gap-1.5">
            <span className="tracking-[0.2em] text-faint">MULT</span>
            <AnimatedNumber value={death.multiplier} format={(n) => `${n.toFixed(2)}×`} className="tabular font-bold text-lime" />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="tracking-[0.2em] text-faint">{playing ? "VALUE" : "STAKE"}</span>
            <AnimatedNumber value={playing ? value : death.stake} format={(n) => amt(real, n)} className="tabular font-bold text-cyan" />
          </span>
          {playing && <Tag label="NEXT" value={`${nextMult.toFixed(2)}×`} cls="text-faint" />}
        </div>

        <div className="relative flex flex-col items-center gap-4">
          {burst && <Burst />}
          <div
            className={shake ? "animate-shake" : ""}
            style={{ display: "grid", gridTemplateColumns: `repeat(${death.dim}, ${tilePx}px)`, gap }}
          >
            {death.tiles.map((t, i) => (
              <Tile key={`${i}-${t}`} t={t} size={tilePx} active={playing} animate={animate} preview={playing && tilePx >= 30 ? `${nextMult.toFixed(2)}×` : ""} onClick={() => reveal(i)} />
            ))}
          </div>

          {death.status === "busted" && <Banner cls="border-magenta text-magenta" icon={<Skull size={18} />} text={`BUSTED — lost ${amt(death.mode === "real", death.stake)}`} />}
          {death.status === "stopped" && <Banner cls="border-lime text-lime" icon={<Gem size={18} />} text={`CASHED OUT +${amt(death.mode === "real", death.cashout)} (${death.multiplier.toFixed(2)}×)`} />}
          {death.status === "idle" && (
            <p className="font-mono text-[11px] tracking-wider text-faint">
              <Hand size={12} className="mr-1 inline" /> pick difficulty & bet — skulls form a hidden pattern
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Tile({
  t,
  size,
  active,
  animate,
  preview,
  onClick,
}: {
  t: string;
  size: number;
  active: boolean;
  animate: boolean;
  preview: string;
  onClick: () => void;
}) {
  const base = "grid place-items-center clip border transition";
  const rev = animate ? "animate-reveal" : "";
  const icon = size >= 26;
  if (t === "void") return <div style={{ width: size, height: size }} aria-hidden />;
  if (t === "skull")
    return (
      <div className={`${base} ${rev} border-magenta bg-magenta/15 text-magenta`} style={{ width: size, height: size, boxShadow: "0 0 10px rgba(255,43,214,.4)" }}>
        {icon ? <Skull size={Math.round(size * 0.55)} /> : <span className="h-1.5 w-1.5 rounded-full bg-magenta" />}
      </div>
    );
  if (t === "safe")
    return (
      <div className={`${base} ${rev} border-lime bg-lime/12 text-lime`} style={{ width: size, height: size, boxShadow: "0 0 8px rgba(57,255,20,.3)" }}>
        {icon ? <Gem size={Math.round(size * 0.5)} /> : <span className="h-1.5 w-1.5 rounded-full bg-lime" />}
      </div>
    );
  return (
    <button
      onClick={onClick}
      disabled={!active}
      style={{ width: size, height: size }}
      className={`${base} group relative border-line bg-ink-2 text-faint ${active ? "cursor-pointer hover:border-cyan hover:text-cyan hover:bg-cyan/10" : "cursor-default"}`}
    >
      {size >= 22 && <span className="font-display font-black opacity-30 transition group-hover:opacity-0" style={{ fontSize: Math.round(size * 0.4) }}>?</span>}
      {preview && (
        <span className="tabular absolute inset-0 grid place-items-center font-mono text-[11px] font-bold text-cyan opacity-0 transition group-hover:opacity-100">{preview}</span>
      )}
    </button>
  );
}

function Tag({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="tracking-[0.2em] text-faint">{label}</span>
      <span className={`tabular font-bold ${cls}`}>{value}</span>
    </span>
  );
}

function Banner({ cls, icon, text }: { cls: string; icon: React.ReactNode; text: string }) {
  return (
    <div className={`panel clip flex items-center gap-2 border px-4 py-2 font-display text-sm font-bold tracking-wide ${cls}`}>
      {icon} {text}
    </div>
  );
}

function Burst() {
  const dots = Array.from({ length: 14 });
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      {dots.map((_, i) => {
        const ang = (i / dots.length) * Math.PI * 2;
        const dist = 90 + (i % 3) * 26;
        const col = i % 2 ? "#39ff14" : "#00e5ff";
        return (
          <span
            key={i}
            className="absolute h-2 w-2 rounded-full"
            style={{
              background: col,
              boxShadow: `0 0 10px ${col}`,
              animation: "burst 1s ease-out forwards",
              // @ts-expect-error custom props consumed by the keyframe
              "--dx": `${Math.cos(ang) * dist}px`,
              "--dy": `${Math.sin(ang) * dist}px`,
            }}
          />
        );
      })}
    </div>
  );
}
