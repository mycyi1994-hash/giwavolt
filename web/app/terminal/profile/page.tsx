"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { User, Wallet, Coins } from "lucide-react";
import { usePlay } from "@/components/play/PlayProvider";
import { usdc, krw } from "@/lib/money";
import { shortAddr } from "@/lib/format";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { balance, mode } = usePlay();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center border border-cyan/50 text-cyan clip animate-glow">
            <User size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-black tracking-wide text-txt neon-cyan">PROFILE</h1>
            <p className="font-mono text-[11px] tracking-wider text-faint">Your wallet, funds & activity</p>
          </div>
        </div>

        {/* wallet */}
        <section className="panel clip mb-4 p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-faint">
            <Wallet size={13} /> WALLET ID
          </div>
          {isConnected ? (
            <div className="flex items-center justify-between gap-3">
              <span className="tabular font-display text-lg font-bold text-txt">{address && shortAddr(address)}</span>
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
            </div>
          ) : (
            <ConnectButton accountStatus="full" chainStatus="icon" showBalance={false} />
          )}
        </section>

        {/* funds */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FundCard label="DEMO FUND" v={balance.demo} active={mode === "demo"} tone="cyan" />
          <FundCard label="REAL FUND" v={balance.real} active={mode === "real"} tone="magenta" />
        </section>

        {/* stub stats */}
        <section className="panel clip mt-4 p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-faint">
            <Coins size={13} /> ACTIVITY
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <Stat label="GAMES" v="—" />
            <Stat label="WAGERED" v="—" />
            <Stat label="NET PNL" v="—" />
          </div>
          <p className="mt-3 font-sans text-[12px] text-faint">
            On-chain activity stats appear here once Real-mode settlement is live (indexer-backed).
          </p>
        </section>
      </div>
    </div>
  );
}

function FundCard({ label, v, active, tone }: { label: string; v: number; active: boolean; tone: "cyan" | "magenta" }) {
  const c = tone === "cyan" ? "text-cyan" : "text-magenta";
  return (
    <div className={`panel clip p-5 ${active ? (tone === "cyan" ? "border-cyan/50" : "border-magenta/50") : ""}`}>
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-faint">
        {label} {active && <span className={c}>● ACTIVE</span>}
      </div>
      <div className={`tabular text-3xl font-black ${c}`}>{usdc(v)}</div>
      <div className="tabular text-[12px] text-faint">{krw(v)}</div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="tabular font-display text-xl font-bold text-txt">{v}</div>
      <div className="font-mono text-[10px] tracking-wider text-faint">{label}</div>
    </div>
  );
}
