import { SankeyInputError, type SankeyGraph, type SankeyIssue, type SankeySubject, type SankeyNodeFacts, type SankeyLinkFacts } from './types.js';
export interface ResolvedGraph<I = unknown, T = unknown> {
    graph: SankeyGraph<I, T>;
    nodes: Map<string, SankeyNodeFacts<I, T>>;
    links: Map<string, SankeyLinkFacts<I, T>>;
    stages: string[];
    subjects: SankeySubject[];
}
export function resolveGraph<I, T>(graph: SankeyGraph<I, T>): ResolvedGraph<I, T> {
    const issues: SankeyIssue[] = [];
    const stageKeys = new Set<string>(), nodeKeys = new Set<string>(), linkKeys = new Set<string>();
    const key = (value: unknown, collection: Set<string>, context: Partial<SankeyIssue>) => {
        if (typeof value !== 'string' || !value.trim())
            issues.push({ code: 'invalid-key', message: 'Keys must be non-empty strings.', ...context });
        else if (collection.has(value))
            issues.push({ code: 'duplicate-key', message: `Duplicate key: ${value}.`, ...context });
        else
            collection.add(value);
    };
    for (const stage of graph.stages)
        key(stage, stageKeys, {});
    const nodes = new Map<string, SankeyNodeFacts<I, T>>();
    for (const node of graph.nodes) {
        const context = { nodeKey: node.key };
        key(node.key, nodeKeys, context);
        if (typeof node.title !== 'string' || !node.title.trim())
            issues.push({ code: 'invalid-title', message: `Node ${node.key} needs a title.`, ...context });
        const p = node.placement;
        if (!p || (p.stage !== undefined) === (p.edge !== undefined) || (p.edge !== undefined && !['top', 'bottom'].includes(p.edge)))
            issues.push({ code: 'invalid-placement', message: `Node ${node.key} needs one stage or edge placement.`, ...context });
        else if (p.stage !== undefined && !stageKeys.has(p.stage))
            issues.push({ code: 'unknown-stage', message: `Unknown stage ${p.stage} on ${node.key}.`, ...context });
        if (node.total !== undefined && (!Number.isFinite(node.total) || node.total < 0))
            issues.push({ code: 'invalid-number', message: `Invalid total on ${node.key}.`, ...context });
        nodes.set(node.key, { kind: 'node', node, total: 0, incoming: 0, outgoing: 0, totalSource: node.total === undefined ? 'derived' : 'declared', incomingLinks: [], outgoingLinks: [] });
    }
    const incoming = new Map(graph.nodes.map(n => [n.key, [] as SankeyGraph<I, T>['links'][number][]]));
    const outgoing = new Map(graph.nodes.map(n => [n.key, [] as SankeyGraph<I, T>['links'][number][]]));
    const links = new Map<string, SankeyLinkFacts<I, T>>();
    for (const link of graph.links) {
        const context = { linkKey: link.key };
        key(link.key, linkKeys, context);
        if (!Number.isFinite(link.amount) || link.amount <= 0)
            issues.push({ code: 'invalid-number', message: `Link ${link.key} needs a finite, positive amount.`, ...context });
        const from = nodes.get(link.from), to = nodes.get(link.to);
        if (!from || !to) {
            issues.push({ code: 'unknown-endpoint', message: `Unknown endpoint on ${link.key}.`, ...context });
            continue;
        }
        outgoing.get(link.from)!.push(link);
        incoming.get(link.to)!.push(link);
        const a = from.node.placement?.stage, b = to.node.placement?.stage;
        if (a !== undefined && b !== undefined && graph.stages.indexOf(a) >= graph.stages.indexOf(b))
            issues.push({ code: 'backward-stage-link', message: `Link ${link.key} must move to a later stage.`, ...context });
        links.set(link.key, { kind: 'link', link, fromNode: from.node, toNode: to.node });
    }
    // Kahn's algorithm includes edge nodes, so a detour cannot conceal a cycle.
    const degree = new Map([...nodes.keys()].map(k => [k, incoming.get(k)!.length]));
    const queue = [...nodes.keys()].filter(k => degree.get(k) === 0);
    for (let i = 0; i < queue.length; i++)
        for (const f of outgoing.get(queue[i])!) {
            degree.set(f.to, degree.get(f.to)! - 1);
            if (degree.get(f.to) === 0)
                queue.push(f.to);
        }
    if (queue.length !== nodes.size)
        issues.push({ code: 'cycle', message: 'The graph contains a directed cycle.' });
    for (const [id, facts] of nodes) {
        const ins = incoming.get(id)!, outs = outgoing.get(id)!;
        const a = ins.reduce((s, f) => s + f.amount, 0), b = outs.reduce((s, f) => s + f.amount, 0), total = facts.node.total ?? Math.max(a, b);
        if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(total))
            issues.push({ code: 'invalid-number', nodeKey: id, message: `Quantities on ${id} exceed the finite numeric range.` });
        if (total + 1e-9 * Math.max(1, total, a, b) < Math.max(a, b))
            issues.push({ code: 'total-too-small', nodeKey: id, message: `Total on ${id} must be at least ${Math.max(a, b)}.` });
        if (facts.node.placement?.edge) {
            const sources = ins.map(f => nodes.get(f.from)?.node.placement?.stage).filter((s): s is string => s !== undefined).map(s => graph.stages.indexOf(s));
            const targets = outs.map(f => nodes.get(f.to)?.node.placement?.stage).filter((s): s is string => s !== undefined).map(s => graph.stages.indexOf(s));
            if (sources.length && targets.length && Math.max(...sources) >= Math.min(...targets))
                issues.push({ code: 'incompatible-placement', nodeKey: id, message: `Edge node ${id} cannot fit between its main sources and targets.` });
        }
        nodes.set(id, { ...facts, total, incoming: a, outgoing: b, incomingLinks: ins, outgoingLinks: outs });
    }
    if (issues.length)
        throw new SankeyInputError(issues);
    return { graph, nodes, links, stages: graph.stages.filter(s => graph.nodes.some(n => n.placement.stage === s)), subjects: [...graph.nodes.map(n => ({ kind: 'node' as const, key: n.key })), ...graph.links.map(f => ({ kind: 'link' as const, key: f.key }))] };
}
export function emphasis<I, T>(model: ResolvedGraph<I, T>, subject: SankeySubject | null) {
    const nodes = new Set<string>(), links = new Set<string>();
    if (!subject || (subject.kind === 'node' ? !model.nodes.has(subject.key) : !model.links.has(subject.key))) {
        for (const k of model.nodes.keys())
            nodes.add(k);
        for (const k of model.links.keys())
            links.add(k);
    }
    else if (subject.kind === 'node') {
        nodes.add(subject.key);
        const facts = model.nodes.get(subject.key)!;
        for (const f of [...facts.incomingLinks, ...facts.outgoingLinks]) {
            links.add(f.key);
            nodes.add(f.from);
            nodes.add(f.to);
        }
    }
    else {
        const f = model.links.get(subject.key)!.link;
        links.add(f.key);
        nodes.add(f.from);
        nodes.add(f.to);
    }
    return { nodes, links };
}
const palette = ['#5265cc', '#138b87', '#bc6c40', '#a95d8b', '#8170b4', '#3589ac', '#8b8849', '#64778d'];
export function nodeColor(key: string, supplied?: string) {
    if (supplied && (typeof CSS === 'undefined' || CSS.supports('color', supplied)))
        return supplied;
    let hash = 2166136261;
    for (const char of key)
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return palette[(hash >>> 0) % palette.length];
}
