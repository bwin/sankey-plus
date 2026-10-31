import type { SankeyGraph } from '../src/index.js';
import full from './feature-demo.json';
import allocationData from './allocations.json';
export const fullGraph = full as SankeyGraph;
export const allocations = allocationData as SankeyGraph;
export function fanOut(edge: 'top' | 'bottom' = 'bottom', count = 3): SankeyGraph {
    return { stages: ['process'], nodes: [{ key: 'process', title: 'Process', total: count * 100, placement: { stage: 'process' }, color: '#298c98' }, ...Array.from({ length: count }, (_, i) => ({ key: `dest-${i}`, title: `Destination ${i + 1}`, placement: { edge }, color: ['#688670', '#a88c48', '#8170b4'][i % 3] }))], links: Array.from({ length: count }, (_, i) => ({ key: `branch-${i}`, from: 'process', to: `dest-${i}`, amount: 100 })) };
}
export const simple: SankeyGraph = { stages: ['input', 'output'], nodes: [{ key: 'available', title: 'Available', total: 1000, placement: { stage: 'input' } }, { key: 'allocated', title: 'Allocated', placement: { stage: 'output' } }], links: [{ key: 'allocation', from: 'available', to: 'allocated', amount: 500 }] };
export const examples: {
    key: string;
    name: string;
    description: string;
    graph: SankeyGraph;
}[] = [
    { key: 'allocations', name: 'Allocations', description: 'Transactions, statements and invoices, with balances above and below.', graph: allocations },
    { key: 'complete', name: 'Four-sided flow', description: 'Every direction, independent totals and multiple nodes on both edges.', graph: fullGraph },
    { key: 'fanout', name: 'Fan-out', description: 'Ordered turns keep links apart. Narrow the canvas to see the destinations wrap.', graph: fanOut() },
    { key: 'top', name: 'Top fan-out', description: 'The same routing rule, reflected above the main sequence.', graph: fanOut('top') },
    { key: 'crowded', name: 'Many edge nodes', description: 'Twelve destinations share the bottom edge and wrap into additional rows.', graph: fanOut('bottom', 12) },
    { key: 'partial', name: 'Partial allocation', description: 'An available total of 1,000 with only 500 transferred. No extra edge margins.', graph: simple },
    { key: 'empty', name: 'Empty', description: 'A quiet empty state, without unused edge bands.', graph: { stages: [], nodes: [], links: [] } },
];
