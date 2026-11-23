import { reddit, redis } from '@devvit/web/server';
import type { JsonObject } from '@devvit/web/shared';
import { dailyPuzzle, dayNumberAt, GOAL_LABEL } from '../../shared/puzzle';
import type { CustomShapeRecord, PuzzleRef } from '../../shared/api';
import { getDailyPostId, rememberPostRef, setDailyPostId } from './game';

const refData = (ref: PuzzleRef): JsonObject =>
  ref.kind === 'daily' ? { kind: 'daily', day: ref.day } : { kind: 'custom', id: ref.id };

/** Creates today's daily post once. Safe to call repeatedly. */
export const ensureDailyPost = async (subredditName: string, now = Date.now()) => {
  const day = dayNumberAt(now);
  const existing = await getDailyPostId(redis, day);
  if (existing) return { postId: existing, created: false };
  const puzzle = dailyPuzzle(day);
  const ref: PuzzleRef = { kind: 'daily', day };
  const post = await reddit.submitCustomPost({
    subredditName,
    title: `One Cut #${day} · ${puzzle.name} · ${GOAL_LABEL[puzzle.goal]}`,
    entry: 'default',
    postData: refData(ref),
    textFallback: {
      text: `Today's One Cut: ${GOAL_LABEL[puzzle.goal]}. Open this post on new Reddit or the app to play.`,
    },
  });
  await Promise.all([setDailyPostId(redis, day, post.id), rememberPostRef(redis, post.id, ref)]);
  try {
    const comment = await reddit.submitComment({
      id: post.id,
      text:
        `**${puzzle.flavor}: ${puzzle.name}.** ${GOAL_LABEL[puzzle.goal]}. You get one cut.\n\n` +
        `How did you line yours up? Share your result and your strategy below. ` +
        `Tip: you can drag either end of your line before you commit.`,
    });
    await comment.distinguish(true);
  } catch (e) {
    console.error('Could not post the discussion comment', e);
  }
  return { postId: post.id, created: true };
};

/** Posts a player-made shape, as the player when they have allowed it. */
export const createCustomPost = async (subredditName: string, rec: CustomShapeRecord) => {
  const ref: PuzzleRef = { kind: 'custom', id: rec.id };
  const post = await reddit.submitCustomPost({
    subredditName,
    title: `Cut this: "${rec.name}" · ${GOAL_LABEL[rec.goal]}`,
    entry: 'default',
    postData: refData(ref),
    runAs: 'USER',
    userGeneratedContent: { text: rec.name },
    textFallback: { text: `A shape drawn by u/${rec.author}. Open on new Reddit or the app to play.` },
  });
  await rememberPostRef(redis, post.id, ref);
  return post;
};
