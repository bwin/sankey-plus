# Releasing a version

[Back to README](../README.md) · [Changelog](../CHANGELOG.md)

## Branches and release identity

- `dev` is the working branch. Code, documentation, fixes and release preparation belong here; feature branches merge into `dev`.
- `master` is the default branch and the latest stable npm release. Do not push routine work directly to it. Only `master` deploys the public demo.
- Every release shares one version across both package manifests, a dated changelog section, an annotated `vX.Y.Z` Git tag and a GitHub release. The tag points to the release merge commit; the npm archive is built from that commit.

Merge **locally** first, then advance **remote** `master` only after npm publication is verified. A failed login/publish therefore leaves the public stable branch unchanged. GitHub and npm cannot be updated atomically: if npm succeeds but the Git push fails, finish the push using the same release commit and tag.

Examples below use **1.1.0**; substitute the next unused version. Use patch versions for compatible fixes, minor versions for compatible features/behavior, and major versions for incompatible public-contract changes. Prereleases use a non-`latest` npm tag such as `next` and stay off stable `master`.

## 1. Prepare on dev and update the changelog

Start with a clean worktree:

```sh
git fetch origin --prune --tags
git switch dev
git pull --ff-only origin dev
git status --short
git log origin/master..dev --oneline
npm view @bwin/sankey-plus version dist-tags --json
```

Maintain [CHANGELOG.md](../CHANGELOG.md) under **Unreleased** as user-visible changes land. Use Added, Changed, Fixed, Removed or Security sections as applicable. At release time:

1. Move pending entries into `## [1.1.0] - YYYY-MM-DD` using the release date; leave an empty Unreleased section.
2. Describe user-visible behavior, compatibility and migration notes rather than copying the commit log.
3. Add the release compare link and advance Unreleased to `v1.1.0...dev`.
4. Bump both manifests without an automatic commit or tag:

```sh
npm version 1.1.0 --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md
git commit -m "Prepare 1.1.0 release"
git push origin dev
```

Freeze the candidate and wait for its build job in [Actions](https://github.com/bwin/sankey-plus/actions). CI tests and builds the code; it does not publish to npm.

## 2. Authenticate and merge locally

Use Node 22 and an npm account allowed to publish `@bwin/sankey-plus` (maintainer: `bwin`). On PowerShell use `npm.cmd` if the `npm.ps1` shim strips arguments after `--`.

```sh
npm whoami --registry https://registry.npmjs.org/
# If needed:
npm login --auth-type=web --registry https://registry.npmjs.org/

git switch master
git pull --ff-only origin master
git merge --no-ff dev -m "Release 1.1.0"
```

Resolve conflicts before proceeding; fixes must also reach `dev`. Do not push `master` yet. npm can require fresh browser/passkey approval for both login and publication. Complete prompts directly; never put credentials or recovery codes in Git or release notes.

## 3. Build, test and inspect the exact archive

```sh
npm ci
npm test
npm run build
npm pack --dry-run
node -e "require('node:fs').mkdirSync('.tests/release', { recursive: true })"
npm pack --pack-destination .tests/release --json
git status --short
```

The worktree must stay clean. The build includes strict typechecking. Inspect the archive: only JS/CSS, three public declaration files, package metadata, README, changelog and license notices belong in it. No credentials, source tree, guides, screenshots, internal declarations or demo files.

Install the **tarball** into a separate consumer directory and verify runtime exports (`SankeyDiagram`, `SankeyInputError`), the CSS export, strict TypeScript compilation of the README example and React server rendering. Check generic callback metadata types when public declarations change. Inspect relevant demo scenes for rendering/routing changes. Save the archive's SHA-1 and SHA-512 integrity from `npm pack --json` for comparison with npm.

After verification, create the local annotated tag:

```sh
git tag -a v1.1.0 -m "Sankey Plus 1.1.0"
git rev-parse HEAD
git rev-list -n 1 v1.1.0
```

Both hashes must match. Do not change packaged files after packing.

## 4. Publish the tested archive

```sh
npm publish .tests/release/bwin-sankey-plus-1.1.0.tgz --access public --tag latest --registry https://registry.npmjs.org/
npm view @bwin/sankey-plus@1.1.0 version dist.shasum dist.integrity --json
npm view @bwin/sankey-plus dist-tags --json
```

Publish the inspected tarball rather than repacking the directory. Complete npm's 2FA approval if requested. Compare registry hashes with the local archive and confirm `latest` is 1.1.0. Verify a fresh registry install in another consumer directory/cache so local files or an older cached version cannot mask problems.

If the CLI times out, query the exact version before retrying: publication may already have succeeded. Published versions cannot be overwritten. Never move a published tag, reuse a published version, automatically unpublish, or change dist-tags to recover from a defect; prepare a new fixed version.

## 5. Push master and publish the GitHub release

After npm verification succeeds:

```sh
git push --atomic origin master refs/tags/v1.1.0
```

This updates the stable branch and its tag together. Inspect a rejected/non-fast-forward push; never force-push a release. Do not use GitHub's merge button before npm publication, since that would advance remote `master` early.

In [GitHub Releases](https://github.com/bwin/sankey-plus/releases/new), choose the **existing** `v1.1.0` tag, title it **Sankey Plus 1.1.0**, and paste that version's changelog entries as the release notes. Include the npm installation command/package link. Publish as the latest stable release, not a draft or prerelease. Pushing a tag alone does not create a GitHub release.

Confirm the tag resolves to remote `master`, the GitHub and npm versions agree, and the `master` Pages deployment succeeds. Check the [live demo](https://bwin.github.io/sankey-plus/).

## 6. Return to dev

```sh
git switch dev
git merge --ff-only master
git push origin dev
```

If `dev` advanced during the release, merge `master` into it normally and resolve conflicts rather than forcing a fast-forward. Subsequent fixes, verification notes and new Unreleased entries belong on `dev`; do not add post-release commits to `master`. Leave the workspace on `dev`.

## References

[npm scoped publishing](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) · [npm 2FA requirements](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) · [GitHub release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
