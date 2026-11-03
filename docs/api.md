# API reference

[Back to README](../README.md)

[src/types.ts](../src/types.ts) contains the full generic contract. Node and link metadata types are independent and retained in all callback contexts.

| Property          | Purpose                                                                                                                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph`           | Ordered `stages`, `nodes` and `links` with stable keys. Required. Treat it as immutable and pass a new reference when data changes; in-place mutations are not re-resolved, so geometry can stay stale while tooltips and click callbacks still see the mutated objects.                            |
| `accessibleName`  | Descriptive accessible name for the diagram. Required.                                                                                                                                                                                                                                              |
| `selection`       | One `{kind: 'node' \| 'link', key}` or `null`. Fully controlled.                                                                                                                                                                                                                                    |
| `highlight`       | One subject, an array of subjects, or `null` for external one-hop emphasis. Unioned with inspection.                                                                                                                                                                                                |
| `onInspectChange` | Reports internal `{subject, modality}` changes, or `null`; replays the current inspection on attach. Never changes selection.                                                                                                                                                                       |
| `onNodeClick`     | Receives node facts and the activation event.                                                                                                                                                                                                                                                       |
| `onLinkClick`     | Receives link facts and the activation event.                                                                                                                                                                                                                                                       |
| `formatAmount`    | Formats quantities with facts, field name and surface. Keep it stable (module-level or memoized); a new identity rebuilds labels and restarts layout. See [stable callbacks](customization.md#stable-callbacks) and [getting started](getting-started.md#read-the-layout-or-export-svg).            |
| `getLabel`        | Returns plain text, an array of lines, or `null` to omit a label. Keep it stable (module-level or memoized); a new identity rebuilds labels and restarts layout. See [stable callbacks](customization.md#stable-callbacks) and [getting started](getting-started.md#read-the-layout-or-export-svg). |
| `renderTooltip`   | Returns non-interactive React content or `null`.                                                                                                                                                                                                                                                    |
| `plotHeight`      | Preferred central region height; default 336 CSS pixels. Edge bands add height.                                                                                                                                                                                                                     |
| `transition`      | Optional crossfade between completed scenes. `false` (default) or `{duration?, easing?}`.                                                                                                                                                                                                           |
| `minLinkWidth`    | Minimum displayed ribbon thickness in CSS pixels; default 0 (proportional). Must be finite and non-negative.                                                                                                                                                                                        |
| `showHeadroom`    | Hatches declared source/sink capacity; mixed-direction relays are omitted; default `false`.                                                                                                                                                                                                         |
| `onLayout`        | Receives a read-only layout snapshot once per completed scene; attaching while a scene is current reports it once.                                                                                                                                                                                  |
| `renderOverlay`   | Returns non-interactive SVG content for a completed scene, painted above labels in a `pointer-events: none` group.                                                                                                                                                                                  |
| `className`       | Host styling, including theme token overrides.                                                                                                                                                                                                                                                      |

Measured width, `plotHeight`, `minLinkWidth` and the resulting scene extents must not exceed 10,000,000 CSS pixels. Values outside that range are rejected with a `SankeyInputError` (`invalid-number`) instead of producing non-finite SVG geometry.

A node has `key`, `title`, and exactly one placement: `{stage: 'stage-key'}` or `{edge: 'top' | 'bottom'}`. It can have `total` or per-unit `totals`, `color`, and `meta`. A link has `key`, `from`, `to`, and input `amount`, plus explicit `inputUnit`/`outputUnit` for named-unit data, `conversionRate`, `color` and `meta`. The graph can provide `defaultUnit` and reference `conversionRates` for widths and combined totals. See [units and conversion](units.md).

## Server rendering

Server rendering is supported: non-empty graphs emit only a `plotHeight`-tall “Preparing diagram…” placeholder at the container's width, while empty graphs render “No flow data”; layout runs after hydration. `formatAmount` and `getLabel` still run for non-empty graphs during server rendering, so keep them free of browser-only APIs. See [getting started](getting-started.md#read-the-layout-or-export-svg) for placeholder and resize behavior.

## Scene transitions

Set `transition={{ duration: 280 }}` to crossfade the previous completed scene into the next completed scene when the graph or layout options change. The prop type is exported as `SankeyTransition`. This is a visual crossfade of the old and new drawings: path geometry, node positions, link widths and labels are not interpolated, and no intermediate layout is calculated. The fading copy is clipped to the current scene, non-interactive, hidden from assistive technology and cannot take focus; the new scene remains the only interactive layer.

`duration` is in milliseconds and defaults to 280. `easing` accepts any CSS animation timing function and defaults to `ease-out`. `duration: 0` disables the animation, and the effect is skipped entirely when the system requests reduced motion. Values that are not finite, below 0 or above 10,000 throw a `SankeyInputError` (`invalid-number`). Omit the prop or use `transition={false}` for direct updates. The 120 ms inspection fade remains independent of scene transitions.

Selection and external-highlight changes refresh the fading copy at the last snapshot. Transient hover/emphasis is not captured. Options that alter rendered scene markup follow the same refresh rule. Container resize and font measurement can also produce a new completed scene, so those updates can crossfade too.

## Stages and order

Stages follow `graph.stages` from left to right; they are explicit columns, not inferred from link depth. Node array order controls vertical order within a stage. All members of a stage have the same x coordinate, including when connections pass through top/bottom nodes. Empty stages are omitted. Link input order is a final tie-breaker after geometric ordering.

Links between stage nodes may skip columns, but must always move to a later stage. Same-stage and backward-stage links are rejected. Stage keys are identifiers, not automatically rendered headings. Top/bottom nodes belong to an edge rather than a stage.

## Quantities

Quantities must be finite. Link amounts must be positive. Each declared unit balance must be non-negative and at least its incoming and outgoing sums independently. Without a declaration, its total is `max(incoming, outgoing)`. Converted per-unit totals are summed for node size; all bars and ribbons share one value scale. Incoming plus outgoing is never the required total for a relay within one unit. [Multi-unit semantics and examples](units.md) explain partial declarations and conversions.

Set `minLinkWidth={4}` to make small transfers easier to see. Each endpoint is displayed at `max(convertedAmount * scale, minLinkWidth)` CSS pixels. The floor is applied after unit conversion; labels, tooltip values and callback facts retain the actual amounts. Values below the floor can have identical thicknesses, and a small currency taper can disappear if both ends reach the floor. Node bars expand to fit incoming/outgoing port stacks, and routing reserves the displayed widths. Dense stacks may increase chart height or require local horizontal scrolling. The default `0` retains proportional geometry. See the [Wide range example](examples.md#wide-range).

### Headroom

Set `showHeadroom` to hatch declared capacity that is not covered by incident port stacks. The overlay is intentionally conservative: it appears only on a pure source (no incoming flow) or pure sink (no outgoing flow) whose total is declared or partially declared. Fully derived totals and mixed-direction relays are not hatched, because a relay's combined gap can mix incoming and outgoing units and roles.

For an eligible node, headroom is `max(0, total - max(incoming, outgoing))` in the layout unit: the bottom of a vertical main-stage bar, or the right end of a horizontal top/bottom bar. The overlay uses `total * scale` as its limit and subtracts the larger displayed incoming or outgoing stack. With `minLinkWidth`, those stacks include the pixel floor, so a floor-expanded stack consumes the bar rather than creating unused capacity. Hatches below 0.5 CSS pixels are omitted. The hatch is non-interactive and hidden from assistive technology; the node bar remains the hit target. Enabling it does not change totals, widths, scale, labels, routing or callback facts.

Keys are unique within each kind. Parallel links need different keys. Invalid data, unknown endpoints, backward/same-stage links and directed cycles throw `SankeyInputError`. Its `issues` include diagnostic codes and affected keys. Mixed-role edge nodes must fit between their main-stage sources and targets. Use a host error boundary for invalid external data.

## Callback context

Node contexts expose the original `node`, scalar `total`/`incoming`/`outgoing` in the layout `unit`, `totalSource` (declared/derived/mixed), per-unit `totals`, optional default-unit `converted` summary, and incoming/outgoing link arrays. Link contexts expose the original `link`, `fromNode`, `toNode`, actual `input`/`output` quantities and `conversionRate`, resolved `fromTotal`/`toTotal` and `fromShare`/`toShare`, `layoutInputAmount`/`layoutOutputAmount`, optional default-unit `converted` endpoints and `referenceRates`. `fromTotal` is the source node's resolved total in `input.unit`; `toTotal` is the target node's resolved total in `output.unit`. All four share fields are read-only output facts; hosts do not supply them. Balances account for declared, derived and mixed totals, and neither total uses the layout unit when the link names a different one. Shares divide native actual amounts (including the link's `conversionRate` for `toShare`), are clamped to 0..1 and are 0 when the matching total is unavailable or non-positive. `fromNode` and `toNode` remain original inputs, not nested resolved facts.

Presentation contexts contain formatted `text`: total/incoming/outgoing, per-unit `totals` and optional `converted` for nodes; `amount`/`outputAmount`, optional `convertedAmount`/`convertedOutputAmount`, `conversionRate` and `referenceRates` equations for links. Link presentation contexts retain `fromTotal`/`toTotal` and `fromShare`/`toShare` because resolved facts are spread into the context. The amount formatter receives `field`, `unit`, `isConverted` and `surface` (label, tooltip or accessible), along with the same share fields. When the formatter context has `isConverted: true`, those shares still describe the native endpoint amounts and must not be used for the converted value. Metadata stays typed independently through `SankeyGraph<NodeMeta, LinkMeta>` and the callback types.

Click handlers receive facts plus a React mouse or keyboard activation event. Selection is a separate controlled prop; callbacks do not change it internally. See [getting started](getting-started.md) for a working selection example.

## External highlight and inspection

`highlight` accepts one `{kind: 'node' | 'link', key}`, an array of subjects, or `null`. Valid subjects use the same one-hop rule as internal inspection: a node emphasizes itself, its incident links and their endpoints; a link emphasizes itself and its two endpoints. A list is unioned, and unknown keys are ignored. External highlighting never changes `selection`. Prefer stable array and subject identities: an inline array or object created on every host render recomputes the emphasized sets even though the visible result is unchanged.

Internal inspection and external `highlight` contribute to one strong set. When neither supplies a valid subject, every node and link stays strong, preserving the default rendering. When either does, only the unioned one-hop sets stay strong. Omitting both props leaves the existing behavior unchanged.

`onInspectChange` receives a `SankeyInspection` (`{subject, modality}`) or `null`. `modality` is `pointer`, `keyboard` or `touch`. It fires once when the inspected subject or modality changes: pointer hover, keyboard focus, touch pin, dismissal, and removal of the inspected subject after a graph update. Pointer-leave dismissal is delayed by about 300 ms, so its `null` report follows that delay. The callback is deduplicated across renders and does not fire for selection changes.

It is also a replay-on-attach subscription, not only a change subscription: if the callback is added while a subject is already inspected, it receives that current subject once. Changing the callback identity while the subject stays the same does not duplicate the report. Removing the callback resets the deduplication, so adding it again reports the current subject once.

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

`SankeyInputError.issues` contains `code`, `message`, and optional `nodeKey` / `linkKey`. Semantic codes are `invalid-key`, `invalid-title`, `duplicate-key`, `unknown-endpoint`, `unknown-stage`, `invalid-placement`, `invalid-number`, `total-too-small`, `backward-stage-link`, `cycle`, `incompatible-placement`, `invalid-unit`, `invalid-rate`, `conflicting-rate`, `missing-conversion`, and `incompatible-totals`. These failures throw `SankeyInputError`. A malformed shape can fail before semantic validation with a `TypeError` (for example, `nodes: [null]`), so do not rely on `SankeyInputError` as a complete boundary for untrusted data.

### Non-throwing validation

`validateGraph(graph: unknown)` never throws. It pre-checks that the value is a non-null object with `stages`, `nodes` and `links` arrays, and that every node, link and supplied conversion-rate entry is an object. `conversionRates`, when supplied, must itself be an array. Malformed structure returns one or more `invalid-graph` issues and stops before semantic validation. If inspection fails unexpectedly, such as from a throwing accessor, `validateGraph` also returns `invalid-graph` instead of throwing. `invalid-graph` is specific to `validateGraph`; the component's `SankeyInputError` path does not use it.

For structurally well-shaped plain data, `validateGraph` applies the component's graph validation and returns every semantic issue found. An empty array means the graph is valid.

```ts
import { validateGraph, type SankeyGraph } from '@bwin/sankey-plus';

const candidate: unknown = await response.json();
const issues = validateGraph(candidate);
if (issues.length) {
  console.error(issues.map((issue) => `${issue.code}: ${issue.message}`));
} else {
  const graph = candidate as SankeyGraph;
  // render <SankeyDiagram graph={graph} ... />
}
```

Use this as a preflight for untrusted JSON or form data; pass the original `unknown` value instead of casting first. The component still throws `SankeyInputError` for semantic invalidity and can throw `TypeError` for malformed shapes, and asynchronous layout failures can still surface while rendering. An error boundary remains an appropriate backstop.

Use a React error boundary around diagrams backed by external data. Error boundaries catch validation failures during rendering and layout failures forwarded from the asynchronous calculation. Validate the structural shape of untrusted JSON before treating it as a `SankeyGraph`.

See [layout and interaction](layout-and-interaction.md) for ordering, routing, keyboard behavior and limits.
