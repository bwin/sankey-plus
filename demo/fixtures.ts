import type {
  SankeyAmountContext,
  SankeyDiagramProps,
  SankeyGraph,
} from '../src/index.js';
import full from './feature-demo.json';
import distributionData from './distribution.json';
import stagesData from './stages.json';
import fanInData from './fan-in.json';
import parallelData from './parallel-links.json';
import tradeData from './trade.json';
import currenciesData from './currencies.json';
import wideRangeData from './wide-range.json';
import { renderOverlay } from './layout-overlay.js';
import { stressGraph } from '../fixtures/stress.js';
export const fullGraph = full as SankeyGraph;
export const distribution = distributionData as SankeyGraph;
const tradeAmount = (value: number) => `$${value.toLocaleString('en-US')} bn`;
const formatAmount = (value: number, context: SankeyAmountContext) => {
  const formatted = `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${context.unit ?? 'units'}`;
  if (
    context.kind !== 'link' ||
    context.isConverted ||
    (context.field !== 'amount' && context.field !== 'outputAmount')
  )
    return formatted;
  const isInput = context.field === 'amount';
  const share = isInput ? context.fromShare : context.toShare;
  return `${formatted} (${Math.round(share * 100)}% of ${isInput ? 'source' : 'target'})`;
};
export function fanOut(
  edge: 'top' | 'bottom' = 'bottom',
  count = 3,
): SankeyGraph {
  return {
    stages: ['process'],
    nodes: [
      {
        key: 'process',
        title: 'Process',
        total: count * 100,
        placement: { stage: 'process' },
        color: '#298c98',
      },
      ...Array.from({ length: count }, (_, i) => ({
        key: `dest-${i}`,
        title: `Destination ${i + 1}`,
        placement: { edge },
        color: ['#688670', '#a88c48', '#8170b4'][i % 3],
      })),
    ],
    links: Array.from({ length: count }, (_, i) => ({
      key: `branch-${i}`,
      from: 'process',
      to: `dest-${i}`,
      amount: 100,
    })),
  };
}
export const simple: SankeyGraph = {
  stages: ['input', 'output'],
  nodes: [
    {
      key: 'available',
      title: 'Available',
      total: 1000,
      placement: { stage: 'input' },
    },
    {
      key: 'allocated',
      title: 'Allocated',
      placement: { stage: 'output' },
    },
  ],
  links: [
    { key: 'allocation', from: 'available', to: 'allocated', amount: 500 },
  ],
};
export const examples: {
  key: string;
  name: string;
  description: string;
  graph: SankeyGraph;
  formatAmount?: SankeyDiagramProps['formatAmount'];
  formatQuantity?: (value: number, context?: { unit?: string }) => string;
  getLabel?: SankeyDiagramProps['getLabel'];
  plotHeight?: number;
  minLinkWidth?: number;
  showHeadroom?: boolean;
  altGraph?: SankeyGraph;
  transition?: SankeyDiagramProps['transition'];
  overlay?: SankeyDiagramProps['renderOverlay'];
}[] = [
  {
    key: 'distribution',
    name: 'Distribution',
    description:
      'Two inputs, shared processing and partial totals, with a supplement above and deferred flow below.',
    graph: distribution,
  },
  {
    key: 'inspection',
    name: 'Inspection bridge',
    description:
      'Pass an external highlight to the Distribution graph and watch pointer, keyboard and touch inspection report through the callback. Selection stays independently controlled.',
    graph: distribution,
  },
  {
    key: 'stages',
    name: 'Stages',
    description:
      'Collect → Prepare → Deliver. Node order keeps Prepare B above Prepare A; the gold 100-unit link skips Prepare without moving either column.',
    graph: stagesData,
  },
  {
    key: 'shares',
    name: 'Shares',
    description:
      'Link labels append the source share; tooltips show both source and target shares. 350 is 35% of the 1,000 at Input A and 39% of the 900 at Process A. Shares use the total at each endpoint in the link unit, not the layout unit.',
    graph: distribution,
    formatAmount,
  },
  {
    key: 'trade',
    name: 'World trade',
    description:
      'Countries trade four goods, with reserves released above and stock held for next year below. Illustrative annual values in USD billions; not actual trade statistics.',
    graph: tradeData as SankeyGraph,
    plotHeight: 420,
    formatAmount: tradeAmount,
    formatQuantity: tradeAmount,
    getLabel: (view) => {
      if (view.kind === 'link') return view.text.amount;
      const { stage, edge } = view.node.placement;
      const role =
        edge === 'top'
          ? 'released'
          : edge === 'bottom'
            ? 'stored'
            : stage === 'global-goods'
              ? 'available'
              : stage === 'exporters'
                ? 'exports'
                : 'imports';
      return [view.node.title, `${view.text.total} ${role}`];
    },
  },
  {
    key: 'currencies',
    name: 'Currencies',
    description:
      'Actual input/output currencies, with every width valued in USD. GBP → COP preserves value; the USD → COP payout narrows by 2.5% against its reference rate. All rates are illustrative.',
    graph: currenciesData as SankeyGraph,
    plotHeight: 440,
  },
  {
    key: 'layout',
    name: 'Layout overlay',
    description:
      'The Distribution graph with annotations from the public layout snapshot: stage headings, a rounded callout around Process A, a diagnostics readout and SVG download.',
    graph: distribution,
    overlay: renderOverlay,
  },
  {
    key: 'wide-range',
    name: 'Wide range',
    description:
      'Transfers from 200 to 500,000 units. Small flows have a minimum visible thickness of 4px, so their widths are not strictly proportional. Labels and tooltips show the exact amounts.',
    graph: wideRangeData as SankeyGraph,
    plotHeight: 440,
    minLinkWidth: 4,
  },
  {
    key: 'transitions',
    name: 'Transitions',
    description:
      'Two allocation states for the same nodes. Swap data to crossfade the completed 500- and 750-unit scenes; geometry is not interpolated.',
    graph: simple,
    altGraph: {
      ...simple,
      links: [
        { key: 'allocation', from: 'available', to: 'allocated', amount: 750 },
      ],
    },
    transition: { duration: 320 },
  },
  {
    key: 'complete',
    name: 'Four-sided flow',
    description:
      'Every direction, independent totals and multiple nodes on both edges.',
    graph: fullGraph,
  },
  {
    key: 'fanout',
    name: 'Fan-out',
    description:
      'Ordered turns keep links apart. Narrow the canvas to see the destinations wrap.',
    graph: fanOut(),
  },
  {
    key: 'fanin',
    name: 'Fan-in',
    description:
      'Three unequal inputs share one bottom destination. Reversed arrival order keeps the ribbons separate; the total is derived as 1,000.',
    graph: fanInData as SankeyGraph,
  },
  {
    key: 'top',
    name: 'Top fan-out',
    description: 'The same routing rule, reflected above the main sequence.',
    graph: fanOut('top'),
  },
  {
    key: 'crowded',
    name: 'Many edge nodes',
    description:
      'Twelve destinations share the bottom edge and wrap into additional rows.',
    graph: fanOut('bottom', 12),
  },
  {
    key: 'partial',
    name: 'Partial allocation',
    description:
      'An available total of 1,000 with only 500 transferred. No extra edge margins.',
    graph: simple,
  },
  {
    key: 'headroom',
    name: 'Headroom',
    description:
      'The same 1,000-unit available balance with only 500 transferred. The hatch marks 500 units of unallocated source capacity.',
    graph: simple,
    showHeadroom: true,
    getLabel: (view) => {
      if (view.kind === 'link') return view.text.amount;
      const headroom = Math.max(
        0,
        view.total - Math.max(view.incoming, view.outgoing),
      );
      const share =
        view.total > 0 ? Math.round((headroom / view.total) * 100) : 0;
      return [
        view.node.title,
        view.text.total,
        headroom > 0 ? `${share}% headroom` : 'Fully allocated',
      ];
    },
  },
  {
    key: 'parallel',
    name: 'Parallel links',
    description:
      'Three links share the same endpoints but keep distinct keys, colors and amounts. Inspect or select each independently.',
    graph: parallelData,
  },
  {
    key: 'stress',
    name: 'Stress test',
    description:
      '100 nodes and 300 links across four stages. The same deterministic graph used by npm run stress; crossings are expected in this dense case.',
    graph: stressGraph(),
  },
  {
    key: 'empty',
    name: 'Empty',
    description: 'A quiet empty state, without unused edge bands.',
    graph: { stages: [], nodes: [], links: [] },
  },
];
