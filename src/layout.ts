import type { ResolvedGraph } from './model.js';
import { itemColor } from './model.js';
import { FlowInputError } from './types.js';
import { avoidObstacles, crossings, cubic, describe, distanceToRoute, inflate, intersects, pointAt, ribbonOverlap, roundedOrthogonal, roundedPolyline, routeCollisions, type Point, type Rect, type Route } from './paths.js';
export interface TextBox extends Rect {
    lines: string[];
    anchor: 'start' | 'middle' | 'end';
    textX: number;
    textY: number;
}
export interface ItemGeometry extends Rect {
    key: string;
    color: string;
    edge?: 'top' | 'bottom';
    stage?: string;
    row: number;
    index: number;
    label: TextBox;
    zero: boolean;
    corridor?: number;
    lo: number;
    hi: number;
    preferred: number;
    footprint: number;
}
export interface TransferGeometry {
    key: string;
    from: string;
    to: string;
    amount: number;
    color: string;
    width: number;
    start: Point;
    end: Point;
    route: Route;
    label: TextBox;
    labelHidden: boolean;
}
export interface Scene {
    width: number;
    height: number;
    scale: number;
    topBand: number;
    bottomBand: number;
    centralTop: number;
    centralHeight: number;
    items: ItemGeometry[];
    transfers: TransferGeometry[];
    diagnostics: {
        crossings: number;
        obstacleCollisions: number;
    };
}
export interface LayoutOptions {
    width: number;
    plotHeight?: number;
    labels?: Map<string, readonly string[]>;
    measureText?: (text: string) => number;
    lineHeight?: number;
}
const PAD = 24, BAR = 14, GAP = 24, CLEAR = 32;
const LANE_GAP = 4;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
function fitted(lines: readonly string[], width: number, measure: (s: string) => number): string[] {
    return lines.slice(0, 2).map(line => {
        if (measure(line) <= width)
            return line;
        const chars = Array.from(line);
        let lo = 0, hi = chars.length;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (measure(chars.slice(0, mid).join('') + '…') <= width)
                lo = mid;
            else
                hi = mid - 1;
        }
        return chars.slice(0, lo).join('') + '…';
    });
}
function labelBox(lines: string[], x: number, cy: number, anchor: TextBox['anchor'], measure: (s: string) => number, lineHeight: number): TextBox {
    const w = lines.length ? Math.max(...lines.map(measure)) : 0, h = lines.length * lineHeight;
    return { lines, anchor, textX: x, textY: cy - h / 2 + lineHeight * .76, x: x - (anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0), y: cy - h / 2, w, h };
}
function packRow(items: ItemGeometry[]): number[] | null {
    const values: number[] = [];
    for (let i = 0; i < items.length; i++) {
        const n = items[i], minimum = Math.max(n.lo + n.w / 2, PAD + n.footprint / 2), maximum = n.hi - n.w / 2;
        values.push(Math.max(clamp(n.preferred, minimum, maximum), i ? values[i - 1] + items[i - 1].footprint / 2 + GAP + n.footprint / 2 : minimum));
    }
    for (let i = items.length - 1; i >= 0; i--) {
        const n = items[i];
        values[i] = Math.min(values[i], n.hi - n.w / 2);
        if (i < items.length - 1)
            values[i] = Math.min(values[i], values[i + 1] - items[i + 1].footprint / 2 - GAP - n.footprint / 2);
        if (values[i] < Math.max(n.lo + n.w / 2, PAD + n.footprint / 2) - .001)
            return null;
    }
    return values;
}
function outward(n: ItemGeometry, outgoing: boolean): Point {
    return n.edge ? { x: 0, y: n.edge === 'top' ? 1 : -1 } : { x: outgoing ? 1 : -1, y: 0 };
}
const add = (a: Point, b: Point, scale = 1): Point => ({ x: a.x + b.x * scale, y: a.y + b.y * scale });
export function layoutGraph<I, T>(model: ResolvedGraph<I, T>, options: LayoutOptions, attempt = 0): Scene {
    const requested = options.width, plotHeight = options.plotHeight ?? 336;
    if (!Number.isFinite(requested) || requested <= 0 || !Number.isFinite(plotHeight) || plotHeight <= 0)
        throw new FlowInputError([{ code: 'invalid-number', message: 'Layout width and plotHeight must be finite and positive.' }]);
    const measure = options.measureText ?? ((s: string) => Array.from(s).length * 6.6), lineHeight = options.lineHeight ?? 16;
    const label = (kind: string, key: string, defaultText: string) => options.labels?.get(`${kind}:${key}`) ?? [defaultText];
    const stageIndex = new Map(model.stages.map((s, i) => [s, i]));
    const stages = model.stages.map(s => [...model.items.values()].filter(n => n.item.placement.stage === s));
    const edges = [...model.items.values()].filter(n => n.item.placement.edge);
    const leftExtra = edges.some(n => n.outgoingTransfers.some(f => model.items.get(f.to)!.item.placement.stage === model.stages[0])) ? 1 : 0;
    const rightExtra = edges.some(n => n.incomingTransfers.some(f => model.items.get(f.from)!.item.placement.stage === model.stages.at(-1))) ? 1 : 0;
    const slots = Math.max(1, stages.length - 1 + leftExtra + rightExtra);
    const minWidth = stages.length ? 2 * PAD + BAR + slots * 112 : 180;
    const width = Math.max(requested, minWidth);
    const step = (width - 2 * PAD - BAR) / slots;
    const axis = (index: number) => stages.length === 1 && !leftExtra && !rightExtra ? width / 2 - BAR / 2 : PAD + (index + leftExtra) * step;
    const maxCount = Math.max(0, ...stages.map(s => s.length));
    const centralHeight = Math.max(plotHeight, maxCount * (lineHeight * 2 + GAP));
    const geomTotal = (n: typeof edges[number]) => Math.max(n.total, n.incoming, n.outgoing);
    let scale = Infinity;
    for (const stage of stages) {
        const total = sum(stage.map(geomTotal));
        if (total > 0)
            scale = Math.min(scale, (centralHeight - (stage.length + 1) * GAP) / total);
    }
    if (!Number.isFinite(scale))
        scale = centralHeight / Math.max(1, ...edges.map(geomTotal));
    const limits = new Map<string, {
        lo: number;
        hi: number;
    }>();
    for (const n of edges) {
        let lo = PAD, hi = width - PAD;
        const sourceColumns = n.incomingTransfers.map(f => model.items.get(f.from)!.item.placement.stage).filter((s): s is string => s !== undefined).map(s => stageIndex.get(s)!);
        const targetColumns = n.outgoingTransfers.map(f => model.items.get(f.to)!.item.placement.stage).filter((s): s is string => s !== undefined).map(s => stageIndex.get(s)!);
        if (sourceColumns.length)
            lo = Math.max(lo, axis(Math.max(...sourceColumns)) + BAR + CLEAR);
        if (targetColumns.length)
            hi = Math.min(hi, axis(Math.min(...targetColumns)) - CLEAR);
        limits.set(n.item.key, { lo, hi });
        if (geomTotal(n) > 0)
            scale = Math.min(scale, Math.max(8, hi - lo - 28) / geomTotal(n));
    }
    // Wrapped simple fans reserve their corridor before packing. The value scale is
    // global: squeezing each ribbon separately would destroy quantitative meaning.
    const wrappedFans: {
        keys: string[];
        origin: number;
    }[] = [];
    for (const facts of model.items.values())
        if (facts.item.placement.stage !== undefined)
            for (const side of ['top', 'bottom']) {
                const links = facts.outgoingTransfers.filter(f => {
                    const target = model.items.get(f.to)!;
                    return target.item.placement.edge === side && target.incomingTransfers.length === 1 && target.outgoingTransfers.length === 0;
                });
                if (links.length < 2)
                    continue;
                const targets = links.map(f => model.items.get(f.to)!), lo = Math.max(...targets.map(n => limits.get(n.item.key)!.lo)), hi = Math.min(...targets.map(n => limits.get(n.item.key)!.hi)), available = hi - lo;
                const textWidths = targets.map(n => Math.min(148, Math.max(0, ...label('item', n.item.key, n.item.title).map(measure))));
                const needed = sum(targets.map((n, i) => Math.max(geomTotal(n) * scale, textWidths[i]))) + (targets.length - 1) * GAP;
                if (needed <= available)
                    continue;
                const strip = available * .55, labelWidth = Math.min(Math.max(...textWidths), available - strip);
                const traffic = sum(links.map(f => f.amount));
                const channelWidth = Math.max(8, strip - labelWidth / 2 - 10 - Math.max(0, links.length - 2) * LANE_GAP);
                scale = Math.min(scale, channelWidth / traffic);
                for (const n of targets)
                    limits.set(n.item.key, { lo: lo + strip, hi });
                wrappedFans.push({ keys: targets.map(n => n.item.key), origin: lo });
            }
    scale = Math.max(Number.MIN_VALUE, scale);
    const widestEdge = Math.max(0, ...edges.map(n => geomTotal(n) * scale));
    const mainLabelLimit = Math.max(48, Math.min(160, (step - BAR - widestEdge - 40) / 2));
    const items: ItemGeometry[] = [];
    for (let col = 0; col < stages.length; col++) {
        const stage = stages[col], sizes = stage.map(n => n.total ? geomTotal(n) * scale : 3);
        const spacing = Math.max(GAP, (centralHeight - sum(sizes)) / (stage.length + 1));
        let y = spacing;
        for (let i = 0; i < stage.length; i++) {
            const n = stage[i], x = axis(col), h = sizes[i], raw = label('item', n.item.key, n.item.title);
            const lines = fitted(raw, mainLabelLimit, measure), anchor = col === 0 ? 'start' : 'end';
            items.push({ key: n.item.key, index: model.graph.items.indexOf(n.item), x, y, w: BAR, h, color: itemColor(n.item.key, n.item.color), stage: model.stages[col], row: 0, zero: n.total === 0, lo: x, hi: x + BAR, preferred: x, footprint: BAR, label: labelBox(lines, anchor === 'start' ? x + BAR + 8 : x - 8, y + h / 2, anchor, measure, lineHeight) });
            y += h + spacing;
        }
    }
    const byKey = new Map(items.map(n => [n.key, n]));
    for (let i = 0; i < edges.length; i++) {
        const facts = edges[i], n = facts.item, w = facts.total ? geomTotal(facts) * scale : 3;
        let { lo, hi } = limits.get(n.key)!;
        let routeLo = lo, routeHi = hi;
        let sx = 0, sw = 0, tx = 0, tw = 0;
        for (const f of facts.incomingTransfers) {
            const other = byKey.get(f.from);
            if (other && !other.edge) {
                const members = items.filter(v => v.stage === other.stage && !v.edge);
                const right = Math.max(other.x + BAR, ...members.map(v => v.label.x + v.label.w));
                sx += right * f.amount;
                sw += f.amount;
                routeLo = Math.max(routeLo, right + 8);
            }
        }
        for (const f of facts.outgoingTransfers) {
            const other = byKey.get(f.to);
            if (other && !other.edge) {
                const members = items.filter(v => v.stage === other.stage && !v.edge);
                const left = Math.min(other.x, ...members.map(v => v.label.x));
                tx += left * f.amount;
                tw += f.amount;
                routeHi = Math.min(routeHi, left - 8);
            }
        }
        // Packing must not push a wide vertical leg into the neighboring
        // stage's labels. Preserve this corridor whenever the bar fits;
        // tight mixed-role intervals still use the obstacle-routing fallback.
        if (routeHi - routeLo >= w) { lo = routeLo; hi = routeHi; }
        const raw = label('item', n.key, n.title), lines = fitted(raw, Math.max(40, Math.min(148, hi - lo, width - 2 * PAD)), measure);
        const footprint = Math.max(w, ...lines.map(measure), 0);
        const preferred = sw && tw ? (sx / sw + tx / tw) / 2 : sw ? sx / sw + 16 + footprint / 2 : tw ? tx / tw - 16 - footprint / 2 : PAD + (width - 2 * PAD) * (i + 1) / (edges.length + 1);
        const item: ItemGeometry = { key: n.key, index: model.graph.items.indexOf(n), x: 0, y: 0, w, h: BAR, color: itemColor(n.key, n.color), edge: n.placement.edge!, row: 0, zero: facts.total === 0, lo: Math.max(lo, PAD + (footprint - w) / 2), hi: Math.min(hi, width - PAD - (footprint - w) / 2), preferred, footprint, label: labelBox(lines, 0, 0, 'middle', measure, lineHeight) };
        items.push(item);
        byKey.set(n.key, item);
    }
    const rows: {
        top: ItemGeometry[][];
        bottom: ItemGeometry[][];
    } = { top: [], bottom: [] };
    for (const edge of ['top', 'bottom'] as const) {
        const candidates = items.filter(n => n.edge === edge).sort((a, b) => a.preferred - b.preferred || a.index - b.index);
        for (const n of candidates) {
            let packed = false;
            for (let r = 0; r < rows[edge].length; r++) {
                const trial = [...rows[edge][r], n].sort((a, b) => a.preferred - b.preferred || a.index - b.index), centers = packRow(trial);
                if (centers) {
                    rows[edge][r] = trial;
                    trial.forEach((v, i) => { v.x = centers[i] - v.w / 2; v.row = r; });
                    packed = true;
                    break;
                }
            }
            if (!packed) {
                n.row = rows[edge].length;
                const center = packRow([n]);
                n.x = (center?.[0] ?? clamp(n.preferred, n.lo + n.w / 2, n.hi - n.w / 2)) - n.w / 2;
                rows[edge].push([n]);
            }
        }
    }
    const maxRibbon = Math.max(0, ...model.graph.transfers.map(f => f.amount * scale));
    const clearance = 72 + maxRibbon / 2, baseRowPitch = Math.max(86, lineHeight * 2 + BAR + maxRibbon + 32);
    const rowPitches = {
        top: rows.top.map((_, index) => index ? baseRowPitch : 0),
        bottom: rows.bottom.map((_, index) => index ? baseRowPitch : 0),
    };
    const fanLaneDistances = new Map<string, number>();
    // Each wrapped destination needs its own horizontal lane. The rightmost
    // destination turns first (closest to the preceding row); destinations to
    // its left turn later. Together with the ordered vertical corridors this
    // prevents both crossings and coincident runs, including unequal widths.
    for (const fan of wrappedFans) {
        const members = fan.keys.map(key => byKey.get(key)!);
        const side = members[0].edge!;
        for (let row = 1; row < rows[side].length; row++) {
            const targets = members.filter(n => n.row === row).sort((a, b) => b.x - a.x || a.index - b.index);
            if (targets.length < 2) continue;
            let cursor = BAR + 10 + lineHeight * 2 + 8;
            let widest = 0;
            for (const node of targets) {
                const thickness = model.items.get(node.key)!.incoming * scale;
                fanLaneDistances.set(node.key, cursor + thickness / 2);
                cursor += thickness + LANE_GAP;
                widest = Math.max(widest, thickness);
            }
            rowPitches[side][row] = Math.max(rowPitches[side][row], cursor - LANE_GAP + Math.max(32, widest + 16));
        }
    }
    const rowOffsets = { top: [0], bottom: [0] };
    for (const side of ['top', 'bottom'] as const)
        for (let row = 1; row < rows[side].length; row++)
            rowOffsets[side][row] = rowOffsets[side][row - 1] + rowPitches[side][row];
    const band = (side: 'top' | 'bottom') => rows[side].length ? clearance + BAR + lineHeight * 2 + 12 + rowOffsets[side].at(-1)! : 0;
    const topBand = band('top'), bottomBand = band('bottom'), centralTop = PAD + topBand, height = PAD + topBand + centralHeight + bottomBand + PAD;
    for (const n of items) {
        if (!n.edge) {
            n.y += centralTop;
            n.label.y += centralTop;
            n.label.textY += centralTop;
            continue;
        }
        n.y = n.edge === 'top' ? centralTop - clearance - BAR - rowOffsets.top[n.row] : centralTop + centralHeight + clearance + rowOffsets.bottom[n.row];
        n.label = labelBox(n.label.lines, n.x + n.w / 2, n.edge === 'top' ? n.y - 10 - n.label.h / 2 : n.y + BAR + 10 + n.label.h / 2, 'middle', measure, lineHeight);
        if (n.row) {
            const nearer = rows[n.edge].slice(0, n.row).flat().filter(o => o.x + o.w > n.lo && o.x < n.hi);
            const traffic = Math.max(...[...model.items.get(n.key)!.incomingTransfers, ...model.items.get(n.key)!.outgoingTransfers].map(f => f.amount * scale), 0);
            const first = nearer.length ? Math.min(...nearer.map(o => o.x + o.w / 2 - o.footprint / 2)) : n.x;
            n.corridor = Math.max(PAD + traffic / 2, first - traffic / 2 - 10);
        }
    }
    for (const fan of wrappedFans) {
        let cursor = fan.origin;
        for (const n of fan.keys.map(k => byKey.get(k)!).filter(n => n.row > 0).sort((a, b) => b.row - a.row || a.x - b.x || a.index - b.index)) {
            const traffic = model.items.get(n.key)!.incoming * scale;
            n.corridor = cursor + traffic / 2;
            cursor += traffic + LANE_GAP;
        }
    }
    const transfers: TransferGeometry[] = model.graph.transfers.map(f => ({ key: f.key, from: f.from, to: f.to, amount: f.amount, width: f.amount * scale, color: itemColor(f.to, f.color ?? byKey.get(f.to)!.color), start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, route: null as unknown as Route, label: labelBox([], 0, 0, 'middle', measure, lineHeight), labelHidden: false }));
    const positions = new Map(transfers.map((f, i) => [f.key, i]));
    const approach = (n: ItemGeometry) => n.corridor ?? n.x + n.w / 2;
    const portGroups: {
        node: ItemGeometry;
        out: boolean;
        links: TransferGeometry[];
    }[] = [];
    for (const n of items)
        for (const out of [true, false]) {
            const links = transfers.filter(f => (out ? f.from : f.to) === n.key);
            const opposite = (f: TransferGeometry) => byKey.get(out ? f.to : f.from)!;
            links.sort((a, b) => {
                const aa = opposite(a), bb = opposite(b);
                let order = 0;
                if (!n.edge) {
                    const rank = (v: ItemGeometry) => v.edge === 'top' ? 0 : v.edge === 'bottom' ? 2 : 1;
                    order = rank(aa) - rank(bb);
                    if (!order) {
                        if (aa.edge === 'bottom')
                            order = (out ? -1 : 1) * (approach(aa) - approach(bb));
                        else if (aa.edge === 'top')
                            order = (out ? 1 : -1) * (approach(aa) - approach(bb));
                        else
                            order = (aa.y + aa.h / 2) - (bb.y + bb.h / 2);
                    }
                }
                else {
                    order = aa.x - bb.x || ((n.edge === 'top' && out) ? -1 : 1) * (aa.y - bb.y);
                    if (n.edge === 'bottom' && !out)
                        order = -order;
                }
                return order || positions.get(a.key)! - positions.get(b.key)!;
            });
            portGroups.push({ node: n, out, links });
        }
    function setPorts(group: typeof portGroups[number]) {
        const { node: n, out, links } = group;
        let offset = 0;
        for (const f of links) {
            const p = n.edge ? { x: n.x + offset + f.width / 2, y: n.edge === 'top' ? n.y + BAR : n.y } : { x: out ? n.x + BAR : n.x, y: n.y + offset + f.width / 2 };
            if (out)
                f.start = p;
            else
                f.end = p;
            offset += f.width;
        }
    }
    portGroups.forEach(setPorts);
    const obstacles = (f: TransferGeometry) => items.filter(n => n.key !== f.from && n.key !== f.to).flatMap(n => [n, ...(n.label.w ? [n.label] : [])]);
    const radius = Math.max(24, Math.min(90, maxRibbon + 12));
    const rowApproach = (node: ItemGeometry, flow: TransferGeometry) => {
        // The cross-row leg sits beyond the previous row's two-line label plus
        // half a ribbon. A fixed fraction of row pitch clips long custom labels.
        const distance = fanLaneDistances.get(node.key) ?? (BAR + 10 + lineHeight * 2 + flow.width / 2 + 8);
        const inset = rowPitches[node.edge!][node.row] - distance;
        return node.edge === 'bottom' ? node.y - inset : node.y + BAR + inset;
    };
    const fanRoutes = new Map<string, Route>();
    for (const fan of wrappedFans) {
        const members = fan.keys.map(key => byKey.get(key)!).filter(n => n.row > 0);
        if (members.length < 2) continue;
        const flows = members.map(n => transfers.find(f => f.to === n.key)!);
        const side = members[0].edge!, direction = side === 'bottom' ? 1 : -1;
        const minX = Math.min(...members.map(n => n.corridor!));
        const inner = flows.reduce((a, b) => direction * a.start.y > direction * b.start.y ? a : b);
        const firstRadius = Math.min(32 + inner.width / 2, minX - inner.start.x - 8);
        if (firstRadius <= inner.width / 2 + 2) continue;
        const firstCenter = { x: minX - firstRadius, y: inner.start.y + direction * firstRadius };
        const trial = new Map<string, Route>();
        for (const row of new Set(members.map(n => n.row))) {
            const rowNodes = members.filter(n => n.row === row);
            const rightmost = rowNodes.reduce((a, b) => a.corridor! > b.corridor! ? a : b);
            const rightFlow = flows.find(f => f.to === rightmost.key)!;
            const secondRadius = Math.min(32 + rightFlow.width / 2, ...rowNodes.map(n => {
                const f = flows.find(f => f.to === n.key)!;
                return (f.end.x - rightmost.corridor!) / 2;
            }));
            const centerX = rightmost.corridor! + secondRadius;
            for (const n of rowNodes) {
                const f = flows.find(f => f.to === n.key)!, laneY = rowApproach(n, f);
                const r = centerX - n.corridor!;
                const lastRadius = Math.min(Math.max(20, f.width / 2 + 12), (f.end.x - centerX) * .48, Math.abs(f.end.y - laneY) * .48);
                const route = roundedOrthogonal([f.start, { x: n.corridor!, y: f.start.y }, { x: n.corridor!, y: laneY }, { x: f.end.x, y: laneY }, f.end], [
                    { before: n.corridor! - firstCenter.x, after: direction * (firstCenter.y - f.start.y) },
                    { before: r, after: r },
                    { before: lastRadius, after: lastRadius },
                ]);
                if (route && !routeCollisions(route, obstacles(f), f.width / 2 + 2)) trial.set(f.key, route);
            }
        }
        // All members switch together so a fallback cannot split the bundle.
        if (trial.size === flows.length) for (const [key, route] of trial) fanRoutes.set(key, route);
    }
    function ordinary(f: TransferGeometry): Route {
        const fanRoute = fanRoutes.get(f.key);
        if (fanRoute) return fanRoute;
        const a = byKey.get(f.from)!, b = byKey.get(f.to)!, s = f.start, t = f.end;
        if (!a.edge && !b.edge) {
            const d = (t.x - s.x) * .48;
            return cubic(s, { x: s.x + d, y: s.y }, { x: t.x - d, y: t.y }, t);
        }
        if (!a.edge && b.edge) {
            if (b.row && b.corridor !== undefined && b.corridor > s.x + f.width / 2 + 4) {
                const approachY = rowApproach(b, f);
                return roundedPolyline([s, { x: b.corridor, y: s.y }, { x: b.corridor, y: approachY }, { x: t.x, y: approachY }, t], radius);
            }
            return roundedPolyline([s, { x: t.x, y: s.y }, t], radius);
        }
        if (a.edge && !b.edge) {
            if (a.row && a.corridor !== undefined) {
                const approachY = rowApproach(a, f);
                return roundedPolyline([s, { x: s.x, y: approachY }, { x: a.corridor, y: approachY }, { x: a.corridor, y: t.y }, t], radius);
            }
            return roundedPolyline([s, { x: s.x, y: t.y }, t], radius);
        }
        const mid = a.edge === b.edge ? (a.edge === 'top' ? Math.max(s.y, t.y) + clearance * .65 : Math.min(s.y, t.y) - clearance * .65) : (centralTop + centralHeight / 2);
        return roundedPolyline([s, { x: s.x, y: mid }, { x: t.x, y: mid }, t], radius);
    }
    const score = (f: TransferGeometry, route: Route) => {
        const collisions = routeCollisions(route, obstacles(f), f.width / 2 + 2);
        const cross = transfers.reduce((n, o) => n + (o !== f && o.route ? crossings(route, o.route) : 0), 0);
        return collisions * 1e8 + cross * 1e4 + route.length;
    };
    for (const f of transfers)
        f.route = ordinary(f);
    // First repair obstacles; all alternatives preserve the same endpoint faces.
    for (const f of transfers) {
        const boxes = obstacles(f);
        if (!routeCollisions(f.route, boxes, f.width / 2 + 2))
            continue;
        const a = byKey.get(f.from)!, b = byKey.get(f.to)!;
        const turnRadius = Math.max(8, Math.min(32, f.width / 2 + 6)), padding = f.width / 2 + turnRadius + 3;
        const start = add(f.start, outward(a, true), padding), end = add(f.end, outward(b, false), padding);
        const route = avoidObstacles(start, end, boxes.map(r => inflate(r, padding)), { x: PAD / 2 + f.width / 2, y: PAD / 2 + f.width / 2, w: width - PAD - f.width, h: height - PAD - f.width });
        if (route) {
            const candidate = roundedPolyline([f.start, ...route, f.end], turnRadius);
            if (score(f, candidate) < score(f, f.route))
                f.route = candidate;
        }
    }
    // A fixed two-pass budget avoids combinatorial search or hover-time layout work.
    // Simple ordered turns are constructed above and are never heuristically permuted.
    const eligible = portGroups.filter(g => !g.node.edge && g.links.length > 1 && g.links.every(f => !byKey.get(g.out ? f.to : f.from)!.edge));
    let swaps = 0;
    for (let pass = 0; pass < 2; pass++)
        for (const group of eligible)
            for (let i = 0; i < group.links.length - 1 && swaps < 64; i++, swaps++) {
                const a = group.links[i], b = group.links[i + 1], oldA = a.route, oldB = b.route, before = score(a, oldA) + score(b, oldB);
                [group.links[i], group.links[i + 1]] = [b, a];
                setPorts(group);
                a.route = ordinary(a);
                b.route = ordinary(b);
                if (score(a, a.route) + score(b, b.route) >= before - .01) {
                    [group.links[i], group.links[i + 1]] = [a, b];
                    setPorts(group);
                    a.route = oldA;
                    b.route = oldB;
                }
            }
    // A side input can cross an edge input twice even when the ports are in the
    // correct order. Let it reach its final height before the vertical edge leg,
    // then approach the shared destination horizontally. Keep the existing ports
    // and accept only a measurable improvement without a new crossing pair or
    // increased obstacle collisions.
    let convergenceTrials = 0;
    for (const group of portGroups.filter(g => !g.out && !g.node.edge)) {
        const edgeInputs = group.links.filter(f => byKey.get(f.from)!.edge);
        if (!edgeInputs.length) continue;
        for (const f of group.links.filter(f => !byKey.get(f.from)!.edge)) {
            if (convergenceTrials++ >= 64) break;
            const conflicting = edgeInputs.filter(other => ribbonOverlap(f.route, f.width, other.route, other.width) > .05);
            if (!conflicting.length) continue;
            const arrivalX = Math.min(...conflicting.map(other =>
                (byKey.get(other.from)!.corridor ?? other.start.x) - (f.width + other.width) / 2 - 16));
            if (arrivalX < f.start.x + CLEAR || arrivalX >= f.end.x - CLEAR) continue;
            const end = { x: arrivalX, y: f.end.y }, control = (arrivalX - f.start.x) * .48;
            const curve = cubic(f.start, { x: f.start.x + control, y: f.start.y }, { x: arrivalX - control, y: end.y }, end);
            const candidate = describe(`${curve.path} L${f.end.x} ${f.end.y}`, [...curve.points, f.end]);
            const boxes = obstacles(f);
            if (routeCollisions(candidate, boxes, f.width / 2 + 2) > routeCollisions(f.route, boxes, f.width / 2 + 2)) continue;
            const others = transfers.filter(other => other !== f);
            if (others.some(other => crossings(candidate, other.route) > crossings(f.route, other.route))) continue;
            // Also check ribbon widths: no centerline crossing does not imply
            // separation. Preserve separated pairs and reduce total overlap;
            // an existing crossing may change its angle and contact length.
            let improvement = 0, worse = false;
            for (const other of others) {
                const before = ribbonOverlap(f.route, f.width, other.route, other.width);
                const after = ribbonOverlap(candidate, f.width, other.route, other.width);
                const change = before - after;
                improvement += change;
                if ((before <= 1 || other.to === f.to) && change < -1) { worse = true; break; }
            }
            if (!worse && improvement > .05) f.route = candidate;
        }
    }
    const occupied: Rect[] = items.flatMap(n => [inflate(n, 3), ...(n.label.w ? [inflate(n.label, 3)] : [])]);
    for (const f of [...transfers].sort((a, b) => b.width - a.width || positions.get(a.key)! - positions.get(b.key)!)) {
        const lines = fitted(label('transfer', f.key, String(f.amount)), 150, measure);
        let chosen: TextBox | undefined;
        const fractions = [.5, .42, .58, .34, .66, .26, .74, .18, .82];
        for (const fraction of fractions) {
            const p = pointAt(f.route, fraction), candidate = labelBox(lines, p.x, p.y, 'middle', measure, lineHeight);
            if (!occupied.some(r => intersects(inflate(candidate, 4), r))) {
                chosen = candidate;
                break;
            }
        }
        const p = pointAt(f.route, .5);
        f.label = chosen ?? labelBox(lines, p.x, p.y, 'middle', measure, lineHeight);
        f.labelHidden = !chosen && lines.length > 0;
        if (chosen && lines.length)
            occupied.push(inflate(chosen, 4));
    }
    let crossingCount = 0, obstacleCount = 0;
    for (let i = 0; i < transfers.length; i++) {
        obstacleCount += routeCollisions(transfers[i].route, obstacles(transfers[i]), transfers[i].width / 2);
        for (let j = i + 1; j < transfers.length; j++)
            crossingCount += crossings(transfers[i].route, transfers[j].route);
    }
    const scene = { width, height, scale, topBand, bottomBand, centralTop, centralHeight, items: items.sort((a, b) => a.index - b.index), transfers, diagnostics: { crossings: crossingCount, obstacleCollisions: obstacleCount } };
    // A single wide route may not fit between measured labels and stage bars.
    // Only unresolved obstacle clearance can grow the local canvas; row count and
    // the sum of edge footprints never trigger widening. Every resize starts fresh.
    if (obstacleCount && attempt < 5) {
        const retry = layoutGraph(model, { ...options, width: width + Math.max(80, maxRibbon + 32) }, attempt + 1);
        if (retry.diagnostics.obstacleCollisions < obstacleCount) {
            if (attempt === 0 && retry.diagnostics.obstacleCollisions === 0) {
                let best = retry, lower = width;
                // Refine the first working width without triggering more recursive retries.
                // A bounded search avoids a large, unnecessary horizontal scroll gutter.
                for (let i = 0; i < 5 && best.width - lower > 4; i++) {
                    const trial = layoutGraph(model, { ...options, width: (lower + best.width) / 2 }, 5);
                    if (trial.diagnostics.obstacleCollisions === 0)
                        best = trial;
                    else
                        lower = trial.width;
                }
                return best;
            }
            return retry;
        }
    }
    return scene;
}
/** Painted bars win, then a real ribbon hit, then the nearest thin hit corridor. */
export function hitTest(scene: Scene, point: Point) {
    for (let i = scene.items.length - 1; i >= 0; i--) {
        const n = scene.items[i];
        if (point.x >= n.x - 2 && point.x <= n.x + n.w + 2 && point.y >= n.y - 2 && point.y <= n.y + n.h + 2)
            return { kind: 'item' as const, key: n.key };
    }
    let best: {
        key: string;
        distance: number;
        painted: boolean;
        index: number;
    } | null = null;
    for (let i = 0; i < scene.transfers.length; i++) {
        const f = scene.transfers[i];
        if (!intersects(inflate(f.route.bounds, Math.max(5, f.width / 2)), { x: point.x - .01, y: point.y - .01, w: .02, h: .02 }))
            continue;
        const d = distanceToRoute(point, f.route), painted = d <= f.width / 2;
        if (d > Math.max(5, f.width / 2))
            continue;
        if (!best || (+painted > +best.painted) || painted === best.painted && (d < best.distance - .01 || Math.abs(d - best.distance) < .01 && i > best.index))
            best = { key: f.key, distance: d, painted, index: i };
    }
    return best ? { kind: 'transfer' as const, key: best.key } : null;
}
