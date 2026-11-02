import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutGraph, layoutGraphSteps } from '../src/layout.js';
import { runInChunks } from '../src/layout-task.js';
import { resolveGraph } from '../src/model.js';
import { SankeyInputError, type SankeyGraph } from '../src/types.js';
import { stressGraph } from '../fixtures/stress.js';

test('chunked layout matches synchronous geometry for stress, wrapping and width retries', async () => {
  const full = JSON.parse(
    readFileSync(
      new URL('../../demo/feature-demo.json', import.meta.url),
      'utf8',
    ),
  ) as SankeyGraph;
  const original = JSON.parse(
    readFileSync(
      new URL(
        '../../tests/fixtures/original-allocations.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as SankeyGraph;
  const cases = [
    { graph: stressGraph(), width: 1440 },
    { graph: full, width: 960 },
    { graph: original, width: 360 },
  ];
  for (const { graph, width } of cases) {
    const before = JSON.stringify(graph),
      model = resolveGraph(graph);
    const labels = new Map(
      graph.nodes.map((n) => [
        `node:${n.key}`,
        [n.title, `${model.nodes.get(n.key)!.total} units total`],
      ]),
    );
    const options = { width, labels };
    const expected = layoutGraph(model, options);
    const actual = await runInChunks(
      layoutGraphSteps(model, options),
      new AbortController().signal,
      { budgetMs: 2 },
    );
    assert.deepEqual(actual, expected);
    assert.equal(JSON.stringify(graph), before);
  }
});

test('timer tasks run before and between chunks, not only after all work', async () => {
  let progress = 0,
    clock = 0;
  const observed: number[] = [];
  const timer = setInterval(() => observed.push(progress), 0);
  function* work() {
    for (; progress < 6; progress++) yield;
    return 'complete';
  }
  try {
    const result = await runInChunks(work(), new AbortController().signal, {
      budgetMs: 1,
      now: () => clock++,
    });
    assert.equal(result, 'complete');
    assert.equal(observed[0], 0, 'initial layout is deferred');
    assert.ok(
      observed.some((n) => n > 0 && n < 6),
      'other tasks run during layout',
    );
  } finally {
    clearInterval(timer);
  }
});

test('cancelling between chunks closes the iterator and prevents further work', async () => {
  const controller = new AbortController(),
    reason = new Error('superseded');
  let progress = 0,
    closed = false,
    clock = 0,
    pauses = 0;
  function* work() {
    try {
      while (progress < 100) {
        progress++;
        yield;
      }
      return progress;
    } finally {
      closed = true;
    }
  }
  await assert.rejects(
    runInChunks(work(), controller.signal, {
      budgetMs: 1,
      now: () => clock++,
      yieldToHost: () => {
        if (++pauses === 3) controller.abort(reason);
        return Promise.resolve();
      },
    }),
    (error) => error === reason,
  );
  assert.equal(progress, 2);
  assert.equal(closed, true);
});

test('an already-cancelled request never starts layout', async () => {
  const controller = new AbortController();
  controller.abort();
  let started = false;
  function* work() {
    started = true;
    yield;
    return 1;
  }
  await assert.rejects(runInChunks(work(), controller.signal), {
    name: 'AbortError',
  });
  assert.equal(started, false);
});

test('chunked layout propagates input and callback errors', async () => {
  const graph = stressGraph(),
    model = resolveGraph(graph);
  await assert.rejects(
    runInChunks(
      layoutGraphSteps(model, { width: NaN }),
      new AbortController().signal,
    ),
    SankeyInputError,
  );
  const failure = new Error('label measurement failed');
  await assert.rejects(
    runInChunks(
      layoutGraphSteps(model, {
        width: 900,
        measureText: () => {
          throw failure;
        },
      }),
      new AbortController().signal,
    ),
    (error) => error === failure,
  );
});

test('main-stage headroom starts below the larger port stack', () => {
  const graph: SankeyGraph = {
    stages: ['input', 'output'],
    nodes: [
      {
        key: 'available',
        title: 'Available',
        total: 1000,
        placement: { stage: 'input' },
      },
      {
        key: 'allocated',
        title: 'Allocated',
        total: 500,
        placement: { stage: 'output' },
      },
    ],
    links: [
      { key: 'allocation', from: 'available', to: 'allocated', amount: 500 },
    ],
  };
  const scene = layoutGraph(resolveGraph(graph), { width: 900 });
  const available = scene.nodes.find((n) => n.key === 'available')!,
    allocated = scene.nodes.find((n) => n.key === 'allocated')!,
    headroom = available.headroom!;
  assert.ok(headroom);
  assert.equal(headroom.x, available.x);
  assert.equal(headroom.w, available.w);
  assert.ok(Math.abs(headroom.h - 500 * scene.scale) < 1e-9);
  assert.ok(
    Math.abs(headroom.y - (available.y + available.h - headroom.h)) < 1e-9,
  );
  assert.equal(headroom.y + headroom.h, available.y + available.h);
  assert.equal(allocated.headroom, undefined);
});

test('edge headroom occupies the right end of the horizontal bar', () => {
  const graph: SankeyGraph = {
    stages: ['stage'],
    nodes: [
      {
        key: 'source',
        title: 'Source',
        total: 500,
        placement: { stage: 'stage' },
      },
      {
        key: 'reserve',
        title: 'Reserve',
        total: 1000,
        placement: { edge: 'bottom' },
      },
    ],
    links: [{ key: 'fill', from: 'source', to: 'reserve', amount: 500 }],
  };
  const scene = layoutGraph(resolveGraph(graph), { width: 900 });
  const node = scene.nodes.find((n) => n.key === 'reserve')!,
    headroom = node.headroom!;
  assert.ok(headroom);
  assert.equal(headroom.y, node.y);
  assert.equal(headroom.h, node.h);
  assert.ok(Math.abs(headroom.w - 500 * scene.scale) < 1e-9);
  assert.ok(Math.abs(headroom.x + headroom.w - (node.x + node.w)) < 1e-9);
});

test('fully allocated nodes omit headroom', () => {
  const graph: SankeyGraph = {
    stages: ['input', 'output'],
    nodes: [
      {
        key: 'source',
        title: 'Source',
        total: 500,
        placement: { stage: 'input' },
      },
      {
        key: 'target',
        title: 'Target',
        total: 500,
        placement: { stage: 'output' },
      },
    ],
    links: [{ key: 'flow', from: 'source', to: 'target', amount: 500 }],
  };
  const scene = layoutGraph(resolveGraph(graph), { width: 900 });
  assert.ok(scene.nodes.every((n) => n.headroom === undefined));
});

test('mixed-direction multi-unit relays are not hatched', () => {
  const graph: SankeyGraph = {
    defaultUnit: 'USD',
    conversionRates: [
      { from: 'EUR', to: 'USD', rate: 2 },
      { from: 'GBP', to: 'USD', rate: 3 },
    ],
    stages: ['source', 'relay', 'target'],
    nodes: [
      { key: 'source', title: 'Source', placement: { stage: 'source' } },
      {
        key: 'relay',
        title: 'Relay',
        placement: { stage: 'relay' },
        totals: { EUR: 120, GBP: 60 },
      },
      { key: 'target', title: 'Target', placement: { stage: 'target' } },
    ],
    links: [
      {
        key: 'in',
        from: 'source',
        to: 'relay',
        amount: 100,
        inputUnit: 'EUR',
        outputUnit: 'EUR',
      },
      {
        key: 'out',
        from: 'relay',
        to: 'target',
        amount: 50,
        inputUnit: 'GBP',
        outputUnit: 'GBP',
      },
    ],
  };
  const model = resolveGraph(graph),
    relay = model.nodes.get('relay')!;
  assert.equal(relay.totalSource, 'declared');
  assert.ok(relay.total > Math.max(relay.incoming, relay.outgoing));
  const scene = layoutGraph(model, { width: 900 });
  assert.equal(scene.nodes.find((n) => n.key === 'relay')!.headroom, undefined);
});

test('derived pure sources do not have headroom', () => {
  const graph: SankeyGraph = {
    stages: ['source', 'target'],
    nodes: [
      { key: 'source', title: 'Source', placement: { stage: 'source' } },
      { key: 'target', title: 'Target', placement: { stage: 'target' } },
    ],
    links: [{ key: 'flow', from: 'source', to: 'target', amount: 500 }],
  };
  const model = resolveGraph(graph),
    source = model.nodes.get('source')!;
  assert.equal(source.totalSource, 'derived');
  assert.equal(source.incoming, 0);
  assert.ok(source.outgoing > 0);
  const scene = layoutGraph(model, { width: 900 });
  assert.equal(
    scene.nodes.find((n) => n.key === 'source')!.headroom,
    undefined,
  );
});

test('declared pure sources use multi-unit totals for headroom', () => {
  const graph: SankeyGraph = {
    defaultUnit: 'USD',
    conversionRates: [{ from: 'EUR', to: 'USD', rate: 2 }],
    stages: ['source', 'target'],
    nodes: [
      {
        key: 'source',
        title: 'Source',
        totals: { EUR: 100, USD: 400 },
        placement: { stage: 'source' },
      },
      { key: 'target', title: 'Target', placement: { stage: 'target' } },
    ],
    links: [
      {
        key: 'flow',
        from: 'source',
        to: 'target',
        amount: 100,
        inputUnit: 'EUR',
        outputUnit: 'EUR',
      },
    ],
  };
  const model = resolveGraph(graph),
    source = model.nodes.get('source')!;
  assert.equal(source.totalSource, 'declared');
  assert.equal(source.total, 600);
  assert.equal(source.incoming, 0);
  assert.equal(source.outgoing, 200);
  const scene = layoutGraph(model, { width: 900 });
  const node = scene.nodes.find((n) => n.key === 'source')!,
    headroom = node.headroom!;
  assert.ok(headroom);
  assert.ok(Math.abs(headroom.h - 400 * scene.scale) < 1e-9);
  assert.equal(
    scene.nodes.find((n) => n.key === 'target')!.headroom,
    undefined,
  );
});

test('minLinkWidth floors never become headroom', () => {
  const graph: SankeyGraph = {
    stages: ['input', 'output'],
    nodes: [
      {
        key: 'source',
        title: 'Source',
        total: 1000,
        placement: { stage: 'input' },
      },
      {
        key: 'target',
        title: 'Target',
        total: 100,
        placement: { stage: 'output' },
      },
    ],
    links: [{ key: 'flow', from: 'source', to: 'target', amount: 50 }],
  };
  const scene = layoutGraph(resolveGraph(graph), {
    width: 900,
    minLinkWidth: 100,
  });
  const source = scene.nodes.find((n) => n.key === 'source')!,
    target = scene.nodes.find((n) => n.key === 'target')!,
    headroom = source.headroom!;
  assert.equal(source.h, 1000 * scene.scale);
  assert.ok(headroom);
  assert.ok(Math.abs(headroom.h - (source.h - 100)) < 1e-9);
  assert.ok(headroom.h < (1000 - 50) * scene.scale);
  assert.ok(target.h > 100 * scene.scale);
  assert.equal(target.headroom, undefined);
});
