import { reqAddress, readBody, json, err, rateLimit } from "@/lib/server/api";
import { claim } from "@/lib/server/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Off-chain faucet: credits the player's game balance with play-money tKRW.
// No on-chain transfer, no signature, no gas.
const CLAIM_TKRW = Number(process.env.FAUCET_DRIP_TKRW ?? 1_000_000);
const CLAIM_COOLDOWN_MS = Number(process.env.FAUCET_COOLDOWN_MS ?? 0); // 0 = no cooldown (demo)

export async function POST(req: Request) {
  const body = await readBody<{ address?: string }>(req);
  const address = reqAddress(body?.address);
  if (!address) return err("valid address required");
  if (!rateLimit(`claim:${address.toLowerCase()}`, 20, 60_000)) return err("too many requests — slow down", 429);

  const res = await claim(address, CLAIM_TKRW, CLAIM_COOLDOWN_MS);
  if (!res.ok) return err(res.error, 429);
  return json({ ok: true, balance: res.balance, claimed: CLAIM_TKRW });
}
