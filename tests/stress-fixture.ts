import type { SankeyGraph } from '../src/types.js';

/** Four columns of 25 nodes; four forward links per node, wrapping at each column end. */
export function stressGraph(): SankeyGraph {
    const stages = ['a', 'b', 'c', 'd'];
    const nodes = stages.flatMap((stage, s) => Array.from({ length: 25 }, (_, n) => ({ key: `${s}-${n}`, title: `Node ${s}-${n}`, placement: { stage } })));
    const links = stages.slice(0, -1).flatMap((_, s) => Array.from({ length: 25 }, (_, n) => Array.from({ length: 4 }, (_, offset) => ({ key: `${s}-${n}-${offset}`, from: `${s}-${n}`, to: `${s + 1}-${(n + offset) % 25}`, amount: 10 + offset }))).flat());
    return { stages, nodes, links };
}
