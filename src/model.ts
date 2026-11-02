import {
  SankeyInputError,
  type SankeyGraph,
  type SankeyIssue,
  type SankeySubject,
  type SankeyNodeFacts,
  type SankeyLinkFacts,
} from './types.js';
import { resolveUnits } from './units.js';
export interface ResolvedGraph<I = unknown, T = unknown> {
  graph: SankeyGraph<I, T>;
  nodes: Map<string, SankeyNodeFacts<I, T>>;
  links: Map<string, SankeyLinkFacts<I, T>>;
  stages: string[];
  subjects: SankeySubject[];
  layoutUnit?: string;
}
export function resolveGraph<I, T>(
  graph: SankeyGraph<I, T>,
): ResolvedGraph<I, T> {
  const issues: SankeyIssue[] = [];
  const units = resolveUnits(graph, issues);
  const stageKeys = new Set<string>(),
    nodeKeys = new Set<string>(),
    linkKeys = new Set<string>();
  const key = (
    value: unknown,
    collection: Set<string>,
    context: Partial<SankeyIssue>,
  ) => {
    if (typeof value !== 'string' || !value.trim())
      issues.push({
        code: 'invalid-key',
        message: 'Keys must be non-empty strings.',
        ...context,
      });
    else if (collection.has(value))
      issues.push({
        code: 'duplicate-key',
        message: `Duplicate key: ${value}.`,
        ...context,
      });
    else collection.add(value);
  };
  for (const stage of graph.stages) key(stage, stageKeys, {});
  const nodes = new Map<string, SankeyNodeFacts<I, T>>();
  for (const node of graph.nodes) {
    const context = { nodeKey: node.key };
    key(node.key, nodeKeys, context);
    if (typeof node.title !== 'string' || !node.title.trim())
      issues.push({
        code: 'invalid-title',
        message: `Node ${node.key} needs a title.`,
        ...context,
      });
    const p = node.placement;
    if (
      !p ||
      (p.stage !== undefined) === (p.edge !== undefined) ||
      (p.edge !== undefined && !['top', 'bottom'].includes(p.edge))
    )
      issues.push({
        code: 'invalid-placement',
        message: `Node ${node.key} needs one stage or edge placement.`,
        ...context,
      });
    else if (p.stage !== undefined && !stageKeys.has(p.stage))
      issues.push({
        code: 'unknown-stage',
        message: `Unknown stage ${p.stage} on ${node.key}.`,
        ...context,
      });
    if (
      node.total !== undefined &&
      (!Number.isFinite(node.total) || node.total < 0)
    )
      issues.push({
        code: 'invalid-number',
        message: `Invalid total on ${node.key}.`,
        ...context,
      });
    if (node.total !== undefined && node.totals !== undefined)
      issues.push({
        code: 'incompatible-totals',
        message: `Use total or totals on ${node.key}, not both.`,
        ...context,
      });
    for (const [unit, value] of Object.entries(node.totals ?? {}))
      if (
        value !== 'auto' &&
        (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      )
        issues.push({
          code: 'invalid-number',
          message: `Invalid ${unit} total on ${node.key}.`,
          ...context,
        });
    nodes.set(node.key, {
      kind: 'node',
      node,
      total: 0,
      incoming: 0,
      outgoing: 0,
      totalSource: 'derived',
      totals: [],
      unit: units.layoutUnit,
      incomingLinks: [],
      outgoingLinks: [],
    });
  }
  const incoming = new Map(
    graph.nodes.map((n) => [n.key, [] as SankeyGraph<I, T>['links'][number][]]),
  );
  const outgoing = new Map(
    graph.nodes.map((n) => [n.key, [] as SankeyGraph<I, T>['links'][number][]]),
  );
  const links = new Map<string, SankeyLinkFacts<I, T>>();
  for (const link of graph.links) {
    const context = { linkKey: link.key };
    key(link.key, linkKeys, context);
    if (!Number.isFinite(link.amount) || link.amount <= 0)
      issues.push({
        code: 'invalid-number',
        message: `Link ${link.key} needs a finite, positive amount.`,
        ...context,
      });
    const from = nodes.get(link.from),
      to = nodes.get(link.to);
    if (!from || !to) {
      issues.push({
        code: 'unknown-endpoint',
        message: `Unknown endpoint on ${link.key}.`,
        ...context,
      });
      continue;
    }
    outgoing.get(link.from)!.push(link);
    incoming.get(link.to)!.push(link);
    const a = from.node.placement?.stage,
      b = to.node.placement?.stage;
    if (
      a !== undefined &&
      b !== undefined &&
      graph.stages.indexOf(a) >= graph.stages.indexOf(b)
    )
      issues.push({
        code: 'backward-stage-link',
        message: `Link ${link.key} must move to a later stage.`,
        ...context,
      });
    const conversionRate =
      link.conversionRate ?? (link.inputUnit === link.outputUnit ? 1 : NaN);
    if (
      !Number.isFinite(conversionRate) ||
      conversionRate <= 0 ||
      !Number.isFinite(1 / conversionRate)
    )
      issues.push({
        code: 'invalid-rate',
        message: `Link ${link.key} needs a finite positive conversionRate when its input and output units differ.`,
        ...context,
      });
    const input = { amount: link.amount, unit: link.inputUnit },
      output = {
        amount: link.amount * conversionRate,
        unit: link.outputUnit,
      };
    const inputValuation = units.conversion(input.unit),
      outputValuation = units.conversion(output.unit);
    const layoutInputAmount = input.amount * inputValuation.factor,
      layoutOutputAmount = output.amount * outputValuation.factor;
    if (
      [output.amount, layoutInputAmount, layoutOutputAmount].some(
        (value) => !Number.isFinite(value) || value <= 0,
      )
    )
      issues.push({
        code: 'invalid-number',
        message: `Transfer and valued endpoint amounts on ${link.key} must be finite and positive.`,
        ...context,
      });
    const referenceRates = [
      ...new Set([...inputValuation.rates, ...outputValuation.rates]),
    ];
    links.set(link.key, {
      kind: 'link',
      link,
      fromNode: from.node,
      toNode: to.node,
      input,
      output,
      conversionRate,
      layoutInputAmount,
      layoutOutputAmount,
      referenceRates,
      converted: graph.defaultUnit
        ? {
            unit: graph.defaultUnit,
            inputAmount: layoutInputAmount,
            outputAmount: layoutOutputAmount,
          }
        : undefined,
    });
  }
  // Kahn's algorithm includes edge nodes, so a detour cannot conceal a cycle.
  const degree = new Map(
    [...nodes.keys()].map((k) => [k, incoming.get(k)!.length]),
  );
  const queue = [...nodes.keys()].filter((k) => degree.get(k) === 0);
  for (let i = 0; i < queue.length; i++)
    for (const f of outgoing.get(queue[i])!) {
      degree.set(f.to, degree.get(f.to)! - 1);
      if (degree.get(f.to) === 0) queue.push(f.to);
    }
  if (queue.length !== nodes.size)
    issues.push({
      code: 'cycle',
      message: 'The graph contains a directed cycle.',
    });
  for (const [id, facts] of nodes) {
    const ins = incoming.get(id)!,
      outs = outgoing.get(id)!;
    const balances = new Map<
      string | undefined,
      {
        unit?: string;
        total: number;
        incoming: number;
        outgoing: number;
        totalSource: 'declared' | 'derived';
      }
    >();
    const balance = (unit: string | undefined) => {
      if (!balances.has(unit))
        balances.set(unit, {
          unit,
          total: 0,
          incoming: 0,
          outgoing: 0,
          totalSource: 'derived',
        });
      return balances.get(unit)!;
    };
    for (const [unit, value] of Object.entries(facts.node.totals ?? {})) {
      const row = balance(unit);
      if (value !== 'auto') {
        row.total = value;
        row.totalSource = 'declared';
      }
    }
    if (facts.node.total !== undefined) {
      const row = balance(graph.defaultUnit);
      row.total = facts.node.total;
      row.totalSource = 'declared';
    }
    for (const link of ins) {
      const value = links.get(link.key)!.output;
      balance(value.unit).incoming += value.amount;
    }
    for (const link of outs) {
      const value = links.get(link.key)!.input;
      balance(value.unit).outgoing += value.amount;
    }
    if (!balances.size) balance(graph.defaultUnit ?? units.layoutUnit);
    for (const row of balances.values()) {
      const required = Math.max(row.incoming, row.outgoing);
      if (row.totalSource === 'derived') row.total = required;
      if (row.total + 1e-9 * Math.max(1, row.total, required) < required)
        issues.push({
          code: 'total-too-small',
          nodeKey: id,
          message: `${row.unit ?? 'Unitless'} total on ${id} must be at least ${required}.`,
        });
    }
    const totals = [...balances.values()];
    const combined = (field: 'total' | 'incoming' | 'outgoing') =>
      totals.reduce((s, row) => {
        const value = row[field] * units.conversion(row.unit).factor;
        if (row[field] > 0 && value === 0)
          issues.push({
            code: 'invalid-number',
            nodeKey: id,
            message: `Converted ${row.unit} ${field} on ${id} underflows to zero.`,
          });
        return s + value;
      }, 0);
    const a = combined('incoming'),
      b = combined('outgoing'),
      total = combined('total');
    const totalSource = totals.every((r) => r.totalSource === 'declared')
      ? 'declared'
      : totals.every((r) => r.totalSource === 'derived')
        ? 'derived'
        : 'mixed';
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(total))
      issues.push({
        code: 'invalid-number',
        nodeKey: id,
        message: `Quantities on ${id} exceed the finite numeric range.`,
      });
    if (total + 1e-9 * Math.max(1, total, a, b) < Math.max(a, b))
      issues.push({
        code: 'total-too-small',
        nodeKey: id,
        message: `Total on ${id} must be at least ${Math.max(a, b)}.`,
      });
    if (facts.node.placement?.edge) {
      const sources = ins
        .map((f) => nodes.get(f.from)?.node.placement?.stage)
        .filter((s): s is string => s !== undefined)
        .map((s) => graph.stages.indexOf(s));
      const targets = outs
        .map((f) => nodes.get(f.to)?.node.placement?.stage)
        .filter((s): s is string => s !== undefined)
        .map((s) => graph.stages.indexOf(s));
      if (sources.length && targets.length) {
        const latestSource = sources.reduce(
            (latest, stage) => Math.max(latest, stage),
            -Infinity,
          ),
          earliestTarget = targets.reduce(
            (earliest, stage) => Math.min(earliest, stage),
            Infinity,
          );
        if (latestSource >= earliestTarget)
          issues.push({
            code: 'incompatible-placement',
            nodeKey: id,
            message: `Edge node ${id} cannot fit between its main sources and targets.`,
          });
      }
    }
    nodes.set(id, {
      ...facts,
      total,
      incoming: a,
      outgoing: b,
      totalSource,
      totals,
      converted: graph.defaultUnit
        ? {
            unit: graph.defaultUnit,
            total,
            incoming: a,
            outgoing: b,
            totalSource,
          }
        : undefined,
      incomingLinks: ins,
      outgoingLinks: outs,
    });
  }
  if (issues.length) throw new SankeyInputError(issues);
  return {
    graph,
    nodes,
    links,
    layoutUnit: units.layoutUnit,
    stages: graph.stages.filter((s) =>
      graph.nodes.some((n) => n.placement.stage === s),
    ),
    subjects: [
      ...graph.nodes.map((n) => ({ kind: 'node' as const, key: n.key })),
      ...graph.links.map((f) => ({ kind: 'link' as const, key: f.key })),
    ],
  };
}
export function subjectExists<I, T>(
  model: ResolvedGraph<I, T>,
  subject: SankeySubject | null | undefined,
): subject is SankeySubject {
  return (
    !!subject &&
    (subject.kind === 'node'
      ? model.nodes.has(subject.key)
      : model.links.has(subject.key))
  );
}
export function emphasis<I, T>(
  model: ResolvedGraph<I, T>,
  subject: SankeySubject | null,
) {
  const nodes = new Set<string>(),
    links = new Set<string>();
  if (
    !subject ||
    (subject.kind === 'node'
      ? !model.nodes.has(subject.key)
      : !model.links.has(subject.key))
  ) {
    for (const k of model.nodes.keys()) nodes.add(k);
    for (const k of model.links.keys()) links.add(k);
  } else if (subject.kind === 'node') {
    nodes.add(subject.key);
    const facts = model.nodes.get(subject.key)!;
    for (const f of [...facts.incomingLinks, ...facts.outgoingLinks]) {
      links.add(f.key);
      nodes.add(f.from);
      nodes.add(f.to);
    }
  } else {
    const f = model.links.get(subject.key)!.link;
    links.add(f.key);
    nodes.add(f.from);
    nodes.add(f.to);
  }
  return { nodes, links };
}
const palette = [
  '#5265cc',
  '#138b87',
  '#bc6c40',
  '#a95d8b',
  '#8170b4',
  '#3589ac',
  '#8b8849',
  '#64778d',
];
export function nodeColor(key: string, supplied?: string) {
  if (
    supplied &&
    (typeof CSS === 'undefined' || CSS.supports('color', supplied))
  )
    return supplied;
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return palette[(hash >>> 0) % palette.length];
}
