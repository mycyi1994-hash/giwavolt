"use client";

import { useEffect, useState } from "react";
import { Skull, Shuffle, Hand, Gem } from "lucide-react";
import { usePlay } from "./PlayProvider";
import ModeToggle from "./ModeToggle";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";
import { newBoard, multiplierAfter, revealAll, MIN_BOMBS, MAX_BOMBS } from "@/lib/death";
import { usdc, krw } from "@/lib/money";

const PRESETS = [1, 5, 10, 100];

export default function DeathFun() {
  const { mode, balance, adjust, death, setDeath } = usePlay();
  const toast = useToast();
  const [stake, setStake] = useState(5);
  const [custom, setCustom] = useState("");
  const [shake, setShake] = useState(false);
  const [burst, setBurst] = useState(false);

  // ensure an idle board exists; reroll when mode changes while idle
  useEffect(() => {
    if (!death || (death.status !== "playing" && death.mode !== mode)) setDeath(newBoard(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => {
    if (!death) setDeath(newBoard(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!death) return null;

  // Death Fun has no on-chain contract yet — Real mode is gated.
  if (mode === "real") {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="panel clip flex max-w-md flex-col items-center gap-3 px-8 py-7 text-center">
          <Skull size={28} className="text-magenta" />
          <div className="font-display text-lg font-bold tracking-wide text-magenta neon-magenta">REAL — COMING SOON</div>
          <p className="font-sans text-[13px] text-muted">
            On-chain Death Fun (real ETH) is in the works. Switch to <span className="text-cyan">DEMO</span> to play now.
          </p>
        </div>
      </div>
    );
  }

  const playing = death.status === "playing";
  const value = +(death.stake * death.multiplier).toFixed(2);
  const nextMult = multiplierAfter(death.picks + 1, death.bombs);

  const start = () => {
    if (death.status !== "idle") return; // must be a fresh, unseen board
    if (stake <= 0 || balance[mode] < stake) return;
    sfx.place();
    adjust(mode, -stake);
    setDeath({ ...death, stake, tiles: death.tiles.map(() => "hidden"), picks: 0, multiplier: 1, status: "playing", cashout: 0 });
  };
  const reveal = (i: number) => {
    if (!playing || death.tiles[i] !== "hidden") return;
    if (death.bombsIdx.includes(i)) {
      sfx.skull();
      setShake(true);
      setTimeout(() => setShake(false), 400);
      const tiles = revealAll({ ...death, tiles: death.tiles.map((t, k) => (k === i ? "skull" : t)) });
      setDeath({ ...death, tiles, status: "busted", cashout: 0 });
      toast.push("skull", `BUSTED −${usdc(death.stake)}`, "hit a skull");
    } else {
      sfx.reveal();
      const tiles = death.tiles.slice();
      tiles[i] = "safe";
      const picks = death.picks + 1;
      setDeath({ ...death, tiles, picks, multiplier: multiplierAfter(picks, death.bombs) });
    }
  };
  const stop = () => {
    if (!playing) return;
    const cashout = +(death.stake * death.multiplier).toFixed(2);
    sfx.cashout();
    adjust(death.mode, cashout);
    setDeath({ ...death, tiles: revealAll(death), status: "stopped", cashout });
    toast.push("cash", `CASHED OUT +${usdc(cashout)}`, `${death.multiplier.toFixed(2)}× · ${death.picks} safe`);
    setBurst(true);
    setTimeout(() => setBurst(false), 1000);
  };
  const stageReset = () => {
    if (playing) return;
    sfx.tick();
    setDeath(newBoard(mode));
  };
  const applyCustom = (v: string) => {
    setCustom(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) setStake(+n.toFixed(2));
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* controls */}
      <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-line bg-ink/40 p-4 md:w-[270px] md:border-b-0 md:border-r">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-sm font-bold tracking-wide text-magenta">
            <Skull size={16} /> DEATH FUN
          </div>
          <ModeToggle />
        </div>

        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">BALANCE</div>
          <div className="tabular text-[26px] font-black leading-none text-cyan neon-cyan">{usdc(balance[mode])}</div>
          <div className="tabular text-[11px] text-faint">{krw(balance[mode])}</div>
        </div>

        {/* stake */}
        <div className={playing ? "pointer-events-none opacity-40" : ""}>
          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">BET SIZE</div>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((b) => {
              const active = b === stake && custom === "";
              return (
                <button
                  key={b}
                  onClick={() => {
                    sfx.select();
                    setCustom("");
                    setStake(b);
                  }}
                  className={`clip py-2.5 font-mono text-[13px] font-bold tabular transition ${
                    active ? "border border-magenta bg-magenta/10 text-magenta" : "border border-line bg-ink-2 text-muted hover:text-txt"
                  }`}
                >
                  {b}
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
            <span className="font-mono text-[11px] text-cyan">USDC</span>
          </div>
        </div>

        {/* primary action */}
        {playing ? (
          <button
            onClick={stop}
            className="clip border border-lime bg-lime/15 py-3 font-display text-sm font-black tracking-widest text-lime animate-glow"
          >
            STOP · CASH OUT {usdc(value)}
          </button>
        ) : death.status === "idle" ? (
          <button
            onClick={start}
            disabled={balance[mode] < stake}
            className="btn-neon clip bg-magenta/15 py-3 font-display text-sm font-black tracking-widest text-magenta disabled:opacity-40"
            style={{ borderColor: "rgba(255,43,214,.6)", boxShadow: "0 0 14px rgba(255,43,214,.3)" }}
          >
            BET {usdc(stake)}
          </button>
        ) : (
          <button
            onClick={stageReset}
            className="btn-neon clip flex items-center justify-center gap-1.5 bg-cyan/15 py-3 font-display text-sm font-black tracking-widest text-cyan"
          >
            <Shuffle size={15} /> NEW BOARD
          </button>
        )}

        {/* reroll the idle board */}
        {death.status === "idle" && (
          <button
            onClick={stageReset}
            className="clip flex items-center justify-center gap-1.5 border border-line bg-ink-2 py-2.5 font-display text-[12px] font-bold tracking-wide text-muted transition hover:text-txt"
          >
            <Shuffle size={14} /> STAGE RESET
          </button>
        )}

        <div className="mt-auto space-y-1.5 border-t border-line pt-3 font-sans text-[12px] leading-relaxed text-muted">
          <p>
            <span className="text-magenta">›</span> Reveal safe tiles to climb the multiplier. Hit a{" "}
            <span className="text-magenta">skull</span> and you bust.
          </p>
          <p className="text-faint">
            {MIN_BOMBS}–{MAX_BOMBS} skulls, random each board · STOP locks your win · switch tabs anytime, it waits.
          </p>
        </div>
      </aside>

      {/* board */}
      <main className="relative grid min-w-0 flex-1 place-items-center p-6">
        {/* status header */}
        <div className="absolute inset-x-0 top-4 flex items-center justify-center gap-6 font-mono text-[12px]">
          <Tag label="SKULLS" value={`${death.bombs}`} cls="text-magenta" />
          <span className="flex items-center gap-1.5">
            <span className="tracking-[0.2em] text-faint">MULT</span>
            <AnimatedNumber value={death.multiplier} format={(n) => `${n.toFixed(2)}×`} className="tabular font-bold text-lime" />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="tracking-[0.2em] text-faint">{playing ? "VALUE" : "STAKE"}</span>
            <AnimatedNumber value={playing ? value : death.stake} format={(n) => usdc(n)} className="tabular font-bold text-cyan" />
          </span>
          {playing && <Tag label="NEXT" value={`${nextMult.toFixed(2)}×`} cls="text-faint" />}
        </div>

        <div className="relative flex flex-col items-center gap-4">
          {burst && <Burst />}
          <div className={`grid grid-cols-5 gap-2.5 ${shake ? "animate-shake" : ""}`}>
            {death.tiles.map((t, i) => (
              <Tile key={`${i}-${t}`} t={t} active={playing} preview={playing ? `${nextMult.toFixed(2)}×` : ""} onClick={() => reveal(i)} />
            ))}
          </div>

          {/* result banner */}
          {death.status === "busted" && (
            <Banner cls="border-magenta text-magenta" icon={<Skull size={18} />} text={`BUSTED — lost ${usdc(death.stake)}`} />
          )}
          {death.status === "stopped" && (
            <Banner cls="border-lime text-lime" icon={<Gem size={18} />} text={`CASHED OUT +${usdc(death.cashout)} (${death.multiplier.toFixed(2)}×)`} />
          )}
          {death.status === "idle" && (
            <p className="font-mono text-[11px] tracking-wider text-faint">
              <Hand size={12} className="mr-1 inline" /> set a bet and hit BET — skulls are hidden & random
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Tile({ t, active, preview, onClick }: { t: string; active: boolean; preview: string; onClick: () => void }) {
  const base = "grid h-16 w-16 place-items-center clip border transition";
  if (t === "skull")
    return (
      <div className={`${base} animate-reveal border-magenta bg-magenta/15 text-magenta`} style={{ boxShadow: "0 0 14px rgba(255,43,214,.4)" }}>
        <Skull size={26} />
      </div>
    );
  if (t === "safe")
    return (
      <div className={`${base} animate-reveal border-lime bg-lime/12 text-lime`} style={{ boxShadow: "0 0 12px rgba(57,255,20,.3)" }}>
        <Gem size={22} />
      </div>
    );
  return (
    <button
      onClick={onClick}
      disabled={!active}
      className={`${base} group relative border-line bg-ink-2 text-faint ${
        active ? "cursor-pointer hover:border-cyan hover:text-cyan hover:bg-cyan/10" : "cursor-default"
      }`}
    >
      <span className="font-display text-lg font-black opacity-40 transition group-hover:opacity-0">?</span>
      {active && preview && (
        <span className="tabular absolute inset-0 grid place-items-center font-mono text-[12px] font-bold text-cyan opacity-0 transition group-hover:opacity-100">
          {preview}
        </span>
      )}
    </button>
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
