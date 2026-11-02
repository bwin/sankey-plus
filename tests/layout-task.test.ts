import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutGraph, layoutGraphSteps } from '../src/layout.js';
import { runInChunks } from '../src/layout-task.js';
import { resolveGraph } from '../src/model.js';
import { SankeyInputError, type SankeyGraph } from '../src/types.js';
import { stressGraph } from '../fixtures/stress.js';

test('chunked layout matches synchronous geometry for stress, wrapping and width retries', async () => {
    const full = JSON.parse(readFileSync(new URL('../../demo/feature-demo.json', import.meta.url), 'utf8')) as SankeyGraph;
    const original = JSON.parse(readFileSync(new URL('../../tests/fixtures/original-allocations.json', import.meta.url), 'utf8')) as SankeyGraph;
    const cases = [{ graph: stressGraph(), width: 1440 }, { graph: full, width: 960 }, { graph: original, width: 360 }];
    for (const { graph, width } of cases) {
        const before = JSON.stringify(graph), model = resolveGraph(graph);
        const labels = new Map(graph.nodes.map(n => [`node:${n.key}`, [n.title, `${model.nodes.get(n.key)!.total} units total`]]));
        const options = { width, labels };
        const expected = layoutGraph(model, options);
        const actual = await runInChunks(layoutGraphSteps(model, options), new AbortController().signal, { budgetMs: 2 });
        assert.deepEqual(actual, expected);
        assert.equal(JSON.stringify(graph), before);
    }
});

test('timer tasks run before and between chunks, not only after all work', async () => {
    let progress = 0, clock = 0;
    const observed: number[] = [];
    const timer = setInterval(() => observed.push(progress), 0);
    function* work() { for (; progress < 6; progress++) yield; return 'complete'; }
    try {
        const result = await runInChunks(work(), new AbortController().signal, { budgetMs: 1, now: () => clock++ });
        assert.equal(result, 'complete');
        assert.equal(observed[0], 0, 'initial layout is deferred');
        assert.ok(observed.some(n => n > 0 && n < 6), 'other tasks run during layout');
    } finally { clearInterval(timer); }
});

test('cancelling between chunks closes the iterator and prevents further work', async () => {
    const controller = new AbortController(), reason = new Error('superseded');
    let progress = 0, closed = false, clock = 0, pauses = 0;
    function* work() { try { while (progress < 100) { progress++; yield; } return progress; } finally { closed = true; } }
    await assert.rejects(runInChunks(work(), controller.signal, {
        budgetMs: 1, now: () => clock++,
        yieldToHost: () => { if (++pauses === 3) controller.abort(reason); return Promise.resolve(); },
    }), error => error === reason);
    assert.equal(progress, 2);
    assert.equal(closed, true);
});

test('an already-cancelled request never starts layout', async () => {
    const controller = new AbortController();
    controller.abort();
    let started = false;
    function* work() { started = true; yield; return 1; }
    await assert.rejects(runInChunks(work(), controller.signal), { name: 'AbortError' });
    assert.equal(started, false);
});

test('chunked layout propagates input and callback errors', async () => {
    const graph = stressGraph(), model = resolveGraph(graph);
    await assert.rejects(runInChunks(layoutGraphSteps(model, { width: NaN }), new AbortController().signal), SankeyInputError);
    const failure = new Error('label measurement failed');
    await assert.rejects(runInChunks(layoutGraphSteps(model, { width: 900, measureText: () => { throw failure; } }), new AbortController().signal), error => error === failure);
});
