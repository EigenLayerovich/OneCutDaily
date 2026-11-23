import { Hono, type Context as HonoContext } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type {
  CreateShapeResponse,
  CutResponse,
  ErrorResponse,
  FlairResponse,
  LeaderboardResponse,
  PuzzleRef,
  ShareResponse,
  StateResponse,
} from '../../shared/api';
import {
  flairFor,
  GameError,
  getLeaderboard,
  getState,
  lookupPostRef,
  parseLine,
  saveCustomShape,
  shareText,
  submitCut,
  validateCustomShape,
  type User,
} from '../core/game';
import { dayNumberAt } from '../../shared/puzzle';
import { createCustomPost } from '../core/posts';

export const api = new Hono();

const refFromPostData = (d: unknown): PuzzleRef | null => {
  if (typeof d !== 'object' || d === null || !('kind' in d)) return null;
  if (d.kind === 'daily' && 'day' in d && typeof d.day === 'number') return { kind: 'daily', day: d.day };
  if (d.kind === 'custom' && 'id' in d && typeof d.id === 'string') return { kind: 'custom', id: d.id };
  return null;
};

const currentRef = async (): Promise<PuzzleRef> => {
  const fromData = refFromPostData(context.postData);
  if (fromData) return fromData;
  if (context.postId) {
    const stored = await lookupPostRef(redis, context.postId);
    if (stored) return stored;
  }
  // Posts made before postData existed fall back to today's puzzle.
  return { kind: 'daily', day: dayNumberAt(Date.now()) };
};

const currentUser = async (): Promise<User | null> => {
  if (!context.userId) return null;
  const username = context.username ?? (await reddit.getCurrentUsername());
  return username ? { id: context.userId, username } : null;
};

const fail = (c: HonoContext, e: unknown) => {
  if (e instanceof GameError) return c.json<ErrorResponse>({ status: 'error', message: e.message }, 400);
  console.error(e);
  return c.json<ErrorResponse>({ status: 'error', message: 'Something went wrong. Try again.' }, 500);
};

api.get('/state', async (c) => {
  try {
    const [ref, user] = await Promise.all([currentRef(), currentUser()]);
    return c.json<StateResponse>(await getState(redis, ref, user, Date.now()));
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/cut', async (c) => {
  try {
    const line = parseLine(await c.req.json());
    const [ref, user] = await Promise.all([currentRef(), currentUser()]);
    return c.json<CutResponse>(await submitCut(redis, ref, user, line, Date.now()));
  } catch (e) {
    return fail(c, e);
  }
});

api.get('/leaderboard', async (c) => {
  try {
    const [ref, user] = await Promise.all([currentRef(), currentUser()]);
    return c.json<LeaderboardResponse>(await getLeaderboard(redis, ref, user));
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/share', async (c) => {
  try {
    const [ref, user] = await Promise.all([currentRef(), currentUser()]);
    if (!user || !context.postId) throw new GameError('Log in to comment');
    const text = await shareText(redis, ref, user, Date.now());
    const comment = await reddit.submitComment({ id: context.postId, text, runAs: 'USER' });
    return c.json<ShareResponse>({ ok: true, commentId: comment.id });
  } catch (e) {
    if (e instanceof GameError) return c.json<ShareResponse>({ ok: false, message: e.message });
    console.error(e);
    return c.json<ShareResponse>({ ok: false, message: 'Could not post your comment' });
  }
});

api.post('/flair', async (c) => {
  try {
    const [ref, user] = await Promise.all([currentRef(), currentUser()]);
    if (!user || !context.subredditName) throw new GameError('Log in to wear your rank');
    const state = await getState(redis, ref, user, Date.now());
    if (!state.me) throw new GameError('Log in to wear your rank');
    const flair = flairFor(state.me);
    await reddit.setUserFlair({ subredditName: context.subredditName, username: user.username, ...flair });
    return c.json<FlairResponse>({ ok: true, text: flair.text });
  } catch (e) {
    if (e instanceof GameError) return c.json<FlairResponse>({ ok: false, message: e.message });
    console.error(e);
    return c.json<FlairResponse>({ ok: false, message: 'Could not set your flair' });
  }
});

api.post('/shape', async (c) => {
  try {
    const user = await currentUser();
    if (!user || !context.subredditName) throw new GameError('Log in to post a shape');
    const req = validateCustomShape(await c.req.json());
    const rec = await saveCustomShape(redis, req, user.username, Date.now());
    const post = await createCustomPost(context.subredditName, rec);
    return c.json<CreateShapeResponse>({ ok: true, url: post.url });
  } catch (e) {
    if (e instanceof GameError) return c.json<CreateShapeResponse>({ ok: false, message: e.message });
    console.error(e);
    return c.json<CreateShapeResponse>({ ok: false, message: 'Could not post your shape' });
  }
});
