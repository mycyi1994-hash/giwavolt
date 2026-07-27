"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Skull, Shuffle, Hand, Gem, ShieldCheck } from "lucide-react";
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
import type { DeathTile } from "@/lib/types";

type ServerRound = {
  id: string;
  difficulty: Difficulty;
  dim: number;
  stake: number;
  bombs: number;
  picks: number;
  multiplier: number;
  status: "playing" | "busted" | "stopped";
  cashout: number;
  tiles: DeathTile[];
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  serverSeed?: string;
};

type FairInfo = { hash: string; seed?: string; clientSeed: string; nonce: number };

export default function DeathFun() {
  const { balance, adjust, setBalance, death, setDeath } = usePlay();
  const { address } = useAccount();
  const { mode, real, stake, setStake, presets } = useGameStake();
  const toast = useToast();
  const [custom, setCustom] = useState("");
  const [diff, setDiff] = useState<Difficulty>("medium");
  const [shake, setShake] = useState(false);
  const [burst, setBurst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fair, setFair] = useState<FairInfo | null>(null);

  // REAL rounds live on the server. The board here is only ever what the server
  // chose to show us: an unopened tile is "hidden" because the server said so,
  // not because this component is politely not looking.
  const roundId = useRef<string | null>(null);
  const addrRef = useRef(address);
  addrRef.current = address;

  const applyRound = useCallback(
    (r: ServerRound) => {
      roundId.current = r.status === "playing" ? r.id : null;
      setFair({ hash: r.serverSeedHash, seed: r.serverSeed, clientSeed: r.clientSeed, nonce: r.nonce });
      setDeath({
        mode: "real",
        difficulty: r.difficulty,
        dim: r.dim,
        stake: r.stake,
        bombs: r.bombs,
        bombsIdx: [], // the server keeps these until the round is over
        tiles: r.tiles,
        picks: r.picks,
        multiplier: r.multiplier,
        status: r.status === "playing" ? "playing" : r.status === "busted" ? "busted" : "stopped",
        cashout: r.cashout,
      });
      setDiff(r.difficulty);
    },
    [setDeath]
  );

  useEffect(() => {
    if (!death) setDeath(newBoard(mode, diff));
    else setDiff(death.difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (death && death.status !== "playing" && death.mode !== mode) setDeath(newBoard(mode, diff));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Pick up a round left open by a closed tab — the stake is already spent, so
  // abandoning it would just be losing money to a page reload.
  useEffect(() => {
    if (!real || !address) return;
    let cancelled = false;
    fetch(`/api/game/death/round?address=${address}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && d.round && d.round.status === "playing") applyRound(d.round);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [real, address, applyRound]);

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

  const api = async (path: string, body: unknown) => {
    const r = await fetch(`/api/game/death/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: addrRef.current, ...(body as object) }),
    });
    return { ok: r.ok, data: await r.json() };
  };

  const bust = (r: ServerRound) => {
    sfx.skull();
    setShake(true);
    setTimeout(() => setShake(false), 400);
    applyRound(r);
    toast.push("skull", `BUSTED −${amt(true, r.stake)}`, "hit a skull");
  };

  const start = async () => {
    if (death.status !== "idle" || busy) return;
    if (stake <= 0 || balance[mode] < stake) return;
    sfx.place();

    if (!real) {
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
      return;
    }

    setBusy(true);
    // The client seed lets the player co-author the board's randomness, so the
    // server can't have pre-computed an unlucky one for them.
    const clientSeed = Math.random().toString(36).slice(2, 18);
    const { ok, data } = await api("start", { difficulty: diff, stake, clientSeed });
    setBusy(false);
    if (!ok || !data?.ok) {
      toast.push("info", "COULD NOT DEAL", typeof data?.error === "string" ? data.error : "server declined");
      return;
    }
    if (typeof data.balance === "number") setBalance("real", data.balance);
    applyRound(data.round);
  };

  const reveal = async (i: number) => {
    if (!playing || death.tiles[i] !== "hidden" || busy) return;

    if (!real) {
      if (death.bombsIdx.includes(i)) {
        sfx.skull();
        setShake(true);
        setTimeout(() => setShake(false), 400);
        const tiles = revealAll({ ...death, tiles: death.tiles.map((t, k) => (k === i ? "skull" : t)) });
        setDeath({ ...death, tiles, status: "busted", cashout: 0 });
        toast.push("skull", `BUSTED −${amt(false, death.stake)}`, "hit a skull");
      } else {
        sfx.reveal();
        const tiles = death.tiles.slice();
        tiles[i] = "safe";
        const picks = death.picks + 1;
        setDeath({ ...death, tiles, picks, multiplier: multiplierAfter(picks, death.bombs, total) });
      }
      return;
    }

    if (!roundId.current) return;
    setBusy(true);
    const { ok, data } = await api("reveal", { roundId: roundId.current, index: i });
    setBusy(false);
    if (!ok || !data?.ok) {
      toast.push("info", "TILE NOT OPENED", typeof data?.error === "string" ? data.error : "server declined");
      return;
    }
    if (data.hit === "skull") bust(data.round);
    else {
      sfx.reveal();
      applyRound(data.round);
    }
  };

  const stop = async () => {
    if (!playing || busy) return;

    if (!real) {
      const cashout = +(death.stake * death.multiplier).toFixed(2);
      sfx.cashout();
      adjust(death.mode, cashout);
      setDeath({ ...death, tiles: revealAll(death), status: "stopped", cashout });
      toast.push("cash", `CASHED OUT +${amt(false, cashout)}`, `${death.multiplier.toFixed(2)}× · ${death.picks} safe`);
      setBurst(true);
      setTimeout(() => setBurst(false), 1000);
      return;
    }

    if (!roundId.current) return;
    setBusy(true);
    const { ok, data } = await api("cashout", { roundId: roundId.current });
    setBusy(false);
    if (!ok || !data?.ok) {
      toast.push("info", "CASH OUT FAILED", typeof data?.error === "string" ? data.error : "server declined");
      return;
    }
    sfx.cashout();
    if (typeof data.balance === "number") setBalance("real", data.balance);
    applyRound(data.round);
    toast.push("cash", `CASHED OUT +${amt(true, data.payout)}`, `${data.round.multiplier.toFixed(2)}× · ${data.round.picks} safe`);
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

        {real && fair && <FairPanel fair={fair} />}

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

// The commitment, and then the proof. Before the round only the hash is known,
// so the player can see the board was fixed in advance without seeing it. After
// it ends the seed appears, and re-deriving the board from it is what turns
// "trust us" into something checkable.
function FairPanel({ fair }: { fair: FairInfo }) {
  const short = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-8)}` : s);
  return (
    <div className="clip border border-line bg-ink-2 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] text-faint">
        <ShieldCheck size={11} className={fair.seed ? "text-lime" : "text-cyan"} />
        {fair.seed ? "PROVABLY FAIR · REVEALED" : "PROVABLY FAIR · COMMITTED"}
      </div>
      <dl className="space-y-1 font-mono text-[9px] leading-relaxed">
        <div className="flex justify-between gap-2">
          <dt className="text-faint">hash</dt>
          <dd className="tabular truncate text-muted" title={fair.hash}>{short(fair.hash)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-faint">client</dt>
          <dd className="tabular truncate text-muted" title={fair.clientSeed}>{fair.clientSeed || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-faint">nonce</dt>
          <dd className="tabular text-muted">{fair.nonce}</dd>
        </div>
        {fair.seed && (
          <div className="flex justify-between gap-2">
            <dt className="text-lime">seed</dt>
            <dd className="tabular truncate text-lime" title={fair.seed}>{short(fair.seed)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-1.5 font-mono text-[8px] leading-relaxed text-faint">
        {fair.seed
          ? "sha256(seed) matches the hash committed before the deal."
          : "The board is already fixed. The seed is published when the round ends."}
      </p>
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
