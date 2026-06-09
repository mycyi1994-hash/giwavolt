"use client";

import { useState } from "react";
import { Droplets, Loader2 } from "lucide-react";
import { usePlay } from "./PlayProvider";
import { useWalletGate } from "@/lib/walletGate";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";

// Off-chain faucet trigger shared by every game's REAL panel. Credits the
// connected wallet's tKRW game balance — no signature, no gas.
export default function ClaimButton({ className = "" }: { className?: string }) {
  const { claimReal } = usePlay();
  const { requireWallet } = useWalletGate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const claim = () =>
    requireWallet(async () => {
      if (busy) return;
      setBusy(true);
      sfx.tick();
      const r = await claimReal();
      setBusy(false);
      if (r.ok) {
        sfx.win();
        toast.push("cash", "TEST KRW ADDED", "game balance topped up");
      } else {
        toast.push("info", "FAUCET", r.error ?? "could not claim");
      }
    });

  return (
    <button
      onClick={claim}
      disabled={busy}
      className={`btn-neon clip flex items-center justify-center gap-1.5 bg-lime/10 py-2 font-display text-[11px] font-bold tracking-wide text-lime disabled:opacity-60 ${className}`}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Droplets size={13} />} GET TEST KRW
    </button>
  );
}
