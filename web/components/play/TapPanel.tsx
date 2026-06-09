"use client";

import { useState } from "react";
import { Plus, RotateCcw, Zap } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { formatEther } from "viem";
import { usePlay } from "./PlayProvider";
import ModeToggle from "./ModeToggle";
import QuoteTicker from "@/components/ui/QuoteTicker";
import { sfx } from "@/lib/sound";
import { usdc, krw } from "@/lib/money";
import { useVoltTap } from "@/lib/useVoltTap";
import { STAKE_ETH, EDGE_BPS } from "@/lib/volttap";

const PRESETS = [1, 5, 10, 100];

export default function TapPanel({ price, bid, onBid }: { price: number; bid: number; onBid: (n: number) => void }) {
  const { mode, balance, adjust, resetDemo } = usePlay();
  const [custom, setCustom] = useState("");
  const real = mode === "real";

  // REAL mode reads the native ETH balance straight off the chain.
  const { address } = useAccount();
  const { data: ethBal } = useBalance({ address, query: { enabled: real, refetchInterval: 12_000 } });
  const vt = useVoltTap();

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
      {real ? (
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">WALLET (GIWA SEPOLIA)</div>
          <div className="tabular text-[28px] font-black leading-none text-magenta neon-magenta">
            {ethBal ? (+formatEther(ethBal.value)).toFixed(4) : "—"} <span className="text-base">ETH</span>
          </div>
          <div className="tabular text-[11px] text-faint">{ethBal ? usdc(+formatEther(ethBal.value) * price) : "connect wallet"}</div>
        </div>
      ) : (
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">DEMO BALANCE</div>
          <div className="tabular text-[28px] font-black leading-none text-cyan neon-cyan">{usdc(balance.demo)}</div>
          <div className="tabular text-[11px] text-faint">{krw(balance.demo)}</div>
        </div>
      )}

      {/* bid / stake */}
      {real ? (
        <div>
          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">STAKE PER TAP</div>
          <div className="panel clip flex items-center justify-between px-3 py-2.5">
            <span className="flex items-center gap-2 font-display text-sm font-bold text-magenta">
              <Zap size={15} className="text-magenta" /> {STAKE_ETH.toFixed(4)} ETH
            </span>
            <span className="font-mono text-[10px] text-faint">FIXED</span>
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-faint">
            Tap a cell — its multiplier sets the win-chance. {EDGE_BPS / 100}% house edge. Provably-fair, settles on-chain instantly.
          </p>
        </div>
      ) : (
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
      )}

      {/* funds / status */}
      {real ? (
        <div className="panel clip px-3 py-2.5 font-mono text-[10px] leading-relaxed text-faint">
          {!vt.enabled ? (
            <span className="text-magenta">VoltTap not deployed — set NEXT_PUBLIC_VOLTTAP_ADDRESS to enable REAL taps.</span>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="tracking-[0.15em]">HOUSE BANKROLL</span>
                <span className="tabular text-lime">{vt.bankrollWei != null ? (+formatEther(vt.bankrollWei)).toFixed(3) + " ETH" : "…"}</span>
              </div>
              <div className="mt-1 text-faint">Each tap is one signed tx from your wallet (gas + stake). No deposit needed.</div>
            </>
          )}
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

      <div className="mt-auto">
        <QuoteTicker />
      </div>
    </aside>
  );
}
