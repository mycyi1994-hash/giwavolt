"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { X, Copy, Check, ArrowDownToLine, ArrowUpFromLine, Wallet } from "lucide-react";
import { usePlay } from "@/components/play/PlayProvider";
import { depositAddressFor, faux } from "@/lib/deposit";
import { usdc, krw } from "@/lib/money";
import { sfx } from "@/lib/sound";

const Ctx = createContext<{ open: () => void } | null>(null);
export function useDeposit() {
  return useContext(Ctx) ?? { open: () => {} };
}

export function DepositProvider({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const open = useCallback(() => setShow(true), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {show && <Modal onClose={() => setShow(false)} />}
    </Ctx.Provider>
  );
}

function Modal({ onClose }: { onClose: () => void }) {
  const { address, isConnected } = useAccount();
  const { balance, adjust } = usePlay();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amt, setAmt] = useState(100);
  const [copied, setCopied] = useState(false);
  const dep = depositAddressFor(address);

  const copy = () => {
    if (!dep) return;
    navigator.clipboard?.writeText(dep);
    setCopied(true);
    sfx.tick();
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-bg/70 p-4 backdrop-blur" onClick={onClose}>
      <div className="panel clip w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-base font-black tracking-wide text-txt neon-cyan">
            <Wallet size={18} className="text-cyan" /> GAME WALLET
          </div>
          <button onClick={onClose} className="text-faint hover:text-txt">
            <X size={18} />
          </button>
        </div>

        {/* balance */}
        <div className="panel clip mb-4 p-3 text-center">
          <div className="font-mono text-[10px] tracking-[0.2em] text-faint">DEPOSITED BALANCE</div>
          <div className="tabular text-3xl font-black text-cyan neon-cyan">{usdc(balance.real)}</div>
          <div className="tabular text-[11px] text-faint">{krw(balance.real)}</div>
        </div>

        {!isConnected ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-center font-sans text-[13px] text-muted">Connect a wallet to get your deposit address.</p>
            <ConnectButton accountStatus="address" chainStatus="none" showBalance={false} />
          </div>
        ) : (
          <>
            <div className="mb-4 inline-flex w-full border border-line bg-ink-2 p-0.5 clip text-[12px] font-bold">
              {(["deposit", "withdraw"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`flex flex-1 items-center justify-center gap-1.5 py-2 clip transition ${tab === t ? "bg-cyan/15 text-cyan" : "text-faint hover:text-txt"}`}>
                  {t === "deposit" ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />} {t.toUpperCase()}
                </button>
              ))}
            </div>

            {tab === "deposit" ? (
              <>
                <p className="mb-3 font-sans text-[12px] leading-relaxed text-muted">
                  Send <span className="text-cyan">USDC</span> (Giwa Sepolia) to your deposit address. It credits your game
                  balance automatically — then play with <span className="text-lime">no per-bet signatures</span>.
                </p>
                <div className="mb-3 flex items-center gap-3">
                  <FauxQR addr={dep!} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] tracking-wider text-faint">DEPOSIT ADDRESS</div>
                    <div className="tabular break-all text-[12px] text-txt">{dep}</div>
                    <button onClick={copy} className="mt-2 flex items-center gap-1.5 border border-line bg-ink-2 px-2.5 py-1 font-mono text-[11px] text-cyan clip hover:border-cyan/50">
                      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "COPIED" : "COPY"}
                    </button>
                  </div>
                </div>
                <Amount amt={amt} setAmt={setAmt} />
                <button
                  onClick={() => {
                    sfx.cashout();
                    adjust("real", amt);
                  }}
                  className="btn-neon clip w-full bg-cyan/10 py-3 font-display text-sm font-black tracking-widest text-cyan"
                >
                  SIMULATE DEPOSIT +{usdc(amt)}
                </button>
                <p className="mt-2 text-center font-mono text-[10px] text-faint">demo: real deposits are watched on-chain & auto-credited</p>
              </>
            ) : (
              <>
                <p className="mb-3 font-sans text-[12px] leading-relaxed text-muted">Withdraw your game balance back to your connected wallet.</p>
                <Amount amt={amt} setAmt={setAmt} max={balance.real} />
                <button
                  onClick={() => {
                    if (amt > balance.real) return;
                    sfx.select();
                    adjust("real", -amt);
                  }}
                  disabled={amt > balance.real}
                  className="clip w-full border border-magenta/60 bg-magenta/10 py-3 font-display text-sm font-black tracking-widest text-magenta disabled:opacity-30"
                >
                  WITHDRAW {usdc(amt)}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Amount({ amt, setAmt, max }: { amt: number; setAmt: (n: number) => void; max?: number }) {
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-2 border border-line bg-ink-2 px-3 py-2.5 clip">
        <input type="number" min={1} value={amt} onChange={(e) => setAmt(Math.max(1, +e.target.value || 1))} className="tabular w-full bg-transparent text-[16px] text-txt outline-none" />
        <span className="font-mono text-[12px] text-cyan">USDC</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[50, 100, 500, 1000].map((v) => (
          <button key={v} onClick={() => setAmt(max ? Math.min(v, max) : v)} className="clip border border-line bg-ink-2 py-1.5 font-mono text-[12px] font-bold text-muted hover:text-txt">
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function FauxQR({ addr }: { addr: string }) {
  const cells = faux(addr, 11);
  return (
    <div className="grid shrink-0 gap-px border border-line bg-ink p-1.5 clip" style={{ gridTemplateColumns: "repeat(11, 6px)" }}>
      {cells.map((on, i) => (
        <span key={i} style={{ width: 6, height: 6, background: on ? "#00e5ff" : "transparent" }} />
      ))}
    </div>
  );
}
