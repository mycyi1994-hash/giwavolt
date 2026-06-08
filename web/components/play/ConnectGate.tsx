"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { Lock } from "lucide-react";

// Wraps a game screen: if the wallet is not connected, it blurs the content and
// shows a connect overlay (both Demo and Real require a connected wallet).
export default function ConnectGate({ children, title }: { children: React.ReactNode; title: string }) {
  const { isConnected } = useAccount();
  return (
    <div className="relative h-full w-full">
      <div className={isConnected ? "h-full w-full" : "pointer-events-none h-full w-full select-none blur-sm"}>
        {children}
      </div>
      {!isConnected && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-bg/60 backdrop-blur-[2px]">
          <div className="panel clip flex flex-col items-center gap-4 px-8 py-7 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-cyan/50 text-cyan animate-glow">
              <Lock size={22} />
            </div>
            <div>
              <div className="font-display text-lg font-bold tracking-wide text-txt neon-cyan">{title}</div>
              <div className="mt-1 font-sans text-[13px] text-muted">Connect a wallet to play — Demo or Real.</div>
            </div>
            <ConnectButton accountStatus="address" chainStatus="none" showBalance={false} />
          </div>
        </div>
      )}
    </div>
  );
}
