import { reqAddress, reqAmount, readBody, json, err, rateLimit } from "@/lib/server/api";
import { ensureAccount, debit, credit } from "@/lib/server/ledger";
import { nextRoll, setClientSeed } from "@/lib/server/fair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BPS = 10_000;
const EDGE_BPS = 700; // 7% house edge

// Server-authoritative Tap bet. The tapped cell's multiplier sets the win
// chance; the SERVER rolls (provably-fair) and settles. The browser only learns
// the result — it can't fake a win or set its own balance.
export async function POST(req: Request) {
  const body = await readBody<{ address?: string; stake?: number; mult?: number; clientSeed?: string }>(req);
  const address = reqAddress(body?.address);
  const stake = reqAmount(body?.stake);
  if (!address) return err("valid address required");
  if (stake === null) return err("stake must be positive");
  if (typeof body?.mult !== "number" || !(body.mult > 1)) return err("bad multiplier");
  if (!rateLimit(`tap:${address.toLowerCase()}`, 240, 60_000)) return err("too many requests", 429);

  const winChanceBps = Math.round((BPS - EDGE_BPS) / body.mult);
  if (winChanceBps < 1 || winChanceBps >= BPS) return err("odds out of range");

  await ensureAccount(address);
  if (body.clientSeed && typeof body.clientSeed === "string") await setClientSeed(address, body.clientSeed);

  // Take the stake first (atomic, can't go negative).
  const afterStake = await debit(address, stake, "bet", "tap");
  if (afterStake === null) return err("insufficient balance", 402);

  const r = await nextRoll(address, BPS);
  const win = r.roll < winChanceBps;
  const payout = win ? Math.round(stake * body.mult * 100) / 100 : 0;
  const balance = win ? await credit(address, payout, "payout", "tap") : afterStake;

  return json({ ok: true, win, payout, balance, roll: r.roll, winChanceBps, nonce: r.nonce, serverSeedHash: r.hash });
}
