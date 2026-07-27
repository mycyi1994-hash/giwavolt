import { randomBytes } from "crypto";
import { getSql } from "./db";
import { seededRng, seedHash } from "./prng";
import { newBoard, multiplierAfter, DIFFICULTIES } from "@/lib/death";
import type { Difficulty, DeathTile } from "@/lib/types";

// Server-side Death Fun. The board is dealt here, from a seed committed to
// before the player's first tap, and the skull positions never leave this
// module until the round is over.

export type PublicRound = {
  id: string;
  difficulty: Difficulty;
  dim: number;
  stake: number;
  bombs: number;
  total: number;
  picks: number;
  multiplier: number;
  nextMultiplier: number;
  status: "playing" | "busted" | "stopped";
  cashout: number;
  /** Board as the browser may see it. Never contains an unopened skull. */
  tiles: DeathTile[];
  /** Commitment published up front; the seed itself only after the round ends. */
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  serverSeed?: string;
};

type Row = {
  id: string;
  address: string;
  difficulty: string;
  dim: number;
  stake: string;
  bombs: number;
  bombs_idx: number[];
  mask: boolean[];
  revealed: number[];
  picks: number;
  multiplier: string;
  status: string;
  cashout: string;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: string;
};

export const isDifficulty = (v: unknown): v is Difficulty =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(DIFFICULTIES, v);

const countPlayable = (mask: boolean[]) => mask.reduce((n, on) => (on ? n + 1 : n), 0);

/**
 * Project a round into what the browser is allowed to know.
 *
 * While the round is live this returns the mask, the tiles the player has
 * already opened, and nothing else — an unopened tile is "hidden" whether or
 * not it hides a skull. Only once the round is settled does the full board and
 * the server seed come out, which is what makes the result checkable without
 * making it exploitable.
 */
export function toPublic(row: Row): PublicRound {
  const done = row.status !== "playing";
  const revealed = new Set(row.revealed ?? []);
  const bombs = new Set(row.bombs_idx ?? []);
  const total = countPlayable(row.mask);

  const tiles: DeathTile[] = row.mask.map((on, i) => {
    if (!on) return "void";
    if (revealed.has(i)) return bombs.has(i) ? "skull" : "safe";
    if (done) return bombs.has(i) ? "skull" : "safe";
    return "hidden";
  });

  return {
    id: String(row.id),
    difficulty: row.difficulty as Difficulty,
    dim: row.dim,
    stake: Number(row.stake),
    bombs: row.bombs,
    total,
    picks: row.picks,
    multiplier: Number(row.multiplier),
    nextMultiplier: multiplierAfter(row.picks + 1, row.bombs, total),
    status: row.status as PublicRound["status"],
    cashout: Number(row.cashout),
    tiles,
    serverSeedHash: row.server_seed_hash,
    clientSeed: row.client_seed,
    nonce: Number(row.nonce),
    ...(done ? { serverSeed: row.server_seed } : {}),
  };
}

/** Deal a new round. The seed is fresh per round so it is safe to publish later. */
export async function createRound(
  address: string,
  difficulty: Difficulty,
  stake: number,
  clientSeed: string
): Promise<PublicRound> {
  const db = getSql();
  const a = address.toLowerCase();
  const serverSeed = randomBytes(32).toString("hex");
  const hash = seedHash(serverSeed);

  const nonceRow = await db`select count(*)::int as n from death_rounds where address=${a}`;
  const nonce = Number(nonceRow[0]?.n ?? 0);

  const board = newBoard("real", difficulty, seededRng(serverSeed, clientSeed, nonce));
  const mask = board.tiles.map((t) => t !== "void");

  const rows = (await db`
    insert into death_rounds (address, difficulty, dim, stake, bombs, bombs_idx, mask,
                             server_seed, server_seed_hash, client_seed, nonce)
    values (${a}, ${difficulty}, ${board.dim}, ${stake}, ${board.bombs},
            ${db.json(board.bombsIdx)}, ${db.json(mask)},
            ${serverSeed}, ${hash}, ${clientSeed}, ${nonce})
    returning *`) as unknown as Row[];

  return toPublic(rows[0]);
}

export async function getOpenRound(address: string): Promise<Row | null> {
  const db = getSql();
  const rows = (await db`
    select * from death_rounds
     where address=${address.toLowerCase()} and status='playing'
     order by id desc limit 1`) as unknown as Row[];
  return rows[0] ?? null;
}

export async function getRound(address: string, id: string): Promise<Row | null> {
  const db = getSql();
  // Scoped to the address so a round id from another account is simply not found.
  const rows = (await db`
    select * from death_rounds where id=${id} and address=${address.toLowerCase()}`) as unknown as Row[];
  return rows[0] ?? null;
}

export { type Row as DeathRow };
