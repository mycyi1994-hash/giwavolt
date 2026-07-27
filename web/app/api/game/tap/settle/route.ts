import { reqAddress, readBody, json, err, rateLimit } from "@/lib/server/api";
import { credit, getBalance } from "@/lib/server/ledger";
import { getSql } from "@/lib/server/db";
import { priceAt } from "@/lib/server/oracle";
import { VOID_MIN_AGE_MS, VOID_MIN_ATTEMPTS, VOID_MIN_ATTEMPT_SPAN_MS } from "@/lib/tap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  stake: string;
  mult: string;
  band_lo: string;
  band_hi: string;
  col_t: string;
  settle_attempts: number;
  first_attempt_at: string | null;
};

// Settle every Tap position that has come due.
//
// The outcome is decided against the exchange's published price at the bet's
// settlement instant — not against anything the browser reports, and not
// against a price this server merely remembers. A player can re-query the same
// public endpoint for the same second and check the result.
//
// If that price can't be fetched, the bet is left alone and retried; only after
// it has been unresolvable for a while is it voided and the stake returned.
// Guessing an outcome would be worse than being late with it.
export async function POST(req: Request) {
  const body = await readBody<{ address?: string }>(req);
  const address = reqAddress(body?.address);
  if (!address) return err("valid address required");
  if (!rateLimit(`tap:settle:${address.toLowerCase()}`, 240, 60_000)) return err("too many requests", 429);

  const db = getSql();
  const a = address.toLowerCase();
  const now = Date.now();

  const due = (await db`
    select id, stake, mult, band_lo, band_hi, col_t, settle_attempts, first_attempt_at
      from tap_bets
     where address=${a} and status='live' and col_t <= ${now}
     order by col_t asc
     limit 40`) as unknown as Row[];

  const settled: { id: string; status: "won" | "lost" | "void"; payout: number; settlePrice: number | null }[] = [];

  for (const row of due) {
    const colT = Number(row.col_t);
    const stake = Number(row.stake);
    const mult = Number(row.mult);
    const lo = Number(row.band_lo);
    const hi = Number(row.band_hi);

    const fill = await priceAt(colT);

    if (!fill) {
      // Record the failure. A void refunds the stake, and the player chooses
      // when to ask, so it must take sustained failure rather than one badly
      // timed fetch — otherwise "retry until the oracle blinks" turns a losing
      // bet into a refund.
      const tracked = (await db`
        update tap_bets
           set settle_attempts = settle_attempts + 1,
               first_attempt_at = coalesce(first_attempt_at, now())
         where id=${row.id} and status='live'
        returning settle_attempts, first_attempt_at`) as unknown as Row[];
      if (!tracked.length) continue;

      const attempts = Number(tracked[0].settle_attempts);
      const firstAt = tracked[0].first_attempt_at ? new Date(tracked[0].first_attempt_at).getTime() : now;
      const ripe =
        now - colT >= VOID_MIN_AGE_MS &&
        attempts >= VOID_MIN_ATTEMPTS &&
        now - firstAt >= VOID_MIN_ATTEMPT_SPAN_MS;
      if (!ripe) continue;

      // Claim the row before refunding so a concurrent request can't refund twice.
      const claimed = await db`
        update tap_bets set status='void', settled_at=now(), payout=${stake}
         where id=${row.id} and status='live' returning id`;
      if (!claimed.length) continue;
      await credit(address, stake, "payout", `tap:void:${row.id}`);
      settled.push({ id: String(row.id), status: "void", payout: stake, settlePrice: null });
      continue;
    }

    const win = fill.price >= lo && fill.price < hi;
    const payout = win ? Math.round(stake * mult * 100) / 100 : 0;

    const claimed = await db`
      update tap_bets
         set status=${win ? "won" : "lost"},
             settle_price=${fill.price},
             settle_source=${fill.source},
             payout=${payout},
             settled_at=now()
       where id=${row.id} and status='live'
      returning id`;
    if (!claimed.length) continue; // another request got there first

    if (payout > 0) await credit(address, payout, "payout", `tap:${row.id}`);
    settled.push({ id: String(row.id), status: win ? "won" : "lost", payout, settlePrice: fill.price });
  }

  const openRows = await db`select count(*)::int as n from tap_bets where address=${a} and status='live'`;

  return json({
    ok: true,
    settled,
    open: Number(openRows[0]?.n ?? 0),
    balance: await getBalance(address),
  });
}
