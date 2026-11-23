import './styles.css';

import { StrictMode, useCallback, useEffect, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { splitShape, type Line } from '../shared/geometry';
import { formatPct, GOAL_LABEL, tierFor } from '../shared/puzzle';
import type { Crowd, CutResult, LeaderboardResponse, StateResponse } from '../shared/api';
import { api } from './lib/api';
import { askLogin, go, openEntry, toast } from './lib/platform';
import { buzz, playSnip, playTick } from './lib/sound';
import { Board, type CutView } from './components/Board';
import { Practice } from './components/Practice';
import { Blades, Countdown, Histogram, LeaderList, MuteButton, Toaster, Wordmark, useCountUp } from './components/ui';

type Tab = 'you' | 'crowd' | 'top';

const goalShort = (g: StateResponse['puzzle']['goal']) => (g === 'half' ? '50/50' : g === 'third' ? '⅓' : '¼');

const postUrl = (postId: string) => `https://www.reddit.com/comments/${postId.replace(/^t3_/, '')}`;

const ScoreCard = ({ result, state }: { result: CutResult; state: StateResponse }) => {
  const lo = Math.min(result.left, result.right);
  const hi = Math.max(result.left, result.right);
  const a = useCountUp(lo);
  const b = useCountUp(hi);
  const tier = tierFor(result.err);
  return (
    <div className="score-card fade-in">
      <div className="score-split" aria-label={`Your split: ${formatPct(lo)} and ${formatPct(hi)} percent`}>
        {formatPct(a)}
        <span className="sep">/</span>
        {formatPct(b)}
      </div>
      <Blades on={tier.stars} />
      <div className="tier">
        {tier.name} <span style={{ color: 'var(--muted)', fontWeight: 550 }}>· off by </span>
        <span className="mono">{formatPct(result.err)}</span>
      </div>
      <div />
      <div className="score-meta">
        {result.beat !== null ? (
          <>
            Sharper than <b>{Math.round(result.beat * 100)}%</b> of{' '}
            <b>{Math.max(result.total, state.stats.cuts).toLocaleString()}</b> cutters
            {result.position !== null && (
              <>
                {' '}
                · <b>#{result.position}</b> today
              </>
            )}
          </>
        ) : (
          <>You're the first to cut this one. Come back later to see how the crowd did.</>
        )}
        {result.streak !== null && result.streak > 0 && (
          <>
            <br />
            🔥 <b>{result.streak}-day</b> streak
            {state.me && state.me.bestStreak > result.streak && <> · best {state.me.bestStreak}</>}
          </>
        )}
        {!result.saved && (
          <>
            <br />
            Your cut wasn't saved because you're logged out.
          </>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState<Line | null>(null);
  const [cut, setCut] = useState<CutView | null>(null);
  const [separated, setSeparated] = useState(false);
  const [result, setResult] = useState<CutResult | null>(null);
  const [crowd, setCrowd] = useState<Crowd | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('you');
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [shared, setShared] = useState(false);
  const [practice, setPractice] = useState(false);

  const apply = useCallback((s: StateResponse) => {
    setError(null);
    setState(s);
    if (s.result) {
      setResult(s.result);
      setCrowd(s.crowd);
      setCut({ line: s.result.line, left: s.result.left, right: s.result.right });
      setSeparated(true);
    }
  }, []);
  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : 'Could not load the puzzle');
  }, []);
  const load = useCallback(() => api.state().then(apply, fail), [apply, fail]);

  useEffect(() => {
    api.state().then(apply, fail);
  }, [apply, fail]);

  useEffect(() => {
    if (tab !== 'top' || board) return;
    api.leaderboard().then(setBoard, () => setBoard({ top: [], me: null, total: 0 }));
  }, [tab, board]);

  if (error) {
    return (
      <div className="center-screen">
        <Wordmark size={30} />
        <p className="helper">{error}</p>
        <button className="btn btn-secondary" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="center-screen" aria-busy="true">
        <Wordmark size={30} />
        <div className="spinner" />
      </div>
    );
  }

  const { puzzle } = state;
  const split = line ? splitShape(puzzle.shape, line) : null;
  const valid = split !== null && split.left > 0.5 && split.right > 0.5;

  const doCut = async () => {
    if (!line || !split || !valid || busy || cut) return;
    setBusy(true);
    playSnip();
    buzz(18);
    // Show the cut immediately; the server confirms the score.
    setCut({ line, left: split.left, right: split.right });
    requestAnimationFrame(() => requestAnimationFrame(() => setSeparated(true)));
    try {
      const r = await api.cut(line);
      setResult(r.result);
      setCrowd(r.crowd);
      setCut({ line: r.result.line, left: r.result.left, right: r.result.right });
      setState({ ...state, me: r.me ?? state.me, stats: r.stats });
      setBoard(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save your cut');
      setCut(null);
      setSeparated(false);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    try {
      const r = await api.share();
      if (r.ok) {
        setShared(true);
        toast('Posted your result to the comments');
      } else toast(r.message);
    } catch {
      toast('Could not post your comment');
    } finally {
      setBusy(false);
    }
  };

  const wearFlair = async () => {
    try {
      const r = await api.flair();
      toast(r.ok ? `Your flair is now “${r.text}”` : r.message);
    } catch {
      toast('Could not set your flair');
    }
  };

  const switchTab = (t: Tab) => {
    playTick();
    setTab(t);
  };

  const showingCrowd = tab === 'crowd' && crowd !== null;
  const dayChip = puzzle.kind === 'daily' ? `#${puzzle.day}` : 'Player shape';

  const header = (
    <div className="topbar">
      <Wordmark />
      <span className="chip">{dayChip}</span>
      {state.me && state.me.streak > 0 && <span className="chip chip-hot">🔥 {state.me.streak}</span>}
      <span className="grow" />
      <MuteButton />
    </div>
  );

  if (practice) {
    return (
      <main className="game">
        {header}
        <Practice onExit={() => setPractice(false)} />
        <Toaster />
      </main>
    );
  }

  const helper = !line ? (
    <>
      <b>Drag across the shape</b> to draw your cut.
    </>
  ) : !valid ? (
    <>Your line has to cross the shape.</>
  ) : (
    <>
      Drag the red ends to fine-tune. <b>One cut, no do-overs.</b>
    </>
  );

  return (
    <main className="game">
      {header}
      <div className="puzzle-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="puzzle-title">{puzzle.name}</h1>
          <p className="puzzle-sub">
            {puzzle.flavor}
            {!state.isToday && puzzle.kind === 'daily' && ' · archive'}
          </p>
        </div>
        <div className="goal-badge" aria-label={GOAL_LABEL[puzzle.goal]}>
          <span className="big">{goalShort(puzzle.goal)}</span>
          <span className="small">goal</span>
        </div>
      </div>

      <div className="board-wrap">
        <Board
          shape={puzzle.shape}
          color={puzzle.color}
          line={cut ? null : line}
          onLineChange={cut ? undefined : setLine}
          onCommit={() => void doCut()}
          cut={showingCrowd ? null : cut}
          separated={separated}
          crowd={showingCrowd ? crowd.lines : null}
          highlightLine={showingCrowd && result ? result.line : null}
          showHint={!cut && !line}
          label={
            cut
              ? `Your cut split the shape ${formatPct(cut.left)} to ${formatPct(cut.right)}`
              : `${puzzle.name}. ${GOAL_LABEL[puzzle.goal]}. Drag to draw a line, or use arrow keys and brackets to move and rotate it, then Enter to cut.`
          }
        />
      </div>

      {!cut && (
        <>
          <p className="helper" aria-live="polite">
            {helper}
          </p>
          <div className="action-row">
            {line && (
              <button className="btn btn-ghost btn-sm" onClick={() => setLine(null)}>
                Clear
              </button>
            )}
            <button className="btn btn-primary" disabled={!valid || busy} onClick={() => void doCut()}>
              ✂ Cut it
            </button>
          </div>
          <p className="next-up">
            {state.stats.cuts > 0 ? (
              <>
                <b className="mono">{state.stats.cuts.toLocaleString()}</b> Redditors have cut this one. You'll see their cuts after yours.
              </>
            ) : (
              <>Nobody has cut this one yet. Set the bar.</>
            )}
          </p>
        </>
      )}

      {cut && !result && (
        <p className="helper" aria-live="polite">
          Measuring…
        </p>
      )}

      {result && (
        <section className="result" aria-live="polite">
          <div className="tabs" role="tablist">
            {(
              [
                ['you', 'Your cut'],
                ['crowd', `Crowd${state.stats.cuts > 0 ? ` · ${state.stats.cuts.toLocaleString()}` : ''}`],
                ['top', 'Top cuts'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => switchTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'you' && <ScoreCard result={result} state={state} />}

          {tab === 'crowd' && crowd && (
            <div className="panel fade-in">
              <h3>Everyone's cuts</h3>
              <p className="helper" style={{ textAlign: 'left', marginBottom: 12 }}>
                Each faint line is one player's cut. Yours is red.
                {state.stats.avgErr !== null && (
                  <>
                    {' '}
                    The crowd was off by <b className="mono">{formatPct(state.stats.avgErr)}</b> on average.
                  </>
                )}
              </p>
              <Histogram hist={crowd.hist} err={result.err} />
            </div>
          )}

          {tab === 'top' && (
            <div className="panel fade-in">
              <h3>Sharpest cutters</h3>
              <LeaderList data={board} me={state.me?.username ?? null} />
            </div>
          )}

          <div className="action-row">
            {state.loggedIn ? (
              result.saved && (
                <button className="btn btn-primary" disabled={shared || busy} onClick={() => void share()}>
                  {shared ? 'Shared ✓' : 'Comment my result'}
                </button>
              )
            ) : (
              <button className="btn btn-primary" onClick={askLogin}>
                Log in to save your streak
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setPractice(true)}>
              Practice
            </button>
          </div>

          {!state.isToday && state.todayPostId && (
            <div className="action-row">
              <button className="btn btn-ghost" onClick={() => go(postUrl(state.todayPostId!))}>
                Play today's #{state.today} →
              </button>
            </div>
          )}

          <div className="action-row" style={{ gap: 4 }}>
            {state.me?.rank && (
              <button className="link-btn" onClick={() => void wearFlair()}>
                Wear “{state.me.rank}” as your flair
              </button>
            )}
            <button className="link-btn" onClick={(e: MouseEvent<HTMLButtonElement>) => openEntry(e.nativeEvent, 'forge', 'Draw a shape')}>
              Draw a shape for others to cut
            </button>
          </div>

          <p className="next-up">
            Next shape in <Countdown ms={state.nextIn} />
          </p>
        </section>
      )}
      <Toaster />
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
