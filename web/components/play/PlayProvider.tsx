"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { Mode, DeathSession } from "@/lib/types";
import { REAL_ENABLED } from "@/lib/realMode";

const DEMO_START = 1000; // USDC of play money (client-side only)

type ClaimResult = { ok: boolean; error?: string };
type WithdrawResult = { ok: boolean; tx?: string; error?: string };

type PlayCtx = {
  mode: Mode;
  setMode: (m: Mode) => void;
  // balance.demo = local play money; balance.real = off-chain tKRW game balance
  // (server ledger, keyed by the connected wallet — no signatures).
  balance: Record<Mode, number>;
  adjust: (mode: Mode, delta: number) => void;
  setBalance: (mode: Mode, v: number) => void;
  resetDemo: () => void;
  // REAL (tKRW, off-chain) helpers:
  realReady: boolean; // wallet connected → real balance is live
  claimReal: () => Promise<ClaimResult>;
  withdrawReal: (amount: number) => Promise<WithdrawResult>;
  refreshReal: () => void;
  death: DeathSession | null;
  setDeath: (s: DeathSession | null) => void;
};

const Ctx = createContext<PlayCtx | null>(null);

const round2 = (n: number) => Math.max(0, Math.round(n * 100) / 100);

export function PlayProvider({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const [mode, setModeState] = useState<Mode>("demo");
  // REAL is unreachable unless the deployment declares a backend. Clamping
  // here rather than only in the toggle covers the other way in: a stale
  // localStorage entry from a deployment where REAL *was* enabled.
  const setMode = useCallback((m: Mode) => setModeState(REAL_ENABLED ? m : "demo"), []);
  const [balance, setBal] = useState<Record<Mode, number>>({ demo: DEMO_START, real: 0 });
  const [death, setDeath] = useState<DeathSession | null>(null);

  const addressRef = useRef<string | undefined>(undefined);
  addressRef.current = address;

  // hydrate demo balance + mode (real lives server-side, not in localStorage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("volt:play");
      if (raw) {
        const p = JSON.parse(raw);
        if (p.mode) setMode(p.mode);
        if (p.balance && typeof p.balance.demo === "number") setBal((b) => ({ ...b, demo: p.balance.demo }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // persist demo + mode only
  useEffect(() => {
    try {
      localStorage.setItem("volt:play", JSON.stringify({ mode, balance: { demo: balance.demo } }));
    } catch {
      /* ignore */
    }
  }, [mode, balance.demo]);

  // fetch the server-side tKRW balance whenever the connected wallet changes
  const refreshReal = useCallback(() => {
    const a = addressRef.current;
    if (!a) {
      setBal((b) => ({ ...b, real: 0 }));
      return;
    }
    fetch(`/api/account/balance?address=${a}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.balance === "number") setBal((b) => ({ ...b, real: d.balance }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshReal();
  }, [address, refreshReal]);

  // serial queue so rapid stake/payout deltas reach the server in order and the
  // authoritative balance comes back without races.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const sendDelta = useCallback((addr: string, delta: number) => {
    queueRef.current = queueRef.current.then(async () => {
      try {
        const r = await fetch("/api/account/adjust", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: addr, delta }),
        });
        const d = await r.json();
        if (d?.ok && typeof d.balance === "number") setBal((b) => ({ ...b, real: d.balance }));
      } catch {
        /* keep optimistic value */
      }
    });
  }, []);

  const adjust = useCallback(
    (m: Mode, delta: number) => {
      // optimistic update keeps gameplay instant in both modes
      setBal((b) => ({ ...b, [m]: round2(b[m] + delta) }));
      if (m === "real" && addressRef.current) sendDelta(addressRef.current, delta);
    },
    [sendDelta]
  );

  const setBalance = useCallback((m: Mode, v: number) => {
    setBal((b) => ({ ...b, [m]: round2(v) }));
  }, []);

  const resetDemo = useCallback(() => setBal((b) => ({ ...b, demo: DEMO_START })), []);

  const claimReal = useCallback(async (): Promise<ClaimResult> => {
    const a = addressRef.current;
    if (!a) return { ok: false, error: "connect a wallet first" };
    try {
      const r = await fetch("/api/account/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: a }),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error ?? "claim failed" };
      if (typeof d.balance === "number") setBal((b) => ({ ...b, real: d.balance }));
      return { ok: true };
    } catch {
      return { ok: false, error: "network error" };
    }
  }, []);

  const withdrawReal = useCallback(async (amount: number): Promise<WithdrawResult> => {
    const a = addressRef.current;
    if (!a) return { ok: false, error: "connect a wallet first" };
    try {
      const r = await fetch("/api/account/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: a, amount }),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error ?? "withdraw failed" };
      if (typeof d.balance === "number") setBal((b) => ({ ...b, real: d.balance }));
      return { ok: true, tx: d.tx };
    } catch {
      return { ok: false, error: "network error" };
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      balance,
      adjust,
      setBalance,
      resetDemo,
      realReady: !!address,
      claimReal,
      withdrawReal,
      refreshReal,
      death,
      setDeath,
    }),
    [mode, balance, adjust, setBalance, resetDemo, address, claimReal, withdrawReal, refreshReal, death]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlay(): PlayCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlay must be used within PlayProvider");
  return c;
}
