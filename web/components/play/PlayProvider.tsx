"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Mode, DeathSession } from "@/lib/types";

const DEMO_START = 1000; // USDC of play money
const REAL_START = 0; // real balance comes from chain later; mocked at 0 for now

type PlayCtx = {
  mode: Mode;
  setMode: (m: Mode) => void;
  balance: Record<Mode, number>;
  adjust: (mode: Mode, delta: number) => void;
  setBalance: (mode: Mode, v: number) => void;
  resetDemo: () => void;
  death: DeathSession | null;
  setDeath: (s: DeathSession | null) => void;
};

const Ctx = createContext<PlayCtx | null>(null);

export function PlayProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("demo");
  const [balance, setBal] = useState<Record<Mode, number>>({ demo: DEMO_START, real: REAL_START });
  const [death, setDeath] = useState<DeathSession | null>(null);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("volt:play");
      if (raw) {
        const p = JSON.parse(raw);
        if (p.mode) setMode(p.mode);
        if (p.balance) setBal((b) => ({ ...b, ...p.balance }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem("volt:play", JSON.stringify({ mode, balance }));
    } catch {
      /* ignore */
    }
  }, [mode, balance]);

  const adjust = useCallback((m: Mode, delta: number) => {
    setBal((b) => ({ ...b, [m]: Math.max(0, +(b[m] + delta).toFixed(2)) }));
  }, []);
  const setBalance = useCallback((m: Mode, v: number) => {
    setBal((b) => ({ ...b, [m]: Math.max(0, +v.toFixed(2)) }));
  }, []);
  const resetDemo = useCallback(() => setBal((b) => ({ ...b, demo: DEMO_START })), []);

  const value = useMemo(
    () => ({ mode, setMode, balance, adjust, setBalance, resetDemo, death, setDeath }),
    [mode, balance, death, adjust, setBalance, resetDemo]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlay(): PlayCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlay must be used within PlayProvider");
  return c;
}
