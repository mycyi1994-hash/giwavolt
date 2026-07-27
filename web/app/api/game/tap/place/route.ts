import { reqAddress, reqAmount, readBody, json, err, rateLimit } from "@/lib/server/api";
import { ensureAccount, debit } from "@/lib/server/ledger";
import { getSql } from "@/lib/server/db";
import { quote } from "@/lib/server/oracle";
import { cellMultiplier, bandStep, snapToBand } from "@/lib/grid";
import { MAX_STAKE } from "@/lib/limits";
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
  if (stake > MAX_STAKE) return err("stake exceeds the table limit");
  if (!rateLimit(`tap:place:${address.toLowerCase()}`, 240, 60_000)) return err("too many requests", 429);

  const colT = body?.colT;
  const lo = body?.lo;
  const hi = body?.hi;
  if (typeof colT !== "number" || !isColumnTime(colT)) return err("colT must sit on the column grid");
  if (typeof lo !== "number" || typeof hi !== "number" || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo || lo <= 0) {
    return err("bad price band");
  }

  if ((colT - Date.now()) / 1000 > MAX_BET_HORIZON_SEC) return err("column is too far out");

  // The server's own price and volatility. No quote, no bet — we do not fall
  // back to a default, because a wrong volatility is a wrong payout.
  const q = await quote();
  if (!q) return err("price feed unavailable — betting paused", 503);

  // Measure the horizon from the quote's own timestamp, not from now. The two
  // differ by the fetch latency, and pricing a longer window than the model was
  // handed would quietly understate the volatility the bet is exposed to.
  const h = (colT - q.at) / 1000;
  if (h < MIN_BET_HORIZON_SEC) return err("column is inside the locked zone", 409);

  const step = bandStep(q.price, q.vol);
  // Width is only a sanity check that the client is drawing the same grid we
  // are; the band it actually gets is ours.
  const widthRatio = (hi - lo) / step;
  if (widthRatio < BAND_WIDTH_MIN_RATIO || widthRatio > BAND_WIDTH_MAX_RATIO) {
    return err("band does not match the current grid — refresh and retry", 409);
  }

  // Snap to the server's lattice. The client names which cell it wants by
  // pointing at it; it does not get to describe one. An arbitrary band could be
  // solved for the position the model prices worst, and the tails are exactly
  // where a volatility error is most expensive.
  const cell = snapToBand((lo + hi) / 2, q.price, step);

  // The quote is a moment old by the time it is used. Charging the model for
  // that extra window means a stale centre cannot be arbitraged against a
  // player watching a faster feed than ours.
  const hEff = h + q.ageMs / 1000;
  const mult = cellMultiplier(cell.lo - q.price, cell.hi - q.price, hEff, q.price, q.vol);
  if (mult <= 0) return err("cell is not offered at the current volatility", 409);

  await ensureAccount(address);
  const db = getSql();
  const open = await db`select count(*)::int as n from tap_bets where address=${address.toLowerCase()} and status='live'`;
  if (Number(open[0]?.n ?? 0) >= MAX_OPEN_BETS) return err("too many open positions", 429);

  const balance = await debit(address, stake, "bet", "tap");
  if (balance === null) return err("insufficient balance", 402);

  const rows = await db`
    insert into tap_bets (address, stake, mult, band_lo, band_hi, col_t, quote_price, quote_vol, quote_source)
    values (${address.toLowerCase()}, ${stake}, ${mult}, ${cell.lo}, ${cell.hi}, ${colT}, ${q.price}, ${q.vol}, ${q.source})
    returning id`;

  // The quote itself (price, volatility, venue) is stored for audit but not
  // returned: echoing it hands a caller a free measurement of how far behind
  // the market this server is, which is precisely what a latency play needs.
  return json({ ok: true, id: String(rows[0].id), mult, colT, lo: cell.lo, hi: cell.hi, balance });
}
