export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Route {
  path: string;
  points: Point[];
  bounds: Rect;
  length: number;
}
const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-5;
export const inside = (p: Point, r: Rect) =>
  p.x > r.x + 1e-5 &&
  p.x < r.x + r.w - 1e-5 &&
  p.y > r.y + 1e-5 &&
  p.y < r.y + r.h - 1e-5;
export const inflate = (r: Rect, p: number): Rect => ({
  x: r.x - p,
  y: r.y - p,
  w: r.w + 2 * p,
  h: r.h + 2 * p,
});
export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const num = (v: number) => Number(v.toFixed(3));
const xy = (p: Point) => `${num(p.x)} ${num(p.y)}`;
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const CURVE_TOLERANCE = 0.1,
  OFFSET_TOLERANCE = 0.025,
  BEND_HANDLE = 0.8;
export function describe(path: string, points: Point[]): Route {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return {
    path,
    points,
    length,
    bounds: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    },
  };
}
export function cubic(a: Point, b: Point, c: Point, d: Point): Route {
  // Subdivide the actual rendered cubic until its control hull is within a
  // tenth of a pixel of the chord. Long straight portions need no extra work.
  // All consumers (routing scores, hit testing and labels) use these samples.
  const points: Point[] = [a];
  const sample = (a: Point, b: Point, c: Point, d: Point, depth: number) => {
    if (
      depth >= 16 ||
      Math.max(distanceToSegment(b, a, d), distanceToSegment(c, a, d)) <=
        CURVE_TOLERANCE
    ) {
      points.push(d);
      return;
    }
    const ab = mix(a, b, 0.5),
      bc = mix(b, c, 0.5),
      cd = mix(c, d, 0.5);
    const abc = mix(ab, bc, 0.5),
      bcd = mix(bc, cd, 0.5),
      mid = mix(abc, bcd, 0.5);
    sample(a, ab, abc, mid, depth + 1);
    sample(mid, bcd, cd, d, depth + 1);
  };
  sample(a, b, c, d, 0);
  return describe(`M${xy(a)} C${xy(b)} ${xy(c)} ${xy(d)}`, points);
}
/** Smooth endpoint-tangent connector, including the degenerate straight case. */
export function flowCurve(
  start: Point,
  end: Point,
  outgoing: Point,
  incoming: Point,
  tension = BEND_HANDLE,
): Route {
  const dx = Math.abs(end.x - start.x),
    dy = Math.abs(end.y - start.y);
  const handle = (direction: Point) => (direction.x ? dx : dy) * tension;
  return cubic(
    start,
    {
      x: start.x + outgoing.x * handle(outgoing),
      y: start.y + outgoing.y * handle(outgoing),
    },
    {
      x: end.x - incoming.x * handle(incoming),
      y: end.y - incoming.y * handle(incoming),
    },
    end,
  );
}
export function joinRoutes(routes: Route[]): Route {
  return describe(
    routes[0].path +
      routes
        .slice(1)
        .map((route) => route.path.slice(route.path.indexOf(' C')))
        .join(''),
    [routes[0].points[0], ...routes.flatMap((route) => route.points.slice(1))],
  );
}
/** Follow a shared wave between axis-aligned tangents. Equal offsets also support parallel tangents. Offsets ease in/out so the
 * endpoint tangents stay on the node faces. Fit the offset itself with cubics;
 * painting and collision checks therefore never use different centerlines. */
export function parallelCurve(
  start: Point,
  end: Point,
  outgoing: Point,
  incoming: Point,
  fromOffset: number,
  toOffset: number,
  side: number,
  tension = BEND_HANDLE,
): Route {
  if (!fromOffset && !toOffset)
    return flowCurve(start, end, outgoing, incoming, tension);
  const dx = Math.abs(end.x - start.x),
    dy = Math.abs(end.y - start.y);
  const h1 = (outgoing.x ? dx : dy) * tension,
    h2 = (incoming.x ? dx : dy) * tension;
  const b = { x: start.x + outgoing.x * h1, y: start.y + outgoing.y * h1 };
  const c = { x: end.x - incoming.x * h2, y: end.y - incoming.y * h2 };
  const evaluate = (t: number) => {
    const u = 1 - t;
    const p = {
      x:
        u ** 3 * start.x +
        3 * u * u * t * b.x +
        3 * u * t * t * c.x +
        t ** 3 * end.x,
      y:
        u ** 3 * start.y +
        3 * u * u * t * b.y +
        3 * u * t * t * c.y +
        t ** 3 * end.y,
    };
    const v = {
      x:
        3 * u * u * (b.x - start.x) +
        6 * u * t * (c.x - b.x) +
        3 * t * t * (end.x - c.x),
      y:
        3 * u * u * (b.y - start.y) +
        6 * u * t * (c.y - b.y) +
        3 * t * t * (end.y - c.y),
    };
    const a = {
      x: 6 * u * (c.x - 2 * b.x + start.x) + 6 * t * (end.x - 2 * c.x + b.x),
      y: 6 * u * (c.y - 2 * b.y + start.y) + 6 * t * (end.y - 2 * c.y + b.y),
    };
    const speed = Math.hypot(v.x, v.y) || 1,
      normal = { x: (side * v.y) / speed, y: (-side * v.x) / speed };
    const acceleration = (v.x * a.x + v.y * a.y) / (speed * speed);
    const normalDerivative = {
      x: (side * a.y) / speed - normal.x * acceleration,
      y: (-side * a.x) / speed - normal.y * acceleration,
    };
    // Scale the normal independently along each port axis. A scalar radial
    // offset concentrates a wide fan's spread at its destination and creates
    // a pinched hook. Axis offsets spread it across the entire bend, staying
    // within the endpoint rectangle even when the two spacings differ.
    const xOffset = outgoing.x ? toOffset : fromOffset;
    const yOffset = outgoing.x ? fromOffset : toOffset;
    return {
      p: { x: p.x + normal.x * xOffset, y: p.y + normal.y * yOffset },
      v: {
        x: v.x + normalDerivative.x * xOffset,
        y: v.y + normalDerivative.y * yOffset,
      },
    };
  };
  const curves: Route[] = [];
  const fit = (lo: number, hi: number, depth: number) => {
    const a = evaluate(lo),
      d = evaluate(hi),
      step = (hi - lo) / 3;
    const b = { x: a.p.x + a.v.x * step, y: a.p.y + a.v.y * step },
      c = { x: d.p.x - d.v.x * step, y: d.p.y - d.v.y * step };
    const error = [0.25, 0.5, 0.75].some((t) => {
      const u = 1 - t,
        p = evaluate(lo + (hi - lo) * t).p;
      return (
        Math.hypot(
          p.x -
            (u ** 3 * a.p.x +
              3 * u * u * t * b.x +
              3 * u * t * t * c.x +
              t ** 3 * d.p.x),
          p.y -
            (u ** 3 * a.p.y +
              3 * u * u * t * b.y +
              3 * u * t * t * c.y +
              t ** 3 * d.p.y),
        ) > OFFSET_TOLERANCE
      );
    });
    if (error && depth < 10) {
      const mid = (lo + hi) / 2;
      fit(lo, mid, depth + 1);
      fit(mid, hi, depth + 1);
    } else curves.push(cubic(a.p, b, c, d.p));
  };
  fit(0, 1, 0);
  return joinRoutes(curves);
}
/** Waypoints describe routing corridors, not painted elbows. Interpolate their
 * midpoints with tangent-continuous cubic waves spanning each available bend. */
export function smoothPolyline(input: Point[], span = Infinity): Route {
  const points: Point[] = [];
  for (const point of input) {
    if (points.length && near(points.at(-1)!, point)) continue;
    while (points.length > 1) {
      const a = points.at(-2)!,
        b = points.at(-1)!;
      if (
        Math.abs(
          (b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x),
        ) > 1e-5 ||
        (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) < 0
      )
        break;
      points.pop();
    }
    points.push(point);
  }
  if (points.length < 2) return describe(`M${xy(points[0])}`, points);
  const direction = (a: Point, b: Point) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  };
  if (Number.isFinite(span)) {
    const curves: Route[] = [];
    let prior = points[0];
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1],
        b = points[i],
        c = points[i + 1];
      const before = Math.hypot(b.x - a.x, b.y - a.y),
        after = Math.hypot(c.x - b.x, c.y - b.y);
      const start = mix(b, a, Math.min(span, before / 2) / before),
        end = mix(b, c, Math.min(span, after / 2) / after);
      const incoming = direction(a, b),
        outgoing = direction(b, c);
      if (!near(prior, start))
        curves.push(flowCurve(prior, start, incoming, incoming));
      curves.push(flowCurve(start, end, incoming, outgoing));
      prior = end;
    }
    const end = points.at(-1)!,
      tangent = direction(points.at(-2)!, end);
    if (!near(prior, end) || !curves.length)
      curves.push(flowCurve(prior, end, tangent, tangent));
    return joinRoutes(curves);
  }
  const knots = [
    points[0],
    ...points.slice(1, -2).map((point, i) => mix(point, points[i + 2], 0.5)),
    points.at(-1)!,
  ];
  const tangents = [
    direction(points[0], points[1]),
    ...points.slice(1, -2).map((point, i) => direction(point, points[i + 2])),
    direction(points.at(-2)!, points.at(-1)!),
  ];
  const curves = knots
    .slice(1)
    .map((point, i) =>
      flowCurve(knots[i], point, tangents[i], tangents[i + 1]),
    );
  return joinRoutes(curves);
}
export function pointAt(route: Route, fraction: number): Point {
  let remaining = route.length * fraction;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i],
      length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length) return mix(a, b, length ? remaining / length : 0);
    remaining -= length;
  }
  return route.points[route.points.length - 1];
}
export function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = dx * dx + dy * dy,
    t = len
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
      : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function distanceToRoute(p: Point, route: Route) {
  let d = Infinity;
  for (let i = 1; i < route.points.length; i++)
    d = Math.min(d, distanceToSegment(p, route.points[i - 1], route.points[i]));
  return d;
}
/** Approximate overlapping ribbon length. Merely touching edges are allowed. */
export function ribbonOverlap(
  a: Route,
  aWidth: number,
  b: Route,
  bWidth: number,
  tolerance = 0.25,
): number {
  const clearance = (aWidth + bWidth) / 2 - tolerance;
  if (clearance <= 0 || !intersects(inflate(a.bounds, clearance), b.bounds))
    return 0;
  const covered = (route: Route, other: Route) => {
    let length = 0;
    for (let i = 1; i < route.points.length; i++) {
      const start = route.points[i - 1],
        end = route.points[i];
      const span = Math.hypot(end.x - start.x, end.y - start.y);
      const count = Math.max(1, Math.ceil(span / 8));
      for (let j = 0; j < count; j++) {
        const distance = distanceToRoute(
          mix(start, end, (j + 0.5) / count),
          other,
        );
        // Weight shallow contact less than a deeply overlapping run.
        length += (Math.max(0, 1 - distance / clearance) * span) / count;
      }
    }
    return length;
  };
  return (covered(a, b) + covered(b, a)) / 2;
}
/** Bounds of a flat-capped stroke; endpoints do not extend along their tangent. */
export function ribbonBounds(route: Route, width: number): Rect {
  const points: Point[] = [];
  for (let i = 0; i < route.points.length; i++) {
    const p = route.points[i],
      a = route.points[Math.max(0, i - 1)],
      b = route.points[Math.min(route.points.length - 1, i + 1)];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1,
      dx = ((-(b.y - a.y) / length) * width) / 2,
      dy = (((b.x - a.x) / length) * width) / 2;
    points.push({ x: p.x + dx, y: p.y + dy }, { x: p.x - dx, y: p.y - dy });
  }
  return describe('', points).bounds;
}
/** A variable-width ribbon, sampled from the same centerline used for routing.
 * Ease width along arc length; flat caps meet the axis-aligned node faces. */
export function taperedRibbon(
  route: Route,
  startWidth: number,
  endWidth: number,
) {
  const centers: { p: Point; distance: number }[] = [
    { p: route.points[0], distance: 0 },
  ];
  let distance = 0;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i],
      span = Math.hypot(b.x - a.x, b.y - a.y);
    const count = Math.max(1, Math.ceil(span / 4));
    for (let j = 1; j <= count; j++)
      centers.push({
        p: mix(a, b, j / count),
        distance: distance + (span * j) / count,
      });
    distance += span;
  }
  const left: Point[] = [],
    right: Point[] = [];
  for (let i = 0; i < centers.length; i++) {
    const p = centers[i].p,
      a = centers[Math.max(0, i - 1)].p,
      b = centers[Math.min(centers.length - 1, i + 1)].p;
    let dx = b.x - a.x,
      dy = b.y - a.y;
    if (i === 0 || i === centers.length - 1) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const length = Math.hypot(dx, dy) || 1,
      t = distance ? centers[i].distance / distance : 0;
    const half =
      (startWidth + (endWidth - startWidth) * t * t * (3 - 2 * t)) / 2;
    left.push({
      x: p.x - (dy / length) * half,
      y: p.y + (dx / length) * half,
    });
    right.push({
      x: p.x + (dy / length) * half,
      y: p.y - (dx / length) * half,
    });
  }
  const points = [...left, ...right.reverse()];
  return { points, path: `M${points.map(xy).join(' L')} Z` };
}
/** Painted-envelope hit testing for a tapered ribbon, including its boundary. */
export function insidePolygon(
  point: Point,
  polygon: readonly Point[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i];
    if (distanceToSegment(point, a, b) < 0.001) return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function segmentHits(a: Point, b: Point, r: Rect): boolean {
  // Most visibility-grid edges and curve samples are nowhere near this box.
  // Reject those before doing slab clipping, including zero-length segments.
  const minX = r.x + 1e-5,
    maxX = r.x + r.w - 1e-5;
  const minY = r.y + 1e-5,
    maxY = r.y + r.h - 1e-5;
  // Tiny boxes can have inverted epsilon-adjusted limits. Let the original
  // clipping rule handle those rather than changing its boundary behavior.
  if (
    (minX <= maxX &&
      ((a.x <= minX && b.x <= minX) || (a.x >= maxX && b.x >= maxX))) ||
    (minY <= maxY &&
      ((a.y <= minY && b.y <= minY) || (a.y >= maxY && b.y >= maxY)))
  )
    return false;
  if (
    (a.x > minX && a.x < maxX && a.y > minY && a.y < maxY) ||
    (b.x > minX && b.x < maxX && b.y > minY && b.y < maxY)
  )
    return true;
  // Slab clipping also handles non-axis-aligned sampled curve segments.
  // Spell out both axes to avoid an iterator and dynamic property access in
  // this hot loop. Keep the original tolerances and clipping arithmetic.
  let lo = 0,
    hi = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (Math.abs(dx) < 1e-9) {
    if (a.x <= minX || a.x >= maxX) return false;
  } else {
    const t1 = (minX - a.x) / dx,
      t2 = (maxX - a.x) / dx;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo >= hi) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (a.y <= minY || a.y >= maxY) return false;
  } else {
    const t1 = (minY - a.y) / dy,
      t2 = (maxY - a.y) / dy;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo >= hi) return false;
  }
  return hi > 0 && lo < 1;
}
export function routeCollisions(
  route: Route,
  obstacles: Rect[],
  halfWidth = 0,
): number {
  const bounds = inflate(route.bounds, halfWidth);
  let result = 0;
  for (const r of obstacles)
    if (intersects(bounds, r)) {
      const box = inflate(r, halfWidth);
      if (
        route.points.some(
          (p, i) => i > 0 && segmentHits(route.points[i - 1], p, box),
        )
      )
        result++;
    }
  return result;
}
export function crossings(a: Route, b: Route): number {
  if (!intersects(a.bounds, b.bounds)) return 0;
  const side = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const monotoneX = (points: Point[]): number => {
    let direction = 0;
    for (let i = 1; i < points.length; i++) {
      const delta = points[i].x - points[i - 1].x;
      if (!delta) continue;
      const next = delta > 0 ? 1 : -1;
      if (direction && direction !== next) return 0;
      direction = next;
    }
    return direction || 1;
  };
  const aDirection = monotoneX(a.points),
    bDirection = monotoneX(b.points);
  if (aDirection && bDirection) {
    // Ordinary stage curves (and many edge routes) advance monotonically
    // along x. Merge their segment intervals instead of comparing every
    // segment with every other segment. Vertical runs stay in the sweep.
    let i = aDirection > 0 ? 1 : a.points.length - 1;
    let j = bDirection > 0 ? 1 : b.points.length - 1;
    while (i > 0 && i < a.points.length && j > 0 && j < b.points.length) {
      const p = a.points[i - 1],
        q = a.points[i],
        r = b.points[j - 1],
        s = b.points[j];
      const aMin = Math.min(p.x, q.x),
        aMax = Math.max(p.x, q.x);
      const bMin = Math.min(r.x, s.x),
        bMax = Math.max(r.x, s.x);
      if (
        aMax >= bMin &&
        bMax >= aMin &&
        side(p, q, r) * side(p, q, s) < -1e-7 &&
        side(r, s, p) * side(r, s, q) < -1e-7
      )
        return 1;
      // Equal interval ends can only meet at endpoints, or along
      // collinear vertical segments; neither counts as a crossing.
      if (aMax <= bMax) i += aDirection;
      if (bMax <= aMax) j += bDirection;
    }
    return 0;
  }
  for (let i = 1; i < a.points.length; i++) {
    const p = a.points[i - 1],
      q = a.points[i];
    const minX = Math.min(p.x, q.x),
      maxX = Math.max(p.x, q.x);
    const minY = Math.min(p.y, q.y),
      maxY = Math.max(p.y, q.y);
    for (let j = 1; j < b.points.length; j++) {
      const r = b.points[j - 1],
        s = b.points[j];
      // Inclusive bounds preserve the existing endpoint/collinearity
      // semantics; the orientation test below decides actual crossings.
      if (
        (r.x < minX && s.x < minX) ||
        (r.x > maxX && s.x > maxX) ||
        (r.y < minY && s.y < minY) ||
        (r.y > maxY && s.y > maxY)
      )
        continue;
      if (
        side(p, q, r) * side(p, q, s) < -1e-7 &&
        side(r, s, p) * side(r, s, q) < -1e-7
      )
        return 1;
    }
  }
  return 0;
}
/** Orthogonal visibility grid used only when an ordinary route hits a bar/label. */
export function avoidObstacles(
  start: Point,
  end: Point,
  obstacles: Rect[],
  bounds: Rect,
  bendCost = 24,
): Point[] | null {
  const relevant = obstacles.filter((r) => intersects(r, bounds));
  if (relevant.some((r) => inside(start, r) || inside(end, r))) return null;
  const unique = (v: number[]) =>
    [...new Set(v.map((n) => num(n)))].sort((a, b) => a - b);
  const xs = unique(
    [
      start.x,
      end.x,
      bounds.x,
      bounds.x + bounds.w,
      ...relevant.flatMap((r) => [r.x - 0.1, r.x + r.w + 0.1]),
    ].filter((x) => x >= bounds.x && x <= bounds.x + bounds.w),
  );
  const ys = unique(
    [
      start.y,
      end.y,
      bounds.y,
      bounds.y + bounds.h,
      ...relevant.flatMap((r) => [r.y - 0.1, r.y + r.h + 0.1]),
    ].filter((y) => y >= bounds.y && y <= bounds.y + bounds.h),
  );
  const nx = xs.length,
    ny = ys.length;
  if (nx * ny > 50000) return null;
  const sx = xs.indexOf(num(start.x)),
    sy = ys.indexOf(num(start.y)),
    ex = xs.indexOf(num(end.x)),
    ey = ys.indexOf(num(end.y));
  if (Math.min(sx, sy, ex, ey) < 0) return null;
  // A horizontal grid edge can only be blocked by a box whose open y-range
  // contains its row, and a vertical edge by one whose open x-range contains
  // its column (the clipping rule rejects every other axis-aligned segment, even
  // for epsilon-sized boxes). Index boxes by the rows and columns they span so
  // an edge test visits only those, not every obstacle.
  const rowBoxes: Rect[][] = Array.from({ length: ny }, () => []),
    columnBoxes: Rect[][] = Array.from({ length: nx }, () => []);
  const firstAbove = (lines: number[], value: number) => {
    let lo = 0,
      hi = lines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid] > value) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  for (const r of relevant) {
    const maxY = r.y + r.h - 1e-5,
      maxX = r.x + r.w - 1e-5;
    for (let i = firstAbove(ys, r.y + 1e-5); i < ny && ys[i] < maxY; i++)
      rowBoxes[i].push(r);
    for (let i = firstAbove(xs, r.x + 1e-5); i < nx && xs[i] < maxX; i++)
      columnBoxes[i].push(r);
  }
  const cell = (x: number, y: number) => y * nx + x;
  const startId = cell(sx, sy) * 3,
    goal = cell(ex, ey);
  // Per (cell, arrival direction) search state, indexed by the packed id.
  const best = new Float64Array(nx * ny * 3).fill(Infinity),
    previous = new Int32Array(nx * ny * 3).fill(-1);
  best[startId] = 0;
  const open = [{ id: startId, score: 0 }];
  // An edge is identified by its lower cell index and horizontal/vertical
  // direction: 0 = not tested yet, 1 = clear, 2 = blocked.
  const blocked = new Uint8Array(nx * ny * 2);
  const from = { x: 0, y: 0 },
    to = { x: 0, y: 0 };
  const directions = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 2],
    [0, -1, 2],
  ];
  let visits = 0;
  while (open.length && visits++ < nx * ny * 4) {
    // Binary heap keeps obstacle searches bounded on larger graphs.
    const first = open[0],
      last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let k = 0;
      while (true) {
        let c = k * 2 + 1;
        if (c >= open.length) break;
        if (c + 1 < open.length && open[c + 1].score < open[c].score) c++;
        if (open[k].score <= open[c].score) break;
        [open[k], open[c]] = [open[c], open[k]];
        k = c;
      }
    }
    const id = first.id,
      index = Math.floor(id / 3),
      direction = id % 3,
      x = index % nx,
      y = Math.floor(index / nx);
    if (index === goal) {
      const points: Point[] = [];
      let cursor = id;
      while (cursor >= 0) {
        const v = Math.floor(cursor / 3);
        points.push({ x: xs[v % nx], y: ys[Math.floor(v / nx)] });
        cursor = previous[cursor];
      }
      return points.reverse();
    }
    const ax = xs[x],
      ay = ys[y];
    const costSoFar = best[id];
    for (const [dx, dy, dir] of directions) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
      const bx = xs[xx],
        by = ys[yy],
        nextCell = cell(xx, yy),
        next = nextCell * 3 + dir,
        edge = Math.min(index, nextCell) * 2 + dir - 1;
      if (!blocked[edge]) {
        from.x = ax;
        from.y = ay;
        to.x = bx;
        to.y = by;
        const candidates = dir === 1 ? rowBoxes[y] : columnBoxes[x];
        blocked[edge] = candidates.some((r) => segmentHits(from, to, r))
          ? 2
          : 1;
      }
      if (blocked[edge] === 2) continue;
      const cost =
        costSoFar +
        Math.abs(bx - ax) +
        Math.abs(by - ay) +
        (direction && direction !== dir ? bendCost : 0);
      if (cost >= best[next] - 1e-6) continue;
      best[next] = cost;
      previous[next] = id;
      open.push({
        id: next,
        score: cost + Math.abs(bx - end.x) + Math.abs(by - end.y),
      });
      let k = open.length - 1;
      while (k > 0) {
        const p = Math.floor((k - 1) / 2);
        if (open[p].score <= open[k].score) break;
        [open[p], open[k]] = [open[k], open[p]];
        k = p;
      }
    }
  }
  return null;
}
