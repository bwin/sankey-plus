# API reference

[Back to README](../README.md)

[src/types.ts](../src/types.ts) contains the full generic contract. Node and link metadata types are independent and retained in all callback contexts.

| Property         | Purpose                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `graph`          | Ordered `stages`, `nodes` and `links` with stable keys. Required.                                            |
| `accessibleName` | Descriptive accessible name for the diagram. Required.                                                       |
| `selection`      | One `{kind: 'node' \| 'link', key}` or `null`. Fully controlled.                                             |
| `onNodeClick`    | Receives node facts and the activation event.                                                                |
| `onLinkClick`    | Receives link facts and the activation event.                                                                |
| `formatAmount`   | Formats quantities with facts, field name and surface.                                                       |
| `getLabel`       | Returns plain text, an array of lines, or `null` to omit a label.                                            |
| `renderTooltip`  | Returns non-interactive React content or `null`.                                                             |
| `plotHeight`     | Preferred central region height; default 336 CSS pixels. Edge bands add height.                              |
| `transition`     | Optional crossfade between completed scenes. `false` (default) or `{duration?, easing?}`.                    |
| `minLinkWidth`   | Minimum displayed ribbon thickness in CSS pixels; default 0 (proportional). Must be finite and non-negative. |
| `className`      | Host styling, including the four theme tokens below.                                                         |

Measured width, `plotHeight`, `minLinkWidth` and the resulting scene extents must not exceed 10,000,000 CSS pixels. Values outside that range are rejected with a `SankeyInputError` (`invalid-number`) instead of producing non-finite SVG geometry.

A node has `key`, `title`, and exactly one placement: `{stage: 'stage-key'}` or `{edge: 'top' | 'bottom'}`. It can have `total` or per-unit `totals`, `color`, and `meta`. A link has `key`, `from`, `to`, and input `amount`, plus explicit `inputUnit`/`outputUnit` for named-unit data, `conversionRate`, `color` and `meta`. The graph can provide `defaultUnit` and reference `conversionRates` for widths and combined totals. See [units and conversion](units.md).

## Scene transitions

Set `transition={{ duration: 280 }}` to crossfade the previous completed scene into the next completed scene when the graph or layout options change. The prop type is exported as `SankeyTransition`. This is a visual crossfade of the old and new drawings: path geometry, node positions, link widths and labels are not interpolated, and no intermediate layout is calculated. The fading copy is clipped to the current scene, non-interactive, hidden from assistive technology and cannot take focus; the new scene remains the only interactive layer.

`duration` is in milliseconds and defaults to 280. `easing` accepts any CSS animation timing function and defaults to `ease-out`. `duration: 0` disables the animation, and the effect is skipped entirely when the system requests reduced motion. Values that are not finite, below 0 or above 10,000 throw a `SankeyInputError` (`invalid-number`). Omit the prop or use `transition={false}` for direct updates. The 120 ms inspection fade remains independent of scene transitions.

The fading copy is refreshed when selection changes, so it reflects the selected subject at the last snapshot. Transient hover/emphasis is not captured. Options that alter rendered scene markup follow the same refresh rule. Container resize and font measurement can also produce a new completed scene, so those updates can crossfade too.

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

## Validation errors

`SankeyInputError.issues` contains `code`, `message`, and optional `nodeKey` / `linkKey`. Codes are `invalid-key`, `invalid-title`, `duplicate-key`, `unknown-endpoint`, `unknown-stage`, `invalid-placement`, `invalid-number`, `total-too-small`, `backward-stage-link`, `cycle`, `incompatible-placement`, `invalid-unit`, `invalid-rate`, `conflicting-rate`, `missing-conversion`, and `incompatible-totals`.

Use a React error boundary around diagrams backed by external data. Error boundaries catch validation failures during rendering and layout failures forwarded from the asynchronous calculation. Validate the structural shape of untrusted JSON before treating it as a `SankeyGraph`.

See [layout and interaction](layout-and-interaction.md) for ordering, routing, keyboard behavior and limits.
