import type { AmountContext, FlowDiagramProps, FlowSubject, Presentation } from './types.js';
import type { ResolvedGraph } from './model.js';
const numeric = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 });
export function presentation<I, T>(model: ResolvedGraph<I, T>, subject: FlowSubject, format: FlowDiagramProps<I, T>['formatAmount'], surface: AmountContext['surface']): Presentation<I, T> {
    const facts = subject.kind === 'item' ? model.items.get(subject.key)! : model.transfers.get(subject.key)!;
    if (facts.kind === 'item') {
        const number = (field: 'total' | 'incoming' | 'outgoing') => format ? format(facts[field], { ...facts, field, surface }) : numeric.format(facts[field]);
        return { ...facts, text: { total: number('total'), incoming: number('incoming'), outgoing: number('outgoing') } };
    }
    return { ...facts, text: { amount: format ? format(facts.transfer.amount, { ...facts, field: 'amount', surface }) : numeric.format(facts.transfer.amount) } };
}
export function subjectName(view: Presentation) {
    return view.kind === 'item' ? `${view.item.title}. Total ${view.text.total}. Incoming ${view.text.incoming}. Outgoing ${view.text.outgoing}.` : `${view.fromItem.title} to ${view.toItem.title}. Amount ${view.text.amount}.`;
}
export const identity = (s: FlowSubject) => JSON.stringify([s.kind, s.key]);
export const same = (a: FlowSubject | null, b: FlowSubject | null) => a?.kind === b?.kind && a?.key === b?.key;
