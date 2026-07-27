// Exercises the Tap endpoints over real HTTP against a running Next server,
// using exactly the payloads app/terminal/tap/page.tsx sends.
//
// scripts/verify-tap-api.mts imports the handlers directly and tests the logic;
// this one checks the wire contract the browser depends on — request shape,
// status codes, and the response fields the page reads.
//
//   node scripts/mock-exchange.mjs 5399 &
//   DATABASE_URL=... BINANCE_API_BASE=http://127.0.0.1:5399 npx next start -p 3210 &
//   node scripts/verify-tap-http.mjs
import { COL_INTERVAL_MS, MIN_BET_HORIZON_SEC } from "../lib/tap.js";

const BASE = process.env.BASE ?? "http://127.0.0.1:3210";
const MOCK = process.env.MOCK ?? "http://127.0.0.1:5399";
const ADDR = process.env.ADDR ?? "0x2222222222222222222222222222222222222222";

let fails = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${msg}${extra ? "  — " + extra : ""}`);
  if (!cond) fails++;
};

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));

const place = (body) => post("/api/game/tap/place", { address: ADDR, ...body });
const settle = () => post("/api/game/tap/settle", { address: ADDR });
const nextColumn = (secondsOut) => Math.ceil((Date.now() + secondsOut * 1000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;

// Ask the mock what the market is doing, so the test can build the same band
// the server's grid would offer instead of guessing at one.
const { price, vol } = await fetch(`${MOCK}/price`).then((r) => r.json());
const { bandStep } = await import("../lib/grid.js");
const step = bandStep(price, vol);
const centre = Math.round(price / step) * step;
console.log(`market: price ${price.toFixed(2)}  band $${step.toFixed(2)}\n`);

console.log("placing a position");
let placed = null;
{
  const lo = centre + step; // one band above the money — a normal tap
  const r = await place({ stake: 100, colT: nextColumn(MIN_BET_HORIZON_SEC + 8), lo, hi: lo + step });
  ok(r.status === 200 && r.json.ok === true, "bet accepted over HTTP", r.json.error ?? `mult ${r.json.mult?.toFixed(2)}x`);
  placed = r.json.ok ? r.json : null;
  if (placed) {
    ok(typeof placed.id === "string" && placed.id.length > 0, "response carries an id the client can track");
    ok(typeof placed.mult === "number" && placed.mult > 1, "response carries the server's own multiplier");
    ok(typeof placed.balance === "number", "response carries the authoritative balance");
    ok(typeof placed.price === "number" && typeof placed.vol === "number", "response carries the quote it was priced on");
  }
}

console.log("\npolling for settlement");
{
  const r = await settle();
  ok(r.status === 200 && r.json.ok === true, "settle responds", String(r.status));
  ok(Array.isArray(r.json.settled), "settled is an array the client can drain");
  ok(typeof r.json.open === "number", "open count drives the client's poll interval");
  ok(typeof r.json.balance === "number", "balance returned for the client to adopt");
  ok(r.json.open >= 1, "the position just placed is counted as open", `open ${r.json.open}`);
}

console.log("\nrejections the client must surface");
{
  const lo = centre + step;
  const cases = [
    ["locked zone", { stake: 100, colT: nextColumn(2), lo, hi: lo + step }, 409],
    ["off the column grid", { stake: 100, colT: nextColumn(20) + 7, lo, hi: lo + step }, 400],
    ["band far from the price", { stake: 100, colT: nextColumn(20), lo: price * 0.8, hi: price * 0.8 + step }, 409],
    ["client-shaped thin band", { stake: 100, colT: nextColumn(20), lo, hi: lo + step * 0.05 }, 409],
  ];
  for (const [name, body, want] of cases) {
    const r = await place(body);
    ok(r.status === want && typeof r.json.error === "string", `${name} → ${want} with a message`, `${r.status} ${r.json.error ?? ""}`);
  }
  const noAddr = await post("/api/game/tap/place", { stake: 100, colT: nextColumn(20), lo, hi: lo + step });
  ok(noAddr.status === 400, "missing address → 400", String(noAddr.status));
}

console.log("\nwaiting for the column to come due");
{
  const target = placed?.colT;
  if (!target) {
    ok(false, "no position to settle");
  } else {
    const deadline = target + 6000;
    let out = null;
    while (Date.now() < deadline + 20_000) {
      const r = await settle();
      const hit = r.json.settled?.find((s) => s.id === placed.id);
      if (hit) {
        out = hit;
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    ok(!!out, "position settled after its column came due", out ? `${out.status}` : "timed out");
    ok(out?.status === "won" || out?.status === "lost", "outcome is a real result, not a void", out?.status ?? "-");
    if (out?.status === "won") ok(out.payout > 0, "winning payout is credited", `+${out.payout}`);
    const after = await settle();
    ok(!after.json.settled?.some((s) => s.id === placed.id), "a settled position is not reported twice");
  }
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
