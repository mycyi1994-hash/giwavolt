"use client";

import { useEffect, useState } from "react";
import { keccak256, toBytes } from "viem";
import { ChevronUp, ChevronDown, ShieldCheck, Copy, Check } from "lucide-react";
import { usePlay } from "./PlayProvider";
import ModeToggle from "./ModeToggle";
import LiveFeed from "./LiveFeed";
import QuoteTicker from "@/components/ui/QuoteTicker";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";
import { usdc } from "@/lib/money";

const EDGE = 0.05; // 5%
const PRESETS = [1, 5, 10, 100];
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];

type Status = "idle" | "playing" | "busted" | "cashed";

function rnd16() {
  const a = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
  return "0x" + [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const ZERO = "0x" + "00".repeat(16);
function hsh(s: string) {
  return keccak256(toBytes(s));
}
// deterministic, verifiable card from the seeds + index
function cardAt(server: string, client: string, i: number) {
  const h = hsh(`${server}:${client}:${i}`);
  const rank = (parseInt(h.slice(2, 10), 16) % 13) + 1; // 1..13
  const suit = parseInt(h.slice(10, 12), 16) % 4;
  return { rank, suit };
}
const pHigher = (r: number) => (14 - r) / 13; // P(next ≥ current)
const pLower = (r: number) => r / 13; // P(next ≤ current)
const mult = (p: number) => Math.max(1.01, (1 - EDGE) / p);

export default function HiLo() {
  const { mode, balance, adjust } = usePlay();
  const toast = useToast();
  const [stake, setStake] = useState(5);
  const [client, setClient] = useState("volt");
  const [copied, setCopied] = useState(false);

  // start with a deterministic seed (SSR-safe), randomise on mount
  const [server, setServer] = useState(ZERO);
  const [commit, setCommit] = useState(() => hsh(ZERO));
  const [nonce, setNonce] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [status, setStatus] = useState<Status>("idle");
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    const s = rnd16();
    setServer(s);
    setCommit(hsh(s));
  }, []);

  const card = cardAt(server, client, nonce);
  const value = +(stake * multiplier).toFixed(2);

  const newSeed = () => {
    const s = rnd16();
    setServer(s);
    setCommit(hsh(s));
    setReveal(false);
  };

  const deal = () => {
    if (status === "playing") return;
    if (stake <= 0 || balance[mode] < stake) return;
    if (status !== "idle") newSeed();
    sfx.place();
    adjust(mode, -stake);
    setNonce(0);
    setMultiplier(1);
    setStatus("playing");
    setReveal(false);
  };

  const guess = (dir: "higher" | "lower") => {
    if (status !== "playing") return;
    const cur = cardAt(server, client, nonce).rank;
    const next = cardAt(server, client, nonce + 1).rank;
    const correct = dir === "higher" ? next >= cur : next <= cur;
    if (correct) {
      sfx.reveal();
      const p = dir === "higher" ? pHigher(cur) : pLower(cur);
      setMultiplier((m) => +(m * mult(p)).toFixed(4));
      setNonce((n) => n + 1);
    } else {
      sfx.bust();
      setStatus("busted");
      setReveal(true);
      setNonce((n) => n + 1);
      toast.push("skull", `BUSTED −${usdc(stake)}`, `${RANKS[next]} was ${dir === "higher" ? "lower" : "higher"}`);
    }
  };

  const cashOut = () => {
    if (status !== "playing" || nonce === 0) return;
    sfx.cashout();
    adjust(mode, value);
    setStatus("cashed");
    setReveal(true);
    toast.push("cash", `CASHED OUT +${usdc(value)}`, `${multiplier.toFixed(2)}× · ${nonce} correct`);
  };

  const copy = () => {
    navigator.clipboard?.writeText(commit);
    setCopied(true);
    sfx.tick();
    setTimeout(() => setCopied(false), 1400);
  };

  const playing = status === "playing";
  const mh = mult(pHigher(card.rank));
  const ml = mult(pLower(card.rank));

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-line bg-ink/40 p-4 md:w-[260px] md:border-b-0 md:border-r">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-sm font-bold tracking-wide text-purple">HI · LO</div>
          <ModeToggle />
        </div>
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">{mode === "real" ? "DEPOSITED" : "BALANCE"}</div>
          <div className="tabular text-[26px] font-black leading-none text-cyan neon-cyan">{usdc(balance[mode])}</div>
        </div>
        <div className={playing ? "pointer-events-none opacity-40" : ""}>
          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">BET SIZE (USDC)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((b) => (
              <button key={b} onClick={() => { sfx.select(); setStake(b); }} className={`clip py-2.5 font-mono text-[13px] font-bold tabular transition ${b === stake ? "border border-purple bg-purple/15 text-purple" : "border border-line bg-ink-2 text-muted hover:text-txt"}`}>
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* provably fair */}
        <div className="border border-line bg-ink-2 p-3 clip">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-lime">
            <ShieldCheck size={13} /> PROVABLY FAIR
          </div>
          <div className="mb-1 font-mono text-[9px] text-faint">SERVER SEED HASH (committed)</div>
          <button onClick={copy} className="tabular mb-2 flex w-full items-center gap-1.5 break-all text-left font-mono text-[10px] text-cyan">
            {copied ? <Check size={11} /> : <Copy size={11} />} {commit.slice(0, 22)}…
          </button>
          <label className="font-mono text-[9px] text-faint">CLIENT SEED</label>
          <input value={client} onChange={(e) => setClient(e.target.value)} disabled={playing} className="tabular mt-1 w-full border border-line bg-ink px-2 py-1 text-[11px] text-txt outline-none clip disabled:opacity-50" />
          {reveal && (
            <div className="mt-2 break-all font-mono text-[9px] text-lime">REVEALED SEED: {server}</div>
          )}
          <p className="mt-2 font-sans text-[10px] leading-snug text-faint">Cards = keccak256(seed:client:index). Verify the seed hashes to the commit — no manipulation possible.</p>
        </div>

        <div className="mt-auto">
          <QuoteTicker />
        </div>
      </aside>

      <main className="relative grid min-w-0 flex-1 place-items-center overflow-auto p-6">
        <LiveFeed className="absolute bottom-3 left-3 top-3 z-20 hidden w-56 overflow-hidden lg:block" />

        <div className="flex flex-col items-center gap-5">
          {/* stats */}
          <div className="flex items-center gap-6 font-mono text-[12px]">
            <span className="flex items-center gap-1.5"><span className="tracking-[0.2em] text-faint">STREAK</span><span className="tabular font-bold text-purple">{nonce}</span></span>
            <span className="flex items-center gap-1.5"><span className="tracking-[0.2em] text-faint">MULT</span><span className="tabular font-bold text-lime">{multiplier.toFixed(2)}×</span></span>
            <span className="flex items-center gap-1.5"><span className="tracking-[0.2em] text-faint">VALUE</span><span className="tabular font-bold text-cyan">{usdc(playing ? value : stake)}</span></span>
          </div>

          {/* the card */}
          <Card rank={card.rank} suit={card.suit} dim={status === "busted"} />

          {/* actions */}
          {playing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <GuessBtn dir="higher" mult={mh} onClick={() => guess("higher")} />
                <GuessBtn dir="lower" mult={ml} onClick={() => guess("lower")} />
              </div>
              <button onClick={cashOut} disabled={nonce === 0} className="clip w-full border border-lime bg-lime/15 py-3 font-display text-sm font-black tracking-widest text-lime animate-glow disabled:opacity-30">
                CASH OUT {usdc(value)}
              </button>
            </>
          ) : (
            <button onClick={deal} disabled={balance[mode] < stake} className="btn-neon clip bg-purple/15 px-10 py-3.5 font-display text-base font-black tracking-widest text-purple disabled:opacity-40" style={{ borderColor: "rgba(157,77,255,.6)", boxShadow: "0 0 16px rgba(157,77,255,.3)" }}>
              {status === "idle" ? "DEAL" : "PLAY AGAIN"}
            </button>
          )}

          {status === "busted" && <Banner cls="border-magenta text-magenta" text={`BUSTED — lost ${usdc(stake)}`} />}
          {status === "cashed" && <Banner cls="border-lime text-lime" text={`CASHED OUT +${usdc(value)} (${multiplier.toFixed(2)}×)`} />}
          {status === "idle" && <p className="font-mono text-[11px] tracking-wider text-faint">Will the next card be higher or lower? Cash out anytime.</p>}
        </div>
      </main>
    </div>
  );
}

function Card({ rank, suit, dim }: { rank: number; suit: number; dim?: boolean }) {
  const red = suit === 1 || suit === 2;
  const col = red ? "#ff2bd6" : "#00e5ff";
  return (
    <div className={`relative grid h-52 w-40 place-items-center border-2 bg-ink-2 clip transition ${dim ? "opacity-60" : "animate-pop-in"}`} style={{ borderColor: col, boxShadow: `0 0 30px ${col}55` }}>
      <span className="absolute left-2 top-1 font-display text-lg font-black" style={{ color: col }}>{RANKS[rank]}</span>
      <span className="text-6xl" style={{ color: col, filter: `drop-shadow(0 0 10px ${col})` }}>{SUITS[suit]}</span>
      <span className="absolute bottom-1 right-2 rotate-180 font-display text-lg font-black" style={{ color: col }}>{RANKS[rank]}</span>
    </div>
  );
}

function GuessBtn({ dir, mult, onClick }: { dir: "higher" | "lower"; mult: number; onClick: () => void }) {
  const up = dir === "higher";
  return (
    <button onClick={onClick} className={`clip flex w-36 items-center justify-center gap-2 py-3.5 font-display text-base font-black tracking-wide transition ${up ? "border border-lime bg-lime/15 text-lime hover:bg-lime/25" : "border border-magenta bg-magenta/15 text-magenta hover:bg-magenta/25"}`} style={{ boxShadow: `0 0 14px ${up ? "rgba(57,255,20,.3)" : "rgba(255,43,214,.3)"}` }}>
      {up ? <ChevronUp size={20} /> : <ChevronDown size={20} />} {up ? "HIGHER" : "LOWER"}
      <span className="font-mono text-[11px] opacity-80">{mult.toFixed(2)}×</span>
    </button>
  );
}

function Banner({ cls, text }: { cls: string; text: string }) {
  return <div className={`panel clip border px-4 py-2 font-display text-sm font-bold tracking-wide ${cls}`}>{text}</div>;
}
