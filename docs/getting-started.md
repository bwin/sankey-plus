# Getting started

[Back to README](../README.md)

## Install

```sh
npm install @bwin/sankey-plus
```

Requires React and React DOM 18.2 or later. Import the component and its stylesheet:

```tsx
import { SankeyDiagram, type SankeyGraph } from '@bwin/sankey-plus';
import '@bwin/sankey-plus/style.css';
```

## Add a diagram with controlled selection

The packaged library is ESM and includes TypeScript declarations. Import its stylesheet separately. You can also copy `src/` into your application; its source entry already imports the stylesheet.

```tsx
import { useState } from 'react';
import {
  SankeyDiagram,
  type SankeyGraph,
  type SankeySubject,
} from '@bwin/sankey-plus';
import '@bwin/sankey-plus/style.css';

const graph: SankeyGraph = {
  stages: ['available', 'allocated'],
  nodes: [
    {
      key: 'source',
      title: 'Available',
      total: 1000,
      placement: { stage: 'available' },
    },
    {
      key: 'destination',
      title: 'Allocated',
      placement: { stage: 'allocated' },
    },
    {
      key: 'reserve',
      title: 'Reserve',
      total: 300,
      placement: { edge: 'top' },
    },
    { key: 'unused', title: 'Unallocated', placement: { edge: 'bottom' } },
  ],
  links: [
    { key: 'allocation', from: 'source', to: 'destination', amount: 500 },
    { key: 'extra', from: 'reserve', to: 'destination', amount: 100 },
    { key: 'remainder', from: 'source', to: 'unused', amount: 200 },
  ],
};

const formatAmount = (amount: number) => `${amount.toLocaleString()} units`;

export function Example() {
  const [selection, setSelection] = useState<SankeySubject | null>(null);
  return (
    <SankeyDiagram
      graph={graph}
      accessibleName="Allocation flow"
      selection={selection}
      onNodeClick={(facts, event) => {
        setSelection({ kind: 'node', key: facts.node.key });
        // Original node + resolved quantities; event is a React activation event.
      }}
      onLinkClick={(facts) => {
        setSelection({ kind: 'link', key: facts.link.key });
      }}
      formatAmount={formatAmount}
    />
  );
}
```

Available retains a total of 1,000 while transferring only 700. Unconnected capacity stays visible; no link is invented for the remaining 300.

## Validate external data

When a graph comes from JSON, a form or another untrusted source, call `validateGraph` before rendering. It accepts `unknown` and never throws. Structurally well-shaped plain data produces all semantic issues; malformed structures or unexpected access failures produce `invalid-graph` issues instead.

```ts
import { validateGraph, type SankeyGraph } from '@bwin/sankey-plus';

const candidate: unknown = await response.json();
const issues = validateGraph(candidate);
if (issues.length) {
  // Show or log issue.code, issue.message and any nodeKey/linkKey.
} else {
  const graph = candidate as SankeyGraph;
  // Render <SankeyDiagram graph={graph} ... />
}
```

An empty array means the data passed validation. The component still throws `SankeyInputError` for semantic invalidity and can throw `TypeError` for malformed shapes; an error boundary remains the backstop for rendering and layout failures. See [API validation](api.md#non-throwing-validation).

## Read the layout or export SVG

Use a typed ref when the host needs the completed geometry. `getLayout()` returns the latest typed read-only snapshot. `onLayout` reports each newly completed scene and also reports the current snapshot once when a callback is attached while a scene is already complete. `focusSubject` moves keyboard focus without changing controlled selection.

```tsx
import { useRef } from 'react';
import {
  SankeyDiagram,
  type SankeyDiagramHandle,
  type SankeyLayout,
} from '@bwin/sankey-plus';

export function ExportableDiagram() {
  const diagram = useRef<SankeyDiagramHandle>(null);
  const download = () => {
    const svg = diagram.current?.getSvgElement();
    if (!svg) return;
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: 'image/svg+xml',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'flow.svg';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <>
      <SankeyDiagram
        ref={diagram}
        graph={graph}
        accessibleName="Allocation flow"
        onLayout={(layout: SankeyLayout) => {
          console.log(layout.diagnostics);
        }}
      />
      <button onClick={download}>Download SVG</button>
    </>
  );
}
```

The exported SVG keeps the component's class names. Inject the theme variables and label/canvas rules if it must render without the host stylesheet; the demo's download does this.

See [layout snapshots and overlays](api.md#imperative-handle) for field semantics and non-interactive SVG annotations.

Keep inputs immutable and supply a new graph reference when data changes. Stable data and presentation callback references avoid unnecessary layout work. The host needs an actual available width; flex/grid parents should allow shrinking with `min-width: 0`.

The component computes layout on the main thread in cooperative chunks, targeting 8 ms of work before yielding through a timer task. Checkpoints are between layout phases, nodes, routes and comparisons; individual geometry helpers can exceed that target. Initial layout shows “Preparing diagram…” and sets `aria-busy`. A resize retains the last complete scene while the replacement is calculated. Changed inputs and unmounting cancel unfinished work, and only complete results are committed. No worker or bundler configuration is required. Validation, presentation callbacks and the final React/SVG render are still synchronous.

## Link a table or another view

Use `highlight` for emphasis coming from your own UI, and `onInspectChange` for inspection coming from the chart:

```tsx
<SankeyDiagram
  graph={graph}
  highlight={hoveredSubject}
  onInspectChange={setInspection}
  selection={selection}
/>
```

Track hover and focus separately, or as one combined active subject, and pass the effective subject (`hovered ?? focused`) to `highlight`. Clear only the contribution being left; Escape can clear both without changing focus. `onInspectChange` reports `{subject, modality}`; match `inspection.subject` to the row's key. External highlighting does not fire the callback, so the two directions stay independent. Selection is still controlled only through `selection` and the click callbacks. See the [Linked table example](examples.md#linked-table) for the complete table, keyboard handling and selection separation.

## Next steps

- [API and data rules](api.md)
- [Labels, tooltips and themes](customization.md)
- [Example catalog](examples.md)
- [Run the local demo](development.md)
