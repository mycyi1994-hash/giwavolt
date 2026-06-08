"use client";

import { useCallback, useRef, useState } from "react";
import { Volume2, Crosshair, Eye, Music, Info } from "lucide-react";
import Header from "@/components/Header";
import LeftRail from "@/components/LeftRail";
import SidePanel from "@/components/SidePanel";
import BottomBar from "@/components/BottomBar";
import GameChart from "@/components/GameChart";
import { money } from "@/lib/format";

const DEMO_ADDRESS = "0x93a8c4e2f1b6d0a9c7e5b3f1a2d4c6e8b0a25515a5";

export default function Page() {
  const [balance, setBalance] = useState(100);
  const [bid, setBid] = useState(0.9);
  const [price, setPrice] = useState(1673.49);
  const [stats, setStats] = useState({ live: 0, won: 0, wagered: 0, profit: 0 });

  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  const onBalanceDelta = useCallback((d: number) => {
    setBalance((b) => Math.max(0, +(b + d).toFixed(2)));
  }, []);

  const onBet = useCallback((b: { stake: number; mult: number; status: "live" | "won" | "lost" }) => {
    setStats((s) => {
      if (b.status === "live") return { ...s, live: s.live + 1, wagered: +(s.wagered + b.stake).toFixed(2) };
      if (b.status === "won")
        return { ...s, live: Math.max(0, s.live - 1), won: s.won + 1, profit: +(s.profit + b.stake * (b.mult - 1)).toFixed(2) };
      return { ...s, live: Math.max(0, s.live - 1), profit: +(s.profit - b.stake).toFixed(2) };
    });
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header address={DEMO_ADDRESS} />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <SidePanel
          address={DEMO_ADDRESS}
          balance={balance}
          price={price}
          bid={bid}
          onBid={setBid}
          onAddFunds={() => onBalanceDelta(100)}
          onWithdraw={() => setBalance(0)}
        />

        {/* chart area */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* toolbar */}
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-1 rounded-lg border border-line bg-panel-2/80 p-1 backdrop-blur">
            {[Volume2, Crosshair, Eye, Music, Info].map((I, i) => (
              <button
                key={i}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-faint hover:bg-panel-3 hover:text-text"
              >
                <I size={15} />
              </button>
            ))}
          </div>

          {/* live stats pill */}
          <div className="absolute right-4 top-3 z-10 flex items-center gap-3 rounded-lg border border-line bg-panel-2/80 px-3 py-1.5 text-[12px] backdrop-blur">
            <Stat label="Live" value={String(stats.live)} />
            <span className="h-4 w-px bg-line" />
            <Stat label="Won" value={String(stats.won)} />
            <span className="h-4 w-px bg-line" />
            <Stat
              label="P&L"
              value={(stats.profit >= 0 ? "+" : "") + money(stats.profit)}
              tone={stats.profit > 0 ? "good" : stats.profit < 0 ? "bad" : undefined}
            />
          </div>

          <div className="min-h-0 flex-1">
            <GameChart
              bidSize={bid}
              onPrice={setPrice}
              onBalanceDelta={onBalanceDelta}
              onBet={onBet}
              getBalance={() => balanceRef.current}
            />
          </div>

          {/* corner chips */}
          <div className="pointer-events-none absolute bottom-3 left-4 z-10 flex items-center gap-1.5 rounded-md border border-line bg-panel-2/80 px-2.5 py-1 text-[12px] backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-accent" /> <span className="tabular">{money(balance)}</span>
          </div>
          <div className="pointer-events-none absolute bottom-3 right-4 z-10 flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[12px] backdrop-blur">
            <span className="text-text-muted">Bid</span> <span className="tabular font-semibold text-accent">{money(bid)}</span>
          </div>
        </main>
      </div>
      <BottomBar balance={balance} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-text-faint">{label}</span>
      <span
        className={`tabular font-semibold ${tone === "good" ? "text-accent" : tone === "bad" ? "text-danger" : "text-text"}`}
      >
        {value}
      </span>
    </span>
  );
}
