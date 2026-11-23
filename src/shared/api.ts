import type { Line, Shape } from './geometry';
import type { Goal, Puzzle } from './puzzle';

/** What a post points at. Stored in postData so the client can draw instantly. */
export type PuzzleRef = { kind: 'daily'; day: number } | { kind: 'custom'; id: string };

export type Me = {
  username: string;
  streak: number;
  bestStreak: number;
  daysPlayed: number;
  avgErr: number | null;
  rank: string | null;
};

export type CrowdStats = {
  cuts: number;
  avgErr: number | null;
};

export type Crowd = {
  /** A sample of other players' cuts. */
  lines: Line[];
  /** Counts per error bucket (see HIST_EDGES). */
  hist: number[];
};

export type CutResult = {
  line: Line;
  left: number;
  right: number;
  err: number;
  /** 0-1 share of players you beat. null when you are the first. */
  beat: number | null;
  /** 1-based position on this puzzle's board. null if not saved. */
  position: number | null;
  total: number;
  saved: boolean;
  /** Streak after this cut (daily only, logged in only). */
  streak: number | null;
};

export type StateResponse = {
  puzzle: Puzzle;
  isToday: boolean;
  today: number;
  /** ms until the next daily puzzle. */
  nextIn: number;
  loggedIn: boolean;
  me: Me | null;
  stats: CrowdStats;
  result: CutResult | null;
  crowd: Crowd | null;
  todayPostId: string | null;
};

export type CutRequest = { line: Line };
export type CutResponse = { result: CutResult; crowd: Crowd; me: Me | null; stats: CrowdStats };

export type LeaderRow = { username: string; err: number };
export type LeaderboardResponse = {
  top: LeaderRow[];
  me: { position: number; err: number } | null;
  total: number;
};

export type ShareResponse = { ok: true; commentId: string } | { ok: false; message: string };
export type FlairResponse = { ok: true; text: string } | { ok: false; message: string };

export type CreateShapeRequest = { name: string; ring: { x: number; y: number }[]; goal: Goal };
export type CreateShapeResponse = { ok: true; url: string } | { ok: false; message: string };

export type ErrorResponse = { status: 'error'; message: string };

export type CustomShapeRecord = {
  id: string;
  name: string;
  author: string;
  goal: Goal;
  shape: Shape;
  color: number;
  createdAt: number;
};
