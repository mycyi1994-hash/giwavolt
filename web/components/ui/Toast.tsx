"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info, Skull, Coins } from "lucide-react";

type Kind = "win" | "lose" | "info" | "skull" | "cash";
type Toast = { id: number; kind: Kind; title: string; msg?: string };

type Api = { push: (kind: Kind, title: string, msg?: string) => void };
const Ctx = createContext<Api | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, title: string, msg?: string) => {
    const id = ++seq;
    setItems((x) => [...x.slice(-3), { id, kind, title, msg }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <ToastRow key={t.id} t={t} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

const META: Record<Kind, { cls: string; icon: React.ReactNode }> = {
  win: { cls: "border-lime/60 text-lime", icon: <CheckCircle2 size={18} /> },
  cash: { cls: "border-lime/60 text-lime", icon: <Coins size={18} /> },
  lose: { cls: "border-magenta/60 text-magenta", icon: <XCircle size={18} /> },
  skull: { cls: "border-magenta/60 text-magenta", icon: <Skull size={18} /> },
  info: { cls: "border-cyan/60 text-cyan", icon: <Info size={18} /> },
};

function ToastRow({ t }: { t: Toast }) {
  const m = META[t.kind];
  return (
    <div className={`panel clip pointer-events-auto flex min-w-[220px] items-center gap-3 border px-3.5 py-2.5 animate-rise ${m.cls}`}>
      <span>{m.icon}</span>
      <div className="leading-tight">
        <div className="font-display text-[13px] font-bold tracking-wide">{t.title}</div>
        {t.msg && <div className="font-mono text-[11px] text-muted">{t.msg}</div>}
      </div>
    </div>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  // no-op fallback so components don't crash outside a provider
  return c ?? { push: () => {} };
}
