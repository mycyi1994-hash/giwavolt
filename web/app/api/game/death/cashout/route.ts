import { reqAddress, readBody, json, err, rateLimit } from "@/lib/server/api";
import { credit } from "@/lib/server/ledger";
import { getSql } from "@/lib/server/db";
import { toPublic, type DeathRow } from "@/lib/server/death";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bank the round.
//
// The payout is stake × the multiplier stored on the row, which was written by
// the reveal route from the board's own odds — no number from the client takes
// part. The status flip is the lock: exactly one request can move a round out
// of 'playing', and only that request pays, so concurrent cash-outs can't pay
// twice.
export async function POST(req: Request) {
  const body = await readBody<{ address?: string; roundId?: string }>(req);
  const address = reqAddress(body?.address);
  if (!address) return err("valid address required");
  if (typeof body?.roundId !== "string" || !/^\d+$/.test(body.roundId)) return err("bad round id");
  if (!rateLimit(`death:cashout:${address.toLowerCase()}`, 120, 60_000)) return err("too many requests", 429);

  const db = getSql();
  const claimed = (await db`
    update death_rounds
       set status='stopped', cashout = round(stake * multiplier, 2), settled_at=now()
     where id=${body.roundId} and address=${address.toLowerCase()}
       and status='playing' and picks > 0
    returning *`) as unknown as DeathRow[];

  if (!claimed.length) return err("no open round to cash out", 409);

  const row = claimed[0];
  const payout = Number(row.cashout);
  const balance = payout > 0 ? await credit(address, payout, "payout", `death:${row.id}`) : undefined;

  return json({ ok: true, payout, round: toPublic(row), balance });
}
