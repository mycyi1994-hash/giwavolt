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
      {/* Locked state dims rather than blurs. blur-sm is a CSS filter over the
          whole game screen — including the 60fps canvas — so the browser had to
          rebuild a filtered surface every frame, and the overlay stacked a
          backdrop-filter on top of that. Most visitors to a public demo never
          connect a wallet, so this was the default path, not the rare one. */}
      <div className={isConnected ? "h-full w-full" : "pointer-events-none h-full w-full select-none opacity-40"}>
        {children}
      </div>
      {!isConnected && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-bg/80">
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
