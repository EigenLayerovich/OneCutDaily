import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../../dev/memoryStore';
import { EPOCH_UTC } from '../../shared/puzzle';
import { getLeaderboard, getState, GameError, shareText, submitCut, validateCustomShape, saveCustomShape } from './game';
import type { Line } from '../../shared/geometry';

const DAY = 86_400_000;
const at = (day: number) => EPOCH_UTC + (day - 1) * DAY + 3_600_000;
const vertical = (x: number): Line => ({ a: { x, y: 0 }, b: { x, y: 1 } });
const alice = { id: 't2_alice', username: 'alice' };
const bob = { id: 't2_bob', username: 'bob' };

test('one cut per player: a second cut returns the first result', async () => {
  const s = memoryStore();
  const ref = { kind: 'daily', day: 1 } as const;
  const first = await submitCut(s, ref, alice, vertical(0.5), at(1));
  const second = await submitCut(s, ref, alice, vertical(0.3), at(1));
  assert.equal(second.result.left, first.result.left);
  assert.equal(second.stats.cuts, 1);
});

test('missing the shape is rejected and not recorded', async () => {
  const s = memoryStore();
  const ref = { kind: 'daily', day: 1 } as const;
  await assert.rejects(submitCut(s, ref, alice, vertical(0.01), at(1)), GameError);
  const st = await getState(s, ref, alice, at(1));
  assert.equal(st.result, null);
  assert.equal(st.stats.cuts, 0);
});

test('streak grows on consecutive days and resets after a gap', async () => {
  const s = memoryStore();
  for (const d of [1, 2, 3]) await submitCut(s, { kind: 'daily', day: d }, alice, vertical(0.5), at(d));
  let st = await getState(s, { kind: 'daily', day: 3 }, alice, at(3));
  assert.equal(st.me?.streak, 3);
  // Day 4 skipped: on day 5 the shown streak is 0 until they play.
  st = await getState(s, { kind: 'daily', day: 5 }, alice, at(5));
  assert.equal(st.me?.streak, 0);
  const r = await submitCut(s, { kind: 'daily', day: 5 }, alice, vertical(0.5), at(5));
  assert.equal(r.result.streak, 1);
  assert.equal(r.me?.bestStreak, 3);
});

test('old archive puzzles do not change the streak', async () => {
  const s = memoryStore();
  await submitCut(s, { kind: 'daily', day: 1 }, alice, vertical(0.5), at(10));
  const st = await getState(s, { kind: 'daily', day: 10 }, alice, at(10));
  assert.equal(st.me?.streak, 0);
  assert.equal(st.me?.daysPlayed, 1);
});

test('leaderboard ranks lower error first and percentile is right', async () => {
  const s = memoryStore();
  const ref = { kind: 'daily', day: 1 } as const;
  const ra = await submitCut(s, ref, alice, vertical(0.5), at(1));
  const rb = await submitCut(s, ref, bob, vertical(0.42), at(1));
  const better = ra.result.err < rb.result.err ? 'alice' : 'bob';
  const lb = await getLeaderboard(s, ref, alice);
  assert.equal(lb.top[0]?.username, better);
  assert.equal(lb.total, 2);
  const st = await getState(s, ref, bob, at(1));
  assert.equal(st.result?.beat, better === 'bob' ? 1 : 0);
});

test('logged-out players get a result that is not saved', async () => {
  const s = memoryStore();
  const ref = { kind: 'daily', day: 1 } as const;
  const r = await submitCut(s, ref, null, vertical(0.5), at(1));
  assert.equal(r.result.saved, false);
  assert.equal((await getState(s, ref, null, at(1))).stats.cuts, 0);
});

test('share text has the split and no spoilers beyond it', async () => {
  const s = memoryStore();
  const ref = { kind: 'daily', day: 1 } as const;
  await submitCut(s, ref, alice, vertical(0.5), at(1));
  const text = await shareText(s, ref, alice, at(1));
  assert.match(text, /One Cut #1/);
  assert.match(text, /off by/);
});

test('custom shapes validate and become playable puzzles', async () => {
  const s = memoryStore();
  assert.throws(() => validateCustomShape({ name: 'x', ring: [] }), GameError);
  const bowtie = [
    { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 },
    { x: 0.1, y: 0.5 }, { x: 0.05, y: 0.3 },
  ];
  assert.throws(() => validateCustomShape({ name: 'Bowtie', ring: bowtie }), /crosses itself/);
  const ring = Array.from({ length: 24 }, (_, i) => {
    const t = (i / 24) * Math.PI * 2;
    return { x: 0.5 + 0.3 * Math.cos(t), y: 0.5 + 0.2 * Math.sin(t) };
  });
  const req = validateCustomShape({ name: '  My   Egg ', ring, goal: 'third' });
  assert.equal(req.name, 'My Egg');
  const rec = await saveCustomShape(s, req, 'alice', at(1));
  const st = await getState(s, { kind: 'custom', id: rec.id }, bob, at(1));
  assert.equal(st.puzzle.goal, 'third');
  assert.equal(st.puzzle.author, 'alice');
  const r = await submitCut(s, { kind: 'custom', id: rec.id }, bob, vertical(0.5), at(1));
  assert.ok(r.result.err > 10); // a 50/50 cut is far from one third
});
