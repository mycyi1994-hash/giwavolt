"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useAccount } from "wagmi";
import GameChart, { type BetStatus, type PlacedBet, type PlaceResult, type Settlement } from "@/components/GameChart";
import TapPanel from "@/components/play/TapPanel";
import LiveFeed from "@/components/play/LiveFeed";
import ConnectGate from "@/components/play/ConnectGate";
import { usePlay } from "@/components/play/PlayProvider";
import { useToast } from "@/components/ui/Toast";
import { useLivePrice } from "@/lib/useLivePrice";
import type { FeedState } from "@/lib/priceFeed";
import { sfx } from "@/lib/sound";
import { usdc, won } from "@/lib/money";

// stake/payout amount in the current mode's unit
const fmtAmt = (real: boolean, n: number) => (real ? won(n) : usdc(n));
const fmtPnl = (real: boolean, n: number) => `${n >= 0 ? "+" : "−"}${fmtAmt(real, Math.abs(n))}`;

export default function TapTradingPage() {
  const { mode, balance, adjust, setBalance } = usePlay();
  const { address } = useAccount();
  const real = mode === "real";
  const toast = useToast();
  const feed = useLivePrice(); // real BTC/USD trades — the chart's only input

  const [bid, setBid] = useState(5);
  const [price, setPrice] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [stats, setStats] = useState({ live: 0, won: 0, profit: 0 });

  // reset stats and pick a sensible default stake when switching modes
  useEffect(() => {
    setStats({ live: 0, won: 0, profit: 0 });
    setBid(mode === "real" ? 50_000 : 5);
  }, [mode]);

  const ctxRef = useRef({ mode, balance, address });
  ctxRef.current = { mode, balance, address };
  const onBalanceDelta = useCallback((d: number) => adjust(ctxRef.current.mode, d), [adjust]);
  const getBalance = useCallback(() => ctxRef.current.balance[ctxRef.current.mode], []);

  // REAL mode is server-authoritative: the browser proposes a cell and the
  // server decides the price, the multiplier and the outcome. Everything below
  // is transport — no odds or balances are computed on this side.
  const settlementQueue = useRef<Settlement[]>([]);
  const openBets = useRef(0);

  const placeServerBet = useCallback(
    async (b: PlacedBet): Promise<PlaceResult> => {
      const addr = ctxRef.current.address;
      if (!addr) return null;
      try {
        const r = await fetch("/api/game/tap/place", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: addr, ...b }),
        });
        const j = await r.json();
        if (!r.ok || !j?.ok) {
          toast.push("info", "BET NOT PLACED", typeof j?.error === "string" ? j.error : "server declined");
          return null;
        }
        if (typeof j.balance === "number") setBalance("real", j.balance);
        openBets.current += 1;
        return { id: String(j.id), mult: Number(j.mult) };
      } catch {
        toast.push("info", "BET NOT PLACED", "could not reach the server");
        return null;
      }
    },
    [toast, setBalance]
  );

  const drainSettlements = useCallback((): Settlement[] => {
    if (!settlementQueue.current.length) return [];
    const out = settlementQueue.current;
    settlementQueue.current = [];
    return out;
  }, []);

  // Ask the server for outcomes it has decided. Polls faster while positions are
  // open; keeps a slow beat otherwise so bets left behind by a closed tab still
  // get picked up when the player comes back.
  useEffect(() => {
    if (!real || !address) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const r = await fetch("/api/game/tap/settle", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const j = await r.json();
        if (j?.ok) {
          if (Array.isArray(j.settled) && j.settled.length) settlementQueue.current.push(...j.settled);
          if (typeof j.balance === "number") setBalance("real", j.balance);
          openBets.current = Number(j.open ?? 0);
        }
      } catch {
        /* transient — the next poll retries */
      }
      if (!stopped) timer = setTimeout(poll, openBets.current > 0 ? 2000 : 6000);
    };

    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [real, address, setBalance]);

  const onBet = useCallback(
    (b: { stake: number; mult: number; status: BetStatus }) => {
      const isReal = ctxRef.current.mode === "real";
      switch (b.status) {
        case "live":
          sfx.place();
          break;
        case "cancel":
          sfx.cancel();
          break;
        case "won":
          sfx.win();
          toast.push("win", `WIN +${fmtAmt(isReal, b.stake * b.mult)}`, `${b.mult.toFixed(2)}× hit`);
          break;
        case "lost":
          sfx.lose();
          toast.push("lose", `MISS −${fmtAmt(isReal, b.stake)}`, "line dodged it");
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

  const clampZoom = (z: number) => Math.max(0.6, Math.min(2.6, z));

  return (
    <ConnectGate title="TAP TRADING">
      <div className="flex h-full flex-col md:flex-row">
        <TapPanel price={price} bid={bid} onBid={setBid} />

        <main className="relative min-w-0 flex-1 bg-[#070710]">
          <div className="absolute left-4 top-3 z-10 flex items-center gap-2">
            <div className={`panel clip px-3 py-1.5 font-mono text-[11px] tracking-wider ${real ? "text-magenta" : "text-cyan"}`}>
              {real ? "◆ REAL — tKRW · off-chain · no signature" : "◆ DEMO — play money"}
            </div>
            <FeedBadge feed={feed} />
          </div>
          <LiveFeed className="absolute bottom-4 left-3 top-12 z-10 hidden w-56 overflow-hidden md:block" />

          <div className="panel clip absolute right-4 top-3 z-10 flex items-center gap-3 px-3 py-1.5 font-mono text-[11px]">
            <Stat label="LIVE" value={String(stats.live)} cls="text-magenta" />
            <Sep />
            <Stat label="WON" value={String(stats.won)} cls="text-cyan" />
            <Sep />
            <Stat label="P&L" value={fmtPnl(real, stats.profit)} cls={stats.profit > 0 ? "text-lime" : stats.profit < 0 ? "text-magenta" : "text-txt"} />
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
            unit={real ? "tKRW" : "USDC"}
            onZoom={(f) => setZoom((z) => clampZoom(z * f))}
            onPrice={setPrice}
            onBalanceDelta={onBalanceDelta}
            onBet={onBet}
            placeServerBet={placeServerBet}
            drainSettlements={drainSettlements}
            getBalance={getBalance}
          />
        </main>
      </div>
    </ConnectGate>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  binance: "BINANCE",
  coinbase: "COINBASE",
  "coinbase-rest": "COINBASE (REST)",
  "binance-rest": "BINANCE (REST)",
};

// Where the price comes from and how volatile it currently is. The odds are
// derived from that volatility, so it belongs on screen rather than buried.
function FeedBadge({ feed }: { feed: FeedState }) {
  const live = feed.status === "live";
  const cls = live ? "text-lime" : feed.status === "connecting" ? "text-muted" : "text-magenta";
  const label = feed.source ? SOURCE_LABEL[feed.source] ?? feed.source.toUpperCase() : "…";
  // realized vol per √second → annualised, the unit people actually read
  const annual = feed.vol === null ? null : feed.vol * Math.sqrt(365 * 24 * 3600) * 100;

  return (
    <div className={`panel clip flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] tracking-wider ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-lime animate-flicker" : "bg-magenta"}`} />
      {feed.status === "connecting" ? "CONNECTING" : feed.status === "live" ? label : feed.status.toUpperCase()}
      {annual !== null && <span className="tabular text-faint">σ {annual.toFixed(0)}%</span>}
    </div>
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
