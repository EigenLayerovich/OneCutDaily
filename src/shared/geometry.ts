// Pure geometry used by both the client (rendering) and the server (scoring).
// All shapes live in a unit square: x and y in [0, 1], y pointing down.

export type Pt = { x: number; y: number };
export type Ring = Pt[];
/** A shape is a set of rings. Outer rings and holes have opposite winding. */
export type Shape = { rings: Ring[] };
export type Line = { a: Pt; b: Pt };

export const signedArea = (ring: Ring): number => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
};

/** Total filled area. Holes are wound opposite to outers, so they subtract. */
export const shapeArea = (shape: Shape): number =>
  Math.abs(shape.rings.reduce((acc, r) => acc + signedArea(r), 0));

const side = (line: Line, p: Pt): number =>
  (line.b.x - line.a.x) * (p.y - line.a.y) -
  (line.b.y - line.a.y) * (p.x - line.a.x);

/**
 * Keep the part of a ring on the positive side of the line
 * (single-plane Sutherland–Hodgman). Works for concave rings: the output
 * may contain zero-width bridges, but its signed area is exact.
 */
export const clipRing = (ring: Ring, line: Line): Ring => {
  const out: Ring = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const sp = side(line, p);
    const sq = side(line, q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
};

export type Split = {
  /** Share of the shape on the positive side of the line, in percent. */
  left: number;
  /** Share on the other side, in percent. left + right = 100. */
  right: number;
};

export const splitShape = (shape: Shape, line: Line): Split => {
  const totalSigned = shape.rings.reduce((acc, r) => acc + signedArea(r), 0);
  if (Math.abs(totalSigned) < 1e-12) return { left: 0, right: 100 };
  const leftSigned = shape.rings.reduce(
    (acc, r) => acc + signedArea(clipRing(r, line)),
    0
  );
  const left = Math.min(100, Math.max(0, (leftSigned / totalSigned) * 100));
  return { left, right: 100 - left };
};

export const lineLength = (l: Line): number =>
  Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);

/** Clip an infinite line through `l` to the box [lo, hi]². */
export const extendToBox = (l: Line, lo = 0, hi = 1): Line | null => {
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  let t0 = -Infinity;
  let t1 = Infinity;
  const clip = (p: number, d: number) => {
    if (Math.abs(d) < 1e-12) return p >= lo && p <= hi;
    let ta = (lo - p) / d;
    let tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  if (!clip(l.a.x, dx) || !clip(l.a.y, dy)) return null;
  return {
    a: { x: l.a.x + dx * t0, y: l.a.y + dy * t0 },
    b: { x: l.a.x + dx * t1, y: l.a.y + dy * t1 },
  };
};

/** Polygon covering the positive side of the line inside a generous box. */
export const halfPlanePolygon = (l: Line, positive: boolean): Ring => {
  const big = 10;
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Normal pointing to the positive side (cross(d, n) > 0).
  const nx = positive ? -uy : uy;
  const ny = positive ? ux : -ux;
  const p1 = { x: l.a.x - ux * big, y: l.a.y - uy * big };
  const p2 = { x: l.a.x + ux * big, y: l.a.y + uy * big };
  return [
    p1,
    p2,
    { x: p2.x + nx * big, y: p2.y + ny * big },
    { x: p1.x + nx * big, y: p1.y + ny * big },
  ];
};

/** Unit normal pointing to the positive side of the line. */
export const lineNormal = (l: Line): Pt => {
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
};

/** Does the infinite line pass through the shape's bounding box at all? */
export const lineHitsShape = (shape: Shape, l: Line): boolean => {
  const s = splitShape(shape, l);
  return s.left > 0.05 && s.right > 0.05;
};

export const centroid = (ring: Ring): Pt => {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-12) return ring[0] ?? { x: 0.5, y: 0.5 };
  return { x: cx / (3 * a), y: cy / (3 * a) };
};

/** Centroid of the part of the shape on one side of the line (for labels). */
export const pieceCentroid = (shape: Shape, l: Line, positive: boolean): Pt => {
  const line = positive ? l : { a: l.b, b: l.a };
  let ax = 0;
  let ay = 0;
  let at = 0;
  for (const r of shape.rings) {
    const c = clipRing(r, line);
    if (c.length < 3) continue;
    const a = signedArea(c);
    const ct = centroid(c);
    ax += ct.x * a;
    ay += ct.y * a;
    at += a;
  }
  if (Math.abs(at) < 1e-9) return { x: 0.5, y: 0.5 };
  return { x: ax / at, y: ay / at };
};

const segmentsCross = (p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean => {
  const d = (a: Pt, b: Pt, c: Pt) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/** True when no two non-adjacent edges of the ring cross. */
export const isSimpleRing = (ring: Ring): boolean => {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i]!;
    const a2 = ring[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = ring[j]!;
      const b2 = ring[(j + 1) % n]!;
      if (segmentsCross(a1, a2, b1, b2)) return false;
    }
  }
  return true;
};

/** Ramer–Douglas–Peucker simplification for an open polyline. */
export const simplify = (pts: Pt[], eps: number): Pt[] => {
  if (pts.length < 3) return pts.slice();
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  let maxD = -1;
  let idx = 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const dist = Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / len;
    if (dist > maxD) {
      maxD = dist;
      idx = i;
    }
  }
  if (maxD > eps) {
    const l = simplify(pts.slice(0, idx + 1), eps);
    const r = simplify(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [first, last];
};

/** Simplify a closed loop: split at the point farthest from the start first. */
export const simplifyLoop = (pts: Pt[], eps: number): Pt[] => {
  if (pts.length < 4) return pts.slice();
  const s = pts[0]!;
  let k = 1;
  let best = -1;
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d > best) {
      best = d;
      k = i;
    }
  });
  const a = simplify(pts.slice(0, k + 1), eps);
  const b = simplify(pts.slice(k).concat([s]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
};

/** Scale and centre a shape so its bounding box fits [m, 1-m]². */
export const fitShape = (shape: Shape, margin: number): Shape => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of shape.rings)
    for (const p of r) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const s = (1 - 2 * margin) / Math.max(w, h);
  const ox = 0.5 - ((minX + maxX) / 2) * s;
  const oy = 0.5 - ((minY + maxY) / 2) * s;
  const q = (v: number) => Math.round(v * 10000) / 10000;
  return {
    rings: shape.rings.map((r) => r.map((p) => ({ x: q(p.x * s + ox), y: q(p.y * s + oy) }))),
  };
};

export const ringToPath = (ring: Ring, scale = 1): string =>
  ring.length === 0
    ? ''
    : 'M' +
      ring.map((p) => `${(p.x * scale).toFixed(2)} ${(p.y * scale).toFixed(2)}`).join('L') +
      'Z';

export const shapeToPath = (shape: Shape, scale = 1): string =>
  shape.rings.map((r) => ringToPath(r, scale)).join('');
