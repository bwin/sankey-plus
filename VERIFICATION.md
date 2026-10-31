# Implementation verification

Verified on 28 October 2026, with routing updates checked on 29 October, on Windows using Node 22.17.0 and the desktop app's Chromium-based in-app browser. The demo runs React 19.2.0. Captures in `screenshots/` are from the working implementation.

## Automated checks

- npm release archive checked on 31 October 2026: the final `1.0.0` tarball contains the MIT license and `Benjamin Winkler | bwin` author/copyright metadata. Installed that archive into a fresh consumer with React/React DOM 19.2.0 and verified public runtime exports, stylesheet resolution and server rendering. The archive has 22 entries, is 86,751 bytes, and has SHA-1 `38005b121bd60770e8196c9a7c75aa51461f0be0`.
- Public API rename checked on 31 October 2026: all 43 tests and strict source/demo/test checking pass with `SankeyDiagram`, `SankeyGraph`, `SankeyNode`, `SankeyLink`, `nodes`/`links`, and `onNodeClick`/`onLinkClick`. A separate TypeScript consumer compiled against the built package declarations and verified node/link metadata types in callback contexts. Runtime imports expose `SankeyDiagram` and `SankeyInputError`; the npm pack manifest contains the renamed component source and declaration only.
- Package rename checked on 31 October 2026: the manifest and lockfile agree on `@bwin/sankey-plus`; strict typechecking and library/demo builds pass; importing `FlowDiagram` and `FlowInputError` through the scoped package name succeeds. All declared exports exist, and `npm pack --dry-run --ignore-scripts` produces the expected `bwin-sankey-plus-1.0.0.tgz` manifest. This was a local packaging check, not a registry publication.
- Strict TypeScript checking passes for source, demo and tests.
- Library and demo builds pass. The library keeps React/React DOM external and emits declarations and a stylesheet.
- **43 tests pass, 0 fail** using `node scripts/test.mjs` (updated 29 October 2026).
- Tests cover declared/derived totals; original object and metadata preservation; invalid identifiers, quantities, placements, endpoints and cycles; zero nodes; one-hop emphasis; transfer emphasis; shared stage axes; inward edge faces; reversed bottom ports; containment; obstacle clearance; simple fan-out/fan-in; stable route identity after transfer-order changes; measured/truncated labels; wrapped two-line labels; conditional bands; parallel-transfer hit testing; determinism and input immutability.
- The full fixture is tested at requested widths 1440, 960, 600 and 360 pixels. Its routes clear unrelated bars and labels. At narrow widths a local wider canvas may be used for route clearance.
- The original allocation data is also tested at 1440, 1311, 960, 600 and 360 pixels with custom two-line labels. Statements retain their shared axis; Bad Debt and Written Off stay left of their invoice targets; all unrelated bar/label collision checks pass.
- Simple top/bottom fan-out is tested at 900 and 300 pixels for centerline crossings and sampled ribbon-envelope overlap. Custom two-line labels are tested at 300, 353, 360 and 600 pixels with no widening, crossings or obstacle collisions.
- The crowding fixture wraps twelve bottom destinations and grows height instead of imposing their combined width.
- Added a regression for coincident horizontal runs when several destinations share a wrapped row. Top and bottom twelve-destination fans now check pairwise ribbon-envelope separation, centerline crossings, label/bar clearance and unchanged canvas width at 353, 600, 960, 1151 and 1440 pixels, with both equal and unequal amounts. This caught the original overlap even though its centerline crossing count was zero.
- Added a regression for the two inputs into Outcome B in the full fixture, with custom two-line labels at 600, 960, 1126 and 1440 pixels. Process B and Carry-in retain their upper/lower destination ports and have no centerline crossing or sampled ribbon overlap. Top and bottom variants also cover three unequal input amounts at 600, 960 and 1440 pixels, including reversed transfer input order. All cases clear unrelated bars and labels.
- Wrapped bundles now verify a 4-pixel gap between adjacent vertical and horizontal runs and across sampled points around their shared bend. Source ports remain touching. Top and bottom cases cover equal and unequal amounts at 600, 960, 1126 and 1440 pixels. Existing pairwise separation and clearance tests still pass.
- Label hit-testing regressions verify that a node name wins over a ribbon beneath it, visible labels on thin transfers activate their transfer, and hidden labels create no extra click target.
- A 100-node/300-transfer DAG produces finite SVG paths, preserves every identity and clears unrelated bars/labels. The final local Node test took about 0.73 seconds for this case; this is a single-machine geometry measurement, not a browser frame-rate guarantee. This dense graph has crossings, as expected.

## Browser checks

| Check | Observed result |
| --- | --- |
| Renamed API interactions (31 October) | Process A activation invokes the node callback once and highlights 7 nodes / 6 links. Supply B → Unassigned invokes the link callback once and highlights 2 nodes / 1 link. Selecting Recovery externally updates the selected node without another callback. All use `kind: 'node'` / `kind: 'link'` and the new callback fact fields. |
| Package branding (31 October) | The page title and header show Sankey Plus, with React identified in the subtitle. The default allocation diagram renders and no warning/error logs were captured. Screenshot: `screenshots/11-sankey-plus.jpg`. |
| Wheel scrolling (29 October) | Normal up/down wheel input worked before and after the change; the reported intermittent stall was not reproduced. Removed unnecessary nested scroll containers and horizontal scroll containment. In the updated demo, wheeling over an inspected node moved the page from 259.5 to 348.5 pixels and dismissed pointer details; wheeling up over blank chart space returned it to 259.5. With a 360-pixel host and 549-pixel canvas, horizontal scrolling reached 189 pixels and vertical up/down input still moved the page without changing that horizontal position. The tall multi-row example also scrolled both ways. These are native browser-input checks, not synthetic wheel events. |
| All example tabs (29 October review) | All seven examples are exposed as tabs. ArrowRight, Home and End move focus and selection together; one tab is tabbable. The tabs wrap within a 390-pixel viewport. Captures: `screenshots/08-all-example-tabs.jpg`, `screenshots/09-example-tabs-mobile.jpg`. |
| Complete example sweep (29 October review) | All seven examples checked at desktop (1414-pixel chart host) and phone (353-pixel chart host) sizes. No page-width overflow or unrelated node/label collisions. Every nonempty diagram retains one tab stop. Complex graphs retain crossings; simple fans have none. |
| Keyboard entry after pointer use (29 October review) | Before the fix, clicking empty chart space then Tab focused Available with no focus marker or tooltip. After the fix, the same sequence shows its dashed indicator and node details. |
| Pinned tooltip on resize (29 October review) | Before the fix, resizing left Process A's details at the old anchor. After the fix, its tooltip follows the new node position with the expected 16-pixel offset in both axes. |
| Node-label activation (29 October review) | Before the fix, clicking Available selected Available → Allocated. After the fix, the same label click invokes the node handler and selects Available. |
| Node pointer activation | One callback; the host can select the clicked node. |
| Node keyboard activation | Enter/Space each activate once. Process A inspection leaves exactly 7 nodes and 6 transfers strong. |
| Transfer activation | One transfer callback; that transfer and exactly its 2 endpoints stay strong. |
| Host-controlled selection | Changing the external selection does not generate a click callback. Turning off host click-to-select preserves the selected node when another subject activates. |
| Unrelated selection during inspection | Unassigned fades while its solid selection outline remains visible during Process A inspection. |
| Escape | Dismisses details and restores all emphasis without changing the selected subject. |
| Keyboard navigation | Home/End reach first/last subject without activation. Exactly one diagram subject is tabbable; Tab leaves and dismisses details. |
| Desktop layout | Complete 15-node/19-transfer fixture fits the host and reports zero unrelated obstacle collisions. |
| Narrow complete fixture | A 360-pixel host contains its own horizontal scroll area; the page does not widen. |
| Phone viewport | At a 390-pixel browser viewport, the 353-pixel chart host fits simple wrapped fan-out without canvas widening, crossings or obstacle collisions. |
| Many bottom nodes | All 13 nodes (1 source, 12 destinations) render at the 353-pixel host width, with zero reported crossings/obstacle collisions. |
| Several destinations in each wrapped row (29 October) | At the reported desktop layout (1126-pixel chart host), each horizontal transfer occupies a visibly separate lane. The browser reports zero crossings and obstacle collisions; the page remains within its container. Screenshot: `screenshots/05-separated-wrapped-lanes.jpg`. |
| Mixed inputs into Outcome B (29 October) | At the 1126-pixel host, Process B reaches its upper entry height early; Carry-in approaches below it. The two green ribbons no longer cross or overlap. The complete graph still has 18 crossing pairs elsewhere and zero unrelated obstacle collisions. No warning/error logs were captured. Screenshot: `screenshots/06-separated-convergence.jpg`. |
| Smooth wrapped bundles (29 October) | At the 1151-pixel host, nested curves replace the independently rounded corners. The parallel legs and shared turn have consistent gaps. The desktop and 360-pixel layouts both report zero crossings and obstacle collisions and fit their host widths; no warning/error logs were captured. Screenshot: `screenshots/07-consistent-bundle-curves.jpg`. |
| Conditional bands | Partial allocation has zero top/bottom bands and a 2:1 source/destination bar ratio. Top-only has a positive top band and zero bottom band. |
| Empty graph | Shows “No flow data” and no chart SVG. |
| Console | No captured warning/error logs in the checked demo states. |

Browser checks used the demo's actual controls and rendered DOM. They were performed interactively, not added as a persistent end-to-end test suite. Geometric regressions are repeatable through the included automated tests.

## Limits

- Crossing reduction is bounded and does not guarantee a crossing-free arbitrary graph. Complex mixed routes can overlap. Pathological inputs may require more space than the supplied fixtures.
- The tests check representative constructive fan patterns and sampled ribbon geometry; they are not a mathematical proof for all inputs.
- Touch tap/drag handling is implemented but has not been verified on physical touch hardware.
- Accessible names, roles, pressed state, focus and keyboard behavior were inspected. A human screen-reader audit has not been performed.
- React 18 compatibility is declared but the demo was exercised with React 19.2. Cross-browser Safari/Firefox and a production framework integration were not tested.
- Initial layout is synchronous. The 100/300 stress case is an initial performance envelope, not a claim of smooth live re-layout for much larger graphs. Hover and selection do not recompute geometry when graph/presentation inputs remain stable.
