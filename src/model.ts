import { FlowInputError, type FlowGraph, type FlowIssue, type FlowSubject, type ItemFacts, type TransferFacts } from './types.js';
export interface ResolvedGraph<I = unknown, T = unknown> {
    graph: FlowGraph<I, T>;
    items: Map<string, ItemFacts<I, T>>;
    transfers: Map<string, TransferFacts<I, T>>;
    stages: string[];
    subjects: FlowSubject[];
}
export function resolveGraph<I, T>(graph: FlowGraph<I, T>): ResolvedGraph<I, T> {
    const issues: FlowIssue[] = [];
    const stageKeys = new Set<string>(), itemKeys = new Set<string>(), transferKeys = new Set<string>();
    const key = (value: unknown, collection: Set<string>, context: Partial<FlowIssue>) => {
        if (typeof value !== 'string' || !value.trim())
            issues.push({ code: 'invalid-key', message: 'Keys must be non-empty strings.', ...context });
        else if (collection.has(value))
            issues.push({ code: 'duplicate-key', message: `Duplicate key: ${value}.`, ...context });
        else
            collection.add(value);
    };
    for (const stage of graph.stages)
        key(stage, stageKeys, {});
    const items = new Map<string, ItemFacts<I, T>>();
    for (const item of graph.items) {
        const context = { itemKey: item.key };
        key(item.key, itemKeys, context);
        if (typeof item.title !== 'string' || !item.title.trim())
            issues.push({ code: 'invalid-title', message: `Item ${item.key} needs a title.`, ...context });
        const p = item.placement;
        if (!p || (p.stage !== undefined) === (p.edge !== undefined) || (p.edge !== undefined && !['top', 'bottom'].includes(p.edge)))
            issues.push({ code: 'invalid-placement', message: `Item ${item.key} needs one stage or edge placement.`, ...context });
        else if (p.stage !== undefined && !stageKeys.has(p.stage))
            issues.push({ code: 'unknown-stage', message: `Unknown stage ${p.stage} on ${item.key}.`, ...context });
        if (item.total !== undefined && (!Number.isFinite(item.total) || item.total < 0))
            issues.push({ code: 'invalid-number', message: `Invalid total on ${item.key}.`, ...context });
        items.set(item.key, { kind: 'item', item, total: 0, incoming: 0, outgoing: 0, totalSource: item.total === undefined ? 'derived' : 'declared', incomingTransfers: [], outgoingTransfers: [] });
    }
    const incoming = new Map(graph.items.map(n => [n.key, [] as FlowGraph<I, T>['transfers'][number][]]));
    const outgoing = new Map(graph.items.map(n => [n.key, [] as FlowGraph<I, T>['transfers'][number][]]));
    const transfers = new Map<string, TransferFacts<I, T>>();
    for (const transfer of graph.transfers) {
        const context = { transferKey: transfer.key };
        key(transfer.key, transferKeys, context);
        if (!Number.isFinite(transfer.amount) || transfer.amount <= 0)
            issues.push({ code: 'invalid-number', message: `Transfer ${transfer.key} needs a finite, positive amount.`, ...context });
        const from = items.get(transfer.from), to = items.get(transfer.to);
        if (!from || !to) {
            issues.push({ code: 'unknown-endpoint', message: `Unknown endpoint on ${transfer.key}.`, ...context });
            continue;
        }
        outgoing.get(transfer.from)!.push(transfer);
        incoming.get(transfer.to)!.push(transfer);
        const a = from.item.placement?.stage, b = to.item.placement?.stage;
        if (a !== undefined && b !== undefined && graph.stages.indexOf(a) >= graph.stages.indexOf(b))
            issues.push({ code: 'backward-stage-transfer', message: `Transfer ${transfer.key} must move to a later stage.`, ...context });
        transfers.set(transfer.key, { kind: 'transfer', transfer, fromItem: from.item, toItem: to.item });
    }
    // Kahn's algorithm includes edge items, so a detour cannot conceal a cycle.
    const degree = new Map([...items.keys()].map(k => [k, incoming.get(k)!.length]));
    const queue = [...items.keys()].filter(k => degree.get(k) === 0);
    for (let i = 0; i < queue.length; i++)
        for (const f of outgoing.get(queue[i])!) {
            degree.set(f.to, degree.get(f.to)! - 1);
            if (degree.get(f.to) === 0)
                queue.push(f.to);
        }
    if (queue.length !== items.size)
        issues.push({ code: 'cycle', message: 'The graph contains a directed cycle.' });
    for (const [id, facts] of items) {
        const ins = incoming.get(id)!, outs = outgoing.get(id)!;
        const a = ins.reduce((s, f) => s + f.amount, 0), b = outs.reduce((s, f) => s + f.amount, 0), total = facts.item.total ?? Math.max(a, b);
        if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(total))
            issues.push({ code: 'invalid-number', itemKey: id, message: `Quantities on ${id} exceed the finite numeric range.` });
        if (total + 1e-9 * Math.max(1, total, a, b) < Math.max(a, b))
            issues.push({ code: 'total-too-small', itemKey: id, message: `Total on ${id} must be at least ${Math.max(a, b)}.` });
        if (facts.item.placement?.edge) {
            const sources = ins.map(f => items.get(f.from)?.item.placement?.stage).filter((s): s is string => s !== undefined).map(s => graph.stages.indexOf(s));
            const targets = outs.map(f => items.get(f.to)?.item.placement?.stage).filter((s): s is string => s !== undefined).map(s => graph.stages.indexOf(s));
            if (sources.length && targets.length && Math.max(...sources) >= Math.min(...targets))
                issues.push({ code: 'incompatible-placement', itemKey: id, message: `Edge item ${id} cannot fit between its main sources and targets.` });
        }
        items.set(id, { ...facts, total, incoming: a, outgoing: b, incomingTransfers: ins, outgoingTransfers: outs });
    }
    if (issues.length)
        throw new FlowInputError(issues);
    return { graph, items, transfers, stages: graph.stages.filter(s => graph.items.some(n => n.placement.stage === s)), subjects: [...graph.items.map(n => ({ kind: 'item' as const, key: n.key })), ...graph.transfers.map(f => ({ kind: 'transfer' as const, key: f.key }))] };
}
export function emphasis<I, T>(model: ResolvedGraph<I, T>, subject: FlowSubject | null) {
    const items = new Set<string>(), transfers = new Set<string>();
    if (!subject || (subject.kind === 'item' ? !model.items.has(subject.key) : !model.transfers.has(subject.key))) {
        for (const k of model.items.keys())
            items.add(k);
        for (const k of model.transfers.keys())
            transfers.add(k);
    }
    else if (subject.kind === 'item') {
        items.add(subject.key);
        const facts = model.items.get(subject.key)!;
        for (const f of [...facts.incomingTransfers, ...facts.outgoingTransfers]) {
            transfers.add(f.key);
            items.add(f.from);
            items.add(f.to);
        }
    }
    else {
        const f = model.transfers.get(subject.key)!.transfer;
        transfers.add(f.key);
        items.add(f.from);
        items.add(f.to);
    }
    return { items, transfers };
}
const palette = ['#5265cc', '#138b87', '#bc6c40', '#a95d8b', '#8170b4', '#3589ac', '#8b8849', '#64778d'];
export function itemColor(key: string, supplied?: string) {
    if (supplied && (typeof CSS === 'undefined' || CSS.supports('color', supplied)))
        return supplied;
    let hash = 2166136261;
    for (const char of key)
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return palette[(hash >>> 0) % palette.length];
}
