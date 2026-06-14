import { reqAddress, json, err } from "@/lib/server/api";
import { getBalance } from "@/lib/server/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = reqAddress(new URL(req.url).searchParams.get("address"));
  if (!address) return err("valid address required");
  return json({ balance: await getBalance(address) });
}
