import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveGraph } from '../src/model.js';
import {
  layoutGraph,
  layoutGraphSteps,
  hitTest,
  type Scene,
} from '../src/layout.js';
import { runInChunks } from '../src/layout-task.js';
import { pointAt, distanceToSegment } from '../src/paths.js';
import { SankeyInputError, type SankeyGraph } from '../src/types.js';

const fixture = (name: string): SankeyGraph =>
  JSON.parse(
    readFileSync(new URL(`../../demo/${name}.json`, import.meta.url), 'utf8'),
  ) as SankeyGraph;
function portsFit(scene: Scene) {
  for (const node of scene.nodes) {
    assert.ok(
      node.x >= -0.01 &&
        node.y >= -0.01 &&
        node.x + node.w <= scene.width + 0.01 &&
        node.y + node.h <= scene.height + 0.01,
      `contained ${node.key}`,
    );
    for (const out of [true, false]) {
      const ports = scene.links
        .filter((f) => (out ? f.from : f.to) === node.key)
        .map((f) => {
          const p = out ? f.start : f.end,
            width = out ? f.startWidth : f.endWidth;
          assert.ok(width >= 4, `minimum ${f.key}`);
          assert.equal(
            node.edge ? p.y : p.x,
            node.edge
              ? node.y + (node.edge === 'top' ? node.h : 0)
              : node.x + (out ? node.w : 0),
          );
          return {
            lo: (node.edge ? p.x : p.y) - width / 2,
            hi: (node.edge ? p.x : p.y) + width / 2,
          };
        })
        .sort((a, b) => a.lo - b.lo);
      for (let i = 0; i < ports.length; i++) {
        assert.ok(ports[i].lo >= (node.edge ? node.x : node.y) - 0.01);
        assert.ok(
          ports[i].hi <= (node.edge ? node.x + node.w : node.y + node.h) + 0.01,
        );
        if (i)
          assert.ok(
            ports[i].lo >= ports[i - 1].hi - 0.01,
            `separate ports ${node.key}`,
          );
      }
    }
  }
}

test('zero minimum preserves proportional geometry exactly; invalid minima fail', () => {
  for (const name of ['wide-range', 'currencies', 'feature-demo']) {
    const model = resolveGraph(fixture(name));
    assert.deepEqual(
      layoutGraph(model, { width: 960, minLinkWidth: 0 }),
      layoutGraph(model, { width: 960 }),
    );
  }
  for (const minLinkWidth of [-1, NaN, Infinity])
    assert.throws(
      () =>
        layoutGraph(resolveGraph(fixture('wide-range')), {
          width: 960,
          minLinkWidth,
        }),
      SankeyInputError,
    );
});

test('wide range keeps values intact while reserving minimum-sized ports and bars', async () => {
  const graph = fixture('wide-range'),
    before = JSON.stringify(graph),
    model = resolveGraph(graph);
  const labels = new Map(
    graph.nodes.map((n) => [
      `node:${n.key}`,
      [n.title, `${model.nodes.get(n.key)!.total} units total`],
    ]),
  );
  for (const width of [360, 600, 960, 1440]) {
    const options = { width, plotHeight: 440, minLinkWidth: 4, labels };
    const scene = layoutGraph(model, options);
    portsFit(scene);
    assert.equal(scene.diagnostics.obstacleCollisions, 0);
    assert.equal(scene.diagnostics.crossings, 0);
    assert.equal(scene.links.find((f) => f.key === 'trial-in')!.width, 4);
    assert.equal(
      scene.links.find((f) => f.key === 'bulk-in')!.width,
      500000 * scene.scale,
    );
    const retained = scene.links.find((f) => f.key === 'retained-out')!;
    assert.deepEqual(hitTest(scene, pointAt(retained.route, 0.7)), {
      kind: 'link',
      key: retained.key,
    });
    if (width === 960)
      assert.deepEqual(
        await runInChunks(
          layoutGraphSteps(model, options),
          new AbortController().signal,
        ),
        scene,
      );
  }
  assert.equal(JSON.stringify(graph), before);
  assert.equal(model.nodes.get('distribution')!.total, 527200);
  assert.equal(model.links.get('trial-in')!.input.amount, 200);
});

test('a dense port stack grows beyond plotHeight without compressing the pixel floor', () => {
  const graph: SankeyGraph = {
    stages: ['a', 'b'],
    nodes: [
      { key: 'a', title: 'Source', placement: { stage: 'a' } },
      { key: 'b', title: 'Target', placement: { stage: 'b' } },
    ],
    links: Array.from({ length: 20 }, (_, i) => ({
      key: `f${i}`,
      from: 'a',
      to: 'b',
      amount: i ? 1 : 1000000,
    })),
  };
  const scene = layoutGraph(resolveGraph(graph), {
    width: 960,
    plotHeight: 40,
    minLinkWidth: 4,
  });
  portsFit(scene);
  assert.ok(scene.centralHeight >= 128);
  assert.ok(scene.nodes.every((n) => n.h >= 80 - 0.01));
  for (const edge of ['top', 'bottom'] as const) {
    const edgeGraph: SankeyGraph = {
      ...graph,
      nodes: [graph.nodes[0], { ...graph.nodes[1], placement: { edge } }],
    };
    const edgeScene = layoutGraph(resolveGraph(edgeGraph), {
      width: 180,
      plotHeight: 40,
      minLinkWidth: 4,
    });
    portsFit(edgeScene);
    assert.ok(
      edgeScene.width > 180,
      'fixed edge stack widens its corridor instead of shrinking below 4px',
    );
    assert.equal(edgeScene.diagnostics.obstacleCollisions, 0);
  }
});

for (const edge of ['top', 'bottom'] as const)
  for (const out of [true, false])
    test(`minimum widths fit parallel ${out ? 'outgoing' : 'incoming'} ${edge} connections`, () => {
      const graph: SankeyGraph = {
        stages: ['stage'],
        nodes: [
          {
            key: 'main',
            title: 'Main',
            placement: { stage: 'stage' },
          },
          { key: 'edge', title: 'Boundary', placement: { edge } },
        ],
        links: [500000, 2000, 200].map((amount, i) => ({
          key: `f${i}`,
          from: out ? 'main' : 'edge',
          to: out ? 'edge' : 'main',
          amount,
        })),
      };
      for (const width of [360, 960]) {
        const scene = layoutGraph(resolveGraph(graph), {
          width,
          minLinkWidth: 4,
        });
        portsFit(scene);
        assert.equal(scene.diagnostics.obstacleCollisions, 0);
        assert.equal(scene.diagnostics.crossings, 0);
      }
    });

for (const edge of ['top', 'bottom'] as const)
  test(`wrapped ${edge} destinations reserve the displayed lane widths`, () => {
    const graph: SankeyGraph = {
      stages: ['stage'],
      nodes: [
        { key: 'main', title: 'Main', placement: { stage: 'stage' } },
        ...Array.from({ length: 12 }, (_, i) => ({
          key: `d${i}`,
          title: `Destination ${i + 1}`,
          placement: { edge },
        })),
      ],
      links: Array.from({ length: 12 }, (_, i) => ({
        key: `f${i}`,
        from: 'main',
        to: `d${i}`,
        amount: i ? 200 : 500000,
      })),
    };
    const scene = layoutGraph(resolveGraph(graph), {
      width: 360,
      minLinkWidth: 4,
    });
    portsFit(scene);
    assert.ok(scene.nodes.some((n) => n.row > 0));
    assert.equal(scene.diagnostics.obstacleCollisions, 0);
    assert.equal(scene.diagnostics.crossings, 0);
    for (let i = 0; i < scene.links.length; i++)
      for (let j = i + 1; j < scene.links.length; j++) {
        const a = scene.links[i],
          b = scene.links[j];
        let distance = Infinity;
        for (const p of a.route.points)
          for (let k = 1; k < b.route.points.length; k++)
            distance = Math.min(
              distance,
              distanceToSegment(p, b.route.points[k - 1], b.route.points[k]),
            );
        assert.ok(
          distance >= (a.width + b.width) / 2 - 0.25,
          `separate ${a.key}/${b.key}`,
        );
      }
  });

test('minimum thickness applies to both reference-valued endpoints without changing FX facts', () => {
  const graph: SankeyGraph = {
    defaultUnit: 'USD',
    conversionRates: [{ from: 'USD', to: 'COP', rate: 4000 }],
    stages: ['a', 'b'],
    nodes: [
      {
        key: 'a',
        title: 'Source',
        total: 500000,
        placement: { stage: 'a' },
      },
      { key: 'b', title: 'Destination', placement: { stage: 'b' } },
    ],
    links: [
      {
        key: 'fx',
        from: 'a',
        to: 'b',
        amount: 20000,
        inputUnit: 'USD',
        outputUnit: 'COP',
        conversionRate: 40,
      },
    ],
  };
  const model = resolveGraph(graph),
    scene = layoutGraph(model, { width: 960, minLinkWidth: 4 });
  portsFit(scene);
  const link = scene.links[0];
  assert.equal(link.startWidth, 20000 * scene.scale);
  assert.equal(link.endWidth, 4);
  assert.ok(link.ribbon);
  assert.deepEqual(model.links.get('fx')!.output, {
    amount: 800000,
    unit: 'COP',
  });
  assert.equal(model.nodes.get('b')!.total, 200);
});
