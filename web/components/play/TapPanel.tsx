"use client";

import { useState } from "react";
import { Plus, RotateCcw, Droplets, ArrowUpFromLine, Loader2 } from "lucide-react";
import { usePlay } from "./PlayProvider";
import ModeToggle from "./ModeToggle";
import { useWalletGate } from "@/lib/walletGate";
import { useToast } from "@/components/ui/Toast";
import QuoteTicker from "@/components/ui/QuoteTicker";
import { sfx } from "@/lib/sound";
import { usdc, krw, won } from "@/lib/money";

const DEMO_PRESETS = [1, 5, 10, 100];
const REAL_PRESETS = [10_000, 50_000, 100_000, 500_000]; // tKRW

export default function TapPanel({ price, bid, onBid }: { price: number; bid: number; onBid: (n: number) => void }) {
  const { mode, balance, adjust, resetDemo, realReady, claimReal, withdrawReal } = usePlay();
  const { requireWallet } = useWalletGate();
  const toast = useToast();
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<"claim" | "withdraw" | null>(null);
  const real = mode === "real";
  const presets = real ? REAL_PRESETS : DEMO_PRESETS;

  const applyCustom = (v: string) => {
    setCustom(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) onBid(+n.toFixed(real ? 0 : 2));
  };

  const onClaim = () =>
    requireWallet(async () => {
      setBusy("claim");
      sfx.tick();
      const r = await claimReal();
      setBusy(null);
      if (r.ok) {
        sfx.win();
        toast.push("cash", "TEST KRW ADDED", `+${won(Number(process.env.NEXT_PUBLIC_FAUCET_DRIP_TKRW) || 1_000_000)}`);
      } else {
        toast.push("info", "FAUCET", r.error ?? "could not claim");
      }
    });

  const onWithdraw = () =>
    requireWallet(async () => {
      if (balance.real <= 0) {
        toast.push("info", "WITHDRAW", "nothing to withdraw");
        return;
      }
      setBusy("withdraw");
      sfx.tick();
      const r = await withdrawReal(balance.real);
      setBusy(null);
      if (r.ok) {
        sfx.win();
        toast.push("cash", "WITHDRAWN", "real tKRW sent to your wallet");
      } else {
        toast.push("info", "WITHDRAW", r.error ?? "withdraw failed");
      }
    });

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 border-b border-line bg-ink/40 p-4 md:w-[270px] md:border-b-0 md:border-r">
      <div className="flex items-center justify-between">
        <div className="font-display text-sm font-bold tracking-wide text-txt">TAP TRADING</div>
        <ModeToggle />
      </div>

      <div className="panel clip flex items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-2 font-display text-sm font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#627eea] text-[10px] text-white">Ξ</span>
          ETH / USD
        </span>
        <span className="tabular text-[15px] font-bold text-lime neon-lime">{price.toFixed(2)}</span>
      </div>

      {/* balance */}
      {real ? (
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">GAME BALANCE (tKRW)</div>
          <div className="tabular text-[28px] font-black leading-none text-magenta neon-magenta">{won(balance.real)}</div>
          <div className="tabular text-[11px] text-faint">off-chain · no signature to play</div>
        </div>
      ) : (
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">DEMO BALANCE</div>
          <div className="tabular text-[28px] font-black leading-none text-cyan neon-cyan">{usdc(balance.demo)}</div>
          <div className="tabular text-[11px] text-faint">{krw(balance.demo)}</div>
        </div>
      )}

      {/* bid */}
      <div>
        <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">BID SIZE ({real ? "tKRW" : "USDC"})</div>
        <div className="grid grid-cols-4 gap-1.5">
          {presets.map((b) => {
            const active = b === bid && custom === "";
            return (
              <button
                key={b}
                onClick={() => {
                  sfx.select();
                  setCustom("");
                  onBid(b);
                }}
                className={`clip py-2.5 font-mono text-[12px] font-bold tabular transition ${
                  active ? "border border-cyan bg-cyan/10 text-cyan animate-glow" : "border border-line bg-ink-2 text-muted hover:border-line-strong hover:text-txt"
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

      {/* funds */}
      {real ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onClaim}
            disabled={busy !== null}
            className="btn-neon clip flex items-center justify-center gap-1.5 bg-lime/10 py-2.5 font-display text-[12px] font-bold tracking-wide text-lime disabled:opacity-60"
          >
            {busy === "claim" ? <Loader2 size={14} className="animate-spin" /> : <Droplets size={14} />} GET TEST KRW
          </button>
          <button
            onClick={onWithdraw}
            disabled={busy !== null}
            className="clip flex items-center justify-center gap-1.5 border border-magenta/50 py-2.5 font-display text-[12px] font-bold tracking-wide text-magenta transition hover:bg-magenta/10 disabled:opacity-60"
          >
            {busy === "withdraw" ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpFromLine size={14} />} WITHDRAW
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              sfx.tick();
              adjust("demo", 500);
            }}
            className="btn-neon clip flex items-center justify-center gap-1 bg-cyan/10 py-2.5 font-display text-[12px] font-bold tracking-wide text-cyan"
          >
            <Plus size={14} strokeWidth={3} /> PLAY MONEY
          </button>
          <button onClick={resetDemo} className="clip flex items-center justify-center gap-1 border border-magenta/50 py-2.5 font-display text-[12px] font-bold tracking-wide text-magenta transition hover:bg-magenta/10">
            <RotateCcw size={14} strokeWidth={2.6} /> RESET
          </button>
        </div>
      )}

      {real && (
        <p className="-mt-2 font-mono text-[10px] leading-relaxed text-faint">
          Free test money — no real value. Play with no popups; WITHDRAW sends real tKRW to your wallet.
        </p>
      )}

      <div className="mt-auto">
        <QuoteTicker />
      </div>
    </aside>
  );
}
