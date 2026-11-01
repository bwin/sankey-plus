import type { ResolvedGraph } from './model.js';
import { nodeColor } from './model.js';
import { SankeyInputError } from './types.js';
import { avoidObstacles, crossings as countCrossings, cubic, distanceToRoute, flowCurve, inflate, intersects, insidePolygon, joinRoutes, parallelCurve, pointAt, ribbonOverlap, smoothPolyline, routeCollisions, taperedRibbon, type Point, type Rect, type Route } from './paths.js';
export interface TextBox extends Rect {
    lines: string[];
    anchor: 'start' | 'middle' | 'end';
    textX: number;
    textY: number;
}
export interface NodeGeometry extends Rect {
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
export interface LinkGeometry {
    key: string;
    from: string;
    to: string;
    amount: number;
    color: string;
    width: number;
    startWidth: number;
    endWidth: number;
    ribbon?: ReturnType<typeof taperedRibbon>;
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
    nodes: NodeGeometry[];
    links: LinkGeometry[];
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
    return lines.map(line => {
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
function packRow(nodes: NodeGeometry[]): number[] | null {
    const values: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i], minimum = Math.max(n.lo + n.w / 2, PAD + n.footprint / 2), maximum = n.hi - n.w / 2;
        values.push(Math.max(clamp(n.preferred, minimum, maximum), i ? values[i - 1] + nodes[i - 1].footprint / 2 + GAP + n.footprint / 2 : minimum));
    }
    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        values[i] = Math.min(values[i], n.hi - n.w / 2);
        if (i < nodes.length - 1)
            values[i] = Math.min(values[i], values[i + 1] - nodes[i + 1].footprint / 2 - GAP - n.footprint / 2);
        if (values[i] < Math.max(n.lo + n.w / 2, PAD + n.footprint / 2) - .001)
            return null;
    }
    return values;
}
function outward(n: NodeGeometry, outgoing: boolean): Point {
    return n.edge ? { x: 0, y: n.edge === 'top' ? 1 : -1 } : { x: outgoing ? 1 : -1, y: 0 };
}
const add = (a: Point, b: Point, scale = 1): Point => ({ x: a.x + b.x * scale, y: a.y + b.y * scale });
/** Synchronous entry for geometry tests and CPU benchmarks; shares every layout step. */
export function layoutGraph<I, T>(model: ResolvedGraph<I, T>, options: LayoutOptions, attempt = 0): Scene {
    const steps = layoutGraphSteps(model, options, attempt);
    let next = steps.next();
    while (!next.done) next = steps.next();
    return next.value;
}
/** Checkpoints are at phase/item boundaries; an individual geometry helper remains synchronous. */
export function* layoutGraphSteps<I, T>(model: ResolvedGraph<I, T>, options: LayoutOptions, attempt = 0): Generator<void, Scene, void> {
    const requested = options.width, plotHeight = options.plotHeight ?? 336;
    if (!Number.isFinite(requested) || requested <= 0 || !Number.isFinite(plotHeight) || plotHeight <= 0)
        throw new SankeyInputError([{ code: 'invalid-number', message: 'Layout width and plotHeight must be finite and positive.' }]);
    yield;
    // Scoring revisits the same route pairs during port swaps and diagnostics.
    // Routes are replaced, never mutated, during one layout attempt. Keep this
    // cache local so no geometry survives into a resize or a different graph.
    const crossingCache = new WeakMap<Route, WeakMap<Route, number>>();
    const crossings = (a: Route, b: Route): number => {
        if (!intersects(a.bounds, b.bounds)) return 0;
        const cached = crossingCache.get(a)?.get(b) ?? crossingCache.get(b)?.get(a);
        if (cached !== undefined) return cached;
        const result = countCrossings(a, b);
        let row = crossingCache.get(a);
        if (!row) { row = new WeakMap(); crossingCache.set(a, row); }
        row.set(b, result);
        return result;
    };
    const measure = options.measureText ?? ((s: string) => Array.from(s).length * 6.6), lineHeight = options.lineHeight ?? 16;
    const label = (kind: string, key: string, defaultText: string) => options.labels?.get(`${kind}:${key}`) ?? [defaultText];
    const amount = (link: { key: string }) => { const f = model.links.get(link.key)!; return Math.max(f.layoutInputAmount, f.layoutOutputAmount); };
    const stageIndex = new Map(model.stages.map((s, i) => [s, i]));
    const stages = model.stages.map(s => [...model.nodes.values()].filter(n => n.node.placement.stage === s));
    const edges = [...model.nodes.values()].filter(n => n.node.placement.edge);
    const leftExtra = edges.some(n => n.outgoingLinks.some(f => model.nodes.get(f.to)!.node.placement.stage === model.stages[0])) ? 1 : 0;
    const rightExtra = edges.some(n => n.incomingLinks.some(f => model.nodes.get(f.from)!.node.placement.stage === model.stages.at(-1))) ? 1 : 0;
    const slots = Math.max(1, stages.length - 1 + leftExtra + rightExtra);
    const minWidth = stages.length ? 2 * PAD + BAR + slots * 112 : 180;
    const width = Math.max(requested, minWidth);
    const step = (width - 2 * PAD - BAR) / slots;
    const axis = (index: number) => stages.length === 1 && !leftExtra && !rightExtra ? width / 2 - BAR / 2 : PAD + (index + leftExtra) * step;
    const maxCount = Math.max(0, ...stages.map(s => s.length));
    const labelHeight = (n: typeof edges[number]) => label('node', n.node.key, n.node.title).length * lineHeight;
    const expandedStages = stages.map(stage => stage.some(n => labelHeight(n) > lineHeight * 2));
    const centralHeight = Math.max(plotHeight, maxCount * (lineHeight * 2 + GAP), ...stages.map((stage, i) => expandedStages[i] ? sum(stage.map(n => Math.max(lineHeight * 2, labelHeight(n)) + GAP)) + GAP : 0));
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
        yield;
        let lo = PAD, hi = width - PAD;
        const sourceColumns = n.incomingLinks.map(f => model.nodes.get(f.from)!.node.placement.stage).filter((s): s is string => s !== undefined).map(s => stageIndex.get(s)!);
        const targetColumns = n.outgoingLinks.map(f => model.nodes.get(f.to)!.node.placement.stage).filter((s): s is string => s !== undefined).map(s => stageIndex.get(s)!);
        if (sourceColumns.length)
            lo = Math.max(lo, axis(Math.max(...sourceColumns)) + BAR + CLEAR);
        if (targetColumns.length)
            hi = Math.min(hi, axis(Math.min(...targetColumns)) - CLEAR);
        limits.set(n.node.key, { lo, hi });
        if (geomTotal(n) > 0)
            scale = Math.min(scale, Math.max(8, hi - lo - 28) / geomTotal(n));
    }
    // Wrapped simple fans reserve their corridor before packing. The value scale is
    // global: squeezing each ribbon separately would destroy quantitative meaning.
    const wrappedFans: {
        keys: string[];
        origin: number;
    }[] = [];
    for (const facts of model.nodes.values()) {
        yield;
        if (facts.node.placement.stage !== undefined)
            for (const side of ['top', 'bottom']) {
                const links = facts.outgoingLinks.filter(f => {
                    const target = model.nodes.get(f.to)!;
                    return target.node.placement.edge === side && target.incomingLinks.length === 1 && target.outgoingLinks.length === 0;
                });
                if (links.length < 2)
                    continue;
                const targets = links.map(f => model.nodes.get(f.to)!), lo = Math.max(...targets.map(n => limits.get(n.node.key)!.lo)), hi = Math.min(...targets.map(n => limits.get(n.node.key)!.hi)), available = hi - lo;
                const textWidths = targets.map(n => Math.min(148, Math.max(0, ...label('node', n.node.key, n.node.title).map(measure))));
                const needed = sum(targets.map((n, i) => Math.max(geomTotal(n) * scale, textWidths[i]))) + (targets.length - 1) * GAP;
                if (needed <= available)
                    continue;
                const strip = available * .55, labelWidth = Math.min(Math.max(...textWidths), available - strip);
                const traffic = sum(links.map(amount));
                const channelWidth = Math.max(8, strip - labelWidth / 2 - 10 - Math.max(0, links.length - 2) * LANE_GAP);
                scale = Math.min(scale, channelWidth / traffic);
                for (const n of targets)
                    limits.set(n.node.key, { lo: lo + strip, hi });
                wrappedFans.push({ keys: targets.map(n => n.node.key), origin: lo });
            }
    }
    // Extra balance lines need real row space. Keep quantitative bar heights
    // intact and reduce only the common scale when their text footprints need it.
    for (let col = 0; col < stages.length; col++) if (expandedStages[col]) {
        const stage = stages[col], available = centralHeight - (stage.length + 1) * GAP;
        const used = (valueScale: number) => sum(stage.map(n => Math.max(geomTotal(n) * valueScale, 3, labelHeight(n))));
        if (used(scale) > available) {
            let lo = 0, hi = scale;
            for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (used(mid) <= available) lo = mid; else hi = mid; }
            scale = lo;
        }
    }
    scale = Math.max(Number.MIN_VALUE, scale);
    const widestEdge = Math.max(0, ...edges.map(n => geomTotal(n) * scale));
    const mainLabelLimit = Math.max(48, Math.min(160, (step - BAR - widestEdge - 40) / 2));
    const nodes: NodeGeometry[] = [];
    for (let col = 0; col < stages.length; col++) {
        const stage = stages[col], sizes = stage.map(n => n.total ? geomTotal(n) * scale : 3);
        const footprints = stage.map((n, i) => expandedStages[col] ? Math.max(sizes[i], labelHeight(n)) : sizes[i]);
        const spacing = Math.max(GAP, (centralHeight - sum(footprints)) / (stage.length + 1));
        let y = spacing;
        for (let i = 0; i < stage.length; i++) {
            yield;
            const n = stage[i], x = axis(col), h = sizes[i], raw = label('node', n.node.key, n.node.title);
            const lines = fitted(raw, mainLabelLimit, measure), anchor = col === 0 ? 'start' : 'end';
            const barY = y + (footprints[i] - h) / 2;
            nodes.push({ key: n.node.key, index: model.graph.nodes.indexOf(n.node), x, y: barY, w: BAR, h, color: nodeColor(n.node.key, n.node.color), stage: model.stages[col], row: 0, zero: n.total === 0, lo: x, hi: x + BAR, preferred: x, footprint: BAR, label: labelBox(lines, anchor === 'start' ? x + BAR + 8 : x - 8, barY + h / 2, anchor, measure, lineHeight) });
            y += footprints[i] + spacing;
        }
    }
    const byKey = new Map(nodes.map(n => [n.key, n]));
    for (let i = 0; i < edges.length; i++) {
        yield;
        const facts = edges[i], n = facts.node, w = facts.total ? geomTotal(facts) * scale : 3;
        let { lo, hi } = limits.get(n.key)!;
        let routeLo = lo, routeHi = hi;
        let sx = 0, sw = 0, tx = 0, tw = 0;
        for (const f of facts.incomingLinks) {
            const other = byKey.get(f.from);
            if (other && !other.edge) {
                const members = nodes.filter(v => v.stage === other.stage && !v.edge);
                const right = Math.max(other.x + BAR, ...members.map(v => v.label.x + v.label.w));
                sx += right * amount(f);
                sw += amount(f);
                routeLo = Math.max(routeLo, right + 8);
            }
        }
        for (const f of facts.outgoingLinks) {
            const other = byKey.get(f.to);
            if (other && !other.edge) {
                const members = nodes.filter(v => v.stage === other.stage && !v.edge);
                const left = Math.min(other.x, ...members.map(v => v.label.x));
                tx += left * amount(f);
                tw += amount(f);
                routeHi = Math.min(routeHi, left - 8);
            }
        }
        // Packing must not push a wide vertical leg into the neighboring
        // stage's labels. Preserve this corridor whenever the bar fits;
        // tight mixed-role intervals still use the obstacle-routing fallback.
        if (routeHi - routeLo >= w) { lo = routeLo; hi = routeHi; }
        const raw = label('node', n.key, n.title), lines = fitted(raw, Math.max(40, Math.min(148, hi - lo, width - 2 * PAD)), measure);
        const footprint = Math.max(w, ...lines.map(measure), 0);
        const preferred = sw && tw ? (sx / sw + tx / tw) / 2 : sw ? sx / sw + 16 + footprint / 2 : tw ? tx / tw - 16 - footprint / 2 : PAD + (width - 2 * PAD) * (i + 1) / (edges.length + 1);
        const node: NodeGeometry = { key: n.key, index: model.graph.nodes.indexOf(n), x: 0, y: 0, w, h: BAR, color: nodeColor(n.key, n.color), edge: n.placement.edge!, row: 0, zero: facts.total === 0, lo: Math.max(lo, PAD + (footprint - w) / 2), hi: Math.min(hi, width - PAD - (footprint - w) / 2), preferred, footprint, label: labelBox(lines, 0, 0, 'middle', measure, lineHeight) };
        nodes.push(node);
        byKey.set(n.key, node);
    }
    const rows: {
        top: NodeGeometry[][];
        bottom: NodeGeometry[][];
    } = { top: [], bottom: [] };
    for (const edge of ['top', 'bottom'] as const) {
        const candidates = nodes.filter(n => n.edge === edge).sort((a, b) => a.preferred - b.preferred || a.index - b.index);
        for (const n of candidates) {
            yield;
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
    yield;
    const maxRibbon = Math.max(0, ...model.graph.links.map(f => amount(f) * scale));
    const edgeLabelHeight = Math.max(lineHeight * 2, ...nodes.filter(n => n.edge).map(n => n.label.h));
    const clearance = 72 + maxRibbon / 2, baseRowPitch = Math.max(86, edgeLabelHeight + BAR + maxRibbon + 32);
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
            let cursor = BAR + 10 + edgeLabelHeight + 8;
            let widest = 0;
            for (const node of targets) {
                const thickness = model.nodes.get(node.key)!.incoming * scale;
                fanLaneDistances.set(node.key, cursor + thickness / 2);
                cursor += thickness + LANE_GAP;
                widest = Math.max(widest, thickness);
            }
            // Leave room after the last lane for a broad arrival, rather than
            // spending the whole row pitch on horizontal lanes and squeezing
            // the final turn into a few pixels above the destination bar.
            rowPitches[side][row] = Math.max(rowPitches[side][row], cursor - LANE_GAP + Math.max(80, widest * 2 + 16));
        }
    }
    const rowOffsets = { top: [0], bottom: [0] };
    for (const side of ['top', 'bottom'] as const)
        for (let row = 1; row < rows[side].length; row++)
            rowOffsets[side][row] = rowOffsets[side][row - 1] + rowPitches[side][row];
    const band = (side: 'top' | 'bottom') => rows[side].length ? clearance + BAR + Math.max(lineHeight * 2, ...rows[side].flat().map(n => n.label.h)) + 12 + rowOffsets[side].at(-1)! : 0;
    const topBand = band('top'), bottomBand = band('bottom'), centralTop = PAD + topBand, height = PAD + topBand + centralHeight + bottomBand + PAD;
    for (const n of nodes) {
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
            const traffic = Math.max(...[...model.nodes.get(n.key)!.incomingLinks, ...model.nodes.get(n.key)!.outgoingLinks].map(f => amount(f) * scale), 0);
            const first = nearer.length ? Math.min(...nearer.map(o => o.x + o.w / 2 - o.footprint / 2)) : n.x;
            n.corridor = Math.max(PAD + traffic / 2, first - traffic / 2 - 10);
        }
    }
    for (const fan of wrappedFans) {
        let cursor = fan.origin;
        for (const n of fan.keys.map(k => byKey.get(k)!).filter(n => n.row > 0).sort((a, b) => b.row - a.row || a.x - b.x || a.index - b.index)) {
            const traffic = model.nodes.get(n.key)!.incoming * scale;
            n.corridor = cursor + traffic / 2;
            cursor += traffic + LANE_GAP;
        }
    }
    const links: LinkGeometry[] = model.graph.links.map(f => ({ key: f.key, from: f.from, to: f.to, amount: f.amount, width: amount(f) * scale,
        startWidth: model.links.get(f.key)!.layoutInputAmount * scale, endWidth: model.links.get(f.key)!.layoutOutputAmount * scale,
        color: nodeColor(f.to, f.color ?? byKey.get(f.to)!.color), start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, route: null as unknown as Route, label: labelBox([], 0, 0, 'middle', measure, lineHeight), labelHidden: false }));
    const positions = new Map(links.map((f, i) => [f.key, i]));
    const portGroups: {
        node: NodeGeometry;
        out: boolean;
        links: LinkGeometry[];
    }[] = [];
    for (const n of nodes)
        for (const out of [true, false]) {
            yield;
            const connectedLinks = links.filter(f => (out ? f.from : f.to) === n.key);
            const opposite = (f: LinkGeometry) => byKey.get(out ? f.to : f.from)!;
            // Incoming edge links retain their source's left-to-right order when
            // rows wrap. A detour corridor is not the source position: sorting by
            // it can move a rightmost bottom input above its neighboring input.
            // Outgoing fan-out still follows its reserved corridor order.
            const approach = (v: NodeGeometry) => out ? v.corridor ?? v.x + v.w / 2 : v.x + v.w / 2;
            connectedLinks.sort((a, b) => {
                const aa = opposite(a), bb = opposite(b);
                let order = 0;
                if (!n.edge) {
                    const rank = (v: NodeGeometry) => v.edge === 'top' ? 0 : v.edge === 'bottom' ? 2 : 1;
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
                const inputOrder = positions.get(a.key)! - positions.get(b.key)!;
                // Parallel links share the opposite node, so position sorting
                // cannot order their separate ports. Reverse the edge-side tie
                // when a bottom arrival or top departure turns the port axes;
                // otherwise the two ends force the ribbons to cross each other.
                const reverseParallel = n.edge && !aa.edge && aa.key === bb.key && ((n.edge === 'top') === out);
                return order || (reverseParallel ? -inputOrder : inputOrder);
            });
            portGroups.push({ node: n, out, links: connectedLinks });
        }
    function setPorts(group: typeof portGroups[number]) {
        const { node: n, out, links } = group;
        let offset = 0;
        for (const f of links) {
            const portWidth = out ? f.startWidth : f.endWidth;
            const p = n.edge ? { x: n.x + offset + portWidth / 2, y: n.edge === 'top' ? n.y + BAR : n.y } : { x: out ? n.x + BAR : n.x, y: n.y + offset + portWidth / 2 };
            if (out)
                f.start = p;
            else
                f.end = p;
            offset += portWidth;
        }
    }
    portGroups.forEach(setPorts);
    const obstacleCache = new Map<string, Rect[]>();
    const obstacles = (f: LinkGeometry) => {
        let boxes = obstacleCache.get(f.key);
        if (!boxes) {
            boxes = nodes.filter(n => n.key !== f.from && n.key !== f.to).flatMap(n => [n, ...(n.label.w ? [n.label] : [])]);
            obstacleCache.set(f.key, boxes);
        }
        return boxes;
    };
    const rowApproach = (node: NodeGeometry, flow: LinkGeometry) => {
        // The cross-row leg sits beyond the previous row's full label plus
        // half a ribbon. A fixed fraction of row pitch clips long custom labels.
        const distance = fanLaneDistances.get(node.key) ?? (BAR + 10 + edgeLabelHeight + flow.width / 2 + 8);
        const inset = rowPitches[node.edge!][node.row] - distance;
        return node.edge === 'bottom' ? node.y - inset : node.y + BAR + inset;
    };
    const fanRoutes = new Map<string, Route>();
    // Curves that share a fan follow a common normal-offset spine. Independent
    // Beziers can have ordered endpoints yet squeeze thick ribbons together.
    const parallelFan = (flows: LinkGeometry[], side: 'top' | 'bottom') => {
        if (flows.length < 2) return;
        const direction = side === 'bottom' ? 1 : -1;
        const inner = flows.reduce((a, b) => a.end.x < b.end.x ? a : b);
        if (flows.some(f => Math.abs(f.start.x - inner.start.x) > .01 || Math.abs(f.end.y - inner.end.y) > .01 || direction * (inner.start.y - f.start.y) < -.01)) return;
        // If a neighboring label blocks the broadest bend, adjust the shared
        // curve as a group before falling back to separate obstacle detours.
        // Rerouting one ribbon alone can cross the rest of a parallel bundle.
        for (const tension of [.8, .9, 1, .6, .5]) {
            const trial = flows.map(f => parallelCurve(inner.start, inner.end, { x: 1, y: 0 }, { x: 0, y: direction }, direction * (inner.start.y - f.start.y), f.end.x - inner.end.x, direction, tension));
            if (trial.every((route, i) => !routeCollisions(route, obstacles(flows[i]), flows[i].width / 2 + 2))) {
                flows.forEach((f, i) => fanRoutes.set(f.key, trial[i]));
                break;
            }
        }
    };
    for (const group of portGroups) {
        if (group.out && !group.node.edge) for (const side of ['top', 'bottom'] as const)
            parallelFan(group.links.filter(f => { const n = byKey.get(f.to)!; return n.edge === side && !n.row; }), side);
        if (!group.out && group.node.edge && !group.node.row)
            parallelFan(group.links.filter(f => !byKey.get(f.from)!.edge), group.node.edge);
    }
    for (const fan of wrappedFans) {
        const members = fan.keys.map(key => byKey.get(key)!).filter(n => n.row > 0);
        if (!members.length) continue;
        const flows = members.map(n => links.find(f => f.to === n.key)!);
        const side = members[0].edge!, direction = side === 'bottom' ? 1 : -1;
        const inner = flows.reduce((a, b) => direction * a.start.y > direction * b.start.y ? a : b);
        const minX = Math.min(...members.map(n => n.corridor!));
        const firstEnd = { x: minX, y: side === 'bottom' ? centralTop + centralHeight : centralTop };
        const down = { x: 0, y: direction }, right = { x: 1, y: 0 };
        const trial = new Map<string, Route>();
        for (const row of new Set(members.map(n => n.row))) {
            const rowNodes = members.filter(n => n.row === row);
            const rightmost = rowNodes.reduce((a, b) => a.corridor! > b.corridor! ? a : b);
            const rightFlow = flows.find(f => f.to === rightmost.key)!;
            const leftFlow = rowNodes.map(n => flows.find(f => f.to === n.key)!).reduce((a, b) => a.end.x < b.end.x ? a : b);
            const rightLaneY = rowApproach(rightmost, rightFlow), leftLaneY = rowApproach(byKey.get(leftFlow.to)!, leftFlow);
            const turnX = (rightmost.corridor! + leftFlow.end.x) / 2;
            const beginY = rightLaneY - direction * Math.min(Math.abs(rightLaneY - firstEnd.y) * .45, turnX - rightmost.corridor!);
            for (const n of rowNodes) {
                yield;
                const f = flows.find(f => f.to === n.key)!, laneY = rowApproach(n, f);
                const first = parallelCurve(inner.start, firstEnd, right, down, direction * (inner.start.y - f.start.y), n.corridor! - minX, direction);
                const second = parallelCurve({ x: rightmost.corridor!, y: beginY }, { x: turnX, y: rightLaneY }, down, right, rightmost.corridor! - n.corridor!, direction * (laneY - rightLaneY), -direction);
                const last = parallelCurve({ x: turnX, y: leftLaneY }, leftFlow.end, right, down, direction * (leftLaneY - laneY), f.end.x - leftFlow.end.x, direction);
                const route = joinRoutes([first, flowCurve(first.points.at(-1)!, second.points[0], down, down), second, last]);
                if (!routeCollisions(route, obstacles(f), f.width / 2 + 2)) trial.set(f.key, route);
            }
        }
        if (trial.size === flows.length) for (const [key, route] of trial) fanRoutes.set(key, route);
    }
    function ordinary(f: LinkGeometry): Route {
        const shared = fanRoutes.get(f.key);
        if (shared) return shared;
        const a = byKey.get(f.from)!, b = byKey.get(f.to)!, s = f.start, t = f.end;
        if (!a.edge && !b.edge) {
            const d = (t.x - s.x) * .48;
            return cubic(s, { x: s.x + d, y: s.y }, { x: t.x - d, y: t.y }, t);
        }
        if (!a.edge && b.edge) {
            if (b.row && b.corridor !== undefined && b.corridor > s.x + f.width / 2 + 4) {
                const approachY = rowApproach(b, f);
                return smoothPolyline([s, { x: b.corridor, y: s.y }, { x: b.corridor, y: approachY }, { x: t.x, y: approachY }, t]);
            }
            return smoothPolyline([s, { x: t.x, y: s.y }, t]);
        }
        if (a.edge && !b.edge) {
            if (a.row && a.corridor !== undefined) {
                const approachY = rowApproach(a, f);
                return smoothPolyline([s, { x: s.x, y: approachY }, { x: a.corridor, y: approachY }, { x: a.corridor, y: t.y }, t]);
            }
            return smoothPolyline([s, { x: s.x, y: t.y }, t]);
        }
        const mid = a.edge === b.edge ? (a.edge === 'top' ? Math.max(s.y, t.y) + clearance * .65 : Math.min(s.y, t.y) - clearance * .65) : (centralTop + centralHeight / 2);
        return smoothPolyline([s, { x: s.x, y: mid }, { x: t.x, y: mid }, t]);
    }
    const score = (f: LinkGeometry, route: Route) => {
        const collisions = routeCollisions(route, obstacles(f), f.width / 2 + 2);
        const cross = links.reduce((n, o) => n + (o !== f && o.route ? crossings(route, o.route) : 0), 0);
        return collisions * 1e8 + cross * 1e4 + route.length;
    };
    for (const f of links) {
        yield;
        f.route = ordinary(f);
    }
    // First repair obstacles; all alternatives preserve the same endpoint faces.
    for (const f of links) {
        yield;
        const boxes = obstacles(f);
        if (!routeCollisions(f.route, boxes, f.width / 2 + 2))
            continue;
        const a = byKey.get(f.from)!, b = byKey.get(f.to)!;
        // A skipping-stage link can often pass through the existing gap by
        // easing earlier or later. Search those direct curves before reserving
        // an inflated orthogonal corridor that may close the gap entirely.
        if (!a.edge && !b.edge) {
            const dx = f.end.x - f.start.x;
            for (const from of [.25, .5, .75]) for (const to of [.25, .5, .75]) {
                yield;
                const candidate = cubic(f.start, { x: f.start.x + dx * from, y: f.start.y },
                    { x: f.end.x - dx * to, y: f.end.y }, f.end);
                if (score(f, candidate) < score(f, f.route)) f.route = candidate;
            }
            if (!routeCollisions(f.route, boxes, f.width / 2 + 2)) continue;
        }
        if (!!a.edge !== !!b.edge) {
            const out = outward(a, true), back = outward(b, false);
            const dx = Math.abs(f.end.x - f.start.x), dy = Math.abs(f.end.y - f.start.y);
            const others = links.filter(other => other !== f);
            const overlaps = others.map(other => ribbonOverlap(f.route, f.width, other.route, other.width));
            for (const from of [.5, .8, 1]) for (const to of [.5, .8, 1]) {
                yield;
                const candidate = cubic(f.start, add(f.start, out, (out.x ? dx : dy) * from),
                    add(f.end, back, (back.x ? dx : dy) * to), f.end);
                if (routeCollisions(candidate, boxes, f.width / 2 + 2) || score(f, candidate) >= score(f, f.route)) continue;
                if (others.some((other, i) => ribbonOverlap(candidate, f.width, other.route, other.width) > Math.max(1, overlaps[i]))) continue;
                f.route = candidate;
            }
            if (!routeCollisions(f.route, boxes, f.width / 2 + 2)) continue;
        }
        for (const fraction of [1, .5, .25, .125]) {
            yield;
            const turnSpan = Math.max(8, Math.min(32, f.width / 2 + 6)) * fraction, padding = f.width / 2 + turnSpan + 3;
            const start = add(f.start, outward(a, true), padding), end = add(f.end, outward(b, false), padding);
            const route = avoidObstacles(start, end, boxes.map(r => inflate(r, padding)), { x: PAD / 2 + f.width / 2, y: PAD / 2 + f.width / 2, w: width - PAD - f.width, h: height - PAD - f.width });
            if (route) {
                const candidate = smoothPolyline([f.start, ...route, f.end], turnSpan);
                if (score(f, candidate) < score(f, f.route)) f.route = candidate;
                if (!routeCollisions(f.route, boxes, f.width / 2 + 2)) break;
            }
        }
    }
    // A fixed two-pass budget avoids combinatorial search or hover-time layout work.
    // Simple ordered turns are constructed above and are never heuristically permuted.
    const eligible = portGroups.filter(g => !g.node.edge && g.links.length > 1 && g.links.every(f => !byKey.get(g.out ? f.to : f.from)!.edge));
    let swaps = 0;
    for (let pass = 0; pass < 2; pass++)
        for (const group of eligible)
            for (let i = 0; i < group.links.length - 1 && swaps < 64; i++, swaps++) {
                yield;
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
            yield;
            if (convergenceTrials++ >= 64) break;
            const conflicting = edgeInputs.filter(other => ribbonOverlap(f.route, f.width, other.route, other.width) > .05);
            if (!conflicting.length) continue;
            const arrivalX = Math.min(...conflicting.map(other => {
                // A detoured or curved input need not follow its source's x or
                // nominal corridor. Find its actual envelope near this approach.
                const padding = (f.width + other.width) / 2 + 16;
                const lo = Math.min(f.start.y, f.end.y) - padding, hi = Math.max(f.start.y, f.end.y) + padding;
                let x = Infinity;
                for (let i = 1; i < other.route.points.length; i++) {
                    const a = other.route.points[i - 1], b = other.route.points[i];
                    if (Math.max(a.y, b.y) < lo || Math.min(a.y, b.y) > hi) continue;
                    const t1 = b.y === a.y ? 0 : clamp((lo - a.y) / (b.y - a.y), 0, 1);
                    const t2 = b.y === a.y ? 1 : clamp((hi - a.y) / (b.y - a.y), 0, 1);
                    x = Math.min(x, a.x + (b.x - a.x) * t1, a.x + (b.x - a.x) * t2);
                }
                return x - padding;
            }));
            if (arrivalX < f.start.x + CLEAR || arrivalX >= f.end.x - CLEAR) continue;
            const end = { x: arrivalX, y: f.end.y }, control = (arrivalX - f.start.x) * .48;
            const curve = cubic(f.start, { x: f.start.x + control, y: f.start.y }, { x: arrivalX - control, y: end.y }, end);
            const candidate = joinRoutes([curve, flowCurve(end, f.end, { x: 1, y: 0 }, { x: 1, y: 0 })]);
            const boxes = obstacles(f);
            if (routeCollisions(candidate, boxes, f.width / 2 + 2) > routeCollisions(f.route, boxes, f.width / 2 + 2)) continue;
            const others = links.filter(other => other !== f);
            if (others.some(other => crossings(candidate, other.route) > crossings(f.route, other.route))) continue;
            // Also check ribbon widths: no centerline crossing does not imply
            // separation. Preserve separated pairs and reduce total overlap;
            // an existing crossing may change its angle and contact length.
            let improvement = 0, worse = false;
            for (const other of others) {
                yield;
                const before = ribbonOverlap(f.route, f.width, other.route, other.width);
                const after = ribbonOverlap(candidate, f.width, other.route, other.width);
                const change = before - after;
                improvement += change;
                if ((before <= 1 || other.to === f.to) && change < -1) { worse = true; break; }
            }
            if (!worse && improvement > .05) f.route = candidate;
        }
    }
    // Vertically translated stage curves squeeze touching strokes together on
    // their sloping section. For parallel links with matching port spacing,
    // follow a shared normal-offset wave instead. Leave detours and all other
    // routes alone; accept the whole bundle only if its surroundings stay clear.
    const right = { x: 1, y: 0 };
    for (const group of portGroups.filter(g => !g.out && !g.node.edge)) {
        for (const from of new Set(group.links.map(f => f.from))) {
            if (byKey.get(from)!.edge) continue;
            const flows = group.links.filter(f => f.from === from).sort((a, b) => a.start.y - b.start.y);
            if (flows.length < 2) continue;
            yield;
            const first = flows[0], last = flows.at(-1)!;
            if (flows.some(f => Math.abs((f.start.y - first.start.y) - (f.end.y - first.end.y)) > .01 ||
                f.route.path !== flowCurve(f.start, f.end, right, right, .48).path)) continue;
            if (!flows.some((f, i) => flows.slice(i + 1).some(o => ribbonOverlap(f.route, f.width, o.route, o.width) > .05))) continue;
            const others = links.filter(f => !flows.includes(f));
            // Anchor on the outside of the bend first, keeping the adjacent
            // departure unchanged; try the other side if an obstacle blocks it.
            const anchors = first.end.y >= first.start.y ? [last, first] : [first, last];
            for (const anchor of anchors) {
                yield;
                const trial = flows.map(f => parallelCurve(anchor.start, anchor.end, right, right,
                    f.start.y - anchor.start.y, f.end.y - anchor.end.y, -1, .48));
                let safe = true;
                for (let i = 0; i < flows.length && safe; i++) {
                    yield;
                    const f = flows[i], route = trial[i];
                    if (route.points.some((p, j) => j > 0 && p.x < route.points[j - 1].x - .001) ||
                        routeCollisions(route, obstacles(f), f.width / 2 + 2)) { safe = false; break; }
                    for (let j = i + 1; j < flows.length; j++) {
                        if (crossings(route, trial[j]) || ribbonOverlap(route, f.width, trial[j], flows[j].width) > .05) { safe = false; break; }
                    }
                    for (const other of others) {
                        if (!safe) break;
                        if (crossings(route, other.route) > crossings(f.route, other.route) ||
                            ribbonOverlap(route, f.width, other.route, other.width) > ribbonOverlap(f.route, f.width, other.route, other.width) + .25) safe = false;
                    }
                }
                if (safe) { flows.forEach((f, i) => { f.route = trial[i]; }); break; }
            }
        }
    }
    const occupied: Rect[] = nodes.flatMap(n => [inflate(n, 3), ...(n.label.w ? [inflate(n.label, 3)] : [])]);
    for (const f of [...links].sort((a, b) => b.width - a.width || positions.get(a.key)! - positions.get(b.key)!)) {
        yield;
        const lines = fitted(label('link', f.key, String(f.amount)), 150, measure);
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
    for (let i = 0; i < links.length; i++) {
        yield;
        const f = links[i];
        if (Math.abs(f.startWidth - f.endWidth) > 1e-9 * f.width) f.ribbon = taperedRibbon(f.route, f.startWidth, f.endWidth);
        obstacleCount += routeCollisions(links[i].route, obstacles(links[i]), links[i].width / 2);
        for (let j = i + 1; j < links.length; j++)
            crossingCount += crossings(links[i].route, links[j].route);
    }
    const scene = { width, height, scale, topBand, bottomBand, centralTop, centralHeight, nodes: nodes.sort((a, b) => a.index - b.index), links, diagnostics: { crossings: crossingCount, obstacleCollisions: obstacleCount } };
    // A single wide route may not fit between measured labels and stage bars.
    // Only unresolved obstacle clearance can grow the local canvas; row count and
    // the sum of edge footprints never trigger widening. Every resize starts fresh.
    if (obstacleCount && attempt < 5) {
        const retry = yield* layoutGraphSteps(model, { ...options, width: width + Math.max(80, maxRibbon + 32) }, attempt + 1);
        if (retry.diagnostics.obstacleCollisions < obstacleCount) {
            if (attempt === 0 && retry.diagnostics.obstacleCollisions === 0) {
                let best = retry, lower = width;
                // Refine the first working width without triggering more recursive retries.
                // A bounded search avoids a large, unnecessary horizontal scroll gutter.
                for (let i = 0; i < 5 && best.width - lower > 4; i++) {
                    const trial = yield* layoutGraphSteps(model, { ...options, width: (lower + best.width) / 2 }, 5);
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
/** Bars and visible labels win, then a real ribbon hit or thin hit corridor. */
export function hitTest(scene: Scene, point: Point) {
    for (let i = scene.nodes.length - 1; i >= 0; i--) {
        const n = scene.nodes[i];
        if (point.x >= n.x - 2 && point.x <= n.x + n.w + 2 && point.y >= n.y - 2 && point.y <= n.y + n.h + 2)
            return { kind: 'node' as const, key: n.key };
    }
    const onLabel = (box: TextBox) => box.w > 0 && box.h > 0 && point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
    // Labels are painted above ribbons. Clicking a node's name must not activate
    // a link that happens to pass underneath it.
    for (let i = scene.nodes.length - 1; i >= 0; i--)
        if (onLabel(scene.nodes[i].label)) return { kind: 'node' as const, key: scene.nodes[i].key };
    for (let i = scene.links.length - 1; i >= 0; i--)
        if (!scene.links[i].labelHidden && onLabel(scene.links[i].label)) return { kind: 'link' as const, key: scene.links[i].key };
    let best: {
        key: string;
        distance: number;
        painted: boolean;
        index: number;
    } | null = null;
    for (let i = 0; i < scene.links.length; i++) {
        const f = scene.links[i];
        if (!intersects(inflate(f.route.bounds, Math.max(5, f.width / 2)), { x: point.x - .01, y: point.y - .01, w: .02, h: .02 }))
            continue;
        const d = distanceToRoute(point, f.route), painted = f.ribbon ? insidePolygon(point, f.ribbon.points) : d <= f.width / 2;
        if (!painted && d > 5)
            continue;
        if (!best || (+painted > +best.painted) || painted === best.painted && (d < best.distance - .01 || Math.abs(d - best.distance) < .01 && i > best.index))
            best = { key: f.key, distance: d, painted, index: i };
    }
    return best ? { kind: 'link' as const, key: best.key } : null;
}
