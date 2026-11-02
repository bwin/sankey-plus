import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crossings,
  cubic,
  describe,
  distanceToRoute,
  flowCurve,
  inflate,
  inside,
  intersects,
  parallelCurve,
  routeCollisions,
  type Point,
  type Rect,
  type Route,
} from '../src/paths.js';

// Exhaustive reference predicates from the original implementation. These
// deliberately omit the optimized bounds rejection and monotone sweep.
function referenceCrossings(a: Route, b: Route): number {
  if (!intersects(a.bounds, b.bounds)) return 0;
  const side = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  for (let i = 1; i < a.points.length; i++)
    for (let j = 1; j < b.points.length; j++) {
      const p = a.points[i - 1],
        q = a.points[i],
        r = b.points[j - 1],
        s = b.points[j];
      if (
        side(p, q, r) * side(p, q, s) < -1e-7 &&
        side(r, s, p) * side(r, s, q) < -1e-7
      )
        return 1;
    }
  return 0;
}
function referenceSegmentHits(a: Point, b: Point, r: Rect): boolean {
  if (inside(a, r) || inside(b, r)) return true;
  let lo = 0,
    hi = 1;
  for (const axis of ['x', 'y'] as const) {
    const v = b[axis] - a[axis],
      min = r[axis] + 1e-5,
      max = r[axis] + (axis === 'x' ? r.w : r.h) - 1e-5;
    if (Math.abs(v) < 1e-9) {
      if (a[axis] <= min || a[axis] >= max) return false;
    } else {
      let t1 = (min - a[axis]) / v,
        t2 = (max - a[axis]) / v;
      if (t1 > t2) [t1, t2] = [t2, t1];
      lo = Math.max(lo, t1);
      hi = Math.min(hi, t2);
      if (lo >= hi) return false;
    }
  }
  return hi > 0 && lo < 1;
}
function referenceCollisions(
  route: Route,
  boxes: Rect[],
  halfWidth: number,
): number {
  const bounds = inflate(route.bounds, halfWidth);
  return boxes.filter(
    (box) =>
      intersects(bounds, box) &&
      route.points.some(
        (p, i) =>
          i > 0 &&
          referenceSegmentHits(route.points[i - 1], p, inflate(box, halfWidth)),
      ),
  ).length;
}
function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const route = (points: number[][]) =>
  describe(
    '',
    points.map(([x, y]) => ({ x, y })),
  );

test('adaptive samples track broad, tight and reversing cubic curves', () => {
  const cases = [
    [
      [0, 0],
      [500, 0],
      [0, 400],
      [500, 400],
    ],
    [
      [0, 0],
      [0, 600],
      [10, -300],
      [10, 200],
    ],
    [
      [0, 0],
      [300, 500],
      [-300, 500],
      [0, 0],
    ],
  ];
  for (const coordinates of cases) {
    const [a, b, c, d] = coordinates.map(([x, y]) => ({ x, y }));
    const curve = cubic(a, b, c, d);
    for (let i = 0; i <= 2000; i++) {
      const t = i / 2000,
        u = 1 - t;
      const p = {
        x:
          u ** 3 * a.x +
          3 * u * u * t * b.x +
          3 * u * t * t * c.x +
          t ** 3 * d.x,
        y:
          u ** 3 * a.y +
          3 * u * u * t * b.y +
          3 * u * t * t * c.y +
          t ** 3 * d.y,
      };
      assert.ok(
        distanceToRoute(p, curve) <= 0.101,
        'geometry checks follow the painted cubic',
      );
    }
  }
});

test('parallel cubic waves preserve ribbon gaps without bulging into adjacent rows', () => {
  for (const sign of [1, -1]) {
    const a = { x: 0, y: 0 },
      b = { x: 180, y: sign * 140 },
      right = { x: 1, y: 0 },
      vertical = { x: 0, y: sign };
    const inner = flowCurve(a, b, right, vertical);
    const outer = parallelCurve(a, b, right, vertical, 24, 24, sign);
    // 10px and 30px ribbons leave 4px between their painted envelopes.
    for (const point of outer.points)
      assert.ok(Math.abs(distanceToRoute(point, inner) - 24) < 0.15);
    const spread = parallelCurve(a, b, right, vertical, 20, 200, sign);
    for (const point of spread.points) {
      assert.ok(point.x >= -0.1 && point.x <= 380.1);
      assert.ok(
        sign * point.y >= -20.1 && sign * point.y <= 140.1,
        'endpoint spread must not enter the previous row',
      );
    }
    // A tenfold increase in destination spacing used to concentrate the
    // turn into a tiny hook. Circumcircles of adjacent samples bound how
    // sharply the actual painted centerline bends, independent of commands.
    for (let i = 1; i < spread.points.length - 1; i++) {
      const a = spread.points[i - 1],
        b = spread.points[i],
        c = spread.points[i + 1];
      const cross = Math.abs(
        (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
      );
      if (cross < 1e-8) continue;
      const radius =
        (Math.hypot(b.x - a.x, b.y - a.y) *
          Math.hypot(c.x - b.x, c.y - b.y) *
          Math.hypot(c.x - a.x, c.y - a.y)) /
        (2 * cross);
      assert.ok(
        radius > 50,
        'wide fan spacing must not create a pinched destination turn',
      );
    }
  }
});

test('crossings and obstacles use the broad bend rather than its routing corner', () => {
  const bend = flowCurve(
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  );
  const across = route([
    [60, 23],
    [110, 23],
  ]);
  assert.equal(crossings(bend, across), 1);
  assert.equal(crossings(across, bend), 1);
  assert.equal(routeCollisions(bend, [{ x: 78, y: 18, w: 4, h: 4 }]), 1);
  assert.equal(routeCollisions(bend, [{ x: 10, y: 40, w: 4, h: 4 }]), 0);
});

test('crossing sweep preserves proper crossings, vertical runs, endpoints and collinearity', () => {
  const cases: [number[][], number[][], number][] = [
    [
      [
        [0, 0],
        [10, 10],
      ],
      [
        [0, 10],
        [10, 0],
      ],
      1,
    ],
    [
      [
        [0, 5],
        [10, 5],
      ],
      [
        [5, 0],
        [5, 10],
      ],
      1,
    ],
    [
      [
        [0, 0],
        [0, 2],
        [0, 2],
        [0, 8],
        [5, 10],
      ],
      [
        [-2, 5],
        [2, 5],
      ],
      1,
    ],
    [
      [
        [0, 0],
        [5, 5],
        [10, 10],
      ],
      [
        [0, 10],
        [5, 5],
        [10, 0],
      ],
      0,
    ],
    [
      [
        [0, 0],
        [10, 10],
      ],
      [
        [2, 2],
        [8, 8],
      ],
      0,
    ],
    [
      [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
      [
        [2, 5],
        [8, 5],
      ],
      1,
    ],
    [
      [
        [0, 0],
        [0, 0],
      ],
      [
        [-1, -1],
        [1, 1],
      ],
      0,
    ],
  ];
  for (const [a, b, expected] of cases)
    for (const reverseA of [false, true])
      for (const reverseB of [false, true]) {
        const first = route(reverseA ? [...a].reverse() : a),
          second = route(reverseB ? [...b].reverse() : b);
        assert.equal(crossings(first, second), expected);
        assert.equal(crossings(second, first), expected);
      }
});

test('optimized crossings agree with exhaustive checks for seeded route pairs', () => {
  const next = random(0x5a4e4b45);
  const makeRoute = (monotone: boolean) => {
    let x = -50;
    const points = Array.from({ length: 2 + Math.floor(next() * 28) }, () => {
      x = monotone ? x + Math.floor(next() * 10) : next() * 100 - 50;
      return { x, y: next() * 100 - 50 };
    });
    if (next() < 0.5) points.reverse();
    return describe('', points);
  };
  for (let i = 0; i < 4000; i++) {
    const a = makeRoute(i % 3 !== 0),
      b = makeRoute(i % 3 !== 1);
    assert.equal(crossings(a, b), referenceCrossings(a, b), `pair ${i}`);
    assert.equal(
      crossings(b, a),
      referenceCrossings(a, b),
      `reversed pair ${i}`,
    );
  }
});

test('obstacle clipping preserves near-boundary, parallel, tangent and degenerate cases', () => {
  const boxes = [
    { x: 0, y: 0, w: 10, h: 10 },
    { x: -2, y: 3, w: 0, h: 2 },
  ];
  const points = [
    -1,
    0,
    1e-5 - 1e-10,
    1e-5,
    1e-5 + 1e-10,
    5,
    10 - 1e-5,
    10,
    11,
  ];
  for (const x of points)
    for (const y of points)
      for (const delta of [0, 1e-10, -1e-10, 20, -20]) {
        for (const end of [
          { x: x + delta, y: 11 },
          { x: 11, y: y + delta },
          { x, y },
        ]) {
          const r = describe('', [{ x, y }, end]);
          for (const halfWidth of [0, 1e-5, 2])
            assert.equal(
              routeCollisions(r, boxes, halfWidth),
              referenceCollisions(r, boxes, halfWidth),
            );
        }
      }
});

test('optimized obstacle checks agree with exhaustive clipping for seeded routes and widths', () => {
  const next = random(0x524f5554);
  for (let i = 0; i < 1500; i++) {
    const r = describe(
      '',
      Array.from({ length: 2 + Math.floor(next() * 12) }, () => ({
        x: next() * 200 - 100,
        y: next() * 200 - 100,
      })),
    );
    const boxes = Array.from({ length: 8 }, () => ({
      x: next() * 200 - 100,
      y: next() * 200 - 100,
      w: next() * 30,
      h: next() * 30,
    }));
    const halfWidth = next() * 12;
    assert.equal(
      routeCollisions(r, boxes, halfWidth),
      referenceCollisions(r, boxes, halfWidth),
      `route ${i}`,
    );
  }
});

test('epsilon-sized and zero-size obstacles retain the original clipping behavior', () => {
  const sizes = [0, 1e-6, 1e-5, 2e-5, 1],
    values = [-1, -1e-5, -1e-6, 0, 1e-6, 1e-5, 1];
  const boxes = sizes.flatMap((w) => sizes.map((h) => ({ x: 0, y: 0, w, h })));
  for (const x of values)
    for (const y of values)
      for (const endX of values)
        for (const endY of values) {
          const r = describe('', [
            { x, y },
            { x: endX, y: endY },
          ]);
          for (const box of boxes)
            assert.equal(
              routeCollisions(r, [box]),
              referenceCollisions(r, [box], 0),
            );
        }
});
