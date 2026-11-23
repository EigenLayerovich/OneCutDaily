import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { TriggerResponse, UiResponse } from '@devvit/web/shared';
import { ensureDailyPost } from '../core/posts';

export const internal = new Hono();

const postUrl = (postId: string) => `https://reddit.com/r/${context.subredditName}/comments/${postId}`;

internal.post('/menu/daily-post', async (c) => {
  try {
    if (!context.subredditName) throw new Error('No subreddit');
    const { postId, created } = await ensureDailyPost(context.subredditName);
    return c.json<UiResponse>({
      showToast: created ? "Posted today's One Cut" : "Today's One Cut is already up",
      navigateTo: postUrl(postId),
    });
  } catch (e) {
    console.error('daily-post menu failed', e);
    return c.json<UiResponse>({ showToast: 'Could not create the post' }, 400);
  }
});

const dailyTrigger = async () => {
  if (!context.subredditName) throw new Error('No subreddit');
  return ensureDailyPost(context.subredditName);
};

internal.post('/triggers/on-app-install', async (c) => {
  try {
    const { postId } = await dailyTrigger();
    return c.json<TriggerResponse>({ status: 'success', message: `Daily post ${postId}` });
  } catch (e) {
    console.error('install trigger failed', e);
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to create post' }, 400);
  }
});

internal.post('/triggers/on-app-upgrade', async (c) => {
  try {
    const { postId } = await dailyTrigger();
    return c.json<TriggerResponse>({ status: 'success', message: `Daily post ${postId}` });
  } catch (e) {
    console.error('upgrade trigger failed', e);
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to create post' }, 400);
  }
});

internal.post('/scheduler/daily-post', async (c) => {
  try {
    const { postId, created } = await dailyTrigger();
    console.log(`daily-post: ${created ? 'created' : 'exists'} ${postId}`);
    return c.json({ status: 'ok' });
  } catch (e) {
    console.error('scheduled daily post failed', e);
    return c.json({ status: 'error' }, 500);
  }
});
