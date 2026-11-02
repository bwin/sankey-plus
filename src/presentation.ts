import type {
  SankeyAmountContext,
  SankeyDiagramProps,
  SankeyInspection,
  SankeySubject,
  SankeyPresentation,
  SankeyUnitTotals,
} from './types.js';
import type { ResolvedGraph } from './model.js';
const numeric = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 15,
});
export function presentation<I, T>(
  model: ResolvedGraph<I, T>,
  subject: SankeySubject,
  format: SankeyDiagramProps<I, T>['formatAmount'],
  surface: SankeyAmountContext['surface'],
): SankeyPresentation<I, T> {
  const facts =
    subject.kind === 'node'
      ? model.nodes.get(subject.key)!
      : model.links.get(subject.key)!;
  if (facts.kind === 'node') {
    const formatted = (row: SankeyUnitTotals, isConverted: boolean) => {
      const number = (field: 'total' | 'incoming' | 'outgoing') =>
        format
          ? format(row[field], {
              ...facts,
              field,
              surface,
              unit: row.unit,
              isConverted,
            })
          : `${numeric.format(row[field])}${row.unit ? ` ${row.unit}` : ''}`;
      return {
        unit: row.unit,
        total: number('total'),
        incoming: number('incoming'),
        outgoing: number('outgoing'),
      };
    };
    return {
      ...facts,
      text: {
        ...formatted(facts, !!facts.converted),
        totals: facts.totals.map((row) => formatted(row, false)),
        converted: facts.converted
          ? formatted(facts.converted, true)
          : undefined,
      },
    };
  }
  const number = (
    amount: number,
    unit: string | undefined,
    isConverted: boolean,
    field: 'amount' | 'outputAmount',
  ) =>
    format
      ? format(amount, { ...facts, field, surface, unit, isConverted })
      : `${numeric.format(amount)}${unit ? ` ${unit}` : ''}`;
  return {
    ...facts,
    text: {
      amount: number(facts.input.amount, facts.input.unit, false, 'amount'),
      outputAmount: number(
        facts.output.amount,
        facts.output.unit,
        false,
        'outputAmount',
      ),
      convertedAmount: facts.converted
        ? number(
            facts.converted.inputAmount,
            facts.converted.unit,
            true,
            'amount',
          )
        : undefined,
      convertedOutputAmount: facts.converted
        ? number(
            facts.converted.outputAmount,
            facts.converted.unit,
            true,
            'outputAmount',
          )
        : undefined,
      conversionRate:
        facts.link.conversionRate !== undefined ||
        facts.input.unit !== facts.output.unit
          ? `1${facts.input.unit ? ` ${facts.input.unit}` : ''} → ${facts.conversionRate}${facts.output.unit ? ` ${facts.output.unit}` : ''}`
          : undefined,
      referenceRates: facts.referenceRates.map(
        (rate) => `1 ${rate.from} = ${rate.rate} ${rate.to}`,
      ),
    },
  };
}
export function subjectName(view: SankeyPresentation) {
  if (view.kind === 'node')
    return `${view.node.title}. ${view.text.totals.map((row) => `Total ${row.total}. Incoming ${row.incoming}. Outgoing ${row.outgoing}.`).join(' ')}${showConverted(view) ? ` Combined total ${view.text.converted!.total}.` : ''}`;
  return `${view.fromNode.title} to ${view.toNode.title}. Input ${view.text.amount}. Output ${view.text.outputAmount}.${view.text.conversionRate ? ` Transfer rate: ${view.text.conversionRate}.` : ''}${view.converted ? ` Valued input ${view.text.convertedAmount}. Valued output ${view.text.convertedOutputAmount}.` : ''}`;
}
export function showConverted(
  view: Extract<SankeyPresentation, { kind: 'node' }>,
) {
  return (
    !!view.converted &&
    (view.totals.length > 1 || view.totals[0]?.unit !== view.converted.unit)
  );
}
export function defaultLabel(
  view: SankeyPresentation,
): string | readonly string[] {
  if (view.kind === 'link')
    return view.input.unit !== view.output.unit ||
      view.input.amount !== view.output.amount
      ? [view.text.amount, `→ ${view.text.outputAmount}`]
      : view.text.amount;
  if (view.totals.length === 1 && view.totals[0].unit === undefined)
    return view.node.title;
  return [
    view.node.title,
    ...view.text.totals.map((row) => row.total),
    ...(showConverted(view) ? [`Σ ${view.text.converted!.total}`] : []),
  ];
}
export const identity = (s: SankeySubject) => JSON.stringify([s.kind, s.key]);
export const same = (a: SankeySubject | null, b: SankeySubject | null) =>
  a?.kind === b?.kind && a?.key === b?.key;
/** Resolve replay-on-attach and identity-change dedupe for one inspection report. */
export function inspectionReport(
  reported: string | null,
  callbackPresent: boolean,
  inspection: SankeyInspection | null,
) {
  if (!callbackPresent)
    return { reported: null, inspection: null, changed: false };
  const key = inspection
    ? `${identity(inspection.subject)}:${inspection.modality}`
    : null;
  return key === reported
    ? { reported, inspection, changed: false }
    : { reported: key, inspection, changed: true };
}
export const anchorMoved = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= 1;
/** Keep a tooltip beside its anchor, flipping it near an edge and then clamping it inside the viewport. */
export function tooltipPosition(
  anchor: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const x = Math.max(
    8,
    Math.min(
      viewport.width - size.width - 8,
      anchor.x + 16 + size.width > viewport.width - 8
        ? anchor.x - size.width - 16
        : anchor.x + 16,
    ),
  );
  const y = Math.max(
    8,
    Math.min(
      viewport.height - size.height - 8,
      anchor.y + 16 + size.height > viewport.height - 8
        ? anchor.y - size.height - 16
        : anchor.y + 16,
    ),
  );
  return { x, y };
}
