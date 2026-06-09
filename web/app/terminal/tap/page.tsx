"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import GameChart, { type BetStatus } from "@/components/GameChart";
import TapPanel from "@/components/play/TapPanel";
import LiveFeed from "@/components/play/LiveFeed";
import ConnectGate from "@/components/play/ConnectGate";
import { usePlay } from "@/components/play/PlayProvider";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";
import { usdc } from "@/lib/money";
import { useVoltTap, VoltTapError } from "@/lib/useVoltTap";
import { STAKE_ETH } from "@/lib/volttap";

const fmtEth = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(4)} ETH`;

const TAP_ERR: Record<string, string> = {
  disabled: "REAL mode needs the VoltTap contract — set NEXT_PUBLIC_VOLTTAP_ADDRESS",
  disconnected: "connect a wallet first",
  "bad-mult": "that cell's odds are too low for on-chain settlement",
  bankroll: "house bankroll can't cover that payout right now",
  rejected: "transaction rejected",
  failed: "something went wrong",
};

export default function TapTradingPage() {
  const { mode, balance, adjust } = usePlay();
  const real = mode === "real";
  const toast = useToast();
  const vt = useVoltTap();

  const [bid, setBid] = useState(5);
  const [price, setPrice] = useState(1673.49);
  const [zoom, setZoom] = useState(1);
  const [stats, setStats] = useState({ live: 0, won: 0, profit: 0 });

  useEffect(() => setStats({ live: 0, won: 0, profit: 0 }), [mode]);

  const ctxRef = useRef({ mode, balance });
  ctxRef.current = { mode, balance };
  const onBalanceDelta = useCallback((d: number) => adjust(ctxRef.current.mode, d), [adjust]);
  const getBalance = useCallback(() => ctxRef.current.balance[ctxRef.current.mode], []);

  const onBet = useCallback(
    (b: { stake: number; mult: number; status: BetStatus }) => {
      switch (b.status) {
        case "live":
          sfx.place();
          break;
        case "cancel":
          sfx.cancel();
          break;
        case "won":
          sfx.win();
          toast.push("win", `WIN +${usdc(b.stake * b.mult)}`, `${b.mult.toFixed(2)}× hit`);
          break;
        case "lost":
          sfx.lose();
          toast.push("lose", `MISS −${usdc(b.stake)}`, "line dodged it");
          break;
      }
      setStats((s) => {
        switch (b.status) {
          case "live":
            return { ...s, live: s.live + 1 };
          case "cancel":
            return { ...s, live: Math.max(0, s.live - 1) };
          case "won":
            return { live: Math.max(0, s.live - 1), won: s.won + 1, profit: +(s.profit + b.stake * (b.mult - 1)).toFixed(2) };
          case "lost":
            return { ...s, live: Math.max(0, s.live - 1), profit: +(s.profit - b.stake).toFixed(2) };
        }
      });
    },
    [toast]
  );

  // REAL mode: each tap is a single on-chain VoltTap bet (fixed 0.0001 ETH,
  // win-chance derived from the tapped cell's multiplier, instant RNG payout).
  const onRealTap = useCallback(
    async (mult: number) => {
      sfx.place();
      setStats((s) => ({ ...s, live: s.live + 1 }));
      toast.push("info", "TAP SENT", `${mult.toFixed(2)}× · 0.0001 ETH · sign to confirm`);
      try {
        const r = await vt.tap(mult);
        const payoutEth = Number(r.payoutWei) / 1e18;
        if (r.win) {
          sfx.win();
          toast.push("win", `WIN +${payoutEth.toFixed(4)} ETH`, `${(r.multBps / 1e4).toFixed(2)}× hit`);
          setStats((s) => ({ live: Math.max(0, s.live - 1), won: s.won + 1, profit: +(s.profit + payoutEth - STAKE_ETH).toFixed(6) }));
        } else {
          sfx.lose();
          toast.push("lose", `MISS −${STAKE_ETH.toFixed(4)} ETH`, "roll missed");
          setStats((s) => ({ ...s, live: Math.max(0, s.live - 1), profit: +(s.profit - STAKE_ETH).toFixed(6) }));
        }
      } catch (e) {
        const code = e instanceof VoltTapError ? e.code : "failed";
        sfx.cancel();
        toast.push("info", "TAP CANCELLED", TAP_ERR[code] ?? code);
        setStats((s) => ({ ...s, live: Math.max(0, s.live - 1) }));
      }
    },
    [vt, toast]
  );

  const clampZoom = (z: number) => Math.max(0.6, Math.min(2.6, z));

  return (
    <ConnectGate title="TAP TRADING">
      <div className="flex h-full flex-col md:flex-row">
        <TapPanel price={price} bid={bid} onBid={setBid} />

        <main className="relative min-w-0 flex-1 bg-[#070710]">
          <div className={`panel clip absolute left-4 top-3 z-10 px-3 py-1.5 font-mono text-[11px] tracking-wider ${real ? "text-magenta" : "text-cyan"}`}>
            {real ? (vt.enabled ? "◆ REAL — on-chain · 0.0001 ETH/tap" : "◆ REAL — deploy VoltTap to enable") : "◆ DEMO — play money"}
          </div>
          <LiveFeed className="absolute bottom-4 left-3 top-12 z-10 hidden w-56 overflow-hidden md:block" />

          <div className="panel clip absolute right-4 top-3 z-10 flex items-center gap-3 px-3 py-1.5 font-mono text-[11px]">
            <Stat label="LIVE" value={String(stats.live)} cls="text-magenta" />
            <Sep />
            <Stat label="WON" value={String(stats.won)} cls="text-cyan" />
            <Sep />
            <Stat label="P&L" value={real ? fmtEth(stats.profit) : (stats.profit >= 0 ? "+" : "") + usdc(stats.profit)} cls={stats.profit > 0 ? "text-lime" : stats.profit < 0 ? "text-magenta" : "text-txt"} />
          </div>

          <div className="absolute bottom-3 right-4 z-10 flex items-center gap-1.5">
            <ZoomBtn onClick={() => setZoom((z) => clampZoom(z / 1.2))} icon={<ZoomOut size={15} />} />
            <span className="panel clip tabular px-2 py-1 font-mono text-[10px] text-muted">{zoom.toFixed(1)}×</span>
            <ZoomBtn onClick={() => setZoom((z) => clampZoom(z * 1.2))} icon={<ZoomIn size={15} />} />
          </div>

          <GameChart
            bidSize={bid}
            zoom={zoom}
            realMode={real}
            onRealTap={onRealTap}
            onZoom={(f) => setZoom((z) => clampZoom(z * f))}
            onPrice={setPrice}
            onBalanceDelta={onBalanceDelta}
            onBet={onBet}
            getBalance={getBalance}
          />
        </main>
      </div>
    </ConnectGate>
  );
}

function Sep() {
  return <span className="h-3.5 w-px bg-line" />;
}
function Stat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="tracking-[0.15em] text-faint">{label}</span>
      <span className={`font-bold tabular ${cls}`}>{value}</span>
    </span>
  );
}
function ZoomBtn({ onClick, icon }: { onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className="panel clip grid h-8 w-8 place-items-center text-muted transition hover:text-cyan">
      {icon}
    </button>
  );
}
