import { fitShape, signedArea, type Pt, type Ring, type Shape } from './geometry';

// ---------- seeded randomness ----------

export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export type Rng = () => number;

export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const range = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;

// ---------- calendar ----------

/** Day #1 of One Cut. Every UTC midnight after this is a new puzzle. */
export const EPOCH_UTC = Date.UTC(2026, 10, 23); // 23 Nov 2026
const DAY_MS = 86_400_000;

export const dayNumberAt = (ms: number): number => Math.floor((ms - EPOCH_UTC) / DAY_MS) + 1;
export const dateOfDay = (day: number): Date => new Date(EPOCH_UTC + (day - 1) * DAY_MS);
export const msUntilNextDay = (ms: number): number => DAY_MS - ((ms - EPOCH_UTC) % DAY_MS);

// ---------- shape generation ----------

type BlobOpts = {
  points: number;
  /** 0 = smooth pebble, 1 = very lumpy. */
  wobble: number;
  /** Superformula symmetry; 0 disables. */
  lobes: number;
  lobeDepth: number;
};

/** A star-shaped closed curve around the origin with radius roughly 1. */
const blob = (rng: Rng, o: BlobOpts): { ring: Ring; minR: number } => {
  const harmonics = Array.from({ length: 5 }, (_, i) => ({
    k: i + 2,
    amp: (o.wobble * range(rng, 0.25, 1)) / (i + 1.6),
    phase: range(rng, 0, Math.PI * 2),
  }));
  const n1 = range(rng, 1.2, 4);
  const n23 = range(rng, 1.5, 5);
  const lobePhase = range(rng, 0, Math.PI * 2);
  const ring: Ring = [];
  let minR = Infinity;
  for (let i = 0; i < o.points; i++) {
    const t = (i / o.points) * Math.PI * 2;
    let r = 1;
    if (o.lobes > 0) {
      const m = o.lobes;
      const c = Math.abs(Math.cos((m * (t + lobePhase)) / 4)) ** n23;
      const s = Math.abs(Math.sin((m * (t + lobePhase)) / 4)) ** n23;
      const sf = (c + s) ** (-1 / n1);
      r = 1 - o.lobeDepth + o.lobeDepth * Math.min(sf, 1.6) / 1.6;
    }
    for (const h of harmonics) r += h.amp * Math.sin(h.k * t + h.phase);
    r = Math.max(0.28, r);
    minR = Math.min(minR, r);
    ring.push({ x: Math.cos(t) * r, y: Math.sin(t) * r });
  }
  return { ring, minR };
};

const transform = (ring: Ring, f: (p: Pt) => Pt): Ring => ring.map(f);

const orient = (ring: Ring, positive: boolean): Ring => {
  const a = signedArea(ring);
  return (a > 0) === positive ? ring : ring.slice().reverse();
};

export type ShapeStyle = 'pebble' | 'lumpy' | 'lobed' | 'donut' | 'twins' | 'wild';

export const makeShape = (rng: Rng, style: ShapeStyle): Shape => {
  const rot = range(rng, 0, Math.PI * 2);
  const stretch = range(rng, 0.72, 1.28);
  const affine = (p: Pt): Pt => {
    const x = p.x * stretch;
    const y = p.y / stretch;
    return { x: x * Math.cos(rot) - y * Math.sin(rot), y: x * Math.sin(rot) + y * Math.cos(rot) };
  };

  const base: Record<ShapeStyle, BlobOpts> = {
    pebble: { points: 96, wobble: 0.12, lobes: 0, lobeDepth: 0 },
    lumpy: { points: 110, wobble: 0.32, lobes: 0, lobeDepth: 0 },
    lobed: { points: 140, wobble: 0.12, lobes: pick(rng, [3, 4, 5]), lobeDepth: 0.45 },
    donut: { points: 110, wobble: 0.16, lobes: pick(rng, [0, 3, 5]), lobeDepth: 0.25 },
    twins: { points: 84, wobble: 0.2, lobes: 0, lobeDepth: 0 },
    wild: { points: 160, wobble: 0.52, lobes: pick(rng, [3, 5, 7]), lobeDepth: 0.5 },
  };
  const opts = base[style];

  if (style === 'twins') {
    const a = blob(rng, opts);
    const b = blob(rng, { ...opts, wobble: opts.wobble * 1.2 });
    const sa = range(rng, 0.7, 1);
    const sb = range(rng, 0.45, 0.75);
    const gap = range(rng, 0.25, 0.55);
    const dy = range(rng, -0.6, 0.6);
    // Separate the two islands by a vertical gap so they can never overlap.
    const aMaxX = Math.max(...a.ring.map((p) => p.x)) * sa;
    const bMinX = Math.min(...b.ring.map((p) => p.x)) * sb;
    const left = transform(a.ring, (p) => ({ x: p.x * sa - aMaxX - gap / 2, y: p.y * sa }));
    const right = transform(b.ring, (p) => ({ x: p.x * sb - bMinX + gap / 2, y: p.y * sb + dy }));
    return fitShape(
      { rings: [orient(transform(left, affine), true), orient(transform(right, affine), true)] },
      0.1
    );
  }

  const outer = blob(rng, opts);
  const rings: Ring[] = [orient(transform(outer.ring, affine), true)];
  if (style === 'donut' || (style === 'wild' && rng() < 0.4)) {
    // Hole fits inside the minimum radius, so it never pokes out.
    const hr = outer.minR * range(rng, 0.32, 0.5);
    const room = outer.minR * 0.85 - hr;
    const ang = range(rng, 0, Math.PI * 2);
    const off = range(rng, 0, Math.max(0, room));
    const hole: Ring = [];
    const hPhase = range(rng, 0, Math.PI * 2);
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const r = hr * (1 + 0.12 * Math.sin(3 * t + hPhase));
      hole.push({ x: Math.cos(ang) * off + Math.cos(t) * r, y: Math.sin(ang) * off + Math.sin(t) * r });
    }
    rings.push(orient(transform(hole, affine), false));
  }
  return fitShape({ rings }, 0.1);
};

// ---------- names, colours, goals ----------

const ADJ = [
  'Wobbly', 'Smug', 'Lopsided', 'Ancient', 'Suspicious', 'Sleepy', 'Brave', 'Grumpy',
  'Polite', 'Moody', 'Tiny', 'Majestic', 'Restless', 'Shy', 'Feral', 'Gentle',
  'Crooked', 'Bashful', 'Stubborn', 'Fancy', 'Humble', 'Chaotic', 'Lucky', 'Soggy',
  'Proud', 'Curious', 'Dramatic', 'Cozy', 'Nervous', 'Royal', 'Rustic', 'Jolly',
] as const;
const NOUN = [
  'Pancake', 'Pebble', 'Potato', 'Cloud', 'Cookie', 'Island', 'Bean', 'Dumpling',
  'Puddle', 'Comet', 'Biscuit', 'Turnip', 'Moth', 'Lagoon', 'Pretzel', 'Mitten',
  'Walnut', 'Bagel', 'Meteor', 'Blob', 'Croissant', 'Gnocchi', 'Tortilla', 'Jellyfish',
  'Boulder', 'Muffin', 'Kidney Bean', 'Planet', 'Pillow', 'Quiche', 'Lily Pad', 'Toast',
] as const;
const TWIN_NOUN = ['Twins', 'Pair', 'Duo', 'Siblings', 'Neighbours', 'Roommates'] as const;

export const PAPER = [
  { name: 'tomato', fill: '#ff6a47', ink: '#2a0f08' },
  { name: 'mustard', fill: '#f7b733', ink: '#2b1d02' },
  { name: 'sky', fill: '#7cc7ff', ink: '#05223a' },
  { name: 'bubblegum', fill: '#ff9cb6', ink: '#3a0716' },
  { name: 'lime', fill: '#c9e86f', ink: '#1d2a02' },
  { name: 'cream', fill: '#fff1d6', ink: '#2a2214' },
  { name: 'tangerine', fill: '#ff9b3d', ink: '#2e1300' },
  { name: 'mint', fill: '#8ff0c8', ink: '#032a1b' },
] as const;

export type Goal = 'half' | 'third' | 'quarter';
export const GOAL_TARGET: Record<Goal, number> = { half: 50, third: 100 / 3, quarter: 25 };
export const GOAL_LABEL: Record<Goal, string> = {
  half: 'Split it 50 / 50',
  third: 'Cut off exactly ⅓',
  quarter: 'Cut off exactly ¼',
};

export type Puzzle = {
  id: string;
  kind: 'daily' | 'custom' | 'practice';
  day: number | null;
  name: string;
  goal: Goal;
  shape: Shape;
  color: number;
  author: string | null;
  /** A short note shown under the title, e.g. "Twin Friday". */
  flavor: string;
};

/** Weekly rhythm: easy on Monday, strange by the weekend. */
const WEEK: Record<number, { style: ShapeStyle; goal: Goal; flavor: string }> = {
  1: { style: 'pebble', goal: 'half', flavor: 'Warm-up Monday' },
  2: { style: 'lumpy', goal: 'half', flavor: 'Lumpy Tuesday' },
  3: { style: 'lobed', goal: 'third', flavor: 'Third Wednesday' },
  4: { style: 'donut', goal: 'half', flavor: 'Hole-y Thursday' },
  5: { style: 'twins', goal: 'half', flavor: 'Twin Friday' },
  6: { style: 'wild', goal: 'third', flavor: 'Wild Saturday' },
  0: { style: 'wild', goal: 'half', flavor: 'Sunday Special' },
};

export const dailyPuzzle = (day: number): Puzzle => {
  const weekday = dateOfDay(day).getUTCDay();
  const plan = WEEK[weekday]!;
  const rng = mulberry32(hashString(`one-cut/daily/${day}`));
  const shape = makeShape(rng, plan.style);
  const noun = plan.style === 'twins' ? pick(rng, TWIN_NOUN) : pick(rng, NOUN);
  return {
    id: `d${day}`,
    kind: 'daily',
    day,
    name: `The ${pick(rng, ADJ)} ${noun}`,
    goal: plan.goal,
    shape,
    color: Math.floor(rng() * PAPER.length),
    author: null,
    flavor: plan.flavor,
  };
};

const STYLES: ShapeStyle[] = ['pebble', 'lumpy', 'lobed', 'donut', 'twins', 'wild'];
const GOALS: Goal[] = ['half', 'half', 'half', 'third', 'quarter'];

export const practicePuzzle = (seed: number): Puzzle => {
  const rng = mulberry32(hashString(`one-cut/practice/${seed}`));
  const style = pick(rng, STYLES);
  const shape = makeShape(rng, style);
  const noun = style === 'twins' ? pick(rng, TWIN_NOUN) : pick(rng, NOUN);
  return {
    id: `p${seed}`,
    kind: 'practice',
    day: null,
    name: `The ${pick(rng, ADJ)} ${noun}`,
    goal: pick(rng, GOALS),
    shape,
    color: Math.floor(rng() * PAPER.length),
    author: null,
    flavor: 'Practice',
  };
};

// ---------- scoring ----------

export type Tier = { name: string; stars: number; max: number };
export const TIERS: Tier[] = [
  { name: 'Surgical', stars: 4, max: 0.25 },
  { name: 'Razor sharp', stars: 3, max: 1 },
  { name: 'Clean cut', stars: 2, max: 2.5 },
  { name: 'Not bad', stars: 1, max: 5 },
  { name: 'Butter knife', stars: 0, max: Infinity },
];

export const tierFor = (err: number): Tier => TIERS.find((t) => err <= t.max) ?? TIERS[TIERS.length - 1]!;

/**
 * Error in percentage points between the closest piece and the goal.
 * For "third", either piece may be the third.
 */
export const cutError = (goal: Goal, left: number): number => {
  const t = GOAL_TARGET[goal];
  return Math.min(Math.abs(left - t), Math.abs(100 - left - t));
};

/** 0-100 accuracy: 100 means perfect, 0 means off by the whole target. */
export const accuracy = (goal: Goal, err: number): number =>
  Math.max(0, 100 - (err / GOAL_TARGET[goal]) * 100);

/** Long-run rank shown in flair, from average error over many days. */
export const RANKS = [
  { name: 'Laser', max: 0.75 },
  { name: 'Scalpel', max: 1.5 },
  { name: "Chef's Knife", max: 3 },
  { name: 'Bread Knife', max: 5 },
  { name: 'Butter Knife', max: Infinity },
] as const;

export const rankFor = (avgErr: number): string =>
  (RANKS.find((r) => avgErr <= r.max) ?? RANKS[RANKS.length - 1]!).name;

/** Histogram bucket upper edges (percentage points of error). */
export const HIST_EDGES = [0.5, 1, 1.5, 2, 3, 4, 5, 7, 10, Infinity];
export const histBucket = (err: number): number => HIST_EDGES.findIndex((e) => err <= e);

export const formatPct = (v: number): string => (Math.round(v * 10) / 10).toFixed(1);
