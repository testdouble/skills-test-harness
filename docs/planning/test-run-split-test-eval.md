# Plan: Split test-run and test-eval into separate CLI commands

## Context

The `run-test` CLI command currently runs Docker test cases AND evaluates expectations inline. The goal is to split these into two separate commands:
- `test-run` — executes Docker containers, captures events, persists data
- `test-eval {test_run_id}` — reads persisted data and evaluates expectations

This enables re-running evaluations against existing data without re-executing expensive Docker runs, and makes each concern independently testable.

## Decisions Made

| Decision | Choice |
|---|---|
| Command rename | `run-test` → `test-run` |
| Step directory rename | `run-test-steps/` → `test-run-steps/` |
| test-run evaluation | Dropped entirely |
| test-run exit code | Non-zero on Docker/Claude failures only |
| test-run per-test label | `[DONE] testName` (replaces `[PASS]/[FAIL]`) |
| test-eval output | Mirrors current run-test eval output (per-expectation, per-test, totals) |
| test-eval PASS/FAIL label | Based on expectations only (not is_error — that's test-run's concern) |
| test-eval re-run | Overwrites test-results.jsonl |
| test-eval filtering | Always evaluates all tests in the run |
| Event attribution | Add `test_case` to ALL events in test-run.jsonl (not just result events) |
| Old-format runs | test-eval errors with clear message if events lack `test_case` |

---

## Changes Required

### 1. `tests/packages/data/src/jsonl-writer.ts`

In `appendTestRun`, add `test_case: testCaseId` to ALL events (currently only added to result events):

```ts
// Before (result events only):
const enriched = event.type === 'result'
  ? { ...event, test_run_id: testRunId, test_case: testCaseId }
  : { ...event, test_run_id: testRunId }

// After (all events):
const enriched = { ...event, test_run_id: testRunId, test_case: testCaseId }
```

> Note: existing test-run.jsonl files from before this change will not have `test_case` on non-result events. test-eval only works correctly on new runs. Analytics is unaffected (uses only result events).

### 2. `tests/packages/cli/src/commands/run-test-steps/step-8-run-test-cases.ts`

Remove evaluation logic from the `runTestCases` loop:
- Remove step **(i)**: `evaluateExpectations()` call
- Remove step **(j)**: `printExpectationResults()` call
- Change step **(k)**: `printTestResult()` → print `[DONE] testName` (remove expectation failure counting)
- Change step **(n)**: remove `appendTestResults()` call from `writeTestOutput`; remove `expectationResults` parameter

Keep: Docker run, event parsing, metrics, `checkRunFailures`, stats printing, `appendTestConfig`, `appendTestRun`.

The `evaluateExpectations` and `printExpectationResults` functions can be deleted from this file.

### 3. Rename command file and steps directory

- Rename `run-test.ts` → `test-run.ts`
- Rename `run-test-steps/` → `test-run-steps/`
- Change `export const command = 'test-run'`
- Change `export const describe = 'Run test cases and store results'`
- Update all imports in `test-run.ts` to point to `test-run-steps/`

### 4. `tests/packages/cli/index.ts`

- Replace `import('./src/commands/run-test.js')` with `import('./src/commands/test-run.js')`
- Add `import('./src/commands/test-eval.js')` as a new command

---

## New Files: test-eval command

### `tests/packages/cli/src/commands/test-eval.ts`

```ts
export const command = 'test-eval <test_run_id>'
export const describe = 'Evaluate expectations against a stored test run'
// builder: positional test_run_id (string, required)
// handler: orchestrate test-eval-steps
```

### `tests/packages/cli/src/commands/test-eval-steps/`

**step-1-resolve-run-dir.ts**
- Compute `path.join(outputDir, testRunId)`
- Verify the directory exists; if not, print error and `process.exit(1)`
- Returns `{ runDir }`

**step-2-read-run-data.ts**
- Use `readJsonlFile<TestConfigRecord>` (already exported from `@testdouble/harness-data`) to read `test-config.jsonl`
- Use `readJsonlFile` to read `test-run.jsonl` as local type `type StoredEvent = StreamJsonEvent & { test_run_id: string; test_case: string }` (no data package type changes needed)
- **Compatibility check**: if any non-result event lacks `test_case`, print error message: _"This run was created before test-eval support. Re-run with test-run to generate compatible data."_ and `process.exit(1)`
- Group events by `test_case` field into a `Map<string, StreamJsonEvent[]>`
- Returns `{ testConfigs: TestConfigRecord[], eventsByTestCase: Map<string, StreamJsonEvent[]> }`

**step-3-evaluate-all-tests.ts**
- For each entry in testConfigs:
  - Print: `Evaluating test: testName`
  - Look up events by `buildTestCaseId(record.suite, record.test.name)`
  - Call `evaluateAllExpectations(record.test.expect, events)` from `@testdouble/harness-data`
  - Print: `[PASS]/[FAIL] expectation_type: value` per expectation (reuse same format as current `printExpectationResults`)
  - Extract metrics from events via `extractMetrics`
  - Print: `[PASS]/[FAIL] testName` based on expectation failures only (not is_error)
  - Print: test stats (duration, tokens)
  - Accumulate totals + failure count
- Returns `{ results: TestResultRecord[], totals: { totalDurationMs, totalInputTokens, totalOutputTokens }, failures }`

**step-4-write-results.ts**
- Delete existing `test-results.jsonl` if present (using `unlink` with ignore-on-missing)
- Call `appendTestResults(runDir, results)` (reuse existing writer)

**step-5-print-totals.ts**
- Import and call `printTotals(totalDurationMs, totalInputTokens, totalOutputTokens)` directly from `../test-run-steps/step-9-print-totals.js`

**step-6-exit.ts**
- Import and call `exitWithResult(failures)` directly from `../test-run-steps/step-10-exit.js`

---

## Reuse of existing utilities

| Utility | Location | Reused by |
|---|---|---|
| `readJsonlFile<T>` | `@testdouble/harness-data` → `jsonl-reader.ts` | test-eval step-2 |
| `evaluateAllExpectations` | `@testdouble/harness-data` → `expectations.ts` | test-eval step-3 |
| `extractMetrics` | `@testdouble/harness-data` → `stream-parser.ts` | test-eval step-3 |
| `appendTestResults` | `@testdouble/harness-data` → `jsonl-writer.ts` | test-eval step-4 |
| `buildTestCaseId` | `@testdouble/harness-data` | test-eval step-3 |
| `printTotals` | `step-9-print-totals.ts` | test-eval step-5 |
| `exitWithResult` | `step-10-exit.ts` | test-eval step-6 |

---

## Test Changes

### Files to update:
- `test-run-steps/step-8-run-test-cases.test.ts` (was `run-test-steps/`) — remove expectation-related assertions; update `[PASS]/[FAIL]` to `[DONE]`; update JSONL write assertions (no test-results.jsonl)
- `data/src/jsonl-writer.test.ts` — update `appendTestRun` tests: all events should now have `test_case`

### New test files to create:
- `test-eval-steps/step-1-resolve-run-dir.test.ts`
- `test-eval-steps/step-2-read-run-data.test.ts`
- `test-eval-steps/step-3-evaluate-all-tests.test.ts`
- `test-eval-steps/step-4-write-results.test.ts`

---

## Verification

1. Run existing tests: `bun test` in `tests/packages/cli/` and `tests/packages/data/`
2. Manual: `./harness test-run --suite <name>` → see `[DONE] testName`, no PASS/FAIL
3. Manual: `./harness test-eval <testRunId>` → see `[PASS]/[FAIL]` per expectation
4. Verify `output/<testRunId>/test-results.jsonl` is NOT created by test-run but IS created by test-eval
5. Verify re-running test-eval overwrites (not appends) test-results.jsonl
