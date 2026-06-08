"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MARKETS, makeSpark, type Market } from "@/lib/predict";

type Draft = Omit<Market, "spark" | "id"> & { id?: string };

type Ctx = {
  markets: Market[];
  add: (d: Draft) => void;
  update: (id: string, patch: Partial<Market>) => void;
  resolve: (id: string, outcome: "yes" | "no") => void;
  remove: (id: string) => void;
  reset: () => void;
};

const MarketsCtx = createContext<Ctx | null>(null);
const KEY = "volt:markets";

export function MarketsProvider({ children }: { children: React.ReactNode }) {
  const [markets, setMarkets] = useState<Market[]>(MARKETS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setMarkets(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((next: Market[]) => {
    setMarkets(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const add = useCallback(
    (d: Draft) => {
      const id = d.id || `m-${Date.now().toString(36)}`;
      const m: Market = { ...d, id, spark: makeSpark(d.yes + id.length, d.yes) };
      persist([m, ...markets]);
    },
    [markets, persist]
  );
  const update = useCallback(
    (id: string, patch: Partial<Market>) => {
      persist(markets.map((m) => (m.id === id ? { ...m, ...patch, spark: patch.yes != null ? makeSpark(patch.yes + id.length, patch.yes) : m.spark } : m)));
    },
    [markets, persist]
  );
  const resolve = useCallback((id: string, outcome: "yes" | "no") => persist(markets.map((m) => (m.id === id ? { ...m, resolved: outcome } : m))), [markets, persist]);
  const remove = useCallback((id: string) => persist(markets.filter((m) => m.id !== id)), [markets, persist]);
  const reset = useCallback(() => persist(MARKETS), [persist]);

  const value = useMemo(() => ({ markets, add, update, resolve, remove, reset }), [markets, add, update, resolve, remove, reset]);
  return <MarketsCtx.Provider value={value}>{children}</MarketsCtx.Provider>;
}

export function useMarkets(): Ctx {
  const c = useContext(MarketsCtx);
  if (!c) throw new Error("useMarkets must be used within MarketsProvider");
  return c;
}
