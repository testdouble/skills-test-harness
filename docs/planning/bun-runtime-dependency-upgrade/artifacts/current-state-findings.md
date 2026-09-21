# Current State Findings: Bun Runtime and Dependency Upgrade

<!--
This file is the single source of truth for what the code does today. Every later
agent in the run reads it first and does not re-grep for what is already here.
The plan cites it with inline ([C-N](artifacts/current-state-findings.md#...)) links
for every claim about the code as it stands, and ([E-N](...)) links for facts about
the target versions that no codebase read can supply.
-->

## Provenance

Path 2: this run's own discovery round, dispatched 2026-09-21 against the area recorded in
[scope-boundary.md](scope-boundary.md).

- `han-core:structural-analyst` — dependency declarations, tsconfigs, version-specific API usage (findings S1–S21).
- `han-core:behavioral-analyst` — runtime paths a runtime/dependency bump can alter (findings B1–B18). It ran before
  `node_modules` was installed; items it marked unverified about the install layout and the build were verified
  afterwards by the run itself and are marked so below.
- `han-research:research-analyst` — release-note facts about the target versions (the `E-N` section). Web-sourced,
  trust class **Web**; each fact carries the analyst's Verified / Corroborated / Secondary / Unverified label.
- The run's own sweep — CLAUDE.md, `docs/project-discovery.md`, ADRs, coding standards, git churn, a fresh
  `bun install --frozen-lockfile` and the full CI check set executed locally on Bun 1.3.11, plus registry lookups
  (`bun pm view`, `gh api /advisories`).

No concurrency analyst was dispatched: the area is manifests, configs, and version-specific API use, not shared
mutable state.

## Project Context

- **Stack:** TypeScript (ESNext, strict) on the Bun runtime; Bun workspaces monorepo with 9 packages under
  `packages/*`; Vitest 4 for tests (three configs); Biome 2 for lint/format; Vite 8 + `@vitejs/plugin-react` 6 +
  Tailwind v4 (`@tailwindcss/vite`) for the React 18 SPA; Hono 4 server on `Bun.serve`; DuckDB via
  `@duckdb/node-api` with per-platform native bindings; `bun build --compile` produces two binaries (`harness`,
  `harness-web`); GitHub Actions CI with 7 jobs.
- **Conventions source:** `CLAUDE.md` (`## Project Discovery` → `docs/project-discovery.md`, last updated 2026-04-16)
  and 14 coding standards under `docs/coding-standards/`.
- **ADRs found:** `docs/adrs/20260326084800-skip-permissions-in-test-sandbox.md` (proposed; sandbox permission
  flags) and `docs/adrs/20260515000000-migrate-sandbox-cli-to-sbx.md` (hard cutover to `sbx`). Neither bears on
  runtime or dependency versions.
- **Coding standards found:** 14 files. The ones the upgrade touches: `no-lint-disabling.md` (Biome rules are fixed
  in code, never disabled), `vitest-mocking-patterns.md` (mock declaration order, `vi.stubGlobal` cleanup),
  `cross-runtime-meta-resolution.md` (`import.meta.dir` fallback chain), `esm-import-conventions.md`,
  `integration-test-lifecycle.md`, `custom-error-hierarchy.md`.
- **Recent churn:** none. `git log --since="90 days ago"` over the area returns nothing; the last commit on `main`
  is `8be80c2` (2026-05-15). The last dependency change was `27c9454` (2026-05-15, "fix(deps): bump hono and
  postcss to patch moderate security advisories"). The last CI run on `main` (2026-05-15, run 25940797226)
  succeeded; its logs have expired (HTTP 410), so the Bun version it used is unknown. No CI run has exercised
  Bun 1.4.x.

## Gaps

- **No Bun version pin anywhere.** Searched for `.bun-version`, `.tool-versions`, `.mise.toml`, `bunfig.toml`, a
  `packageManager` field, and an `engines` field — none exist. See C-1.
- **No dependency-version policy.** No ADR or coding standard says whether ranges should be `latest`, caret, or
  pinned; the manifests mix all three (C-4).
- **No `docs/planning/` folder existed** before this run, although `docs/project-discovery.md` lists it as the home
  for planning documents.
- **No client-side component tests** under `packages/web/src/client` and no DOM test environment in any Vitest
  config (C-10), so React/React Router/marked upgrades have no automated render check today.
- **TypeScript is not a declared dependency** (C-9); the typecheck floats on whatever `bunx tsc` resolves.
- **No canonical v6→v7 React Router upgrade page is live** on reactrouter.com any more (E-9); the future-flag list
  was recovered from a version-pinned 6.30.4 docs URL.

## Findings

### C-1: The Bun runtime version is unpinned; local and CI already run different versions

- **Claim:** Nothing in the repo declares a Bun version. The local machine runs 1.3.11; CI installs whatever
  `oven-sh/setup-bun@v2` resolves, which with no input and no `packageManager`/`engines.bun` field is `latest`
  (1.4.2 today, per E-4). The lockfile was written at `lockfileVersion: 1`.
- **Location:** `.github/workflows/ci.yml:15-16` (repeated identically in all 7 jobs); `bun.lock:1-3`;
  `package.json` (no `packageManager`, no `engines`).
- **Evidence:**
  ```yaml
  - uses: oven-sh/setup-bun@v2
  - run: bun install --frozen-lockfile
  ```
  ```json
  {
    "lockfileVersion": 1,
    "configVersion": 1,
  ```
  ```
  $ bun --version
  1.3.11
  $ bun pm view bun version
  1.4.2
  ```
- **Raised by:** own sweep; behavioral-analyst B17.
- **Confidence:** Verified.
- **Bears on:** S-1; D-1, D-5

### C-2: `bun audit --audit-level=moderate` fails today, so the CI Security Audit job is red on `main`

- **Claim:** From a fresh `bun install --frozen-lockfile` on 1.3.11, `bun audit --audit-level=moderate` exits 1 with
  32 vulnerabilities (6 high, 26 moderate). Two of the React Router advisories are patched only in
  `react-router@7.18.0`; no 6.x release fixes them.
- **Location:** `.github/workflows/ci.yml:55-63` (security job); root `package.json:16` (`ci-checks`).
- **Evidence:** `bun audit --audit-level=moderate` (2026-09-21), grouped by package → fixed-in:
  - `hono <4.12.21` — 1 high (`GHSA-88fw-hqm2-52qc`, CORS reflects any Origin with credentials) + 17 moderate → fixed
    by 4.13.8.
  - `vite >=8.0.0 <=8.0.15` — 1 high (`GHSA-fx2h-pf6j-xcff`, `server.fs.deny` bypass on Windows) + 1 moderate
    (`launch-editor`) → fixed by 8.3.0.
  - `postcss <=8.5.22` — 1 high (`GHSA-r28c-9q8g-f849`, path traversal via `sourceMappingURL`) + 1 moderate
    (`GHSA-fxqj-rqcc-2cmp`) → fixed by 8.5.23+; latest is 8.5.28. Transitive only (C-5).
  - `nanoid <3.3.16` — 3 high (`GHSA-28wg-ghj8-5hjv`, `GHSA-2v37-7h3g-55p8`, `GHSA-xwg4-73v4-xw9w`). Transitive.
  - `vitest` and `@vitest/mocker <4.1.11` — moderate (`GHSA-82fw-gwwq-j7x9`, path traversal via redirect mock) →
    fixed by 4.1.11 or 5.x.
  - `react-router-dom >=6.30.2 <=6.30.5` — moderate (`GHSA-jjmj-jmhj-qwj2`) → patched 6.30.6.
  - `@remix-run/router <1.23.3` — moderate (`GHSA-2j2x-hqr9-3h42`) → patched 1.23.3 (ships with react-router 6.30.4+).
  - `react-router >=6.0.0 <7.18.0` — moderate `GHSA-wrjc-x8rr-h8h6` (open redirect via backslash in `<Link>` and
    `useNavigate`) and `GHSA-337j-9hxr-rhxg` (constructor injection in `deserializeErrors()`).
  `gh api /advisories/GHSA-wrjc-x8rr-h8h6` → `react-router: vulnerable >= 6.0.0, < 7.18.0 -> patched 7.18.0`;
  `gh api /advisories/GHSA-337j-9hxr-rhxg` → `react-router: vulnerable >= 6.4.0, < 7.18.0 -> patched 7.18.0`.
  Precedent: commit `27c9454` (2026-05-15) fixed the previous audit failure the same way and reported "bun audit now
  reports no vulnerabilities" — the advisories above were all published after that date.
- **Raised by:** own sweep.
- **Confidence:** Verified (executed).
- **Bears on:** S-3, S-5, S-7, S-10; D-6, D-11

### C-3: Baseline on Bun 1.3.11 — every other CI check passes, the build works, and the compiled CLI runs

- **Claim:** From a fresh checkout with `bun install --frozen-lockfile` (210 packages, lockfile unchanged), all
  checks except the audit pass, `make build` succeeds, and the compiled binary starts.
- **Location:** root `package.json:5-16` (scripts), `Makefile:15-33` (`build`).
- **Evidence:** executed 2026-09-21 on Bun 1.3.11:
  ```
  bun run lint            → exit 0 (231 files, 247 warnings, 0 errors)
  bun run format:check    → exit 0 (230 files)
  bun run typecheck       → exit 0 (8 packages, tsc 5.9.3 from /opt/homebrew/bin — see C-9)
  bun run vitest run      → 73 files, 934 tests passed, 2.27s
  bun run test:integration→ 1 file, 64 tests passed, 1.99s
  make build              → OK; ./harness 61.7 MB, ./harness-web 62.1 MB, libduckdb.dylib 112 MB copied
  ./harness --help        → prints the 8 commands
  ./harness update-analytics-data → exit 0 ("no data found for: …" for every table)
  ```
  After `make build`: `node_modules/@duckdb/node-bindings-darwin-arm64 ->
  node_modules/.bun/@duckdb+node-bindings-darwin-arm64@1.5.2-r.1/node_modules/@duckdb/node-bindings-darwin-arm64`.
- **Raised by:** own sweep.
- **Confidence:** Verified (executed).
- **Bears on:** context only (no delta entry rests on it)

### C-4: Dependency ranges mix `latest`, caret floors, and a major-version type mismatch

- **Claim:** Nine declarations use the range string `latest`; `bun-types` is `latest` in 5 packages and `^1.3.11` in
  3; `yargs` is `latest` in `cli` and `^18.0.0` in `web`; `@types/yargs` is `latest` in `cli` and `^17.0.35` in
  `web`. `yargs@18.x` ships no types of its own, so `@types/yargs@17.0.35` (the newest published) is the only
  source of `Argv`.
- **Location:** `packages/bun-helpers/package.json:7`, `packages/claude-integration/package.json:11`,
  `packages/cli/package.json:14-20`, `packages/evals/package.json:12`, `packages/sandbox-integration/package.json:7`
  (`latest`); `packages/data/package.json:11-12`, `packages/execution/package.json:14`,
  `packages/web/package.json:18-28` (caret); `bun.lock` resolves `bun-types@1.3.14`, `yargs@18.0.0`,
  `@types/yargs@17.0.35`.
- **Evidence:**
  ```json
  // packages/cli/package.json
  "cli-table3": "latest",
  "yargs": "latest",
  ...
  "@types/yargs": "latest",
  "bun-types": "latest"
  // packages/web/package.json
  "yargs": "^18.0.0",
  ...
  "@types/yargs": "^17.0.35",
  "bun-types": "^1.3.11",
  "tailwindcss": "latest",
  // packages/data/package.json
  "@duckdb/node-api": "latest",
  ```
  ```
  $ bun pm view yargs@18.2.0 types        → (empty)
  $ bun pm view yargs@18.2.0 exports      → ".": "./index.mjs" (types only under "./browser")
  $ bun pm view @types/yargs version      → 17.0.35
  ```
  `import type { Argv } from 'yargs'` appears in 7 files under `packages/cli/src/commands/`.
- **Raised by:** structural-analyst S1, S2; own registry verification.
- **Confidence:** Verified.
- **Bears on:** S-6; D-3, D-7, D-8

### C-5: The root `overrides` block is the repo's convention for security floors on transitive dependencies

- **Claim:** `overrides` pins `vite`, `picomatch`, `hono`, `postcss`. `postcss` is declared by no package (transitive
  of `vite` / `@tailwindcss/*`); `vite` and `picomatch` duplicate `packages/web`'s own direct ranges. The `hono` and
  `postcss` entries were added by commit `27c9454` to clear an audit failure.
- **Location:** root `package.json:20-25`.
- **Evidence:**
  ```json
  "overrides": {
    "vite": "^8.0.8",
    "picomatch": "^4.0.4",
    "hono": "^4.12.18",
    "postcss": "^8.5.14"
  }
  ```
  Commit `27c9454`: "Add hono and postcss to the existing overrides block (matching the vite/picomatch convention) so
  the floors are explicit and the nested vite -> postcss copy dedupes to a non-vulnerable version."
- **Raised by:** structural-analyst S3; own git sweep.
- **Confidence:** Verified.
- **Bears on:** S-5; D-6

### C-6: `cli-table3` and `picomatch` are declared but never imported

- **Claim:** No `.ts`/`.tsx` file under `packages/*` imports `cli-table3` or `picomatch`.
- **Location:** `packages/cli/package.json:14`, `packages/web/package.json:16`.
- **Evidence:** grep for `cli-table3` and `picomatch` across `packages/**/*.ts{,x}` (excluding `node_modules`) → 0
  matches.
- **Raised by:** structural-analyst S4.
- **Confidence:** Unverified for dynamic/string-based loading from files outside `packages/*/src` (none was found,
  but the sweep did not read shell scripts or test-suite folders).
- **Bears on:** context only (no delta entry rests on it)

### C-7: The internal workspace graph is a clean DAG with every import declared

- **Claim:** Every `@testdouble/*` import is backed by a `workspace:*` declaration in the importing package; the graph
  is `bun-helpers`/`sandbox-integration` → `claude-integration`/`test-fixtures` → `evals` → `execution` →
  `cli`/`web`, with no cycles.
- **Location:** all 9 `packages/*/package.json`.
- **Evidence:** import matrix built by the structural analyst; no undeclared internal import found.
- **Raised by:** structural-analyst S5.
- **Confidence:** Verified.
- **Bears on:** context only (no delta entry rests on it)

### C-8: Seven identical `tsconfig.json` copies, one divergent `web` config, and two typecheck blind spots

- **Claim:** 7 of 8 tsconfigs are byte-identical with no `extends`; `packages/web/tsconfig.json` adds
  `skipLibCheck`, `jsx: "react-jsx"`, and excludes `src/server/index.ts` (the file with `Bun.serve`/`Bun.file`).
  No tsconfig sets `lib`; DOM types come from TypeScript's default for `target: ESNext`. The root `typecheck` script
  omits `packages/test-fixtures`, which has no tsconfig.
- **Location:** `packages/{bun-helpers,claude-integration,cli,data,evals,execution,sandbox-integration}/tsconfig.json`;
  `packages/web/tsconfig.json`; root `package.json:13`.
- **Evidence:**
  ```json
  { "compilerOptions": { "target": "ESNext", "module": "ESNext", "moduleResolution": "bundler",
      "strict": true, "types": ["bun-types"] } }
  ```
  ```json
  { "compilerOptions": { ..., "skipLibCheck": true, "jsx": "react-jsx", "types": ["bun-types"] },
    "include": ["src"], "exclude": ["dist", "src/server/index.ts"] }
  ```
  `bunx tsc --showConfig` in `packages/web` shows no `lib` entry (default applies).
- **Raised by:** structural-analyst S6, S7, S8; own `--showConfig`.
- **Confidence:** Verified.
- **Bears on:** context only (no delta entry rests on it)

### C-9: TypeScript is undeclared; `bunx tsc` resolves a PATH binary locally and downloads `typescript@latest` (7.0.2) in CI

- **Claim:** `typescript` appears in no manifest and not in `bun.lock`. Locally `bunx tsc` finds
  `/opt/homebrew/bin/tsc` (5.9.3). With Homebrew off `PATH` (the CI situation) it downloads `typescript@7.0.2` —
  the npm `latest` tag today — and the project typechecks cleanly under it too.
- **Location:** root `package.json:13` (`typecheck` uses `bunx tsc --noEmit`); `.github/workflows/ci.yml:30-35`.
- **Evidence:**
  ```
  $ grep -c '"typescript' bun.lock              → 0
  $ which tsc                                    → /opt/homebrew/bin/tsc  (Version 5.9.3)
  $ PATH=~/.bun/bin:/usr/bin:/bin bunx tsc --version
  Resolved, downloaded and extracted [46]
  Version 7.0.2
  $ bun pm view typescript dist-tags             → "latest": "7.0.2", "beta": "6.0.0-beta", "rc": "7.0.1-rc"
  typecheck loop under TS 7.0.2                  → rc=0 for all 8 packages
  ```
- **Raised by:** own sweep.
- **Confidence:** Verified (executed).
- **Bears on:** S-4; D-1, D-5

### C-10: React usage is already React-18-idiomatic; the only React-19-sensitive pattern is the global `JSX.Element` annotation

- **Claim:** The client mounts with `createRoot` inside `React.StrictMode`. No `ReactDOM.render`, `forwardRef`,
  `defaultProps`, `propTypes`, `useRef()` without argument, `React.FC`, `act`, `findDOMNode`, string refs, or class
  components exist. All 7 page components are typed `(): JSX.Element` using the global `JSX` namespace. There are
  no component tests and no DOM test environment.
- **Location:** `packages/web/src/client/index.tsx:1-34`;
  `packages/web/src/client/pages/{AcilDetail,AcilHistory,TestRunHistory,TestRunDetail,PerTestAnalytics,ScilHistory,ScilDetail}.tsx`
  (e.g. `AcilDetail.tsx:133`).
- **Evidence:**
  ```tsx
  import React from 'react'
  import { createRoot } from 'react-dom/client'
  import { BrowserRouter, Route, Routes } from 'react-router-dom'
  ...
  createRoot(rootEl).render(<React.StrictMode><BrowserRouter>...</BrowserRouter></React.StrictMode>)
  ```
  ```tsx
  export function AcilDetail(): JSX.Element {
  ```
  `find packages/web/src/client -name "*.test.*"` → none; all three Vitest configs use `environment: 'node'`.
- **Raised by:** structural-analyst S9, S10.
- **Confidence:** Verified.
- **Bears on:** S-8; D-10

### C-11: React Router usage is the declarative API only, with no `future` flags enabled

- **Claim:** Imports from `react-router-dom` are limited to `BrowserRouter`, `Routes`, `Route`, `Link`, `NavLink`
  (render-prop form), and `useParams`, across 6 files. No data router, loaders, `json()`/`defer()`, `useNavigate`,
  `useSearchParams`, `Outlet`, or `future` flags. Data is fetched with `fetch` in `useEffect`.
- **Location:** `packages/web/src/client/index.tsx:3,19-32`; `components/NavBar.tsx:1,11-67`;
  `pages/{TestRunDetail,AcilDetail,ScilDetail}.tsx` (`Link`, `useParams`); `pages/{TestRunHistory,AcilHistory,ScilHistory}.tsx` (`Link`).
- **Evidence:**
  ```tsx
  <NavLink to="/" end className={({ isActive }) => `...${isActive ? 'text-[#75fe04]' : 'text-[#4f4f4f]'}`}>
    {({ isActive }) => (...)}
  </NavLink>
  ```
- **Raised by:** structural-analyst S11.
- **Confidence:** Verified.
- **Bears on:** D-11

### C-12: `marked` renders model output straight into `dangerouslySetInnerHTML` at two sites, with no options, sanitizer, or error boundary

- **Claim:** `marked(x) as string` is called twice in one file; no `marked.use`/`setOptions`, no renderer, no
  DOMPurify; the client tree has no error boundary.
- **Location:** `packages/web/src/client/pages/TestRunDetail.tsx:1,94,206`; `packages/web/src/client/index.tsx:17-34`.
- **Evidence:**
  ```tsx
  import { marked } from 'marked'
  ...
  dangerouslySetInnerHTML={{ __html: marked(resultText) as string }}
  ...
  dangerouslySetInnerHTML={{ __html: marked(file.fileContent) as string }}
  ```
- **Raised by:** structural-analyst S12; behavioral-analyst B16.
- **Confidence:** Verified.
- **Bears on:** S-11; D-12

### C-13: Three Vitest configs and three invocation paths

- **Claim:** `vitest.config.ts` (unit; default 5 s timeout), `vitest.integration.config.ts` (integration; 30 s),
  `vitest.all.config.ts` (both; 30 s) each redeclare `globals: true, environment: 'node'`. CI runs the first two via
  `bun run test` / `bun run test:integration`; `make test` runs the third; root `ci-checks` chains `npm run …`
  (never used by CI).
- **Location:** the three config files; `Makefile:44-45`; `.github/workflows/ci.yml:37-53`; root `package.json:16`.
- **Evidence:**
  ```ts
  // vitest.config.ts
  export default defineConfig({ test: { globals: true, environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    exclude: ['packages/*/src/**/*.integration.test.ts', '**/node_modules/**'] } })
  // vitest.integration.config.ts
  export default defineConfig({ test: { globals: true, environment: 'node',
    include: ['packages/*/src/**/*.integration.test.ts'], testTimeout: 30000 } })
  // vitest.all.config.ts
  export default defineConfig({ test: { globals: true, environment: 'node',
    include: ['packages/*/src/**/*.test.ts'], testTimeout: 30000 } })
  ```
  ```json
  "ci-checks": "npm run lint && npm run format:check && npm run typecheck && npm run test && npm run test:integration && bun audit --audit-level=moderate"
  ```
- **Raised by:** structural-analyst S13; behavioral-analyst B17.
- **Confidence:** Verified.
- **Bears on:** D-4

### C-14: Vitest API inventory — top-level `vi.mock` factories, one `vi.hoisted`, partial `Bun` stubs in 5 files

- **Claim:** Across 74 test files: `vi.mock` 41, `vi.fn` 45, `vi.mocked` 38, `vi.clearAllMocks` 38,
  `vi.restoreAllMocks` 16, `vi.spyOn` 15, `vi.stubGlobal`/`vi.unstubAllGlobals` 5, `vi.hoisted` 1,
  `vi.useFakeTimers` 1. Zero uses of `vi.importActual`, `vi.resetModules`, `test.each`, `describe.concurrent`,
  `expect.extend`, `toMatchSnapshot`, `test.sequential`, or `bench`. No `bun:test`/`bun:*` imports anywhere; the
  `Bun` global is absent under Vitest's node environment and is stubbed per-method where needed.
- **Location:** `packages/evals/src/llm-judge-eval.test.ts:5-24` (mock style);
  `packages/data/src/config-bun.test.ts:1-17` (`vi.hoisted`, `Bun.file` stub);
  `packages/sandbox-integration/src/sandbox.test.ts:13-21`, `packages/sandbox-integration/src/lifecycle.test.ts`,
  `packages/execution/src/test-runners/steps/step-2-validate-config.test.ts`,
  `packages/data/src/jsonl-reader.test.ts:12-18` (`Bun` stubs).
- **Evidence:**
  ```ts
  const { HarnessError } = vi.hoisted(() => { class HarnessError extends Error { ... } return { HarnessError } })
  vi.mock('@testdouble/harness-execution', () => ({ HarnessError, runAcilLoop: vi.fn().mockResolvedValue(undefined) }))
  beforeEach(() => { vi.stubGlobal('Bun', { file: vi.fn() }) })
  afterEach(() => { vi.unstubAllGlobals() })
  ```
- **Raised by:** structural-analyst S14; behavioral-analyst B5.
- **Confidence:** Verified.
- **Bears on:** D-4

### C-15: Bun-specific API surface is small, and one helper bets on `import.meta.dir` and the `$bunfs` prefix

- **Claim:** Production code calls `Bun.spawn` (1 site), `Bun.file` (6 sites), `Bun.serve` (1 site), and
  `Bun.argv` (1 site). `packages/bun-helpers/src/resolve.ts` resolves the current directory through
  `meta.dir ?? meta.dirname ?? URL fallback` and detects a compiled binary by `dir.includes('$bunfs')`; it is used
  to locate `sandbox-run.sh` and `sandbox-extract.sh` at runtime and by `loadFixtures` at module load.
- **Location:** `packages/sandbox-integration/src/sandbox.ts:8`; `packages/web/src/server/index.ts:20,51-57`;
  `packages/execution/src/test-runners/steps/step-2-validate-config.ts:7`; `packages/data/src/jsonl-reader.ts:2`;
  `packages/data/src/config.ts:8,103`; `packages/bun-helpers/src/resolve.ts:1-20`;
  `packages/claude-integration/src/run-claude.ts:5-9`; `packages/claude-integration/src/extract-output-files.ts:9-13`;
  `packages/test-fixtures/load-fixtures.ts:1-10`; `Makefile:13` (`--hot`), `Makefile:18,25` (`--compile`).
- **Evidence:**
  ```ts
  export function currentDir(meta: ImportMeta): string {
    return (meta as any).dir ?? (meta as any).dirname ?? path.dirname(new URL(meta.url).pathname)
  }
  export function resolveRelativePath(meta: ImportMeta, sourcePath: string, compiledPath: string): string {
    const dir = currentDir(meta)
    const resolved = dir.includes('$bunfs')
      ? path.resolve(path.dirname(process.execPath), compiledPath)
      : path.resolve(dir, sourcePath)
    if (!fs.existsSync(resolved)) { throw new Error(`Resolved path does not exist: ...`) }
    return resolved
  }
  ```
- **Raised by:** structural-analyst S15; behavioral-analyst B6, B7.
- **Confidence:** Verified.
- **Bears on:** context only (no delta entry rests on it)

### C-16: Hono is used minimally through `Bun.serve`; the server entry file is excluded from typecheck

- **Claim:** Only `Hono` and `type Context` are imported; static files are served by hand with `Bun.file`; no
  `hono/bun`, `serveStatic`, `cors`, or `app.onError`. The file is in `packages/web/tsconfig.json`'s `exclude`.
- **Location:** `packages/web/src/server/index.ts`; `packages/web/src/server/routes/{acil,analytics,scil,test-runs}.ts`.
- **Evidence:**
  ```ts
  import { Hono } from 'hono'
  const app = new Hono()
  app.get('/index.js', () => new Response(Bun.file(indexJs)))
  app.get('/*', () => new Response(Bun.file(indexHtml)))
  Bun.serve({ fetch: app.fetch, port })
  ```
- **Raised by:** structural-analyst S16; behavioral-analyst B14 (no `onError`).
- **Confidence:** Verified.
- **Bears on:** context only (no delta entry rests on it)

### C-17: Two yargs bootstraps with different argv sources and parse calls

- **Claim:** `harness-web` uses `yargs(hideBin(Bun.argv))…parse()`; `harness` uses
  `yargs(hideBin(process.argv))…parseAsync()` inside a `try/catch` that handles only `HarnessError`.
- **Location:** `packages/web/src/server/index.ts:3-4,20-34`; `packages/cli/index.ts:1-25`.
- **Evidence:**
  ```ts
  const argv = await yargs(hideBin(Bun.argv)).scriptName('harness-web').option('port', {...}).option('data-dir', {...}).strict().showHelpOnFail(true).parse()
  ```
  ```ts
  await yargs(hideBin(process.argv)).scriptName('harness').command(await import('./src/commands/test-run.js'))….demandCommand(1).strict().showHelpOnFail(true).parseAsync()
  ```
- **Raised by:** structural-analyst S17.
- **Confidence:** Verified.
- **Bears on:** context only (no delta entry rests on it)

### C-18: DuckDB's native binding loads at import time, for every CLI command, through an unchecked cast layer

- **Claim:** `@duckdb/node-bindings/duckdb.js` does `module.exports = getNativeNodeBinding(...)` at module top
  level and `@duckdb/node-api/lib/duckdb.js:18` requires it at top level. `packages/cli/index.ts` imports all 8
  command modules before parsing, and the import graph reaches `@duckdb/node-api` through
  `@testdouble/harness-execution` → `re-eval-marker.ts` → `@testdouble/harness-data` → `analytics.ts:1`. Query
  results are read with `getRowObjects() as unknown as <Shape>[]` (≥8 sites), and `convertBigInts` recognises list
  and struct values by `constructor.name`.
- **Location:** `node_modules/.bun/@duckdb+node-bindings@1.5.2-r.1/…/duckdb.js:1-30`;
  `node_modules/.bun/@duckdb+node-api@1.5.2-r.1/…/lib/duckdb.js:18`; `packages/cli/index.ts:6-16`;
  `packages/execution/index.ts:9-10`; `packages/execution/src/re-eval-marker.ts:1`; `packages/data/index.ts`;
  `packages/data/src/analytics.ts:1,394,451,461,546`; `packages/data/src/run-status.ts:20-36,87,141`;
  `packages/data/src/connection.ts:1-16`.
- **Evidence:**
  ```js
  // @duckdb/node-bindings/duckdb.js
  case 'darwin-arm64': return require('@duckdb/node-bindings-darwin-arm64/duckdb.node');
  ...
  module.exports = getNativeNodeBinding(getRuntimePlatformArch());
  ```
  ```ts
  const rows = (await conn.runAndReadAll(sql)).getRowObjects() as unknown as Omit<TestRunSummary, 'date'>[]
  ```
  ```ts
  const name = (val as { constructor?: { name?: string } }).constructor?.name
  if (name === 'DuckDBListValue') { return (val as { items: unknown[] }).items.map(convertBigInts) }
  if (name === 'DuckDBStructValue') { ... }
  ```
  `DuckDBResultReader.d.ts:64`: `getRowObjects(): Record<string, DuckDBValue>[]`; `values/DuckDBListValue.d.ts:2`
  and `values/DuckDBStructValue.d.ts:2` declare those classes in 1.5.2-r.1.
- **Raised by:** behavioral-analyst B2, B14; structural-analyst S18; own verification of the binding's load timing
  and the `.d.ts` shapes (the analysts had marked these Unverified).
- **Confidence:** Verified.
- **Bears on:** context only (no delta entry rests on it)

### C-19: `make build` relinks the DuckDB binding by searching Bun's isolated store, and fails destructively if the search misses

- **Claim:** The build compiles both binaries with the six `@duckdb/node-bindings-*` packages `--external`, then
  `find`s `duckdb.node` under `node_modules/.bun`, deletes `node_modules/@duckdb/node-bindings-<platform>`, symlinks
  it to the found store path, and copies `libduckdb.dylib` beside the binaries. If `find` returns nothing,
  `DUCKDB_DIR` is empty: the real bindings directory has already been removed, the symlink points at the repo root,
  and `cp /libduckdb.dylib` fails with exit 1. On Bun 1.3.11 today the search succeeds (C-3).
- **Location:** `Makefile:1,15-33`.
- **Evidence:**
  ```makefile
  DUCKDB_PLATFORM := $(shell bun -e "process.stdout.write(process.platform + '-' + process.arch)")
  ...
  	DUCKDB_DIR=$$(find node_modules/.bun -maxdepth 6 -name "duckdb.node" -path "*node-bindings-$(DUCKDB_PLATFORM)*" 2>/dev/null | head -1 | xargs dirname) && \
  	rm -rf node_modules/@duckdb/node-bindings-$(DUCKDB_PLATFORM) && \
  	mkdir -p node_modules/@duckdb && \
  	ln -sf $(TESTS_DIR)/$$DUCKDB_DIR node_modules/@duckdb/node-bindings-$(DUCKDB_PLATFORM) && \
  	cp $$DUCKDB_DIR/libduckdb.dylib $(TESTS_DIR)/libduckdb.dylib
  ```
  `echo -n "" | xargs dirname; echo $?` → `0` on BSD xargs (reproduced by the behavioral analyst).
- **Raised by:** structural-analyst S20; behavioral-analyst B1; own execution.
- **Confidence:** Verified for 1.3.11. The 1.4.2 layout is addressed by E-2 (Web, Verified: unchanged).
- **Bears on:** D-14

### C-20: `make dev` runs Vite on 5173 and Hono on 3099 with no proxy; the server embeds `dist/client` at import time

- **Claim:** The Hono server imports `../../dist/client/{index.html,index.js,index.css}` with `{ type: 'file' }`;
  `dist/` is gitignored and produced only by `vite build`. `vite.config.ts` has no `server.proxy`. Client fetches are
  origin-relative (`fetch('/api/…')`) and never check `res.ok`. Docs tell users to open `http://localhost:3099`.
- **Location:** `Makefile:9-13`; `packages/web/src/server/index.ts:5-11`; `packages/web/vite.config.ts:1-16`;
  `packages/web/src/client/pages/TestRunDetail.tsx:266-281` and 6 sibling fetch sites;
  `docs/getting-started/viewing-results.md:15`.
- **Evidence:**
  ```ts
  import _indexHtml from '../../dist/client/index.html' with { type: 'file' }
  ```
  ```ts
  export default defineConfig({ plugins: [tailwindcss(), react()],
    build: { outDir: 'dist/client', rollupOptions: { output: { entryFileNames: '[name].js', chunkFileNames: '[name].js', assetFileNames: '[name].[ext]' } } } })
  ```
  ```ts
  fetch(`/api/test-runs/${runId}`).then((res) => res.json()).then((data) => { if (data.error) {...} }).catch((err) => { setError(String(err)) })
  ```
- **Raised by:** behavioral-analyst B3, B4; structural-analyst S19 (vite config).
- **Confidence:** Verified (read); the dev flow was not executed.
- **Bears on:** context only (no delta entry rests on it)

### C-21: Tailwind is imported with the plain v4 directive; the lockfile carries two `tailwindcss` versions

- **Claim:** `index.css` is `@import "tailwindcss";` with no `@theme`/`@config`. `tailwindcss@4.3.0` resolves for the
  `latest` devDependency while `@tailwindcss/vite@4.2.2` and `@tailwindcss/node` pin their own `tailwindcss@4.2.2`.
- **Location:** `packages/web/src/client/index.css:1`; `packages/web/package.json:22,31`; `bun.lock:428,456-472`.
- **Evidence:** `bun outdated` → `@tailwindcss/vite 4.2.2 → 4.3.3`, `tailwindcss 4.3.0 → 4.3.3`.
- **Raised by:** structural-analyst S19.
- **Confidence:** Verified.
- **Bears on:** context only (no delta entry rests on it)

### C-22: The process-spawn boundary has no timeouts, decodes chunks without streaming mode, and discards sandbox stderr

- **Claim:** No `timeout`/`AbortSignal` exists in `claude-integration`, `sandbox-integration`, or `execution`
  source. `execInSandbox` reads stdout in an unbounded loop with a new `TextDecoder().decode(value)` per chunk (no
  `{ stream: true }`), never throws on non-zero exit, and its `stderr` is dropped by the prompt runner. These are
  pre-existing behaviors, recorded because a runtime bump lands on this seam first.
- **Location:** `packages/sandbox-integration/src/sandbox.ts:54-81`; `packages/sandbox-integration/src/lifecycle.ts:8-18`;
  `packages/execution/src/test-runners/prompt/index.ts:35-45,79-91`.
- **Evidence:**
  ```ts
  while (true) { const { done, value } = await reader.read(); if (done) break
    const chunk = new TextDecoder().decode(value); stdout += chunk ... }
  await proc.exited
  return { exitCode: proc.exitCode ?? 1, stdout, stderr }
  ```
  ```ts
  const { exitCode, stdout } = await runClaude({ ... })
  ```
- **Raised by:** behavioral-analyst B8, B9, B10.
- **Confidence:** Verified.
- **Bears on:** context only (no delta entry rests on it)

### C-23: JSON-line parsing and error typing are inconsistent across the pipeline

- **Claim:** `parseStreamJsonLines` and `readJsonlFile` call `JSON.parse` per line with no try/catch (an uncaught
  `SyntaxError` reaches `packages/cli/index.ts`'s catch, which rethrows anything that is not a `HarnessError`);
  `extractOutputFiles` silently skips malformed lines. `SandboxError` and `ClaudeError` extend `Error`, not
  `HarnessError`, so `harness clean` rewraps them and `harness test-run` does not. Pre-existing; recorded as context.
- **Location:** `packages/data/src/stream-parser.ts:1-7`; `packages/data/src/jsonl-reader.ts:1-11`;
  `packages/claude-integration/src/extract-output-files.ts:20-30`; `packages/sandbox-integration/src/errors.ts:1-9`;
  `packages/claude-integration/src/errors.ts:1-9`; `packages/execution/src/lib/errors.ts:1-21`;
  `packages/cli/index.ts:19-25`; `packages/cli/src/commands/clean.ts:11-20`; `packages/cli/src/commands/test-run.ts:20-32`.
- **Evidence:**
  ```ts
  return raw.split('\n').filter((line) => line.trim().startsWith('{')).map((line) => JSON.parse(line) as StreamJsonEvent)
  ```
  ```ts
  } catch (err) { if (err instanceof HarnessError) { process.stderr.write(`Error: ${err.message}\n`); process.exit(1) } throw err }
  ```
- **Raised by:** behavioral-analyst B11, B12 (also B13 `dataDir` SQL interpolation at `analytics.ts:402-415`, B15
  hand-maintained response/client types, B18 the well-handled `evaluateLlmJudge` catch).
- **Confidence:** Verified.
- **Bears on:** context only (no delta entry rests on it)

### C-24: Four documents state versions the upgrade changes

- **Claim:** `docs/project-discovery.md` says "Vitest ^4.1.0", "Bun compile + Vite 8", "React 18 + React Router 6";
  `docs/web.md:13` says "React 18 + Tailwind v4 SPA client, built with Vite 8"; `CLAUDE.md:31,33` says "Bun compile +
  Vite 8" and "Hono + React 18 + Tailwind v4"; `README.md:21-22` says install Bun from bun.sh with no version.
- **Location:** `docs/project-discovery.md:22,24,91,93`; `docs/web.md:13`; `CLAUDE.md:31,33`; `README.md:16-22`.
- **Evidence:** grep for version strings across `README.md`, `docs/**/*.md`, `CLAUDE.md` (2026-09-21).
- **Raised by:** own sweep.
- **Confidence:** Verified.
- **Bears on:** S-15; D-16

### C-25: Nothing in the client touches the APIs React 19 or React Router 7 change

- **Claim:** The client uses no `useId`, `Suspense`, `useTransition`/`startTransition`, `useSyncExternalStore`,
  `useLayoutEffect`, `lazy`, `useDeferredValue`, `useRef`, or error boundary. All seven routes are static paths or
  `:runId` params; there is no splat (`*`) route, so React Router's `v7_relativeSplatPath` flag has nothing to act
  on, and `v7_startTransition` only changes the timing of navigation state updates.
- **Location:** `packages/web/src/client/index.tsx:23-29`; `packages/web/src/client/**/*.tsx`.
- **Evidence:**
  ```tsx
  <Route path="/" element={<TestRunHistory />} />
  <Route path="/runs/:runId" element={<TestRunDetail />} />
  <Route path="/scil" element={<ScilHistory />} />
  <Route path="/scil/:runId" element={<ScilDetail />} />
  <Route path="/acil" element={<AcilHistory />} />
  <Route path="/acil/:runId" element={<AcilDetail />} />
  <Route path="/analytics" element={<PerTestAnalytics />} />
  ```
  grep for the hook names above across `packages/web/src/client/**/*.tsx` → 0 matches.
- **Raised by:** own sweep (closing the gap the structural analyst's S9/S11 left).
- **Confidence:** Verified.
- **Bears on:** S-8; D-10, D-11

### C-26: Every `vi.mock`/`vi.hoisted` call is at module top level; five mock-using test files never clear mocks

- **Claim:** No `vi.mock(`, `vi.hoisted(`, or `vi.unmock(` call is indented (all are at column 0), so Vitest 5's
  new throw for nested calls (E-6) has no target. Of the test files that use `vi.fn`/`vi.mocked`/`vi.spyOn`, 5
  never call `clearAllMocks`/`restoreAllMocks`/`resetAllMocks`; 27 files assert on call counts
  (`toHaveBeenCalledTimes`/`toHaveBeenCalledOnce`/`mock.calls`). Vitest 5's `clearMocks: true` default would clear
  call history before each test in all of them.
- **Location:** `packages/**/*.test.ts`.
- **Evidence:** `grep -rn "^[[:space:]]\+vi\.\(mock\|hoisted\|unmock\)(" packages --include='*.test.ts'` → 0;
  `grep -rL "clearAllMocks\|restoreAllMocks\|resetAllMocks" $(grep -rl "vi\.fn\|vi\.mocked\|vi\.spyOn" …)` → 5 files.
- **Raised by:** own sweep.
- **Confidence:** Verified for the grep facts; whether any of the 27 files depends on call history surviving across
  tests is Unverified until the suite runs under Vitest 5.
- **Bears on:** D-4

### C-27: Transitive `nanoid` comes from `postcss`; GitHub Actions in CI are behind their latest majors

- **Claim:** `postcss@8.5.14` depends on `nanoid ^3.3.11` (resolved 3.3.11), so the three high `nanoid` advisories
  in C-2 clear when `postcss` moves to a release that resolves `nanoid ≥ 3.3.16`. CI uses `actions/checkout@v4`
  (latest release tag `v7.0.1`) and `oven-sh/setup-bun@v2` (latest `v2.2.0`, same major).
- **Location:** `bun.lock:392,402`; `.github/workflows/ci.yml:14-15`.
- **Evidence:**
  ```
  "postcss": ["postcss@8.5.14", "", { "dependencies": { "nanoid": "^3.3.11", ... } }, ...]
  ```
  `gh api repos/actions/checkout/releases/latest` → `v7.0.1`; `gh api repos/oven-sh/setup-bun/releases/latest` → `v2.2.0`.
- **Raised by:** own sweep.
- **Confidence:** Verified.
- **Bears on:** S-5, S-14; D-6, D-15

### C-28: Vitest workers run under whatever `node` is on `PATH`; without one they run under Bun and the five `Bun`-stubbing test files fail

- **Claim:** `bun run vitest run` launches Vitest under Bun, but Vitest's fork pool spawns `node` from `PATH` for
  test workers. With Node 22.21.1 on `PATH`, workers run under Node and `vi.stubGlobal('Bun', …)` defines a new
  global. With no `node` on `PATH`, workers run under Bun itself (either 1.3.11 or 1.4.2), where `globalThis.Bun`
  is a non-configurable property, and `vi.stubGlobal('Bun', …)` throws — 72 tests across the 5 files in C-14
  fail. Nothing in the repo declares Node as a prerequisite. The `ubuntu-latest` runner image ships Node.js
  22.23.2, which is why CI passes and why Vitest 5's Node ≥ 22.12 requirement (E-6) is met there today.
- **Location:** `vitest.config.ts` (no `pool`/`execPath` setting); `packages/sandbox-integration/src/sandbox.test.ts:13-16`
  and the four sibling files in C-14; `README.md:16-22` (prerequisites list Bun and `sbx` only).
- **Evidence:** a throwaway test asserting the worker runtime, run four ways on 2026-09-21:
  ```
  Bun 1.3.11, node on PATH    → RUNTIME=node v22.21.1
  Bun 1.4.2,  node on PATH    → RUNTIME=node v22.21.1   (full suite: 73 files / 934 tests pass)
  Bun 1.3.11, no node on PATH → RUNTIME=bun 1.3.11
  Bun 1.4.2,  no node on PATH → RUNTIME=bun 1.4.2       (full suite: 5 files / 72 tests fail)
  ```
  ```
  TypeError: Attempting to change configurable attribute of unconfigurable property.
   ❯ packages/sandbox-integration/src/sandbox.test.ts:14:6
       14|   vi.stubGlobal('Bun', {
  ```
  `Object.getOwnPropertyDescriptor(globalThis, 'Bun')` → `{ writable: false, configurable: false }` on both Bun
  versions; `Bun.file` and `Bun.spawn` are `writable: true` (assignment works; `defineProperty` on `Bun` throws).
  Runner image: `images/ubuntu/Ubuntu2404-Readme.md` line 26 "Node.js 22.23.2".
- **Raised by:** own sweep (executed).
- **Confidence:** Verified.
- **Bears on:** S-15; D-17

### C-29: Bun 1.4.2 runs this repo unchanged, and does not rewrite the v1 lockfile

- **Claim:** In a scratch clone with an isolated Bun 1.4.2 binary: `bun install --frozen-lockfile` succeeds with the
  v1 lockfile and leaves it untouched; a plain `bun install` reports no changes and keeps `lockfileVersion: 1`;
  `bun update` (within ranges) changes `bun.lock` and root `package.json` but still writes `lockfileVersion: 1`,
  and Bun 1.3.11 then reads that lockfile with `--frozen-lockfile` cleanly. Lint, format, 934 unit tests (with
  Node on `PATH`, C-28) and 64 integration tests pass. This contradicts E-1's "1.4 writes lockfileVersion 2 by
  default" for an existing v1 lockfile; the observation wins for this repo.
- **Location:** scratch clone of `main` at `8be80c2`; Bun 1.4.2 (744846f84).
- **Evidence:**
  ```
  $ bun --version                    → 1.4.2
  $ bun install --frozen-lockfile    → 105 packages installed; git status clean; lockfileVersion 1
  $ bun install                      → Checked 122 installs across 172 packages (no changes)
  $ bun update                       → ^ enhanced-resolve 5.20.1 -> 5.25.1, ^ tapable 2.3.0 -> 2.3.3; 53 packages installed
  $ head -3 bun.lock                 → "lockfileVersion": 1, "configVersion": 1
  $ (Bun 1.3.11) bun install --frozen-lockfile → Checked 125 installs across 187 packages (no changes), exit 0
  ```
  A second fresh clone at the base commit under 1.4.2: `bun install --frozen-lockfile` OK, `make build` exit 0 with
  DuckDB 1.5.2-r.1 (relink → `@duckdb+node-bindings-darwin-arm64@1.5.2-r.1`), `./harness --help` exit 0, lockfile
  untouched — so the Bun pin alone (before any dependency moves) leaves the build working.
  `bun update` rewrote the root caret ranges to the new resolved versions (`@biomejs/biome ^2.4.12 → ^2.5.14`,
  `vitest ^4.1.4 → ^4.1.11`) and, through the `latest` ranges, moved `@duckdb/node-api` to 1.5.5-r.5,
  `bun-types` to 1.4.2, `yargs` to 18.2.0, `picomatch` to 4.0.7, `postcss` to 8.5.28, `nanoid` to 3.3.19,
  `vite` to 8.3.0, `tailwindcss` (top-level) to 4.3.3 — while leaving workspace caret ranges (`hono` stayed
  4.12.18 only because `overrides` pins `^4.12.18`; `@tailwindcss/vite` stayed 4.2.2; `react-router-dom` stayed
  6.30.3; `marked` 15.0.12) untouched, i.e. a root `bun update` did not update the workspace packages' own caret
  dependencies.
- **Raised by:** own sweep (executed).
- **Confidence:** Verified.
- **Bears on:** S-2; D-2, D-3, D-9, D-18

### C-30: `@duckdb/node-bindings@1.5.5-r.5` adds two musl platform packages; `make build` fails until they are `--external`

- **Claim:** The new bindings loader requires `@duckdb/node-bindings-linux-x64-musl` and
  `@duckdb/node-bindings-linux-arm64-musl` (guarded by `detect-libc`), and lists them as optional dependencies.
  The Makefile's `--external` list names only the six older platforms, so `bun build --compile` fails to
  resolve the two new ones. Adding the two externals to both `bun build` invocations makes `make build` succeed
  under Bun 1.4.2 with DuckDB 1.5.5-r.5; the relink finds the store path and both binaries run.
- **Location:** `node_modules/.bun/@duckdb+node-bindings@1.5.5-r.5/node_modules/@duckdb/node-bindings/duckdb.js:19-27`
  and its `package.json` `optionalDependencies`; `Makefile:18-31`.
- **Evidence:**
  ```
  error: Could not resolve: "@duckdb/node-bindings-linux-x64-musl/duckdb.node". Maybe you need to "bun install"?
  error: Could not resolve: "@duckdb/node-bindings-linux-arm64-musl/duckdb.node". Maybe you need to "bun install"?
  make: *** [build] Error 1
  ```
  ```js
  case `linux-x64`:
      return isLinuxMusl()
          ? require('@duckdb/node-bindings-linux-x64-musl/duckdb.node')
          : require('@duckdb/node-bindings-linux-x64/duckdb.node');
  ```
  After adding `--external '@duckdb/node-bindings-linux-x64-musl'` and `--external '@duckdb/node-bindings-linux-arm64-musl'`
  to both `bun build` commands in the scratch clone: `make build` exit 0; `harness` 63.0 MB, `harness-web` 63.4 MB,
  `libduckdb.dylib` 117 MB; `./harness --help`, `./harness update-analytics-data` (exit 0), `./harness-web --help` all run;
  symlink → `node_modules/.bun/@duckdb+node-bindings-darwin-arm64@1.5.5-r.5/…`.
  A single `--external '@duckdb/node-bindings-*'` line per `bun build` invocation (Bun's `--external` accepts `*`
  wildcards) also builds: exit 0, same 63.0 MB binary, the binding still resolved at runtime
  (`strings harness` still contains `node-bindings-darwin-arm64/duckdb.node`), `./harness update-analytics-data` exit 0.
  `detect-libc@2.1.2` is a regular dependency of `@duckdb/node-bindings` (not optional) and is bundled into the
  compiled binary (`strings harness` finds `familySync` and `glibcVersionRuntime`), so no further `--external` is
  needed. The lockfile written on macOS records both musl packages
  (`@duckdb/node-bindings-linux-x64-musl@1.5.5-r.5`, `@duckdb/node-bindings-linux-arm64-musl@1.5.5-r.5`) even though
  neither is installed there.
- **Raised by:** own sweep (executed).
- **Confidence:** Verified.
- **Bears on:** S-13; D-14

### C-31: The whole upgrade was dry-run in a scratch clone under Bun 1.4.2 and every check passes, including the audit

- **Claim:** Applying every target version in a scratch clone (Bun 1.4.2, Node 22.21.1 on `PATH`) — Vitest 5.0.1,
  Biome 2.5.14 (`biome migrate --write`), React 19.3.0 + `@types/react` 19.3.0 (with `type JSX` imported in the 7
  page files), `react-router-dom` 7.18.4, marked 18.0.13, then `bun update --latest` in every workspace package and
  the root, plus the two musl `--external` flags from C-30 — yields: frozen install OK, lint 0 errors (247
  warnings, unchanged), format OK, typecheck OK under TypeScript 7.0.2, 934 unit and 64 integration tests pass with
  no Vitest config change, `make build` OK, both binaries run, and `bun audit --audit-level=moderate` reports **No
  vulnerabilities found (checked 143 packages)**. The lockfile stays `lockfileVersion: 1`; `@remix-run/router` is
  gone from it. The full diff, regenerated from the exact target manifests (18 files, 43 insertions, 49 deletions, lockfile
  excluded), is kept at [dry-run-2026-09-21.diff](dry-run-2026-09-21.diff).
- **Location:** scratch clone; diff at `artifacts/dry-run-2026-09-21.diff`.
- **Evidence:** per stage —
  ```
  Stage A  vitest@5.0.1 (vite@8.3.0 auto-installed as peer)  → unit 934 pass, integration 64 pass, all-config 998 pass; configs untouched
  Stage B  @biomejs/biome@2.5.14                              → lint/format pass; `biome migrate --write` rewrote biome.json:
             "$schema": ".../schemas/2.4.12/schema.json" → ".../schemas/2.5.14/schema.json"
             "recommended": true                         → "preset": "recommended"
  Stage C  react/react-dom/@types 19.3.0                     → 7 × "TS2503: Cannot find namespace 'JSX'" at the
             `(): JSX.Element` sites in C-10; fixed by `import { useEffect, useState, type JSX } from 'react'`
             (TestRunDetail: `{ Fragment, useEffect, useState, type JSX }`); typecheck, lint, format, vite build pass
  Stage D  react-router-dom@7.18.4                           → zero source changes; typecheck + vite build pass;
             the package is `export * from "react-router"` plus RouterProvider/HydratedRouter
  Stage E  marked@18.0.13                                    → typecheck + build pass; `marked(sample)` HTML is
             byte-identical to 15.0.12 on headings, paragraphs, loose lists, fenced code with trailing blank lines, blockquote
           A second sample (`artifacts/marked-sample.mjs`: table, nested list with a loose paragraph, ordered loose
           list, task list, a raw `<div>` HTML block followed by blank lines and a paragraph, fenced code with trailing
           blank lines, hard break, thematic break, two-paragraph blockquote, image/link/code/bold/italic) differs in
           exactly one place: after the raw HTML block, marked 15 emits `</div>\n\n\n<p>text after</p>` and marked 18
           emits `</div><p>text after</p>` — the blank lines are dropped (E-9's trailing-blank-line trim). Tables,
           lists, task lists, code, quotes, and inline markup are byte-identical. Whitespace between block-level
           elements does not affect rendering.
  Stage F  `bun update --latest` per workspace and root       → rewrites every `latest` range to a caret of the resolved
             version and bumps carets (see manifest list below); root `bun update --latest` alone changes nothing in
             workspace packages
  Final    frozen install 0 · lint 0 · format 0 · typecheck 0 (TS 7.0.2) · 934/934 · 64/64 · make build 0 ·
           ./harness 0 · ./harness update-analytics-data 0 · bun audit → No vulnerabilities found
  Re-run   on the exact target manifests (carets everywhere incl. `@duckdb/node-api ^1.5.5-r.5`, `packageManager`,
           `typescript ^7.0.2`, sorted `type JSX` imports, wildcard external): same results; `rm -rf node_modules &&
           bun install --frozen-lockfile` exit 0; `make build` leaves `git status --porcelain bun.lock` empty;
           relink symlink contains `1.5.5-r.5`; `bun outdated --filter '*'` prints nothing; audit clean (164 packages).
           Lockfile vs base: +211/−180 lines, 21 `@typescript/*` platform entries and 2 musl entries added,
           `@remix-run/router` removed. `git revert` of a commit that changed a manifest and `bun.lock` together
           restores a state where `bun install --frozen-lockfile` reports no changes and the tree is clean.
  Intermediate state "React Router 7 on React 18" (the plan's Unit 3 before Unit 4): full gate passes (lint, format,
           typecheck, 934/64, make build, ./harness), and every route's DOM summary hash (tags, attributes minus
           `data-discover`, text) equals the baseline's; `body.innerHTML` grows by exactly 21 bytes per router anchor.
  ```
  Manifest ranges after Stage F (before the re-run normalized the `bun add pkg@x.y.z` exact pins to carets):
  ```
  root:                 @biomejs/biome 2.5.14, vitest 5.0.1
  bun-helpers/claude-integration/evals/sandbox-integration: bun-types ^1.4.2
  cli:                  cli-table3 ^0.6.5, yargs ^18.2.0, @types/yargs ^17.0.35, bun-types ^1.4.2
  data:                 @duckdb/node-api ^1.5.5-r.5, bun-types ^1.4.2
  execution:            bun-types ^1.4.2
  web:                  hono ^4.13.8, marked 18.0.13, picomatch ^4.0.7, react 19.3.0, react-dom 19.3.0,
                        react-router-dom 7.18.4, yargs ^18.2.0, @tailwindcss/vite ^4.3.3, @types/react 19.3.0,
                        @types/react-dom 19.3.0, @types/yargs ^17.0.35, @vitejs/plugin-react ^6.1.1,
                        bun-types ^1.4.2, tailwindcss ^4.3.3, vite ^8.3.0
  overrides:            unchanged (vite ^8.0.8, picomatch ^4.0.4, hono ^4.12.18, postcss ^8.5.14 — all satisfied)
  ```
- **Raised by:** own sweep (executed).
- **Confidence:** Verified on macOS arm64. Not exercised: Linux CI runners, `make dev`, the dashboard in a browser.
- **Bears on:** S-2, S-3, S-5, S-6, S-9, S-10, S-11, S-12; D-3, D-4, D-5, D-6, D-7, D-9, D-10, D-11, D-12, D-13, D-14, D-18, D-20

### C-32: Bun does not enforce `packageManager`, `engines.bun`, or `.bun-version` itself

- **Claim:** With `"packageManager": "bun@1.4.2"` and `"engines": { "bun": "1.4.2" }` added to the root manifest,
  Bun 1.3.11 runs `bun install --frozen-lockfile` with no warning and exit 0; a `.bun-version` file containing
  `1.4.2` does not change what `bun --version` reports. A pin therefore constrains only tools that read it:
  `oven-sh/setup-bun@v2` (E-4) and version managers. Local enforcement would be a human reading the README.
- **Location:** scratch clone; root `package.json`.
- **Evidence:**
  ```
  $ (Bun 1.3.11, packageManager=bun@1.4.2, engines.bun=1.4.2) bun install --frozen-lockfile
  bun install v1.3.11 (af24e281)
  Checked 113 installs across 171 packages (no changes) → exit 0, no warning
  $ echo 1.4.2 > .bun-version && bun --version → 1.3.11
  ```
- **Raised by:** own sweep (executed).
- **Confidence:** Verified.
- **Bears on:** D-1, D-17

### C-33: The upgraded dashboard renders the same DOM as the baseline except for one React Router attribute; APIs and Parquet files are interchangeable across the DuckDB bump

- **Claim:** With the same fixture runs imported, the baseline binaries (Bun 1.3.11 build, DuckDB 1.5.2-r.1,
  hono 4.12.18, React 18, Router 6, marked 15) and the upgraded binaries (Bun 1.4.2 build, DuckDB 1.5.5-r.5,
  hono 4.13.8, React 19.3.0, Router 7.18.4, marked 18.0.13) return byte-identical JSON from `/api/test-runs`,
  `/api/test-runs/:id`, `/api/scil`, `/api/acil`, and `/api/analytics/per-test`; each binary reads the other's
  Parquet files with identical results; and every SPA route renders the same tags, attributes, and text, except
  that React Router 7 adds `data-discover="true"` to every `<Link>`/`<NavLink>` anchor (4 on list pages, 5 on
  detail pages — the whole 84/105-character difference in `body.innerHTML`). Separately, `/api/scil` and
  `/api/acil` return HTTP 500 `TypeError: JSON.stringify cannot serialize BigInt` (from `getScilHistory` /
  `getAcilHistory`) on **both** builds with these fixtures — a pre-existing defect, not an upgrade effect.
- **Location:** `packages/web/src/server/routes/{scil,acil}.ts`; `packages/data/src/run-status.ts` (B14 in C-18);
  fixtures `packages/test-fixtures/data/analytics/{returns-summary,returns-scil-summary,returns-acil-summary,reflects-failed-expectations}`.
- **Evidence:** executed 2026-09-21 — `./harness update-analytics-data` on each build (both import the fixtures),
  `harness-web` on ports 3098 (baseline) and 3099 (upgraded), plus cross-reads (`--data-dir` pointed at the other
  build's `analytics/`):
  ```
  diff /api/test-runs, /api/scil, /api/acil, /api/analytics/per-test, /api/test-runs/20260101T000002 → IDENTICAL (all four pairings)
  DOM summary /scil  baseline: {DIV:5,HEADER:1,NAV:1,SPAN:2,A:4} attrs {…, A@href:4, A@style:4, A@aria-current:1}
  DOM summary /scil  upgraded: same, plus A@data-discover:4
  /runs/20260101T000002: links 5, a[data-discover] 5, body length 6041 vs 5936 (+105 = 5 × `data-discover="true"`)
  both logs: TypeError: JSON.stringify cannot serialize BigInt. at json … at getAcilHistory
  ```
  The fixture run detail renders no `.markdown-content` section (no result text or output files in the fixture), so
  the marked comparison rests on C-31 Stage E. The compiled binaries must run from the repo root: run from another
  directory, `./harness` fails with `Cannot find module '@duckdb/node-bindings-darwin-arm64/duckdb.node'` because
  the `--external` binding resolves against the cwd's `node_modules` (pre-existing, both builds).
- **Raised by:** own sweep (executed, Chrome).
- **Confidence:** Verified on macOS arm64.
- **Bears on:** S-7, S-8, S-10; D-10, D-11, D-20

## Upgrade Target Facts (E-N)

Trust class **Web** unless stated. Labels are the research analyst's; "own" marks facts the run verified against the
registry itself.

### E-1: Bun 1.4.x releases and the lockfile format change

- Bun 1.4.0 released 2026-08-19/20 (one-day discrepancy between sources); 1.4.1 on 2026-09-04; 1.4.2 on 2026-09-05.
  Verified: https://bun.sh/blog/bun-v1.4.1, https://bun.sh/blog/bun-v1.4.2; Secondary for 1.4.0's exact day.
- Bun 1.4 writes `lockfileVersion: 2` by default (3 when catalog overrides are nested). A 1.3.x Bun cannot parse a
  v2 lockfile and `--frozen-lockfile` then fails with the misleading "lockfile had changes, but lockfile is frozen".
  Corroborated across 5+ independent repos: https://github.com/oven-sh/bun/issues/28792,
  https://github.com/vercel/turborepo/discussions/13126, https://github.com/nrwl/nx/issues/37107,
  https://github.com/dependabot/dependabot-core/issues/15848.
- Packages kept alive only by optional-peer slots are dropped from the lockfile on first 1.4 install. Secondary,
  single source (issue 28792).
- **Contradicted by observation (C-29):** on this repo's existing v1 lockfile, Bun 1.4.2 `install` and `update` both
  kept `lockfileVersion: 1`, and 1.3.11 read the result. The v2 rewrite evidently applies to new lockfiles or to
  features that need it, not to every install. Both records are kept per the evidence rule; the observation governs
  the plan.

### E-2: Isolated-linker default and `node_modules/.bun` layout are unchanged between 1.3.11 and 1.4.2

- The linker default is governed by `configVersion` (introduced in Bun 1.3.2): `configVersion: 1` → workspaces use
  `isolated`. The repo already has `configVersion: 1` (C-1). Store layout: `node_modules/.bun/<name>@<ver>/node_modules/<name>/`
  with `@scope+name@ver` for scoped packages. No 1.4.x change to either was found (negative result). Verified:
  https://bun.com/docs/pm/isolated-installs; https://bun.com/blog/release-notes/bun-v1.3.2.

### E-3: Bun 1.4.x runtime changes touching this codebase's API surface

- 1.4.0: `Bun.spawn` with an already-aborted `AbortSignal` throws `AbortError` immediately; `timeout: NaN` and
  `killSignal: 0` now throw. Secondary (issue 28792 referencing #36463). The codebase passes none of these (C-15).
- 1.4.1: `Bun.write` streams `Response`/`ReadableStream` bodies to disk; `Bun.serve` gains HTTP/2 on the same port;
  compiled executables start ~20% faster and are ~45% smaller; `--bytecode-depth` added. Verified:
  https://bun.sh/blog/bun-v1.4.1.
- No documented change to `--hot` or to `bun audit`/`bun outdated`/`bun update` between 1.3.11 and 1.4.2 (negative
  result). `bun audit --audit-level=<level>` remains the documented flag. Verified: https://bun.com/docs/pm/cli/audit.

### E-4: How `oven-sh/setup-bun@v2` picks a version

- Inputs: `bun-version`, `bun-version-file` (reads `package.json`, `.bun-version`, or `.tool-versions`),
  `bun-download-url`, `registry-url`, `scope`, `no-cache`, `token`. With neither version input, resolution order is:
  `package.json` `"packageManager"` → `package.json` `"engines.bun"` → `latest`. Verified, corroborated:
  https://raw.githubusercontent.com/oven-sh/setup-bun/main/README.md.

### E-5: `bun-types` versus `@types/bun`

- Bun's TypeScript guide recommends `bun add -d @types/bun`; `@types/bun` is a thin shim that depends on
  `bun-types`. Verified: https://bun.com/guides/runtime/typescript; Secondary:
  https://github.com/oven-sh/bun/discussions/22056. Whether the types version must match the runtime exactly:
  could not determine. Own: `bun-types@latest` is 1.4.2, matching Bun 1.4.2.

### E-6: Vitest 5.0 (released 2026-09-03)

- Requires Node ≥ 22.12.0; `vite` ≥ 6.4.0 is now a **peer** dependency (Vite 8 satisfies it). Verified:
  https://vitest.dev/guide/migration/, https://vitest.dev/blog/vitest-5.html.
- `vi.mock()`, `vi.unmock()`, `vi.hoisted()` must be at module top level — calling them inside a function or a
  `describe`/`test` callback now **throws** (previously a warning). Verified.
- `clearMocks` now defaults to `true` (`vi.clearAllMocks()` runs before every test). Verified.
- `test.sequential`/`describe.sequential`/`sequential` removed (use `concurrent: false`); `bench` API rewritten;
  deprecated entrypoints `vitest/coverage`, `vitest/reporters`, `vitest/environments`, `vitest/snapshot`,
  `vitest/runners`, `vitest/suite`, `vitest/mocker` removed; `expect.poll()` rejects on timeout; unawaited async
  assertions fail the test; `toThrow("")` matches any message; reports consolidate under `.vitest/`. Verified.
- `workspace` config is deprecated in favor of `projects`. Secondary. Not used here (C-13).
- No migration-guide entry changes `vi.stubGlobal`, default `pool`, or default `environment` (negative result).
- Single-source, Unverified: Vitest workers under Bun on Linux reportedly grow ~0.5 GiB RSS per file
  (https://github.com/oven-sh/bun/issues/42143). Not reproduced on macOS.

### E-7: React 19.3.0 (released 2026-09-09) and `@types/react` 19

- Removed: `ReactDOM.render`, `hydrate`, `unmountComponentAtNode`, `findDOMNode`, string refs, `propTypes` and
  `defaultProps` on function components, legacy context, module-pattern components, `createFactory`;
  `ReactDOMTestUtils.act` → `act` from `react`. `forwardRef` still exists (deprecation only). `createRoot` gains
  `onUncaughtError`/`onCaughtError`. Verified: https://react.dev/blog/2024/04/25/react-19-upgrade-guide.
- `@types/react` 19: the global `JSX` namespace is removed — use `React.JSX`; `useRef()` requires an argument;
  ref callbacks may only return a cleanup function; `ReactElement["props"]` defaults to `unknown`. Codemod:
  `npx types-react-codemod@latest preset-19`. Verified.
- 19.2: `useId` prefix changed to `_r_`; 19.3: View Transitions and Fragment Refs stable, no breaking changes
  surfaced. Secondary.
- Own: `@types/react@latest` = 19.3.0.

### E-8: React Router — v7.18 is the last major that publishes `react-router-dom`; v8 exists

- React Router v8 was released 2026-06-17 (Corroborated: https://remix.run/blog/react-router-v8,
  https://www.infoq.com/news/2026/08/react-route-v8/). Own: `react-router@latest` = 8.4.0;
  `react-router-dom@latest` = 7.18.4.
- In v7, `react-router-dom` is published as a re-export shim of `react-router` to ease v6→v7 migration; the v7→v8
  guide instructs `npm uninstall react-router-dom` and importing from `react-router`/`react-router/dom`. Verified
  for the v8 step: https://reactrouter.com/upgrading/v7 (page title "Updating from v7"); Secondary for the shim.
- v6 `future` flags to enable before upgrading: `v7_relativeSplatPath`, `v7_startTransition`, `v7_fetcherPersist`,
  `v7_normalizeFormMethod`, `v7_partialHydration`, `v7_skipActionErrorRevalidation`; with all enabled, the v7
  upgrade is "generally non-breaking". Verified: https://reactrouter.com/6.30.4/upgrading/future. Only
  `v7_relativeSplatPath` and `v7_startTransition` apply to a `BrowserRouter` app without data APIs.
- `react-router-dom@7.18.0` declares peers `react >=18`, `react-dom >=18`. Verified from the package manifest at
  the release tag.
- Declarative mode (`BrowserRouter` + `Routes`/`Route`) works in v7 without `@react-router/dev`. Secondary,
  corroborated: https://github.com/remix-run/react-router/discussions/12423.
- The canonical v6→v7 upgrade URL now returns 404 (negative result).

### E-9: marked 16, 17, 18

- 16.0.0 (2025-06-27): ESM-only (CJS build removed), Node ≥ 20, `marked.min.js` removed. Verified:
  https://github.com/markedjs/marked/releases/tag/v16.0.0.
- 17.0.0 (2025-11-07): consecutive text tokens inside lists change; `listItem` renderer simplified; `Checkbox`
  token added; loose-list text tokens become `paragraph`. Affects custom renderers/extensions (none here, C-12).
  Verified: https://github.com/markedjs/marked/releases/tag/v17.0.0.
- 18.0.0 (2026-04-07): trailing blank lines trimmed from block tokens; TypeScript dependency bumped to 6. Verified:
  https://github.com/markedjs/marked/releases/tag/v18.0.0.
- No change to the sync-vs-Promise return type of `marked()` was found (could not determine). marked does not
  sanitize; DOMPurify is the recommended sanitizer. Verified: https://marked.js.org/.

### E-10: Minor and patch targets

- `vite` 8.3.0 published 2026-09-10 (Secondary). `@vitejs/plugin-react` 6.1.1: recoverable React Compiler
  diagnostics no longer logged by default (Secondary).
- `tailwindcss` and `@tailwindcss/vite` are released in lockstep from one monorepo; both are 4.3.3 (Verified for
  4.3.3: https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.3).
- `hono` 4.13.0 (2026-08-03) is performance-focused; 4.13.5 and 4.13.7 are security patches; nothing found on
  `hono/bun` `serveStatic` (not used here). Corroborated: https://github.com/honojs/hono/releases.
- `@duckdb/node-api` 1.5.5-r.5 wraps DuckDB 1.5.5 (2026-07-22, bugfix/security release). No statement either way
  on Parquet compatibility between 1.5.2 and 1.5.5 (could not determine). Own: `@duckdb/node-api`,
  `@duckdb/node-bindings`, and `@duckdb/node-bindings-darwin-arm64` are all 1.5.5-r.5 on the registry (the
  analyst's "r.3" was stale).
- `yargs` 18.2.0 (2026-09-20): fish completion, zsh fix. Verified. The analyst's claim that yargs now ships its own
  types is contradicted by the registry (C-4): `yargs@18.2.0` has no `types` for `"."`; codebase evidence wins.
- `@biomejs/biome` 2.5.14: `biome migrate` updates the `$schema` URL and rule config on every upgrade (Verified:
  https://biomejs.dev/internals/changelog/version/2-4-0/). Rule changes specific to 2.4.12→2.5.14: could not
  determine.
- `picomatch` 4.0.7 (`scan()` changes; Secondary). `postcss` latest 8.5.28 (own). `cli-table3` latest 0.6.5 (own).

### E-11: TypeScript 7.0.2 is npm `latest`

- Own: `bun pm view typescript dist-tags` → `latest: 7.0.2`, `rc: 7.0.1-rc`, `beta: 6.0.0-beta`,
  `next: 7.1.0-dev.20260921.1`. `bunx tsc` with no `tsc` on `PATH` downloads 7.0.2, and all 8 packages typecheck
  under it (C-9). No release-note research was done on TypeScript 7 in this run.

## Findings No Agent Could Audit

- **Bun 1.4.2 executing this repo.** Closed by C-29 and C-30 (an isolated 1.4.2 binary in a scratch clone).
- **The dev flow (`make dev`).** Read, not executed (C-20). The built dashboard was exercised in a browser (C-33).
- **Dynamic loading of `cli-table3`/`picomatch`** from outside `packages/*/src` (C-6).
- **Parquet read compatibility across DuckDB 1.5.2 → 1.5.5.** Closed by C-33 (both directions identical).
- **Vitest-under-Bun memory growth on Linux** (E-6, single source). Observable only on a Linux CI run.
