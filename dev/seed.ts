import { splitShape, type Line } from '../src/shared/geometry';
import { mulberry32 } from '../src/shared/puzzle';
import { submitCut, type Store } from '../src/server/core/game';
import type { PuzzleRef } from '../src/shared/api';
import { resolvePuzzle } from '../src/server/core/game';
import { GOAL_TARGET } from '../src/shared/puzzle';

const NAMES = ['pixelpond', 'mossy_otter', 'quietfern', 'ok_scissors', 'tangram_tom', 'lazy_comet', 'beanqueen', 'halfsies4life', 'graphpaper', 'mild_salsa', 'theoretical_toast', 'slicejockey'];

/** Simulate players whose cuts cluster around the true answer with human-ish noise. */
export const seedCrowd = async (store: Store, ref: PuzzleRef, players: number, now: number) => {
  const puzzle = await resolvePuzzle(store, ref);
  if (!puzzle) return;
  const rng = mulberry32(players * 7919 + (ref.kind === 'daily' ? ref.day : 1));
  const target = GOAL_TARGET[puzzle.goal];
  for (let i = 0; i < players; i++) {
    const theta = rng() * Math.PI;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    const lineAt = (o: number): Line => ({
      a: { x: 0.5 - dx + -dy * o, y: 0.5 - dy + dx * o },
      b: { x: 0.5 + dx + -dy * o, y: 0.5 + dy + dx * o },
    });
    let lo = -0.8;
    let hi = 0.8;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (splitShape(puzzle.shape, lineAt(mid)).left < target) hi = mid;
      else lo = mid;
    }
    const skill = rng() < 0.15 ? 0.002 : rng() < 0.6 ? 0.012 : 0.035;
    const noise = (rng() + rng() + rng() - 1.5) * 2 * skill;
    const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? i : ''}`;
    try {
      await submitCut(store, ref, { id: `t2_sim${i}`, username: name }, lineAt((lo + hi) / 2 + noise), now);
    } catch {
      /* missed the shape: skip */
    }
  }
};
