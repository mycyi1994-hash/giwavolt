// Board SHAPE generator for Death Fun. The playable board is a shape (disc,
// diamond, heart, star, hexagon, triangle, ring, …) carved out of a dim×dim
// grid — NOT always a full square. Cells outside the shape are "void" (gaps).
// Skulls are then placed RANDOMLY among the in-shape cells (see lib/death.ts).

type P = { R: number; R0: number; w: number; A: number; k: number; t: number };
type ShapeFn = (u: number, v: number, p: P) => boolean;

const SHAPES: ShapeFn[] = [
  (u, v, p) => Math.hypot(u, v) <= p.R, // disc
  (u, v, p) => Math.hypot(u * 1.25, v) <= p.R, // wide ellipse
  (u, v, p) => Math.abs(u) + Math.abs(v) <= p.R * 1.35, // diamond
  (u, v, p) => Math.max(Math.abs(u), Math.abs(v) * 0.92, Math.abs(u * 0.5 + v * 0.866), Math.abs(u * 0.5 - v * 0.866)) <= p.R, // hexagon
  (u, v, p) => {
    // star
    const r = Math.hypot(u, v);
    const th = Math.atan2(v, u);
    return r <= p.R * 0.78 + p.A * Math.cos(p.k * th);
  },
  (u, v, p) => {
    // flower / gear (rounded petals)
    const r = Math.hypot(u, v);
    const th = Math.atan2(v, u);
    return r <= p.R * 0.85 + p.A * 0.7 * Math.cos(p.k * th);
  },
  (u, v, p) => {
    // heart
    const x = u * 1.35;
    const y = -v * 1.3 + 0.35;
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0 && Math.hypot(u, v) <= p.R + 0.2;
  },
  (u, v, p) => {
    // upward triangle
    const s = p.R * 1.1;
    return v <= s * 0.7 && v >= -u - s * 0.1 && v >= u - s * 0.1;
  },
  (u, v, p) => Math.abs(Math.hypot(u, v) - p.R0) <= p.w, // ring (with a hole)
  (u, v, p) => Math.abs(u) <= p.t * 2.2 || Math.abs(v) <= p.t * 2.2, // plus / cross
];

export function generateShapeMask(dim: number): boolean[] {
  const N = dim * dim;
  if (dim <= 4) return new Array(N).fill(true); // too small for shapes

  for (let attempt = 0; attempt < 10; attempt++) {
    const rot = Math.random() * Math.PI;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const fn = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const p: P = {
      R: 0.85 + Math.random() * 0.35,
      R0: 0.45 + Math.random() * 0.35,
      w: 0.28 + Math.random() * 0.22,
      A: 0.2 + Math.random() * 0.4,
      k: 3 + Math.floor(Math.random() * 6),
      t: 0.16 + Math.random() * 0.18,
    };
    const mask = new Array<boolean>(N).fill(false);
    let count = 0;
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const u = ((x + 0.5) / dim) * 2 - 1;
        const v = ((y + 0.5) / dim) * 2 - 1;
        const ru = u * cos - v * sin;
        const rv = u * sin + v * cos;
        if (fn(ru, rv, p)) {
          mask[y * dim + x] = true;
          count++;
        }
      }
    }
    if (count >= Math.max(6, Math.floor(N * 0.32))) return mask;
  }
  return new Array(N).fill(true); // fallback to full square
}
