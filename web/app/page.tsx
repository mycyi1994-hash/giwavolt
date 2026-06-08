"use client";

import { useCallback, useRef, useState } from "react";
import Header from "@/components/Header";
import SidePanel from "@/components/SidePanel";
import BottomBar from "@/components/BottomBar";
import GameChart, { type BetStatus } from "@/components/GameChart";
import { money } from "@/lib/format";

export default function Page() {
  const [balance, setBalance] = useState(100);
  const [bid, setBid] = useState(0.9);
  const [price, setPrice] = useState(1673.49);
  const [stats, setStats] = useState({ live: 0, won: 0, profit: 0 });

  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  const onBalanceDelta = useCallback((d: number) => {
    setBalance((b) => Math.max(0, +(b + d).toFixed(2)));
  }, []);

  const onBet = useCallback((b: { stake: number; mult: number; status: BetStatus }) => {
    setStats((s) => {
      switch (b.status) {
        case "live":
          return { ...s, live: s.live + 1 };
        case "cancel":
          return { ...s, live: Math.max(0, s.live - 1) };
        case "won":
          return {
            live: Math.max(0, s.live - 1),
            won: s.won + 1,
            profit: +(s.profit + b.stake * (b.mult - 1)).toFixed(2),
          };
        case "lost":
          return { ...s, live: Math.max(0, s.live - 1), profit: +(s.profit - b.stake).toFixed(2) };
      }
    });
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <SidePanel
          balance={balance}
          price={price}
          bid={bid}
          onBid={setBid}
          onAddFunds={() => onBalanceDelta(100)}
          onWithdraw={() => setBalance(0)}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* live stats */}
          <div className="panel clip absolute right-4 top-3 z-10 flex items-center gap-3 px-3 py-1.5 font-mono text-[11px]">
            <Stat label="LIVE" value={String(stats.live)} tone="magenta" />
            <Sep />
            <Stat label="WON" value={String(stats.won)} tone="cyan" />
            <Sep />
            <Stat
              label="P&L"
              value={(stats.profit >= 0 ? "+" : "") + money(stats.profit)}
              tone={stats.profit > 0 ? "lime" : stats.profit < 0 ? "magenta" : "muted"}
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
          <div className="panel clip pointer-events-none absolute bottom-3 left-4 z-10 flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
            <span className="tabular text-cyan">{money(balance)}</span>
          </div>
          <div className="clip pointer-events-none absolute bottom-3 right-4 z-10 flex items-center gap-1.5 border border-cyan/40 bg-cyan/10 px-2.5 py-1 font-mono text-[11px]">
            <span className="text-muted">BID</span>
            <span className="tabular font-bold text-cyan">{money(bid)}</span>
          </div>
        </main>
      </div>
      <BottomBar balance={balance} live={stats.live} price={price} />
    </div>
  );
}

function Sep() {
  return <span className="h-3.5 w-px bg-line" />;
}

const TONE: Record<string, string> = {
  cyan: "text-cyan",
  magenta: "text-magenta",
  lime: "text-lime",
  muted: "text-txt",
};

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="tracking-[0.15em] text-faint">{label}</span>
      <span className={`font-bold tabular ${TONE[tone] ?? "text-txt"}`}>{value}</span>
    </span>
  );
}
