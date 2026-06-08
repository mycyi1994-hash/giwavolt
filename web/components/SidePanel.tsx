"use client";

import { useAccount } from "wagmi";
import { Plus, Minus } from "lucide-react";
import { money, price as fmtPrice, shortAddr } from "@/lib/format";

const BIDS = [0.3, 0.9, 3, 9];

export default function SidePanel({
  balance,
  price,
  bid,
  onBid,
  onAddFunds,
  onWithdraw,
}: {
  balance: number;
  price: number;
  bid: number;
  onBid: (n: number) => void;
  onAddFunds: () => void;
  onWithdraw: () => void;
}) {
  const { address, isConnected } = useAccount();

  return (
    <aside className="flex w-[268px] shrink-0 flex-col gap-5 border-r border-line bg-ink/40 p-4">
      {/* asset + live price */}
      <div className="panel clip flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#627eea] text-[10px] font-bold text-white">
            Ξ
          </span>
          <span className="font-display text-sm font-bold tracking-wide">ETH / USD</span>
        </div>
        <span className="tabular text-[15px] font-bold text-lime neon-lime">{fmtPrice(price)}</span>
      </div>

      {/* wallet status */}
      <Field label="WALLET">
        <div className="tabular flex items-center gap-1.5 text-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-lime animate-flicker" : "bg-faint"}`} />
          <span className={isConnected ? "text-txt" : "text-faint"}>
            {isConnected && address ? shortAddr(address) : "Not connected"}
          </span>
        </div>
      </Field>

      {/* balance */}
      <Field label="GAME BALANCE">
        <div className="tabular text-[34px] font-black leading-none text-txt neon-cyan">{money(balance)}</div>
      </Field>

      {/* bid */}
      <div>
        <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-faint">BID SIZE</div>
        <div className="grid grid-cols-4 gap-1.5">
          {BIDS.map((b) => {
            const active = b === bid;
            return (
              <button
                key={b}
                onClick={() => onBid(b)}
                className={`clip py-2.5 font-mono text-[13px] font-bold tabular transition ${
                  active
                    ? "border border-cyan bg-cyan/10 text-cyan animate-glow"
                    : "border border-line bg-ink-2 text-muted hover:border-line-strong hover:text-txt"
                }`}
              >
                {money(b, b < 1 ? 2 : 0)}
              </button>
            );
          })}
        </div>
      </div>

      {/* funds */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onAddFunds}
          className="btn-neon clip flex items-center justify-center gap-1 bg-cyan/10 py-2.5 font-display text-[13px] font-bold tracking-wide text-cyan"
        >
          <Plus size={15} strokeWidth={3} /> FUNDS
        </button>
        <button
          onClick={onWithdraw}
          className="clip flex items-center justify-center gap-1 border border-magenta/50 py-2.5 font-display text-[13px] font-bold tracking-wide text-magenta transition hover:bg-magenta/10"
        >
          <Minus size={15} strokeWidth={3} /> CLEAR
        </button>
      </div>

      {/* how to play */}
      <div className="mt-auto space-y-2 border-t border-line pt-3 font-sans text-[12px] leading-relaxed text-muted">
        <p>
          <span className="text-cyan">›</span> Tap a grid cell. If the live line crosses it, you win{" "}
          <span className="text-lime">stake × multiplier</span>.
        </p>
        <p>
          <span className="text-cyan">›</span> Tap again to <span className="text-magenta">cancel</span>. Cells under{" "}
          <span className="text-magenta">10s</span> are locked.
        </p>
        <p className="text-faint">Settled fully on-chain · 7% house edge · Giwa Sepolia.</p>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">{label}</div>
      {children}
    </div>
  );
}
