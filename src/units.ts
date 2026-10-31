import type { SankeyConversionRate, SankeyGraph, SankeyIssue } from './types.js';

const validUnit = (unit: unknown): unit is string => typeof unit === 'string' && unit.length > 0 && unit.trim() === unit;
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

/** Rates describe equivalent values, so every path must imply the same ratio. */
export function resolveUnits(graph: SankeyGraph, issues: SankeyIssue[]) {
    const units = new Set<string>();
    let unitless = false;
    const register = (unit: unknown, context: Partial<SankeyIssue>) => {
        if (unit === undefined) unitless = true;
        else if (!validUnit(unit)) issues.push({ code: 'invalid-unit', message: 'Units must be non-empty strings without surrounding whitespace.', ...context });
        else units.add(unit);
    };
    if (graph.defaultUnit !== undefined) register(graph.defaultUnit, {});
    for (const link of graph.links) register(link.unit ?? graph.defaultUnit, { linkKey: link.key });
    for (const node of graph.nodes) {
        if (node.total !== undefined) register(graph.defaultUnit, { nodeKey: node.key });
        for (const unit of Object.keys(node.totals ?? {})) register(unit, { nodeKey: node.key });
    }
    if (unitless && units.size) issues.push({ code: 'invalid-unit', message: 'Unitless amounts cannot be mixed with named units. Set defaultUnit or give every amount an explicit unit.' });
    const layoutUnit = graph.defaultUnit ?? units.values().next().value;
    type Edge = { unit: string; rate: number; original: SankeyConversionRate };
    const adjacency = new Map<string, Edge[]>();
    const add = (from: string, edge: Edge) => { const row = adjacency.get(from) ?? []; row.push(edge); adjacency.set(from, row); };
    const path = (from: string, to: string) => {
        const queue = [{ unit: from, factor: 1, rates: [] as SankeyConversionRate[] }], visited = new Set([from]);
        for (let i = 0; i < queue.length; i++) {
            const current = queue[i];
            if (current.unit === to) return current;
            for (const edge of adjacency.get(current.unit) ?? []) if (!visited.has(edge.unit)) {
                visited.add(edge.unit);
                queue.push({ unit: edge.unit, factor: current.factor * edge.rate, rates: [...current.rates, edge.original] });
            }
        }
        return undefined;
    };
    const insert = (rate: SankeyConversionRate, context: Partial<SankeyIssue>) => {
        if (!validUnit(rate.from) || !validUnit(rate.to) || !Number.isFinite(rate.rate) || rate.rate <= 0 || !Number.isFinite(1 / rate.rate)) {
            issues.push({ code: 'invalid-rate', message: 'Conversion rates need named units and a finite positive rate with a finite reciprocal.', ...context });
            return;
        }
        const existing = path(rate.from, rate.to);
        if (existing && !close(existing.factor, rate.rate)) {
            issues.push({ code: 'conflicting-rate', message: `Conflicting conversion from ${rate.from} to ${rate.to}: ${rate.rate} versus ${existing.factor}.`, ...context });
            return;
        }
        add(rate.from, { unit: rate.to, rate: rate.rate, original: rate });
        add(rate.to, { unit: rate.from, rate: 1 / rate.rate, original: rate });
    };
    for (const rate of graph.conversionRates ?? []) insert(rate, {});
    for (const link of graph.links) for (const rate of link.conversionRates ?? []) insert(rate, { linkKey: link.key });
    const conversions = new Map<string, { factor: number; rates: SankeyConversionRate[] }>();
    for (const unit of units) {
        const found = layoutUnit ? path(unit, layoutUnit) : undefined;
        if (!found) issues.push({ code: 'missing-conversion', message: `No conversion from ${unit} to ${layoutUnit}.` });
        else if (!Number.isFinite(found.factor) || found.factor <= 0) issues.push({ code: 'invalid-rate', message: `Conversion from ${unit} to ${layoutUnit} exceeds the finite positive range.` });
        else conversions.set(unit, found);
    }
    return {
        layoutUnit,
        conversion: (unit: string | undefined) => unit === undefined ? { factor: 1, rates: [] } : conversions.get(unit) ?? { factor: NaN, rates: [] },
    };
}
