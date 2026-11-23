import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  extendToBox,
  halfPlanePolygon,
  lineNormal,
  pieceCentroid,
  ringToPath,
  shapeToPath,
  type Line,
  type Pt,
  type Shape,
} from '../../shared/geometry';
import { formatPct, PAPER } from '../../shared/puzzle';

const S = 1000;

export type CutView = { line: Line; left: number; right: number };

type Props = {
  shape: Shape;
  color: number;
  line?: Line | null | undefined;
  onLineChange?: ((l: Line | null) => void) | undefined;
  onCommit?: (() => void) | undefined;
  cut?: CutView | null;
  separated?: boolean;
  crowd?: Line[] | null;
  highlightLine?: Line | null;
  showHint?: boolean;
  label: string;
  /** Freehand drawing mode for the shape maker. */
  draft?: Pt[] | null;
};

type Drag = { kind: 'new' | 'a' | 'b'; start: Pt } | null;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const Board = ({
  shape,
  color,
  line = null,
  onLineChange,
  onCommit,
  cut = null,
  separated = false,
  crowd = null,
  highlightLine = null,
  showHint = false,
  label,
  draft = null,
}: Props) => {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag>(null);
  const interactive = Boolean(onLineChange) && !cut;
  const paper = PAPER[color % PAPER.length]!;

  const toUnit = (e: PointerEvent<SVGSVGElement>): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / r.width, -0.02, 1.02),
      y: clamp((e.clientY - r.top) / r.height, -0.02, 1.02),
    };
  };

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!interactive || !onLineChange) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toUnit(e);
    const near = (q: Pt) => Math.hypot(q.x - p.x, q.y - p.y) < 0.06;
    if (line && near(line.a)) drag.current = { kind: 'a', start: p };
    else if (line && near(line.b)) drag.current = { kind: 'b', start: p };
    else {
      drag.current = { kind: 'new', start: p };
      onLineChange({ a: p, b: p });
    }
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || !onLineChange) return;
    const p = toUnit(e);
    if (d.kind === 'new') onLineChange({ a: d.start, b: p });
    else if (line && d.kind === 'a') onLineChange({ a: p, b: line.b });
    else if (line && d.kind === 'b') onLineChange({ a: line.a, b: p });
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !onLineChange || !line) return;
    if (Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) < 0.03) onLineChange(null);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!interactive || !onLineChange) return;
    const base: Line = line ?? { a: { x: 0.2, y: 0.5 }, b: { x: 0.8, y: 0.5 } };
    const step = e.shiftKey ? 0.02 : 0.004;
    const move = (dx: number, dy: number): Line => ({
      a: { x: base.a.x + dx, y: base.a.y + dy },
      b: { x: base.b.x + dx, y: base.b.y + dy },
    });
    const rotate = (deg: number): Line => {
      const cx = (base.a.x + base.b.x) / 2;
      const cy = (base.a.y + base.b.y) / 2;
      const t = (deg * Math.PI) / 180;
      const rot = (p: Pt): Pt => ({
        x: cx + (p.x - cx) * Math.cos(t) - (p.y - cy) * Math.sin(t),
        y: cy + (p.x - cx) * Math.sin(t) + (p.y - cy) * Math.cos(t),
      });
      return { a: rot(base.a), b: rot(base.b) };
    };
    const map: Record<string, () => Line> = {
      ArrowLeft: () => move(-step, 0),
      ArrowRight: () => move(step, 0),
      ArrowUp: () => move(0, -step),
      ArrowDown: () => move(0, step),
      '[': () => rotate(e.shiftKey ? -5 : -1),
      ']': () => rotate(e.shiftKey ? 5 : 1),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      onLineChange(fn());
    } else if (e.key === 'Enter' && line && onCommit) {
      e.preventDefault();
      onCommit();
    }
  };

  const shapePath = shapeToPath(shape, S);
  const shown = line ? extendToBox(line, 0, 1) : null;
  const normal = cut ? lineNormal(cut.line) : null;
  const off = separated ? 24 : 0;
  const crowdOpacity = crowd ? Math.max(0.07, Math.min(0.55, 9 / Math.max(1, crowd.length))) : 0;

  const pieceStyle = (sign: 1 | -1) =>
    normal ? { transform: `translate(${normal.x * off * sign}px, ${normal.y * off * sign}px)` } : undefined;

  const labelAt = (positive: boolean, pct: number) => {
    if (!cut || !normal) return null;
    const c = pieceCentroid(shape, cut.line, positive);
    return (
      <text
        className="piece-label"
        x={c.x * S}
        y={c.y * S}
        fill={paper.ink}
        stroke={paper.fill}
        strokeWidth={16}
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {formatPct(pct)}
      </text>
    );
  };

  return (
    <svg
      ref={svgRef}
      className={`board${interactive ? ' interactive' : ''}${cut && separated ? ' cut-done' : ''}`}
      viewBox={`0 0 ${S} ${S}`}
      role={interactive ? 'application' : 'img'}
      aria-label={label}
      tabIndex={interactive ? 0 : -1}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    >
      <defs>
        <pattern id={`g${uid}`} width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0H0V50" fill="none" stroke="rgba(247,239,221,0.06)" strokeWidth="2" />
        </pattern>
        <pattern id={`G${uid}`} width="250" height="250" patternUnits="userSpaceOnUse">
          <path d="M250 0H0V250" fill="none" stroke="rgba(247,239,221,0.12)" strokeWidth="3" />
        </pattern>
        {cut && (
          <>
            <clipPath id={`L${uid}`}>
              <path d={ringToPath(halfPlanePolygon(cut.line, true), S)} />
            </clipPath>
            <clipPath id={`R${uid}`}>
              <path d={ringToPath(halfPlanePolygon(cut.line, false), S)} />
            </clipPath>
          </>
        )}
      </defs>

      <rect width={S} height={S} fill="var(--mat)" />
      <rect width={S} height={S} fill={`url(#g${uid})`} />
      <rect width={S} height={S} fill={`url(#G${uid})`} />
      {[125, 375, 625, 875].map((v) => (
        <g key={v} stroke="rgba(247,239,221,0.16)" strokeWidth="3">
          <path d={`M${v} 0V22M${v} ${S}V${S - 22}M0 ${v}H22M${S} ${v}H${S - 22}`} />
        </g>
      ))}

      {!cut && !draft && (
        <g className="paper">
          <path d={shapePath} fill={paper.fill} fillRule="evenodd" />
        </g>
      )}

      {cut && (
        <>
          <g className="piece paper" style={pieceStyle(1)}>
            <g clipPath={`url(#L${uid})`}>
              <path d={shapePath} fill={paper.fill} fillRule="evenodd" />
            </g>
          </g>
          <g className="piece paper" style={pieceStyle(-1)}>
            <g clipPath={`url(#R${uid})`}>
              <path d={shapePath} fill={paper.fill} fillRule="evenodd" opacity={0.92} />
            </g>
          </g>
        </>
      )}

      {crowd && crowd.length > 0 && (
        <g className="crowd-line fade-in" stroke="#fff6e2" strokeWidth="2.5" strokeLinecap="round">
          {crowd.map((l, i) => (
            <line
              key={i}
              x1={l.a.x * S}
              y1={l.a.y * S}
              x2={l.b.x * S}
              y2={l.b.y * S}
              opacity={crowdOpacity}
            />
          ))}
        </g>
      )}

      {highlightLine && (
        <line
          x1={highlightLine.a.x * S}
          y1={highlightLine.a.y * S}
          x2={highlightLine.b.x * S}
          y2={highlightLine.b.y * S}
          stroke="var(--accent)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      )}

      {cut && (
        <g style={{ pointerEvents: 'none' }}>
          <g style={pieceStyle(1)} className="piece">
            {labelAt(true, cut.left)}
          </g>
          <g style={pieceStyle(-1)} className="piece">
            {labelAt(false, cut.right)}
          </g>
        </g>
      )}

      {draft && draft.length > 1 && (
        <path
          d={'M' + draft.map((p) => `${(p.x * S).toFixed(1)} ${(p.y * S).toFixed(1)}`).join('L')}
          fill={draft.length > 2 ? paper.fill : 'none'}
          fillOpacity={0.35}
          stroke={paper.fill}
          strokeWidth="8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {showHint && !line && !cut && (
        <g pointerEvents="none">
          <line
            className="hint-sweep"
            x1="90"
            y1="760"
            x2="910"
            y2="240"
            stroke="var(--ink)"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>
      )}

      {shown && line && !cut && (
        <g pointerEvents="none">
          <line
            x1={shown.a.x * S}
            y1={shown.a.y * S}
            x2={shown.b.x * S}
            y2={shown.b.y * S}
            stroke="#10261c"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.35"
          />
          <line
            className="draw-line"
            x1={shown.a.x * S}
            y1={shown.a.y * S}
            x2={shown.b.x * S}
            y2={shown.b.y * S}
            stroke="var(--ink)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {[line.a, line.b].map((p, i) => (
            <circle
              key={i}
              cx={p.x * S}
              cy={p.y * S}
              r="20"
              fill="var(--accent)"
              stroke="#10261c"
              strokeWidth="5"
            />
          ))}
        </g>
      )}
    </svg>
  );
};
