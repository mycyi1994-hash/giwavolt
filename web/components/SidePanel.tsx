"use client";

import { ChevronDown, LineChart, Trophy, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { money, price as fmtPrice, shortAddr } from "@/lib/format";

const BIDS = [0.3, 0.9, 3, 9];
const HYPE_USD = 30; // 1 HYPE ≈ $30 (demo)

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
    <aside className="flex w-[260px] shrink-0 flex-col gap-4 border-r border-line bg-panel/40 p-4">
      {/* asset selector */}
      <div className="flex items-center justify-between">
        <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-panel-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#627eea] text-[10px] font-bold">
            Ξ
          </span>
          <span className="font-semibold">ETH/USD</span>
          <ChevronDown size={15} className="text-text-faint" />
        </button>
        <span className="tabular text-[15px] font-semibold text-accent">{fmtPrice(price)}</span>
      </div>

      <div className="flex gap-1 text-text-faint">
        {[LineChart, Trophy, Wallet].map((I, i) => (
          <button
            key={i}
            className={`flex h-8 w-8 items-center justify-center rounded-md ${
              i === 2 ? "bg-panel-3 text-accent" : "hover:bg-panel-2 hover:text-text"
            }`}
          >
            <I size={16} />
          </button>
        ))}
      </div>

      {/* wallet */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">Wallet</div>
        <div className="tabular mt-0.5 flex items-center gap-1.5 text-sm text-text-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-accent" : "bg-text-faint"}`} />
          {isConnected && address ? shortAddr(address) : "Not connected"}
        </div>
      </div>

      {/* game balance */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">Game Balance</div>
        <div className="tabular mt-0.5 text-3xl font-bold">{money(balance)}</div>
        <div className="tabular text-xs text-text-muted">{(balance / HYPE_USD).toFixed(2)} HYPE</div>
      </div>

      {/* bid size */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">Bid Size</span>
          <span className="tabular text-xs text-text-muted">
            {(bid / HYPE_USD).toFixed(2)} HYPE ≈ {money(bid)}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {BIDS.map((b) => {
            const active = b === bid;
            return (
              <button
                key={b}
                onClick={() => onBid(b)}
                className={`rounded-md border py-2 text-[13px] font-semibold tabular transition ${
                  active
                    ? "border-accent bg-accent/10 text-accent glow"
                    : "border-line bg-panel-2 text-text-muted hover:border-line-strong hover:text-text"
                }`}
              >
                {money(b, b < 1 ? 2 : 0)}
              </button>
            );
          })}
        </div>
      </div>

      {/* actions */}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <button
          onClick={onAddFunds}
          className="rounded-md bg-accent py-2.5 text-[13px] font-bold text-[#06140c] transition hover:brightness-110"
        >
          Add Funds
        </button>
        <button
          onClick={onWithdraw}
          className="rounded-md border border-accent/60 py-2.5 text-[13px] font-bold text-accent transition hover:bg-accent/10"
        >
          Withdraw
        </button>
      </div>

      <p className="mt-auto text-[11px] leading-relaxed text-text-faint">
        Tap a cell on the grid. If the live ETH/USD line passes through it, you win{" "}
        <span className="text-text-muted">stake × multiplier</span>. Settled fully on-chain on Giwa Sepolia.
      </p>
    </aside>
  );
}
