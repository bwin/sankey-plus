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
export const inside = (p: Point, r: Rect) => p.x > r.x + 1e-5 && p.x < r.x + r.w - 1e-5 && p.y > r.y + 1e-5 && p.y < r.y + r.h - 1e-5;
export const inflate = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const num = (v: number) => Number(v.toFixed(3));
const xy = (p: Point) => `${num(p.x)} ${num(p.y)}`;
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function describe(path: string, points: Point[]): Route {
    let length = 0;
    for (let i = 1; i < points.length; i++)
        length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    return { path, points, length, bounds: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
}
export function cubic(a: Point, b: Point, c: Point, d: Point): Route {
    const points = Array.from({ length: 41 }, (_, i) => {
        const t = i / 40, u = 1 - t;
        return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y };
    });
    return describe(`M${xy(a)} C${xy(b)} ${xy(c)} ${xy(d)}`, points);
}
export function roundedPolyline(input: Point[], radius: number): Route {
    const p: Point[] = [];
    for (const v of input) {
        if (p.length && near(p[p.length - 1], v))
            continue;
        while (p.length > 1) {
            const a = p[p.length - 2], b = p[p.length - 1];
            if (Math.abs((b.x - a.x) * (v.y - b.y) - (b.y - a.y) * (v.x - b.x)) > 1e-5)
                break;
            if ((b.x - a.x) * (v.x - b.x) + (b.y - a.y) * (v.y - b.y) < 0)
                break;
            p.pop();
        }
        p.push(v);
    }
    let path = `M${xy(p[0])}`, prev = p[0];
    const samples = [prev];
    const line = (end: Point) => {
        const count = Math.max(1, Math.ceil(Math.hypot(end.x - prev.x, end.y - prev.y) / 10));
        const start = prev;
        for (let j = 1; j <= count; j++)
            samples.push(mix(start, end, j / count));
        path += ` L${xy(end)}`;
        prev = end;
    };
    for (let i = 1; i < p.length - 1; i++) {
        const a = p[i - 1], b = p[i], c = p[i + 1], before = Math.hypot(a.x - b.x, a.y - b.y), after = Math.hypot(c.x - b.x, c.y - b.y);
        const r = Math.min(radius, before * .48, after * .48);
        const start = mix(b, a, r / before), end = mix(b, c, r / after);
        line(start);
        path += ` Q${xy(b)} ${xy(end)}`;
        for (let j = 1; j <= 20; j++) {
            const t = j / 20, u = 1 - t;
            samples.push({ x: u * u * start.x + 2 * u * t * b.x + t * t * end.x, y: u * u * start.y + 2 * u * t * b.y + t * t * end.y });
        }
        prev = end;
    }
    line(p[p.length - 1]);
    return describe(path, samples);
}
/** Fixed quarter-ellipse bends. Unlike independently clamped corners, these
 * preserve the shared centers and radii of a group of parallel routes. */
export function roundedOrthogonal(input: Point[], bends: { before: number; after: number }[]): Route | null {
    if (bends.length !== input.length - 2) return null;
    let path = `M${xy(input[0])}`, previous = input[0];
    const samples = [previous];
    const line = (end: Point) => {
        const steps = Math.max(1, Math.ceil(Math.hypot(end.x - previous.x, end.y - previous.y) / 8));
        for (let j = 1; j <= steps; j++) samples.push(mix(previous, end, j / steps));
        path += ` L${xy(end)}`;
        previous = end;
    };
    for (let i = 1; i < input.length - 1; i++) {
        const a = input[i - 1], b = input[i], c = input[i + 1], bend = bends[i - 1];
        const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
        const prior = i > 1 ? bends[i - 2].after : 0;
        if (bend.before <= 0 || bend.after <= 0 || bend.before + prior > before + 1e-5 || bend.after > after + 1e-5) return null;
        const incoming = { x: (b.x - a.x) / before, y: (b.y - a.y) / before };
        const outgoing = { x: (c.x - b.x) / after, y: (c.y - b.y) / after };
        if ((incoming.x && incoming.y) || (outgoing.x && outgoing.y) || Math.abs(incoming.x * outgoing.x + incoming.y * outgoing.y) > 1e-5) return null;
        const start = { x: b.x - incoming.x * bend.before, y: b.y - incoming.y * bend.before };
        const end = { x: b.x + outgoing.x * bend.after, y: b.y + outgoing.y * bend.after };
        const center = { x: start.x + outgoing.x * bend.after, y: start.y + outgoing.y * bend.after };
        const rx = incoming.x ? bend.before : bend.after, ry = incoming.y ? bend.before : bend.after;
        const sweep = incoming.x * outgoing.y - incoming.y * outgoing.x;
        const angle = Math.atan2((start.y - center.y) / ry, (start.x - center.x) / rx);
        line(start);
        path += ` A${num(rx)} ${num(ry)} 0 0 ${sweep > 0 ? 1 : 0} ${xy(end)}`;
        const steps = Math.max(24, Math.ceil(Math.max(rx, ry) * Math.PI / 2 / 4));
        for (let j = 1; j <= steps; j++) {
            const t = angle + sweep * Math.PI / 2 * j / steps;
            samples.push({ x: center.x + rx * Math.cos(t), y: center.y + ry * Math.sin(t) });
        }
        previous = end;
    }
    line(input[input.length - 1]);
    return describe(path, samples);
}
export function pointAt(route: Route, fraction: number): Point {
    let remaining = route.length * fraction;
    for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
        if (remaining <= length)
            return mix(a, b, length ? remaining / length : 0);
        remaining -= length;
    }
    return route.points[route.points.length - 1];
}
export function distanceToSegment(p: Point, a: Point, b: Point) {
    const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function distanceToRoute(p: Point, route: Route) {
    let d = Infinity;
    for (let i = 1; i < route.points.length; i++)
        d = Math.min(d, distanceToSegment(p, route.points[i - 1], route.points[i]));
    return d;
}
/** Approximate overlapping ribbon length. Merely touching edges are allowed. */
export function ribbonOverlap(a: Route, aWidth: number, b: Route, bWidth: number): number {
    const clearance = (aWidth + bWidth) / 2 - .25;
    if (clearance <= 0 || !intersects(inflate(a.bounds, clearance), b.bounds))
        return 0;
    const covered = (route: Route, other: Route) => {
        let length = 0;
        for (let i = 1; i < route.points.length; i++) {
            const start = route.points[i - 1], end = route.points[i];
            const span = Math.hypot(end.x - start.x, end.y - start.y);
            const count = Math.max(1, Math.ceil(span / 8));
            for (let j = 0; j < count; j++) {
                const distance = distanceToRoute(mix(start, end, (j + .5) / count), other);
                // Weight shallow contact less than a deeply overlapping run.
                length += Math.max(0, 1 - distance / clearance) * span / count;
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
        const p = route.points[i], a = route.points[Math.max(0, i - 1)], b = route.points[Math.min(route.points.length - 1, i + 1)];
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1, dx = -(b.y - a.y) / length * width / 2, dy = (b.x - a.x) / length * width / 2;
        points.push({ x: p.x + dx, y: p.y + dy }, { x: p.x - dx, y: p.y - dy });
    }
    return describe('', points).bounds;
}
function segmentHits(a: Point, b: Point, r: Rect): boolean {
    // Most visibility-grid edges and curve samples are nowhere near this box.
    // Reject those before doing slab clipping, including zero-length segments.
    const minX = r.x + 1e-5, maxX = r.x + r.w - 1e-5;
    const minY = r.y + 1e-5, maxY = r.y + r.h - 1e-5;
    // Tiny boxes can have inverted epsilon-adjusted limits. Let the original
    // clipping rule handle those rather than changing its boundary behavior.
    if ((minX <= maxX && ((a.x <= minX && b.x <= minX) || (a.x >= maxX && b.x >= maxX))) ||
        (minY <= maxY && ((a.y <= minY && b.y <= minY) || (a.y >= maxY && b.y >= maxY))))
        return false;
    if ((a.x > minX && a.x < maxX && a.y > minY && a.y < maxY) ||
        (b.x > minX && b.x < maxX && b.y > minY && b.y < maxY))
        return true;
    // Slab clipping also handles non-axis-aligned sampled curve segments.
    // Spell out both axes to avoid an iterator and dynamic property access in
    // this hot loop. Keep the original tolerances and clipping arithmetic.
    let lo = 0, hi = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) < 1e-9) {
        if (a.x <= minX || a.x >= maxX) return false;
    } else {
        const t1 = (minX - a.x) / dx, t2 = (maxX - a.x) / dx;
        lo = Math.max(lo, Math.min(t1, t2));
        hi = Math.min(hi, Math.max(t1, t2));
        if (lo >= hi) return false;
    }
    if (Math.abs(dy) < 1e-9) {
        if (a.y <= minY || a.y >= maxY) return false;
    } else {
        const t1 = (minY - a.y) / dy, t2 = (maxY - a.y) / dy;
        lo = Math.max(lo, Math.min(t1, t2));
        hi = Math.min(hi, Math.max(t1, t2));
        if (lo >= hi) return false;
    }
    return hi > 0 && lo < 1;
}
export function routeCollisions(route: Route, obstacles: Rect[], halfWidth = 0): number {
    const bounds = inflate(route.bounds, halfWidth);
    let result = 0;
    for (const r of obstacles)
        if (intersects(bounds, r)) {
            const box = inflate(r, halfWidth);
            if (route.points.some((p, i) => i > 0 && segmentHits(route.points[i - 1], p, box)))
                result++;
        }
    return result;
}
export function crossings(a: Route, b: Route): number {
    if (!intersects(a.bounds, b.bounds))
        return 0;
    const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
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
    const aDirection = monotoneX(a.points), bDirection = monotoneX(b.points);
    if (aDirection && bDirection) {
        // Ordinary stage curves (and many edge routes) advance monotonically
        // along x. Merge their segment intervals instead of comparing every
        // segment with every other segment. Vertical runs stay in the sweep.
        let i = aDirection > 0 ? 1 : a.points.length - 1;
        let j = bDirection > 0 ? 1 : b.points.length - 1;
        while (i > 0 && i < a.points.length && j > 0 && j < b.points.length) {
            const p = a.points[i - 1], q = a.points[i], r = b.points[j - 1], s = b.points[j];
            const aMin = Math.min(p.x, q.x), aMax = Math.max(p.x, q.x);
            const bMin = Math.min(r.x, s.x), bMax = Math.max(r.x, s.x);
            if (aMax >= bMin && bMax >= aMin &&
                side(p, q, r) * side(p, q, s) < -1e-7 && side(r, s, p) * side(r, s, q) < -1e-7)
                return 1;
            // Equal interval ends can only meet at endpoints, or along
            // collinear vertical segments; neither counts as a crossing.
            if (aMax <= bMax) i += aDirection;
            if (bMax <= aMax) j += bDirection;
        }
        return 0;
    }
    for (let i = 1; i < a.points.length; i++) {
        const p = a.points[i - 1], q = a.points[i];
        const minX = Math.min(p.x, q.x), maxX = Math.max(p.x, q.x);
        const minY = Math.min(p.y, q.y), maxY = Math.max(p.y, q.y);
        for (let j = 1; j < b.points.length; j++) {
            const r = b.points[j - 1], s = b.points[j];
            // Inclusive bounds preserve the existing endpoint/collinearity
            // semantics; the orientation test below decides actual crossings.
            if ((r.x < minX && s.x < minX) || (r.x > maxX && s.x > maxX) ||
                (r.y < minY && s.y < minY) || (r.y > maxY && s.y > maxY)) continue;
            if (side(p, q, r) * side(p, q, s) < -1e-7 && side(r, s, p) * side(r, s, q) < -1e-7)
                return 1;
        }
    }
    return 0;
}
/** Orthogonal visibility grid used only when an ordinary route hits a bar/label. */
export function avoidObstacles(start: Point, end: Point, obstacles: Rect[], bounds: Rect, bendCost = 24): Point[] | null {
    const relevant = obstacles.filter(r => intersects(r, bounds));
    if (relevant.some(r => inside(start, r) || inside(end, r)))
        return null;
    const unique = (v: number[]) => [...new Set(v.map(n => num(n)))].sort((a, b) => a - b);
    const xs = unique([start.x, end.x, bounds.x, bounds.x + bounds.w, ...relevant.flatMap(r => [r.x - .1, r.x + r.w + .1])].filter(x => x >= bounds.x && x <= bounds.x + bounds.w));
    const ys = unique([start.y, end.y, bounds.y, bounds.y + bounds.h, ...relevant.flatMap(r => [r.y - .1, r.y + r.h + .1])].filter(y => y >= bounds.y && y <= bounds.y + bounds.h));
    const nx = xs.length, ny = ys.length;
    if (nx * ny > 50000)
        return null;
    const sx = xs.indexOf(num(start.x)), sy = ys.indexOf(num(start.y)), ex = xs.indexOf(num(end.x)), ey = ys.indexOf(num(end.y));
    if (Math.min(sx, sy, ex, ey) < 0)
        return null;
    const cell = (x: number, y: number) => y * nx + x;
    const startId = cell(sx, sy) * 3, goal = cell(ex, ey);
    const best = new Map<number, number>([[startId, 0]]), previous = new Map<number, number>();
    const open = [{ id: startId, score: 0 }];
    // An edge is identified by its lower cell index and horizontal/vertical
    // direction. Numeric keys avoid building strings for every search step.
    const blocked = new Map<number, boolean>();
    const directions = [[1, 0, 1], [-1, 0, 1], [0, 1, 2], [0, -1, 2]];
    let visits = 0;
    while (open.length && visits++ < nx * ny * 4) {
        // Binary heap keeps obstacle searches bounded on larger graphs.
        const first = open[0], last = open.pop()!;
        if (open.length) {
            open[0] = last;
            let k = 0;
            while (true) {
                let c = k * 2 + 1;
                if (c >= open.length)
                    break;
                if (c + 1 < open.length && open[c + 1].score < open[c].score)
                    c++;
                if (open[k].score <= open[c].score)
                    break;
                [open[k], open[c]] = [open[c], open[k]];
                k = c;
            }
        }
        const id = first.id, index = Math.floor(id / 3), direction = id % 3, x = index % nx, y = Math.floor(index / nx);
        if (index === goal) {
            const points: Point[] = [];
            let cursor: number | undefined = id;
            while (cursor !== undefined) {
                const v = Math.floor(cursor / 3);
                points.push({ x: xs[v % nx], y: ys[Math.floor(v / nx)] });
                cursor = previous.get(cursor);
            }
            return points.reverse();
        }
        const a = { x: xs[x], y: ys[y] };
        const costSoFar = best.get(id)!;
        for (const [dx, dy, dir] of directions) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= nx || yy >= ny)
                continue;
            const b = { x: xs[xx], y: ys[yy] }, nextCell = cell(xx, yy), next = nextCell * 3 + dir, edge = Math.min(index, nextCell) * 2 + dir - 1;
            if (!blocked.has(edge))
                blocked.set(edge, relevant.some(r => segmentHits(a, b, r)));
            if (blocked.get(edge))
                continue;
            const cost = costSoFar + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (direction && direction !== dir ? bendCost : 0);
            if (cost >= (best.get(next) ?? Infinity) - 1e-6)
                continue;
            best.set(next, cost);
            previous.set(next, id);
            open.push({ id: next, score: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) });
            let k = open.length - 1;
            while (k > 0) {
                const p = Math.floor((k - 1) / 2);
                if (open[p].score <= open[k].score)
                    break;
                [open[p], open[k]] = [open[k], open[p]];
                k = p;
            }
        }
    }
    return null;
}
