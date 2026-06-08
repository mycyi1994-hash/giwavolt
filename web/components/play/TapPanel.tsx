"use client";

import { useState } from "react";
import { Plus, RotateCcw, Wallet } from "lucide-react";
import { usePlay } from "./PlayProvider";
import ModeToggle from "./ModeToggle";
import { useDeposit } from "@/components/account/DepositModal";
import { sfx } from "@/lib/sound";
import { usdc, krw } from "@/lib/money";

const PRESETS = [1, 5, 10, 100];

export default function TapPanel({ price, bid, onBid }: { price: number; bid: number; onBid: (n: number) => void }) {
  const { mode, balance, adjust, resetDemo } = usePlay();
  const deposit = useDeposit();
  const [custom, setCustom] = useState("");
  const real = mode === "real";
  const bal = balance[mode];

  const applyCustom = (v: string) => {
    setCustom(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > 0) onBid(+n.toFixed(2));
  };

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
      <div>
        <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">{real ? "DEPOSITED" : "DEMO BALANCE"}</div>
        <div className="tabular text-[28px] font-black leading-none text-cyan neon-cyan">{usdc(bal)}</div>
        <div className="tabular text-[11px] text-faint">{krw(bal)}</div>
      </div>

      {/* bid */}
      <div>
        <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">BID SIZE (USDC)</div>
        <div className="grid grid-cols-4 gap-1.5">
          {PRESETS.map((b) => {
            const active = b === bid && custom === "";
            return (
              <button
                key={b}
                onClick={() => {
                  sfx.select();
                  setCustom("");
                  onBid(b);
                }}
                className={`clip py-2.5 font-mono text-[13px] font-bold tabular transition ${
                  active ? "border border-cyan bg-cyan/10 text-cyan animate-glow" : "border border-line bg-ink-2 text-muted hover:border-line-strong hover:text-txt"
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

      {/* funds */}
      {real ? (
        <button
          onClick={deposit.open}
          className="btn-neon clip flex items-center justify-center gap-1.5 bg-cyan/10 py-2.5 font-display text-[13px] font-bold tracking-wide text-cyan"
        >
          <Wallet size={15} /> DEPOSIT / WITHDRAW
        </button>
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

      <div className="mt-auto space-y-1.5 border-t border-line pt-3 font-sans text-[12px] leading-relaxed text-muted">
        <p>
          <span className="text-cyan">›</span> Tap a cell ≥ <span className="text-magenta">10s</span> out. Win{" "}
          <span className="text-lime">stake × multiplier</span>; tap again to cancel.
        </p>
        <p className="text-faint">{real ? "Deposited balance — no per-bet signatures." : "Demo uses play money — no real funds."}</p>
      </div>
    </aside>
  );
}
