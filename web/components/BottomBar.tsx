"use client";

import { money } from "@/lib/format";
import { Activity, BarChart2, Search } from "lucide-react";

export default function BottomBar({ balance }: { balance: number }) {
  const tickers = [
    { sym: "BTC", val: "$63,250", color: "#f7931a" },
    { sym: "ETH", val: "$1,673", color: "#627eea" },
    { sym: "SOL", val: "$29,236", color: "#14f195" },
  ];
  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line bg-panel/70 px-4 text-[12px] text-text-muted backdrop-blur">
      <span className="tabular flex items-center gap-1.5 rounded bg-panel-2 px-2 py-0.5">
        <span className="h-2 w-2 rounded-full bg-accent" />
        {money(balance)}
      </span>
      <button className="hidden items-center gap-1.5 hover:text-text sm:flex">
        <Activity size={13} /> Wallet Tracker
      </button>
      <button className="hidden items-center gap-1.5 hover:text-text sm:flex">
        <BarChart2 size={13} /> PnL
      </button>
      <button className="hidden items-center gap-1.5 hover:text-text sm:flex">
        <Search size={13} /> Search
      </button>
      <div className="ml-auto flex items-center gap-3">
        {tickers.map((t) => (
          <span key={t.sym} className="tabular flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
            {t.val}
          </span>
        ))}
        <span className="rounded bg-panel-2 px-2 py-0.5 text-text-faint">#BTC</span>
      </div>
    </div>
  );
}
