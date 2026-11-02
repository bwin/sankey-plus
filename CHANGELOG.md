# Changelog

Notable changes to `@bwin/sankey-plus`. Versions follow semantic versioning. See the [release guide](https://github.com/bwin/sankey-plus/blob/master/docs/releasing.md) for preparation and verification.

## [Unreleased]

### Added

- Link facts expose `fromTotal`, `toTotal`, `fromShare` and `toShare`, resolved in the link's input/output units, so labels and tooltips can show percentage shares without re-deriving endpoint totals. Add a Shares demo built on the Distribution graph.
- Optional `highlight` and `onInspectChange` props: external one-hop emphasis unions with internal inspection, and a deduplicated callback reports the inspected subject and pointer/keyboard/touch modality without changing selection. Attaching the callback while a subject is inspected replays that subject once.
- Inspection bridge example tab with a node highlight picker and a live inspection callback readout.
- Linked table example with separately tracked hover/focus rows that drive external one-hop emphasis and mirror chart inspection back into the active row. Keyboard and touch inspection reveal off-screen rows, and each row has an accessible name with a live inspection status, while selection stays independently controlled.
- Playwright coverage for external highlight, inspection readout, dismissal, selection independence and tab stops on the Inspection bridge example.
- Optional `showHeadroom` hatching for declared partial source/sink capacity, with `minLinkWidth`-aware placement and theme-derived colors. Mixed-direction relays and derived totals are omitted.
- Optional `transition` crossfade between completed scenes, with configurable duration and easing, reduced-motion support and a `duration: 0` opt-out. Path geometry is not interpolated.
- Transitions example that swaps 500- and 750-unit allocation states with a 320 ms crossfade.
- Public read-only layout snapshots with node/link geometry, label boxes, stage positions, central plot and edge bands, layout-unit node scalars and collision diagnostics.
- `onLayout` completion callback and `renderOverlay` for non-interactive SVG annotations, both using the same typed read-only snapshot.
- Typed `SankeyDiagramHandle` ref access for `getLayout()`, `getSvgElement()` and `focusSubject()`, including a generic forwardRef declaration that remains usable without a ref.
- Layout overlay example with stage headings, a rounded node callout, diagnostics readout and SVG download.
- Non-throwing `validateGraph(graph: unknown)` preflight that returns all semantic `SankeyIssue` values for structurally well-shaped graphs and `invalid-graph` for malformed top-level or nested entries, without weakening the component's throw-on-invalid rendering behavior.
- Validation demo tab with valid, cycle, unknown-endpoint and total-too-small variants, showing returned issue codes, messages and affected keys.

### Fixed

- Edge-node placement validation no longer spreads large stage arrays, so graphs with very many incident links validate without a `RangeError`.

## [2.0.0] - 2026-11-01

### Breaking changes

- TypeScript consumers with exhaustive checks must handle the new `mixed` node total source, the `outputAmount` link formatter field, and additional unit-related `SankeyIssueCode` values. Link formatters can receive `outputAmount` even for unitless links. Existing unitless graph inputs remain supported.

### Added

- Optional `minLinkWidth` in CSS pixels, with matching port, bar and routing space. Defaults to proportional widths; exact amounts remain unchanged.
- Wide range example with 200–500,000-unit transfers, a top reserve release, a bottom retained flow and an optional 4px visual minimum.
- Optional graph default units, separate declared/automatic node balances, explicit link input/output units and per-transfer rates. Graph reference rates value both ribbon endpoints and node totals in one common unit; unequal endpoint values taper. Labels and tooltips distinguish actual amounts and transfer rates from reference valuations.
- Currencies example with EUR/USD/GBP/COP balances, partial declarations, a reserve release and retained funds. Actual conversions demonstrate equal-value ribbons and a 2.5% taper; default and custom presentation distinguish transfer rates from reference valuation.
- World trade example with exporting/importing countries, top reserve releases, bottom inventory outflows, balanced totals per good, commodity colors and illustrative USD-billion formatting.

### Changed

- Node labels support multiple lines and reserve room for all unit balances; custom label arrays are no longer capped at two lines.
- Try direct curved approaches before obstacle detours, so stage-skipping links use available gaps without unnecessary excursions.
- Spread fan curves gradually along both axes and reserve more arrival space in wrapped rows. Try broad edge curves before elbow-like detours while preserving ribbon separation and label clearance.

- Node/link inspection fades paint and labels over 120 ms, respecting reduced motion. Tooltips and selection/focus outlines remain instant.
- Demo link tooltips use aligned two-column rows: transfer details and amount above source and destination details, without the click-to-select hint.
- All links use smooth cubic curves, including top/bottom connections, wrapped fans and obstacle detours. Crossing, ribbon-overlap, hit-testing and label calculations follow adaptively sampled curves; convergence checks use the actual approach path.
- Default amounts retain up to 15 significant digits, and the stylesheet export includes a declaration for strict TypeScript consumers.

### Fixed

- Package declarations resolve under strict TypeScript side-effect import checks while retaining the optional stylesheet export.
- Escape dismisses focused tooltips and returns keyboard focus to the inspected node/link without reopening details or changing selection.
- Scrolling inside an oversized tooltip keeps pointer-opened details visible; page and chart scrolling retain their normal dismissal/repositioning behavior.
- Keyboard focus remains visible during pointer inspection; inspected hidden labels are clickable, and native pinch zoom works over the chart.
- Parallel stage links use shared offset curves when needed to prevent their thick ribbons overlapping along a slope, while preserving widths, ports and existing obstacle detours.
- Parallel links sharing a top/bottom node keep separate ribbons through the turn, including narrow layouts where a neighboring label requires a different shared curve.
- Tooltips size and position within the visible viewport, excluding classic scrollbars, so narrow layouts do not clip their right column.

## [1.1.0] - 2026-10-31

### Added

- Cooperative, cancellable main-thread layout: preparation yields between chunks, shows a loading state initially, and retains the completed scene while resizing.
- Generic Distribution, explicit Stages, Fan-in, Parallel links and 100-node/300-link stress examples, including connected-node details in custom link tooltips.
- Live demo on GitHub Pages, focused documentation guides, and reproducible stress/benchmark commands.
- Release guide, maintained changelog, and separate development (`dev`) and stable (`master`) branches.

### Changed

- Optimized route intersection and obstacle checks and reused route comparisons while preserving geometry and diagnostics. See the [measurements](https://github.com/bwin/sankey-plus/blob/master/docs/performance.md).
- Selection outlines use their node or link color while remaining distinct from keyboard focus.
- Smaller npm archive: runtime JavaScript/CSS, public declarations, README, changelog and license notices. Source, guides, internal declarations and source maps remain in the repository.
- The default Distribution demo has a dark theme; examples display approximate time until ready.

### Fixed

- Incoming links from wrapped top/bottom nodes retain their intended destination slots, including Recovery's bottom slot on Outcome C.

The public component props and exported TypeScript API remain compatible with 1.0.0. Layout now completes asynchronously; consumers must not assume the SVG is ready immediately after mounting.

## [1.0.0] - 2026-10-31

### Added

- Initial public release of `SankeyDiagram`, with typed nodes/links, explicit stage columns, top/bottom nodes, independent totals and quantitative ribbons.
- Custom labels/tooltips, one-hop inspection, controlled selection, click callbacks and keyboard navigation.
- Responsive edge wrapping, routing/collision diagnostics, React 18.2+ peer support, MIT license and author metadata for Benjamin Winkler | bwin.

[Unreleased]: https://github.com/bwin/sankey-plus/compare/v2.0.0...dev
[2.0.0]: https://github.com/bwin/sankey-plus/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/bwin/sankey-plus/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/bwin/sankey-plus/tree/v1.0.0
