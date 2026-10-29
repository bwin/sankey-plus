# Flow diagram

A standalone React + TypeScript component for quantitative flows across ordered stages, with full nodes above and below the main sequence. SVG drawing, layout, routing, hit testing and interactions are implemented in this package. Runtime dependencies are React and React DOM only.

The default demo includes the supplied transaction, statement and invoice data, including Client Balance above and Unallocated, Unpaid, Written Off and Bad Debt below. The component has no business-domain logic.

## Open the demo

The ZIP includes the compiled demo. With Node.js installed, preview it without installing packages:

```sh
node scripts/serve.mjs
```

Open **http://127.0.0.1:5178/**. The server binds only to the local machine. Set `PORT` to use another port.

All seven examples are directly available as tabs. Left/Right arrows switch tabs; Home/End select the first/last example. The tabs wrap on narrow screens.

To develop from source:

```sh
npm ci
npm run dev
```

The development command builds once and starts the server. After editing, run `npm run build` in another terminal and refresh the browser. There is no hot reload or file watcher.

```sh
npm run typecheck
npm test
npm run build
```

Node 22 was used for verification. React 19.2 was used for the demo; the library declares React/React DOM 18.2 or later as peer dependencies.

The working project has a local Git repository. Commit `23293a1` preserves the implementation before the demo-tab and interaction review; later commits record the changes separately. Use `git log --oneline` to inspect the history. Dependencies and generated builds are ignored. The downloadable ZIP contains source and compiled output, but not the local `.git` history.

## Integration

Either copy `src/` into your application and import its `index.ts`, or install this directory as a local package:

```sh
npm install /absolute/path/to/flow-diagram
```

The packaged library is ESM and includes TypeScript declarations. Import its stylesheet separately. The source entry already imports the stylesheet.

```tsx
import {useState} from 'react';
import {FlowDiagram, type FlowGraph, type FlowSubject} from '@local/flow-diagram';
import '@local/flow-diagram/style.css';

const graph: FlowGraph = {
  stages: ['available', 'allocated'],
  items: [
    {key: 'source', title: 'Available', total: 1000, placement: {stage: 'available'}},
    {key: 'destination', title: 'Allocated', placement: {stage: 'allocated'}},
    {key: 'reserve', title: 'Reserve', total: 300, placement: {edge: 'top'}},
    {key: 'unused', title: 'Unallocated', placement: {edge: 'bottom'}},
  ],
  transfers: [
    {key: 'allocation', from: 'source', to: 'destination', amount: 500},
    {key: 'extra', from: 'reserve', to: 'destination', amount: 100},
    {key: 'remainder', from: 'source', to: 'unused', amount: 200},
  ],
};

export function Example() {
  const [selection, setSelection] = useState<FlowSubject | null>(null);
  return (
    <FlowDiagram
      graph={graph}
      accessibleName="Allocation flow"
      selection={selection}
      onItemClick={(facts, event) => {
        setSelection({kind: 'item', key: facts.item.key});
        // Original item + resolved quantities; event is a React activation event.
      }}
      onTransferClick={(facts) => {
        setSelection({kind: 'transfer', key: facts.transfer.key});
      }}
      formatAmount={(amount) => `${amount.toLocaleString()} units`}
    />
  );
}
```

Available retains a total of 1,000 while transferring only 700. Unconnected capacity stays visible; no transfer is invented for the remaining 300.

Keep inputs immutable and supply a new graph reference when data changes. Stable data and presentation callback references avoid unnecessary layout work. The host needs an actual available width; flex/grid parents should allow shrinking with `min-width: 0`.

## Public interface

`src/types.ts` contains the full generic contract. Node and transfer metadata types are independent and retained in all callback contexts.

| Property | Purpose |
| --- | --- |
| `graph` | Ordered stages, nodes (`items`) and transfers with stable keys. Required. |
| `accessibleName` | Descriptive accessible name for the diagram. Required. |
| `selection` | One `{kind: 'item' \| 'transfer', key}` or `null`. Fully controlled. |
| `onItemClick` | Receives node facts and the activation event. |
| `onTransferClick` | Receives transfer facts and the activation event. |
| `formatAmount` | Formats quantities with facts, field name and surface. |
| `getLabel` | Returns plain text, up to two lines, or `null` to omit a label. |
| `renderTooltip` | Returns non-interactive React content or `null`. |
| `plotHeight` | Preferred central region height; default 336 CSS pixels. Edge bands add height. |
| `className` | Host styling, including the four theme tokens below. |

An item has `key`, `title`, and exactly one placement: `{stage: 'stage-key'}` or `{edge: 'top' | 'bottom'}`. It can have `total`, `color`, and `meta`. A transfer has `key`, `from`, `to`, and `amount`, plus optional `color` and `meta`.

Stages follow `graph.stages`. Item array order controls vertical order within a stage. All members of a stage have the same x coordinate, including when connections pass through top/bottom nodes. Empty stages are omitted. Transfer input order is a final tie-breaker after geometric ordering.

Quantities must be finite. Transfer amounts must be positive. A declared total must be non-negative and at least its incoming and outgoing sums independently. Without a declared total, the total is `max(incoming, outgoing)`. All quantitative bar lengths and ribbon widths share one scale. Incoming plus outgoing is never the required total for a relay.

Keys are unique within each kind. Parallel transfers need different keys. Invalid data, unknown endpoints, backward/same-stage transfers and directed cycles throw `FlowInputError`. Its `issues` include diagnostic codes and affected keys. Mixed-role edge nodes must fit between their main-stage sources and targets. Use a host error boundary for invalid external data.

## Custom labels and tooltips

```tsx
<FlowDiagram
  graph={graph}
  accessibleName="Allocation flow"
  formatAmount={(value, context) => {
    // context.field: total / incoming / outgoing / amount
    // context.surface: label / tooltip / accessible
    return `${value.toLocaleString()} units`;
  }}
  getLabel={(view) => view.kind === 'item'
    ? [view.item.title, `${view.text.total} total`]
    : view.text.amount
  }
  renderTooltip={(view) => view.kind === 'item' ? (
    <>
      <strong className="flow-tip-title">{view.item.title}</strong>
      <dl>
        <dt>Total</dt><dd>{view.text.total}</dd>
        <dt>Incoming</dt><dd>{view.text.incoming}</dd>
        <dt>Outgoing</dt><dd>{view.text.outgoing}</dd>
      </dl>
    </>
  ) : (
    <>
      <strong className="flow-tip-title">
        {view.fromItem.title} → {view.toItem.title}
      </strong>
      <span>{view.text.amount}</span>
    </>
  )}
/>
```

Labels use measured text, truncation and at most two lines. Transfer labels avoid bars and other labels; a label with no suitable space is hidden until its transfer is inspected. Tooltips and accessible descriptions retain the full information. Units are presentation only: there is no conversion or normalization of currencies/units.

Tooltip placement, viewport clamping, dismissal and accessible association are internal. Content is portaled to `document.body` so it can escape the chart's scroll area. Interactive tooltip content is unsupported.

## Interaction and selection

- Inspecting a node keeps that node, all directly incoming/outgoing transfers, and every node those transfers touch strong. Everything else fades. This is one hop, not recursive traversal or all transfers between highlighted neighbors.
- Inspecting a transfer keeps only that transfer and its two endpoint nodes strong.
- Visible node and transfer labels activate their own subject. Node labels take priority over ribbons passing behind them; hidden labels do not create invisible click targets.
- Pointer movement inspects; leaving clears pointer inspection. Touch taps activate and pin details; dragging cancels activation. Tapping outside dismisses details.
- One roving tab stop enters the diagram. Arrow keys move through items then transfers in input order; Home/End jump to the ends. Enter/Space activate once. Escape dismisses inspection. Tab leaves normally.
- Keyboard focus works after pointer use, including clicks on empty chart space. Keyboard/touch details follow the inspected subject when resizing or scrolling changes its position.
- Activation calls the relevant handler. It never changes selection internally. The host may select, navigate, open a panel, or ignore the click.
- Selection uses a persistent solid contrast outline, including when its fill fades during unrelated inspection. Keyboard focus uses a dashed indicator. Escape does not change selection. A selected key removed from the graph is ignored without a callback.

## Layout and routing

Top/bottom nodes are horizontal quantitative bars with full labels, facts and interactions. Both transfer directions use the inward face: below a top bar and above a bottom bar. Multiple edge nodes pack within their valid source/target intervals and wrap into rows. A side without nodes reserves no extra band.

Simple fan-out and fan-in use ordered ports. Bottom arrivals reverse vertical source order: a lower main source enters a shared bottom bar to the left of an upper source. Wrapped simple fan-out reserves separate vertical corridors and horizontal lanes. Row spacing grows with the combined ribbon widths and lane gaps, including unequal amounts and two-line labels. Destinations farther right turn closer to the preceding row; destinations farther left turn closer to their own row. This keeps their horizontal runs and connecting bends separate.

Parallel wrapped transfers use a consistent 4 CSS-pixel gap on the vertical runs, around their shared turn and on the horizontal runs. The bends use shared centers and different radii so adjacent curves nest smoothly. Transfers still touch at their source ports; the first bend gradually opens the gap without changing ribbon widths or inflating the node's total. The group switches to these bends together when space and obstacle clearance allow it; constrained layouts retain the ordinary routing fallback.

When a main-stage transfer and a top/bottom transfer enter the same node, the main-stage curve can reach its final entry height earlier and finish horizontally. This prevents a late curve from crossing the vertical input and then crossing back again. The existing top/main/bottom port order stays intact. A bounded pass accepts the alternative only when sampled ribbon overlap decreases, no new crossing pair appears, and obstacle clearance does not worsen. It also checks for newly overlapping ribbon pairs, with a small tolerance for sampling noise and shared endpoints.

Complex graphs also use obstacle-aware paths and a bounded adjacent-port optimization. **Arbitrary graphs are not guaranteed to be crossing-free.** Main-stage order stays fixed. The implementation does not exhaustively reorder edge nodes or search every global layout. Dense, mixed or skipping-stage graphs can still contain crossings and overlapping ribbons. The supplied fixtures are checked for unrelated bar/label clearance.

Wrapping increases height. If stage spacing or an individual ribbon cannot clear obstacles at the available width, a wider internal canvas with a local horizontal scrollbar may be needed. Aggregate edge-node count alone does not force widening. Every resize starts from the current container width; expanding can remove rows and shrinking does not retain an old desktop minimum.

The routing search is bounded. Pathological custom graphs may still need a larger host container. There is no promise of a globally optimal layout or perfect clearance for every possible graph.

## Styling

The component inherits the font family, uses 12-pixel chart text, and exposes four theme tokens. Scope overrides on the component's class:

```css
.my-flow {
  --flow-surface: #ffffff;
  --flow-text: #24334a;
  --flow-muted-text: #68758b;
  --flow-focus: #2644af;
}
```

Provide `color` on items/transfers as needed. Otherwise nodes receive a stable palette color based on their key; transfers inherit their destination color. Unsupported CSS colors fall back to the palette. No application-specific theme provider is needed.

## Source map

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Public types and structured errors |
| `src/model.ts` | Validation, adjacency, totals, one-hop emphasis |
| `src/layout.ts` | Stage geometry, packing, ports and route allocation |
| `src/paths.ts` | Curves, obstacle routing and hit-test geometry |
| `src/presentation.ts` | Quantity formatting and accessible descriptions |
| `src/FlowDiagram.tsx` | Rendering, interactions, selection and tooltip |
| `src/style.css` | Appearance and theme tokens |
| `demo/fixtures.ts` | Original allocations and behavior examples |
| `demo/allocations.json` | Supplied transaction, statement and invoice dataset |
| `demo/feature-demo.json` | Full neutral example, including mixed-role edge nodes |
| `tests/core.test.ts` | Data, geometry and emphasis regressions |

`dist/` contains the compiled library, declarations and stylesheet. `demo-dist/` contains a self-contained browser build. Build/test scripts use TypeScript and Rollup in-process; no native compiler subprocess is needed.

## Actual implementation screenshots

These captures come from the running implementation, not design mockups.

![All examples available as tabs above the original allocation dataset](screenshots/08-all-example-tabs.jpg)

![Complete flow with three stages, multiple top/bottom nodes, mixed-role relays, custom labels and partial totals](screenshots/01-complete-flow.jpg)

Process A is inspected below while Unassigned remains externally selected. Its solid outline survives fading; Process A's keyboard focus indicator is dashed.

![One-hop inspection, a custom tooltip and independent selection](screenshots/02-inspection-and-selection.jpg)

The mobile example wraps destinations into rows while keeping transfers separate.

![Wrapped fan-out in a phone-sized viewport](screenshots/03-mobile-wrapping.jpg)

With several destinations in each wrapped row, the horizontal lanes remain separate too. The row spacing includes the entire group of transfer widths. Nested bends keep the 4-pixel gaps consistent through the turn.

![Twelve destinations with nested curves and consistent gaps between parallel transfers](screenshots/07-consistent-bundle-curves.jpg)

In this updated complete example, the two green inputs into Outcome B no longer cross each other. Process B reaches its upper entry height before Carry-in turns toward the lower entry. The same routing rule handles inputs from above.

![Separate side and bottom inputs into Outcome B](screenshots/06-separated-convergence.jpg)

See `VERIFICATION.md` for checks performed and verification limits.
