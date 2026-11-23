// Game rules and persistence. Pure logic over a small key-value interface so
// it runs the same on Devvit Redis and in the local in-memory harness.

import {
  extendToBox,
  fitShape,
  isSimpleRing,
  lineLength,
  shapeArea,
  signedArea,
  splitShape,
  type Line,
  type Pt,
} from '../../shared/geometry';
import {
  cutError,
  dailyPuzzle,
  dayNumberAt,
  formatPct,
  hashString,
  histBucket,
  HIST_EDGES,
  msUntilNextDay,
  PAPER,
  rankFor,
  tierFor,
  type Goal,
  type Puzzle,
} from '../../shared/puzzle';
import type {
  CreateShapeRequest,
  Crowd,
  CrowdStats,
  CustomShapeRecord,
  CutResult,
  LeaderboardResponse,
  Me,
  PuzzleRef,
  StateResponse,
} from '../../shared/api';

export type Store = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<unknown>;
  incrBy(key: string, value: number): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zRank(key: string, member: string): Promise<number | undefined>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zCard(key: string): Promise<number>;
  zRange(
    key: string,
    start: number,
    stop: number,
    options: { by: 'rank' }
  ): Promise<{ member: string; score: number }[]>;
};

export type User = { id: string; username: string };

export class GameError extends Error {}

const SAMPLE_SLOTS = 400;

const K = {
  cuts: (pid: string) => `p:${pid}:cuts`,
  board: (pid: string) => `p:${pid}:board`,
  hist: (pid: string) => `p:${pid}:hist`,
  sample: (pid: string) => `p:${pid}:sample`,
  count: (pid: string) => `p:${pid}:n`,
  errSum: (pid: string) => `p:${pid}:errsum`,
  user: (uid: string) => `u:${uid}`,
  dailyPost: (day: number) => `daily:${day}:post`,
  postRef: (postId: string) => `post:${postId}:ref`,
  shape: (id: string) => `shape:${id}`,
  shapeSeq: 'shape:seq',
};

// ---------- puzzles ----------

export const resolvePuzzle = async (store: Store, ref: PuzzleRef): Promise<Puzzle | null> => {
  if (ref.kind === 'daily') {
    if (!Number.isInteger(ref.day) || ref.day < 1) return null;
    return dailyPuzzle(ref.day);
  }
  const raw = await store.get(K.shape(ref.id));
  if (!raw) return null;
  const rec: CustomShapeRecord = JSON.parse(raw);
  return {
    id: `c${rec.id}`,
    kind: 'custom',
    day: null,
    name: rec.name,
    goal: rec.goal,
    shape: rec.shape,
    color: rec.color,
    author: rec.author,
    flavor: `Shape by u/${rec.author}`,
  };
};

export const rememberPostRef = (store: Store, postId: string, ref: PuzzleRef) =>
  store.set(K.postRef(postId), JSON.stringify(ref));

export const lookupPostRef = async (store: Store, postId: string): Promise<PuzzleRef | null> => {
  const raw = await store.get(K.postRef(postId));
  return raw ? (JSON.parse(raw) as PuzzleRef) : null;
};

export const getDailyPostId = (store: Store, day: number) => store.get(K.dailyPost(day));
export const setDailyPostId = (store: Store, day: number, postId: string) =>
  store.set(K.dailyPost(day), postId);

// ---------- serialization ----------

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const encodeLine = (l: Line) => [l.a.x, l.a.y, l.b.x, l.b.y].map(r4).join(',');
const decodeLine = (s: string): Line | null => {
  const n = s.split(',').map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  return { a: { x: n[0]!, y: n[1]! }, b: { x: n[2]!, y: n[3]! } };
};

type StoredCut = { line: Line; left: number; err: number };

// ---------- users ----------

const readMe = async (store: Store, user: User, today: number): Promise<Me> => {
  const h = await store.hGetAll(K.user(user.id));
  const lastDay = Number(h.lastDay ?? 0);
  const rawStreak = Number(h.streak ?? 0);
  const days = Number(h.days ?? 0);
  const errMilli = Number(h.errMilli ?? 0);
  const avgErr = days > 0 ? errMilli / 1000 / days : null;
  return {
    username: user.username,
    streak: lastDay >= today - 1 ? rawStreak : 0,
    bestStreak: Number(h.best ?? 0),
    daysPlayed: days,
    avgErr,
    rank: avgErr !== null && days >= 3 ? rankFor(avgErr) : null,
  };
};

const recordDaily = async (store: Store, user: User, day: number, today: number, err: number) => {
  const key = K.user(user.id);
  const h = await store.hGetAll(key);
  const lastDay = Number(h.lastDay ?? 0);
  let streak = Number(h.streak ?? 0);
  let best = Number(h.best ?? 0);
  // Only today's (or yesterday's, for time-zone grace) puzzle moves the streak.
  if (day > lastDay && day >= today - 1) {
    streak = day === lastDay + 1 ? streak + 1 : 1;
    best = Math.max(best, streak);
    await store.hSet(key, {
      lastDay: String(day),
      streak: String(streak),
      best: String(best),
      username: user.username,
    });
  }
  await store.hIncrBy(key, 'days', 1);
  await store.hIncrBy(key, 'errMilli', Math.round(err * 1000));
  return streak;
};

// ---------- crowd ----------

const readStats = async (store: Store, pid: string): Promise<CrowdStats> => {
  const [n, sum] = await Promise.all([store.get(K.count(pid)), store.get(K.errSum(pid))]);
  const cuts = Number(n ?? 0);
  return { cuts, avgErr: cuts > 0 ? Number(sum ?? 0) / 1000 / cuts : null };
};

const readCrowd = async (store: Store, pid: string): Promise<Crowd> => {
  const [sample, histRaw] = await Promise.all([
    store.hGetAll(K.sample(pid)),
    store.hGetAll(K.hist(pid)),
  ]);
  const lines = Object.values(sample)
    .map(decodeLine)
    .filter((l): l is Line => l !== null);
  const hist = HIST_EDGES.map((_, i) => Number(histRaw[String(i)] ?? 0));
  return { lines, hist };
};

/** Share of saved players with a strictly larger error, using the histogram. */
const beatFromHist = (hist: number[], err: number): number | null => {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const b = histBucket(err);
  const worse = hist.slice(b + 1).reduce((a, c) => a + c, 0);
  const same = hist[b] ?? 0;
  return Math.min(1, (worse + same / 2) / total);
};

// ---------- validation ----------

const validPoint = (p: unknown): p is Pt =>
  typeof p === 'object' &&
  p !== null &&
  'x' in p &&
  'y' in p &&
  typeof p.x === 'number' &&
  typeof p.y === 'number' &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x > -2 &&
  p.x < 3 &&
  p.y > -2 &&
  p.y < 3;

export const parseLine = (body: unknown): Line => {
  if (typeof body !== 'object' || body === null || !('line' in body)) throw new GameError('Missing cut');
  const l = body.line;
  if (typeof l !== 'object' || l === null || !('a' in l) || !('b' in l)) throw new GameError('Bad cut');
  if (!validPoint(l.a) || !validPoint(l.b)) throw new GameError('Bad cut');
  const line = { a: { x: l.a.x, y: l.a.y }, b: { x: l.b.x, y: l.b.y } };
  if (lineLength(line) < 0.01) throw new GameError('Cut too short');
  return line;
};

// ---------- main actions ----------

export const getState = async (
  store: Store,
  ref: PuzzleRef,
  user: User | null,
  now: number
): Promise<StateResponse> => {
  const puzzle = await resolvePuzzle(store, ref);
  if (!puzzle) throw new GameError('Puzzle not found');
  const today = dayNumberAt(now);
  const [stats, me, mine, todayPostId] = await Promise.all([
    readStats(store, puzzle.id),
    user ? readMe(store, user, today) : Promise.resolve(null),
    user ? store.hGet(K.cuts(puzzle.id), user.id) : Promise.resolve(undefined),
    getDailyPostId(store, today),
  ]);
  let result: CutResult | null = null;
  let crowd: Crowd | null = null;
  if (mine && user) {
    const c: StoredCut = JSON.parse(mine);
    const [rank, total] = await Promise.all([
      store.zRank(K.board(puzzle.id), user.username),
      store.zCard(K.board(puzzle.id)),
    ]);
    result = {
      line: c.line,
      left: c.left,
      right: 100 - c.left,
      err: c.err,
      position: rank === undefined ? null : rank + 1,
      beat: rank === undefined || total < 2 ? null : (total - 1 - rank) / (total - 1),
      total,
      saved: true,
      streak: me?.streak ?? null,
    };
    crowd = await readCrowd(store, puzzle.id);
  }
  return {
    puzzle,
    isToday: puzzle.kind === 'daily' && puzzle.day === today,
    today,
    nextIn: msUntilNextDay(now),
    loggedIn: user !== null,
    me,
    stats,
    result,
    crowd,
    todayPostId: todayPostId ?? null,
  };
};

export const submitCut = async (
  store: Store,
  ref: PuzzleRef,
  user: User | null,
  rawLine: Line,
  now: number
) => {
  const puzzle = await resolvePuzzle(store, ref);
  if (!puzzle) throw new GameError('Puzzle not found');
  const line = extendToBox(rawLine, -0.02, 1.02);
  if (!line) throw new GameError('That cut missed the board');
  const split = splitShape(puzzle.shape, line);
  if (split.left < 0.01 || split.right < 0.01) throw new GameError('That cut missed the shape');
  const err = cutError(puzzle.goal, split.left);
  const pid = puzzle.id;
  const today = dayNumberAt(now);

  if (!user) {
    // Logged-out players can play; their cut just isn't saved.
    const crowd = await readCrowd(store, pid);
    const stats = await readStats(store, pid);
    const result: CutResult = {
      line,
      left: split.left,
      right: split.right,
      err,
      beat: beatFromHist(crowd.hist, err),
      position: null,
      total: stats.cuts,
      saved: false,
      streak: null,
    };
    return { result, crowd, me: null, stats };
  }

  const stored: StoredCut = { line, left: split.left, err };
  const fresh = await store.hSetNX(K.cuts(pid), user.id, JSON.stringify(stored));
  let streak: number | null = null;
  if (fresh) {
    const n = await store.incrBy(K.count(pid), 1);
    await Promise.all([
      store.incrBy(K.errSum(pid), Math.round(err * 1000)),
      store.hIncrBy(K.hist(pid), String(histBucket(err)), 1),
      store.hSet(K.sample(pid), { [String((n - 1) % SAMPLE_SLOTS)]: encodeLine(line) }),
      store.zAdd(K.board(pid), { member: user.username, score: err }),
    ]);
    if (puzzle.kind === 'daily' && puzzle.day !== null) {
      streak = await recordDaily(store, user, puzzle.day, today, err);
    }
  }
  // Whether fresh or a repeat request, answer with what is on record.
  const state = await getState(store, ref, user, now);
  if (!state.result || !state.crowd) throw new GameError('Could not save your cut');
  if (streak !== null) state.result.streak = streak;
  return { result: state.result, crowd: state.crowd, me: state.me, stats: state.stats };
};

export const getLeaderboard = async (
  store: Store,
  ref: PuzzleRef,
  user: User | null
): Promise<LeaderboardResponse> => {
  const puzzle = await resolvePuzzle(store, ref);
  if (!puzzle) throw new GameError('Puzzle not found');
  const key = K.board(puzzle.id);
  const [rows, total, rank, score] = await Promise.all([
    store.zRange(key, 0, 9, { by: 'rank' }),
    store.zCard(key),
    user ? store.zRank(key, user.username) : Promise.resolve(undefined),
    user ? store.zScore(key, user.username) : Promise.resolve(undefined),
  ]);
  return {
    top: rows.map((r) => ({ username: r.member, err: r.score })),
    me: rank !== undefined && score !== undefined ? { position: rank + 1, err: score } : null,
    total,
  };
};

// ---------- sharing ----------

const bar = (err: number) => {
  const filled = tierFor(err).stars + 1;
  return '🟩'.repeat(filled) + '⬜'.repeat(5 - filled);
};

export const shareText = async (store: Store, ref: PuzzleRef, user: User, now: number) => {
  const state = await getState(store, ref, user, now);
  const r = state.result;
  if (!r) throw new GameError('Make your cut first');
  const p = state.puzzle;
  const title = p.kind === 'daily' ? `One Cut #${p.day}` : `"${p.name}"`;
  const parts = [
    `✂️ ${title} · ${formatPct(Math.min(r.left, r.right))} / ${formatPct(Math.max(r.left, r.right))}`,
    `${bar(r.err)} off by ${formatPct(r.err)}%`,
  ];
  if (r.beat !== null) parts.push(`sharper than ${Math.round(r.beat * 100)}% of cutters`);
  if (state.me && state.me.streak > 1 && p.kind === 'daily') parts.push(`🔥 ${state.me.streak}-day streak`);
  return parts.join('\n\n');
};

export const flairFor = (me: Me): { text: string; backgroundColor: string; textColor: 'dark' | 'light' } => {
  const colors: Record<string, string> = {
    Laser: '#ff6a47',
    Scalpel: '#f7b733',
    "Chef's Knife": '#7cc7ff',
    'Bread Knife': '#c9e86f',
    'Butter Knife': '#fff1d6',
  };
  const rank = me.rank ?? 'Fresh Blade';
  const streak = me.streak > 1 ? ` · 🔥${me.streak}` : '';
  return { text: `✂ ${rank}${streak}`, backgroundColor: colors[rank] ?? '#8ff0c8', textColor: 'dark' };
};

// ---------- player-made shapes ----------

export const validateCustomShape = (req: unknown): CreateShapeRequest => {
  if (typeof req !== 'object' || req === null) throw new GameError('Bad request');
  const name = 'name' in req && typeof req.name === 'string' ? req.name.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2 || name.length > 40) throw new GameError('Give your shape a name (2-40 characters)');
  const goal: Goal =
    'goal' in req && (req.goal === 'half' || req.goal === 'third' || req.goal === 'quarter') ? req.goal : 'half';
  const ring = 'ring' in req && Array.isArray(req.ring) ? req.ring : [];
  if (ring.length < 6 || ring.length > 200) throw new GameError('Draw a bigger, smoother shape');
  const pts: Pt[] = [];
  for (const p of ring) {
    if (!validPoint(p)) throw new GameError('Bad shape');
    pts.push({ x: p.x, y: p.y });
  }
  if (!isSimpleRing(pts)) throw new GameError("Your outline crosses itself. Try one clean loop.");
  if (Math.abs(signedArea(pts)) < 0.02) throw new GameError('That shape is too small');
  return { name, goal, ring: pts };
};

export const saveCustomShape = async (store: Store, req: CreateShapeRequest, author: string, now: number) => {
  const seq = await store.incrBy(K.shapeSeq, 1);
  const id = seq.toString(36);
  let ring = req.ring;
  if (signedArea(ring) < 0) ring = ring.slice().reverse();
  const shape = fitShape({ rings: [ring] }, 0.1);
  if (shapeArea(shape) < 0.05) throw new GameError('That shape is too thin to cut fairly');
  const rec: CustomShapeRecord = {
    id,
    name: req.name,
    author,
    goal: req.goal,
    shape: {
      rings: shape.rings.map((r) => r.map((p) => ({ x: r4(p.x), y: r4(p.y) }))),
    },
    color: hashString(id + req.name) % PAPER.length,
    createdAt: now,
  };
  await store.set(K.shape(id), JSON.stringify(rec));
  return rec;
};
