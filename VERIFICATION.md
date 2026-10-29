# Implementation verification

Verified on 28 October 2026, with routing updates checked on 29 October, on Windows using Node 22.17.0 and the desktop app's Chromium-based in-app browser. The demo runs React 19.2.0. Captures in `screenshots/` are from the working implementation.

## Automated checks

- Strict TypeScript checking passes for source, demo and tests.
- Library and demo builds pass. The library keeps React/React DOM external and emits declarations and a stylesheet.
- **41 tests pass, 0 fail** using `node scripts/test.mjs` (updated 29 October 2026).
- Tests cover declared/derived totals; original object and metadata preservation; invalid identifiers, quantities, placements, endpoints and cycles; zero nodes; one-hop emphasis; transfer emphasis; shared stage axes; inward edge faces; reversed bottom ports; containment; obstacle clearance; simple fan-out/fan-in; stable route identity after transfer-order changes; measured/truncated labels; wrapped two-line labels; conditional bands; parallel-transfer hit testing; determinism and input immutability.
- The full fixture is tested at requested widths 1440, 960, 600 and 360 pixels. Its routes clear unrelated bars and labels. At narrow widths a local wider canvas may be used for route clearance.
- The original allocation data is also tested at 1440, 1311, 960, 600 and 360 pixels with custom two-line labels. Statements retain their shared axis; Bad Debt and Written Off stay left of their invoice targets; all unrelated bar/label collision checks pass.
- Simple top/bottom fan-out is tested at 900 and 300 pixels for centerline crossings and sampled ribbon-envelope overlap. Custom two-line labels are tested at 300, 353, 360 and 600 pixels with no widening, crossings or obstacle collisions.
- The crowding fixture wraps twelve bottom destinations and grows height instead of imposing their combined width.
- Added a regression for coincident horizontal runs when several destinations share a wrapped row. Top and bottom twelve-destination fans now check pairwise ribbon-envelope separation, centerline crossings, label/bar clearance and unchanged canvas width at 353, 600, 960, 1151 and 1440 pixels, with both equal and unequal amounts. This caught the original overlap even though its centerline crossing count was zero.
- Added a regression for the two inputs into Outcome B in the full fixture, with custom two-line labels at 600, 960, 1126 and 1440 pixels. Process B and Carry-in retain their upper/lower destination ports and have no centerline crossing or sampled ribbon overlap. Top and bottom variants also cover three unequal input amounts at 600, 960 and 1440 pixels, including reversed transfer input order. All cases clear unrelated bars and labels.
- Wrapped bundles now verify a 4-pixel gap between adjacent vertical and horizontal runs and across sampled points around their shared bend. Source ports remain touching. Top and bottom cases cover equal and unequal amounts at 600, 960, 1126 and 1440 pixels. Existing pairwise separation and clearance tests still pass.
- A 100-node/300-transfer DAG produces finite SVG paths, preserves every identity and clears unrelated bars/labels. The final local Node test took about 0.73 seconds for this case; this is a single-machine geometry measurement, not a browser frame-rate guarantee. This dense graph has crossings, as expected.

## Browser checks

| Check | Observed result |
| --- | --- |
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
