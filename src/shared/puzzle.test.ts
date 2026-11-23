import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSimpleRing, shapeArea, splitShape, signedArea, type Shape } from './geometry';
import { cutError, dailyPuzzle, dayNumberAt, practicePuzzle, EPOCH_UTC } from './puzzle';

const square: Shape = {
  rings: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  ],
};

test('vertical cut through the middle of a square is 50/50', () => {
  const s = splitShape(square, { a: { x: 0.5, y: -1 }, b: { x: 0.5, y: 2 } });
  assert.ok(Math.abs(s.left - 50) < 1e-9);
});

test('cut at x=0.25 gives 25/75 regardless of line direction', () => {
  const a = splitShape(square, { a: { x: 0.25, y: 0 }, b: { x: 0.25, y: 1 } });
  const b = splitShape(square, { a: { x: 0.25, y: 1 }, b: { x: 0.25, y: 0 } });
  assert.ok(Math.abs(Math.min(a.left, a.right) - 25) < 1e-9);
  assert.ok(Math.abs(a.left - b.right) < 1e-9);
});

test('holes subtract area and are handled when cutting', () => {
  const hole = [
    { x: 0.25, y: 0.25 },
    { x: 0.25, y: 0.75 },
    { x: 0.75, y: 0.75 },
    { x: 0.75, y: 0.25 },
  ];
  assert.ok(signedArea(hole) * signedArea(square.rings[0]!) < 0);
  const donut: Shape = { rings: [square.rings[0]!, hole] };
  assert.ok(Math.abs(shapeArea(donut) - 0.75) < 1e-9);
  // Cut at x=0.25: left strip is 0.25 of 0.75 total = 33.3%.
  const s = splitShape(donut, { a: { x: 0.25, y: 0 }, b: { x: 0.25, y: 1 } });
  assert.ok(Math.abs(Math.min(s.left, s.right) - 100 / 3) < 1e-9);
});

test('concave L-shape cut is exact', () => {
  const L: Shape = {
    rings: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 1 },
      ],
    ],
  };
  // Total 0.75. A horizontal cut at y=0.5 leaves 0.5 above -> 66.7%.
  const s = splitShape(L, { a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 } });
  assert.ok(Math.abs(Math.max(s.left, s.right) - 200 / 3) < 1e-9);
});

test('third goal accepts either piece', () => {
  assert.ok(cutError('third', 100 / 3) < 1e-9);
  assert.ok(cutError('third', 200 / 3) < 1e-9);
  assert.ok(Math.abs(cutError('half', 47) - 3) < 1e-9);
});

test('daily puzzles are deterministic, simple and fit the board', () => {
  for (let d = 1; d <= 120; d++) {
    const p = dailyPuzzle(d);
    const q = dailyPuzzle(d);
    assert.deepEqual(p, q);
    assert.ok(shapeArea(p.shape) > 0.08, `day ${d} too small`);
    for (const r of p.shape.rings) {
      assert.ok(isSimpleRing(r), `day ${d} ring not simple`);
      for (const pt of r) assert.ok(pt.x >= 0.05 && pt.x <= 0.95 && pt.y >= 0.05 && pt.y <= 0.95);
    }
  }
  for (let s = 0; s < 200; s++) {
    const p = practicePuzzle(s);
    for (const r of p.shape.rings) assert.ok(isSimpleRing(r), `practice ${s} ring not simple`);
  }
});

test('day numbers start at 1 on the epoch', () => {
  assert.equal(dayNumberAt(EPOCH_UTC), 1);
  assert.equal(dayNumberAt(EPOCH_UTC + 86_400_000 - 1), 1);
  assert.equal(dayNumberAt(EPOCH_UTC + 86_400_000), 2);
});

test('closed loops simplify into a valid ring', async () => {
  const { simplifyLoop } = await import('./geometry');
  const pts = Array.from({ length: 241 }, (_, i) => {
    const t = (i / 240) * Math.PI * 2;
    const r = 0.3 + 0.08 * Math.sin(3 * t);
    return { x: 0.5 + r * Math.cos(t), y: 0.5 + r * Math.sin(t) };
  });
  const ring = simplifyLoop(pts.slice(0, -1), 0.003);
  assert.ok(ring.length >= 12 && ring.length <= 120, `got ${ring.length}`);
  assert.ok(isSimpleRing(ring));
});
