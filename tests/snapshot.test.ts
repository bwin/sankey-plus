import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph } from '../src/layout.js';
import { resolveGraph } from '../src/model.js';
import { layoutSnapshot } from '../src/snapshot.js';
import type { SankeyGraph } from '../src/types.js';

const graph: SankeyGraph = {
  stages: ['source', 'process', 'result'],
  nodes: [
    {
      key: 'a',
      title: 'Alpha',
      total: 100,
      placement: { stage: 'source' },
    },
    {
      key: 'b',
      title: 'Beta',
      total: 90,
      placement: { stage: 'process' },
      color: '#123456',
    },
    { key: 'c', title: 'Gamma', placement: { stage: 'result' } },
    { key: 'reserve', title: 'Reserve', placement: { edge: 'top' } },
  ],
  links: [
    { key: 'ab', from: 'a', to: 'b', amount: 80 },
    { key: 'bc', from: 'b', to: 'c', amount: 50 },
    { key: 'ac', from: 'a', to: 'c', amount: 20 },
    { key: 'reserve-b', from: 'reserve', to: 'b', amount: 10 },
  ],
};

test('layout snapshot copies completed scene geometry, labels and diagnostics', () => {
  const model = resolveGraph(graph),
    labels = new Map([
      ['node:a', ['Alpha']],
      ['node:b', ['Beta', '90 total']],
      ['node:c', ['Gamma']],
      ['node:reserve', ['Reserve']],
      ['link:ab', ['80 units']],
      ['link:bc', ['50 units']],
      ['link:ac', ['20 units']],
      ['link:reserve-b', ['10 units']],
    ]),
    scene = layoutGraph(model, { width: 960, labels }),
    snapshot = layoutSnapshot(scene, model);

  assert.equal(snapshot.width, scene.width);
  assert.equal(snapshot.height, scene.height);
  assert.equal(snapshot.topBand, scene.topBand);
  assert.equal(snapshot.bottomBand, scene.bottomBand);
  assert.ok(snapshot.topBand > 0);
  assert.equal(snapshot.bottomBand, 0);
  assert.equal(snapshot.scale, scene.scale);
  assert.ok(snapshot.scale > 0);
  assert.deepEqual(snapshot.plot, {
    top: scene.centralTop,
    bottom: scene.centralTop + scene.centralHeight,
    height: scene.centralHeight,
  });
  assert.deepEqual([...snapshot.nodes.keys()].sort(), [
    'a',
    'b',
    'c',
    'reserve',
  ]);
  assert.deepEqual([...snapshot.links.keys()].sort(), [
    'ab',
    'ac',
    'bc',
    'reserve-b',
  ]);

  assert.deepEqual(
    snapshot.stages.map((stage) => stage.key),
    ['source', 'process', 'result'],
  );
  assert.deepEqual(
    snapshot.stages.map((stage) => stage.x),
    [
      snapshot.nodes.get('a')!.x,
      snapshot.nodes.get('b')!.x,
      snapshot.nodes.get('c')!.x,
    ],
  );
  assert.ok(snapshot.stages[0].x < snapshot.stages[1].x);
  assert.ok(snapshot.stages[1].x < snapshot.stages[2].x);

  const sceneB = scene.nodes.find((node) => node.key === 'b')!,
    b = snapshot.nodes.get('b')!;
  assert.equal(b.stage, 'process');
  assert.equal(b.edge, undefined);
  assert.equal(b.color, '#123456');
  assert.equal(b.total, 90);
  assert.equal(b.incoming, 90);
  assert.equal(b.outgoing, 50);
  assert.deepEqual(b.label.lines, ['Beta', '90 total']);
  assert.equal(b.label.x, sceneB.label.x);
  assert.equal(b.label.y, sceneB.label.y);
  assert.equal(b.label.width, sceneB.label.w);
  assert.equal(b.label.height, sceneB.label.h);
  assert.equal(b.label.anchor, sceneB.label.anchor);
  assert.notEqual(b.label.lines, sceneB.label.lines);

  const reserve = snapshot.nodes.get('reserve')!;
  assert.equal(reserve.stage, undefined);
  assert.equal(reserve.edge, 'top');
  assert.equal(reserve.total, 10);
  assert.equal(reserve.incoming, 0);
  assert.equal(reserve.outgoing, 10);

  const sceneAB = scene.links.find((link) => link.key === 'ab')!,
    ab = snapshot.links.get('ab')!;
  assert.equal(ab.from, 'a');
  assert.equal(ab.to, 'b');
  assert.equal(ab.width, sceneAB.width);
  assert.equal(ab.path, sceneAB.ribbon?.path ?? sceneAB.route.path);
  assert.match(ab.path, /^M/);
  assert.deepEqual(ab.label.lines, ['80 units']);
  assert.equal(ab.labelHidden, sceneAB.labelHidden);
  assert.equal(ab.label.anchor, sceneAB.label.anchor);

  assert.deepEqual(snapshot.diagnostics, scene.diagnostics);
  assert.equal(typeof snapshot.diagnostics.crossings, 'number');
  assert.equal(typeof snapshot.diagnostics.obstacleCollisions, 'number');
});

test('layout snapshot exposes named layout units and edge band heights', () => {
  const unitGraph: SankeyGraph = {
      defaultUnit: 'kg',
      stages: ['in', 'out'],
      nodes: [
        {
          key: 'in',
          title: 'In',
          total: 12,
          placement: { stage: 'in' },
        },
        { key: 'out', title: 'Out', placement: { stage: 'out' } },
        { key: 'top', title: 'Top', placement: { edge: 'top' } },
      ],
      links: [
        {
          key: 'io',
          from: 'in',
          to: 'out',
          amount: 10,
          inputUnit: 'kg',
          outputUnit: 'kg',
        },
        {
          key: 'ti',
          from: 'top',
          to: 'in',
          amount: 2,
          inputUnit: 'kg',
          outputUnit: 'kg',
        },
      ],
    },
    model = resolveGraph(unitGraph),
    scene = layoutGraph(model, { width: 720 }),
    snapshot = layoutSnapshot(scene, model);

  assert.equal(snapshot.topBand, scene.topBand);
  assert.equal(snapshot.bottomBand, scene.bottomBand);
  assert.ok(snapshot.topBand > 0);
  assert.equal(snapshot.bottomBand, 0);
  const input = snapshot.nodes.get('in')!;
  assert.equal(input.unit, 'kg');
  assert.equal(input.total, 12);
  assert.equal(input.incoming, 2);
  assert.equal(input.outgoing, 10);
  assert.equal(snapshot.nodes.get('out')!.unit, 'kg');
  assert.equal(snapshot.nodes.get('top')!.unit, 'kg');
});
