// Integration test for server-authoritative Tap, against a real Postgres and
// the real route handlers. Only the exchange is faked — and it's faked as a
// deterministic 1-second price series, so every settlement has one correct
// answer that this test knows independently of the code under test.
//
//   createdb volt && psql -d volt -f db/schema.sql
//   DATABASE_URL=postgres://... npx tsx scripts/verify-tap-api.ts

import { COL_INTERVAL_MS, MIN_BET_HORIZON_SEC } from "../lib/tap";

const PRICE0 = 118_000;
const VOL = 0.0001; // per √s
const SERIES_SEC = 1200;

let fails = 0;
const ok = (cond: boolean, msg: string, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${msg}${extra ? "  — " + extra : ""}`);
  if (!cond) fails++;
};

// ---- a deterministic pretend exchange -----------------------------------

let seed = 99;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

const t0 = Math.floor(Date.now() / 1000) * 1000 - SERIES_SEC * 1000;
const series: { t: number; p: number }[] = [];
{
  let p = PRICE0;
  for (let i = 0; i <= SERIES_SEC + 300; i++) {
    p *= Math.exp(VOL * gauss());
    series.push({ t: t0 + i * 1000, p });
  }
}
/** The published close of the 1s bar covering `ts` — the settlement truth. */
const barAt = (ts: number) => {
  let best: { t: number; p: number } | null = null;
  for (const s of series) if (s.t <= ts && s.t >= ts - 4000 && (!best || s.t > best.t)) best = s;
  return best;
};

let blackout: { from: number; to: number } | null = null; // simulate an outage

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url);
  if (url.includes("api.binance.com/api/v3/klines")) {
    const u = new URL(url);
    const start = u.searchParams.get("startTime");
    const end = u.searchParams.get("endTime");
    const limit = Number(u.searchParams.get("limit") ?? 500);
    let rows = series;
    if (start && end) rows = series.filter((s) => s.t >= Number(start) && s.t <= Number(end));
    else rows = series.filter((s) => s.t <= Date.now()).slice(-limit);
    if (blackout) rows = rows.filter((s) => s.t < blackout!.from || s.t > blackout!.to);
    const klines = rows.map((s) => [s.t - 999, String(s.p), String(s.p), String(s.p), String(s.p), "1", s.t, "0", 0, "0", "0", "0"]);
    return new Response(JSON.stringify(klines), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("/api/v3/ticker/price") || url.includes("/products/BTC-USD/ticker")) {
    const now = barAt(Date.now());
    if (blackout && now && now.t >= blackout.from && now.t <= blackout.to) {
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ price: `${now?.p ?? 0}` }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("exchange.coinbase.com")) {
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

// Routes and db are imported *after* the stub is installed.
const { POST: place } = await import("../app/api/game/tap/place/route");
const { POST: settle } = await import("../app/api/game/tap/settle/route");
const { getSql } = await import("../lib/server/db");
const { quote } = await import("../lib/server/oracle");
const { bandStep } = await import("../lib/grid");

const db = getSql();
const ADDR = "0x1111111111111111111111111111111111111111";

const post = async (fn: (r: Request) => Promise<Response>, body: unknown) => {
  const res = await fn(new Request("http://test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as any };
};

const nextColumn = (secondsOut: number) => Math.ceil((Date.now() + secondsOut * 1000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;

// ---- fixture -------------------------------------------------------------

await db`delete from tap_bets where address=${ADDR.toLowerCase()}`;
await db`delete from txns where address=${ADDR.toLowerCase()}`;
await db`insert into accounts (address, balance) values (${ADDR.toLowerCase()}, 1000000)
         on conflict (address) do update set balance = 1000000`;

const q = await quote();
if (!q) {
  console.log("FATAL: oracle produced no quote from the stub feed");
  process.exit(1);
}
const step = bandStep(q.price, q.vol);
console.log(`oracle: price ${q.price.toFixed(2)}  vol ${q.vol.toExponential(2)}  band $${step.toFixed(2)}\n`);

// a band a couple of steps above the price — a plausible, offered cell
const band = (offsetSteps: number) => {
  const lo = Math.round(q.price / step) * step + offsetSteps * step;
  return { lo, hi: lo + step };
};

console.log("1. the server prices the cell, not the client");
{
  const b = band(1);
  const r = await post(place, { address: ADDR, stake: 1000, colT: nextColumn(20), ...b });
  ok(r.status === 200 && r.json.ok === true, "bet accepted", r.json.error ?? `mult ${r.json.mult?.toFixed(2)}×`);
  ok(typeof r.json.mult === "number" && r.json.mult > 1, "server returned its own multiplier");
  ok(r.json.balance === 999000, "stake debited atomically", `balance ${r.json.balance}`);
  ok(!("price" in r.json) && !("vol" in r.json), "the quote is NOT echoed back (no free latency oracle)");
  const rows = await db`select quote_price, quote_vol from tap_bets where id=${r.json.id}`;
  ok(rows.length === 1 && Number(rows[0].quote_price) > 0, "quote still stored server-side for audit");
}

console.log("\n2. inputs the client controls are validated");
{
  const b = band(1);
  const cases: [string, any, number][] = [
    ["colT off the column grid", { colT: nextColumn(20) + 7, ...b }, 400],
    ["column inside the locked zone", { colT: nextColumn(MIN_BET_HORIZON_SEC - 5), ...b }, 409],
    ["column too far out", { colT: nextColumn(200), ...b }, 400],
    ["inverted band", { colT: nextColumn(20), lo: b.hi, hi: b.lo }, 400],
    ["hand-picked razor-thin band", { colT: nextColumn(20), lo: b.lo, hi: b.lo + step * 0.02 }, 409],
    ["hand-picked huge band", { colT: nextColumn(20), lo: b.lo, hi: b.lo + step * 40 }, 409],
    ["band far below the market", { colT: nextColumn(20), lo: q.price * 0.9, hi: q.price * 0.9 + step }, 409],
    ["negative stake", { colT: nextColumn(20), ...b, stake: -5 }, 400],
  ];
  for (const [name, patch, want] of cases) {
    const r = await post(place, { address: ADDR, stake: 1000, ...patch });
    ok(r.status === want, `rejected: ${name}`, `${r.status} ${r.json.error ?? ""}`);
  }
  const bal = await db`select balance from accounts where address=${ADDR.toLowerCase()}`;
  ok(Number(bal[0].balance) === 999000, "no rejected attempt moved money");
}

console.log("\n3. a bet is not settled before it is due");
{
  const r = await post(settle, { address: ADDR });
  ok(r.json.ok === true && r.json.settled.length === 0, "nothing settled early");
  ok(r.json.open === 1, "position still open", `open ${r.json.open}`);
}

console.log("\n4. outcomes match the exchange's published price");
{
  // place two bets on a column already in the past, straddling the truth:
  // one band containing the settlement price, one that cannot contain it
  const colT = Math.floor((Date.now() - 5000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;
  const truth = barAt(colT);
  if (!truth) {
    console.log("  FAIL no reference bar for the chosen column");
    fails++;
  } else {
    const lo = Math.floor(truth.p / step) * step;
    const winner = await db`insert into tap_bets (address, stake, mult, band_lo, band_hi, col_t, quote_price, quote_vol, quote_source)
      values (${ADDR.toLowerCase()}, 1000, 5, ${lo}, ${lo + step}, ${colT}, ${q.price}, ${q.vol}, 'binance') returning id`;
    const loser = await db`insert into tap_bets (address, stake, mult, band_lo, band_hi, col_t, quote_price, quote_vol, quote_source)
      values (${ADDR.toLowerCase()}, 1000, 5, ${lo + step * 8}, ${lo + step * 9}, ${colT}, ${q.price}, ${q.vol}, 'binance') returning id`;

    const before = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);
    const r = await post(settle, { address: ADDR });
    const byId = Object.fromEntries(r.json.settled.map((s: any) => [s.id, s]));

    ok(byId[String(winner[0].id)]?.status === "won", "band containing the published price won");
    ok(byId[String(loser[0].id)]?.status === "lost", "band that could not contain it lost");
    ok(
      Math.abs(byId[String(winner[0].id)]?.settlePrice - truth.p) < 0.01,
      "settled at the exchange's bar close",
      `got ${byId[String(winner[0].id)]?.settlePrice?.toFixed(2)} want ${truth.p.toFixed(2)}`
    );
    const after = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);
    ok(after - before === 5000, "winner paid stake x mult, loser paid nothing", `+${after - before}`);
  }
}

console.log("\n5. settling twice does not pay twice");
{
  const before = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);
  const a = await post(settle, { address: ADDR });
  const b = await post(settle, { address: ADDR });
  const after = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);
  ok(a.json.settled.length === 0 && b.json.settled.length === 0, "already-settled bets are not re-reported");
  ok(after === before, "balance unchanged by repeat settlement", `${before} → ${after}`);

  // and concurrently, which is the case the status guard actually exists for
  const colT = Math.floor((Date.now() - 6000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;
  const truth = barAt(colT)!;
  const lo = Math.floor(truth.p / step) * step;
  await db`insert into tap_bets (address, stake, mult, band_lo, band_hi, col_t, quote_price, quote_vol, quote_source)
           values (${ADDR.toLowerCase()}, 1000, 5, ${lo}, ${lo + step}, ${colT}, ${q.price}, ${q.vol}, 'binance')`;
  const bal0 = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);
  const [r1, r2, r3] = await Promise.all([post(settle, { address: ADDR }), post(settle, { address: ADDR }), post(settle, { address: ADDR })]);
  const bal1 = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);
  const reported = r1.json.settled.length + r2.json.settled.length + r3.json.settled.length;
  ok(reported === 1, "three concurrent settles report the bet exactly once", `reported ${reported}`);
  ok(bal1 - bal0 === 5000, "paid exactly once", `+${bal1 - bal0}`);
}

console.log("\n6. a void is not a free option the player can trigger on demand");
{
  // A void refunds the stake, and the *player* decides when settlement runs.
  // If one failed fetch were enough, the play would be: bank the winners, and
  // retry the losers until the oracle blinks. So a losing bet is held open
  // through repeated failures instead of being handed back.
  const colT = Math.floor((Date.now() - 60_000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;
  blackout = { from: colT - 10_000, to: colT + 10_000 };
  await db`delete from price_bars where ts >= ${colT - 10_000} and ts <= ${colT + 10_000}`;

  const lo = Math.floor(q.price / step) * step;
  const bet = await db`insert into tap_bets (address, stake, mult, band_lo, band_hi, col_t, quote_price, quote_vol, quote_source)
    values (${ADDR.toLowerCase()}, 1000, 5, ${lo}, ${lo + step}, ${colT}, ${q.price}, ${q.vol}, 'binance') returning id`;
  const id = String(bet[0].id);
  const before = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);

  for (let i = 0; i < 8; i++) await post(settle, { address: ADDR });
  const spam = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);
  const st = (await db`select status, settle_attempts from tap_bets where id=${id}`)[0];
  ok(st.status === "live", "hammering settle during an outage does NOT void the bet", `status ${st.status}`);
  ok(spam === before, "no refund was extracted", `balance ${spam}`);
  ok(Number(st.settle_attempts) >= 6, "the failed attempts were recorded", `${st.settle_attempts} attempts`);

  console.log("   …and voids once the failure is genuinely sustained");
  // age the bet past the void window and backdate the first attempt
  const old = Date.now() - 20 * 60_000;
  const oldCol = Math.floor(old / COL_INTERVAL_MS) * COL_INTERVAL_MS;
  await db`update tap_bets set col_t=${oldCol}, first_attempt_at = now() - interval '10 minutes' where id=${id}`;
  blackout = { from: oldCol - 10_000, to: oldCol + 10_000 };
  await db`delete from price_bars where ts >= ${oldCol - 10_000} and ts <= ${oldCol + 10_000}`;

  const r = await post(settle, { address: ADDR });
  const after = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);
  const s = r.json.settled.find((x: any) => x.id === id);
  ok(s?.status === "void", "voided after sustained, spread-out failure", s ? `status ${s.status}` : "still open");
  ok(after - before === 1000, "stake refunded in full, exactly once", `+${after - before}`);
  blackout = null;
}

console.log("\n6b. a settlement price we already recorded survives an exchange outage");
{
  // The bars the oracle has seen are persisted, so a player cannot manufacture
  // an unresolvable bet by pushing the exchange into rate-limiting.
  const colT = Math.floor((Date.now() - 8_000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;
  const truth = barAt(colT)!;
  await db`insert into price_bars (ts, price, source) values (${truth.t}, ${truth.p}, 'binance')
           on conflict (ts) do nothing`;
  blackout = { from: colT - 60_000, to: colT + 60_000 }; // exchange refuses everything

  const lo = Math.floor(truth.p / step) * step;
  const bet = await db`insert into tap_bets (address, stake, mult, band_lo, band_hi, col_t, quote_price, quote_vol, quote_source)
    values (${ADDR.toLowerCase()}, 1000, 5, ${lo}, ${lo + step}, ${colT}, ${q.price}, ${q.vol}, 'binance') returning id`;
  const r = await post(settle, { address: ADDR });
  const s = r.json.settled.find((x: any) => x.id === String(bet[0].id));
  ok(s?.status === "won", "settled from the stored bar with the exchange down", s ? `status ${s.status}` : "not settled");
  ok(Math.abs(s?.settlePrice - truth.p) < 0.01, "and at the recorded price", `${s?.settlePrice}`);
  blackout = null;
}

console.log("\n7. a due bet with a fetchable price is never voided early");
{
  const colT = Math.floor((Date.now() - 2000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;
  const lo = Math.floor(q.price / step) * step;
  await db`insert into tap_bets (address, stake, mult, band_lo, band_hi, col_t, quote_price, quote_vol, quote_source)
           values (${ADDR.toLowerCase()}, 1000, 5, ${lo}, ${lo + step}, ${colT}, ${q.price}, ${q.vol}, 'binance')`;
  const r = await post(settle, { address: ADDR });
  const voids = r.json.settled.filter((s: any) => s.status === "void");
  ok(voids.length === 0, "resolved normally instead of voiding", `${r.json.settled.length} settled`);
}

console.log("\n8. the ledger is a complete audit trail");
{
  const rows = await db`select kind, sum(delta)::float as total, count(*)::int as n from txns
                        where address=${ADDR.toLowerCase()} group by kind order by kind`;
  for (const r of rows) console.log(`       ${String(r.kind).padEnd(8)} ${String(r.n).padStart(3)} entries  net ${Number(r.total).toFixed(2)}`);
  const bets = await db`select status, count(*)::int as n from tap_bets where address=${ADDR.toLowerCase()} group by status order by status`;
  for (const r of bets) console.log(`       bets ${String(r.status).padEnd(5)} ${r.n}`);
  const net = Number((await db`select coalesce(sum(delta),0)::float as s from txns where address=${ADDR.toLowerCase()}`)[0].s);
  const bal = Number((await db`select balance from accounts where address=${ADDR.toLowerCase()}`)[0].balance);
  ok(Math.abs(1_000_000 + net - bal) < 0.01, "txn log reconciles with the balance", `1000000 ${net >= 0 ? "+" : ""}${net} = ${bal}`);
}

await db.end();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
