import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveGraph } from '../src/model.js';
import { resolveUnits } from '../src/units.js';
import { validateGraph } from '../src/validate.js';
import { layoutGraph, hitTest } from '../src/layout.js';
import { intersects, pointAt, insidePolygon } from '../src/paths.js';
import {
  defaultLabel,
  presentation,
  subjectName,
} from '../src/presentation.js';
import {
  SankeyInputError,
  type SankeyGraph,
  type SankeyIssue,
  type SankeyAmountContext,
} from '../src/types.js';
import { error } from './helpers.js';

const graph: SankeyGraph = {
  defaultUnit: 'USD',
  conversionRates: [{ from: 'EUR', to: 'USD', rate: 1.1 }],
  stages: ['source', 'pool', 'target'],
  nodes: [
    { key: 'source', title: 'Source', placement: { stage: 'source' } },
    {
      key: 'pool',
      title: 'Pool',
      placement: { stage: 'pool' },
      totals: { EUR: 200, USD: 'auto' },
    },
    { key: 'target', title: 'Target', placement: { stage: 'target' } },
  ],
  links: [
    {
      key: 'eur-in',
      from: 'source',
      to: 'pool',
      amount: 100,
      inputUnit: 'EUR',
      outputUnit: 'EUR',
    },
    {
      key: 'usd-in',
      from: 'source',
      to: 'pool',
      amount: 50,
      inputUnit: 'USD',
      outputUnit: 'USD',
    },
    {
      key: 'eur-out',
      from: 'pool',
      to: 'target',
      amount: 150,
      inputUnit: 'EUR',
      outputUnit: 'EUR',
    },
    {
      key: 'usd-out',
      from: 'pool',
      to: 'target',
      amount: 20,
      inputUnit: 'USD',
      outputUnit: 'USD',
    },
  ],
};
const approx = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

const fx = (rate = 4000): SankeyGraph => ({
  defaultUnit: 'USD',
  conversionRates: [{ from: 'USD', to: 'COP', rate: 4000 }],
  stages: ['a', 'b'],
  nodes: [
    { key: 'a', title: 'Source', placement: { stage: 'a' } },
    { key: 'b', title: 'Destination', placement: { stage: 'b' } },
  ],
  links: [
    {
      key: 'fx',
      from: 'a',
      to: 'b',
      amount: 100,
      inputUnit: 'USD',
      outputUnit: 'COP',
      conversionRate: rate,
    },
  ],
});
const noLabels = (g: SankeyGraph) =>
  new Map([
    ...g.nodes.map((n) => [`node:${n.key}`, []] as [string, string[]]),
    ...g.links.map((l) => [`link:${l.key}`, []] as [string, string[]]),
  ]);
const declaredFx = (): SankeyGraph => {
  const g = fx(3900);
  return {
    ...g,
    nodes: [
      { ...g.nodes[0], totals: { USD: 250 } },
      { ...g.nodes[1], totals: { COP: 500000 } },
    ],
  };
};

test('a large FX ratio credits the output currency without multiplying ribbon width', () => {
  const g = fx(),
    model = resolveGraph(g),
    link = model.links.get('fx')!;
  assert.deepEqual(link.input, { amount: 100, unit: 'USD' });
  assert.deepEqual(link.output, { amount: 400000, unit: 'COP' });
  assert.deepEqual(
    model.nodes.get('a')!.totals.map((t) => [t.unit, t.outgoing]),
    [['USD', 100]],
  );
  assert.deepEqual(
    model.nodes.get('b')!.totals.map((t) => [t.unit, t.incoming]),
    [['COP', 400000]],
  );
  approx(link.layoutInputAmount, 100);
  approx(link.layoutOutputAmount, 100);
  const scene = layoutGraph(model, { width: 960, labels: noLabels(g) });
  assert.equal(scene.links[0].startWidth, scene.links[0].endWidth);
  assert.equal(
    scene.links[0].ribbon,
    undefined,
    'equivalent values retain constant-width rendering',
  );
});

test('the currency demo includes both equal-value FX and a lower-value payout', () => {
  const g = JSON.parse(
    readFileSync(
      new URL('../../demo/currencies.json', import.meta.url),
      'utf8',
    ),
  ) as SankeyGraph;
  const model = resolveGraph(g),
    payout = model.links.get('usd-cop-payout')!,
    operation = model.links.get('gbp-operations')!;
  assert.deepEqual(operation.output, { amount: 750000, unit: 'COP' });
  approx(operation.layoutInputAmount, operation.layoutOutputAmount);
  assert.deepEqual(payout.output, { amount: 390000, unit: 'COP' });
  approx(payout.layoutOutputAmount / payout.layoutInputAmount, 0.975);
  assert.deepEqual(
    model.nodes.get('cop-payout')!.totals.map((t) => [t.unit, t.total]),
    [['COP', 390000]],
  );
  for (const width of [360, 600, 960, 1440]) {
    const scene = layoutGraph(model, { width });
    assert.equal(scene.diagnostics.obstacleCollisions, 0);
    const link = scene.links.find((l) => l.key === 'usd-cop-payout')!;
    assert.ok(link.ribbon);
    approx(link.endWidth / link.startWidth, 0.975);
  }
});

test('transfer rates are local and do not conflict with the reference valuation', () => {
  const g = fx(3900);
  const input = {
    ...g,
    links: [...g.links, { ...g.links[0], key: 'other', conversionRate: 4000 }],
  };
  const model = resolveGraph(input);
  approx(model.links.get('fx')!.layoutOutputAmount, 97.5);
  approx(model.links.get('other')!.layoutOutputAmount, 100);
  approx(model.nodes.get('b')!.incoming, 197.5);
  assert.equal(model.nodes.get('b')!.totals[0].incoming, 790000);
  assert.equal(input.links[0].conversionRate, 3900);
});

test('changing default valuation currency preserves actual endpoint amounts and width ratios', () => {
  const g = fx(3900),
    cop = { ...g, defaultUnit: 'COP' };
  const usdModel = resolveGraph(g),
    copModel = resolveGraph(cop);
  assert.deepEqual(
    usdModel.links.get('fx')!.input,
    copModel.links.get('fx')!.input,
  );
  assert.deepEqual(
    usdModel.links.get('fx')!.output,
    copModel.links.get('fx')!.output,
  );
  approx(usdModel.nodes.get('b')!.converted!.total, 97.5);
  approx(copModel.nodes.get('b')!.converted!.total, 390000);
  const a = layoutGraph(usdModel, { width: 960, labels: noLabels(g) });
  const b = layoutGraph(copModel, { width: 960, labels: noLabels(g) });
  approx(a.links[0].startWidth, b.links[0].startWidth);
  approx(a.links[0].endWidth, b.links[0].endWidth);
});

test('directional labels, formatter contexts and tooltips distinguish actual and reference amounts', () => {
  const model = resolveGraph(fx(3900)),
    calls: SankeyAmountContext[] = [];
  const view = presentation(
    model,
    { kind: 'link', key: 'fx' },
    (amount, context) => {
      calls.push(context);
      return `${amount} ${context.unit}`;
    },
    'tooltip',
  );
  if (view.kind !== 'link') throw new Error('link expected');
  assert.deepEqual(defaultLabel(view), ['100 USD', '→ 390000 COP']);
  assert.equal(view.text.conversionRate, '1 USD → 3900 COP');
  assert.deepEqual(view.text.referenceRates, ['1 USD = 4000 COP']);
  assert.equal(view.text.convertedOutputAmount, '97.5 USD');
  assert.ok(
    calls.some(
      (c) => c.field === 'outputAmount' && c.unit === 'COP' && !c.isConverted,
    ),
  );
  assert.ok(
    calls.some(
      (c) => c.field === 'outputAmount' && c.unit === 'USD' && c.isConverted,
    ),
  );
  assert.ok(subjectName(view).includes('Input 100 USD. Output 390000 COP.'));
});

test('cross-unit links require both explicit units, a transfer rate and reference conversions', () => {
  const g = fx();
  for (const conversionRate of [
    undefined,
    0,
    -1,
    Infinity,
    NaN,
    Number.MIN_VALUE,
  ])
    error({ ...g, links: [{ ...g.links[0], conversionRate }] }, 'invalid-rate');
  error(
    { ...g, links: [{ ...g.links[0], outputUnit: undefined }] },
    'invalid-unit',
  );
  error(
    {
      ...g,
      links: [{ ...g.links[0], inputUnit: undefined, outputUnit: undefined }],
    },
    'invalid-unit',
  );
  error({ ...g, conversionRates: undefined }, 'missing-conversion');
  error(
    { ...g, links: [{ ...g.links[0], amount: Number.MAX_VALUE }] },
    'invalid-number',
  );
  error(
    {
      ...g,
      links: [
        {
          ...g.links[0],
          amount: Number.MIN_VALUE,
          conversionRate: 0.25,
        },
      ],
    },
    'invalid-number',
  );
});

test('declared destination balances are checked in the delivered currency', () => {
  const g = fx(3900);
  error(
    {
      ...g,
      nodes: [
        g.nodes[0],
        { ...g.nodes[1], totals: { COP: 389999, USD: 1000000 } },
      ],
    },
    'total-too-small',
  );
  const model = resolveGraph({
    ...g,
    nodes: [g.nodes[0], { ...g.nodes[1], totals: { COP: 500000 } }],
  });
  approx(model.nodes.get('b')!.total, 125);
  approx(model.nodes.get('b')!.incoming, 97.5);
});

test('tapered rendering and hit testing follow the local width rather than the widest end', () => {
  const g = fx(2000),
    scene = layoutGraph(resolveGraph(g), {
      width: 960,
      labels: noLabels(g),
    }),
    f = scene.links[0];
  approx(f.endWidth / f.startWidth, 0.5);
  assert.ok(f.ribbon);
  const center = pointAt(f.route, 0.8),
    inner = { x: center.x, y: center.y + f.endWidth * 0.3 },
    outer = { x: center.x, y: center.y + f.startWidth * 0.45 };
  assert.equal(insidePolygon(inner, f.ribbon.points), true);
  assert.deepEqual(hitTest(scene, inner), { kind: 'link', key: 'fx' });
  assert.equal(insidePolygon(outer, f.ribbon.points), false);
  assert.equal(hitTest(scene, outer), null);
});

for (const edge of ['top', 'bottom'] as const)
  for (const incoming of [false, true])
    test(`tapered ${edge} ${incoming ? 'inflow' : 'outflow'} preserves endpoint widths and inward faces`, () => {
      const g: SankeyGraph = {
        ...fx(3000),
        stages: ['main'],
        nodes: [
          {
            key: 'a',
            title: 'Source',
            placement: incoming ? { edge } : { stage: 'main' },
          },
          {
            key: 'b',
            title: 'Target',
            placement: incoming ? { stage: 'main' } : { edge },
          },
        ],
      };
      for (const width of [360, 960]) {
        const scene = layoutGraph(resolveGraph(g), {
            width,
            labels: noLabels(g),
          }),
          f = scene.links[0],
          n = scene.nodes.find((n) => n.edge)!;
        approx(f.endWidth / f.startWidth, 0.75);
        assert.equal(
          (incoming ? f.start : f.end).y,
          edge === 'top' ? n.y + n.h : n.y,
        );
        assert.equal(scene.diagnostics.obstacleCollisions, 0);
        for (const p of f.ribbon!.points)
          assert.ok(
            p.x >= -0.1 &&
              p.y >= -0.1 &&
              p.x <= scene.width + 0.1 &&
              p.y <= scene.height + 0.1,
          );
      }
    });

test('separate balances use per-unit max, declared/auto totals and one converted sum', () => {
  const model = resolveGraph(graph),
    pool = model.nodes.get('pool')!;
  assert.deepEqual(pool.totals, [
    {
      unit: 'EUR',
      total: 200,
      incoming: 100,
      outgoing: 150,
      totalSource: 'declared',
    },
    {
      unit: 'USD',
      total: 50,
      incoming: 50,
      outgoing: 20,
      totalSource: 'derived',
    },
  ]);
  approx(pool.total, 270);
  approx(pool.incoming, 160);
  approx(pool.outgoing, 185);
  assert.equal(pool.totalSource, 'mixed');
  assert.equal(pool.converted?.unit, 'USD');
  approx(model.links.get('eur-in')!.layoutInputAmount, 110);
  assert.equal(model.links.get('usd-in')!.input.unit, 'USD');
  assert.equal(pool.node, graph.nodes[1]);
  assert.equal(model.links.get('eur-in')!.link, graph.links[0]);
});

test('unitless shares use declared and derived endpoint totals', () => {
  const g: SankeyGraph = {
    stages: ['a', 'b'],
    nodes: [
      { key: 'a', title: 'A', total: 1000, placement: { stage: 'a' } },
      { key: 'b', title: 'B', placement: { stage: 'b' } },
    ],
    links: [{ key: 'ab', from: 'a', to: 'b', amount: 500 }],
  };
  assert.deepEqual(validateGraph(g), []);
  const link = resolveGraph(g).links.get('ab')!;
  assert.equal(link.fromTotal, 1000);
  assert.equal(link.toTotal, 500);
  approx(link.fromShare, 0.5);
  approx(link.toShare, 1);
});

test('unitless node totals report the node rather than blaming link units', () => {
  const namedLinks: SankeyGraph = {
    stages: ['a', 'b'],
    nodes: [
      { key: 'a', title: 'A', total: 1000, placement: { stage: 'a' } },
      { key: 'b', title: 'B', placement: { stage: 'b' } },
    ],
    links: [
      {
        key: 'ab',
        from: 'a',
        to: 'b',
        amount: 500,
        inputUnit: 'USD',
        outputUnit: 'USD',
      },
    ],
  };
  const issues = validateGraph(namedLinks);
  assert.deepEqual(
    issues.map(({ code, nodeKey }) => ({ code, nodeKey })),
    [{ code: 'invalid-unit', nodeKey: 'a' }],
  );
  assert.match(issues[0].message, /graph\.defaultUnit/);
  assert.match(issues[0].message, /totals/);
  assert.doesNotMatch(issues[0].message, /link explicit/);
  assert.throws(
    () => resolveGraph(namedLinks),
    (error: unknown) =>
      error instanceof SankeyInputError &&
      error.issues.some(
        (issue) => issue.code === 'invalid-unit' && issue.nodeKey === 'a',
      ) &&
      !error.issues.some(
        (issue) => issue.code === 'invalid-unit' && !issue.nodeKey,
      ),
  );

  const both: SankeyGraph = {
    ...namedLinks,
    links: [
      namedLinks.links[0],
      { key: 'loose', from: 'a', to: 'b', amount: 10 },
    ],
  };
  assert.deepEqual(
    validateGraph(both).map(({ code, nodeKey, linkKey }) => ({
      code,
      nodeKey,
      linkKey,
    })),
    [
      { code: 'invalid-unit', nodeKey: undefined, linkKey: undefined },
      { code: 'invalid-unit', nodeKey: 'a', linkKey: undefined },
    ],
  );
});

test('each scalar-total node receives its own unitless issue', () => {
  const g: SankeyGraph = {
    stages: ['source', 'target'],
    nodes: [
      {
        key: 'source-node',
        title: 'Source',
        total: 10,
        placement: { stage: 'source' },
      },
      {
        key: 'target-node',
        title: 'Target',
        total: 20,
        placement: { stage: 'target' },
      },
    ],
    links: [
      {
        key: 'flow',
        from: 'source-node',
        to: 'target-node',
        amount: 5,
        inputUnit: 'USD',
        outputUnit: 'USD',
      },
    ],
  };
  assert.deepEqual(
    validateGraph(g)
      .filter(({ code }) => code === 'invalid-unit')
      .map(({ nodeKey }) => nodeKey),
    ['source-node', 'target-node'],
  );
});

test('duplicate scalar-total keys produce one unitless issue', () => {
  const g: SankeyGraph = {
    stages: ['a'],
    nodes: [
      { key: 'dup', title: 'One', total: 10, placement: { stage: 'a' } },
      { key: 'dup', title: 'Two', total: 20, placement: { stage: 'a' } },
      {
        key: 'named',
        title: 'Named',
        totals: { USD: 5 },
        placement: { stage: 'a' },
      },
    ],
    links: [],
  };
  assert.deepEqual(
    validateGraph(g)
      .filter(({ code }) => code === 'invalid-unit')
      .map(({ nodeKey }) => nodeKey),
    ['dup'],
  );
});

test('a destination scalar total is attributed to the destination node', () => {
  const g: SankeyGraph = {
    stages: ['source', 'target'],
    nodes: [
      { key: 'source-node', title: 'Source', placement: { stage: 'source' } },
      {
        key: 'target-node',
        title: 'Target',
        total: 500,
        placement: { stage: 'target' },
      },
    ],
    links: [
      {
        key: 'flow',
        from: 'source-node',
        to: 'target-node',
        amount: 400,
        inputUnit: 'USD',
        outputUnit: 'USD',
      },
    ],
  };
  const issues = validateGraph(g).filter(({ code }) => code === 'invalid-unit');
  assert.deepEqual(
    issues.map(({ nodeKey }) => nodeKey),
    ['target-node'],
  );
  assert.match(issues[0].message, /target-node/);
});

test('a scalar total with totals keeps incompatible-totals without unitless guidance', () => {
  const g: SankeyGraph = {
    stages: ['source', 'target'],
    nodes: [
      {
        key: 'source-node',
        title: 'Source',
        total: 100,
        totals: { USD: 100 },
        placement: { stage: 'source' },
      },
      { key: 'target-node', title: 'Target', placement: { stage: 'target' } },
    ],
    links: [
      {
        key: 'flow',
        from: 'source-node',
        to: 'target-node',
        amount: 50,
        inputUnit: 'USD',
        outputUnit: 'USD',
      },
    ],
  };
  assert.deepEqual(
    validateGraph(g).map(({ code, nodeKey }) => ({ code, nodeKey })),
    [{ code: 'incompatible-totals', nodeKey: 'source-node' }],
  );
});

test('non-string node keys do not throw TypeError from unit resolution', () => {
  const keys: unknown[] = [Symbol('node'), Object.create(null)];
  for (const key of keys) {
    const g = {
      stages: ['a'],
      nodes: [
        {
          key,
          title: 'Malformed',
          total: 10,
          placement: { stage: 'a' },
        },
        {
          key: 'named',
          title: 'Named',
          totals: { USD: 5 },
          placement: { stage: 'a' },
        },
      ],
      links: [],
    } as unknown as SankeyGraph;
    const issues: SankeyIssue[] = [];
    assert.doesNotThrow(() => resolveUnits(g, issues));
    assert.ok(
      issues.some(
        (issue) => issue.code === 'invalid-unit' && issue.nodeKey === undefined,
      ),
    );
    assert.throws(
      () => resolveGraph(g),
      (error: unknown) =>
        error instanceof SankeyInputError &&
        error.issues.some(
          (issue) =>
            issue.code === 'invalid-unit' && issue.nodeKey === undefined,
        ),
    );
    assert.deepEqual(
      validateGraph(g).map((issue) => issue.code),
      ['invalid-graph'],
    );
  }
});

test('unitless link units keep the graph-level link guidance', () => {
  const g: SankeyGraph = {
    defaultUnit: 'USD',
    stages: ['a', 'b'],
    nodes: [
      { key: 'a', title: 'A', placement: { stage: 'a' } },
      { key: 'b', title: 'B', placement: { stage: 'b' } },
    ],
    links: [{ key: 'ab', from: 'a', to: 'b', amount: 5 }],
  };
  const issues = validateGraph(g);
  assert.deepEqual(
    issues.map(({ code, nodeKey, linkKey }) => ({ code, nodeKey, linkKey })),
    [{ code: 'invalid-unit', nodeKey: undefined, linkKey: undefined }],
  );
  assert.match(
    issues[0].message,
    /every link explicit inputUnit and outputUnit values/,
  );
});

test('shares use the link unit rather than the layout unit', () => {
  const model = resolveGraph(graph),
    link = model.links.get('eur-out')!,
    calls: SankeyAmountContext[] = [];
  assert.equal(model.layoutUnit, 'USD');
  assert.equal(model.nodes.get('pool')!.total, 270);
  assert.equal(link.fromTotal, 200);
  assert.equal(link.toTotal, 150);
  approx(link.fromShare, 0.75);
  approx(link.toShare, 1);
  const view = presentation(
    model,
    { kind: 'link', key: 'eur-out' },
    (amount, context) => {
      calls.push(context);
      return `${amount} ${context.unit}`;
    },
    'tooltip',
  );
  if (view.kind !== 'link') throw new Error('link expected');
  assert.equal(view.fromTotal, 200);
  assert.equal(view.toTotal, 150);
  approx(view.fromShare, 0.75);
  approx(view.toShare, 1);
  const call = calls[0];
  if (call?.kind !== 'link') throw new Error('link context expected');
  assert.equal(call.fromTotal, 200);
  assert.equal(call.toTotal, 150);
  approx(call.fromShare, 0.75);
  approx(call.toShare, 1);
});

test('cross-unit shares use native totals and the actual transfer rate', () => {
  const model = resolveGraph(declaredFx()),
    link = model.links.get('fx')!;
  assert.deepEqual(link.input, { amount: 100, unit: 'USD' });
  assert.deepEqual(link.output, { amount: 390000, unit: 'COP' });
  assert.equal(link.fromTotal, 250);
  assert.equal(link.toTotal, 500000);
  approx(link.fromShare, 0.4);
  approx(link.toShare, 0.78);
  const calls: SankeyAmountContext[] = [];
  const view = presentation(
    model,
    { kind: 'link', key: 'fx' },
    (amount, context) => {
      calls.push(context);
      return `${amount} ${context.unit}`;
    },
    'tooltip',
  );
  if (view.kind !== 'link') throw new Error('link expected');
  assert.equal(view.fromTotal, 250);
  assert.equal(view.toTotal, 500000);
  approx(view.fromShare, 0.4);
  approx(view.toShare, 0.78);
  const native = calls.filter((context) => !context.isConverted);
  assert.equal(native.length, 2);
  for (const context of native) {
    assert.equal(context.kind, 'link');
    if (context.kind !== 'link') throw new Error('link context expected');
    assert.equal(context.fromTotal, 250);
    assert.equal(context.toTotal, 500000);
    approx(context.fromShare, 0.4);
    approx(context.toShare, 0.78);
  }
});

test('converted formatter contexts retain native-only shares', () => {
  const model = resolveGraph(declaredFx()),
    calls: SankeyAmountContext[] = [];
  presentation(
    model,
    { kind: 'link', key: 'fx' },
    (amount, context) => {
      calls.push(context);
      return `${amount} ${context.unit}`;
    },
    'tooltip',
  );
  const converted = calls.filter((context) => context.isConverted);
  assert.equal(converted.length, 2);
  for (const context of converted) {
    assert.equal(context.kind, 'link');
    if (context.kind !== 'link') throw new Error('link context expected');
    assert.equal(context.unit, 'USD');
    assert.equal(context.fromTotal, 250);
    assert.equal(context.toTotal, 500000);
    approx(context.fromShare, 0.4);
    approx(context.toShare, 0.78);
  }
});

test('derived target totals produce destination shares', () => {
  const g: SankeyGraph = {
    stages: ['a', 'b'],
    nodes: [
      { key: 'a', title: 'A', total: 900, placement: { stage: 'a' } },
      { key: 'b', title: 'B', placement: { stage: 'b' } },
    ],
    links: [
      { key: 'first', from: 'a', to: 'b', amount: 300 },
      { key: 'second', from: 'a', to: 'b', amount: 200 },
    ],
  };
  const model = resolveGraph(g),
    target = model.nodes.get('b')!,
    first = model.links.get('first')!;
  assert.equal(target.total, 500);
  assert.equal(target.totalSource, 'derived');
  assert.equal(first.fromTotal, 900);
  assert.equal(first.toTotal, 500);
  approx(first.fromShare, 1 / 3);
  approx(first.toShare, 0.6);
  approx(model.links.get('second')!.toShare, 0.4);
});

test('a default unit values scalar totals but link units stay explicit', () => {
  const g: SankeyGraph = {
    defaultUnit: 'kg',
    stages: ['a', 'b'],
    nodes: [
      { key: 'a', title: 'A', total: 100, placement: { stage: 'a' } },
      { key: 'b', title: 'B', placement: { stage: 'b' } },
    ],
    links: [
      {
        key: 'ab',
        from: 'a',
        to: 'b',
        amount: 40,
        inputUnit: 'kg',
        outputUnit: 'kg',
      },
    ],
  };
  const model = resolveGraph(g),
    view = presentation(model, { kind: 'node', key: 'a' }, undefined, 'label');
  assert.deepEqual(defaultLabel(view), ['A', '100 kg']);
  assert.equal(model.nodes.get('a')!.totalSource, 'declared');
  assert.equal(model.nodes.get('b')!.total, 40);
  assert.equal(
    subjectName(view),
    'A. Total 100 kg. Incoming 0 kg. Outgoing 40 kg.',
  );
});

test('inverse and chained rates apply once, including to isolated declared balances', () => {
  const g: SankeyGraph = {
    defaultUnit: 'USD',
    conversionRates: [
      { from: 'USD', to: 'EUR', rate: 0.5 },
      { from: 'GBP', to: 'EUR', rate: 2 },
    ],
    stages: ['a'],
    nodes: [
      {
        key: 'a',
        title: 'Balances',
        placement: { stage: 'a' },
        totals: { GBP: 10, EUR: 20, USD: 30 },
      },
    ],
    links: [],
  };
  const n = resolveGraph(g).nodes.get('a')!;
  assert.equal(n.total, 110);
  assert.equal(n.totalSource, 'declared');
  assert.equal(n.totals.length, 3);
});

test('without a default, named balances still normalize widths but omit the combined display', () => {
  const g = { ...graph, defaultUnit: undefined };
  const model = resolveGraph(g),
    view = presentation(
      model,
      { kind: 'node', key: 'pool' },
      undefined,
      'label',
    );
  assert.equal(model.layoutUnit, 'EUR');
  assert.equal(view.kind === 'node' && view.converted, undefined);
  assert.deepEqual(defaultLabel(view), ['Pool', '200 EUR', '50 USD']);
  assert.ok(!subjectName(view).includes('Combined'));
  approx(model.links.get('usd-in')!.layoutInputAmount, 50 / 1.1);
});

test('conversion display preserves native amounts, explicit rates and formatter context', () => {
  const model = resolveGraph(graph),
    calls: SankeyAmountContext[] = [];
  const format = (value: number, context: SankeyAmountContext) => {
    calls.push(context);
    return `${value.toFixed(2)} ${context.unit}`;
  };
  const node = presentation(
    model,
    { kind: 'node', key: 'pool' },
    format,
    'tooltip',
  );
  assert.equal(node.kind, 'node');
  if (node.kind !== 'node') throw new Error('node expected');
  assert.deepEqual(
    node.text.totals.map((t) => t.total),
    ['200.00 EUR', '50.00 USD'],
  );
  assert.equal(node.text.converted?.total, '270.00 USD');
  assert.ok(
    calls.some(
      (c) =>
        c.unit === 'EUR' &&
        c.field === 'total' &&
        !c.isConverted &&
        c.surface === 'tooltip',
    ),
  );
  const link = presentation(
    model,
    { kind: 'link', key: 'eur-in' },
    format,
    'label',
  );
  assert.equal(link.kind, 'link');
  if (link.kind !== 'link') throw new Error('link expected');
  assert.equal(link.text.amount, '100.00 EUR');
  assert.equal(link.text.convertedAmount, '110.00 USD');
  assert.deepEqual(link.text.referenceRates, ['1 EUR = 1.1 USD']);
  assert.equal(defaultLabel(link), '100.00 EUR');
  assert.ok(subjectName(link).includes('Input 100.00 EUR. Output 100.00 EUR.'));
  assert.equal(
    model.links.get('eur-out')!.referenceRates[0],
    graph.conversionRates![0],
  );
});

test('omitted units derive automatically and zero declared balances remain visible', () => {
  const g = {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.key === 'pool' ? { ...n, totals: { EUR: 'auto' as const, GBP: 0 } } : n,
    ),
    conversionRates: [
      ...graph.conversionRates!,
      { from: 'GBP', to: 'USD', rate: 1.25 },
    ],
  };
  const pool = resolveGraph(g).nodes.get('pool')!;
  assert.deepEqual(
    pool.totals.map((t) => [t.unit, t.total]),
    [
      ['EUR', 150],
      ['GBP', 0],
      ['USD', 50],
    ],
  );
  approx(pool.total, 215);
});

test('reject invalid/missing units and missing conversion rather than adding unlike amounts', () => {
  error({ ...graph, defaultUnit: '' }, 'invalid-unit');
  error(
    { ...graph, links: [{ ...graph.links[0], inputUnit: undefined }] },
    'invalid-unit',
  );
  error({ ...graph, conversionRates: undefined }, 'missing-conversion');
  error(
    { ...graph, links: [{ ...graph.links[0], inputUnit: ' EUR' }] },
    'invalid-unit',
  );
  error(
    { ...graph, nodes: [{ ...graph.nodes[0], totals: { '': 4 } }] },
    'invalid-unit',
  );
});

test('reject undersized individual totals even when the converted combined total is large', () => {
  error(
    {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.key === 'pool' ? { ...n, totals: { EUR: 120, USD: 10000 } } : n,
      ),
    },
    'total-too-small',
  );
  error(
    {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.key === 'pool' ? { ...n, total: 1000 } : n,
      ),
    },
    'incompatible-totals',
  );
  for (const value of [-1, NaN, Infinity])
    error(
      {
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.key === 'pool' ? { ...n, totals: { EUR: value } } : n,
        ),
      },
      'invalid-number',
    );
});

test('rate validation catches inconsistent inverses, alternate paths, zero and nonfinite rates', () => {
  for (const rate of [0, -1, NaN, Infinity, Number.MIN_VALUE])
    error(
      { ...graph, conversionRates: [{ from: 'EUR', to: 'USD', rate }] },
      'invalid-rate',
    );
  error(
    {
      ...graph,
      conversionRates: [
        ...graph.conversionRates!,
        { from: 'USD', to: 'EUR', rate: 1 },
      ],
    },
    'conflicting-rate',
  );
  error(
    {
      ...graph,
      conversionRates: [
        ...graph.conversionRates!,
        { from: 'EUR', to: 'GBP', rate: 1 },
        { from: 'GBP', to: 'USD', rate: 2 },
      ],
    },
    'conflicting-rate',
  );
  error(
    { ...graph, conversionRates: [{ from: 'USD', to: 'USD', rate: 2 }] },
    'conflicting-rate',
  );
  assert.doesNotThrow(() =>
    resolveGraph({
      ...graph,
      conversionRates: [{ from: 'USD', to: 'EUR', rate: 1 / 1.1 }],
    }),
  );
});

test('conversion overflow and underflow cannot produce nonfinite or zero-width links', () => {
  for (const [amount, rate] of [
    [Number.MAX_VALUE, 2],
    [Number.MIN_VALUE, 0.25],
  ]) {
    error(
      {
        ...graph,
        conversionRates: [{ from: 'EUR', to: 'USD', rate }],
        links: [{ ...graph.links[0], amount }],
      },
      'invalid-number',
    );
  }
});

test('multi-line balance labels reserve row space without inflating quantitative bars', () => {
  const g: SankeyGraph = {
    stages: ['a'],
    nodes: [1, 1000, 2, 3].map((total, i) => ({
      key: `n${i}`,
      title: `Balance ${i}`,
      total,
      placement: { stage: 'a' },
    })),
    links: [],
  };
  const labels = new Map(
    g.nodes.map((n) => [
      `node:${n.key}`,
      [n.title, '10 EUR', '20 USD', '30 GBP', 'Σ 68.5 USD'],
    ]),
  );
  const scene = layoutGraph(resolveGraph(g), {
    width: 600,
    plotHeight: 200,
    labels,
  });
  for (const a of scene.nodes) {
    assert.equal(a.label.lines.length, 5);
    assert.ok(a.label.y >= 0 && a.label.y + a.label.h <= scene.height);
    for (const b of scene.nodes.filter((n) => n.key !== a.key))
      assert.equal(intersects(a.label, b.label), false);
  }
  approx(scene.nodes[1].h / scene.nodes[0].h, 1000);
});

test('a positive declared balance cannot underflow into a zero marker', () => {
  error(
    {
      defaultUnit: 'USD',
      conversionRates: [{ from: 'EUR', to: 'USD', rate: 0.25 }],
      stages: ['a'],
      nodes: [
        {
          key: 'a',
          title: 'A',
          placement: { stage: 'a' },
          totals: { EUR: Number.MIN_VALUE },
        },
      ],
      links: [],
    },
    'invalid-number',
  );
});

for (const edge of ['top', 'bottom'] as const)
  test(`wrapped ${edge} balance labels retain all lines and fit edge bands`, () => {
    const g: SankeyGraph = {
      stages: ['a'],
      nodes: [
        { key: 'a', title: 'A', placement: { stage: 'a' } },
        ...Array.from({ length: 5 }, (_, i) => ({
          key: `n${i}`,
          title: `Balance ${i}`,
          placement: { edge },
        })),
      ],
      links: Array.from({ length: 5 }, (_, i) => ({
        key: `l${i}`,
        from: 'a',
        to: `n${i}`,
        amount: 1,
      })),
    };
    const labels = new Map(
      g.nodes.map((n) => [
        `node:${n.key}`,
        [n.title, '10 EUR', '20 USD', '30 GBP', 'Σ 68.5 USD'],
      ]),
    );
    const scene = layoutGraph(resolveGraph(g), { width: 360, labels });
    assert.equal(scene.diagnostics.obstacleCollisions, 0);
    for (const n of scene.nodes) {
      assert.equal(n.label.lines.length, 5);
      assert.ok(n.label.y >= 0 && n.label.y + n.label.h <= scene.height);
    }
    for (const a of scene.nodes.filter((n) => n.edge))
      for (const b of scene.nodes.filter((n) => n.edge && n.key !== a.key))
        assert.equal(intersects(a.label, b.label), false);
  });

for (const edge of ['top', 'bottom'] as const)
  for (const reverse of [false, true])
    test(`converted ${edge} ${reverse ? 'inflows' : 'outflows'} match pre-normalized geometry`, () => {
      const g: SankeyGraph = {
        defaultUnit: 'USD',
        conversionRates: [{ from: 'EUR', to: 'USD', rate: 2 }],
        stages: ['a'],
        nodes: [
          { key: 'a', title: 'A', placement: { stage: 'a' } },
          ...['b', 'c', 'd'].map((key) => ({
            key,
            title: key,
            placement: { edge },
          })),
        ],
        links: ['b', 'c', 'd'].map((key, i) => ({
          key,
          from: reverse ? key : 'a',
          to: reverse ? 'a' : key,
          amount: (i + 1) * 10,
          inputUnit: i === 1 ? 'USD' : 'EUR',
          outputUnit: i === 1 ? 'USD' : 'EUR',
        })),
      };
      const copy = structuredClone(g);
      const freeze = (v: unknown) => {
        if (v && typeof v === 'object') {
          Object.freeze(v);
          Object.values(v).forEach(freeze);
        }
      };
      freeze(g);
      const normalized: SankeyGraph = {
        ...g,
        links: g.links.map((l) => ({
          ...l,
          amount: l.amount * (l.inputUnit === 'EUR' ? 2 : 1),
          inputUnit: 'USD',
          outputUnit: 'USD',
        })),
      };
      const labels = new Map([
        ...g.nodes.map((n) => [`node:${n.key}`, []] as [string, string[]]),
        ...g.links.map((l) => [`link:${l.key}`, []] as [string, string[]]),
      ]);
      for (const width of [360, 960]) {
        const actual = layoutGraph(resolveGraph(g), { width, labels }),
          expected = layoutGraph(resolveGraph(normalized), {
            width,
            labels,
          });
        assert.equal(actual.diagnostics.obstacleCollisions, 0);
        for (const link of actual.links) {
          const other = expected.links.find((l) => l.key === link.key)!;
          assert.equal(link.width, other.width);
          assert.equal(link.route.path, other.route.path);
        }
        assert.deepEqual(actual.nodes, expected.nodes);
      }
      assert.deepEqual(g, copy);
    });

test('default formatting preserves integer precision without exposing IEEE-754 float noise', () => {
  const g: SankeyGraph = {
    defaultUnit: 'USD',
    conversionRates: [{ from: 'EUR', to: 'USD', rate: 1.13 }],
    stages: ['a', 'b', 'c'],
    nodes: [
      { key: 'a', title: 'A', total: 1234567, placement: { stage: 'a' } },
      { key: 'b', title: 'B', placement: { stage: 'b' } },
      { key: 'c', title: 'C', placement: { stage: 'c' } },
    ],
    links: [
      {
        key: 'ab1',
        from: 'a',
        to: 'b',
        amount: 0.1,
        inputUnit: 'USD',
        outputUnit: 'USD',
      },
      {
        key: 'ab2',
        from: 'a',
        to: 'b',
        amount: 0.2,
        inputUnit: 'USD',
        outputUnit: 'USD',
      },
      {
        key: 'bc',
        from: 'b',
        to: 'c',
        amount: 100,
        inputUnit: 'EUR',
        outputUnit: 'EUR',
      },
    ],
  };
  const model = resolveGraph(g),
    fmt = new Intl.NumberFormat(undefined, {
      maximumSignificantDigits: 15,
    });
  const nodeA = presentation(
    model,
    { kind: 'node', key: 'a' },
    undefined,
    'tooltip',
  );
  const nodeB = presentation(
    model,
    { kind: 'node', key: 'b' },
    undefined,
    'tooltip',
  );
  const linkBC = presentation(
    model,
    { kind: 'link', key: 'bc' },
    undefined,
    'tooltip',
  );
  if (nodeA.kind !== 'node' || nodeB.kind !== 'node' || linkBC.kind !== 'link')
    throw new Error('unexpected presentation kind');
  const expectedInt = `${fmt.format(1234567)} USD`;
  assert.equal(nodeA.text.totals[0].total, expectedInt);
  assert.ok(subjectName(nodeA).includes(expectedInt));
  assert.deepEqual(
    defaultLabel(
      presentation(model, { kind: 'node', key: 'a' }, undefined, 'label'),
    ),
    ['A', expectedInt],
  );
  assert.equal(nodeB.text.totals[0].incoming, `${fmt.format(0.3)} USD`);
  assert.equal(linkBC.text.convertedAmount, `${fmt.format(113)} USD`);
});
