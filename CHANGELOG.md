# Changelog

Notable changes to `@bwin/sankey-plus`. Versions follow semantic versioning. See the [release guide](https://github.com/bwin/sankey-plus/blob/master/docs/releasing.md) for preparation and verification.

## [Unreleased]

### Changed

- Demo link tooltips show source and destination details in two columns below full-width link details, without the click-to-select hint.
- All links use smooth cubic curves, including top/bottom connections, wrapped fans and obstacle detours. Crossing, ribbon-overlap, hit-testing and label calculations follow adaptively sampled curves; convergence checks use the actual approach path.

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

[Unreleased]: https://github.com/bwin/sankey-plus/compare/v1.1.0...dev
[1.1.0]: https://github.com/bwin/sankey-plus/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/bwin/sankey-plus/tree/v1.0.0
