# Change Decision Log: Bun Runtime and Dependency Upgrade

<!--
This file records every decision committed while planning the Bun Runtime and Dependency Upgrade.
The plan itself lives in [../change-plan.md](../change-plan.md) — this file captures the
question, rationale, evidence, and rejected alternatives behind each decision.
Evidence about the code as it stands today lives in
[current-state-findings.md](current-state-findings.md) as numbered C-N findings, with E-N for
facts about the target versions.

Decisions are full or trivial. A decision is full when it has a rejected alternative, rests on
evidence beyond the operator's framing, settles a Changing entry, has dependents, or carries
dissent. Every decision settling a behavior-changing delta entry is full.

Cross-referencing invariants:
- `Settles delta entry:` — the S-N entry in ../change-plan.md this decision commits.
- `Dependent decisions:` — D-N IDs of later decisions that rest on this one.
- `Referenced in plan:` — sections of ../change-plan.md that cite this decision.
-->

## Trivial decisions

- D-2: Lockfile format — `bun.lock` stays at `lockfileVersion: 1` and is rewritten by Bun 1.4.2 as resolutions change; no format migration is planned because 1.4.2 preserves v1 (C-29). — Referenced in plan: Surface Delta (S-2).
- D-7: `bun-types` range — all eight declaring manifests read `"bun-types": "^1.4.2"`, matching the pinned runtime today; the caret may later resolve a newer 1.x types release than the exact runtime pin, which is acceptable because the types are additive and E-5 found no requirement for an exact match (C-4, E-5, C-31; junior-developer F-12). — Referenced in plan: Target State (Contracts), Surface Delta (S-6).
- D-8: `@types/yargs` — stays `^17.0.35` in `packages/cli` and `packages/web`; yargs 18 ships no types and 17.0.35 is the newest published (C-4, E-10). — Referenced in plan: Surface Delta (S-7).
- D-13: Biome — `@biomejs/biome` moves to `^2.5.14` and `biome.json` takes exactly the output of `bunx biome migrate --write` (schema URL and `"preset": "recommended"`); lint results are unchanged (C-31 Stage B, E-10). — Referenced in plan: Surface Delta (S-3, S-12), Change Units (Unit 2).
- D-16: Docs — the version strings in `README.md`, `docs/project-discovery.md`, `docs/web.md`, `CLAUDE.md`, and the `clearAllMocks` comment in `docs/coding-standards/vitest-mocking-patterns.md` are replaced by the exact lines listed in S-15 (C-24; junior-developer F-11, F-14). — Referenced in plan: Surface Delta (S-15).
- D-20: Minor and patch targets — `hono ^4.13.8`, `picomatch ^4.0.7`, `yargs ^18.2.0`, `cli-table3 ^0.6.5`, `@tailwindcss/vite` and `tailwindcss ^4.3.3` in lockstep, `@vitejs/plugin-react ^6.1.1`, `vite ^8.3.0`; API responses and Parquet files are unchanged across the DuckDB and Hono bumps (C-31, C-33, E-10). — Referenced in plan: Surface Delta (S-7), Change Units (Unit 2).

## Full decisions

### D-1: Bun pin mechanism

- **Question:** How does the project state the Bun version it runs on, so that CI and developers stop diverging?
- **Decision:** Root `package.json` gains `"packageManager": "bun@1.4.2"`, placed after `"private": true`. The CI
  workflow is not edited; `oven-sh/setup-bun@v2` reads the field. The literal `1.4.2` is repeated in `README.md` and
  `docs/project-discovery.md` and nowhere else.
- **Rationale:** The runtime is unpinned and CI already floats (C-1). `setup-bun@v2` resolves `packageManager` before
  `engines.bun` and before `latest` (E-4), so this one field pins all seven jobs with zero workflow changes. Bun
  itself enforces none of the pin forms (C-32), so the choice is about which tool reads it, not about local
  enforcement. What the pin delivers is a deterministic, deliberately lagging CI: nobody is aligned automatically,
  and someone must bump the line — who and when is an Open Item in the plan (junior-developer F-3).
- **Evidence:** C-1, C-32, E-4; operator answer 2026-09-21: "Pin it (Recommended)".
- **Behavior impact:** Changing. CI installs exactly 1.4.2 instead of the newest Bun of the day; a new release is
  adopted by editing the field. Operator answer verbatim: "Pin it (Recommended)".
- **Rejected alternatives:**
  - `.bun-version` file — rejected because `setup-bun` only reads it with a `bun-version-file:` input, which means
    editing all seven jobs, and Bun ignores the file when running (C-32, E-4).
  - `engines.bun` — rejected because `setup-bun` reads it second, and it carries npm `engines` semantics the project
    does not use; no gain over `packageManager`.
  - No pin, README only — rejected because CI would keep floating; the TypeScript drift (C-9) is the precedent for a
    CI input moving with no commit.
- **Revisit criterion:** Bun starts enforcing `packageManager` locally (then a mismatch warns developers), or the team
  adopts a version manager that reads `.bun-version`.
- **Dissent (if any):** None.
- **Settles delta entry:** S-1
- **Dependent decisions:** D-2, D-7, D-18
- **Referenced in plan:** Target State, Surface Delta (S-1), Behavior Changes, Change Units (Unit 1)

### D-3: Dependency range policy

- **Question:** After the upgrade, what range string does each manifest declare — the existing mix of `latest` and
  carets, carets of the resolved versions, or exact pins?
- **Decision:** Every declaration reads `^<resolved version>` — the form `bun update --latest` writes — including
  `@duckdb/node-api` (D-9). Manifests are hand-edited to those literals (D-18). Versions are the newest as of
  2026-09-21; a `bun install` on build day may resolve a newer patch within the carets, which is accepted.
  The exact pins in `dry-run-2026-09-21.diff` (`19.3.0`, `7.18.4`, `18.0.13`, `2.5.14`, `5.0.1`) are artifacts of
  `bun add pkg@x.y.z` and are not the target.
- **Rationale:** No range policy exists to preserve (Gaps in current-state-findings.md). "Keep `latest` everywhere" is
  not a form the tooling maintains: `bun update --latest` rewrites `latest` to a caret as a side effect (C-31 Stage
  F). Carets of the resolved version are what Bun writes, keep `bun update` meaningful, and read the same in every
  manifest.
- **Evidence:** C-4, C-29, C-31 Stage F.
- **Behavior impact:** Preserving. The lockfile pins the resolved versions either way.
- **Rejected alternatives:**
  - Keep `latest` strings everywhere — rejected because the next `bun update --latest` anyone runs rewrites them,
    and a `latest` string cannot be moved by the plan's own `bun install` mechanism (D-9, D-18).
  - Exact pins — rejected because they were never the repo's form and make `bun update` a no-op.
  - A written range policy (ADR, Bun `catalog`) — deferred under YAGNI; see the plan's Deferred section.
- **Revisit criterion:** A range drift breaks CI, or the team wants manifest-reproducible installs.
- **Dissent (if any):** None.
- **Settles delta entry:** S-3, S-6, S-7
- **Dependent decisions:** D-9, D-18
- **Referenced in plan:** Target State, Surface Delta (S-7)

### D-4: Vitest 5 with its default mock clearing

- **Question:** Vitest 5 clears mock call history before every test by default; does the project accept that or pin
  the Vitest 4 behavior?
- **Decision:** Accept the default. `vitest` moves to `^5.0.1`; `vitest.config.ts`, `vitest.integration.config.ts`,
  and `vitest.all.config.ts` stay byte-for-byte as printed in C-13.
- **Rationale:** All 934 unit, 64 integration, and 998 all-config tests pass under 5.0.1 with the configs untouched
  (C-31 Stage A), so no existing test relies on call history crossing tests. Clearing between tests is what
  `docs/coding-standards/vitest-mocking-patterns.md` already asks for. Every `vi.mock`/`vi.hoisted` is at module top
  level, so the new throw for nested calls has no target (C-26).
- **Evidence:** C-13, C-14, C-26, C-31 Stage A, E-6; operator answer 2026-09-21: "Accept the new default (Recommended)".
- **Behavior impact:** Changing. A future test expecting call history to survive from a previous test fails; unawaited
  async assertions and `expect.poll` timeouts now fail. Existing results are identical. Operator answer verbatim:
  "Accept the new default (Recommended)".
- **Rejected alternatives:**
  - `clearMocks: false` in all three configs — rejected because it preserves a mock leak the project's standard
    forbids and has no failing test behind it.
  - Stay on Vitest 4.1.11 — rejected because the operator included Vitest 5 in the majors and 4.1.11 is not latest.
- **Revisit criterion:** A test that legitimately needs cross-test call history appears (then set `clearMocks` per
  file, not globally).
- **Dissent (if any):** None.
- **Settles delta entry:** S-3
- **Dependent decisions:** D-17, D-18
- **Referenced in plan:** Surface Delta (S-3), Behavior Changes, Change Units (Unit 5)

### D-5: TypeScript declared at 7.0.2

- **Question:** The type checker is undeclared: CI downloads `typescript@latest` (7.0.2) and the local machine uses a
  Homebrew 5.9.3. Declare it, and at which version?
- **Decision:** Root `devDependencies` gains `"typescript": "^7.0.2"`. The `typecheck` script is unchanged; `bunx tsc`
  resolves `node_modules/.bin/tsc` from each workspace directory (verified in the scratch clone: `cd packages/data &&
  bunx tsc --version` → `Version 7.0.2`; `bun run typecheck` exit 0).
- **Rationale:** The compiler is the only CI input `--frozen-lockfile` does not cover, and it already moved from 5.x
  to 7.0 between May and September with no commit (C-9). 7.0.2 is npm `latest` (E-11) and is what `bunx tsc` would
  download on a runner today, so declaring it keeps CI's version and aligns local machines with it. No CI run has
  executed TypeScript 7 yet — the last run was 2026-05-15 (C-1) — so Unit 2's Type Check job is its first Linux
  execution; 7.0.2 is a native compiler distributed through 21 platform packages that enter `bun.lock` with it
  (devops-engineer finding 3). All eight packages typecheck under it on macOS (C-9, C-31).
- **Evidence:** C-9, E-11, C-31; operator answer 2026-09-21: "Declare TypeScript ^7.0.2 (Recommended)".
- **Behavior impact:** Changing. Locally, `bunx tsc` and an editor using the workspace TypeScript move from 5.9.3 to
  7.0.2; CI's version is unchanged (it would download 7.0.2 today); typecheck exits 0 under both. Operator answer verbatim: "Declare TypeScript ^7.0.2
  (Recommended)".
- **Rejected alternatives:**
  - `"typescript": "^5.9.3"` — rejected because it would move CI backwards from 7.0.2 and is not latest.
  - Leave undeclared — rejected because it leaves the drift in place.
  - `bunx tsc@7.0.2` in the script — rejected because the download still happens outside the lockfile.
- **Revisit criterion:** TypeScript 7.x introduces a check the codebase fails (then pin tighter and fix), or Bun ships
  a built-in type checker the project adopts.
- **Dissent (if any):** None.
- **Settles delta entry:** S-4
- **Dependent decisions:** —
- **Referenced in plan:** Target State, Surface Delta (S-4), Behavior Changes, Change Units (Unit 2)

### D-6: Overrides raised, convention kept

- **Question:** After the direct dependencies move, which entries in the root `overrides` block are still needed, and
  at what floors?
- **Decision:** The block reads `vite ^8.3.0`, `picomatch ^4.0.4`, `hono ^4.13.8`, `postcss ^8.5.23`. `postcss` is
  raised to the first fixed version from the audit; `vite` and `hono` are raised to match their direct ranges in
  `packages/web`; `picomatch` is untouched.
- **Rationale:** The block is the repo's stated convention for security floors on transitive packages (commit
  `27c9454`, C-5). `postcss` is declared by no manifest and is the only place its floor — and, through it, the three
  high `nanoid` advisories — can be stated (C-2, C-27). `vite` is also what forces Vitest 5's auto-installed peer and
  `packages/web`'s copy to one version (C-31). Leaving `hono ^4.12.18` would keep a floor that admits 18 advisories.
- **Evidence:** C-2, C-5, C-27, C-31.
- **Behavior impact:** Preserving. Every resolution already exceeds the new floors; the audit is clean with either
  block (C-31).
- **Rejected alternatives:**
  - Remove the block now that the audit is green — rejected because it drops the convention and the only floor for
    `postcss`/`nanoid`.
  - Remove only the entries that duplicate direct ranges (`vite`, `hono`, `picomatch`) — rejected because the
    convention is "floors are explicit" (27c9454), and removing `vite` would leave Vitest 5's peer copy unpinned.
- **Revisit criterion:** `postcss` becomes a direct dependency, or Bun `catalog` replaces overrides as the floor
  mechanism.
- **Dissent (if any):** None.
- **Settles delta entry:** S-5
- **Dependent decisions:** D-4
- **Referenced in plan:** Target State (Contracts), Surface Delta (S-5), Change Units (Unit 2)

### D-9: DuckDB takes a caret like everything else

- **Question:** Should `@duckdb/node-api` take a caret like every other dependency, given DuckDB's `X.Y.Z-r.N`
  version scheme?
- **Decision:** `packages/data/package.json` declares `"@duckdb/node-api": "^1.5.5-r.5"`; the lockfile resolves
  1.5.5-r.5.
- **Rationale:** The first draft kept `latest` because a caret on a `-r.N` version freezes plain `bun update`: in the
  scratch clone, `"^1.5.2-r.1"` plus `bun update` moved the package to `1.5.2-r.2` (the highest `-r.N` of the same
  patch), not to 1.5.5-r.5. The review (junior-developer F-1) showed the draft could not work: with `latest`
  unchanged, the plan's own mechanism — edit the manifest, run `bun install` — never re-resolves the package (C-29:
  a plain install reported "no changes" while 1.5.5-r.5 was on the registry), so Unit 2 would not have moved DuckDB
  and the Makefile change would have been dead. A caret is what `bun update --latest` wrote in the dry run (C-31), it
  moves under the hand-edit mechanism, and the executed target state passes every check with it. The cost is that
  future DuckDB patches are taken by `bun update --latest` or by editing the range, not by plain `bun update`.
- **Evidence:** C-29, C-31; scratch tests on 2026-09-21 (`^ @duckdb/node-api 1.5.5-r.5 -> 1.5.2-r.2`; re-run on the
  exact target manifests).
- **Behavior impact:** Preserving.
- **Rejected alternatives:**
  - Keep `"latest"` — rejected because `bun install` does not re-resolve it; moving it would need a `bun update`
    exception to D-18 that rewrites the string to a caret anyway.
  - `">=1.5.5-r.5"` — rejected because prerelease matching across tuples is implementation-defined and was not tested.
- **Revisit criterion:** DuckDB's Node packages drop the `-r.N` scheme, or Bun documents prerelease-range semantics.
- **Dissent (if any):** None.
- **Settles delta entry:** S-7 (DuckDB line)
- **Dependent decisions:** D-14
- **Referenced in plan:** Target State (Contracts), Surface Delta (S-7), Review Findings

### D-10: React 19 and the JSX type import

- **Question:** What does React 19 require of the client code, and how is the `JSX` namespace change absorbed?
- **Decision:** `react`, `react-dom` → `^19.3.0`; `@types/react`, `@types/react-dom` → `^19.3.0`. In the seven page
  files the react import gains `type JSX` in Biome's sorted position: `import { type JSX, useEffect, useState } from
  'react'` (and `import { Fragment, type JSX, useEffect, useState } from 'react'` in `TestRunDetail.tsx`). The
  `(): JSX.Element` annotations stay.
- **Rationale:** `@types/react` 19 removes the global `JSX` namespace (E-7); the seven annotations are the only
  React-19-sensitive pattern in the client (C-10, C-25). The import form was executed: typecheck, lint, format, `biome
  check`, and `vite build` pass (C-31 Stage C, plus the `biome check` verification that produced the sorted order).
  The built dashboard renders identical DOM to React 18 apart from the router attribute in D-11 (C-33).
- **Evidence:** C-10, C-25, C-31, C-33, E-7.
- **Behavior impact:** Preserving.
- **Rejected alternatives:**
  - Delete the seven return annotations and let inference produce `React.JSX.Element` — rejected only because it was
    not exercised; acceptable if the builder prefers it and typecheck confirms.
  - `React.JSX.Element` — rejected because the files import named hooks, not `React`; it would add an import anyway.
  - `npx types-react-codemod preset-19` — rejected as heavier than a one-line edit in seven files.
- **Revisit criterion:** —
- **Dissent (if any):** None.
- **Settles delta entry:** S-8, S-9
- **Dependent decisions:** —
- **Referenced in plan:** Target State (Contracts), Surface Delta (S-8, S-9), Change Units (Unit 4)

### D-11: React Router 7 through react-router-dom, no intermediate step

- **Question:** How does the client move from React Router 6 to 7 — which package, and is a v6 step with `future`
  flags needed first?
- **Decision:** `react-router-dom` → `^7.18.4`; every import site is unchanged; no intermediate v6 release with
  `future` flags; no switch to the `react-router` package.
- **Rationale:** 7.18.4 is the newest release of the package the project declares; in v7 it is `export * from
  "react-router"` plus `RouterProvider`/`HydratedRouter` (C-31 Stage D), so `BrowserRouter`, `Routes`, `Route`, `Link`,
  `NavLink`, and `useParams` resolve as before. The only two `future` flags that concern a `BrowserRouter` app are
  `v7_relativeSplatPath` (no splat route exists, C-25) and `v7_startTransition` (timing only); with nothing for them
  to act on, the intermediate step has no observable to check. Two audit advisories are patched only in 7.18.0
  (C-2). The built dashboard renders the same DOM except `data-discover="true"` on router anchors (C-33).
- **Evidence:** C-2, C-11, C-25, C-31, C-33, E-8; operator answer 2026-09-21: "Take React Router 7.18.4 (Recommended)".
- **Behavior impact:** Changing. Router anchors gain `data-discover="true"`; navigations run inside `startTransition`.
  Pages look and read the same. Operator answer verbatim: "Take React Router 7.18.4 (Recommended)".
- **Rejected alternatives:**
  - Stay on 6.30.6 — rejected because two advisories stay open and "all dependencies" is unmet.
  - Switch imports to `react-router` (v7) — rejected as a package replacement; Direction of Travel says nothing is
    replaced. Listed under Cut for Scope with v8.
  - React Router 8.4.0 — rejected because the boundary names "React Router 6→7"; cut list.
  - v6 + `future` flags first — rejected because C-25 leaves the flags nothing to act on and C-31 verified a direct
    jump with zero changes.
- **Revisit criterion:** `react-router-dom` stops being published (v8 removes it, E-8), or a 7.x-unpatched advisory.
- **Dissent (if any):** None.
- **Settles delta entry:** S-10
- **Dependent decisions:** —
- **Referenced in plan:** Surface Delta (S-10), Behavior Changes, Change Units (Unit 3), Cut for Scope

### D-12: marked 18 with no code change

- **Question:** Does marked 18 change what the dashboard renders, and does the code need to change?
- **Decision:** `marked` → `^18.0.13`; the two `marked(x) as string` sites are unchanged; no sanitizer or error
  boundary is added.
- **Rationale:** The code uses no renderer, extension, or option, so marked 16's ESM-only build, 17's list-tokenizer
  changes, and 18's trailing-blank-line trimming have no API to touch (C-12, E-9). `marked()` still returns a string
  synchronously; on a sample with headings, paragraphs, loose lists, fenced code with trailing blank lines, and a
  blockquote, 18.0.13 produced byte-identical HTML to 15.0.12; the review (test-engineer finding 1) asked for tables,
  nested lists, and raw HTML, and on that wider sample (`artifacts/marked-sample.mjs`) exactly one thing differs: the
  blank lines after a raw HTML block are dropped (`</div>\n\n\n<p>` → `</div><p>`). Whitespace between block
  elements does not render, so the page a person sees is the same (C-31 Stage E).
- **Evidence:** C-12, C-31, E-9; operator answer 2026-09-21: "Take marked 18.0.13 (Recommended)".
- **Behavior impact:** Changing. The HTML string `marked()` returns loses the blank lines after raw HTML blocks;
  rendering is identical; a snapshot or scraper of the string sees the difference. Operator answer verbatim: "Take
  marked 18.0.13 (Recommended)".
- **Rejected alternatives:**
  - Add DOMPurify and an error boundary — rejected as outside the recorded reason; pre-existing behavior (Cut for
    Scope).
  - Stay on marked 15 — rejected because the operator included the major.
- **Revisit criterion:** The Unit 6 sample diff shows more than the raw-HTML hunk, or a real run renders differently.
- **Dissent (if any):** None.
- **Settles delta entry:** S-11
- **Dependent decisions:** —
- **Referenced in plan:** Surface Delta (S-11), Behavior Changes, Change Units (Unit 6), Review Findings

### D-14: Makefile externals for the musl bindings

- **Question:** Why does `make build` fail after the DuckDB bump, and what is the smallest change that fixes it?
- **Decision:** Both `bun build … --compile` invocations in the `build` target replace their six per-platform
  `--external` lines with one line: `--external '@duckdb/node-bindings-*'`. The relink step is unchanged; `detect-libc`
  is not made external (it is a regular dependency and is bundled).
- **Rationale:** `@duckdb/node-bindings` 1.5.5-r.5 requires two musl packages behind a `detect-libc` check and declares
  them as optional dependencies; the bundler cannot resolve them on macOS and fails (C-30). Adding the two names
  fixes it (C-30), but Bun's `--external` accepts `*` wildcards (junior-developer F-6), and the one-line form was
  executed with `--compile`: exit 0, identical binary size, the binding still resolved at runtime, both binaries run
  (C-30). It is the strictly simpler version that satisfies the same evidence and does not need editing when DuckDB
  adds a platform.
- **Evidence:** C-30, C-31 (the re-run on the exact target manifests uses the wildcard).
- **Behavior impact:** Preserving.
- **Rejected alternatives:**
  - Eight explicit `--external` lines (the six existing plus the two musl names) — verified to work, rejected for
    the simpler-version test.
  - A guard before the relink's `rm -rf` — deferred under YAGNI (the search succeeds; C-19, E-2).
  - Bundling the bindings instead of externalizing — rejected because the current design copies `libduckdb.dylib`
    beside the binary and nothing forces a redesign.
- **Revisit criterion:** A DuckDB platform package stops matching `@duckdb/node-bindings-*`, or the build moves to
  Linux (the relink's `.dylib` line and its `find` pattern need work then).
- **Dissent (if any):** None.
- **Settles delta entry:** S-13
- **Dependent decisions:** —
- **Referenced in plan:** Target State (Contracts), Surface Delta (S-13), Change Units (Unit 2), Review Findings

### D-15: actions/checkout v7 as the last unit

- **Question:** Is the `actions/checkout` pin a dependency the request covers, and if so when does it move?
- **Decision:** `actions/checkout@v4` → `@v7` in all seven jobs, as the final unit, alone.
- **Rationale:** `ci.yml` is inside the confirmed area and "all dependencies" is the boundary's language; a `uses:`
  pin is a dependency of the workflow. v5 moved the action to Node 24 (runner ≥ 2.327.1, satisfied by GitHub-hosted
  runners), v6 persists credentials in a separate file, v7 blocks fork checkout on `pull_request_target` and
  `workflow_run` — this workflow runs on `push` and `pull_request` only (C-27; release notes read on 2026-09-21).
  Isolating it last keeps a red run attributable.
- **Evidence:** C-27; `gh api repos/actions/checkout/releases/tags/{v5.0.0,v6.0.0,v7.0.0}`; operator answer
  2026-09-21 to the review's scope question (junior-developer F-7): "Include it, as the last unit (Recommended)".
- **Behavior impact:** Preserving for this workflow's triggers and steps. Scope, not behavior, was the question put to
  the operator; answer verbatim: "Include it, as the last unit (Recommended)".
- **Rejected alternatives:**
  - Leave `@v4` — rejected because it is the one dependency in the area that would remain behind; the operator can
    still drop Unit 7.
  - `oven-sh/setup-bun@v2` bump — not applicable; `@v2` already floats to 2.2.0 (C-27).
- **Revisit criterion:** The workflow adds a `pull_request_target` trigger (then v7's fork block matters).
- **Dissent (if any):** None.
- **Settles delta entry:** S-14
- **Dependent decisions:** —
- **Referenced in plan:** Surface Delta (S-14), Behavior Changes, Change Units (Unit 7), Review Findings

### D-17: Node prerequisite documented, not enforced

- **Question:** Vitest's workers need `node` on `PATH` and Vitest 5 requires Node ≥ 22.12; how does the project state
  that?
- **Decision:** A README prerequisites bullet: "Node.js 22.12 or newer on `PATH` — Vitest runs its test workers under
  `node`; without it the tests that stub `Bun` globals fail. Needed only to run the test suite." No `engines.node`,
  no `actions/setup-node` step, no Vitest `pool` change.
- **Rationale:** Without `node`, 72 tests in 5 files fail on either Bun version (C-28); the requirement is real and was
  never written down. The `ubuntu-latest` image ships Node 22.23.2, so CI needs nothing (C-28). A sentence is the
  simplest form that satisfies the evidence.
- **Evidence:** C-28, E-6.
- **Behavior impact:** Preserving.
- **Rejected alternatives:**
  - `actions/setup-node@v5` with `node-version: 22` in the test jobs — deferred; the runner already satisfies the
    floor.
  - `engines.node` — rejected because Bun does not enforce `engines` (C-32) and it would not stop the failure.
  - Making the five test files not depend on stubbing `Bun` — rejected as a test refactor outside the reason.
- **Revisit criterion:** The runner image's default Node drops below 22.12, or a developer without Node hits the
  failure despite the README.
- **Dissent (if any):** None.
- **Settles delta entry:** S-15 (Node bullet)
- **Dependent decisions:** —
- **Referenced in plan:** Surface Delta (S-15), Change Units (Unit 5), Deferred (YAGNI)

### D-18: Hand-edited manifests, one major per unit

- **Question:** How are the version moves applied — by `bun update --latest`, or by editing manifests — and how are
  they grouped?
- **Decision:** Each unit edits the named manifests by hand to the Surface Delta literals and runs `bun install`.
  Units are: Bun pin; all non-majors plus tooling; React Router 7; React 19; Vitest 5; marked 18; checkout v7. Each
  major is its own unit so it can be reverted alone. The units land as one pull request with one commit per unit,
  each commit carrying its manifest edits and `bun.lock` together; reverting a unit is `git revert <sha>`, then
  `bun install --frozen-lockfile`, then the gate. The gate includes `bun --version`, `git status --porcelain bun.lock`
  after `make build`, and `./harness --help` run from the repo root. Version literals are the newest as of
  2026-09-21; a `bun install` on build day may resolve newer patches within the carets, and proofs naming an exact
  version are minimums.
- **Rationale:** A root `bun update --latest` changes nothing in workspace packages, and a per-workspace
  `bun update --latest` moves every dependency in that package at once — it would drag React, Router, and marked into
  the minors unit (C-29, C-31 Stage F). Hand edits are deterministic, reviewable, and keep the majors separable, which
  the operator asked for ("Each major upgrade becomes its own unit so it can be reverted alone",
  scope-boundary.md). The end state equals the dry run's (C-31). A revert of a commit that changed a manifest and
  `bun.lock` together was executed in the scratch clone: the frozen install then reports no changes and the tree is
  clean (C-31; junior-developer F-13). `make build` at the target state leaves `bun.lock` untouched (devops-engineer
  finding 5). `main` has no branch protection, so the gate is the only discipline between units.
- **Evidence:** C-29, C-31, scope-boundary.md.
- **Behavior impact:** Preserving (process only).
- **Rejected alternatives:**
  - `bun update --latest` in each workspace — rejected because it cannot stop at the minors.
  - One unit for everything — rejected because a regression could not be attributed or reverted alone.
- **Revisit criterion:** Bun gains a `--exclude` for `update --latest`.
- **Dissent (if any):** None.
- **Settles delta entry:** — (shapes the Change Units)
- **Dependent decisions:** —
- **Referenced in plan:** Target State, Change Units, Review Findings
