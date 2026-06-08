"use client";

import { useEffect, useState } from "react";
import { Lock, Plus, Trash2, CheckCircle2, XCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { useMarkets } from "@/components/predict/MarketsProvider";
import { MARKET_CATEGORIES, fmtVolume, type Market } from "@/lib/predict";

const PASSCODE = "volt"; // demo-only client gate

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  useEffect(() => setUnlocked(sessionStorage.getItem("volt:admin") === "1"), []);

  if (!unlocked) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="panel clip flex w-full max-w-sm flex-col items-center gap-4 px-7 py-8 text-center">
          <div className="grid h-12 w-12 place-items-center border border-cyan/50 text-cyan clip animate-glow">
            <Lock size={22} />
          </div>
          <div className="font-display text-lg font-bold tracking-wide text-txt neon-cyan">ADMIN ACCESS</div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code === PASSCODE) {
                sessionStorage.setItem("volt:admin", "1");
                setUnlocked(true);
              }
            }}
            type="password"
            placeholder="Passcode"
            className="tabular w-full border border-line bg-ink-2 px-3 py-2 text-center text-txt outline-none clip placeholder:text-faint"
          />
          <button
            onClick={() => {
              if (code === PASSCODE) {
                sessionStorage.setItem("volt:admin", "1");
                setUnlocked(true);
              }
            }}
            className="btn-neon clip w-full bg-cyan/10 py-2.5 font-display text-sm font-bold tracking-wide text-cyan"
          >
            UNLOCK
          </button>
          <p className="font-mono text-[10px] text-faint">Demo gate · passcode: volt</p>
        </div>
      </div>
    );
  }
  return <AdminPanel />;
}

function AdminPanel() {
  const { markets, add, update, resolve, remove, reset } = useMarkets();
  const [draft, setDraft] = useState({ question: "", category: "Crypto" as Market["category"], yes: 50, ends: "7d", volume: 100000 });

  const create = () => {
    if (!draft.question.trim()) return;
    add({ ...draft, change: 0 });
    setDraft({ question: "", category: "Crypto", yes: 50, ends: "7d", volume: 100000 });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-6 md:px-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="flex items-center gap-2 font-display text-2xl font-black tracking-wide text-txt neon-cyan">
            <ShieldCheck size={22} className="text-cyan" /> PREDICT · ADMIN
          </h1>
          <button onClick={reset} className="flex items-center gap-1.5 border border-line bg-ink-2 px-3 py-2 font-display text-[12px] font-bold text-muted clip hover:text-magenta">
            <RotateCcw size={13} /> RESET TO DEFAULTS
          </button>
        </div>

        {/* create */}
        <section className="panel clip mb-6 p-4">
          <div className="mb-3 font-mono text-[10px] tracking-[0.2em] text-faint">CREATE MARKET</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
            <input
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              placeholder="Will … ?"
              className="border border-line bg-ink-2 px-3 py-2 text-[14px] text-txt outline-none clip placeholder:text-faint"
            />
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as Market["category"] })}
              className="border border-line bg-ink-2 px-2 py-2 text-[13px] text-txt outline-none clip"
            >
              {MARKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={99}
              value={draft.yes}
              onChange={(e) => setDraft({ ...draft, yes: clamp(+e.target.value, 1, 99) })}
              className="tabular w-20 border border-line bg-ink-2 px-2 py-2 text-center text-[13px] text-cyan outline-none clip"
              title="YES ¢"
            />
            <input
              value={draft.ends}
              onChange={(e) => setDraft({ ...draft, ends: e.target.value })}
              className="w-16 border border-line bg-ink-2 px-2 py-2 text-center text-[13px] text-txt outline-none clip"
              title="ends"
            />
            <button onClick={create} className="btn-neon clip flex items-center justify-center gap-1 bg-cyan/10 px-4 py-2 font-display text-[13px] font-bold text-cyan">
              <Plus size={14} /> ADD
            </button>
          </div>
        </section>

        {/* list */}
        <section className="space-y-2">
          {markets.map((m) => (
            <div key={m.id} className="panel clip flex flex-wrap items-center gap-3 p-3">
              <span className="border border-line bg-ink-2 px-2 py-0.5 font-mono text-[10px] text-cyan clip">{m.category.toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate font-display text-[14px] font-bold text-txt">{m.question}</span>
              <span className="font-mono text-[11px] text-faint">Vol {fmtVolume(m.volume)}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-faint">YES¢</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={m.yes}
                  onChange={(e) => update(m.id, { yes: clamp(+e.target.value, 1, 99) })}
                  className="tabular w-16 border border-line bg-ink-2 px-2 py-1 text-center text-[13px] text-cyan outline-none clip"
                />
              </div>
              {m.resolved ? (
                <span className={`clip px-2 py-1 font-mono text-[10px] font-bold ${m.resolved === "yes" ? "bg-lime/20 text-lime" : "bg-magenta/20 text-magenta"}`}>
                  {m.resolved.toUpperCase()}
                </span>
              ) : (
                <>
                  <button onClick={() => resolve(m.id, "yes")} className="flex items-center gap-1 border border-lime/50 px-2 py-1 font-display text-[11px] font-bold text-lime clip hover:bg-lime/10">
                    <CheckCircle2 size={13} /> YES
                  </button>
                  <button onClick={() => resolve(m.id, "no")} className="flex items-center gap-1 border border-magenta/50 px-2 py-1 font-display text-[11px] font-bold text-magenta clip hover:bg-magenta/10">
                    <XCircle size={13} /> NO
                  </button>
                </>
              )}
              <button onClick={() => remove(m.id)} className="grid h-7 w-7 place-items-center border border-line text-faint clip hover:border-magenta/50 hover:text-magenta">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </section>
        <p className="mt-4 font-mono text-[10px] text-faint">
          Demo admin — changes are saved in your browser (localStorage). Real deployments would gate this server-side and write to a contract / DB.
        </p>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Number.isNaN(n) ? lo : n));
}
