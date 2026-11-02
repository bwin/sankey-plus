import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile, project } from './build.mjs';

// Compilation, imports, fixture creation and hashing are outside the measured region.
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const repetitions = Number(option('--runs') ?? 10);
if (!Number.isInteger(repetitions) || repetitions < 1)
  throw Error('--runs must be a positive integer');
compile('tsconfig.test.json');
const modules = path.resolve(project, option('--modules') ?? '.tests/src');
const { resolveGraph } = await import(
  pathToFileURL(path.join(modules, 'model.js')).href
);
const { layoutGraph } = await import(
  pathToFileURL(path.join(modules, 'layout.js')).href
);
const { stressGraph } = await import(
  pathToFileURL(path.join(project, '.tests/fixtures/stress.js')).href
);
const readGraph = async (name) =>
  JSON.parse(await readFile(path.join(project, 'demo', name), 'utf8'));
const allocations = JSON.parse(
  await readFile(
    path.join(project, 'tests/fixtures/original-allocations.json'),
    'utf8',
  ),
);
const full = await readGraph('feature-demo.json');
const fan = {
  stages: ['a'],
  nodes: [
    { key: 'a', title: 'Process', placement: { stage: 'a' } },
    ...Array.from({ length: 12 }, (_, i) => ({
      key: `d${i}`,
      title: `Destination ${i + 1}`,
      placement: { edge: 'bottom' },
    })),
  ],
  links: Array.from({ length: 12 }, (_, i) => ({
    key: `f${i}`,
    from: 'a',
    to: `d${i}`,
    amount: 100,
  })),
};
const cases = [
  { name: 'stress-100-300', graph: stressGraph(), width: 1440 },
  { name: 'allocations-desktop', graph: allocations, width: 1440 },
  { name: 'allocations-mobile', graph: allocations, width: 360 },
  { name: 'four-sided', graph: full, width: 1126 },
  { name: 'wrapped-fan', graph: fan, width: 600 },
].filter((c) => !option('--case') || c.name === option('--case'));
if (!cases.length) throw Error('Unknown --case');
// Keep the stress fixture identical to its regression test. Other fixtures use the demo's two-line node labels.
for (const c of cases)
  if (c.name !== 'stress-100-300') {
    const model = resolveGraph(c.graph);
    c.labels = new Map(
      c.graph.nodes.map((n) => [
        `node:${n.key}`,
        [
          n.title,
          `${model.nodes.get(n.key).total.toLocaleString('en-US')} units total`,
        ],
      ]),
    );
  }
const profilePath = option('--profile');
const session = profilePath ? new Session() : null;
const post = (method, params = {}) =>
  new Promise((resolve, reject) =>
    session.post(method, params, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );
if (session) {
  session.connect();
  await post('Profiler.enable');
  await post('Profiler.start');
}
const results = [];
for (const c of cases) {
  const samples = [];
  let scene;
  for (let i = 0; i <= repetitions; i++) {
    const start = performance.now();
    const model = resolveGraph(c.graph);
    scene = layoutGraph(model, { width: c.width, labels: c.labels });
    samples.push(performance.now() - start);
  }
  const warm = samples.slice(1).sort((a, b) => a - b),
    middle = Math.floor(warm.length / 2);
  results.push({
    name: c.name,
    nodes: c.graph.nodes.length,
    links: c.graph.links.length,
    requestedWidth: c.width,
    width: scene.width,
    height: scene.height,
    diagnostics: scene.diagnostics,
    sceneHash: createHash('sha256').update(JSON.stringify(scene)).digest('hex'),
    firstMs: samples[0],
    medianMs:
      warm.length % 2 ? warm[middle] : (warm[middle - 1] + warm[middle]) / 2,
    minMs: warm[0],
    maxMs: warm.at(-1),
    samplesMs: samples,
  });
}
const save = async (file, data) => {
  const target = path.resolve(project, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(data, null, 2) + '\n');
};
if (session) {
  const { profile } = await post('Profiler.stop');
  session.disconnect();
  await save(profilePath, profile);
}
const report = {
  node: process.version,
  cpu: cpus()[0]?.model,
  repetitions,
  timing:
    'resolveGraph + layoutGraph; no React, DOM or paint; profiled runs include sampling overhead',
  results,
};
if (option('--output')) await save(option('--output'), report);
console.log(JSON.stringify(report, null, 2));
