// Aesthetic skull-placement patterns for Death Fun. We score every cell with a
// randomly-chosen "field" function (ring, diamond, star, spiral, stripes, …)
// plus random params + rotation + jitter, then take the top-N cells. This
// yields an exact bomb count AND a recognisable shape — 100s of pretty,
// distinct boards (revealed when you bust or cash out).

type Params = {
  R: number;
  A: number;
  k: number;
  freq: number;
  phase: number;
  phase2: number;
  coil: number;
  step: number;
};

// each field: higher score ⇒ more likely a skull. u,v ∈ [-1,1] (rotated).
const FIELDS: ((u: number, v: number, p: Params, x: number, y: number) => number)[] = [
  (u, v, p) => -Math.abs(Math.hypot(u, v) - p.R), // ring
  (u, v) => -Math.hypot(u, v), // center disc
  (u, v) => Math.hypot(u, v), // outer / border
  (u, v, p) => -Math.abs(Math.abs(u) + Math.abs(v) - p.R), // diamond
  (u, v, p) => -Math.abs(Math.max(Math.abs(u), Math.abs(v)) - p.R), // square ring
  (u, v, p) => -Math.abs(Math.hypot(u, v) - (p.R + p.A * Math.cos(p.k * Math.atan2(v, u)))), // star
  (u, v) => -Math.min(Math.abs(u), Math.abs(v)), // plus / cross
  (u, v) => -Math.min(Math.abs(u - v), Math.abs(u + v)) / 1.414, // X
  (u, _v, p) => Math.cos(p.freq * u * Math.PI + p.phase), // vertical stripes
  (_u, v, p) => Math.cos(p.freq * v * Math.PI + p.phase), // horizontal stripes
  (u, v, p) => Math.cos(Math.hypot(u, v) * p.freq * 6.283 + p.phase), // concentric waves
  (u, v, p) => Math.cos(p.k * Math.atan2(v, u) + Math.hypot(u, v) * p.coil * 6.283 + p.phase), // spiral
  (_u, _v, p, x, y) => ((Math.floor(x / p.step) + Math.floor(y / p.step)) % 2 ? 1 : -1), // checker
  (u, v) => -Math.min(Math.hypot(u - 1, v - 1), Math.hypot(u + 1, v - 1), Math.hypot(u - 1, v + 1), Math.hypot(u + 1, v + 1)), // corners
  (_u, _v, p, x, y) => (x % (p.step + 1) === 0 && y % (p.step + 1) === 0 ? 1 : -1), // dot grid
  (u, v, p) => Math.sin(p.freq * u * Math.PI + p.phase) + Math.sin(p.freq * v * Math.PI + p.phase2), // interference
];

export function generateBombMask(dim: number, count: number): number[] {
  const N = dim * dim;
  count = Math.max(1, Math.min(N - 1, count));
  const rot = Math.random() * Math.PI;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const field = FIELDS[Math.floor(Math.random() * FIELDS.length)];
  const p: Params = {
    R: 0.25 + Math.random() * 0.7,
    A: 0.1 + Math.random() * 0.45,
    k: 2 + Math.floor(Math.random() * 7),
    freq: 1 + Math.random() * 5,
    phase: Math.random() * Math.PI * 2,
    phase2: Math.random() * Math.PI * 2,
    coil: 1 + Math.random() * 5,
    step: 1 + Math.floor(Math.random() * 3),
  };

  const scored: { i: number; s: number }[] = [];
  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const u = ((x + 0.5) / dim) * 2 - 1;
      const v = ((y + 0.5) / dim) * 2 - 1;
      const ru = u * cos - v * sin;
      const rv = u * sin + v * cos;
      const s = field(ru, rv, p, x, y) + (Math.random() - 0.5) * 0.06;
      scored.push({ i: y * dim + x, s });
    }
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, count).map((o) => o.i);
}
