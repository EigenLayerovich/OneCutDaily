import './styles.css';

import { StrictMode, useEffect, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { dailyPuzzle, dayNumberAt, formatPct, GOAL_LABEL, tierFor, type Puzzle } from '../shared/puzzle';
import type { StateResponse } from '../shared/api';
import { api } from './lib/api';
import { openEntry, postData } from './lib/platform';
import { Board } from './components/Board';
import { Wordmark } from './components/ui';

/** Draw the daily shape straight from post data, before any network call. */
const instantPuzzle = (): Puzzle | null => {
  const d = postData();
  if (typeof d === 'object' && d !== null && 'kind' in d && d.kind === 'daily' && 'day' in d && typeof d.day === 'number') {
    return dailyPuzzle(d.day);
  }
  if (d === undefined) return dailyPuzzle(dayNumberAt(Date.now()));
  return null;
};

const Splash = () => {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(instantPuzzle);
  const [state, setState] = useState<StateResponse | null>(null);

  useEffect(() => {
    api.state().then(
      (s) => {
        setState(s);
        setPuzzle(s.puzzle);
      },
      () => undefined
    );
  }, []);

  if (!puzzle) {
    return (
      <div className="splash">
        <div className="splash-top">
          <Wordmark />
        </div>
        <div className="center-screen">
          <div className="spinner" />
        </div>
        <div />
      </div>
    );
  }

  const result = state?.result ?? null;
  const cuts = state?.stats.cuts ?? 0;
  const play = (e: MouseEvent<HTMLButtonElement>) => openEntry(e.nativeEvent, 'game', 'One Cut');
  const tag = puzzle.kind === 'daily' ? `#${puzzle.day} · ${puzzle.flavor}` : puzzle.flavor;

  return (
    <div className="splash">
      <div className="splash-top">
        <Wordmark />
        <span className="chip">{tag}</span>
      </div>

      <div className="splash-mid">
        <div className="splash-thumb">
          <Board
            shape={puzzle.shape}
            color={puzzle.color}
            cut={result ? { line: result.line, left: result.left, right: result.right } : null}
            separated={Boolean(result)}
            label={result ? 'Your cut on today’s shape' : `Today's shape: ${puzzle.name}`}
          />
        </div>
        <div className="splash-copy">
          <h1>{puzzle.name}</h1>
          {result ? (
            <p>
              You cut it <b className="mono" style={{ color: 'var(--ink)' }}>{formatPct(Math.min(result.left, result.right))} / {formatPct(Math.max(result.left, result.right))}</b>
              . {tierFor(result.err).name}.
            </p>
          ) : (
            <p>
              {GOAL_LABEL[puzzle.goal]}. One straight cut, no do-overs.
            </p>
          )}
          <div>
            <button className="btn btn-primary" onClick={play}>
              {result ? 'See how everyone cut' : '✂ Make your cut'}
            </button>
          </div>
        </div>
      </div>

      <div className="splash-bottom">
        <span className="splash-stats">
          {cuts > 0 ? (
            <>
              <b>{cuts.toLocaleString()}</b> {cuts === 1 ? 'cut' : 'cuts'} so far
              {state?.stats.avgErr != null && (
                <>
                  {' '}
                  · crowd off by <b className="mono">{formatPct(state.stats.avgErr)}</b>
                </>
              )}
            </>
          ) : (
            <>Be the first to cut</>
          )}
        </span>
        {state?.me && state.me.streak > 0 && <span className="chip chip-hot">🔥 {state.me.streak}-day streak</span>}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
