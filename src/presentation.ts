import type { SankeyAmountContext, SankeyDiagramProps, SankeySubject, SankeyPresentation } from './types.js';
import type { ResolvedGraph } from './model.js';
const numeric = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 });
export function presentation<I, T>(model: ResolvedGraph<I, T>, subject: SankeySubject, format: SankeyDiagramProps<I, T>['formatAmount'], surface: SankeyAmountContext['surface']): SankeyPresentation<I, T> {
    const facts = subject.kind === 'node' ? model.nodes.get(subject.key)! : model.links.get(subject.key)!;
    if (facts.kind === 'node') {
        const number = (field: 'total' | 'incoming' | 'outgoing') => format ? format(facts[field], { ...facts, field, surface }) : numeric.format(facts[field]);
        return { ...facts, text: { total: number('total'), incoming: number('incoming'), outgoing: number('outgoing') } };
    }
    return { ...facts, text: { amount: format ? format(facts.link.amount, { ...facts, field: 'amount', surface }) : numeric.format(facts.link.amount) } };
}
export function subjectName(view: SankeyPresentation) {
    return view.kind === 'node' ? `${view.node.title}. Total ${view.text.total}. Incoming ${view.text.incoming}. Outgoing ${view.text.outgoing}.` : `${view.fromNode.title} to ${view.toNode.title}. Amount ${view.text.amount}.`;
}
export const identity = (s: SankeySubject) => JSON.stringify([s.kind, s.key]);
export const same = (a: SankeySubject | null, b: SankeySubject | null) => a?.kind === b?.kind && a?.key === b?.key;
