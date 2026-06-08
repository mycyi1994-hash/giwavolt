export function money(n: number, dp = 2): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function price(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function mult(m: number): string {
  return (m >= 10 ? m.toFixed(0) : m.toFixed(1)) + "x";
}

export function shortAddr(a: string): string {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

export function clockHHMMSS(ms: number): string {
  const d = new Date(ms);
  return d.toTimeString().slice(0, 8);
}
