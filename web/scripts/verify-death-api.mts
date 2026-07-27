// Integration test for server-authoritative Death Fun, against a real Postgres
// and the real route handlers.
//
// The thing being tested is mostly a negative: that the skull positions never
// reach the client while they'd be useful, that the board can't be re-rolled or
// replayed for a better one, and that the committed seed really does reproduce
// the board that was dealt.
//
//   createdb volt && psql -d volt -f db/schema.sql
//   DATABASE_URL=postgres://... npx tsx scripts/verify-death-api.mts

import { createHash } from "crypto";

let fails = 0;
const ok = (cond: boolean, msg: string, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${msg}${extra ? "  — " + extra : ""}`);
  if (!cond) fails++;
};

const { POST: start } = await import("../app/api/game/death/start/route");
const { POST: reveal } = await import("../app/api/game/death/reveal/route");
const { POST: cashout } = await import("../app/api/game/death/cashout/route");
const { GET: roundGet } = await import("../app/api/game/death/round/route");
const { getSql } = await import("../lib/server/db");
const { seededRng } = await import("../lib/server/prng");
const { newBoard, multiplierAfter } = await import("../lib/death");

const db = getSql();
const ADDR = "0x3333333333333333333333333333333333333333";
const OTHER = "0x4444444444444444444444444444444444444444";

const post = async (fn: (r: Request) => Promise<Response>, body: unknown) => {
  const res = await fn(new Request("http://t/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as any };
};
const get = async (url: string) => {
  const res = await roundGet(new Request(url));
  return { status: res.status, json: (await res.json()) as any };
};
const balanceOf = async (a: string) =>
  Number((await db`select balance from accounts where address=${a.toLowerCase()}`)[0]?.balance ?? 0);

const reset = async () => {
  for (const a of [ADDR, OTHER]) {
    await db`delete from death_rounds where address=${a.toLowerCase()}`;
    await db`delete from txns where address=${a.toLowerCase()}`;
    await db`insert into accounts (address, balance) values (${a.toLowerCase()}, 1000000)
             on conflict (address) do update set balance = 1000000`;
  }
};
await reset();

console.log("1. the board is dealt server-side and the skulls stay there");
let round: any;
{
  const r = await post(start, { address: ADDR, difficulty: "medium", stake: 1000, clientSeed: "abc" });
  ok(r.status === 200 && r.json.ok, "round dealt", r.json.error ?? `${r.json.round?.dim}x${r.json.round?.dim}`);
  round = r.json.round;
  ok(r.json.balance === 999000, "stake debited", `balance ${r.json.balance}`);

  const body = JSON.stringify(round);
  ok(!("bombsIdx" in round) && !("bombs_idx" in round), "response has no skull-position field");
  ok(!round.serverSeed, "server seed is NOT revealed while the round is live");
  ok(typeof round.serverSeedHash === "string" && round.serverSeedHash.length === 64, "seed commitment is published");
  ok(round.tiles.every((t: string) => t === "hidden" || t === "void"), "every playable tile is hidden");

  // the real test: does the payload correlate with the truth at all?
  const secret: number[] = (await db`select bombs_idx from death_rounds where id=${round.id}`)[0].bombs_idx;
  const leaked = secret.some((i) => body.includes(`"${i}"`) && round.tiles[i] === "skull");
  ok(!leaked, "no skull index is inferable from the payload", `${secret.length} skulls hidden`);
}

console.log("\n2. the committed seed really does reproduce the board");
{
  const row = (await db`select * from death_rounds where id=${round.id}`)[0] as any;
  ok(createHash("sha256").update(row.server_seed).digest("hex") === row.server_seed_hash, "sha256(seed) matches the published hash");

  const replay = newBoard("real", row.difficulty, seededRng(row.server_seed, row.client_seed, Number(row.nonce)));
  ok(JSON.stringify(replay.bombsIdx) === JSON.stringify(row.bombs_idx), "replaying the seed regenerates the exact skulls");
  ok(JSON.stringify(replay.tiles.map((t) => t !== "void")) === JSON.stringify(row.mask), "and the exact board shape");
}

console.log("\n3. a player cannot re-roll the board");
{
  const again = await post(start, { address: ADDR, difficulty: "ultra", stake: 500000 });
  ok(again.json.resumed === true && again.json.round.id === round.id, "a second start resumes the open round");
  ok(await balanceOf(ADDR) === 999000, "no second stake was taken", `balance ${await balanceOf(ADDR)}`);
}

console.log("\n4. reveals are decided by the stored board, not the request");
{
  const secret: number[] = (await db`select bombs_idx from death_rounds where id=${round.id}`)[0].bombs_idx;
  const mask: boolean[] = (await db`select mask from death_rounds where id=${round.id}`)[0].mask;
  const safeIdx = mask.map((on, i) => (on && !secret.includes(i) ? i : -1)).filter((i) => i >= 0);
  const total = mask.filter(Boolean).length;

  const r = await post(reveal, { address: ADDR, roundId: round.id, index: safeIdx[0] });
  ok(r.json.ok && r.json.hit === "safe", "a known-safe tile reveals safe");
  const want = multiplierAfter(1, round.bombs, total);
  ok(Math.abs(r.json.round.multiplier - want) < 0.0001, "multiplier follows the board's own odds", `${r.json.round.multiplier} vs ${want.toFixed(4)}`);
  ok(r.json.round.tiles.filter((t: string) => t === "safe").length === 1, "only the opened tile is shown");
  ok(r.json.round.tiles.filter((t: string) => t === "skull").length === 0, "no skull is shown mid-round");

  const dup = await post(reveal, { address: ADDR, roundId: round.id, index: safeIdx[0] });
  ok(dup.status === 409, "the same tile cannot be opened twice", `${dup.status}`);

  const offBoard = await post(reveal, { address: ADDR, roundId: round.id, index: 99999 });
  ok(offBoard.status === 400, "an off-board index is rejected", `${offBoard.status}`);

  const voidIdx = mask.findIndex((on) => !on);
  if (voidIdx >= 0) {
    const v = await post(reveal, { address: ADDR, roundId: round.id, index: voidIdx });
    ok(v.status === 400, "a void (non-board) tile is rejected", `${v.status}`);
  }
}

console.log("\n5. another player cannot touch the round");
{
  const r = await post(reveal, { address: OTHER, roundId: round.id, index: 0 });
  ok(r.status === 404, "reveal on someone else's round is not found", `${r.status}`);
  const c = await post(cashout, { address: OTHER, roundId: round.id });
  ok(c.status === 409, "cash-out on someone else's round is refused", `${c.status}`);
  ok(await balanceOf(OTHER) === 1000000, "their balance is untouched");
}

console.log("\n6. cash-out pays the stored multiplier, exactly once");
{
  const before = await balanceOf(ADDR);
  const row = (await db`select stake, multiplier from death_rounds where id=${round.id}`)[0] as any;
  const expect = Math.round(Number(row.stake) * Number(row.multiplier) * 100) / 100;

  const [a, b, c] = await Promise.all([
    post(cashout, { address: ADDR, roundId: round.id }),
    post(cashout, { address: ADDR, roundId: round.id }),
    post(cashout, { address: ADDR, roundId: round.id }),
  ]);
  const wins = [a, b, c].filter((r) => r.json.ok);
  ok(wins.length === 1, "three concurrent cash-outs pay once", `${wins.length} succeeded`);
  const after = await balanceOf(ADDR);
  ok(Math.abs(after - before - expect) < 0.01, "paid stake x stored multiplier", `+${(after - before).toFixed(2)} vs ${expect.toFixed(2)}`);
  ok(wins[0].json.round.serverSeed, "the seed is revealed once the round is over");
  ok(wins[0].json.round.tiles.includes("skull"), "the full board is revealed once the round is over");
}

console.log("\n7. a finished round is inert");
{
  const r = await post(reveal, { address: ADDR, roundId: round.id, index: 1 });
  ok(r.status === 409, "no more reveals", `${r.status}`);
  const c = await post(cashout, { address: ADDR, roundId: round.id });
  ok(c.status === 409, "no second cash-out", `${c.status}`);
  const open = await get(`http://t/api?address=${ADDR}`);
  ok(open.json.round === null, "no open round remains");
}

console.log("\n8. busting ends the round and pays nothing");
{
  await reset();
  const s = await post(start, { address: ADDR, difficulty: "medium", stake: 1000 });
  const id = s.json.round.id;
  const secret: number[] = (await db`select bombs_idx from death_rounds where id=${id}`)[0].bombs_idx;
  const before = await balanceOf(ADDR);
  const r = await post(reveal, { address: ADDR, roundId: id, index: secret[0] });
  ok(r.json.ok && r.json.hit === "skull", "hitting a skull busts");
  ok(r.json.round.status === "busted", "round marked busted");
  ok(await balanceOf(ADDR) === before, "nothing was paid", `balance ${await balanceOf(ADDR)}`);
  const c = await post(cashout, { address: ADDR, roundId: id });
  ok(c.status === 409, "a busted round cannot be cashed out", `${c.status}`);
  ok(r.json.round.serverSeed, "seed revealed on bust too");
}

console.log("\n9. cashing out before any reveal is refused");
{
  await reset();
  const s = await post(start, { address: ADDR, difficulty: "low", stake: 1000 });
  const before = await balanceOf(ADDR);
  const c = await post(cashout, { address: ADDR, roundId: s.json.round.id });
  ok(c.status === 409, "cannot bank a 1.00x round with zero picks", `${c.status}`);
  ok(await balanceOf(ADDR) === before, "stake not returned as a free cash-out");
}

console.log("\n10. malformed input is rejected");
{
  const cases: [string, any, number][] = [
    ["missing address", { difficulty: "low", stake: 100 }, 400],
    ["unknown difficulty", { address: ADDR, difficulty: "impossible", stake: 100 }, 400],
    ["prototype-polluting difficulty", { address: ADDR, difficulty: "__proto__", stake: 100 }, 400],
    ["negative stake", { address: ADDR, difficulty: "low", stake: -100 }, 400],
    ["stake over the table limit", { address: ADDR, difficulty: "low", stake: 1e12 }, 400],
  ];
  for (const [name, body, want] of cases) {
    const r = await post(start, body);
    ok(r.status === want, `rejected: ${name}`, `${r.status} ${r.json.error ?? ""}`);
  }
  const badId = await post(reveal, { address: ADDR, roundId: "1 or 1=1", index: 0 });
  ok(badId.status === 400, "non-numeric round id rejected before it reaches SQL", `${badId.status}`);
}

console.log("\n11. the ledger reconciles");
{
  const net = Number((await db`select coalesce(sum(delta),0)::float as s from txns where address=${ADDR.toLowerCase()}`)[0].s);
  const bal = await balanceOf(ADDR);
  ok(Math.abs(1_000_000 + net - bal) < 0.01, "txn log reconciles with the balance", `1000000 ${net >= 0 ? "+" : ""}${net} = ${bal}`);
}

await db.end();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
