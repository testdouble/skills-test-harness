# Change Plan: Bun Runtime and Dependency Upgrade

## Why This Change

This is a deliberate improvement with no triggering document. The operator asked, in their own words, to "update the
project to the latest version of the bun runtime, and update all dependencies, to ensure everything is good to go and
working" ([scope-boundary.md](artifacts/scope-boundary.md)). Discovery found a concrete failure behind it: `bun audit
--audit-level=moderate` exits 1 on `main` today with 32 vulnerabilities, so the CI Security Audit job is red. Two of
the React Router advisories are fixed only in React Router 7.18
([C-2](artifacts/current-state-findings.md#c-2-bun-audit---audit-levelmoderate-fails-today-so-the-ci-security-audit-job-is-red-on-main)).
The whole target state was executed in a scratch clone under Bun 1.4.2 before this plan was written, and every check
passes, including the audit ([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).

## What Changes, In One Paragraph

The repo states the Bun version it runs on (`1.4.2`), so CI installs that version instead of the newest release of the
day, and the README tells developers which one to have. Every dependency moves to its newest release, including four
majors (React 19, React Router 7, Vitest 5, marked 18). The compiler that typechecks the code comes from the lockfile
instead of from whatever is on `PATH`. The Makefile stops naming DuckDB's platform packages one by one, so the compiled
binaries still build after DuckDB added two. The docs say which versions the project is on. Only seven source lines
change (a type import in seven dashboard pages). Nothing in the three Vitest configs, the eight tsconfigs, or
`vite.config.ts` changes. When it is done, `bun audit` is clean, all 934 unit and 64 integration tests pass, `make build`
produces working binaries, and the dashboard renders the same pages it renders today.

## Current State

The runtime is unpinned: the local machine runs Bun 1.3.11 while CI's `oven-sh/setup-bun@v2` step installs the newest
release on every run, 1.4.2 today
([C-1](artifacts/current-state-findings.md#c-1-the-bun-runtime-version-is-unpinned-local-and-ci-already-run-different-versions)).
The type checker is in the same state: `typescript` is declared nowhere, so `bunx tsc` uses a Homebrew 5.9.3 on the
local machine and would download `typescript@latest` (7.0.2) on a runner
([C-9](artifacts/current-state-findings.md#c-9-typescript-is-undeclared-bunx-tsc-resolves-a-path-binary-locally-and-downloads-typescriptlatest-702-in-ci)).
Every other check passes on 1.3.11, the build works, and the compiled CLI runs
([C-3](artifacts/current-state-findings.md#c-3-baseline-on-bun-1311--every-other-ci-check-passes-the-build-works-and-the-compiled-cli-runs)).

Dependency ranges mix `latest`, caret floors, and one major-version type mismatch: `yargs` 18 with `@types/yargs` 17.
That mismatch is correct, because yargs 18 ships no types and 17.0.35 is the newest published
([C-4](artifacts/current-state-findings.md#c-4-dependency-ranges-mix-latest-caret-floors-and-a-major-version-type-mismatch)).

The root `overrides` block is the repo's convention for security floors on transitive packages
([C-5](artifacts/current-state-findings.md#c-5-the-root-overrides-block-is-the-repos-convention-for-security-floors-on-transitive-dependencies)).

The code exposed to the four majors is small. React is used through `createRoot` and `StrictMode` with no removed API.
The only React-19-sensitive pattern is the global `JSX.Element` return annotation in seven page components
([C-10](artifacts/current-state-findings.md#c-10-react-usage-is-already-react-18-idiomatic-the-only-react-19-sensitive-pattern-is-the-global-jsxelement-annotation),
[C-25](artifacts/current-state-findings.md#c-25-nothing-in-the-client-touches-the-apis-react-19-or-react-router-7-change)).
React Router is used in declarative mode only, with static routes and no `future` flags
([C-11](artifacts/current-state-findings.md#c-11-react-router-usage-is-the-declarative-api-only-with-no-future-flags-enabled)).
`marked` is called twice with no options
([C-12](artifacts/current-state-findings.md#c-12-marked-renders-model-output-straight-into-dangerouslysetinnerhtml-at-two-sites-with-no-options-sanitizer-or-error-boundary)).

Every `vi.mock` is at module top level
([C-26](artifacts/current-state-findings.md#c-26-every-vimockvihoisted-call-is-at-module-top-level-five-mock-using-test-files-never-clear-mocks)).

Three facts only execution revealed. Vitest's workers run under whatever `node` is on `PATH`; with none, they run under
Bun and the five test files that stub the `Bun` global fail. So Node is an undeclared prerequisite
([C-28](artifacts/current-state-findings.md#c-28-vitest-workers-run-under-whatever-node-is-on-path-without-one-they-run-under-bun-and-the-five-bun-stubbing-test-files-fail)).
The newest `@duckdb/node-bindings` adds two musl platform packages the Makefile's `--external` list does not name, which
breaks `make build` until the list covers them
([C-30](artifacts/current-state-findings.md#c-30-duckdbnode-bindings155-r5-adds-two-musl-platform-packages-make-build-fails-until-they-are---external)).
And Bun 1.4.2 itself runs the repo unchanged without rewriting the v1 lockfile
([C-29](artifacts/current-state-findings.md#c-29-bun-142-runs-this-repo-unchanged-and-does-not-rewrite-the-v1-lockfile)).

## Target State

The project states its toolchain and its dependencies explicitly, and every stated version is the newest release as of
2026-09-21. The manifest ranges are carets, so a `bun install` on build day may resolve a newer patch than the literals
below. That is acceptable, and every proof that names an exact version is a minimum
([D-18](artifacts/change-decision-log.md#d-18-hand-edited-manifests-one-major-per-unit)).

**Runtime pin.** Root `package.json` carries `"packageManager": "bun@1.4.2"`. CI's `setup-bun` step reads it (E-4), so
the seven jobs need no edit. Bun does not enforce it ([C-32](artifacts/current-state-findings.md#c-32-bun-does-not-enforce-packagemanager-enginesbun-or-bun-version-itself));
the README names the version for humans. The pin makes CI deterministic and deliberately lagging: someone edits the
line when a new Bun release is wanted ([D-1](artifacts/change-decision-log.md#d-1-bun-pin-mechanism)).

**Compiler.** Root `devDependencies` carries `"typescript": "^7.0.2"`, which is the version `bunx tsc` would download on
a runner today. `node_modules/.bin/tsc` exists and `bunx tsc` resolves it from every workspace directory, so the
`typecheck` script is unchanged ([D-5](artifacts/change-decision-log.md#d-5-typescript-declared-at-702)).

**Dependency ranges.** Every declaration reads `^<resolved version>` — the form `bun update --latest` writes — including
`@duckdb/node-api`, whose `-r.N` version scheme means a plain `bun update` will not cross to the next DuckDB patch.
`bun update --latest` or an edit moves it ([D-9](artifacts/change-decision-log.md#d-9-duckdb-takes-a-caret-like-everything-else)).
Manifests are hand-edited to the literals in the Surface Delta and installed with `bun install`; no unit runs
`bun update` ([D-18](artifacts/change-decision-log.md#d-18-hand-edited-manifests-one-major-per-unit)).

**Unchanged on purpose.** The three `vitest*.config.ts` files, the eight `tsconfig.json` files, `packages/web/vite.config.ts`,
the Makefile's relink step, and every Bun API call site stay byte-for-byte as they are.

**Contracts** (values more than one file must agree on):

| Contract | Literal | Where it appears |
| --- | --- | --- |
| Bun version | `1.4.2` | `package.json` `"packageManager": "bun@1.4.2"`; `README.md` prerequisites; `docs/project-discovery.md` |
| `bun-types` range | `"bun-types": "^1.4.2"` | 8 manifests: bun-helpers, claude-integration, cli, data, evals, execution, sandbox-integration, web |
| `@duckdb/node-api` range | `"@duckdb/node-api": "^1.5.5-r.5"` | `packages/data/package.json` |
| `vite` floor | `^8.3.0` | root `overrides.vite` and `packages/web` devDependencies (same string, per the [C-5](artifacts/current-state-findings.md#c-5-the-root-overrides-block-is-the-repos-convention-for-security-floors-on-transitive-dependencies) convention) |
| `hono` floor | `^4.13.8` | root `overrides.hono` and `packages/web` dependencies |
| Tailwind lockstep | `^4.3.3` | `packages/web` `tailwindcss` and `@tailwindcss/vite`; exactly one `"tailwindcss@4.3.3"` in `bun.lock` |
| React import | `import { type JSX, useEffect, useState } from 'react'` | line 1 of six page files; `TestRunDetail.tsx` line 2 reads `import { Fragment, type JSX, useEffect, useState } from 'react'` |
| Makefile externals | `--external '@duckdb/node-bindings-*'` — one line replacing the six per-platform lines | `Makefile` build target, both `bun build` invocations |
| `biome.json` | `"$schema": "https://biomejs.dev/schemas/2.5.14/schema.json"`; `"preset": "recommended"` replacing `"recommended": true` | root |
| Doc lines | the exact replacement lines listed under S-15 | `README.md`, `docs/project-discovery.md`, `docs/web.md`, `CLAUDE.md`, `docs/coding-standards/vitest-mocking-patterns.md` |
| Executed reference | [dry-run-2026-09-21.diff](artifacts/dry-run-2026-09-21.diff) — the complete non-lockfile diff of the target state | `artifacts/` |

## Surface Delta

### S-1: `package.json#packageManager` — Added

**Target state.** Root `package.json` carries `"packageManager": "bun@1.4.2"` immediately after `"private": true`. It
is the single statement of the Bun version the project runs on; CI reads it, docs repeat it.

**Behavior.** Changing. CI installs exactly 1.4.2 on every run instead of the newest release of the day; a future Bun
release is adopted by editing this line. Operator answer: "Pin it (Recommended)".

**Why.** The runtime is unpinned and CI already floats ([C-1](artifacts/current-state-findings.md#c-1-the-bun-runtime-version-is-unpinned-local-and-ci-already-run-different-versions));
`setup-bun@v2` resolves `packageManager` first with no workflow edit (E-4).

**Decision.** [D-1](artifacts/change-decision-log.md#d-1-bun-pin-mechanism)

### S-2: `bun.lock` — Re-scoped

**Target state.** `bun.lock` keeps `"lockfileVersion": 1, "configVersion": 1` and resolves every package to the versions
named in S-3 through S-11. `@remix-run/router` is absent; 21 `@typescript/*` platform entries and the two DuckDB musl
entries are present. It is written by Bun 1.4.2 and readable by 1.3.11.

**Behavior.** Preserving. `bun install --frozen-lockfile` exits 0 on both versions ([C-29](artifacts/current-state-findings.md#c-29-bun-142-runs-this-repo-unchanged-and-does-not-rewrite-the-v1-lockfile)).
The file's contents change visibly for a PR reviewer (about +211/−180 lines, [C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).

**Why.** Every later unit changes resolutions; the format does not change ([C-29](artifacts/current-state-findings.md#c-29-bun-142-runs-this-repo-unchanged-and-does-not-rewrite-the-v1-lockfile), E-1 as annotated).

**Depends on.** S-1.

**Decision.** [D-2](artifacts/change-decision-log.md#trivial-decisions)

### S-3: root `package.json#devDependencies` — Re-scoped

**Target state.** Root `devDependencies` is exactly:

```json
"devDependencies": {
  "@biomejs/biome": "^2.5.14",
  "typescript": "^7.0.2",
  "vitest": "^5.0.1"
}
```

(`vitest` passes through `^4.1.11` in Unit 2 before reaching `^5.0.1` in Unit 5.) The three Vitest config files are
unchanged; Vitest 5's `clearMocks: true` default applies.

**Behavior.** Changing (Vitest part). A future test that expects mock call history to survive from a previous test
fails under Vitest 5 where it passed under 4; unawaited async assertions and `expect.poll` timeouts now fail. All 934
unit and 64 integration tests pass unchanged ([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).
Operator answer: "Accept the new default (Recommended)". Biome part preserving: 247 warnings, 0 errors before and after.

**Why.** "Update all dependencies"; Vitest `<4.1.11` and `@vitest/mocker` carry an open advisory ([C-2](artifacts/current-state-findings.md#c-2-bun-audit---audit-levelmoderate-fails-today-so-the-ci-security-audit-job-is-red-on-main)).

**Depends on.** S-1, S-5 (Vitest 4.1.11 and 5 both take `vite` as a peer; the override guarantees 8.3.0, E-6).

**Decision.** [D-4](artifacts/change-decision-log.md#d-4-vitest-5-with-its-default-mock-clearing), [D-13](artifacts/change-decision-log.md#trivial-decisions)

### S-4: root `package.json#devDependencies.typescript` — Added

**Target state.** `"typescript": "^7.0.2"` is declared at the root, resolved in `bun.lock` together with its 21 platform
packages, and provides `node_modules/.bin/tsc`. The `typecheck` script (`bunx tsc --noEmit` per package) is unchanged
and resolves that binary from every workspace directory.

**Behavior.** Changing. Locally, `bunx tsc` (and an editor using the workspace TypeScript) moves from Homebrew 5.9.3 to
7.0.2. On a runner, `bunx tsc` would download 7.0.2 today, so the version CI checks with does not change — but no CI
run has executed TypeScript 7 yet; Unit 2's Type Check job is the first. All eight packages typecheck under both
versions locally ([C-9](artifacts/current-state-findings.md#c-9-typescript-is-undeclared-bunx-tsc-resolves-a-path-binary-locally-and-downloads-typescriptlatest-702-in-ci)).
Operator answer: "Declare TypeScript ^7.0.2 (Recommended)".

**Why.** The compiler is the one CI input `--frozen-lockfile` does not cover; it moved from 5.x to 7.0 between May and
September with no commit ([C-9](artifacts/current-state-findings.md#c-9-typescript-is-undeclared-bunx-tsc-resolves-a-path-binary-locally-and-downloads-typescriptlatest-702-in-ci), E-11).

**Depends on.** S-1.

**Decision.** [D-5](artifacts/change-decision-log.md#d-5-typescript-declared-at-702)

### S-5: root `package.json#overrides` — Re-scoped

**Target state.** The block reads:

```json
"overrides": {
  "vite": "^8.3.0",
  "picomatch": "^4.0.4",
  "hono": "^4.13.8",
  "postcss": "^8.5.23"
}
```

It remains the place where transitive security floors are stated. `postcss` is transitive-only and carries the `nanoid`
fix; `vite` and `hono` repeat the direct ranges in `packages/web`; `picomatch` is unchanged.

**Behavior.** Preserving. Every resolution already exceeds the floors; the audit is clean with either block
([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).

**Why.** The old floors admit advisories the audit reports ([C-2](artifacts/current-state-findings.md#c-2-bun-audit---audit-levelmoderate-fails-today-so-the-ci-security-audit-job-is-red-on-main),
[C-27](artifacts/current-state-findings.md#c-27-transitive-nanoid-comes-from-postcss-github-actions-in-ci-are-behind-their-latest-majors)); the convention is kept
([C-5](artifacts/current-state-findings.md#c-5-the-root-overrides-block-is-the-repos-convention-for-security-floors-on-transitive-dependencies)).

**Depends on.** S-1.

**Decision.** [D-6](artifacts/change-decision-log.md#d-6-overrides-raised-convention-kept)

### S-6: `bun-types` in eight manifests — Re-scoped

**Target state.** `packages/{bun-helpers,claude-integration,cli,data,evals,execution,sandbox-integration,web}/package.json`
each declare `"bun-types": "^1.4.2"`. No manifest declares `latest` or `^1.3.11` for it. The caret may later resolve a
newer 1.x types release than the pinned runtime; that drift is acceptable because the types are additive.

**Behavior.** Preserving. Typecheck passes under 1.4.2 types ([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).

**Why.** Two divergent policies for one package ([C-4](artifacts/current-state-findings.md#c-4-dependency-ranges-mix-latest-caret-floors-and-a-major-version-type-mismatch)); types should match the runtime (E-5).

**Depends on.** S-1.

**Decision.** [D-7](artifacts/change-decision-log.md#trivial-decisions)

### S-7: non-major workspace dependency ranges — Re-scoped

**Target state.** The workspace manifests declare:

- `packages/cli/package.json`: `"cli-table3": "^0.6.5"`, `"yargs": "^18.2.0"`; devDependencies `"@types/yargs": "^17.0.35"`.
- `packages/data/package.json`: `"@duckdb/node-api": "^1.5.5-r.5"` (resolves 1.5.5-r.5).
- `packages/web/package.json` dependencies: `"hono": "^4.13.8"`, `"picomatch": "^4.0.7"`, `"yargs": "^18.2.0"`;
  devDependencies: `"@tailwindcss/vite": "^4.3.3"`, `"@types/yargs": "^17.0.35"`, `"@vitejs/plugin-react": "^6.1.1"`,
  `"tailwindcss": "^4.3.3"`, `"vite": "^8.3.0"`.

`@types/yargs` 17.0.35 is the newest published and yargs 18 ships no types, so it stays the type source for the seven
`import type { Argv } from 'yargs'` sites. The lockfile carries exactly one `tailwindcss` resolution (4.3.3) instead of
today's two.

**Behavior.** Preserving. API responses from the built server are byte-identical before and after, and Parquet files
written by DuckDB 1.5.2 and 1.5.5 read interchangeably ([C-33](artifacts/current-state-findings.md#c-33-the-upgraded-dashboard-renders-the-same-dom-as-the-baseline-except-for-one-react-router-attribute-apis-and-parquet-files-are-interchangeable-across-the-duckdb-bump)).

**Why.** "Update all dependencies"; `hono`, `vite`, `picomatch` clear advisories ([C-2](artifacts/current-state-findings.md#c-2-bun-audit---audit-levelmoderate-fails-today-so-the-ci-security-audit-job-is-red-on-main)).

**Depends on.** S-1.

**Decision.** [D-3](artifacts/change-decision-log.md#d-3-dependency-range-policy), [D-8](artifacts/change-decision-log.md#trivial-decisions), [D-9](artifacts/change-decision-log.md#d-9-duckdb-takes-a-caret-like-everything-else), [D-20](artifacts/change-decision-log.md#trivial-decisions)

### S-8: React packages in `packages/web/package.json` — Re-scoped

**Target state.** `"react": "^19.3.0"`, `"react-dom": "^19.3.0"` in dependencies; `"@types/react": "^19.3.0"`,
`"@types/react-dom": "^19.3.0"` in devDependencies. The client still mounts with `createRoot` inside `React.StrictMode`.

**Behavior.** Preserving, on the evidence available: with fixture data, every route renders the same tags, attributes,
and text as on React 18 (the one attribute difference belongs to S-10); the SCIL and ACIL history pages were compared
in the error state they show on both builds, and the markdown sections were not exercised in the browser
([C-33](artifacts/current-state-findings.md#c-33-the-upgraded-dashboard-renders-the-same-dom-as-the-baseline-except-for-one-react-router-attribute-apis-and-parquet-files-are-interchangeable-across-the-duckdb-bump)).
No removed or changed React API is used ([C-10](artifacts/current-state-findings.md#c-10-react-usage-is-already-react-18-idiomatic-the-only-react-19-sensitive-pattern-is-the-global-jsxelement-annotation),
[C-25](artifacts/current-state-findings.md#c-25-nothing-in-the-client-touches-the-apis-react-19-or-react-router-7-change)).

**Why.** "Include the majors" ([scope-boundary.md](artifacts/scope-boundary.md)); nothing removed in 19 is used (E-7).

**Depends on.** S-7 (`@vitejs/plugin-react` 6.1.1, `vite` 8.3.0).

**Decision.** [D-10](artifacts/change-decision-log.md#d-10-react-19-and-the-jsx-type-import)

### S-9: react import line in seven page components — Re-scoped

**Target state.** `packages/web/src/client/pages/{AcilDetail,AcilHistory,PerTestAnalytics,ScilDetail,ScilHistory,TestRunHistory}.tsx`
line 1 reads `import { type JSX, useEffect, useState } from 'react'`; `TestRunDetail.tsx` line 2 reads
`import { Fragment, type JSX, useEffect, useState } from 'react'`. The `(): JSX.Element` return annotations are
unchanged and resolve to React's exported `JSX` namespace. Specifiers are in the order Biome's `organizeImports`
expects, so `bunx biome check packages/web/src/client/pages` exits 0.

**Behavior.** Preserving. Type-only import; no emitted code.

**Why.** `@types/react` 19 removes the global `JSX` namespace; without the import the seven sites fail with TS2503
([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit), E-7).

**Depends on.** S-8 (same unit).

**Decision.** [D-10](artifacts/change-decision-log.md#d-10-react-19-and-the-jsx-type-import)

### S-10: `react-router-dom` in `packages/web/package.json` — Re-scoped

**Target state.** `"react-router-dom": "^7.18.4"`. Every import site (`BrowserRouter`, `Routes`, `Route`, `Link`,
`NavLink`, `useParams`) keeps importing from `react-router-dom`, which in v7 is `export * from "react-router"` plus
`RouterProvider`/`HydratedRouter`. No `future` prop exists on `BrowserRouter`.

**Behavior.** Changing. Every anchor rendered by `Link`/`NavLink` carries `data-discover="true"` (invisible; visible to
anything reading the DOM), and navigations are wrapped in `startTransition`. Pages render the same elements and text
otherwise, both on React 19 and — the state Unit 3 produces before Unit 4 — on React 18
([C-33](artifacts/current-state-findings.md#c-33-the-upgraded-dashboard-renders-the-same-dom-as-the-baseline-except-for-one-react-router-attribute-apis-and-parquet-files-are-interchangeable-across-the-duckdb-bump),
[C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).
Operator answer: "Take React Router 7.18.4 (Recommended)".

**Why.** Two advisories are patched only in 7.18.0 ([C-2](artifacts/current-state-findings.md#c-2-bun-audit---audit-levelmoderate-fails-today-so-the-ci-security-audit-job-is-red-on-main));
"Include the majors".

**Depends on.** S-7.

**Decision.** [D-11](artifacts/change-decision-log.md#d-11-react-router-7-through-react-router-dom-no-intermediate-step)

### S-11: `marked` in `packages/web/package.json` — Re-scoped

**Target state.** `"marked": "^18.0.13"`. The two call sites in `TestRunDetail.tsx` (`marked(resultText) as string`,
`marked(file.fileContent) as string`) are unchanged; `marked()` still returns a string synchronously.

**Behavior.** Changing. In the HTML string `marked()` returns, the blank lines after a raw HTML block are dropped
(`</div>\n\n\n<p>` becomes `</div><p>`); tables, nested and loose lists, task lists, fenced code with trailing blank
lines, blockquotes, and inline markup are byte-identical. Whitespace between block elements does not render, so a
person reading a run's "Full Output" sees the same page; a snapshot or scraper of the HTML sees the difference
([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit) Stage E).
Operator answer: "Take marked 18.0.13 (Recommended)".

**Why.** "Include the majors"; no renderer or option in use is touched by 16/17/18 (E-9,
[C-12](artifacts/current-state-findings.md#c-12-marked-renders-model-output-straight-into-dangerouslysetinnerhtml-at-two-sites-with-no-options-sanitizer-or-error-boundary)).

**Depends on.** S-7.

**Decision.** [D-12](artifacts/change-decision-log.md#d-12-marked-18-with-no-code-change)

### S-12: `biome.json` — Re-scoped

**Target state.** `"$schema"` is `https://biomejs.dev/schemas/2.5.14/schema.json` and the linter block opens with
`"preset": "recommended"` in place of `"recommended": true`; every other key is unchanged. This is exactly what
`bunx biome migrate --write` writes for 2.5.14, when run after the 2.5.14 binary is installed.

**Behavior.** Preserving. 247 warnings, 0 errors before and after ([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).

**Why.** Biome pins the schema per version and `migrate` is its documented upgrade path (E-10).

**Depends on.** S-3.

**Decision.** [D-13](artifacts/change-decision-log.md#trivial-decisions)

### S-13: `Makefile` build target `--external` list — Re-scoped

**Target state.** Both `bun build … --compile` invocations carry a single `--external '@duckdb/node-bindings-*'` in place
of the six per-platform lines. Every current and future DuckDB platform package is excluded from the bundle and
resolved at runtime from `node_modules`, as today. The relink step below is unchanged.

**Behavior.** Preserving. Both binaries build and run, the binding is still resolved at runtime, and the binary size is
unchanged ([C-30](artifacts/current-state-findings.md#c-30-duckdbnode-bindings155-r5-adds-two-musl-platform-packages-make-build-fails-until-they-are---external)).

**Why.** `@duckdb/node-bindings` 1.5.5-r.5 references two new musl packages; `bun build` fails to resolve them with the
old list ([C-30](artifacts/current-state-findings.md#c-30-duckdbnode-bindings155-r5-adds-two-musl-platform-packages-make-build-fails-until-they-are---external)).
The wildcard is the strictly simpler form that satisfies the same evidence and does not need editing when DuckDB adds
another platform.

**Depends on.** Lands in the same unit as S-7's `@duckdb/node-api` resolution.

**Decision.** [D-14](artifacts/change-decision-log.md#d-14-makefile-externals-for-the-musl-bindings)

### S-14: `.github/workflows/ci.yml` `actions/checkout` — Re-scoped

**Target state.** All seven jobs use `actions/checkout@v7`. `oven-sh/setup-bun@v2` and every `run:` line are unchanged.

**Behavior.** Preserving for this workflow. The checked-out tree is the same; v5 moved the action to Node 24, v6 stores
credentials in a separate file, v7 blocks fork checkout on `pull_request_target`/`workflow_run` triggers, none of
which this workflow uses ([C-27](artifacts/current-state-findings.md#c-27-transitive-nanoid-comes-from-postcss-github-actions-in-ci-are-behind-their-latest-majors)).

**Why.** "Update all dependencies" with `ci.yml` inside the confirmed area; the reviewer's question whether a GitHub
Action counts was put to the operator, who answered "Include it, as the last unit (Recommended)".

**Depends on.** Last unit; independent of every other entry.

**Decision.** [D-15](artifacts/change-decision-log.md#d-15-actionscheckout-v7-as-the-last-unit)

### S-15: version statements in docs — Re-scoped

**Target state.** These lines read as follows after the change.

- `README.md` Prerequisites — the Bun bullet becomes:
  `- **Bun 1.4.2** — the CLI and web app are built with Bun; the root ` `package.json` ` pins ` `"packageManager": "bun@1.4.2"` ` and CI installs that version. Install from [bun.sh](https://bun.sh).`
  A new bullet follows it:
  `- **Node.js 22.12 or newer on ` `PATH` `** — Vitest runs its test workers under ` `node` `; without it the tests that stub ` `Bun` ` globals fail with "Attempting to change configurable attribute of unconfigurable property". Needed only to run the test suite.`
- `docs/project-discovery.md:16` `- Package manager: Bun` → `- Package manager: Bun 1.4.2 (pinned by ` `"packageManager"` ` in the root ` `package.json` `)`
- `docs/project-discovery.md:22` `- Test: Vitest ^4.1.0` → `- Test: Vitest ^5.0.1`
- `docs/project-discovery.md:91` `- Frontend: React 18 + React Router 6` → `- Frontend: React 19 + React Router 7`
- `docs/web.md:13` "…a React 18 + Tailwind v4 SPA client, built with Vite 8" → "…a React 19 + Tailwind v4 SPA client, built with Vite 8"
- `docs/web.md:15` "Client uses React Router v6 for SPA navigation…" → "Client uses React Router v7 for SPA navigation…"
- `CLAUDE.md:33` "`packages/web` (Hono + React 18 + Tailwind v4)" → "`packages/web` (Hono + React 19 + Tailwind v4)"
- `docs/coding-standards/vitest-mocking-patterns.md:91` the comment `// Don't skip clearAllMocks — previous test's call counts leak into assertions` → `// Keep clearAllMocks explicit — Vitest 5 clears call history before each test by default, but the call documents the intent`

**Behavior.** Preserving.

**Why.** The lines state versions this change moves ([C-24](artifacts/current-state-findings.md#c-24-four-documents-state-versions-the-upgrade-changes));
Node is a real prerequisite nobody wrote down ([C-28](artifacts/current-state-findings.md#c-28-vitest-workers-run-under-whatever-node-is-on-path-without-one-they-run-under-bun-and-the-five-bun-stubbing-test-files-fail));
the mocking standard's rationale becomes untrue under Vitest 5 (E-6).

**Decision.** [D-16](artifacts/change-decision-log.md#trivial-decisions), [D-17](artifacts/change-decision-log.md#d-17-node-prerequisite-documented-not-enforced)

## Behavior Changes

Five entries change something an observer can see. The operator decided each one on 2026-09-21.

- **S-1 — the Bun pin.** Who sees it: whoever watches CI. What changes: CI installs Bun 1.4.2 on every run instead of
  the newest release of the day; a new Bun release is adopted by editing one line. Decision: "Pin it (Recommended)".
- **S-3 — Vitest 5's mock-clearing default.** Who sees it: a developer writing a new test. What changes: mock call
  history is cleared before every test; an unawaited async assertion or an `expect.poll` timeout fails the test. Every
  existing test passes. Decision: "Accept the new default (Recommended)".
- **S-4 — TypeScript declared at 7.0.2.** Who sees it: a developer running `bunx tsc` or whose editor uses the
  workspace TypeScript. What changes: the compiler is 7.0.2 instead of the Homebrew 5.9.3; CI would download 7.0.2
  today, so its version is unchanged. Decision: "Declare TypeScript ^7.0.2 (Recommended)".
- **S-10 — React Router 7.** Who sees it: anything that reads the dashboard's HTML. What changes: every router link
  carries `data-discover="true"`; navigations run inside `startTransition`. Pages look and read the same. Decision:
  "Take React Router 7.18.4 (Recommended)".
- **S-11 — marked 18.** Who sees it: anything that reads the HTML string `marked()` returns. What changes: the blank
  lines after a raw HTML block are dropped; rendering is identical. Decision: "Take marked 18.0.13 (Recommended)".

S-14 (`actions/checkout@v7`) is behavior-preserving, but its place in scope was itself put to the operator, who
answered "Include it, as the last unit (Recommended)".

## Change Units

Every unit ends with the same gate, run from the repo root with Node 22.x on `PATH`:

1. `bun --version` prints `1.4.2`.
2. `bun run lint` exit 0 (0 errors; the 247 warnings are pre-existing), `bun run format:check` exit 0, `bun run typecheck` exit 0.
3. `bun run test` — 934 pass; `bun run test:integration` — 64 pass.
4. `make build` exit 0, then `git status --porcelain bun.lock` prints nothing (the target's unfrozen `bun install` must
   not rewrite the lockfile).
5. `./harness --help` prints the eight commands. This proves more than it looks: the CLI imports every command at
   startup, which loads the DuckDB native binding and runs `resolveRelativePath` for the two sandbox scripts. So a
   compiled binary that cannot find its binding or no longer detects its `$bunfs` path fails here
   ([C-15](artifacts/current-state-findings.md#c-15-bun-specific-api-surface-is-small-and-one-helper-bets-on-importmetadir-and-the-bunfs-prefix),
   [C-18](artifacts/current-state-findings.md#c-18-duckdbs-native-binding-loads-at-import-time-for-every-cli-command-through-an-unchecked-cast-layer)).
   Run it from the repo root; the binding resolves against the cwd's `node_modules` ([C-33](artifacts/current-state-findings.md#c-33-the-upgraded-dashboard-renders-the-same-dom-as-the-baseline-except-for-one-react-router-attribute-apis-and-parquet-files-are-interchangeable-across-the-duckdb-bump)).

The baseline numbers are in [C-3](artifacts/current-state-findings.md#c-3-baseline-on-bun-1311--every-other-ci-check-passes-the-build-works-and-the-compiled-cli-runs).

Manifests are edited by hand to the literals in the Surface Delta and installed with `bun install`; `bun update` is not
used in any unit.

The units land as one pull request with one commit per unit, each commit carrying its manifest
edits and the resulting `bun.lock` together. Reverting a unit is `git revert <sha>` followed by
`bun install --frozen-lockfile` and the gate; a revert of such a commit restores a state where the frozen install
reports no changes ([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit),
[D-18](artifacts/change-decision-log.md#d-18-hand-edited-manifests-one-major-per-unit)).

`main` has no branch
protection, so a red job between units blocks nothing; the gate is the discipline.

### Unit 1: Pin Bun 1.4.2

**What it does.** Installs Bun 1.4.2 locally, adds the `packageManager` field, and updates the Bun lines in `README.md`
and `docs/project-discovery.md`, plus the README's Node bullet (the failure it describes exists today).

**Delta entries.** S-1, S-2, S-15 (Bun lines and the Node bullet).

**Ordering constraint.** First, so that every later unit's lockfile is written by 1.4.2.

**How you know it worked.** Before starting, `bun pm view bun version` prints `1.4.2`; if it prints something newer,
stop and decide whether the plan's literal stands or the newer release is re-verified (Open Items). Install with
`curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"` (`bun upgrade` takes no version and installs the newest).
Then `bun --version` prints `1.4.2`; `bun install --frozen-lockfile` exits 0 and `git status` shows `bun.lock`
unchanged; the gate passes. This state — the base commit under 1.4.2, including `make build` with the current DuckDB —
was executed ([C-29](artifacts/current-state-findings.md#c-29-bun-142-runs-this-repo-unchanged-and-does-not-rewrite-the-v1-lockfile)).
`bun audit` is still red.

### Unit 2: Minors, patches, floors, and tooling

**What it does.** Moves every non-major dependency to its newest release, unifies `bun-types`, raises the override
floors, declares TypeScript, replaces the Makefile's per-platform externals with the wildcard, bumps Biome and runs its
migration, and takes Vitest to 4.1.11 (the last 4.x).

**Delta entries.** S-3 (Biome; Vitest at `^4.1.11`), S-4, S-5, S-6, S-7, S-12, S-13.

**Ordering constraint.** After Unit 1; before Units 3–6 (both Vitest versions take `vite` as a peer, which the override
pins to 8.3.0; the majors' peers are satisfied by these versions).

**How you know it worked.** Do the Biome step in this order: edit `@biomejs/biome` to `^2.5.14` → `bun install` →
`bunx biome migrate --write` → `git diff biome.json` shows exactly the S-12 change (run before the install, the 2.4.12
binary migrates nothing). Before the first `make build`, run `rm -rf node_modules && bun install --frozen-lockfile`
so the relink cannot pick a stale 1.5.2 store entry. Then the gate passes, plus these checks:

- `bun outdated --filter '*'` lists only `react`, `react-dom`, `@types/react`, `@types/react-dom`, `react-router-dom`,
  `marked`, `vitest`.
- `bun audit --audit-level=moderate` lists only `react-router` / `react-router-dom` /
  `@remix-run/router` entries (`hono`, `vite`, `postcss`, `nanoid`, `vitest` are gone).
- `ls node_modules/.bin/tsc` exists and `grep -c '"typescript@7' bun.lock` prints 1.
- `cd packages/data && bunx tsc --version` prints `Version 7.0.2`.
- `grep -oE '"tailwindcss@[^"]+"' bun.lock | sort -u` prints exactly `"tailwindcss@4.3.3"`.
- `readlink node_modules/@duckdb/node-bindings-$(bun -e "process.stdout.write(process.platform+'-'+process.arch)")`
  contains `1.5.5-r.5`.
- `./harness update-analytics-data` exits 0.

The lockfile diff for this unit includes 21 `@typescript/*` platform entries and 2 DuckDB musl entries; they are
expected, not noise. On push, read the CI jobs with the attribution rule under Risks.

### Unit 3: React Router 7

**What it does.** Moves `react-router-dom` to 7.18.4 and updates the two docs lines that name React Router.

**Delta entries.** S-10, S-15 (Router lines).

**Ordering constraint.** After Unit 2.

**How you know it worked.** The gate passes with no source change; `grep -c '@remix-run/router' bun.lock` prints 0.
**`bun audit --audit-level=moderate` prints "No vulnerabilities found"** — the first green audit. On push, the CI
Security Audit job is green. This exact state (Router 7 on React 18) passed the gate and rendered the same DOM as the
baseline apart from `data-discover` ([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).
Manual: open `/`, `/runs/:runId`, `/scil`, `/acil`, `/analytics` and confirm the NavBar active state follows the route.

### Unit 4: React 19

**What it does.** Moves `react`, `react-dom`, `@types/react`, `@types/react-dom` to 19.3.0 and adds the `type JSX`
import in the seven page files; updates the docs lines that name React.

**Delta entries.** S-8, S-9, S-15 (React lines).

**Ordering constraint.** After Unit 2. Independent of Unit 3 (`react-router-dom@7` accepts React 18 and 19, and
`react-router-dom@6` accepts React 19, E-8), so either can be reverted alone.

**How you know it worked.** The gate passes (typecheck proves the seven TS2503 errors are gone). `bunx biome check
packages/web/src/client/pages` exits 0, and the audit stays green. The dashboard pages render as in Unit 3.

### Unit 5: Vitest 5

**What it does.** Moves `vitest` to 5.0.1 with no config change; updates the Vitest line in
`docs/project-discovery.md` and the comment in `vitest-mocking-patterns.md`.

**Delta entries.** S-3 (Vitest at `^5.0.1`), S-15 (Vitest line, mocking-standard comment).

**Ordering constraint.** After Unit 2.

**How you know it worked.** `bun run test` 934 pass, `bun run test:integration` 64 pass, `make test` 998 pass
([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit));
`grep -oE '"vite@[^"]+"' bun.lock | sort -u` prints one `vite@8.x` line; the gate passes.

### Unit 6: marked 18

**What it does.** Moves `marked` to 18.0.13.

**Delta entries.** S-11.

**Ordering constraint.** After Unit 2.

**How you know it worked.** Before editing, copy `artifacts/marked-sample.mjs` into `packages/web/` and run
`bun ./marked-sample.mjs > /tmp/marked-before.txt`. After `bun install`, run it again to `/tmp/marked-after.txt` and
delete the copy. `diff` shows exactly one hunk: the blank lines after the raw `<div>` block are gone. The gate passes;
`bun outdated --filter '*'` prints nothing. Manual: a run's "Full Output" section and an output file look as before.

### Unit 7: `actions/checkout@v7`

**What it does.** Bumps the checkout action in all seven CI jobs.

**Delta entries.** S-14.

**Ordering constraint.** Last and alone, so a red run is attributable and revertible without touching the upgrade.

**How you know it worked.** All seven jobs are green on the pull request.

## Risks

- **Linux CI is the one environment the dry run did not cover.** Everything in [C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)
  ran on macOS arm64. If Unit 2's push turns a job red, use this attribution rule, by job:
  - **Unit Tests and Integration Tests red together** → the DuckDB `linux-x64` binding (its new loader picks glibc or musl via `detect-libc`,
    [C-30](artifacts/current-state-findings.md#c-30-duckdbnode-bindings155-r5-adds-two-musl-platform-packages-make-build-fails-until-they-are---external)).
    Two unit-test files load the binding unmocked (`packages/data/src/analytics.unit.test.ts`,
    `packages/data/src/connection.test.ts`), as does `analytics.integration.test.ts`, so the blast radius is both test
    jobs, not one.
  - **Unit Tests red alone** → Vitest 4.1.11, hono, or yargs.
  - **Type Check red** → the first Linux
    execution of TypeScript 7.0.2, a native compiler distributed through 21 platform packages
    ([C-9](artifacts/current-state-findings.md#c-9-typescript-is-undeclared-bunx-tsc-resolves-a-path-binary-locally-and-downloads-typescriptlatest-702-in-ci)).
  - **Lint or Format red** → the Biome 2.5.14 Linux binary.
  - **Lockfile Integrity red** → the lockfile was written by a
    Bun other than 1.4.2, or a gate step rewrote it.
  - **Security Audit red** → expected until Unit 3.
- **The Makefile is macOS-only and no CI job builds the binaries.** `cp $$DUCKDB_DIR/libduckdb.dylib` has no Linux
  branch, and on Linux the relink's `-path "*node-bindings-linux-x64*"` would also match the new `-musl` package. A
  build-only regression is caught by the gate on a developer machine, never by CI (this is how
  [C-30](artifacts/current-state-findings.md#c-30-duckdbnode-bindings155-r5-adds-two-musl-platform-packages-make-build-fails-until-they-are---external)
  was found). The relink still searches the store with `find … | head -1`. With two DuckDB versions in a stale store,
  it can pick the older one, which Unit 2's `rm -rf node_modules` step avoids. If `find` ever returns nothing, the
  step deletes the real bindings directory before failing
  ([C-19](artifacts/current-state-findings.md#c-19-make-build-relinks-the-duckdb-binding-by-searching-buns-isolated-store-and-fails-destructively-if-the-search-misses));
  not triggered by this change (E-2); the guard is deferred below.
- **Newer patch releases on build day.** The carets admit them; a proof that names an exact version (e.g. `vite@8.3.0`)
  is then a minimum. If a newer patch misbehaves, pin the literal from this plan and retry.
- **Vitest workers under Bun.** One unconfirmed report of worker memory growth applies only when no `node` is on `PATH`
  (E-6, [C-28](artifacts/current-state-findings.md#c-28-vitest-workers-run-under-whatever-node-is-on-path-without-one-they-run-under-bun-and-the-five-bun-stubbing-test-files-fail));
  CI's runner has Node, so it cannot fire there.
- **`make dev` was not exercised.** It depends on `dist/client` existing and has no proxy
  ([C-20](artifacts/current-state-findings.md#c-20-make-dev-runs-vite-on-5173-and-hono-on-3099-with-no-proxy-the-server-embeds-distclient-at-import-time));
  none of that changes here, but a Vite 8.3 dev-server regression would surface there first.

## Deferred (YAGNI)

### Makefile relink guard
**Why deferred:** evidence test — defensive code for a failure that has not occurred; the store search succeeds under 1.4.2 with the new bindings ([C-30](artifacts/current-state-findings.md#c-30-duckdbnode-bindings155-r5-adds-two-musl-platform-packages-make-build-fails-until-they-are---external), E-2).
**Reopen when:** a `make build` fails with an empty `DUCKDB_DIR`, a Bun release changes the `node_modules/.bun` layout, or the first Linux `make build` is attempted (the `.dylib` line and the musl-overlapping `find` pattern both need work then).
**Source:** behavioral-analyst B1 ([C-19](artifacts/current-state-findings.md#c-19-make-build-relinks-the-duckdb-binding-by-searching-buns-isolated-store-and-fails-destructively-if-the-search-misses)); software-architect §3; devops-engineer finding 6.

### A CI job that runs `make build`
**Why deferred:** evidence test — no build-only regression has reached `main`; the gate on a developer machine caught the one this plan found.
**Reopen when:** a build-only regression reaches `main`, or a Linux build target is added to the Makefile.
**Source:** devops-engineer finding 6.

### SHA-pinned `uses:` lines in `ci.yml`
**Why deferred:** evidence test — `oven-sh/setup-bun@v2` and `actions/checkout@v7` float within their majors and `ubuntu-latest` floats as an image; none has broken CI. Hardening, not an update.
**Reopen when:** a floating action or image release breaks CI, or the repo adopts Dependabot/Renovate for actions.
**Source:** devops-engineer finding 4.

### `ci-checks` script switched from `npm run` to `bun run`
**Why deferred:** evidence test — CI never calls it and `npm run` works with the `packageManager` pin present (verified in the scratch clone; corepack 0.34 installed and not intercepting).
**Reopen when:** `npm run ci-checks` fails on a developer machine (a corepack-enabled shim may refuse a `bun` `packageManager`), or CI adopts the script.
**Source:** [C-13](artifacts/current-state-findings.md#c-13-three-vitest-configs-and-three-invocation-paths); software-architect §3; devops-engineer YAGNI note.

### `actions/setup-node` step or `engines.node`
**Why deferred:** evidence test — the `ubuntu-latest` image ships Node 22.23.2, above Vitest 5's 22.12 floor ([C-28](artifacts/current-state-findings.md#c-28-vitest-workers-run-under-whatever-node-is-on-path-without-one-they-run-under-bun-and-the-five-bun-stubbing-test-files-fail)); the README bullet is the simpler version. A Makefile preflight that names Node when it is missing was suggested by the test engineer; the README bullet now quotes the failure message so the error is searchable.
**Reopen when:** the runner image's default Node drops below 22.12, Vitest reports an engine error in CI, or a developer without Node hits the failure despite the README.
**Source:** [C-28](artifacts/current-state-findings.md#c-28-vitest-workers-run-under-whatever-node-is-on-path-without-one-they-run-under-bun-and-the-five-bun-stubbing-test-files-fail); software-architect §3; test-engineer finding 4.

### Root `vite` declaration for Vitest's peer
**Why deferred:** evidence test — Bun auto-installs the peer and the override pins it to one version ([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).
**Reopen when:** a Bun release stops auto-installing peers, or `bun pm ls` shows two `vite` versions.
**Source:** E-6; software-architect §3.

### Explicit dependency-range policy (ADR, exact pins, or a Bun `catalog`)
**Why deferred:** evidence test — no range drift has broken anything; the carets `bun update --latest` writes are the tool's own form ([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).
**Reopen when:** a range drift turns CI red, or the team wants manifest-reproducible installs without the lockfile.
**Source:** [C-4](artifacts/current-state-findings.md#c-4-dependency-ranges-mix-latest-caret-floors-and-a-major-version-type-mismatch); software-architect §3.

### Client component tests with a DOM environment
**Why deferred:** evidence test — no major forces them; the built dashboard was compared in a browser instead ([C-33](artifacts/current-state-findings.md#c-33-the-upgraded-dashboard-renders-the-same-dom-as-the-baseline-except-for-one-react-router-attribute-apis-and-parquet-files-are-interchangeable-across-the-duckdb-bump)).
**Reopen when:** a React or React Router regression reaches a dashboard user.
**Source:** [C-10](artifacts/current-state-findings.md#c-10-react-usage-is-already-react-18-idiomatic-the-only-react-19-sensitive-pattern-is-the-global-jsxelement-annotation); structural-analyst S10.

## Cut for Scope

- **React Router 8, or switching imports from `react-router-dom` to `react-router`.** Would move the dashboard to the
  current major (8.4.0) and drop the shim package that v8 removes. Cut: the boundary names "React Router 6→7" and
  records "nothing is being replaced" ([scope-boundary.md](artifacts/scope-boundary.md) Operator-Stated Scope,
  Direction of Travel). Reopen on request; the shim's removal in v8 (E-8) is the natural trigger.
- **A sanitizer (DOMPurify) and an error boundary around `marked` output.** Would stop model-written HTML from
  reaching the DOM unfiltered and keep one bad render from blanking the page. Cut: pre-existing behavior the work item
  does not ask about ([C-12](artifacts/current-state-findings.md#c-12-marked-renders-model-output-straight-into-dangerouslysetinnerhtml-at-two-sites-with-no-options-sanitizer-or-error-boundary)).
- **Fixing the `/api/scil` and `/api/acil` 500 (`JSON.stringify cannot serialize BigInt`).** Would make the SCIL and
  ACIL history pages load for data shaped like the analytics fixtures. Cut: it fails identically before and after the
  upgrade ([C-33](artifacts/current-state-findings.md#c-33-the-upgraded-dashboard-renders-the-same-dom-as-the-baseline-except-for-one-react-router-attribute-apis-and-parquet-files-are-interchangeable-across-the-duckdb-bump)),
  so it is a defect to investigate on its own, not part of "update all dependencies".
- **Removing the unused `cli-table3` and `picomatch` declarations.** Would shrink the dependency graph by two packages
  nothing imports ([C-6](artifacts/current-state-findings.md#c-6-cli-table3-and-picomatch-are-declared-but-never-imported)).
  Cut: removal is not an update, and dynamic loading outside `packages/*/src` was not ruled out.
- **Replacing `bun-types` with `@types/bun`.** Bun's guide now recommends `@types/bun` (E-5). Cut: a replacement, and
  Direction of Travel says nothing is being replaced.
- **Resilience fixes on the spawn boundary** (timeouts, streaming `TextDecoder`, `stderr` capture, the error
  hierarchy) recorded in [C-22](artifacts/current-state-findings.md#c-22-the-process-spawn-boundary-has-no-timeouts-decodes-chunks-without-streaming-mode-and-discards-sandbox-stderr)
  and [C-23](artifacts/current-state-findings.md#c-23-json-line-parsing-and-error-typing-are-inconsistent-across-the-pipeline).
  Cut: pre-existing, unaffected by the versions moved here (Bun 1.4's spawn changes touch arguments the code never
  passes, E-3).

## Open Items

- **Who bumps the Bun pin, and when** (non-blocking). The pin makes CI lag behind Bun releases on purpose; no owner or
  cadence is recorded anywhere. The builder inherits the question; a one-line note in the README's Bun bullet would
  settle it.
- **Is 1.4.2 still the newest Bun on build day** (non-blocking, decided at Unit 1). If `bun pm view bun version`
  prints a newer release, either keep this plan's literal (verified) or re-run the discovery checks in
  [C-29](artifacts/current-state-findings.md#c-29-bun-142-runs-this-repo-unchanged-and-does-not-rewrite-the-v1-lockfile)
  and [C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)
  against the newer one before pinning it.
- **Linux behavior of the new DuckDB loader and of TypeScript 7** (non-blocking). Settled by the first CI run after
  Unit 2, read with the attribution rule under Risks.

## Review Findings

Specialists engaged: `han-core:junior-developer` (generalist stress-test), `han-core:test-engineer` (verification),
`han-core:devops-engineer` (CI, build boundary, rollout); one round (medium cap: two). The architect's proposal came
from `han-core:software-architect`. Findings were merged by substance; every one below is closed, and the decision it
produced is in [artifacts/change-decision-log.md](artifacts/change-decision-log.md).

**Findings that changed the plan.**
- `@duckdb/node-api` could not move under the plan's own mechanism while its range stayed `latest` (junior F-1,
  blocking). Resolved by executing the alternative: a caret on DuckDB's `-r.N` scheme was tested and adopted, with the
  `bun update` caveat recorded ([D-9](artifacts/change-decision-log.md#d-9-duckdb-takes-a-caret-like-everything-else)).
- One wildcard `--external` replaces the per-platform list (junior F-6). Verified with `--compile`; adopted
  ([D-14](artifacts/change-decision-log.md#d-14-makefile-externals-for-the-musl-bindings)).
- marked 18 changes the HTML string on a wider sample (test-engineer 1). Executed; S-11 reclassified Changing and
  put to the operator ([D-12](artifacts/change-decision-log.md#d-12-marked-18-with-no-code-change)).
- `actions/checkout@v7` is not one of the named majors (junior F-7). Put to the operator; included
  ([D-15](artifacts/change-decision-log.md#d-15-actionscheckout-v7-as-the-last-unit)).
- "CI already runs TypeScript 7.0.2" was an inference; no CI run has executed it (devops 3). S-4, D-5, and Risks
  reworded; the 21 platform entries named.
- The Router-7-on-React-18 state Unit 3 produces was never executed (test-engineer 3). Executed: full gate and DOM
  comparison pass ([C-31](artifacts/current-state-findings.md#c-31-the-whole-upgrade-was-dry-run-in-a-scratch-clone-under-bun-142-and-every-check-passes-including-the-audit)).
- DuckDB's Linux blast radius is both test jobs, not one (devops 2); the attribution rule under Risks was rewritten.
- Unit 1 lacked the literal that installs exactly 1.4.2, and the plan assumed the registry frozen at 2026-09-21
  (devops 1, junior F-2). Both added to Unit 1, Target State, Risks, and Open Items.
- The gate could rewrite `bun.lock` unnoticed; the Biome migrate order was prose; the tailwind lockfile convergence
  and the TypeScript-from-lockfile proofs were missing (devops 5, 8; test-engineer 2; junior F-5). All added as
  literal checks in the gate and Unit 2.
- The dry-run diff disagreed with the plan on the React import order (junior F-10). Regenerated from the exact target
  state; the artifact now equals the plan.
- Three doc targets were prose (junior F-11); the mocking standard's comment becomes untrue under Vitest 5 (junior
  F-14). Exact lines added to S-15.
- The revert procedure was a promise (junior F-13). Stated under Change Units and executed once in the scratch clone.
- "Stop drifting apart" overclaimed the pin (junior F-3). Reworded; the owner question is an Open Item.

**Findings closed with evidence.**
- `bunx tsc` resolves the root binary from a workspace directory (junior Q4, F-5).
- `./harness --help` exercises `$bunfs` resolution (junior F-15, now stated in the gate).
- The Vitest 5 `clearMocks` default is fully covered by the executed suite (test-engineer 5).
- Peer ranges permit reverting Units 3 and 4 in either order (devops).
- `detect-libc` is bundled and must not be external (devops).
- The binaries' repo-root constraint is pre-existing and documented in the README (devops).
- The Vitest-under-Bun memory report cannot fire in CI (devops 7).

**Deferred or cut on review.** SHA-pinned actions and a CI build job (devops 4, 6) — Deferred with triggers; the
Makefile relink guard's trigger extended; a Node preflight (test-engineer 4) — Deferred, README quotes the error.

**Unverified.** Every Linux-only claim (DuckDB loader, TypeScript 7 binary, Biome binary on the runner) rests on the
same mechanisms already working there today and on `--frozen-lockfile` having recorded non-host platform packages
before. None could be executed by a reviewer, and none is presented as blocking.
