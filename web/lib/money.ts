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

// Mode-aware amount: tKRW (₩) in REAL, play-USDC in DEMO.
export function amt(real: boolean, n: number): string {
  return real ? won(n) : usdc(n);
}

// Stake presets per mode.
export const DEMO_STAKES = [1, 5, 10, 100];
export const REAL_STAKES = [10_000, 50_000, 100_000, 500_000];
export const defaultStake = (real: boolean) => (real ? 50_000 : 5);

export function pct(n: number, dp = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}
