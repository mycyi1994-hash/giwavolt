import { reqAddress, readBody, json, err, rateLimit } from "@/lib/server/api";
import { getRound, toPublic, type DeathRow } from "@/lib/server/death";
import { getSql } from "@/lib/server/db";
import { multiplierAfter } from "@/lib/death";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open one tile.
//
// Whether it hides a skull was decided when the round was dealt, from a seed
// the server had already committed to. This route only looks the answer up — it
// cannot choose it, and neither can the caller.
export async function POST(req: Request) {
  const body = await readBody<{ address?: string; roundId?: string; index?: number }>(req);
  const address = reqAddress(body?.address);
  if (!address) return err("valid address required");
  if (typeof body?.roundId !== "string" || !/^\d+$/.test(body.roundId)) return err("bad round id");
  const index = body?.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return err("bad tile index");
  if (!rateLimit(`death:reveal:${address.toLowerCase()}`, 600, 60_000)) return err("too many requests", 429);

  const round = await getRound(address, body.roundId);
  if (!round) return err("round not found", 404);
  if (round.status !== "playing") return err("round is already finished", 409);
  if (index >= round.mask.length || !round.mask[index]) return err("tile is not on the board");
  if ((round.revealed ?? []).includes(index)) return err("tile already open", 409);

  const total = round.mask.reduce((n, on) => (on ? n + 1 : n), 0);
  const isSkull = (round.bombs_idx ?? []).includes(index);
  const db = getSql();

  // `picks` in the guard is optimistic concurrency: if a second reveal landed
  // between the read above and this write, the row no longer matches and this
  // request is told to retry rather than overwriting the other one's result.
  const updated = (
    isSkull
      ? await db`
          update death_rounds
             set status='busted', cashout=0, settled_at=now(),
                 revealed = revealed || to_jsonb(${index}::int)
           where id=${round.id} and address=${address.toLowerCase()}
             and status='playing' and picks=${round.picks}
             and not (revealed @> to_jsonb(${index}::int))
          returning *`
      : await db`
          update death_rounds
             set picks = picks + 1,
                 multiplier = ${multiplierAfter(round.picks + 1, round.bombs, total)},
                 revealed = revealed || to_jsonb(${index}::int)
           where id=${round.id} and address=${address.toLowerCase()}
             and status='playing' and picks=${round.picks}
             and not (revealed @> to_jsonb(${index}::int))
          returning *`
  ) as unknown as DeathRow[];

  if (!updated.length) return err("board moved on — reload the round", 409);

  return json({ ok: true, hit: isSkull ? "skull" : "safe", round: toPublic(updated[0]) });
}
