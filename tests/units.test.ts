import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGraph } from '../src/model.js';
import { layoutGraph } from '../src/layout.js';
import { intersects } from '../src/paths.js';
import { defaultLabel, presentation, subjectName } from '../src/presentation.js';
import { SankeyInputError, type SankeyGraph, type SankeyIssueCode, type SankeyAmountContext } from '../src/types.js';

const graph: SankeyGraph = {
    defaultUnit: 'USD', stages: ['source', 'pool', 'target'],
    nodes: [
        { key: 'source', title: 'Source', placement: { stage: 'source' } },
        { key: 'pool', title: 'Pool', placement: { stage: 'pool' }, totals: { EUR: 200, USD: 'auto' } },
        { key: 'target', title: 'Target', placement: { stage: 'target' } },
    ],
    links: [
        { key: 'eur-in', from: 'source', to: 'pool', amount: 100, unit: 'EUR', conversionRates: [{ from: 'EUR', to: 'USD', rate: 1.1 }] },
        { key: 'usd-in', from: 'source', to: 'pool', amount: 50 },
        { key: 'eur-out', from: 'pool', to: 'target', amount: 150, unit: 'EUR' },
        { key: 'usd-out', from: 'pool', to: 'target', amount: 20 },
    ],
};
const approx = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);
const error = (g: SankeyGraph, code: SankeyIssueCode) => assert.throws(() => resolveGraph(g), (e: unknown) => e instanceof SankeyInputError && e.issues.some(i => i.code === code));

test('separate balances use per-unit max, declared/auto totals and one converted sum', () => {
    const model = resolveGraph(graph), pool = model.nodes.get('pool')!;
    assert.deepEqual(pool.totals, [
        { unit: 'EUR', total: 200, incoming: 100, outgoing: 150, totalSource: 'declared' },
        { unit: 'USD', total: 50, incoming: 50, outgoing: 20, totalSource: 'derived' },
    ]);
    approx(pool.total, 270); approx(pool.incoming, 160); approx(pool.outgoing, 185);
    assert.equal(pool.totalSource, 'mixed');
    assert.equal(pool.converted?.unit, 'USD');
    approx(model.links.get('eur-in')!.layoutAmount, 110);
    assert.equal(model.links.get('usd-in')!.unit, 'USD');
    assert.equal(pool.node, graph.nodes[1]);
    assert.equal(model.links.get('eur-in')!.link, graph.links[0]);
});

test('a default unit applies to legacy scalar totals and unlabelled links', () => {
    const g: SankeyGraph = { defaultUnit: 'kg', stages: ['a', 'b'], nodes: [{ key: 'a', title: 'A', total: 100, placement: { stage: 'a' } }, { key: 'b', title: 'B', placement: { stage: 'b' } }], links: [{ key: 'ab', from: 'a', to: 'b', amount: 40 }] };
    const model = resolveGraph(g), view = presentation(model, { kind: 'node', key: 'a' }, undefined, 'label');
    assert.deepEqual(defaultLabel(view), ['A', '100 kg']);
    assert.equal(model.nodes.get('a')!.totalSource, 'declared');
    assert.equal(model.nodes.get('b')!.total, 40);
    assert.equal(subjectName(view), 'A. Total 100 kg. Incoming 0 kg. Outgoing 40 kg.');
});

test('inverse and chained rates apply once, including to isolated declared balances', () => {
    const g: SankeyGraph = { defaultUnit: 'USD', conversionRates: [{ from: 'USD', to: 'EUR', rate: .5 }, { from: 'GBP', to: 'EUR', rate: 2 }], stages: ['a'], nodes: [{ key: 'a', title: 'Balances', placement: { stage: 'a' }, totals: { GBP: 10, EUR: 20, USD: 30 } }], links: [] };
    const n = resolveGraph(g).nodes.get('a')!;
    assert.equal(n.total, 110);
    assert.equal(n.totalSource, 'declared');
    assert.equal(n.totals.length, 3);
});

test('without a default, named balances still normalize widths but omit the combined display', () => {
    const g = { ...graph, defaultUnit: undefined, links: graph.links.map(l => ({ ...l, unit: l.unit ?? 'USD' })) };
    const model = resolveGraph(g), view = presentation(model, { kind: 'node', key: 'pool' }, undefined, 'label');
    assert.equal(model.layoutUnit, 'EUR');
    assert.equal(view.kind === 'node' && view.converted, undefined);
    assert.deepEqual(defaultLabel(view), ['Pool', '200 EUR', '50 USD']);
    assert.ok(!subjectName(view).includes('Combined'));
    approx(model.links.get('usd-in')!.layoutAmount, 50 / 1.1);
});

test('conversion display preserves native amounts, explicit rates and formatter context', () => {
    const model = resolveGraph(graph), calls: SankeyAmountContext[] = [];
    const format = (value: number, context: SankeyAmountContext) => { calls.push(context); return `${value.toFixed(2)} ${context.unit}`; };
    const node = presentation(model, { kind: 'node', key: 'pool' }, format, 'tooltip');
    assert.equal(node.kind, 'node');
    if (node.kind !== 'node') throw new Error('node expected');
    assert.deepEqual(node.text.totals.map(t => t.total), ['200.00 EUR', '50.00 USD']);
    assert.equal(node.text.converted?.total, '270.00 USD');
    assert.ok(calls.some(c => c.unit === 'EUR' && c.field === 'total' && !c.isConverted && c.surface === 'tooltip'));
    const link = presentation(model, { kind: 'link', key: 'eur-in' }, format, 'label');
    assert.equal(link.kind, 'link');
    if (link.kind !== 'link') throw new Error('link expected');
    assert.equal(link.text.amount, '100.00 EUR');
    assert.equal(link.text.convertedAmount, '110.00 USD');
    assert.deepEqual(link.text.conversionRates, ['1 EUR = 1.1 USD']);
    assert.deepEqual(defaultLabel(link), ['100.00 EUR', '= 110.00 USD']);
    assert.ok(subjectName(link).includes('Conversion rates: 1 EUR = 1.1 USD'));
    assert.equal(model.links.get('eur-out')!.conversionRates[0], graph.links[0].conversionRates![0]);
});

test('omitted units derive automatically and zero declared balances remain visible', () => {
    const g = { ...graph, nodes: graph.nodes.map(n => n.key === 'pool' ? { ...n, totals: { EUR: 'auto' as const, GBP: 0 } } : n), conversionRates: [{ from: 'GBP', to: 'USD', rate: 1.25 }] };
    const pool = resolveGraph(g).nodes.get('pool')!;
    assert.deepEqual(pool.totals.map(t => [t.unit, t.total]), [['EUR', 150], ['GBP', 0], ['USD', 50]]);
    approx(pool.total, 215);
});

test('reject invalid/missing units and missing conversion rather than adding unlike amounts', () => {
    error({ ...graph, defaultUnit: '' }, 'invalid-unit');
    error({ ...graph, defaultUnit: undefined }, 'invalid-unit');
    error({ ...graph, links: graph.links.map(l => ({ ...l, conversionRates: undefined })) }, 'missing-conversion');
    error({ ...graph, links: [{ ...graph.links[0], unit: ' EUR' }] }, 'invalid-unit');
    error({ ...graph, nodes: [{ ...graph.nodes[0], totals: { '': 4 } }] }, 'invalid-unit');
});

test('reject undersized individual totals even when the converted combined total is large', () => {
    error({ ...graph, nodes: graph.nodes.map(n => n.key === 'pool' ? { ...n, totals: { EUR: 120, USD: 10000 } } : n) }, 'total-too-small');
    error({ ...graph, nodes: graph.nodes.map(n => n.key === 'pool' ? { ...n, total: 1000 } : n) }, 'incompatible-totals');
    for (const value of [-1, NaN, Infinity]) error({ ...graph, nodes: graph.nodes.map(n => n.key === 'pool' ? { ...n, totals: { EUR: value } } : n) }, 'invalid-number');
});

test('rate validation catches inconsistent inverses, alternate paths, zero and nonfinite rates', () => {
    for (const rate of [0, -1, NaN, Infinity, Number.MIN_VALUE]) error({ ...graph, conversionRates: [{ from: 'EUR', to: 'USD', rate }] }, 'invalid-rate');
    error({ ...graph, conversionRates: [{ from: 'USD', to: 'EUR', rate: 1 }] }, 'conflicting-rate');
    error({ ...graph, conversionRates: [{ from: 'EUR', to: 'GBP', rate: 1 }, { from: 'GBP', to: 'USD', rate: 2 }] }, 'conflicting-rate');
    error({ ...graph, conversionRates: [{ from: 'USD', to: 'USD', rate: 2 }] }, 'conflicting-rate');
    assert.doesNotThrow(() => resolveGraph({ ...graph, conversionRates: [{ from: 'USD', to: 'EUR', rate: 1 / 1.1 }] }));
});

test('conversion overflow and underflow cannot produce nonfinite or zero-width links', () => {
    for (const [amount, rate] of [[Number.MAX_VALUE, 2], [Number.MIN_VALUE, .25]]) {
        error({ ...graph, links: [{ ...graph.links[0], amount, conversionRates: [{ from: 'EUR', to: 'USD', rate }] }] }, 'invalid-number');
    }
});

test('multi-line balance labels reserve row space without inflating quantitative bars', () => {
    const g: SankeyGraph = { stages: ['a'], nodes: [1, 1000, 2, 3].map((total, i) => ({ key: `n${i}`, title: `Balance ${i}`, total, placement: { stage: 'a' } })), links: [] };
    const labels = new Map(g.nodes.map(n => [`node:${n.key}`, [n.title, '10 EUR', '20 USD', '30 GBP', 'Σ 68.5 USD']]));
    const scene = layoutGraph(resolveGraph(g), { width: 600, plotHeight: 200, labels });
    for (const a of scene.nodes) {
        assert.equal(a.label.lines.length, 5);
        assert.ok(a.label.y >= 0 && a.label.y + a.label.h <= scene.height);
        for (const b of scene.nodes.filter(n => n.key !== a.key)) assert.equal(intersects(a.label, b.label), false);
    }
    approx(scene.nodes[1].h / scene.nodes[0].h, 1000);
});

for (const edge of ['top', 'bottom'] as const)
    test(`wrapped ${edge} balance labels retain all lines and fit edge bands`, () => {
        const g: SankeyGraph = { stages: ['a'], nodes: [{ key: 'a', title: 'A', placement: { stage: 'a' } }, ...Array.from({ length: 5 }, (_, i) => ({ key: `n${i}`, title: `Balance ${i}`, placement: { edge } }))], links: Array.from({ length: 5 }, (_, i) => ({ key: `l${i}`, from: 'a', to: `n${i}`, amount: 1 })) };
        const labels = new Map(g.nodes.map(n => [`node:${n.key}`, [n.title, '10 EUR', '20 USD', '30 GBP', 'Σ 68.5 USD']]));
        const scene = layoutGraph(resolveGraph(g), { width: 360, labels });
        assert.equal(scene.diagnostics.obstacleCollisions, 0);
        for (const n of scene.nodes) { assert.equal(n.label.lines.length, 5); assert.ok(n.label.y >= 0 && n.label.y + n.label.h <= scene.height); }
        for (const a of scene.nodes.filter(n => n.edge)) for (const b of scene.nodes.filter(n => n.edge && n.key !== a.key)) assert.equal(intersects(a.label, b.label), false);
    });

for (const edge of ['top', 'bottom'] as const) for (const reverse of [false, true])
    test(`converted ${edge} ${reverse ? 'inflows' : 'outflows'} match pre-normalized geometry`, () => {
        const g: SankeyGraph = {
            defaultUnit: 'USD', conversionRates: [{ from: 'EUR', to: 'USD', rate: 2 }], stages: ['a'],
            nodes: [{ key: 'a', title: 'A', placement: { stage: 'a' } }, ...['b', 'c', 'd'].map(key => ({ key, title: key, placement: { edge } }))],
            links: ['b', 'c', 'd'].map((key, i) => ({ key, from: reverse ? key : 'a', to: reverse ? 'a' : key, amount: (i + 1) * 10, unit: i === 1 ? 'USD' : 'EUR' })),
        };
        const copy = structuredClone(g);
        const freeze = (v: unknown) => { if (v && typeof v === 'object') { Object.freeze(v); Object.values(v).forEach(freeze); } }; freeze(g);
        const normalized: SankeyGraph = { ...g, links: g.links.map(l => ({ ...l, amount: l.amount * (l.unit === 'EUR' ? 2 : 1), unit: 'USD' })) };
        const labels = new Map([...g.nodes.map(n => [`node:${n.key}`, []] as [string, string[]]), ...g.links.map(l => [`link:${l.key}`, []] as [string, string[]])]);
        for (const width of [360, 960]) {
            const actual = layoutGraph(resolveGraph(g), { width, labels }), expected = layoutGraph(resolveGraph(normalized), { width, labels });
            assert.equal(actual.diagnostics.obstacleCollisions, 0);
            for (const link of actual.links) { const other = expected.links.find(l => l.key === link.key)!; assert.equal(link.width, other.width); assert.equal(link.route.path, other.route.path); }
            assert.deepEqual(actual.nodes, expected.nodes);
        }
        assert.deepEqual(g, copy);
    });
