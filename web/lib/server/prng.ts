import { createHash, createHmac } from "crypto";

// Deterministic PRNG for provably-fair board generation.
//
// The stream is HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${counter}`)
// with counter incrementing as bytes are consumed — the standard commit-reveal
// construction. Two properties matter and both come from that shape:
//
//   · The server commits to sha256(serverSeed) *before* the round. It cannot
//     then pick a board after seeing the player's taps, because the seed that
//     generates the board is already fixed by the published hash.
//   · The player can co-author the randomness with their own clientSeed, so the
//     server cannot pre-compute a bad board for a specific player either.
//
// After the round the serverSeed is published, and anyone can replay this
// function to re-derive the exact board and check it was the one committed to.
//
// The seed is per-round rather than per-account precisely so it is safe to
// reveal the moment the round ends. A long-lived seed would have to survive
// until a rotation, which means either revealing it late or revealing it while
// it still governs future rounds.

/** Bytes → floats in [0,1), consumed lazily from an HMAC counter stream. */
export function seededRng(serverSeed: string, clientSeed: string, nonce: number): () => number {
  let counter = 0;
  let buf = Buffer.alloc(0);
  let offset = 0;

  const refill = () => {
    buf = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:${counter}`).digest();
    counter++;
    offset = 0;
  };

  return () => {
    if (offset + 4 > buf.length) refill();
    // 32 bits → [0,1). Dividing by 2^32 keeps the distribution uniform and the
    // result independent of float rounding at the top of the range.
    const v = buf.readUInt32BE(offset) / 4294967296;
    offset += 4;
    return v;
  };
}

export function seedHash(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}
