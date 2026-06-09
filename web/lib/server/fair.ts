import { createHash, createHmac, randomBytes } from "crypto";
import { getSql } from "./db";

// Provably-fair RNG. The server commits to a secret serverSeed by publishing its
// SHA-256 hash up front. Each roll = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)
// with an incrementing nonce. Players can later be shown the serverSeed to verify
// every past roll. The client may set its own clientSeed to co-author randomness.

const norm = (a: string) => a.toLowerCase();

export type SeedInfo = { hash: string; clientSeed: string; nonce: number };

export async function getOrCreateSeed(address: string): Promise<SeedInfo> {
  const db = getSql();
  const a = norm(address);
  const rows = await db`select server_seed_hash, client_seed, nonce from fair_seeds where address=${a}`;
  if (rows.length) return { hash: rows[0].server_seed_hash, clientSeed: rows[0].client_seed, nonce: Number(rows[0].nonce) };
  const serverSeed = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(serverSeed).digest("hex");
  await db`insert into fair_seeds (address, server_seed, server_seed_hash) values (${a}, ${serverSeed}, ${hash}) on conflict (address) do nothing`;
  const again = await db`select server_seed_hash, client_seed, nonce from fair_seeds where address=${a}`;
  return { hash: again[0].server_seed_hash, clientSeed: again[0].client_seed, nonce: Number(again[0].nonce) };
}

export async function setClientSeed(address: string, clientSeed: string): Promise<void> {
  const db = getSql();
  await db`update fair_seeds set client_seed=${clientSeed.slice(0, 64)} where address=${norm(address)}`;
}

export type Roll = { roll: number; nonce: number; hash: string };

// Atomically consume a nonce and return a uniform roll in [0, range).
export async function nextRoll(address: string, range = 10_000): Promise<Roll> {
  const db = getSql();
  const a = norm(address);
  await getOrCreateSeed(address);
  const rows = await db`update fair_seeds set nonce = nonce + 1 where address=${a} returning server_seed, server_seed_hash, client_seed, nonce`;
  const { server_seed, server_seed_hash, client_seed, nonce } = rows[0];
  const digest = createHmac("sha256", server_seed).update(`${client_seed}:${nonce}`).digest();
  const n = digest.readUInt32BE(0); // 32-bit uniform
  return { roll: n % range, nonce: Number(nonce), hash: server_seed_hash };
}
