// All play units are USDC, with a KRW display equivalent.
export const USDC_KRW = 1380; // display-only conversion rate

export function usdc(n: number, dp = 2): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: dp })} USDC`;
}

export function krw(nUsdc: number): string {
  return `₩${Math.round(nUsdc * USDC_KRW).toLocaleString("en-US")}`;
}

// "10 USDC · ₩13,800"
export function usdcKrw(n: number, dp = 2): string {
  return `${usdc(n, dp)} · ${krw(n)}`;
}

// Raw KRW amount (REAL mode, tKRW off-chain balance) — "₩1,000,000".
export function won(n: number): string {
  return `₩${Math.round(n).toLocaleString("en-US")}`;
}

export function pct(n: number, dp = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}
