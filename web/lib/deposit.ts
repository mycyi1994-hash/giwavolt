import { keccak256, toBytes } from "viem";

// Polymarket-style flow: connecting a wallet derives a dedicated DEPOSIT
// ADDRESS. Users send USDC there once; the off-chain game balance is credited
// and play happens instantly with no per-action signatures. (Demo derives a
// deterministic mock address; a real build would create a per-user proxy /
// smart account and a deposit watcher + on-chain settlement.)
export function depositAddressFor(addr?: string): `0x${string}` | null {
  if (!addr) return null;
  const h = keccak256(toBytes(addr as `0x${string}`));
  return ("0x" + h.slice(-40)) as `0x${string}`;
}

// deterministic faux-QR matrix (decorative) from an address
export function faux(addr: string, size = 11): boolean[] {
  const h = keccak256(toBytes(addr as `0x${string}`)).slice(2);
  const cells = size * size;
  const out: boolean[] = [];
  for (let i = 0; i < cells; i++) {
    const nib = parseInt(h[i % h.length], 16);
    out.push((nib + i) % 3 === 0);
  }
  return out;
}
