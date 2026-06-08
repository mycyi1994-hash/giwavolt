"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Loader2, Check, X } from "lucide-react";
import { formatEther } from "viem";
import GameChart, { type BetStatus } from "@/components/GameChart";
import TapPanel from "@/components/play/TapPanel";
import ConnectGate from "@/components/play/ConnectGate";
import { usePlay } from "@/components/play/PlayProvider";
import { useToast } from "@/components/ui/Toast";
import { useVoltTap } from "@/lib/useVoltTap";
import { useFunds } from "@/lib/useFunds";
import { winChanceBpsForMult, STAKE_ETH } from "@/lib/voltTap";
import { sfx } from "@/lib/sound";
import { usdc } from "@/lib/money";

type Fx = { id: number; sx: number; sy: number; kind: "pending" | "win" | "lose" };
let fxId = 0;

export default function TapTradingPage() {
  const { mode, balance, adjust } = usePlay();
  const real = mode === "real";
  const toast = useToast();
  const voltTap = useVoltTap();
  const funds = useFunds();

  const [bid, setBid] = useState(5);
  const [price, setPrice] = useState(1673.49);
  const [zoom, setZoom] = useState(1);
  const [stats, setStats] = useState({ live: 0, won: 0, profit: 0 });
  const [fx, setFx] = useState<Fx[]>([]);

  // reset session stats when switching demo/real (units differ)
  useEffect(() => setStats({ live: 0, won: 0, profit: 0 }), [mode]);

  const ctxRef = useRef({ mode, balance });
  ctxRef.current = { mode, balance };
  const onBalanceDelta = useCallback((d: number) => adjust(ctxRef.current.mode, d), [adjust]);
  const getBalance = useCallback(() => ctxRef.current.balance[ctxRef.current.mode], []);

  // ---- DEMO bets (line-cross) ----
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

  // ---- REAL bets (instant on-chain VoltTap) ----
  const spawnFx = (sx: number, sy: number): number => {
    const id = ++fxId;
    setFx((f) => [...f, { id, sx, sy, kind: "pending" }]);
    return id;
  };
  const resolveFx = (id: number, kind: "win" | "lose") => {
    setFx((f) => f.map((x) => (x.id === id ? { ...x, kind } : x)));
    setTimeout(() => setFx((f) => f.filter((x) => x.id !== id)), 1100);
  };

  const onRealTap = useCallback(
    async (mult: number, sx: number, sy: number) => {
      if (!voltTap.configured) {
        toast.push("info", "REAL not deployed", "Set NEXT_PUBLIC_VOLTTAP_ADDRESS");
        return;
      }
      if (voltTap.wrongChain) {
        toast.push("info", "Wrong network", "Switch to Giwa Sepolia");
        return;
      }
      const id = spawnFx(sx, sy);
      sfx.place();
      try {
        const { win, payout } = await voltTap.tap(winChanceBpsForMult(mult));
        resolveFx(id, win ? "win" : "lose");
        if (win) {
          sfx.win();
          toast.push("win", `WIN +${(+formatEther(payout)).toFixed(4)} ETH`, `${mult.toFixed(2)}× on-chain`);
          setStats((s) => ({ ...s, won: s.won + 1, profit: +(s.profit + (+formatEther(payout) - STAKE_ETH)).toFixed(4) }));
        } else {
          sfx.lose();
          toast.push("lose", `MISS −${STAKE_ETH} ETH`, "on-chain roll");
          setStats((s) => ({ ...s, profit: +(s.profit - STAKE_ETH).toFixed(4) }));
        }
        funds.refetch();
      } catch {
        setFx((f) => f.filter((x) => x.id !== id));
        toast.push("info", "Tx cancelled", "no bet placed");
      }
    },
    [voltTap, toast, funds]
  );

  const clampZoom = (z: number) => Math.max(0.6, Math.min(2.6, z));
  const pnl = (n: number) => (real ? `${n >= 0 ? "+" : ""}${n.toFixed(4)} ETH` : `${n >= 0 ? "+" : ""}${usdc(n)}`);

  return (
    <ConnectGate title="TAP TRADING">
      <div className="flex h-full flex-col md:flex-row">
        <TapPanel price={price} bid={bid} onBid={setBid} />

        <main className="relative min-w-0 flex-1">
          <div className={`panel clip absolute left-4 top-3 z-10 px-3 py-1.5 font-mono text-[11px] tracking-wider ${real ? "text-magenta" : "text-cyan"}`}>
            {real ? "◆ REAL — on-chain ETH" : "◆ DEMO — play money"}
          </div>

          <div className="panel clip absolute right-4 top-3 z-10 flex items-center gap-3 px-3 py-1.5 font-mono text-[11px]">
            {!real && <Stat label="LIVE" value={String(stats.live)} cls="text-magenta" />}
            {!real && <Sep />}
            <Stat label="WON" value={String(stats.won)} cls="text-cyan" />
            <Sep />
            <Stat label="P&L" value={pnl(stats.profit)} cls={stats.profit > 0 ? "text-lime" : stats.profit < 0 ? "text-magenta" : "text-txt"} />
          </div>

          <div className="absolute bottom-3 right-4 z-10 flex items-center gap-1.5">
            <ZoomBtn onClick={() => setZoom((z) => clampZoom(z / 1.2))} icon={<ZoomOut size={15} />} />
            <span className="panel clip tabular px-2 py-1 font-mono text-[10px] text-muted">{zoom.toFixed(1)}×</span>
            <ZoomBtn onClick={() => setZoom((z) => clampZoom(z * 1.2))} icon={<ZoomIn size={15} />} />
          </div>

          {/* on-chain tap ○/✕ overlay */}
          {fx.map((f) => (
            <div
              key={f.id}
              className={`pointer-events-none absolute z-20 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center clip border-2 ${
                f.kind === "pending" ? "border-cyan/70 text-cyan" : f.kind === "win" ? "animate-reveal border-lime text-lime" : "animate-reveal border-magenta text-magenta"
              }`}
              style={{ left: f.sx, top: f.sy, boxShadow: `0 0 16px ${f.kind === "win" ? "rgba(57,255,20,.5)" : f.kind === "lose" ? "rgba(255,43,214,.5)" : "rgba(0,229,255,.4)"}` }}
            >
              {f.kind === "pending" ? <Loader2 size={22} className="animate-spin-slow" /> : f.kind === "win" ? <Check size={26} /> : <X size={26} />}
            </div>
          ))}

          <GameChart
            bidSize={bid}
            zoom={zoom}
            realMode={real}
            onZoom={(f) => setZoom((z) => clampZoom(z * f))}
            onPrice={setPrice}
            onBalanceDelta={onBalanceDelta}
            onBet={onBet}
            onRealTap={onRealTap}
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
