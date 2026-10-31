import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveGraph, emphasis, nodeColor } from '../src/model.js';
import { layoutGraph, hitTest } from '../src/layout.js';
import { crossings, distanceToRoute, distanceToSegment, inflate, intersects, pointAt, ribbonBounds, routeCollisions } from '../src/paths.js';
import { SankeyInputError, type SankeyGraph, type SankeyIssueCode } from '../src/types.js';
import { stressGraph } from '../fixtures/stress.js';
const full = JSON.parse(readFileSync(new URL('../../demo/feature-demo.json', import.meta.url), 'utf8')) as SankeyGraph;
const base: SankeyGraph = { stages: ['a', 'b'], nodes: [{ key: 'a', title: 'Available', total: 1000, placement: { stage: 'a' } }, { key: 'b', title: 'Allocated', placement: { stage: 'b' } }], links: [{ key: 'ab', from: 'a', to: 'b', amount: 500 }] };
const error = (graph: SankeyGraph, code: SankeyIssueCode) => assert.throws(() => resolveGraph(graph), (e: unknown) => e instanceof SankeyInputError && e.issues.some(issue => issue.code === code));
function fan(edge: 'top' | 'bottom' = 'bottom', count = 3): SankeyGraph {
    return { stages: ['a'], nodes: [{ key: 'a', title: 'Process', placement: { stage: 'a' } }, ...Array.from({ length: count }, (_, i) => ({ key: `d${i}`, title: `Destination ${i + 1}`, placement: { edge } }))], links: Array.from({ length: count }, (_, i) => ({ key: `f${i}`, from: 'a', to: `d${i}`, amount: 100 })) };
}
function separation(a: ReturnType<typeof layoutGraph>['links'][number], b: ReturnType<typeof layoutGraph>['links'][number]) {
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
    assert.equal(model.nodes.get('a')!.total, 1000);
    assert.equal(model.nodes.get('b')!.total, 500);
    assert.equal(scene.nodes[0].h, scene.nodes[1].h * 2);
    assert.equal(scene.nodes[0].h, scene.links[0].width * 2);
    assert.equal(scene.topBand, 0);
    assert.equal(scene.bottomBand, 0);
});
test('mixed-role total uses max, with original inputs and metadata retained', () => {
    const model = resolveGraph(full);
    const n = model.nodes.get('reserve')!;
    assert.equal(n.total, 500);
    assert.equal(n.incoming, 100);
    assert.equal(n.outgoing, 300);
    assert.equal(n.node, full.nodes.find(n => n.key === 'reserve'));
    assert.equal(model.links.get('reserve-process')!.link, full.links[0]);
});
test('validation catches bad totals, identities, numbers, placement and backwards stages', () => {
    error({ ...base, nodes: [{ ...base.nodes[0], total: 400 }, base.nodes[1]] }, 'total-too-small');
    error({ ...base, nodes: [...base.nodes, base.nodes[0]] }, 'duplicate-key');
    error({ ...base, links: [{ ...base.links[0], to: 'missing' }] }, 'unknown-endpoint');
    error({ ...base, links: [{ ...base.links[0], amount: NaN }] }, 'invalid-number');
    error({ ...base, nodes: [{ ...base.nodes[0], placement: { stage: 'missing' } }, base.nodes[1]] }, 'unknown-stage');
    error({ ...base, links: [{ ...base.links[0], from: 'b', to: 'a' }] }, 'backward-stage-link');
});
test('cycles through edge nodes and incompatible relays fail before layout', () => {
    const graph: SankeyGraph = { stages: ['a', 'b'], nodes: [...base.nodes, { key: 'edge', title: 'Relay', placement: { edge: 'top' } }], links: [...base.links, { key: 'be', from: 'b', to: 'edge', amount: 100 }, { key: 'ea', from: 'edge', to: 'a', amount: 100 }] };
    error(graph, 'cycle');
    error(graph, 'incompatible-placement');
    error({ stages: [], nodes: [{ key: 'x', title: 'X', placement: { edge: 'top' } }], links: [{ key: 'self', from: 'x', to: 'x', amount: 1 }] }, 'cycle');
});
test('isolated zero nodes render finite markers and occupy only their assigned edge', () => {
    const graph: SankeyGraph = { stages: [], nodes: [{ key: 'zero', title: 'Zero', placement: { edge: 'bottom' } }], links: [] };
    const scene = layoutGraph(resolveGraph(graph), { width: 360 });
    assert.equal(scene.topBand, 0);
    assert.ok(scene.bottomBand > 0);
    assert.equal(scene.nodes[0].zero, true);
    assert.ok(scene.nodes[0].w > 0);
});
test('hover is exactly one hop, not the induced subgraph of strong nodes', () => {
    const model = resolveGraph(full), strong = emphasis(model, { kind: 'node', key: 'process-a' });
    assert.deepEqual([...strong.nodes].sort(), ['process-a', 'reserve', 'supply-a', 'supply-b', 'outcome-a', 'archive', 'loss'].sort());
    assert.equal(strong.links.size, 6);
    assert.equal(strong.links.has('supply-a-reserve'), false);
    const one = emphasis(model, { kind: 'link', key: 'supply-b-unassigned' });
    assert.equal(one.nodes.size, 2);
    assert.equal(one.links.size, 1);
});
test('isolated hover and clearing inspection have precise sets', () => {
    const graph = { ...base, nodes: [...base.nodes, { key: 'zero', title: 'Zero', placement: { stage: 'a' } }] };
    const model = resolveGraph(graph);
    assert.deepEqual([...emphasis(model, { kind: 'node', key: 'zero' }).nodes], ['zero']);
    assert.equal(emphasis(model, null).nodes.size, 3);
});
for (const width of [1440, 960, 600, 360])
    test(`full fixture at ${width}px preserves axes, valid intervals and containment`, () => {
        const scene = layoutGraph(resolveGraph(full), { width });
        assert.equal(scene.diagnostics.obstacleCollisions, 0, 'ribbons clear unrelated bars and labels');
        const nodes = new Map(scene.nodes.map(n => [n.key, n]));
        assert.equal(nodes.get('process-a')!.x, nodes.get('process-b')!.x);
        for (const n of scene.nodes) {
            assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= scene.width + .01 && n.y + n.h <= scene.height + .01, `bar ${n.key}`);
            assert.ok(n.label.x >= -.01 && n.label.x + n.label.w <= scene.width + .01, `label ${n.key}`);
            if (n.edge) {
                assert.ok(n.x >= n.lo - .01, n.key);
                assert.ok(n.x + n.w <= n.hi + .01, n.key);
            }
        }
        for (const f of scene.links) {
            assert.ok(!/NaN|Infinity/.test(f.route.path));
            assert.deepEqual([...new Set(f.route.path.match(/[A-Za-z]/g))].sort(), ['C', 'M'], 'one cubic rendering style, including obstacle detours');
            const a = nodes.get(f.from)!, b = nodes.get(f.to)!;
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
        const arrivals = scene.links.filter(f => f.to === 'unassigned');
        assert.ok(arrivals.find(f => f.from === 'supply-b')!.end.x < arrivals.find(f => f.from === 'supply-a')!.end.x);
    });
for (const edge of ['top', 'bottom'] as const)
    for (const width of [900, 300])
        test(`${edge} simple fan-out at ${width}px has no ribbon crossings or overlap`, () => {
            const scene = layoutGraph(resolveGraph(fan(edge)), { width });
            for (let i = 0; i < scene.links.length; i++)
                for (let j = i + 1; j < scene.links.length; j++) {
                    const a = scene.links[i], b = scene.links[j];
                    assert.equal(crossings(a.route, b.route), 0, `${a.key}/${b.key}`);
                    assert.ok(separation(a, b) > -.6, `${a.key}/${b.key} overlap = ${separation(a, b)}`);
                }
            for (const f of scene.links) {
                const other = scene.nodes.filter(n => n.key !== f.from && n.key !== f.to).flatMap(n => [n, n.label]);
                assert.equal(routeCollisions(f.route, other, f.width / 2), 0, `obstacle on ${f.key}`);
            }
        });
test('scrambling fan-out link inputs preserves each route identity and geometry', () => {
    const graph = fan(), a = layoutGraph(resolveGraph(graph), { width: 900 }), b = layoutGraph(resolveGraph({ ...graph, links: [...graph.links].reverse() }), { width: 900 });
    for (const f of a.links)
        assert.equal(f.route.path, b.links.find(t => t.key === f.key)!.route.path);
});
test('edge crowding wraps and widening removes rows without aggregate minimum width', () => {
    const graph = fan('bottom', 12), narrow = layoutGraph(resolveGraph(graph), { width: 360 }), wide = layoutGraph(resolveGraph(graph), { width: 1440 });
    assert.equal(narrow.width, 360);
    assert.ok(Math.max(...narrow.nodes.map(n => n.row)) > 0);
    assert.ok(narrow.bottomBand > wide.bottomBand);
    for (const a of narrow.nodes.filter(n => n.edge))
        for (const b of narrow.nodes.filter(n => n.edge && n.key !== a.key && n.row === a.row))
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
        const graph: SankeyGraph = { stages: ['a'], nodes: [{ key: 'a', title: 'A', placement: { stage: 'a' } }, { key: 'edge', title: 'Edge', placement: { edge } }], links: [{ key: 'flow', from: 'edge', to: 'a', amount: 100 }] };
        const f = layoutGraph(resolveGraph(graph), { width: 600 }).links[0];
        const next = f.route.points.find(p => Math.hypot(p.x - f.start.x, p.y - f.start.y) > .1)!;
        const control = f.route.path.split('C')[1].trim().split(/\s+/).map(Number);
        assert.ok(Math.abs(control[0] - f.start.x) < .001, 'the cubic leaves perpendicular to the edge bar');
        assert.ok(edge === 'top' ? control[1] > f.start.y : control[1] < f.start.y);
        assert.ok(edge === 'top' ? next.y > f.start.y : next.y < f.start.y);
    }
});
test('hit testing prefers bars and retains distinct parallel link identities', () => {
    const graph = { ...base, links: [{ ...base.links[0], amount: 200 }, { ...base.links[0], key: 'parallel', amount: 300 }] }, scene = layoutGraph(resolveGraph(graph), { width: 900 }), bar = scene.nodes[0];
    assert.deepEqual(hitTest(scene, { x: bar.x + bar.w / 2, y: bar.y + bar.h / 2 }), { kind: 'node', key: 'a' });
    for (const f of scene.links)
        assert.deepEqual(hitTest(scene, pointAt(f.route, .5)), { kind: 'link', key: f.key });
});

test('clicking a node label selects that node instead of a ribbon underneath', () => {
    const scene = layoutGraph(resolveGraph(base), { width: 900 });
    const label = scene.nodes.find(n => n.key === 'a')!.label;
    assert.deepEqual(hitTest(scene, { x: label.x + label.w / 2, y: label.y + label.h / 2 }), { kind: 'node', key: 'a' });
});

test('visible link labels are clickable beyond thin strokes; hidden labels are not', () => {
    const graph = { ...base, links: [{ ...base.links[0], amount: 1 }] };
    const scene = layoutGraph(resolveGraph(graph), { width: 900 });
    const link = scene.links[0], label = link.label;
    const point = { x: label.x + label.w / 2, y: label.y + .5 };
    assert.ok(distanceToRoute(point, link.route) > 5, 'point is outside the thin ribbon hit corridor');
    assert.deepEqual(hitTest(scene, point), { kind: 'link', key: link.key });
    link.labelHidden = true;
    assert.equal(hitTest(scene, point), null);
});
test('text is measured, clipped to two lines and remains inside the canvas', () => {
    const labels = new Map([['node:a', ['This is a particularly long title', 'Second line', 'Third line']], ['link:ab', []]]);
    const scene = layoutGraph(resolveGraph(base), { width: 360, labels, measureText: s => s.length * 9 });
    assert.equal(scene.nodes[0].label.lines.length, 2);
    assert.ok(scene.nodes[0].label.lines[0].endsWith('…'));
    assert.equal(scene.links[0].label.lines.length, 0);
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
    assert.equal(nodeColor('stable'), nodeColor('stable'));
});
test('an invalid plot height fails instead of producing broken SVG', () => {
    assert.throws(() => layoutGraph(resolveGraph(base), { width: 800, plotHeight: NaN }), SankeyInputError);
});
for (const edge of ['top', 'bottom'] as const)
    test(`${edge} simple fan-in preserves separate ribbons`, () => {
        const graph: SankeyGraph = { stages: ['a'], nodes: [{ key: 'a', title: 'A', placement: { stage: 'a' } }, { key: 'b', title: 'B', placement: { stage: 'a' } }, { key: 'sink', title: 'Sink', placement: { edge } }], links: [{ key: 'as', from: 'a', to: 'sink', amount: 700 }, { key: 'bs', from: 'b', to: 'sink', amount: 250 }] };
        for (const width of [360, 900]) {
            const scene = layoutGraph(resolveGraph(graph), { width }), [a, b] = scene.links;
            assert.equal(crossings(a.route, b.route), 0);
            assert.ok(separation(a, b) > -.6);
            assert.equal(scene.diagnostics.obstacleCollisions, 0);
        }
    });
test('edge-to-edge links have finite paths and inward endpoint faces', () => {
    for (const from of ['top', 'bottom'] as const)
        for (const to of ['top', 'bottom'] as const) {
            const graph: SankeyGraph = { stages: [], nodes: [{ key: 'a', title: 'A', placement: { edge: from } }, { key: 'b', title: 'B', placement: { edge: to } }], links: [{ key: 'ab', from: 'a', to: 'b', amount: 100 }] };
            const scene = layoutGraph(resolveGraph(graph), { width: 600 }), f = scene.links[0];
            assert.ok(!/NaN|Infinity/.test(f.route.path));
            assert.deepEqual([...new Set(f.route.path.match(/[A-Za-z]/g))].sort(), ['C', 'M'], 'one cubic rendering style, including obstacle detours');
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
        const labels = new Map(graph.nodes.map(n => [`node:${n.key}`, [n.title, `${model.nodes.get(n.key)!.total} units total`]]));
        for (const width of [300, 353, 360, 600]) {
            const scene = layoutGraph(model, { width, labels });
            assert.equal(scene.width, width);
            assert.equal(scene.diagnostics.obstacleCollisions, 0);
            assert.equal(scene.diagnostics.crossings, 0);
            for (let i = 0; i < scene.links.length; i++)
                for (let j = i + 1; j < scene.links.length; j++)
                    assert.ok(separation(scene.links[i], scene.links[j]) > -.6);
        }
    });
test('100 nodes and 300 links produce finite geometry without input changes', () => {
    const graph = stressGraph(), before = JSON.stringify(graph), scene = layoutGraph(resolveGraph(graph), { width: 1440 });
    assert.equal(scene.nodes.length, 100);
    assert.equal(scene.links.length, 300);
    assert.ok(scene.links.every(f => !(/NaN|Infinity/).test(f.route.path)));
    assert.equal(scene.diagnostics.obstacleCollisions, 0);
    assert.equal(JSON.stringify(graph), before);
});

for (const width of [1440, 1311, 960, 600, 360]) test(`original allocations at ${width}px clear neighboring labels`, () => {
    const graph = JSON.parse(readFileSync(new URL('../../tests/fixtures/original-allocations.json', import.meta.url), 'utf8')) as SankeyGraph;
    const model = resolveGraph(graph);
    const labels = new Map(graph.nodes.map(n => [`node:${n.key}`, [n.title, `${model.nodes.get(n.key)!.total.toLocaleString('en-US')} units total`]]));
    const scene = layoutGraph(model, { width, labels });
    assert.equal(scene.diagnostics.obstacleCollisions, 0);
    const nodes = new Map(scene.nodes.map(n => [n.key, n]));
    assert.equal(nodes.get('S-56789012')!.x, nodes.get('S-12345678')!.x);
    for (const key of ['BadDebt', 'WrittenOff']) {
        const node = nodes.get(key)!;
        const target = nodes.get(model.nodes.get(key)!.outgoingLinks[0].to)!;
        assert.ok(node.x + node.w < target.x);
    }
});

for (const edge of ['top', 'bottom'] as const) test(`${edge} multi-row fan-out keeps every ribbon envelope separate`, () => {
    for (const unequal of [false, true]) for (const width of [353, 600, 960, 1151, 1440]) {
        const initial = fan(edge, 12);
        const graph: SankeyGraph = { ...initial, links: initial.links.map((f, i) => ({ ...f, amount: unequal ? [40, 100, 180, 70][i % 4] : f.amount })) };
        const model = resolveGraph(graph);
        const labels = new Map(graph.nodes.map(n => [`node:${n.key}`, [n.title, `${model.nodes.get(n.key)!.total} units total`]]));
        const scene = layoutGraph(model, { width, labels });
        assert.equal(scene.width, width, `${width}px canvas must wrap without widening`);
        assert.equal(scene.diagnostics.obstacleCollisions, 0, `${width}px node and label clearance`);
        for (let i = 0; i < scene.links.length; i++) for (let j = i + 1; j < scene.links.length; j++) {
            const a = scene.links[i], b = scene.links[j];
            assert.equal(crossings(a.route, b.route), 0, `${width}px ${a.key}/${b.key}`);
            assert.ok(separation(a, b) > -.6, `${width}px ${unequal ? 'unequal' : 'equal'} widths: ${a.key}/${b.key} overlap = ${separation(a, b)}`);
        }
    }
});

for (const edge of ['top', 'bottom'] as const) test(`${edge} inputs retain their destination slots when their source wraps`, () => {
    const graph: SankeyGraph = edge === 'bottom' ? full : { ...full, nodes: full.nodes.map(n => ({ ...n, placement: n.placement.edge ? { edge: n.placement.edge === 'top' ? 'bottom' : 'top' } : n.placement })) };
    const model = resolveGraph(graph);
    const labels = new Map(graph.nodes.map(n => [`node:${n.key}`, [n.title, `${model.nodes.get(n.key)!.total.toLocaleString('en-US')} units total`]]));
    const wrapped = new Set<boolean>();
    for (const width of [1440, 1200, 1151, 1126, 960, 600]) {
        const scene = layoutGraph(model, { width, labels });
        const recoveryNode = scene.nodes.find(n => n.key === 'recovery')!;
        const carryNode = scene.nodes.find(n => n.key === 'carry-in')!;
        const destination = scene.nodes.find(n => n.key === 'outcome-c')!;
        const recovery = scene.links.find(f => f.key === 'recovery-outcome')!;
        const carry = scene.links.find(f => f.key === 'carry-outcome-c')!;
        wrapped.add(recoveryNode.row > 0);
        assert.ok(recoveryNode.x > carryNode.x, 'rightmost source stays rightmost');
        assert.equal(recovery.end.x, destination.x, 'connection stays on the incoming face');
        assert.ok(edge === 'bottom' ? recovery.end.y > carry.end.y : recovery.end.y < carry.end.y, `${width}px input order`);
        const boundary = edge === 'bottom' ? recovery.end.y + recovery.width / 2 : recovery.end.y - recovery.width / 2;
        assert.ok(Math.abs(boundary - (edge === 'bottom' ? destination.y + destination.h : destination.y)) < 1e-6, `${width}px input remains at the ${edge} of the bar`);
        assert.equal(scene.diagnostics.obstacleCollisions, 0, `${width}px bar and label clearance`);
    }
    assert.deepEqual(wrapped, new Set([false, true]), 'exercise both wrapped and unwrapped sources');
});

test('side and bottom inputs into Outcome B stay separate across viewport widths', () => {
    const model = resolveGraph(full);
    const labels = new Map(full.nodes.map(n => [`node:${n.key}`, [n.title, `${model.nodes.get(n.key)!.total.toLocaleString('en-US')} units total`]]));
    for (const width of [600, 960, 1126, 1440]) {
        const scene = layoutGraph(model, { width, labels });
        const side = scene.links.find(f => f.key === 'process-b-outcome-b')!;
        const bottom = scene.links.find(f => f.key === 'carry-outcome-b')!;
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
        const graph: SankeyGraph = {
            stages: ['input', 'output'],
            nodes: [
                ...(edge === 'top' ? [main, padding] : [padding, main]),
                { key: 'edge', title: 'Edge input', placement: { edge } },
                { key: 'target', title: 'Combined', placement: { stage: 'output' } },
            ],
            links: [
                { key: 'side', from: 'main', to: 'target', amount: 200 },
                { key: 'vertical', from: 'edge', to: 'target', amount },
            ],
        };
        const scene = layoutGraph(resolveGraph(graph), { width });
        const [side, vertical] = scene.links;
        assert.ok(edge === 'top' ? vertical.end.y < side.end.y : vertical.end.y > side.end.y);
        assert.equal(crossings(side.route, vertical.route), 0, `${width}px/${amount}`);
        assert.ok(separation(side, vertical) > -.6, `${width}px/${amount} overlap = ${separation(side, vertical)}`);
        assert.equal(scene.diagnostics.obstacleCollisions, 0);
        const reversed = layoutGraph(resolveGraph({ ...graph, links: [...graph.links].reverse() }), { width });
        for (const f of scene.links)
            assert.equal(f.route.path, reversed.links.find(other => other.key === f.key)!.route.path, 'input order must not control routing');
    }
});

for (const edge of ['top', 'bottom'] as const) test(`${edge} wrapped waves retain corridor gaps, touching ports and smooth joins`, () => {
    for (const unequal of [false, true]) for (const width of [600, 960, 1126, 1440]) {
        const initial = fan(edge, 12);
        const graph: SankeyGraph = { ...initial, links: initial.links.map((f, i) => ({ ...f, amount: unequal ? [40, 100, 180, 70][i % 4] : 100 })) };
        const model = resolveGraph(graph);
        const labels = new Map(graph.nodes.map(n => [`node:${n.key}`, [n.title, `${model.nodes.get(n.key)!.total} units total`]]));
        const scene = layoutGraph(model, { width, labels });
        const nodes = scene.nodes.filter(n => n.edge && n.row > 0).sort((a, b) => a.corridor! - b.corridor!);
        const flows = nodes.map(n => scene.links.find(f => f.to === n.key)!);
        for (const f of flows) {
            assert.deepEqual([...new Set(f.route.path.match(/[A-Za-z]/g))].sort(), ['C', 'M']);
            const curves = f.route.path.split(' C').slice(1).map(part => part.trim().split(/\s+/).map(Number));
            for (let i = 1; i < curves.length; i++) {
                const a = curves[i - 1], b = curves[i];
                const incoming = { x: a[4] - a[2], y: a[5] - a[3] }, outgoing = { x: b[0] - a[4], y: b[1] - a[5] };
                const lengths = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
                if (lengths < .001) continue;
                assert.ok(Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) / lengths < .02, 'cubic joins have matching tangent directions');
                assert.ok(incoming.x * outgoing.x + incoming.y * outgoing.y > 0, 'no cusp at a join');
            }
            const envelope = ribbonBounds(f.route, f.width);
            assert.ok(envelope.x >= -.15 && envelope.y >= -.15 && envelope.x + envelope.w <= scene.width + .15 && envelope.y + envelope.h <= scene.height + .15);
        }
        for (let i = 1; i < flows.length; i++) {
            const a = flows[i - 1], b = flows[i], halfWidths = (a.width + b.width) / 2;
            assert.ok(Math.abs(nodes[i].corridor! - nodes[i - 1].corridor! - halfWidths - 4) < .01, 'reserved corridor gap');
            assert.ok(Math.abs(Math.abs(a.start.y - b.start.y) - halfWidths) < .01, 'ports touch to preserve the quantitative total');
            assert.ok(separation(a, b) > -.6, 'broad waves preserve ribbon separation');
        }
    }
});
