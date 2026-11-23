import { useEffect, useState } from 'react';
import { HIST_EDGES, histBucket } from '../../shared/puzzle';
import type { LeaderboardResponse } from '../../shared/api';
import { onToast } from '../lib/platform';
import { isMuted, setMuted } from '../lib/sound';

export const Wordmark = ({ size = 22 }: { size?: number }) => (
  <span className="wordmark" style={{ fontSize: size }} aria-label="One Cut">
    one<span className="slash">/</span>cut
  </span>
);

export const Blades = ({ on, of = 4 }: { on: number; of?: number }) => (
  <span className="blades" aria-label={`${on} of ${of} blades`}>
    {Array.from({ length: of }, (_, i) => (
      <span key={i} className={`blade${i < on ? ' on' : ''}`} />
    ))}
  </span>
);

export const Histogram = ({ hist, err }: { hist: number[]; err: number | null }) => {
  const max = Math.max(1, ...hist);
  const mine = err === null ? -1 : histBucket(err);
  const total = hist.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="hist" role="img" aria-label={`Error distribution of ${total} cuts`}>
        {hist.map((n, i) => (
          <div className="hist-col" key={i}>
            <div
              className={`hist-bar${i === mine ? ' me' : ''}`}
              style={{ height: `${Math.max(3, (n / max) * 100)}%` }}
              title={`${n} cuts`}
            />
            <span className="hist-label">
              {HIST_EDGES[i] === Infinity ? '10+' : String(HIST_EDGES[i])}
            </span>
          </div>
        ))}
      </div>
      <p className="helper" style={{ textAlign: 'left', marginTop: 8, fontSize: 13 }}>
        How far off everyone was, in percentage points. Left is sharper.
      </p>
    </div>
  );
};

export const LeaderList = ({ data, me }: { data: LeaderboardResponse | null; me: string | null }) => {
  if (!data) return <div className="spinner" style={{ margin: '12px auto' }} />;
  if (data.top.length === 0) return <p className="helper">No saved cuts yet. Be the first.</p>;
  const meInTop = data.top.some((r) => r.username === me);
  return (
    <ol className="lb">
      {data.top.map((r, i) => (
        <li key={r.username} className={r.username === me ? 'me' : ''}>
          <span className="pos">{i + 1}</span>
          <span className="name">u/{r.username}</span>
          <span className="err">±{r.err.toFixed(2)}</span>
        </li>
      ))}
      {!meInTop && data.me && me && (
        <li className="me">
          <span className="pos">{data.me.position}</span>
          <span className="name">u/{me}</span>
          <span className="err">±{data.me.err.toFixed(2)}</span>
        </li>
      )}
    </ol>
  );
};

export const MuteButton = () => {
  const [m, setM] = useState(isMuted());
  return (
    <button
      className="icon-btn"
      aria-label={m ? 'Unmute sounds' : 'Mute sounds'}
      aria-pressed={m}
      onClick={() => {
        setMuted(!m);
        setM(!m);
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {m ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
    </button>
  );
};

export const Toaster = () => {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    onToast((s) => {
      setText(s);
      clearTimeout(t);
      t = setTimeout(() => setText(null), 2600);
    });
    return () => {
      onToast(null);
      clearTimeout(t);
    };
  }, []);
  return text ? (
    <div className="toast pop" role="status">
      {text}
    </div>
  ) : null;
};

export const Countdown = ({ ms }: { ms: number }) => {
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setLeft(Math.max(0, ms - (Date.now() - start))), 1000);
    return () => clearInterval(id);
  }, [ms]);
  const s = Math.floor(left / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return <span className="mono">{`${hh}:${mm}:${ss}`}</span>;
};

/** Animate a number from 0 to `to` once. */
export const useCountUp = (to: number, ms = 700) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(to * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
};
