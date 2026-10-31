# Example catalog

[Back to README](../README.md)

[Run the interactive demo](development.md). Every example is a normal tab; Left/Right arrows change tabs and Home/End reach the first/last. Use the Canvas selector to try narrow layouts, the external selection control to select independently of clicks, and the custom-label toggle to compare presentation.

| Example | What to inspect |
| --- | --- |
| Distribution | Medium-complexity flow, partial totals, dark theme, and link tooltips with both endpoint nodes and metadata. |
| Four-sided flow | Multiple top/bottom nodes, both directions and a mixed-role edge relay. Recovery retains its slot when its source wraps. |
| Fan-out / Top fan-out | Separate ordered turns below and above the main sequence. |
| Many edge nodes | Twelve destinations wrapping into rows with separate lanes. |
| Partial allocation | A 1,000-unit node with a 500-unit transfer; no unused edge bands. |
| Stress test | The same 100-node/300-link graph as the command-line stress benchmark. Dense crossings are expected. |
| Empty | No data and no chart SVG. |

All examples share custom labels/tooltips, node/link activation, host-controlled selection and keyboard inspection. The stress demo's measured browser text and two-line labels can produce different geometry from the CPU benchmark. Its timing readout includes scheduling and frame waits; see [development](development.md).

Examples live in [demo/fixtures.ts](https://github.com/bwin/sankey-plus/blob/main/demo/fixtures.ts); the two larger scenes use JSON files beside it.

![Four-sided flow](https://raw.githubusercontent.com/bwin/sankey-plus/main/screenshots/01-complete-flow.jpg)
