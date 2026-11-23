import { useMemo, useState } from 'react';
import { splitShape, type Line } from '../../shared/geometry';
import { cutError, formatPct, GOAL_LABEL, practicePuzzle, tierFor } from '../../shared/puzzle';
import { load, save } from '../lib/store';
import { buzz, playSnip } from '../lib/sound';
import { Blades } from './ui';
import { Board, type CutView } from './Board';

type Stats = { played: number; errSum: number; best: number | null };

export const Practice = ({ onExit }: { onExit: () => void }) => {
  const [seed, setSeed] = useState(() => load<number>('practiceSeed', Math.floor(Math.random() * 1e6)));
  const puzzle = useMemo(() => practicePuzzle(seed), [seed]);
  const [line, setLine] = useState<Line | null>(null);
  const [cut, setCut] = useState<CutView | null>(null);
  const [separated, setSeparated] = useState(false);
  const [stats, setStats] = useState<Stats>(() => load<Stats>('practiceStats', { played: 0, errSum: 0, best: null }));

  const split = line ? splitShape(puzzle.shape, line) : null;
  const valid = split !== null && split.left > 0.5 && split.right > 0.5;
  const err = cut ? cutError(puzzle.goal, cut.left) : null;

  const doCut = () => {
    if (!line || !split || !valid) return;
    playSnip();
    buzz(18);
    setCut({ line, left: split.left, right: split.right });
    requestAnimationFrame(() => requestAnimationFrame(() => setSeparated(true)));
    const e = cutError(puzzle.goal, split.left);
    const next: Stats = {
      played: stats.played + 1,
      errSum: stats.errSum + e,
      best: stats.best === null ? e : Math.min(stats.best, e),
    };
    setStats(next);
    save('practiceStats', next);
  };

  const nextShape = () => {
    const s = seed + 1;
    setSeed(s);
    save('practiceSeed', s);
    setLine(null);
    setCut(null);
    setSeparated(false);
  };

  const tier = err === null ? null : tierFor(err);

  return (
    <>
      <div className="puzzle-head">
        <div>
          <h1 className="puzzle-title">{puzzle.name}</h1>
          <p className="puzzle-sub">Practice · just for fun</p>
        </div>
        <div className="goal-badge">
          <span className="big">{puzzle.goal === 'half' ? '50/50' : puzzle.goal === 'third' ? '⅓' : '¼'}</span>
          <span className="small">goal</span>
        </div>
      </div>
      <div className="board-wrap">
        <Board
          shape={puzzle.shape}
          color={puzzle.color}
          line={line}
          onLineChange={cut ? undefined : setLine}
          onCommit={doCut}
          cut={cut}
          separated={separated}
          label={`Practice board. ${GOAL_LABEL[puzzle.goal]}.`}
        />
      </div>
      {cut && err !== null && tier ? (
        <div className="score-card fade-in" style={{ width: '100%', maxWidth: 560 }}>
          <div className="tier">
            {tier.name} · off by <span className="mono">{formatPct(err)}</span>
          </div>
          <Blades on={tier.stars} />
          <div className="score-meta">
            {stats.played} practice {stats.played === 1 ? 'cut' : 'cuts'} · average off by <b className="mono">{formatPct(stats.errSum / stats.played)}</b>
            {stats.best !== null && (
              <>
                {' '}
                · best <b className="mono">{formatPct(stats.best)}</b>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="helper">{GOAL_LABEL[puzzle.goal]}. Drag across the shape, then cut.</p>
      )}
      <div className="action-row">
        <button className="btn btn-ghost btn-sm" onClick={onExit}>
          ← Back
        </button>
        {cut ? (
          <button className="btn btn-primary" onClick={nextShape}>
            Next shape →
          </button>
        ) : (
          <button className="btn btn-primary" disabled={!valid} onClick={doCut}>
            ✂ Cut
          </button>
        )}
      </div>
    </>
  );
};
