# Fix Architecture and Security Issues from Architecture Review (2026-03-27)

## Context

The architecture review at `tests/docs/planning/architecture-review-20260327.md` identified 13 structural issues and 1 critical security vulnerability in the test harness packages (`tests/packages/cli`, `tests/packages/data`, `tests/packages/web`). The two most urgent problems are a SQL injection vulnerability in `data/src/analytics.ts` (HTTP-derived `runId` interpolated directly into DuckDB queries) and a pervasive `process.exit()` / `process.cwd()` anti-pattern that blocks library extraction and testability.

This plan remediates all 8 recommended fixes (A1–A8) in one PR each, ordered to de-risk security first, then lay the architectural foundation before larger refactors.

---

## PR Order and Approach

### PR 1 — A2: Fix SQL injection in DuckDB queries
**Source findings**: B7, R2
**Files**: `tests/packages/data/src/analytics.ts`

- Add `validateRunId(runId: string): void` that throws `InvalidRunIdError` if the value doesn't match `/^\d{8}-\d{6}/`
- Replace all string-interpolated `runId` and `testRunId` references in DuckDB SQL with `$1`, `$2` parameterized placeholders
- Call `validateRunId` at the entry point of every exported function that accepts a `runId`
- **Tests**: unit tests for `validateRunId` (valid format passes, malformed/injected strings throw); integration test that a crafted `runId` containing a DuckDB file-read payload is rejected

---

### PR 2 — A5: Fix promise pool race conditions in SCIL eval
**Source findings**: C1, C2, R5
**Files**: `tests/packages/cli/src/scil/step-5-run-eval.ts`

- Replace non-deterministic `results[0]` index access with index-based storage (pre-size the array, write to `results[runIndex]`)
- Add per-task `.catch()` handler so a sandbox failure in one slot doesn't orphan in-flight work
- Sort `results` by `runIndex` before aggregation
- **Tests**: unit test that result ordering is deterministic regardless of promise resolution order; test that a single-task failure doesn't drop other results

---

### PR 3 — A1: Replace process.exit() with typed errors + injectable paths
**Source findings**: S5, S10, B1, B2, C9, R1
**Files**:
- New: `tests/packages/cli/src/lib/errors.ts` — `HarnessError`, `ConfigNotFoundError`, `RunNotFoundError`
- New: `tests/packages/cli/src/lib/path-config.ts` — `PathConfig` interface, `createPathConfig(rootDir: string)`
- Modified: `tests/packages/cli/src/paths.ts` — remove module-load `process.cwd()` anchoring; export `createPathConfig`
- Modified (8 files throwing `process.exit()`): `step-2-validate-config.ts`, `step-3-read-config.ts`, `step-1-resolve-run-dir.ts`, `prompt/index.ts`, `skill-call/index.ts`, plus any remaining exit sites
- Modified: `tests/packages/cli/src/index.ts` — becomes the sole process boundary that catches `HarnessError` and calls `process.exit(1)` with a formatted message

All step functions throw a typed `HarnessError` subclass instead of calling `process.exit()` directly.

- **Tests**: unit tests for each step that previously called `process.exit()` — verify they now throw the correct error type; test that `createPathConfig` produces correct paths for an injected root; test that CLI `index.ts` exits with code 1 on `HarnessError` and 0 on success

---

### PR 4 — A4: Track LLM judge infrastructure failures in storage
**Source findings**: B4, R4
**Files**:
- `tests/packages/data/src/types.ts` — add `status?: 'evaluated' | 'infrastructure-error'` and `error_message?: string` to `TestResultRecord`
- `tests/packages/cli/src/test-eval-steps/step-3b-evaluate-llm-judges.ts` — catch block sets `status: 'infrastructure-error'` and `error_message` instead of silently writing a partial record
- `tests/packages/data/src/analytics.ts` — update affected queries to filter `WHERE (status IS NULL OR status != 'infrastructure-error')` so infrastructure errors don't corrupt pass-rate metrics

- **Tests**: unit test that a caught judge exception produces a record with `status: 'infrastructure-error'`; unit test that analytics queries exclude infrastructure-error records from pass-rate calculations

---

### PR 5 — A3: Move SCIL domain logic to data package
**Source findings**: S1, S3, S6, B3, R3
**New files in `tests/packages/data/src/`**:
- `skill-frontmatter.ts` — consolidated YAML operations; single canonical `replaceDescription` implementation (eliminates the two divergent versions in CLI)
- `scil-split.ts` — seeded PRNG and train/test splitting logic
- `scil-prompt.ts` — LLM improvement prompt construction
- `re-eval-marker.ts` — re-evaluation bookkeeping (moved from `cli/src/re-eval-marker.ts`)
- `run-status.ts` — run evaluation status queries

**Modified SCIL step files** (become thin callers):
- `cli/src/scil/step-3-read-skill.ts`
- `cli/src/scil/step-4-build-temp-plugin.ts`
- `cli/src/scil/step-5-run-eval.ts`
- `cli/src/scil/step-7-improve-description.ts`
- `cli/src/scil/step-8-apply-description.ts`

**Deleted**: the duplicate `replaceDescription` implementation from whichever file is the secondary one.

- **Tests**: unit tests for each new data module (frontmatter parsing, PRNG split determinism, prompt construction); verify step files delegate correctly to data package

---

### PR 6 — A6: Move test-run aggregation to data package
**Source findings**: S2, B5, R7
**Files**:
- `tests/packages/data/src/analytics.ts` — add `queryTestRunSummaries()` using DuckDB `GROUP BY` instead of in-memory JS grouping; move `TestRunSummary` type to `tests/packages/data/src/types.ts`
- `tests/packages/web/src/server/routes/test-runs.ts` — becomes a thin HTTP wrapper that calls `queryTestRunSummaries()`; remove `parseRunIdDate` logic and the local `TestRunSummary` type

- **Tests**: unit test for `queryTestRunSummaries()` returning correctly grouped data; verify web route passes through without re-aggregating

---

### PR 7 — A7: Introduce DuckDB connection manager
**Source findings**: C8, R6
**Files**:
- New: `tests/packages/data/src/connection.ts` — module-level `Map<dataDir, DuckDB.Database>` instance cache; exports `withConnection<T>(dataDir: string, fn: (conn) => Promise<T>): Promise<T>`
- Modified: `tests/packages/data/src/analytics.ts` — all query functions call `withConnection` instead of creating a new instance per request

Strategy: one shared instance per `dataDir` (no max pool size).

- **Tests**: test that repeated calls with the same `dataDir` reuse the same instance; test that different `dataDirs` get separate instances

---

### PR 8 — A8: Consolidate types and remove trivial wrappers
**Source findings**: S4, S7, S8, B6, R10
**Files**:
- `tests/packages/data/src/types.ts` — single canonical `RunTotals` type (rename from whichever `Totals` definition is secondary)
- `tests/packages/cli/src/lib/metrics.ts` — delete `parseEvents()` and `extractTestMetrics()` one-line pass-through wrappers; update all callers to import directly from `@testdouble/harness-data`; make `accumulateTotals` return a new object instead of mutating
- `tests/packages/cli/src/test-eval-steps/step-3-evaluate-all-tests.ts` — remove duplicate `Totals` definition, import from data package
- Shared constant for the `tests.json` filename (eliminates duplication between `step-2-validate-config.ts` and `scil/step-1-resolve-and-load.ts`)

- **Tests**: confirm no runtime regressions after type/wrapper consolidation (existing test suite passes)

---

## Verification

Each PR:
1. `npm run check` and `npm run lint` pass with zero errors in the `tests/packages/` workspace
2. Newly added tests pass
3. Full existing test suite passes (no regressions)

Cross-cutting:
- After PR 3 (A1): run all CLI commands against a real test suite to confirm no `process.exit()` leak remains at mid-pipeline level
- After PR 5 (A3): run a full SCIL loop to confirm skill description improvement still works end-to-end
- After PR 6 (A6): load the web dashboard and verify test-run summaries render correctly
- After PR 7 (A7): run the web server under concurrent load (`/api/analytics` + `/api/test-runs`) and confirm no DuckDB instance proliferation
