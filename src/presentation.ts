import {
  SankeyInputError,
  type SankeyAmountContext,
  type SankeyDiagramProps,
  type SankeyInspection,
  type SankeySubject,
  type SankeyPresentation,
  type SankeyUnitTotals,
} from './types.js';
import type { ResolvedGraph } from './model.js';
/** Resolved crossfade timing; null disables the effect. */
export type SankeyTransitionTiming = {
  readonly duration: number;
  readonly easing: string;
};
/** Normalize the public transition prop and reject unusable durations. */
export function transitionTiming(
  transition: SankeyDiagramProps['transition'],
): SankeyTransitionTiming | null {
  if (!transition) return null;
  const duration = transition.duration ?? 280;
  if (!Number.isFinite(duration) || duration < 0 || duration > 10_000)
    throw new SankeyInputError([
      {
        code: 'invalid-number',
        message:
          'transition.duration must be finite, between 0 and 10,000 milliseconds.',
      },
    ]);
  return { duration, easing: transition.easing ?? 'ease-out' };
}
function decodeAttributeReferences(value: string) {
  return value
    .replace(/&quot;|&#0*34;|&#x0*22;/gi, '"')
    .replace(/&apos;|&#0*39;|&#x0*27;/gi, "'")
    .replace(/&#0*35;|&#x0*23;/gi, '#')
    .replace(/&amp;/gi, '&');
}
function scopeHashReference(value: string, prefix: string) {
  const match = /^(?:#|&#0*35;|&#x0*23;)/i.exec(value);
  return match ? `#${prefix}${value.slice(match[0].length)}` : value;
}
function scopeGhostAttribute(name: string, value: string, prefix: string) {
  const lower = name.toLowerCase();
  return lower === 'id'
    ? `${prefix}${value}`
    : lower === 'href' || lower === 'xlink:href'
      ? scopeHashReference(value, prefix)
      : scopeUrlReferences(value, prefix);
}
function scopeUrlReferences(value: string, prefix: string) {
  return value.replace(/url\(([^)]*)\)/gi, (token, body: string) => {
    const decoded = decodeAttributeReferences(body).trim(),
      quote =
        decoded.startsWith('"') || decoded.startsWith("'") ? decoded[0] : '',
      inner = quote && decoded.endsWith(quote) ? decoded.slice(1, -1) : decoded;
    return inner.startsWith('#') ? `url(#${prefix}${inner.slice(1)})` : token;
  });
}
function scopeGhostMarkupWithDom(markup: string, prefix: string) {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${markup}</svg>`,
    'text/html',
  );
  const root = doc.body.querySelector('svg');
  if (!root) return null;
  for (const element of root.querySelectorAll('*')) {
    const id = element.getAttribute('id');
    if (id) element.setAttribute('id', `${prefix}${id}`);
    element.removeAttribute('tabindex');
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name === 'id' || name === 'tabindex') continue;
      attribute.value = scopeGhostAttribute(name, attribute.value, prefix);
    }
  }
  return root.innerHTML;
}
function tagEnd(markup: string, start: number) {
  let quote = '';
  for (let index = start + 1; index < markup.length; index += 1) {
    const char = markup[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return index;
  }
  return -1;
}
function scopeGhostTag(tag: string, prefix: string) {
  const name = /^<\s*[^\s/>]+/.exec(tag)?.[0];
  if (!name || /^<\s*[!/?]/.test(tag)) return tag;
  let result = name,
    index = name.length;
  while (index < tag.length) {
    const attributeStart = index;
    while (index < tag.length && /\s/.test(tag[index])) index += 1;
    if (index >= tag.length) {
      result += tag.slice(attributeStart);
      break;
    }
    if (tag[index] === '>' || (tag[index] === '/' && tag[index + 1] === '>')) {
      result += tag.slice(attributeStart);
      break;
    }
    const nameStart = index;
    while (index < tag.length && !/[\s=/>]/.test(tag[index])) index += 1;
    const attributeName = tag.slice(nameStart, index);
    if (!attributeName) {
      result += tag.slice(attributeStart);
      break;
    }
    const beforeEqualsStart = index;
    while (index < tag.length && /\s/.test(tag[index])) index += 1;
    const beforeEquals = tag.slice(beforeEqualsStart, index);
    let equals = '',
      quote = '',
      value = '';
    if (tag[index] === '=') {
      index += 1;
      const afterEqualsStart = index;
      while (index < tag.length && /\s/.test(tag[index])) index += 1;
      equals = '=' + tag.slice(afterEqualsStart, index);
      if (tag[index] === '"' || tag[index] === "'") {
        quote = tag[index];
        index += 1;
        const valueStart = index;
        while (index < tag.length && tag[index] !== quote) index += 1;
        value = tag.slice(valueStart, index);
        if (tag[index] === quote) index += 1;
      } else {
        const valueStart = index;
        while (index < tag.length && !/[\s>]/.test(tag[index])) index += 1;
        value = tag.slice(valueStart, index);
      }
    }
    const lower = attributeName.toLowerCase();
    if (lower === 'tabindex') continue;
    value = scopeGhostAttribute(lower, value, prefix);
    result +=
      tag.slice(attributeStart, nameStart) +
      attributeName +
      beforeEquals +
      equals +
      quote +
      value +
      quote;
  }
  return result;
}
/**
 * Conservative tag scanner for environments without DOMParser. It skips text
 * nodes but does not interpret comments, CDATA or arbitrary CSS escapes.
 */
export function scopeGhostMarkupFallback(markup: string, prefix: string) {
  let result = '',
    index = 0;
  while (index < markup.length) {
    const start = markup.indexOf('<', index);
    if (start < 0) {
      result += markup.slice(index);
      break;
    }
    result += markup.slice(index, start);
    const end = tagEnd(markup, start);
    if (end < 0) {
      result += markup.slice(start);
      break;
    }
    result += scopeGhostTag(markup.slice(start, end + 1), prefix);
    index = end + 1;
  }
  return result;
}
/** Scope ids, hrefs and URL references in a temporary ghost SVG copy. */
export function scopeGhostMarkup(markup: string, prefix: string) {
  if (typeof DOMParser !== 'undefined') {
    try {
      const scoped = scopeGhostMarkupWithDom(markup, prefix);
      if (scoped !== null) return scoped;
    } catch {
      // Fall back to the markup scanner when SVG parsing is unavailable.
    }
  }
  return scopeGhostMarkupFallback(markup, prefix);
}
const numeric = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 15,
});
const fallbackAmount = (value: number, unit: string | undefined) =>
  `${numeric.format(value)}${unit ? ` ${unit}` : ''}`;
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
          : fallbackAmount(row[field], row.unit);
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
      : fallbackAmount(amount, unit);
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
export const same = (
  a: SankeySubject | null | undefined,
  b: SankeySubject | null | undefined,
) => a != null && b != null && a.kind === b.kind && a.key === b.key;
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
