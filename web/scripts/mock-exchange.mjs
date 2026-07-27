// A stand-in for the Binance 1s-kline endpoint, serving a deterministic price
// series. Used to drive the server oracle over real HTTP in tests, so the route
// under test does actual network I/O rather than a patched fetch.
//
//   node scripts/mock-exchange.mjs 5399
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 5399);
const PRICE0 = 118_000;
const VOL = 0.0001;
const SECONDS = 1400;

let seed = 4242;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

// anchored to a fixed second so every process derives the same bars
const base = Math.floor(Date.now() / 1000) * 1000 - SECONDS * 1000;
const series = [];
{
  let p = PRICE0;
  for (let i = 0; i <= SECONDS + 600; i++) {
    p *= Math.exp(VOL * gauss());
    series.push({ t: base + i * 1000, p });
  }
}

export const priceAt = (ts) => {
  let best = null;
  for (const s of series) if (s.t <= ts && (!best || s.t > best.t)) best = s;
  return best;
};

createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  // lets a test compute the exact band the server would offer, without having
  // to re-derive this process's random series
  if (u.pathname === "/price") {
    const now = priceAt(Date.now());
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ price: now?.p ?? null, vol: VOL }));
    return;
  }
  if (!u.pathname.startsWith("/api/v3/klines")) {
    res.writeHead(404).end("[]");
    return;
  }
  const start = u.searchParams.get("startTime");
  const end = u.searchParams.get("endTime");
  const limit = Number(u.searchParams.get("limit") ?? 500);
  let rows =
    start && end
      ? series.filter((s) => s.t >= Number(start) && s.t <= Number(end))
      : series.filter((s) => s.t <= Date.now()).slice(-limit);
  const klines = rows.map((s) => [s.t - 999, `${s.p}`, `${s.p}`, `${s.p}`, `${s.p}`, "1", s.t, "0", 0, "0", "0", "0"]);
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(klines));
}).listen(PORT, "127.0.0.1", () => console.log(`mock exchange on :${PORT}`));
