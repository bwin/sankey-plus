import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
/** Identity of one externally selected subject; keys are scoped by kind. */
export type SankeySubject = {
    readonly kind: 'node';
    readonly key: string;
} | {
    readonly kind: 'link';
    readonly key: string;
};
/** Pointer/touch click or equivalent keyboard activation. */
export type SankeyActivationEvent = MouseEvent<Element> | KeyboardEvent<Element>;
export type SankeyPlacement = {
    readonly stage: string;
    readonly edge?: never;
} | {
    readonly edge: 'top' | 'bottom';
    readonly stage?: never;
};
export interface SankeyNode<Meta = unknown> {
    readonly key: string;
    readonly title: string;
    readonly placement: SankeyPlacement;
    readonly total?: number;
    readonly color?: string;
    readonly meta?: Meta;
}
export interface SankeyLink<Meta = unknown> {
    readonly key: string;
    readonly from: string;
    readonly to: string;
    readonly amount: number;
    readonly color?: string;
    readonly meta?: Meta;
}
export interface SankeyGraph<NodeMeta = unknown, LinkMeta = unknown> {
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
    readonly totalSource: 'declared' | 'derived';
    readonly incomingLinks: readonly SankeyLink<LinkMeta>[];
    readonly outgoingLinks: readonly SankeyLink<LinkMeta>[];
}
export interface SankeyLinkFacts<NodeMeta = unknown, LinkMeta = unknown> {
    readonly kind: 'link';
    readonly link: SankeyLink<LinkMeta>;
    readonly fromNode: SankeyNode<NodeMeta>;
    readonly toNode: SankeyNode<NodeMeta>;
}
export type SankeyAmountContext<I = unknown, T = unknown> = ((SankeyNodeFacts<I, T> & {
    readonly field: 'total' | 'incoming' | 'outgoing';
}) | (SankeyLinkFacts<I, T> & {
    readonly field: 'amount';
})) & {
    readonly surface: 'label' | 'tooltip' | 'accessible';
};
export type SankeyPresentation<I = unknown, T = unknown> = (SankeyNodeFacts<I, T> & {
    readonly text: Readonly<{
        total: string;
        incoming: string;
        outgoing: string;
    }>;
}) | (SankeyLinkFacts<I, T> & {
    readonly text: Readonly<{
        amount: string;
    }>;
});
export interface SankeyDiagramProps<NodeMeta = unknown, LinkMeta = unknown> {
    readonly graph: SankeyGraph<NodeMeta, LinkMeta>;
    readonly accessibleName: string;
    /** Controlled selection only. Omitted/null means no selection. */
    readonly selection?: SankeySubject | null;
    /** Fires once per activation; never changes selection internally. */
    readonly onNodeClick?: (facts: SankeyNodeFacts<NodeMeta, LinkMeta>, event: SankeyActivationEvent) => void;
    /** Fires once per activation; never changes selection internally. */
    readonly onLinkClick?: (facts: SankeyLinkFacts<NodeMeta, LinkMeta>, event: SankeyActivationEvent) => void;
    readonly className?: string;
    /** Preferred height of the central stage region, not the entire component. Default: 336 CSS px. */
    readonly plotHeight?: number;
    readonly formatAmount?: (value: number, context: SankeyAmountContext<NodeMeta, LinkMeta>) => string;
    /** Plain text, up to two lines, or null to suppress this visible label. */
    readonly getLabel?: (context: SankeyPresentation<NodeMeta, LinkMeta>) => string | readonly string[] | null;
    /** Non-interactive content; placement, sizing, dismissal and accessibility are owned by the component. */
    readonly renderTooltip?: (context: SankeyPresentation<NodeMeta, LinkMeta>) => ReactNode;
}
export type SankeyIssueCode = 'invalid-key' | 'invalid-title' | 'duplicate-key' | 'unknown-endpoint' | 'unknown-stage' | 'invalid-placement' | 'invalid-number' | 'total-too-small' | 'backward-stage-link' | 'cycle' | 'incompatible-placement';
export interface SankeyIssue {
    readonly code: SankeyIssueCode;
    readonly message: string;
    readonly nodeKey?: string;
    readonly linkKey?: string;
}
export class SankeyInputError extends Error {
    readonly issues: readonly SankeyIssue[];
    constructor(issues: readonly SankeyIssue[]) {
        super(issues.map(issue => issue.message).join('\n'));
        this.name = 'SankeyInputError';
        this.issues = issues;
    }
}
