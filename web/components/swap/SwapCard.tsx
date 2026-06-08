"use client";

import { useState } from "react";
import { ArrowDownUp, ChevronDown } from "lucide-react";
import { useWalletGate } from "@/lib/walletGate";
import { USDC_KRW } from "@/lib/money";

type Token = "USDC" | "KRW" | "ETH" | "GIWA";

const TOKENS: Token[] = ["USDC", "KRW", "ETH", "GIWA"];

// Reference USD prices (mock, deterministic).
const PRICE_USD: Record<Token, number> = {
  USDC: 1,
  KRW: 1 / USDC_KRW,
  ETH: 3000,
  GIWA: 0.5,
};

// Mock wallet balances per token (display only).
const BALANCE: Record<Token, number> = {
  USDC: 2500,
  KRW: 3_450_000,
  ETH: 1.2,
  GIWA: 9000,
};

function fmt(n: number, dp = 4): string {
  if (!isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: dp });
}

function rate(from: Token, to: Token): number {
  return PRICE_USD[from] / PRICE_USD[to];
}

export default function SwapCard() {
  const { isConnected, requireWallet } = useWalletGate();

  const [from, setFrom] = useState<Token>("USDC");
  const [to, setTo] = useState<Token>("KRW");
  const [amount, setAmount] = useState<string>("100");
  const [toast, setToast] = useState<string>("");

  const fromAmount = parseFloat(amount) || 0;
  const toAmount = fromAmount * rate(from, to);

  function cycle(which: "from" | "to") {
    const current = which === "from" ? from : to;
    const other = which === "from" ? to : from;
    const idx = TOKENS.indexOf(current);
    // advance to the next token that isn't the opposite side
    let next = current;
    for (let i = 1; i <= TOKENS.length; i++) {
      const candidate = TOKENS[(idx + i) % TOKENS.length];
      if (candidate !== other) {
        next = candidate;
        break;
      }
    }
    if (which === "from") setFrom(next);
    else setTo(next);
    setToast("");
  }

  function flip() {
    setFrom(to);
    setTo(from);
    setToast("");
  }

  function onSwap() {
    requireWallet(() => {
      setToast("Swap simulated — on-chain routing coming soon");
    });
  }

  return (
    <div className="panel clip w-full max-w-[420px] animate-pop-in p-5">
      {/* title */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-lg font-black tracking-[0.2em] text-txt neon-cyan">
          COIN SWAP
        </h1>
        <span className="font-mono text-[9px] tracking-[0.2em] text-faint">VOLT AMM</span>
      </div>

      {/* FROM row */}
      <TokenRow
        label="FROM"
        token={from}
        onCycle={() => cycle("from")}
        value={amount}
        onChange={setAmount}
        editable
      />

      {/* flip button */}
      <div className="relative my-2 flex justify-center">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-line to-transparent" />
        <button
          onClick={flip}
          aria-label="Flip swap direction"
          className="btn-neon clip relative grid h-9 w-9 place-items-center bg-ink-2 text-cyan transition hover:text-magenta"
        >
          <ArrowDownUp size={16} strokeWidth={2.6} />
        </button>
      </div>

      {/* TO row */}
      <TokenRow
        label="TO"
        token={to}
        onCycle={() => cycle("to")}
        value={fmt(toAmount)}
        readOnly
      />

      {/* rate + fee */}
      <div className="mt-4 space-y-1 border-t border-line pt-3">
        <div className="tabular flex items-center justify-between text-[12px]">
          <span className="text-faint">RATE</span>
          <span className="text-muted">
            1 {from} ≈ <span className="text-cyan">{fmt(rate(from, to))}</span> {to}
          </span>
        </div>
        <div className="text-center font-mono text-[9px] tracking-[0.18em] text-faint">
          Powered by VOLT AMM · 0.30% fee
        </div>
      </div>

      {/* action */}
      <button
        onClick={onSwap}
        className={`btn-neon clip mt-4 w-full py-3 font-display text-sm font-black tracking-[0.22em] transition ${
          isConnected ? "bg-cyan/10 text-cyan" : "bg-magenta/10 text-magenta"
        }`}
      >
        {isConnected ? "SWAP" : "CONNECT WALLET"}
      </button>

      {/* toast */}
      {toast && (
        <div className="mt-3 animate-pop-in border border-lime/40 bg-lime/5 px-3 py-2 text-center font-mono text-[11px] tracking-wide text-lime clip neon-lime">
          {toast}
        </div>
      )}
    </div>
  );
}

function TokenRow({
  label,
  token,
  onCycle,
  value,
  onChange,
  editable = false,
  readOnly = false,
}: {
  label: string;
  token: Token;
  onCycle: () => void;
  value: string;
  onChange?: (v: string) => void;
  editable?: boolean;
  readOnly?: boolean;
}) {
  const emphasized = token === "USDC" || token === "KRW";
  return (
    <div className="border border-line bg-ink-2/60 p-3 clip">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.2em] text-faint">{label}</span>
        <span className="tabular font-mono text-[10px] text-faint">
          Balance: {fmt(BALANCE[token], 4)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onCycle}
          className={`flex shrink-0 items-center gap-1.5 border px-3 py-2 font-display text-sm font-bold tracking-wide transition clip ${
            emphasized
              ? "border-cyan/50 bg-cyan/10 text-cyan"
              : "border-line bg-ink text-txt hover:border-line-strong"
          }`}
        >
          {token}
          <ChevronDown size={14} strokeWidth={2.6} className="opacity-70" />
        </button>
        <input
          inputMode="decimal"
          type="text"
          value={value}
          readOnly={readOnly}
          onChange={editable ? (e) => onChange?.(e.target.value.replace(/[^0-9.]/g, "")) : undefined}
          placeholder="0.0"
          className={`tabular w-full bg-transparent text-right text-2xl font-bold outline-none placeholder:text-faint ${
            readOnly ? "text-muted" : "text-txt neon-cyan"
          }`}
        />
      </div>
    </div>
  );
}
