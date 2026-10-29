import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveGraph, emphasis, itemColor } from '../src/model.js';
import { layoutGraph, hitTest } from '../src/layout.js';
import { crossings, distanceToRoute, distanceToSegment, inflate, intersects, pointAt, ribbonBounds, routeCollisions } from '../src/paths.js';
import { FlowInputError, type FlowGraph, type FlowIssueCode } from '../src/types.js';
const full = JSON.parse(readFileSync(new URL('../../demo/feature-demo.json', import.meta.url), 'utf8')) as FlowGraph;
const base: FlowGraph = { stages: ['a', 'b'], items: [{ key: 'a', title: 'Available', total: 1000, placement: { stage: 'a' } }, { key: 'b', title: 'Allocated', placement: { stage: 'b' } }], transfers: [{ key: 'ab', from: 'a', to: 'b', amount: 500 }] };
const error = (graph: FlowGraph, code: FlowIssueCode) => assert.throws(() => resolveGraph(graph), (e: unknown) => e instanceof FlowInputError && e.issues.some(issue => issue.code === code));
function fan(edge: 'top' | 'bottom' = 'bottom', count = 3): FlowGraph {
    return { stages: ['a'], items: [{ key: 'a', title: 'Process', placement: { stage: 'a' } }, ...Array.from({ length: count }, (_, i) => ({ key: `d${i}`, title: `Destination ${i + 1}`, placement: { edge } }))], transfers: Array.from({ length: count }, (_, i) => ({ key: `f${i}`, from: 'a', to: `d${i}`, amount: 100 })) };
}
function separation(a: ReturnType<typeof layoutGraph>['transfers'][number], b: ReturnType<typeof layoutGraph>['transfers'][number]) {
    let closest = Infinity;
    for (const p of a.route.points)
        for (let i = 1; i < b.route.points.length; i++)
            closest = Math.min(closest, distanceToSegment(p, b.route.points[i - 1], b.route.points[i]));
    for (const p of b.route.points)
        for (let i = 1; i < a.route.points.length; i++)
            closest = Math.min(closest, distanceToSegment(p, a.route.points[i - 1], a.route.points[i]));
    return closest - (a.width + b.width) / 2;
}
test('explicit totals preserve partial allocation and one common scale', () => {
    const model = resolveGraph(base), scene = layoutGraph(model, { width: 900 });
    assert.equal(model.items.get('a')!.total, 1000);
    assert.equal(model.items.get('b')!.total, 500);
    assert.equal(scene.items[0].h, scene.items[1].h * 2);
    assert.equal(scene.items[0].h, scene.transfers[0].width * 2);
    assert.equal(scene.topBand, 0);
    assert.equal(scene.bottomBand, 0);
});
test('mixed-role total uses max, with original inputs and metadata retained', () => {
    const model = resolveGraph(full);
    const n = model.items.get('reserve')!;
    assert.equal(n.total, 500);
    assert.equal(n.incoming, 100);
    assert.equal(n.outgoing, 300);
    assert.equal(n.item, full.items.find(n => n.key === 'reserve'));
    assert.equal(model.transfers.get('reserve-process')!.transfer, full.transfers[0]);
});
test('validation catches bad totals, identities, numbers, placement and backwards stages', () => {
    error({ ...base, items: [{ ...base.items[0], total: 400 }, base.items[1]] }, 'total-too-small');
    error({ ...base, items: [...base.items, base.items[0]] }, 'duplicate-key');
    error({ ...base, transfers: [{ ...base.transfers[0], to: 'missing' }] }, 'unknown-endpoint');
    error({ ...base, transfers: [{ ...base.transfers[0], amount: NaN }] }, 'invalid-number');
    error({ ...base, items: [{ ...base.items[0], placement: { stage: 'missing' } }, base.items[1]] }, 'unknown-stage');
    error({ ...base, transfers: [{ ...base.transfers[0], from: 'b', to: 'a' }] }, 'backward-stage-transfer');
});
test('cycles through edge nodes and incompatible relays fail before layout', () => {
    const graph: FlowGraph = { stages: ['a', 'b'], items: [...base.items, { key: 'edge', title: 'Relay', placement: { edge: 'top' } }], transfers: [...base.transfers, { key: 'be', from: 'b', to: 'edge', amount: 100 }, { key: 'ea', from: 'edge', to: 'a', amount: 100 }] };
    error(graph, 'cycle');
    error(graph, 'incompatible-placement');
    error({ stages: [], items: [{ key: 'x', title: 'X', placement: { edge: 'top' } }], transfers: [{ key: 'self', from: 'x', to: 'x', amount: 1 }] }, 'cycle');
});
test('isolated zero nodes render finite markers and occupy only their assigned edge', () => {
    const graph: FlowGraph = { stages: [], items: [{ key: 'zero', title: 'Zero', placement: { edge: 'bottom' } }], transfers: [] };
    const scene = layoutGraph(resolveGraph(graph), { width: 360 });
    assert.equal(scene.topBand, 0);
    assert.ok(scene.bottomBand > 0);
    assert.equal(scene.items[0].zero, true);
    assert.ok(scene.items[0].w > 0);
});
test('hover is exactly one hop, not the induced subgraph of strong nodes', () => {
    const model = resolveGraph(full), strong = emphasis(model, { kind: 'item', key: 'process-a' });
    assert.deepEqual([...strong.items].sort(), ['process-a', 'reserve', 'supply-a', 'supply-b', 'outcome-a', 'archive', 'loss'].sort());
    assert.equal(strong.transfers.size, 6);
    assert.equal(strong.transfers.has('supply-a-reserve'), false);
    const one = emphasis(model, { kind: 'transfer', key: 'supply-b-unassigned' });
    assert.equal(one.items.size, 2);
    assert.equal(one.transfers.size, 1);
});
test('isolated hover and clearing inspection have precise sets', () => {
    const graph = { ...base, items: [...base.items, { key: 'zero', title: 'Zero', placement: { stage: 'a' } }] };
    const model = resolveGraph(graph);
    assert.deepEqual([...emphasis(model, { kind: 'item', key: 'zero' }).items], ['zero']);
    assert.equal(emphasis(model, null).items.size, 3);
});
for (const width of [1440, 960, 600, 360])
    test(`full fixture at ${width}px preserves axes, valid intervals and containment`, () => {
        const scene = layoutGraph(resolveGraph(full), { width });
        assert.equal(scene.diagnostics.obstacleCollisions, 0, 'ribbons clear unrelated bars and labels');
        const items = new Map(scene.items.map(n => [n.key, n]));
        assert.equal(items.get('process-a')!.x, items.get('process-b')!.x);
        for (const n of scene.items) {
            assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= scene.width + .01 && n.y + n.h <= scene.height + .01, `bar ${n.key}`);
            assert.ok(n.label.x >= -.01 && n.label.x + n.label.w <= scene.width + .01, `label ${n.key}`);
            if (n.edge) {
                assert.ok(n.x >= n.lo - .01, n.key);
                assert.ok(n.x + n.w <= n.hi + .01, n.key);
            }
        }
        for (const f of scene.transfers) {
            assert.ok(!/NaN|Infinity/.test(f.route.path));
            const a = items.get(f.from)!, b = items.get(f.to)!;
            if (a.edge)
                assert.equal(f.start.y, a.edge === 'top' ? a.y + a.h : a.y);
            else
                assert.equal(f.start.x, a.x + a.w);
            if (b.edge)
                assert.equal(f.end.y, b.edge === 'top' ? b.y + b.h : b.y);
            else
                assert.equal(f.end.x, b.x);
            const envelope = ribbonBounds(f.route, f.width);
            assert.ok(envelope.x >= -.1 && envelope.y >= -.1 && envelope.x + envelope.w <= scene.width + .1 && envelope.y + envelope.h <= scene.height + .1, `ribbon ${f.key}`);
        }
        const arrivals = scene.transfers.filter(f => f.to === 'unassigned');
        assert.ok(arrivals.find(f => f.from === 'supply-b')!.end.x < arrivals.find(f => f.from === 'supply-a')!.end.x);
    });
for (const edge of ['top', 'bottom'] as const)
    for (const width of [900, 300])
        test(`${edge} simple fan-out at ${width}px has no ribbon crossings or overlap`, () => {
            const scene = layoutGraph(resolveGraph(fan(edge)), { width });
            for (let i = 0; i < scene.transfers.length; i++)
                for (let j = i + 1; j < scene.transfers.length; j++) {
                    const a = scene.transfers[i], b = scene.transfers[j];
                    assert.equal(crossings(a.route, b.route), 0, `${a.key}/${b.key}`);
                    assert.ok(separation(a, b) > -.6, `${a.key}/${b.key} overlap = ${separation(a, b)}`);
                }
            for (const f of scene.transfers) {
                const other = scene.items.filter(n => n.key !== f.from && n.key !== f.to).flatMap(n => [n, n.label]);
                assert.equal(routeCollisions(f.route, other, f.width / 2), 0, `obstacle on ${f.key}`);
            }
        });
test('scrambling fan-out transfer inputs preserves each route identity and geometry', () => {
    const graph = fan(), a = layoutGraph(resolveGraph(graph), { width: 900 }), b = layoutGraph(resolveGraph({ ...graph, transfers: [...graph.transfers].reverse() }), { width: 900 });
    for (const f of a.transfers)
        assert.equal(f.route.path, b.transfers.find(t => t.key === f.key)!.route.path);
});
test('edge crowding wraps and widening removes rows without aggregate minimum width', () => {
    const graph = fan('bottom', 12), narrow = layoutGraph(resolveGraph(graph), { width: 360 }), wide = layoutGraph(resolveGraph(graph), { width: 1440 });
    assert.equal(narrow.width, 360);
    assert.ok(Math.max(...narrow.items.map(n => n.row)) > 0);
    assert.ok(narrow.bottomBand > wide.bottomBand);
    for (const a of narrow.items.filter(n => n.edge))
        for (const b of narrow.items.filter(n => n.edge && n.key !== a.key && n.row === a.row))
            assert.equal(intersects(a.label, b.label), false);
});
test('top-only, bottom-only and no edges reserve independent bands', () => {
    const top = layoutGraph(resolveGraph(fan('top')), { width: 900 }), bottom = layoutGraph(resolveGraph(fan()), { width: 900 }), none = layoutGraph(resolveGraph(base), { width: 900 });
    assert.ok(top.topBand > 0);
    assert.equal(top.bottomBand, 0);
    assert.ok(bottom.bottomBand > 0);
    assert.equal(bottom.topBand, 0);
    assert.equal(none.topBand + none.bottomBand, 0);
});
test('bottom sources leave upward and top sources leave downward', () => {
    for (const edge of ['top', 'bottom'] as const) {
        const graph: FlowGraph = { stages: ['a'], items: [{ key: 'a', title: 'A', placement: { stage: 'a' } }, { key: 'edge', title: 'Edge', placement: { edge } }], transfers: [{ key: 'flow', from: 'edge', to: 'a', amount: 100 }] };
        const f = layoutGraph(resolveGraph(graph), { width: 600 }).transfers[0];
        const next = f.route.points.find(p => Math.hypot(p.x - f.start.x, p.y - f.start.y) > .1)!;
        assert.equal(next.x, f.start.x);
        assert.ok(edge === 'top' ? next.y > f.start.y : next.y < f.start.y);
    }
});
test('hit testing prefers bars and retains distinct parallel transfer identities', () => {
    const graph = { ...base, transfers: [{ ...base.transfers[0], amount: 200 }, { ...base.transfers[0], key: 'parallel', amount: 300 }] }, scene = layoutGraph(resolveGraph(graph), { width: 900 }), bar = scene.items[0];
    assert.deepEqual(hitTest(scene, { x: bar.x + bar.w / 2, y: bar.y + bar.h / 2 }), { kind: 'item', key: 'a' });
    for (const f of scene.transfers)
        assert.deepEqual(hitTest(scene, pointAt(f.route, .5)), { kind: 'transfer', key: f.key });
});

test('clicking a node label selects that node instead of a ribbon underneath', () => {
    const scene = layoutGraph(resolveGraph(base), { width: 900 });
    const label = scene.items.find(n => n.key === 'a')!.label;
    assert.deepEqual(hitTest(scene, { x: label.x + label.w / 2, y: label.y + label.h / 2 }), { kind: 'item', key: 'a' });
});

test('visible transfer labels are clickable beyond thin strokes; hidden labels are not', () => {
    const graph = { ...base, transfers: [{ ...base.transfers[0], amount: 1 }] };
    const scene = layoutGraph(resolveGraph(graph), { width: 900 });
    const transfer = scene.transfers[0], label = transfer.label;
    const point = { x: label.x + label.w / 2, y: label.y + .5 };
    assert.ok(distanceToRoute(point, transfer.route) > 5, 'point is outside the thin ribbon hit corridor');
    assert.deepEqual(hitTest(scene, point), { kind: 'transfer', key: transfer.key });
    transfer.labelHidden = true;
    assert.equal(hitTest(scene, point), null);
});
test('text is measured, clipped to two lines and remains inside the canvas', () => {
    const labels = new Map([['item:a', ['This is a particularly long title', 'Second line', 'Third line']], ['transfer:ab', []]]);
    const scene = layoutGraph(resolveGraph(base), { width: 360, labels, measureText: s => s.length * 9 });
    assert.equal(scene.items[0].label.lines.length, 2);
    assert.ok(scene.items[0].label.lines[0].endsWith('…'));
    assert.equal(scene.transfers[0].label.lines.length, 0);
});
test('layout is deterministic and does not mutate deeply frozen input', () => {
    const freeze = (v: unknown) => { if (v && typeof v === 'object') {
        Object.freeze(v);
        Object.values(v).forEach(freeze);
    } };
    freeze(full);
    const before = JSON.stringify(full), model = resolveGraph(full), a = layoutGraph(model, { width: 960 }), b = layoutGraph(model, { width: 960 });
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(full), before);
    assert.equal(itemColor('stable'), itemColor('stable'));
});
test('an invalid plot height fails instead of producing broken SVG', () => {
    assert.throws(() => layoutGraph(resolveGraph(base), { width: 800, plotHeight: NaN }), FlowInputError);
});
for (const edge of ['top', 'bottom'] as const)
    test(`${edge} simple fan-in preserves separate ribbons`, () => {
        const graph: FlowGraph = { stages: ['a'], items: [{ key: 'a', title: 'A', placement: { stage: 'a' } }, { key: 'b', title: 'B', placement: { stage: 'a' } }, { key: 'sink', title: 'Sink', placement: { edge } }], transfers: [{ key: 'as', from: 'a', to: 'sink', amount: 700 }, { key: 'bs', from: 'b', to: 'sink', amount: 250 }] };
        for (const width of [360, 900]) {
            const scene = layoutGraph(resolveGraph(graph), { width }), [a, b] = scene.transfers;
            assert.equal(crossings(a.route, b.route), 0);
            assert.ok(separation(a, b) > -.6);
            assert.equal(scene.diagnostics.obstacleCollisions, 0);
        }
    });
test('edge-to-edge transfers have finite paths and inward endpoint faces', () => {
    for (const from of ['top', 'bottom'] as const)
        for (const to of ['top', 'bottom'] as const) {
            const graph: FlowGraph = { stages: [], items: [{ key: 'a', title: 'A', placement: { edge: from } }, { key: 'b', title: 'B', placement: { edge: to } }], transfers: [{ key: 'ab', from: 'a', to: 'b', amount: 100 }] };
            const scene = layoutGraph(resolveGraph(graph), { width: 600 }), f = scene.transfers[0];
            assert.ok(!/NaN|Infinity/.test(f.route.path));
            assert.ok(f.route.length > 0);
            const after = f.route.points.find(p => Math.hypot(p.x - f.start.x, p.y - f.start.y) > .1)!;
            const before = [...f.route.points].reverse().find(p => Math.hypot(p.x - f.end.x, p.y - f.end.y) > .1)!;
            assert.ok(from === 'top' ? after.y > f.start.y : after.y < f.start.y);
            assert.ok(to === 'top' ? before.y > f.end.y : before.y < f.end.y);
            assert.equal(scene.diagnostics.obstacleCollisions, 0);
        }
});
for (const edge of ['top', 'bottom'] as const)
    test(`${edge} wrapping clears custom two-line labels without widening`, () => {
        const graph = fan(edge), model = resolveGraph(graph);
        const labels = new Map(graph.items.map(n => [`item:${n.key}`, [n.title, `${model.items.get(n.key)!.total} units total`]]));
        for (const width of [300, 353, 360, 600]) {
            const scene = layoutGraph(model, { width, labels });
            assert.equal(scene.width, width);
            assert.equal(scene.diagnostics.obstacleCollisions, 0);
            assert.equal(scene.diagnostics.crossings, 0);
            for (let i = 0; i < scene.transfers.length; i++)
                for (let j = i + 1; j < scene.transfers.length; j++)
                    assert.ok(separation(scene.transfers[i], scene.transfers[j]) > -.6);
        }
    });
test('100 items and 300 transfers produce finite geometry without input changes', () => {
    const stages = ['a', 'b', 'c', 'd'];
    const items = stages.flatMap((stage, s) => Array.from({ length: 25 }, (_, n) => ({ key: `${s}-${n}`, title: `Node ${s}-${n}`, placement: { stage } })));
    const transfers = stages.slice(0, -1).flatMap((_, s) => Array.from({ length: 25 }, (_, n) => Array.from({ length: 4 }, (_, offset) => ({ key: `${s}-${n}-${offset}`, from: `${s}-${n}`, to: `${s + 1}-${(n + offset) % 25}`, amount: 10 + offset }))).flat());
    const graph = { stages, items, transfers }, before = JSON.stringify(graph), scene = layoutGraph(resolveGraph(graph), { width: 1440 });
    assert.equal(scene.items.length, 100);
    assert.equal(scene.transfers.length, 300);
    assert.ok(scene.transfers.every(f => !(/NaN|Infinity/).test(f.route.path)));
    assert.equal(scene.diagnostics.obstacleCollisions, 0);
    assert.equal(JSON.stringify(graph), before);
});

for (const width of [1440, 1311, 960, 600, 360]) test(`original allocations at ${width}px clear neighboring labels`, () => {
    const graph = JSON.parse(readFileSync(new URL('../../demo/allocations.json', import.meta.url), 'utf8')) as FlowGraph;
    const model = resolveGraph(graph);
    const labels = new Map(graph.items.map(n => [`item:${n.key}`, [n.title, `${model.items.get(n.key)!.total.toLocaleString('en-US')} units total`]]));
    const scene = layoutGraph(model, { width, labels });
    assert.equal(scene.diagnostics.obstacleCollisions, 0);
    const items = new Map(scene.items.map(n => [n.key, n]));
    assert.equal(items.get('S-56789012')!.x, items.get('S-12345678')!.x);
    for (const key of ['BadDebt', 'WrittenOff']) {
        const node = items.get(key)!;
        const target = items.get(model.items.get(key)!.outgoingTransfers[0].to)!;
        assert.ok(node.x + node.w < target.x);
    }
});

for (const edge of ['top', 'bottom'] as const) test(`${edge} multi-row fan-out keeps every ribbon envelope separate`, () => {
    for (const unequal of [false, true]) for (const width of [353, 600, 960, 1151, 1440]) {
        const initial = fan(edge, 12);
        const graph: FlowGraph = { ...initial, transfers: initial.transfers.map((f, i) => ({ ...f, amount: unequal ? [40, 100, 180, 70][i % 4] : f.amount })) };
        const model = resolveGraph(graph);
        const labels = new Map(graph.items.map(n => [`item:${n.key}`, [n.title, `${model.items.get(n.key)!.total} units total`]]));
        const scene = layoutGraph(model, { width, labels });
        assert.equal(scene.width, width, `${width}px canvas must wrap without widening`);
        assert.equal(scene.diagnostics.obstacleCollisions, 0, `${width}px node and label clearance`);
        for (let i = 0; i < scene.transfers.length; i++) for (let j = i + 1; j < scene.transfers.length; j++) {
            const a = scene.transfers[i], b = scene.transfers[j];
            assert.equal(crossings(a.route, b.route), 0, `${width}px ${a.key}/${b.key}`);
            assert.ok(separation(a, b) > -.6, `${width}px ${unequal ? 'unequal' : 'equal'} widths: ${a.key}/${b.key} overlap = ${separation(a, b)}`);
        }
    }
});

test('side and bottom inputs into Outcome B stay separate across viewport widths', () => {
    const model = resolveGraph(full);
    const labels = new Map(full.items.map(n => [`item:${n.key}`, [n.title, `${model.items.get(n.key)!.total.toLocaleString('en-US')} units total`]]));
    for (const width of [600, 960, 1126, 1440]) {
        const scene = layoutGraph(model, { width, labels });
        const side = scene.transfers.find(f => f.key === 'process-b-outcome-b')!;
        const bottom = scene.transfers.find(f => f.key === 'carry-outcome-b')!;
        assert.ok(side.end.y < bottom.end.y, 'bottom input retains the lower destination port');
        assert.equal(crossings(side.route, bottom.route), 0, `${width}px double crossing`);
        assert.ok(separation(side, bottom) > -.6, `${width}px ribbons must not overlap`);
        assert.equal(scene.diagnostics.obstacleCollisions, 0);
    }
});

for (const edge of ['top', 'bottom'] as const) test(`${edge} and side inputs converge without crossing or overlapping`, () => {
    const main = { key: 'main', title: 'Main', total: 500, placement: { stage: 'input' } };
    const padding = { key: 'padding', title: 'Independent', total: 500, placement: { stage: 'input' } };
    for (const amount of [50, 250, 450]) for (const width of [600, 960, 1440]) {
        const graph: FlowGraph = {
            stages: ['input', 'output'],
            items: [
                ...(edge === 'top' ? [main, padding] : [padding, main]),
                { key: 'edge', title: 'Edge input', placement: { edge } },
                { key: 'target', title: 'Combined', placement: { stage: 'output' } },
            ],
            transfers: [
                { key: 'side', from: 'main', to: 'target', amount: 200 },
                { key: 'vertical', from: 'edge', to: 'target', amount },
            ],
        };
        const scene = layoutGraph(resolveGraph(graph), { width });
        const [side, vertical] = scene.transfers;
        assert.ok(edge === 'top' ? vertical.end.y < side.end.y : vertical.end.y > side.end.y);
        assert.equal(crossings(side.route, vertical.route), 0, `${width}px/${amount}`);
        assert.ok(separation(side, vertical) > -.6, `${width}px/${amount} overlap = ${separation(side, vertical)}`);
        assert.equal(scene.diagnostics.obstacleCollisions, 0);
        const reversed = layoutGraph(resolveGraph({ ...graph, transfers: [...graph.transfers].reverse() }), { width });
        for (const f of scene.transfers)
            assert.equal(f.route.path, reversed.transfers.find(other => other.key === f.key)!.route.path, 'input order must not control routing');
    }
});

for (const edge of ['top', 'bottom'] as const) test(`${edge} wrapped bundles keep a 4px gap through the turn`, () => {
    for (const unequal of [false, true]) for (const width of [600, 960, 1126, 1440]) {
        const initial = fan(edge, 12);
        const graph: FlowGraph = { ...initial, transfers: initial.transfers.map((f, i) => ({ ...f, amount: unequal ? [40, 100, 180, 70][i % 4] : 100 })) };
        const model = resolveGraph(graph);
        const labels = new Map(graph.items.map(n => [`item:${n.key}`, [n.title, `${model.items.get(n.key)!.total} units total`]]));
        const scene = layoutGraph(model, { width, labels });
        const nodes = scene.items.filter(n => n.edge && n.row > 0).sort((a, b) => a.corridor! - b.corridor!);
        const flows = nodes.map(n => scene.transfers.find(f => f.to === n.key)!);
        const lanes = flows.map((f, i) => {
            const segments = f.route.points.slice(1).map((end, j) => ({ start: f.route.points[j], end }));
            const vertical = segments.filter(s => Math.abs(s.start.x - nodes[i].corridor!) < 1e-5 && Math.abs(s.end.x - s.start.x) < 1e-5 && Math.abs(s.end.y - s.start.y) > 1);
            const horizontal = segments.filter(s => Math.abs(s.start.y - f.start.y) > 1 && Math.abs(s.end.y - s.start.y) < 1e-5 && Math.abs(s.end.x - s.start.x) > 1);
            assert.ok(vertical.length && horizontal.length, 'both legs of a wrapped route must remain visible');
            return { verticalEnd: vertical.at(-1)!.end, y: horizontal[0].start.y };
        });
        for (let i = 1; i < flows.length; i++) {
            const a = flows[i - 1], b = flows[i], halfWidths = (a.width + b.width) / 2;
            assert.ok(Math.abs(nodes[i].corridor! - nodes[i - 1].corridor! - halfWidths - 4) < .01, 'vertical gap');
            assert.ok(Math.abs(Math.abs(a.start.y - b.start.y) - halfWidths) < .01, 'ports touch to preserve the quantitative total');
            if (nodes[i].row !== nodes[i - 1].row) continue;
            assert.ok(Math.abs(Math.abs(lanes[i].y - lanes[i - 1].y) - halfWidths - 4) < .01, 'horizontal gap');
            const direction = edge === 'bottom' ? 1 : -1;
            const bend = a.route.points.filter(p => p.x >= nodes[i - 1].corridor! && direction * (p.y - lanes[i - 1].verticalEnd.y) > 1 && direction * (lanes[i - 1].y - p.y) > 1);
            assert.ok(bend.length > 8, 'sample the turn, not just its straight ends');
            for (const p of bend) {
                const gap = distanceToRoute(p, b.route) - halfWidths;
                assert.ok(Math.abs(gap - 4) < .25, `${width}px ${a.key}/${b.key}: turn gap ${gap}`);
            }
        }
    }
});
