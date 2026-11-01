# Development and benchmarks

[Back to README](../README.md)

## Run the demo

[Open the live demo](https://bwin.github.io/sankey-plus/) to try all examples without installing anything.

Beside the node/link counts, “Ready in ~… ms” shows approximate elapsed time from the demo update to a completed diagram and a paint opportunity. It includes chunk scheduling and frame waits, excludes downloads, and is not a CPU-only benchmark. Example, size and label changes refresh it; hover and selection do not. This observer belongs to the demo, with no extra library prop.

To develop from the GitHub repository:

```sh
git clone https://github.com/bwin/sankey-plus.git
cd sankey-plus
git switch dev
npm ci
npm run dev
```

The development command builds once and starts the server at **http://127.0.0.1:5178/**. It binds only to the local machine; set `PORT` to use another port. After editing, run `npm run build` in another terminal and refresh the browser. There is no hot reload or file watcher. To serve an existing build, run `npm run preview`.

```sh
npm run typecheck
npm test
npm run build
npm run verify:package
```

`verify:package` requires a completed build. It packs the archive, installs it into `.tests/package-verify/consumer`, and checks the declarations, runtime exports and stylesheet from that fresh consumer.

To measure layout performance:

```sh
npm run stress
npm run stress -- --runs 20 --output .tests/stress.json
npm run benchmark
npm run benchmark -- --case stress-100-300 --profile .tests/stress.cpuprofile
```

`stress` measures the deterministic **100-node / 300-link** fixture: four stages of 25 nodes, with four forward links per node to the next stage (indices wrap within that stage). Amounts are 10–13 units. `benchmark` also measures desktop/mobile regression fixtures, the four-sided example and wrapped fan-out. The shared generator is in `fixtures/stress.ts`.

Reports include the first calculation, median/min/max of ten subsequent calculations, scene dimensions, crossings and obstacle collisions. Timings cover data validation and layout at 1440 px for the stress case; compilation, React rendering and browser painting are excluded. CPU profiling adds overhead, so compare unprofiled runs for timings. [performance guide](performance.md) records the measured optimization results and limitations. These commands require a development checkout with dependencies installed; they are not included in the npm library.

The Stress test demo uses that same graph with the normal interactive renderer, custom two-line labels and responsive sizing. It grows vertically to fit all nodes; dense crossings are expected. Its layout can differ from the timing fixture because browser font measurement, container width and label settings affect geometry. Disable “Custom labels and tooltip” and select 1440 px in a sufficiently wide host for a closer visual comparison.

Node 22 was used for verification. React 19.2 was used for the demo; the library declares React/React DOM 18.2 or later as peer dependencies.



## Automatic demo deployment

[The demo workflow](https://github.com/bwin/sankey-plus/blob/master/.github/workflows/demo.yml) checks pushes to `dev` and `master`, plus pull requests targeting `master`. It can also be started manually from GitHub Actions. It installs the locked dependencies with Node 22, runs the tests, builds the library/demo and, on `master` only, uploads `demo-dist/` as the Pages artifact. Deployment waits for the build to succeed. Development branches run checks without publishing the demo.

The repository's Pages publishing source is **GitHub Actions**. The `github-pages` environment accepts only `master` deployments; only that job has Pages write and identity-token permissions. No personal access token or npm publishing secret is stored in the workflow. Generated files stay out of Git.

The live demo tracks `master`, the latest released version. Its relative asset URLs work under the `/sankey-plus/` project path. Updates to the library package still require a separate npm release.

## Source organization

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Public types and structured errors |
| `src/model.ts` | Validation, adjacency, totals, one-hop emphasis |
| `src/layout.ts` | Stage geometry, packing, ports and route allocation |
| `src/layout-task.ts` | Cooperative main-thread scheduling and cancellation |
| `src/paths.ts` | Curves, obstacle routing and hit-test geometry |
| `src/presentation.ts` | Quantity formatting and accessible descriptions |
| `src/SankeyDiagram.tsx` | Rendering, interactions, selection and tooltip |
| `src/style.css` | Appearance and theme tokens |
| `demo/fixtures.ts` | Generic examples and routing demonstrations |
| `demo/distribution.json` | Medium-complexity distribution example |
| `demo/feature-demo.json` | Full neutral example, including mixed-role edge nodes |
| `tests/core.test.ts` | Data, geometry and emphasis regressions |

`dist/` contains the compiled library, declarations and stylesheet. `demo-dist/` contains a self-contained browser build. Build/test scripts use TypeScript and Rollup in-process; no native compiler subprocess is needed.

## Working conventions

Follow the [release guide](releasing.md) to update the [changelog](../CHANGELOG.md), merge `dev` into `master`, publish to npm and create the matching tag/GitHub release.

Follow [AGENTS.md](https://github.com/bwin/sankey-plus/blob/master/AGENTS.md), including focused commits for independent changes. [Verification](verification.md) records observed behavior and testing limits.

## npm package contents

The npm archive contains the compiled JavaScript, stylesheet, the three public declaration files, README, changelog and license notices. Source files, guides, internal declarations, development scripts and the demo stay in the repository. README guide links point to GitHub so they also work from the installed package and npm page.

The library bundle omits source maps; use a repository checkout and the demo build for source-map debugging. The demo still emits its map. This trims download and installed size without changing the runtime code or layout behavior.

Build before checking the archive:

```sh
npm run build
npm pack --dry-run
```

When public declarations gain new relative imports, include their dependencies in `package.json`'s `files` list and verify a consumer against the packed archive.
