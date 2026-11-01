# Working on Sankey Plus

## Project

- Package: `@bwin/sankey-plus`. Public React component: `SankeyDiagram`; public data types use the `Sankey` prefix and `nodes`/`links` terminology.
- Author and copyright holder: **Benjamin Winkler | bwin**. License: MIT.
- Keep the library and examples use-case agnostic. Domain-specific historical data belongs in regression fixtures, not component logic.
- Runtime dependencies are React and React DOM. Layout, SVG rendering and hit testing are implemented here; avoid introducing a charting framework for routine fixes.

## Source boundaries

- `src/types.ts` and `src/index.ts`: public contract and exports. Keep implementation-only options internal.
- `src/model.ts`: input validation, adjacency, totals and one-hop emphasis.
- `src/units.ts`: graph reference valuation paths, inverse rates and unit validation. Link conversionRate is an independent actual transfer rate; never merge it into the reference table or add unlike units.
- `src/layout.ts` and `src/paths.ts`: deterministic geometry, port order, routing and collision checks. These modules must remain independent of React and the DOM.
- `src/layout-task.ts`: cooperative scheduling. Keep the synchronous benchmark and chunked component on the same iterator; preserve cancellation and complete-scene commits. Chunk checkpoints belong at phase/item boundaries, not in React render.
- `src/presentation.ts` and `src/SankeyDiagram.tsx`: formatting, measured labels, rendering and interaction.
- `demo/`: interactive examples. `fixtures/stress.ts` is shared by the demo, regression test and benchmark; do not create divergent copies.
- `tests/`: repeatable geometry/data regressions. `screenshots/` and `docs/verification.md`: actual browser observations and their limits.
- Keep the README concise: installation, a minimal example, one overview screenshot and links. Put detailed guidance in `docs/`; update the example catalog when adding demo tabs.

## Behavior to preserve

- Inputs are immutable. A declared balance may exceed transferred amounts, but cannot be less than either incoming or outgoing sums in that unit. Links debit inputUnit and credit outputUnit at their own conversionRate. Multiple units are separate balances; value them using graph reference rates for node size. Both ribbon endpoints and all bars use the default-unit scale; taper only when reference values differ. Retain actual endpoint amounts in presentation.
- Main-stage nodes retain their shared vertical axis and input order. Top/bottom nodes use their inward face in both directions; reserve edge space only when nodes occupy that edge.
- `minLinkWidth` is an opt-in visual floor after reference conversion. Reserve displayed endpoint widths in ports, bars and route clearance; grow space if fixed floors cannot fit. Never change facts, totals or formatting to account for the floor. Omitted/zero must preserve proportional geometry.
- Wrapping must preserve intended port order, separate simple fan ribbons and keep unrelated bars/labels clear. Test mirrored top and bottom cases and both incoming and outgoing directions when changing routing.
- Inspecting a node emphasizes itself, its incident links and their endpoints only. Inspecting a link emphasizes it and its two endpoints. Selection is controlled by the host, independent of inspection, and visually distinct even when faded.
- Preserve keyboard activation, visible-label hit testing, native wheel scrolling and container-local horizontal overflow.
- Arbitrary graphs may retain crossings. Do not hide collision diagnostics, reduce search budgets or change geometry merely to improve benchmark numbers.

## Development and verification

Work on `dev` (or feature branches merged into `dev`). `master` is the default branch and represents the latest npm release; do not push ordinary development or documentation updates directly to it. Follow `docs/releasing.md`: update `CHANGELOG.md`, prepare on `dev`, merge locally into `master`, verify/publish the tested archive, then atomically push `master` and its version tag and create the GitHub release. Merge the release back into `dev` and return there after releasing. CI checks both branches, but only `master` deploys the live demo.

From the repository root, install with `npm ci`. `npm run dev` builds and serves the demo at `http://127.0.0.1:5178/`. There is no watcher: rebuild and refresh after edits.

```sh
npm run typecheck
npm test
npm run build
npm run verify:package
npm run stress
npm run benchmark
```

- `npm run build` checks TypeScript and builds both the library and demo. Build/test scripts invoke TypeScript and Rollup in-process.
- Add focused regressions for behavioral bugs. For routing changes, check actual rendered output at desktop and narrow widths in addition to geometry tests. Record what was verified without implying untested browser/platform coverage.
- Profile before optimizing. Compare unprofiled first-call and warm timings; keep fixture creation, compilation and rendering outside layout timing. See `docs/performance.md` for methodology and benchmark arguments. In PowerShell, use `npm.cmd` if the `npm.ps1` shim strips forwarded `--` arguments.
- Keep generated `dist/`, `demo-dist/`, `.tests/` and `node_modules/` out of Git. Store CPU profiles and temporary reports under `.tests/`.
- Keep the npm archive limited to runtime JS/CSS, public declarations, README, changelog and license notices. If public declarations gain relative imports, update the `files` allowlist and run `npm run verify:package`; it installs the packed archive into a fresh consumer. Detailed guides stay on GitHub; use absolute repository links from the README.
- Make focused, independently reviewable commits: separate performance work, routing fixes, examples and repository guidance. Preserve unrelated user changes.
- Keep README/API examples aligned with implementation. Distinguish changes committed to Git from versions actually published to npm.

## Shared agent guidance

Maintain project instructions here. `CLAUDE.md` imports this file; do not duplicate these rules there.
