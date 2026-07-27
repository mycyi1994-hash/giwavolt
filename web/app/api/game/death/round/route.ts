import { reqAddress, json, err } from "@/lib/server/api";
import { getOpenRound, toPublic } from "@/lib/server/death";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resume whatever round the player left open. Closing the tab mid-round used to
// mean the stake was simply gone; the round lives in the DB now, so it can be
// picked back up. Returns the same redacted view as everything else — an
// unopened tile is "hidden" here too.
export async function GET(req: Request) {
  const address = reqAddress(new URL(req.url).searchParams.get("address"));
  if (!address) return err("valid address required");
  const open = await getOpenRound(address);
  return json({ ok: true, round: open ? toPublic(open) : null });
}
