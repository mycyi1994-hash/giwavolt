"use client";

import { useState } from "react";
import { Droplets, Loader2 } from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useToast } from "@/components/ui/Toast";
import { sfx } from "@/lib/sound";

// Push-faucet trigger: asks the server to send the connected wallet some tKRW
// (and a little gas ETH). No signature / gas needed from the user.
export default function FaucetButton({
  enabled,
  onClaimed,
  className = "",
}: {
  enabled: boolean;
  onClaimed?: () => void;
  className?: string;
}) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const claim = async () => {
    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }
    if (busy) return;
    setBusy(true);
    sfx.tick();
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.push("info", "FAUCET", data.error ?? "Could not claim right now.");
      } else {
        sfx.win();
        toast.push("cash", "TEST KRW SENT", `₩${Number(data.tkrw).toLocaleString()} on the way`);
        // give the tx a moment to land, then refresh balances
        setTimeout(() => onClaimed?.(), 2500);
      }
    } catch {
      toast.push("info", "FAUCET", "Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return (
      <div className={`panel clip px-3 py-2.5 font-mono text-[10px] leading-relaxed text-magenta ${className}`}>
        Faucet not deployed — set NEXT_PUBLIC_TESTKRW_ADDRESS + FAUCET_PRIVATE_KEY.
      </div>
    );
  }

  return (
    <button
      onClick={claim}
      disabled={busy}
      className={`btn-neon clip flex items-center justify-center gap-1.5 bg-lime/10 py-2.5 font-display text-[13px] font-bold tracking-wide text-lime disabled:opacity-60 ${className}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Droplets size={15} />}
      {busy ? "SENDING…" : "GET TEST KRW"}
    </button>
  );
}
