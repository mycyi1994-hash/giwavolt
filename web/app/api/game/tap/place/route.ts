import { reqAddress, reqAmount, readBody, json, err, rateLimit } from "@/lib/server/api";
import { ensureAccount, debit } from "@/lib/server/ledger";
import { getSql } from "@/lib/server/db";
import { quote } from "@/lib/server/oracle";
import { cellMultiplier, bandStep } from "@/lib/grid";
import {
  isColumnTime,
  MIN_BET_HORIZON_SEC,
  MAX_BET_HORIZON_SEC,
  BAND_WIDTH_MIN_RATIO,
  BAND_WIDTH_MAX_RATIO,
  MAX_OPEN_BETS,
} from "@/lib/tap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open a Tap position.
//
// The browser proposes a cell — a settlement time and a price band — and
// nothing more. The multiplier is computed here from the server's own read of
// the market, so a client that lies about the odds it saw simply gets the real
// ones back. The stake is debited atomically before the bet exists, so a
// position can never be opened on money that isn't there.
export async function POST(req: Request) {
  const body = await readBody<{ address?: string; stake?: number; colT?: number; lo?: number; hi?: number }>(req);
  const address = reqAddress(body?.address);
  const stake = reqAmount(body?.stake);
  if (!address) return err("valid address required");
  if (stake === null) return err("stake must be positive");
  if (!rateLimit(`tap:place:${address.toLowerCase()}`, 240, 60_000)) return err("too many requests", 429);

  const colT = body?.colT;
  const lo = body?.lo;
  const hi = body?.hi;
  if (typeof colT !== "number" || !isColumnTime(colT)) return err("colT must sit on the column grid");
  if (typeof lo !== "number" || typeof hi !== "number" || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo || lo <= 0) {
    return err("bad price band");
  }

  const h = (colT - Date.now()) / 1000;
  if (h < MIN_BET_HORIZON_SEC) return err("column is inside the locked zone", 409);
  if (h > MAX_BET_HORIZON_SEC) return err("column is too far out");

  // The server's own price and volatility. No quote, no bet — we do not fall
  // back to a default, because a wrong volatility is a wrong payout.
  const q = await quote();
  if (!q) return err("price feed unavailable — betting paused", 503);

  const step = bandStep(q.price, q.vol);
  const widthRatio = (hi - lo) / step;
  if (widthRatio < BAND_WIDTH_MIN_RATIO || widthRatio > BAND_WIDTH_MAX_RATIO) {
    return err("band does not match the current grid — refresh and retry", 409);
  }

  const mult = cellMultiplier(lo - q.price, hi - q.price, h, q.price, q.vol);
  if (mult <= 0) return err("cell is not offered at the current volatility", 409);

  await ensureAccount(address);
  const db = getSql();
  const open = await db`select count(*)::int as n from tap_bets where address=${address.toLowerCase()} and status='live'`;
  if (Number(open[0]?.n ?? 0) >= MAX_OPEN_BETS) return err("too many open positions", 429);

  const balance = await debit(address, stake, "bet", "tap");
  if (balance === null) return err("insufficient balance", 402);

  const rows = await db`
    insert into tap_bets (address, stake, mult, band_lo, band_hi, col_t, quote_price, quote_vol, quote_source)
    values (${address.toLowerCase()}, ${stake}, ${mult}, ${lo}, ${hi}, ${colT}, ${q.price}, ${q.vol}, ${q.source})
    returning id`;

  return json({
    ok: true,
    id: String(rows[0].id),
    mult,
    colT,
    lo,
    hi,
    price: q.price,
    vol: q.vol,
    source: q.source,
    balance,
  });
}
