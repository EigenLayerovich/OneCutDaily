// Local harness: serves the built client and the real game logic over an
// in-memory store. Pick the player and puzzle via the page URL, e.g.
//   http://localhost:5199/game.html?user=alice&day=3
//   http://localhost:5199/game.html?anon=1
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { memoryStore } from './memoryStore';
import { seedCrowd } from './seed';
import {
  GameError,
  getLeaderboard,
  getState,
  parseLine,
  saveCustomShape,
  shareText,
  submitCut,
  validateCustomShape,
  flairFor,
  setDailyPostId,
  type User,
} from '../src/server/core/game';
import { dayNumberAt } from '../src/shared/puzzle';
import type { PuzzleRef } from '../src/shared/api';

const store = memoryStore();
const now = () => Date.now();
const today = dayNumberAt(now());
const port = Number(process.env.PORT ?? 5199);

const params = (referer: string | undefined) => {
  try {
    return new URL(referer ?? '').searchParams;
  } catch {
    return new URLSearchParams();
  }
};

const ctx = (c: { req: { header: (n: string) => string | undefined } }) => {
  const q = params(c.req.header('referer'));
  const ref: PuzzleRef = q.get('shape')
    ? { kind: 'custom', id: q.get('shape')! }
    : { kind: 'daily', day: Number(q.get('day') ?? today) };
  const name = q.get('user') ?? 'you_the_player';
  const user: User | null = q.get('anon') ? null : { id: `t2_${name}`, username: name };
  return { ref, user };
};

const app = new Hono();
const wrap = (fn: (c: Parameters<Parameters<typeof app.get>[1]>[0]) => Promise<unknown>) =>
  async (c: Parameters<Parameters<typeof app.get>[1]>[0]) => {
    try {
      return c.json(await fn(c));
    } catch (e) {
      if (e instanceof GameError) return c.json({ status: 'error', message: e.message }, 400);
      console.error(e);
      return c.json({ status: 'error', message: 'Server error' }, 500);
    }
  };

app.get('/api/state', wrap(async (c) => { const { ref, user } = ctx(c); return getState(store, ref, user, now()); }));
app.post('/api/cut', wrap(async (c) => { const { ref, user } = ctx(c); return submitCut(store, ref, user, parseLine(await c.req.json()), now()); }));
app.get('/api/leaderboard', wrap(async (c) => { const { ref, user } = ctx(c); return getLeaderboard(store, ref, user); }));
app.post('/api/share', wrap(async (c) => {
  const { ref, user } = ctx(c);
  if (!user) return { ok: false, message: 'Log in to comment' };
  console.log('--- comment ---\n' + (await shareText(store, ref, user, now())));
  return { ok: true, commentId: 't1_local' };
}));
app.post('/api/flair', wrap(async (c) => {
  const { ref, user } = ctx(c);
  const s = await getState(store, ref, user, now());
  if (!s.me) return { ok: false, message: 'Log in to wear your rank' };
  return { ok: true, text: flairFor(s.me).text };
}));
app.post('/api/shape', wrap(async (c) => {
  const { user } = ctx(c);
  if (!user) return { ok: false, message: 'Log in to post a shape' };
  const rec = await saveCustomShape(store, validateCustomShape(await c.req.json()), user.username, now());
  return { ok: true, url: `/game.html?shape=${rec.id}&user=${user.username}` };
}));
app.use('/*', serveStatic({ root: './dist/client' }));

const seedDays = Number(process.env.SEED_PLAYERS ?? 600);
await setDailyPostId(store, today, 't3_today');
for (let d = Math.max(1, today - 2); d <= today; d++) {
  await seedCrowd(store, { kind: 'daily', day: d }, d === today ? seedDays : 80, now());
}
serve({ fetch: app.fetch, port }, () => console.log(`One Cut local harness on http://localhost:${port}/splash.html (day #${today})`));
