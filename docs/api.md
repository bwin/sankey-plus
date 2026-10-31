# API reference

[Back to README](../README.md)

[src/types.ts](../src/types.ts) contains the full generic contract. Node and link metadata types are independent and retained in all callback contexts.

| Property | Purpose |
| --- | --- |
| `graph` | Ordered `stages`, `nodes` and `links` with stable keys. Required. |
| `accessibleName` | Descriptive accessible name for the diagram. Required. |
| `selection` | One `{kind: 'node' \| 'link', key}` or `null`. Fully controlled. |
| `onNodeClick` | Receives node facts and the activation event. |
| `onLinkClick` | Receives link facts and the activation event. |
| `formatAmount` | Formats quantities with facts, field name and surface. |
| `getLabel` | Returns plain text, up to two lines, or `null` to omit a label. |
| `renderTooltip` | Returns non-interactive React content or `null`. |
| `plotHeight` | Preferred central region height; default 336 CSS pixels. Edge bands add height. |
| `className` | Host styling, including the four theme tokens below. |

A node has `key`, `title`, and exactly one placement: `{stage: 'stage-key'}` or `{edge: 'top' | 'bottom'}`. It can have `total`, `color`, and `meta`. A link has `key`, `from`, `to`, and `amount`, plus optional `color` and `meta`.

## Stages and order

Stages follow `graph.stages` from left to right; they are explicit columns, not inferred from link depth. Node array order controls vertical order within a stage. All members of a stage have the same x coordinate, including when connections pass through top/bottom nodes. Empty stages are omitted. Link input order is a final tie-breaker after geometric ordering.

Links between stage nodes may skip columns, but must always move to a later stage. Same-stage and backward-stage links are rejected. Stage keys are identifiers, not automatically rendered headings. Top/bottom nodes belong to an edge rather than a stage.

## Quantities

Quantities must be finite. Link amounts must be positive. A declared total must be non-negative and at least its incoming and outgoing sums independently. Without a declared total, the total is `max(incoming, outgoing)`. All quantitative bar lengths and ribbon widths share one scale. Incoming plus outgoing is never the required total for a relay.

Keys are unique within each kind. Parallel links need different keys. Invalid data, unknown endpoints, backward/same-stage links and directed cycles throw `SankeyInputError`. Its `issues` include diagnostic codes and affected keys. Mixed-role edge nodes must fit between their main-stage sources and targets. Use a host error boundary for invalid external data.

## Callback context

Node contexts expose the original `node`, resolved `total`, `incoming`, `outgoing`, `totalSource` (declared/derived), and incoming/outgoing link arrays. Link contexts expose the original `link`, `fromNode` and `toNode`; endpoint totals are the optional declared values on those original nodes. Resolved node facts are not nested inside link contexts.

Presentation contexts also contain formatted `text`: total/incoming/outgoing for a node, or amount for a link. The amount formatter receives `field` and `surface` (label, tooltip or accessible). Metadata stays typed independently through `SankeyGraph<NodeMeta, LinkMeta>` and the callback types.

Click handlers receive facts plus a React mouse or keyboard activation event. Selection is a separate controlled prop; callbacks do not change it internally. See [getting started](getting-started.md) for a working selection example.

## Validation errors

`SankeyInputError.issues` contains `code`, `message`, and optional `nodeKey` / `linkKey`. Codes are `invalid-key`, `invalid-title`, `duplicate-key`, `unknown-endpoint`, `unknown-stage`, `invalid-placement`, `invalid-number`, `total-too-small`, `backward-stage-link`, `cycle`, and `incompatible-placement`.

Use a React error boundary around diagrams backed by external data. Error boundaries catch validation failures during rendering and layout failures forwarded from the asynchronous calculation. Validate the structural shape of untrusted JSON before treating it as a `SankeyGraph`.

See [layout and interaction](layout-and-interaction.md) for ordering, routing, keyboard behavior and limits.
