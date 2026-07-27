import { reqAddress, reqAmount, readBody, json, err, rateLimit } from "@/lib/server/api";
import { ensureAccount, debit } from "@/lib/server/ledger";
import { createRound, getOpenRound, isDifficulty, toPublic } from "@/lib/server/death";
import { MAX_STAKE } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deal a Death Fun round.
//
// The board is generated here and its skull positions stay here. The response
// carries the board *shape* and a commitment to the seed that produced it — so
// the player knows the board was fixed before their first tap, without knowing
// what it is.
export async function POST(req: Request) {
  const body = await readBody<{ address?: string; difficulty?: string; stake?: number; clientSeed?: string }>(req);
  const address = reqAddress(body?.address);
  const stake = reqAmount(body?.stake);
  if (!address) return err("valid address required");
  if (stake === null) return err("stake must be positive");
  if (stake > MAX_STAKE) return err("stake exceeds the table limit");
  if (!isDifficulty(body?.difficulty)) return err("unknown difficulty");
  if (!rateLimit(`death:start:${address.toLowerCase()}`, 120, 60_000)) return err("too many requests", 429);

  // One live round per player. Without this a player could deal boards until
  // they found a favourable one and abandon the rest.
  const open = await getOpenRound(address);
  if (open) return json({ ok: true, resumed: true, round: toPublic(open) });

  const clientSeed = typeof body?.clientSeed === "string" ? body.clientSeed.slice(0, 64) : "";

  await ensureAccount(address);
  const balance = await debit(address, stake, "bet", "death");
  if (balance === null) return err("insufficient balance", 402);

  const round = await createRound(address, body.difficulty, stake, clientSeed);
  return json({ ok: true, round, balance });
}
