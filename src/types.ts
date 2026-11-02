import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
/** Identity of one externally selected subject; keys are scoped by kind. */
export type SankeySubject =
  | {
      readonly kind: 'node';
      readonly key: string;
    }
  | {
      readonly kind: 'link';
      readonly key: string;
    };
/** Pointer/touch click or equivalent keyboard activation. */
export type SankeyActivationEvent =
  MouseEvent<Element> | KeyboardEvent<Element>;
export type SankeyPlacement =
  | {
      readonly stage: string;
      readonly edge?: never;
    }
  | {
      readonly edge: 'top' | 'bottom';
      readonly stage?: never;
    };
/** One unit of `from` equals `rate` units of `to`. Rates must be positive. */
export interface SankeyConversionRate {
  readonly from: string;
  readonly to: string;
  readonly rate: number;
}
/** Separate balances, not alternative representations of the same quantity. */
export type SankeyTotals = Readonly<Record<string, number | 'auto'>>;
export interface SankeyUnitTotals {
  /** Undefined only for a legacy unitless graph. */
  readonly unit?: string;
  readonly total: number;
  readonly incoming: number;
  readonly outgoing: number;
  readonly totalSource: 'declared' | 'derived' | 'mixed';
}
export interface SankeyFormattedTotals {
  readonly unit?: string;
  readonly total: string;
  readonly incoming: string;
  readonly outgoing: string;
}
/** Visual crossfade between completed scenes. Geometry is not interpolated. */
export interface SankeyTransition {
  /** Crossfade duration in milliseconds. Default: 280. */
  readonly duration?: number;
  /** CSS animation timing function. Default: 'ease-out'. */
  readonly easing?: string;
}
export interface SankeyQuantity {
  readonly amount: number;
  readonly unit?: string;
}
export interface SankeyNode<Meta = unknown> {
  readonly key: string;
  readonly title: string;
  readonly placement: SankeyPlacement;
  readonly total?: number;
  /** Per-unit totals; omitted units and 'auto' derive from incident links. Cannot combine with total. */
  readonly totals?: SankeyTotals;
  readonly color?: string;
  readonly meta?: Meta;
}
export interface SankeyLink<Meta = unknown> {
  readonly key: string;
  readonly from: string;
  readonly to: string;
  /** Amount leaving the source, in inputUnit. */
  readonly amount: number;
  /** Supply both units for a named-unit transfer; omit both for unitless data. */
  readonly inputUnit?: string;
  readonly outputUnit?: string;
  /** Output units delivered per input unit. Required when the units differ; otherwise defaults to 1. */
  readonly conversionRate?: number;
  readonly color?: string;
  readonly meta?: Meta;
}
export interface SankeyGraph<NodeMeta = unknown, LinkMeta = unknown> {
  readonly defaultUnit?: string;
  /** Reference valuation rates for widths and combined node totals. Independent of each link's transfer rate. */
  readonly conversionRates?: readonly SankeyConversionRate[];
  readonly stages: readonly string[];
  readonly nodes: readonly SankeyNode<NodeMeta>[];
  readonly links: readonly SankeyLink<LinkMeta>[];
}
export interface SankeyNodeFacts<NodeMeta = unknown, LinkMeta = unknown> {
  readonly kind: 'node';
  readonly node: SankeyNode<NodeMeta>;
  readonly total: number;
  readonly incoming: number;
  readonly outgoing: number;
  readonly totalSource: 'declared' | 'derived' | 'mixed';
  /** Unit used by the scalar total/incoming/outgoing and layout. */
  readonly unit?: string;
  readonly totals: readonly SankeyUnitTotals[];
  /** Combined balances in graph.defaultUnit; absent when no default was supplied. */
  readonly converted?: SankeyUnitTotals;
  readonly incomingLinks: readonly SankeyLink<LinkMeta>[];
  readonly outgoingLinks: readonly SankeyLink<LinkMeta>[];
}
export interface SankeyLinkFacts<NodeMeta = unknown, LinkMeta = unknown> {
  readonly kind: 'link';
  readonly link: SankeyLink<LinkMeta>;
  readonly fromNode: SankeyNode<NodeMeta>;
  readonly toNode: SankeyNode<NodeMeta>;
  readonly input: SankeyQuantity;
  readonly output: SankeyQuantity;
  readonly conversionRate: number;
  /** Each endpoint valued in the graph's common layout unit. */
  readonly layoutInputAmount: number;
  readonly layoutOutputAmount: number;
  readonly converted?: {
    readonly unit: string;
    readonly inputAmount: number;
    readonly outputAmount: number;
  };
  /** Graph reference rates used to value the endpoints; not the actual transfer rate. */
  readonly referenceRates: readonly SankeyConversionRate[];
}
export type SankeyAmountContext<I = unknown, T = unknown> = (
  | (SankeyNodeFacts<I, T> & {
      readonly field: 'total' | 'incoming' | 'outgoing';
    })
  | (SankeyLinkFacts<I, T> & {
      readonly field: 'amount' | 'outputAmount';
    })
) & {
  readonly surface: 'label' | 'tooltip' | 'accessible';
  readonly unit?: string;
  readonly isConverted: boolean;
};
export type SankeyPresentation<I = unknown, T = unknown> =
  | (SankeyNodeFacts<I, T> & {
      readonly text: Readonly<{
        total: string;
        incoming: string;
        outgoing: string;
        totals: readonly SankeyFormattedTotals[];
        converted?: SankeyFormattedTotals;
      }>;
    })
  | (SankeyLinkFacts<I, T> & {
      readonly text: Readonly<{
        amount: string;
        outputAmount: string;
        convertedAmount?: string;
        convertedOutputAmount?: string;
        conversionRate?: string;
        referenceRates: readonly string[];
      }>;
    });
/** Measured text box shared by node and link labels. */
export interface SankeyLayoutLabel {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly lines: readonly string[];
}
/** Read-only geometry and facts for one rendered node bar. */
export interface SankeyLayoutNode {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly stage?: string;
  readonly edge?: 'top' | 'bottom';
  readonly color: string;
  /** Layout-unit scalar totals: the same values used for node size. */
  readonly total: number;
  readonly incoming: number;
  readonly outgoing: number;
  /** Layout unit for the scalar totals; absent for legacy unitless graphs. */
  readonly unit?: string;
  readonly label: SankeyLayoutLabel;
}
/** Read-only geometry and facts for one rendered link. */
export interface SankeyLayoutLink {
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly path: string;
  readonly width: number;
  readonly color: string;
  readonly label: SankeyLayoutLabel;
  readonly labelHidden: boolean;
}
/** Stable snapshot of one completed scene, in SVG view-box coordinates. */
export interface SankeyLayout {
  readonly width: number;
  readonly height: number;
  readonly topBand: number;
  readonly bottomBand: number;
  readonly scale: number;
  readonly plot: {
    readonly top: number;
    readonly bottom: number;
    readonly height: number;
  };
  readonly stages: readonly { readonly key: string; readonly x: number }[];
  readonly nodes: ReadonlyMap<string, SankeyLayoutNode>;
  readonly links: ReadonlyMap<string, SankeyLayoutLink>;
  readonly diagnostics: {
    readonly crossings: number;
    readonly obstacleCollisions: number;
  };
}
/** Imperative access to the completed scene and its live SVG element. */
export interface SankeyDiagramHandle {
  /** Latest typed read-only snapshot, or null while no scene is rendered. */
  getLayout(): SankeyLayout | null;
  /** Live SVG element for the current scene, or null while none is rendered. */
  getSvgElement(): SVGSVGElement | null;
  /** Focuses a rendered subject; false without a rendered control. */
  focusSubject(subject: SankeySubject): boolean;
}
export interface SankeyDiagramProps<NodeMeta = unknown, LinkMeta = unknown> {
  readonly graph: SankeyGraph<NodeMeta, LinkMeta>;
  readonly accessibleName: string;
  /** Controlled selection only. Omitted/null means no selection. */
  readonly selection?: SankeySubject | null;
  /** Fires once per activation; never changes selection internally. */
  readonly onNodeClick?: (
    facts: SankeyNodeFacts<NodeMeta, LinkMeta>,
    event: SankeyActivationEvent,
  ) => void;
  /** Fires once per activation; never changes selection internally. */
  readonly onLinkClick?: (
    facts: SankeyLinkFacts<NodeMeta, LinkMeta>,
    event: SankeyActivationEvent,
  ) => void;
  readonly className?: string;
  /** Reports each completed scene once, or the current scene when attached. */
  readonly onLayout?: (layout: SankeyLayout) => void;
  /** Non-interactive SVG content painted above labels, inside a pointer-events: none group. */
  readonly renderOverlay?: (layout: SankeyLayout) => ReactNode;
  /** Preferred height of the central stage region, not the entire component. Default: 336 CSS px. */
  readonly plotHeight?: number;
  /** Crossfade between completed scenes. Default: false (off). Does not interpolate geometry. */
  readonly transition?: false | SankeyTransition;
  /** Minimum displayed ribbon thickness in CSS px. Default: 0 (proportional). Enlarges ports/bars as needed; values stay unchanged. */
  readonly minLinkWidth?: number;
  /** Hatch declared capacity on pure source/sink nodes. Mixed-direction and fully derived nodes are not hatched. Default: false. */
  readonly showHeadroom?: boolean;
  readonly formatAmount?: (
    value: number,
    context: SankeyAmountContext<NodeMeta, LinkMeta>,
  ) => string;
  /** Plain text, one string per line, or null to suppress this visible label. */
  readonly getLabel?: (
    context: SankeyPresentation<NodeMeta, LinkMeta>,
  ) => string | readonly string[] | null;
  /** Non-interactive content; placement, sizing, dismissal and accessibility are owned by the component. */
  readonly renderTooltip?: (
    context: SankeyPresentation<NodeMeta, LinkMeta>,
  ) => ReactNode;
}
export type SankeyIssueCode =
  | 'invalid-key'
  | 'invalid-title'
  | 'duplicate-key'
  | 'unknown-endpoint'
  | 'unknown-stage'
  | 'invalid-placement'
  | 'invalid-number'
  | 'total-too-small'
  | 'backward-stage-link'
  | 'cycle'
  | 'incompatible-placement'
  | 'invalid-unit'
  | 'invalid-rate'
  | 'conflicting-rate'
  | 'missing-conversion'
  | 'incompatible-totals';
export interface SankeyIssue {
  readonly code: SankeyIssueCode;
  readonly message: string;
  readonly nodeKey?: string;
  readonly linkKey?: string;
}
export class SankeyInputError extends Error {
  readonly issues: readonly SankeyIssue[];
  constructor(issues: readonly SankeyIssue[]) {
    super(issues.map((issue) => issue.message).join('\n'));
    this.name = 'SankeyInputError';
    this.issues = issues;
  }
}
