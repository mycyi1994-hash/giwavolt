import { reqAddress, readBody, json, err, rateLimit } from "@/lib/server/api";
import { adjustBalance } from "@/lib/server/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client-reported balance delta (legacy demo path; superseded by the
// server-authoritative /api/game/* endpoints). NOTE: cheatable by design — used
// only on testnet while the games are repointed to server settlement.
export async function POST(req: Request) {
  const body = await readBody<{ address?: string; delta?: number }>(req);
  const address = reqAddress(body?.address);
  if (!address) return err("valid address required");
  if (typeof body?.delta !== "number" || !Number.isFinite(body.delta)) return err("delta must be a number");
  if (!rateLimit(`adjust:${address.toLowerCase()}`, 240, 60_000)) return err("too many requests", 429);

  const balance = await adjustBalance(address, body.delta);
  return json({ ok: true, balance });
}
