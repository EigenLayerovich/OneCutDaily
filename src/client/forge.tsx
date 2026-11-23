import './styles.css';

import { StrictMode, useRef, useState, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { fitShape, isSimpleRing, signedArea, simplifyLoop, type Pt, type Shape } from '../shared/geometry';
import { hashString, PAPER, type Goal } from '../shared/puzzle';
import { api } from './lib/api';
import { askLogin, go, inReddit, toast } from './lib/platform';
import { buzz, playTick } from './lib/sound';
import { Board } from './components/Board';
import { MuteButton, Toaster, Wordmark } from './components/ui';

const EMPTY: Shape = { rings: [] };

const finish = (raw: Pt[]): { ring: Pt[] } | { error: string } => {
  if (raw.length < 12) return { error: 'Draw a bigger shape: one loop, finger down the whole time.' };
  let eps = 0.003;
  // Drop trailing points that land back on the start; the loop closes itself.
  const start = raw[0]!;
  let end = raw.length;
  while (end > 2 && Math.hypot(raw[end - 1]!.x - start.x, raw[end - 1]!.y - start.y) < 0.015) end--;
  const loop = raw.slice(0, end);
  let ring = simplifyLoop(loop, eps);
  while (ring.length > 160) {
    eps *= 1.5;
    ring = simplifyLoop(loop, eps);
  }
  if (ring.length < 6) return { error: 'Draw a bigger shape.' };
  if (!isSimpleRing(ring)) return { error: 'Your outline crosses itself. Try one clean loop.' };
  if (Math.abs(signedArea(ring)) < 0.02) return { error: 'That shape is too small. Fill more of the mat.' };
  return { ring };
};

const Forge = () => {
  const wrap = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const [raw, setRaw] = useState<Pt[]>([]);
  const [ring, setRing] = useState<Pt[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<Goal>('half');
  const [posting, setPosting] = useState(false);

  const toUnit = (e: PointerEvent<HTMLDivElement>): Pt => {
    const r = wrap.current!.getBoundingClientRect();
    return {
      x: Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)),
      y: Math.min(0.98, Math.max(0.02, (e.clientY - r.top) / r.height)),
    };
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    wrap.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    setRing(null);
    setProblem(null);
    setRaw([toUnit(e)]);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drawing.current) return;
    const p = toUnit(e);
    setRaw((pts) => {
      const last = pts[pts.length - 1];
      if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.006) return pts;
      return pts.length > 1500 ? pts : [...pts, p];
    });
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const r = finish(raw);
    if ('error' in r) {
      setProblem(r.error);
      buzz(40);
    } else {
      setRing(r.ring);
      setRaw([]);
      playTick();
    }
  };

  const shape: Shape = ring ? fitShape({ rings: [ring] }, 0.1) : EMPTY;
  const color = hashString(name || 'shape') % PAPER.length;

  const post = async () => {
    if (!ring) return;
    setPosting(true);
    try {
      const r = await api.createShape({ name, ring, goal });
      if (r.ok) {
        toast('Posted! Opening your shape…');
        go(r.url);
      } else {
        toast(r.message);
        if (r.message.startsWith('Log in')) askLogin();
      }
    } catch {
      toast('Could not post your shape');
    } finally {
      setPosting(false);
    }
  };

  return (
    <main className="game">
      <div className="topbar">
        <Wordmark />
        <span className="chip">Shape maker</span>
        <span className="grow" />
        <MuteButton />
      </div>
      <div className="puzzle-head">
        <div>
          <h1 className="puzzle-title">Draw a shape for others to cut</h1>
          <p className="puzzle-sub">One loop, finger down the whole time. It becomes its own post.</p>
        </div>
      </div>
      <div
        className="board-wrap"
        ref={wrap}
        style={{ touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <Board
          shape={shape}
          color={color}
          draft={raw.length > 0 ? raw : null}
          showHint={false}
          label={ring ? 'Your shape' : 'Empty mat. Draw a closed shape with your finger or mouse.'}
        />
      </div>
      <p className="helper" aria-live="polite">
        {problem ?? (ring ? 'Looks good. Name it and choose the goal.' : 'Draw anywhere on the mat.')}
      </p>
      {ring && (
        <div className="result fade-in" style={{ gap: 10 }}>
          <label className="sr-only" htmlFor="shape-name">
            Shape name
          </label>
          <input
            id="shape-name"
            className="field"
            maxLength={40}
            placeholder="Name it, e.g. My Cat Loaf"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="action-row" style={{ justifyContent: 'space-between' }}>
            <div className="seg" role="group" aria-label="Goal">
              {(
                [
                  ['half', '50 / 50'],
                  ['third', '⅓'],
                  ['quarter', '¼'],
                ] as const
              ).map(([g, l]) => (
                <button key={g} aria-pressed={goal === g} onClick={() => setGoal(g)}>
                  {l}
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary"
              disabled={posting || name.trim().length < 2}
              onClick={() => void post()}
            >
              {inReddit() ? 'Post it' : 'Post it (Reddit only)'}
            </button>
          </div>
          <div className="action-row">
            <button className="link-btn" onClick={() => setRing(null)}>
              Start over
            </button>
          </div>
        </div>
      )}
      <Toaster />
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Forge />
  </StrictMode>
);
