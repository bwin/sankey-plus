import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
/** Identity of one externally selected subject; keys are scoped by kind. */
export type FlowSubject = {
    readonly kind: 'item';
    readonly key: string;
} | {
    readonly kind: 'transfer';
    readonly key: string;
};
/** Pointer/touch click or equivalent keyboard activation. */
export type FlowActivationEvent = MouseEvent<Element> | KeyboardEvent<Element>;
export type FlowPlacement = {
    readonly stage: string;
    readonly edge?: never;
} | {
    readonly edge: 'top' | 'bottom';
    readonly stage?: never;
};
export interface FlowItem<Meta = unknown> {
    readonly key: string;
    readonly title: string;
    readonly placement: FlowPlacement;
    readonly total?: number;
    readonly color?: string;
    readonly meta?: Meta;
}
export interface Transfer<Meta = unknown> {
    readonly key: string;
    readonly from: string;
    readonly to: string;
    readonly amount: number;
    readonly color?: string;
    readonly meta?: Meta;
}
export interface FlowGraph<ItemMeta = unknown, TransferMeta = unknown> {
    readonly stages: readonly string[];
    readonly items: readonly FlowItem<ItemMeta>[];
    readonly transfers: readonly Transfer<TransferMeta>[];
}
export interface ItemFacts<ItemMeta = unknown, TransferMeta = unknown> {
    readonly kind: 'item';
    readonly item: FlowItem<ItemMeta>;
    readonly total: number;
    readonly incoming: number;
    readonly outgoing: number;
    readonly totalSource: 'declared' | 'derived';
    readonly incomingTransfers: readonly Transfer<TransferMeta>[];
    readonly outgoingTransfers: readonly Transfer<TransferMeta>[];
}
export interface TransferFacts<ItemMeta = unknown, TransferMeta = unknown> {
    readonly kind: 'transfer';
    readonly transfer: Transfer<TransferMeta>;
    readonly fromItem: FlowItem<ItemMeta>;
    readonly toItem: FlowItem<ItemMeta>;
}
export type AmountContext<I = unknown, T = unknown> = ((ItemFacts<I, T> & {
    readonly field: 'total' | 'incoming' | 'outgoing';
}) | (TransferFacts<I, T> & {
    readonly field: 'amount';
})) & {
    readonly surface: 'label' | 'tooltip' | 'accessible';
};
export type Presentation<I = unknown, T = unknown> = (ItemFacts<I, T> & {
    readonly text: Readonly<{
        total: string;
        incoming: string;
        outgoing: string;
    }>;
}) | (TransferFacts<I, T> & {
    readonly text: Readonly<{
        amount: string;
    }>;
});
export interface FlowDiagramProps<ItemMeta = unknown, TransferMeta = unknown> {
    readonly graph: FlowGraph<ItemMeta, TransferMeta>;
    readonly accessibleName: string;
    /** Controlled selection only. Omitted/null means no selection. */
    readonly selection?: FlowSubject | null;
    /** Fires once per activation; never changes selection internally. */
    readonly onItemClick?: (facts: ItemFacts<ItemMeta, TransferMeta>, event: FlowActivationEvent) => void;
    /** Fires once per activation; never changes selection internally. */
    readonly onTransferClick?: (facts: TransferFacts<ItemMeta, TransferMeta>, event: FlowActivationEvent) => void;
    readonly className?: string;
    /** Preferred height of the central stage region, not the entire component. Default: 336 CSS px. */
    readonly plotHeight?: number;
    readonly formatAmount?: (value: number, context: AmountContext<ItemMeta, TransferMeta>) => string;
    /** Plain text, up to two lines, or null to suppress this visible label. */
    readonly getLabel?: (context: Presentation<ItemMeta, TransferMeta>) => string | readonly string[] | null;
    /** Non-interactive content; placement, sizing, dismissal and accessibility are owned by the component. */
    readonly renderTooltip?: (context: Presentation<ItemMeta, TransferMeta>) => ReactNode;
}
export type FlowIssueCode = 'invalid-key' | 'invalid-title' | 'duplicate-key' | 'unknown-endpoint' | 'unknown-stage' | 'invalid-placement' | 'invalid-number' | 'total-too-small' | 'backward-stage-transfer' | 'cycle' | 'incompatible-placement';
export interface FlowIssue {
    readonly code: FlowIssueCode;
    readonly message: string;
    readonly itemKey?: string;
    readonly transferKey?: string;
}
export class FlowInputError extends Error {
    readonly issues: readonly FlowIssue[];
    constructor(issues: readonly FlowIssue[]) {
        super(issues.map(issue => issue.message).join('\n'));
        this.name = 'FlowInputError';
        this.issues = issues;
    }
}
