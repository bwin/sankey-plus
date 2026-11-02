# API reference

[Back to README](../README.md)

[src/types.ts](../src/types.ts) contains the full generic contract. Node and link metadata types are independent and retained in all callback contexts.

| Property         | Purpose                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `graph`          | Ordered `stages`, `nodes` and `links` with stable keys. Required.                                                  |
| `accessibleName` | Descriptive accessible name for the diagram. Required.                                                             |
| `selection`      | One `{kind: 'node' \| 'link', key}` or `null`. Fully controlled.                                                   |
| `onNodeClick`    | Receives node facts and the activation event.                                                                      |
| `onLinkClick`    | Receives link facts and the activation event.                                                                      |
| `formatAmount`   | Formats quantities with facts, field name and surface.                                                             |
| `getLabel`       | Returns plain text, an array of lines, or `null` to omit a label.                                                  |
| `renderTooltip`  | Returns non-interactive React content or `null`.                                                                   |
| `plotHeight`     | Preferred central region height; default 336 CSS pixels. Edge bands add height.                                    |
| `minLinkWidth`   | Minimum displayed ribbon thickness in CSS pixels; default 0 (proportional). Must be finite and non-negative.       |
| `onLayout`       | Receives a read-only layout snapshot once per completed scene; attaching while a scene is current reports it once. |
| `renderOverlay`  | Returns non-interactive SVG content for a completed scene, painted above labels in a `pointer-events: none` group. |
| `className`      | Host styling, including the four theme tokens below.                                                               |

Measured width, `plotHeight`, `minLinkWidth` and the resulting scene extents must not exceed 10,000,000 CSS pixels. Values outside that range are rejected with a `SankeyInputError` (`invalid-number`) instead of producing non-finite SVG geometry.

A node has `key`, `title`, and exactly one placement: `{stage: 'stage-key'}` or `{edge: 'top' | 'bottom'}`. It can have `total` or per-unit `totals`, `color`, and `meta`. A link has `key`, `from`, `to`, and input `amount`, plus explicit `inputUnit`/`outputUnit` for named-unit data, `conversionRate`, `color` and `meta`. The graph can provide `defaultUnit` and reference `conversionRates` for widths and combined totals. See [units and conversion](units.md).

## Stages and order

Stages follow `graph.stages` from left to right; they are explicit columns, not inferred from link depth. Node array order controls vertical order within a stage. All members of a stage have the same x coordinate, including when connections pass through top/bottom nodes. Empty stages are omitted. Link input order is a final tie-breaker after geometric ordering.

Links between stage nodes may skip columns, but must always move to a later stage. Same-stage and backward-stage links are rejected. Stage keys are identifiers, not automatically rendered headings. Top/bottom nodes belong to an edge rather than a stage.

## Quantities

Quantities must be finite. Link amounts must be positive. Each declared unit balance must be non-negative and at least its incoming and outgoing sums independently. Without a declaration, its total is `max(incoming, outgoing)`. Converted per-unit totals are summed for node size; all bars and ribbons share one value scale. Incoming plus outgoing is never the required total for a relay within one unit. [Multi-unit semantics and examples](units.md) explain partial declarations and conversions.

Set `minLinkWidth={4}` to make small transfers easier to see. Each endpoint is displayed at `max(convertedAmount * scale, minLinkWidth)` CSS pixels. The floor is applied after unit conversion; labels, tooltip values and callback facts retain the actual amounts. Values below the floor can have identical thicknesses, and a small currency taper can disappear if both ends reach the floor. Node bars expand to fit incoming/outgoing port stacks, and routing reserves the displayed widths. Dense stacks may increase chart height or require local horizontal scrolling. The default `0` retains proportional geometry. See the [Wide range example](examples.md#wide-range).

Keys are unique within each kind. Parallel links need different keys. Invalid data, unknown endpoints, backward/same-stage links and directed cycles throw `SankeyInputError`. Its `issues` include diagnostic codes and affected keys. Mixed-role edge nodes must fit between their main-stage sources and targets. Use a host error boundary for invalid external data.

## Callback context

Node contexts expose the original `node`, scalar `total`/`incoming`/`outgoing` in the layout `unit`, `totalSource` (declared/derived/mixed), per-unit `totals`, optional default-unit `converted` summary, and incoming/outgoing link arrays. Link contexts expose the original `link`, `fromNode`, `toNode`, actual `input`/`output` quantities and `conversionRate`, `layoutInputAmount`/`layoutOutputAmount`, optional default-unit `converted` endpoints and `referenceRates`. Endpoint totals are the optional declared values on those original nodes. Resolved node facts are not nested inside link contexts.

Presentation contexts contain formatted `text`: total/incoming/outgoing, per-unit `totals` and optional `converted` for nodes; `amount`/`outputAmount`, optional `convertedAmount`/`convertedOutputAmount`, `conversionRate` and `referenceRates` equations for links. The amount formatter receives `field`, `unit`, `isConverted` and `surface` (label, tooltip or accessible). Metadata stays typed independently through `SankeyGraph<NodeMeta, LinkMeta>` and the callback types.

Click handlers receive facts plus a React mouse or keyboard activation event. Selection is a separate controlled prop; callbacks do not change it internally. See [getting started](getting-started.md) for a working selection example.

## Imperative handle

`SankeyDiagram` forwards a typed `SankeyDiagramHandle`. It exposes the current completed layout, the live SVG element, and a way to move the diagram's roving tab stop:

```tsx
import { useRef } from 'react';
import {
  SankeyDiagram,
  type SankeyDiagramHandle,
  type SankeyLayout,
} from '@bwin/sankey-plus';

export function DiagramWithActions() {
  const diagram = useRef<SankeyDiagramHandle>(null);
  const download = () => {
    const svg = diagram.current?.getSvgElement();
    if (!svg) return;
    const markup = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(
      new Blob([markup], { type: 'image/svg+xml' }),
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
        onLayout={(layout: SankeyLayout) => console.log(layout.diagnostics)}
      />
      <button onClick={download}>Download SVG</button>
      <button
        onClick={() =>
          diagram.current?.focusSubject({ kind: 'node', key: 'source' })
        }
      >
        Focus source
      </button>
    </>
  );
}
```

The serialized SVG keeps the component's class names. Inject the theme variables and label/canvas rules if the exported file must render without the host stylesheet.

- `getLayout()` returns the latest typed read-only snapshot, or `null` while no scene is rendered. Treat the snapshot and its maps as immutable even though the maps are runtime `Map` instances typed as `ReadonlyMap`. The object stays stable across unrelated re-renders. A resize keeps the previous complete scene current until its replacement completes; changing the graph or layout options clears the snapshot to `null` until the new scene commits.
- `onLayout` receives that same snapshot once per completed scene, including when a changed graph, size or layout option produces new geometry. Attaching or re-attaching a callback while the snapshot remains current reports that snapshot once; changing callback identity while it stays attached does not repeat an already reported snapshot. Rendering, hover and selection do not re-run it.
- `getSvgElement()` returns the live `<svg>` node, or `null` before a scene is rendered.
- `focusSubject(subject)` moves the roving tab stop and focuses that rendered node or link. It returns `true` only when the rendered control is present. It returns `false` for unknown subjects, before the first completed scene, and while a graph or layout-option change has no completed replacement scene yet. A retained scene during resize still has rendered controls. It never changes the controlled `selection` prop.

### Snapshot fields

All coordinates use the SVG view-box coordinate system. The snapshot is a typed read-only copy; treat its maps and objects as immutable.

| Field             | Meaning                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `width`, `height` | Canvas size in CSS pixels.                                                                                                                                                                                         |
| `topBand`         | Height reserved above the central plot for top/edge content.                                                                                                                                                       |
| `bottomBand`      | Height reserved below the central plot for bottom/edge content.                                                                                                                                                    |
| `scale`           | Common value scale in pixels per layout unit; node heights and proportional link widths use it.                                                                                                                    |
| `plot`            | Central band: `top`, `bottom` and `height` in canvas coordinates.                                                                                                                                                  |
| `stages`          | Explicit stage keys from left to right, with `x` at the left edge of that stage's node bars.                                                                                                                       |
| `nodes`           | Read-only map keyed by node key. Each entry has the bar rect (`x`, `y`, `width`, `height`), `stage` or `edge`, `color`, layout-unit scalar `total`/`incoming`/`outgoing`, optional `unit`, and a measured `label`. |
| `links`           | Read-only map keyed by link key. Each entry has `from`, `to`, the painted SVG `path`, maximum ribbon `width`, `color`, measured `label` and `labelHidden` (true when the label was omitted to avoid a collision).  |
| `diagnostics`     | Completed-scene `crossings` and `obstacleCollisions`, matching the canvas data attributes.                                                                                                                         |

Labels include `x`, `y`, `width`, `height`, `anchor` and `lines`. They describe the measured text box; the component still owns rendering, truncation and collision placement. Node totals are the scalar values used for layout, not a re-summation of the original per-unit balances.

## Overlays

`renderOverlay(layout)` draws SVG content inside the diagram after links, nodes and labels. It receives the same typed read-only snapshot as `getLayout()` and `onLayout`. The content is placed in a `pointer-events: none` group and hidden from assistive technology, so it must be decorative and non-interactive: do not add buttons, links, focusable elements or the only copy of essential information. Use the four theme tokens (`--flow-surface`, `--flow-text`, `--flow-muted-text`, `--flow-focus`) so annotations follow light and dark hosts. Use `topBand`/`bottomBand` or `plot` to keep annotations clear of edge content. Overlays do not affect layout, routing or hit testing.

```tsx
<SankeyDiagram
  graph={graph}
  accessibleName="Allocation flow"
  renderOverlay={({ stages, plot, nodes }) => (
    <g>
      {stages.map((stage) => (
        <text
          key={stage.key}
          x={stage.x}
          y={plot.top - 12}
          fill="var(--flow-muted-text)"
        >
          {stage.key}
        </text>
      ))}
      {nodes.has('source') && (
        <rect
          x={nodes.get('source')!.x - 6}
          y={nodes.get('source')!.y - 6}
          width={nodes.get('source')!.width + 12}
          height={nodes.get('source')!.height + 12}
          rx={6}
          fill="none"
          stroke="var(--flow-focus)"
        />
      )}
    </g>
  )}
/>
```

## Validation errors

`SankeyInputError.issues` contains `code`, `message`, and optional `nodeKey` / `linkKey`. Codes are `invalid-key`, `invalid-title`, `duplicate-key`, `unknown-endpoint`, `unknown-stage`, `invalid-placement`, `invalid-number`, `total-too-small`, `backward-stage-link`, `cycle`, `incompatible-placement`, `invalid-unit`, `invalid-rate`, `conflicting-rate`, `missing-conversion`, and `incompatible-totals`.

Use a React error boundary around diagrams backed by external data. Error boundaries catch validation failures during rendering and layout failures forwarded from the asynchronous calculation. Validate the structural shape of untrusted JSON before treating it as a `SankeyGraph`.

See [layout and interaction](layout-and-interaction.md) for ordering, routing, keyboard behavior and limits.
