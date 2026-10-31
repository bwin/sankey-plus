import type { SankeyAmountContext, SankeyDiagramProps, SankeySubject, SankeyPresentation, SankeyUnitTotals } from './types.js';
import type { ResolvedGraph } from './model.js';
const numeric = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 });
export function presentation<I, T>(model: ResolvedGraph<I, T>, subject: SankeySubject, format: SankeyDiagramProps<I, T>['formatAmount'], surface: SankeyAmountContext['surface']): SankeyPresentation<I, T> {
    const facts = subject.kind === 'node' ? model.nodes.get(subject.key)! : model.links.get(subject.key)!;
    if (facts.kind === 'node') {
        const formatted = (row: SankeyUnitTotals, isConverted: boolean) => {
            const number = (field: 'total' | 'incoming' | 'outgoing') => format ? format(row[field], { ...facts, field, surface, unit: row.unit, isConverted }) : `${numeric.format(row[field])}${row.unit ? ` ${row.unit}` : ''}`;
            return { unit: row.unit, total: number('total'), incoming: number('incoming'), outgoing: number('outgoing') };
        };
        return { ...facts, text: { ...formatted(facts, !!facts.converted), totals: facts.totals.map(row => formatted(row, false)), converted: facts.converted ? formatted(facts.converted, true) : undefined } };
    }
    const number = (amount: number, unit: string | undefined, isConverted: boolean) => format ? format(amount, { ...facts, field: 'amount', surface, unit, isConverted }) : `${numeric.format(amount)}${unit ? ` ${unit}` : ''}`;
    return { ...facts, text: {
        amount: number(facts.link.amount, facts.unit, false),
        convertedAmount: facts.converted ? number(facts.converted.amount, facts.converted.unit, true) : undefined,
        conversionRates: facts.conversionRates.map(rate => `1 ${rate.from} = ${rate.rate} ${rate.to}`),
    } };
}
export function subjectName(view: SankeyPresentation) {
    if (view.kind === 'node') return `${view.node.title}. ${view.text.totals.map(row => `Total ${row.total}. Incoming ${row.incoming}. Outgoing ${row.outgoing}.`).join(' ')}${showConverted(view) ? ` Combined total ${view.text.converted!.total}.` : ''}`;
    return `${view.fromNode.title} to ${view.toNode.title}. Amount ${view.text.amount}.${view.converted && view.converted.unit !== view.unit ? ` Converted ${view.text.convertedAmount}.` : ''}${view.text.conversionRates.length ? ` Conversion rates: ${view.text.conversionRates.join('; ')}.` : ''}`;
}
export function showConverted(view: Extract<SankeyPresentation, { kind: 'node' }>) {
    return !!view.converted && (view.totals.length > 1 || view.totals[0]?.unit !== view.converted.unit);
}
export function defaultLabel(view: SankeyPresentation): string | readonly string[] {
    if (view.kind === 'link') return view.converted && view.converted.unit !== view.unit ? [view.text.amount, `= ${view.text.convertedAmount}`] : view.text.amount;
    if (view.totals.length === 1 && view.totals[0].unit === undefined) return view.node.title;
    return [view.node.title, ...view.text.totals.map(row => row.total), ...(showConverted(view) ? [`Σ ${view.text.converted!.total}`] : [])];
}
export const identity = (s: SankeySubject) => JSON.stringify([s.kind, s.key]);
export const same = (a: SankeySubject | null, b: SankeySubject | null) => a?.kind === b?.kind && a?.key === b?.key;
