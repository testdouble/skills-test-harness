# Architectural Analysis: tests/packages/

## Context

The user wants to add new features to the test harness system but first needs to establish the right structural foundation. The core goal is:

1. **`data` package** — owns all data access, analytics, import, and updates
2. **`web` and `cli` packages** — thin shells only, no domain logic
3. **CLI specifically** — extract a behavioral library from it, so CLI becomes an execution harness around that library

Five specialist agents analyzed the codebase (structural, behavioral, concurrency, risk, architecture). Full verbatim outputs from each follow the executive summary.

---

## Executive Summary

**Most critical findings:**

1. **`process.exit()` + `process.cwd()` in pipeline steps** — 11 exit sites across 8 files, all paths hardcoded at module load from `process.cwd()`. This is the single biggest blocker for library extraction. Nothing else can be extracted until this is fixed.

2. **SQL injection via HTTP-derived `runId`** — The web server passes `c.req.param('runId')` directly into DuckDB SQL template literals in `analytics.ts`. DuckDB supports file I/O functions, so a crafted URL can read arbitrary files. Highest-severity active security issue.

3. **SCIL domain logic stranded in CLI** — Seeded PRNG train/test splitting, YAML frontmatter parsing, LLM improvement prompt building (97 lines), and two divergent `replaceDescription()` implementations all live in CLI. They have no CLI dependency and belong in `data`.

4. **LLM judge infrastructure failures silently stored as test failures** — Docker failures, rate limits, and network errors in judge evaluation write `passed: false, judge_score: 0` permanently to Parquet with no distinguishing flag.

5. **Promise pool in SCIL eval is broken** — Non-deterministic `results[0]` in `aggregateByMajorityVote`, and no `.catch()` per task means one sandbox failure orphans all in-flight work.

**Dimensions with no blocking issues:** The `data` package's dependency direction is already correct — it imports only DuckDB and Node built-ins, never CLI or web. Web routes are mostly thin (except `getTestRuns`). Sequential test runner loops correctly avoid concurrent JSONL write races.

---

## Structural Analysis

**S1: `re-eval-marker.ts` — Stateful bookkeeping owned by CLI that belongs in `data`**

File: `cli/src/re-eval-marker.ts`

The re-evaluation marker file (tracks which run IDs have been re-evaluated) is owned by CLI but coordinates between `test-eval` and `update-analytics-data` commands. The `data` package's `updateAllParquet` receives `reEvaluatedRunIds` as a parameter but the discovery/maintenance logic lives in CLI.

```ts
export async function getReEvaluatedRuns(outputDir: string): Promise<string[]> { ... }
export async function markAsReEvaluated(outputDir: string, runId: string): Promise<void> { ... }
export async function clearReEvaluatedRuns(outputDir: string, runIds: string[]): Promise<void> { ... }
```

Any consumer that wants to replicate the re-eval workflow must carry this logic independently. The `data` package's `updateAllParquet` cannot be called correctly without coordinating via a CLI-resident file.

---

**S2: `test-run-summary aggregation` — Analytics derivation in `web`, not `data`**

File: `web/src/server/routes/test-runs.ts`

The `getTestRuns` handler performs group-by-run aggregation in JavaScript after loading all per-test rows. The `TestRunSummary` type is locally defined in web. `parseRunIdDate` is also local.

```ts
interface TestRunSummary {
  test_run_id: string
  suite:       string
  date:        string
  total_tests: number
  passed:      number
  failed:      number
}
```

The `TestRunSummary` concept is invisible to the CLI's analytics commands. The run-ID date-parsing convention is undocumented and only in this route.

---

**S3: `build-temp-plugin` — Plugin assembly logic in `cli`, not `data`**

Files: `cli/src/test-runners/skill-call/build-temp-plugin.ts`, `cli/src/scil/step-4-build-temp-plugin.ts`

YAML frontmatter parsing, stripping non-triggering fields, rebuilding plugin filesystem structure — all in CLI. High churn (5 changes in 90 days). Both scil and skill-call test runner use this. `step-4-build-temp-plugin.ts` is a one-line pass-through:

```ts
export async function buildIterationPlugin(skillFile, runDir, description) {
  return buildTempPluginWithDescription(skillFile, runDir, description)
}
```

---

**S4: `Totals` type — Duplicated definition**

Files: `cli/src/lib/metrics.ts`, `cli/src/test-eval-steps/step-3-evaluate-all-tests.ts`

```ts
// cli/src/lib/metrics.ts
export type Totals = { totalDurationMs: number, totalInputTokens: number, totalOutputTokens: number, failures: number }

// step-3-evaluate-all-tests.ts
type Totals = { totalDurationMs: number; totalInputTokens: number; totalOutputTokens: number }
```

---

**S5: `process.exit` calls embedded throughout business logic steps**

Files: `test-runners/steps/step-2-validate-config.ts`, `step-3-read-config.ts`, `test-eval-steps/step-1-resolve-run-dir.ts`, `prompt/index.ts`, `skill-call/index.ts`

```ts
// step-2-validate-config.ts
if (!(await Bun.file(configFilePath).exists())) {
  process.stderr.write(`Error: tests.json not found: ${configFilePath}\n`)
  process.exit(1)
}
```

`process.exit()` called inside mid-pipeline functions rather than at the command boundary. Blocks library extraction. Untestable without mocking.

---

**S6: `filterUnevaluated` — Filesystem logic embedded in a command handler**

File: `cli/src/commands/test-eval.ts`

```ts
async function hasBeenEvaluated(runDir: string): Promise<boolean> {
  try {
    const s = await stat(path.join(runDir, 'test-results.jsonl'))
    return s.size > 0
  } catch { return false }
}
```

Implemented inline in the command handler, not in a step or library module. The "has this run been evaluated?" concept is invisible to any future library consumer.

---

**S7: `parseStreamJsonLines` — Thin wrapper in `cli/lib/metrics.ts` is unnecessary indirection**

```ts
export function parseEvents(captured: string): StreamJsonEvent[] {
  return parseStreamJsonLines(captured)
}
export function extractTestMetrics(events: StreamJsonEvent[]): ParsedRunMetrics {
  return extractMetrics(events)
}
```

One-line renames of data package functions. `scil/step-7` bypasses these entirely, making the indirection inconsistent.

---

**S8: `output.ts` — Thin wrapper with no added behavior, inconsistently used**

`cli/src/lib/output.ts` groups three data calls. Scil bypasses it and calls `ensureOutputDir` from data directly.

---

**S9: `validateConfig` step — `tests.json` filename duplicated across subsystems**

`path.join(testSuiteDir, 'tests.json')` appears independently in `test-runners/steps/step-2-validate-config.ts` and `scil/step-1-resolve-and-load.ts` with different error handling strategies.

---

**S10: `cli/src/paths.ts` — Hardcoded `process.cwd()` anchoring**

```ts
export const testsDir   = process.cwd()
export const harnessDir = path.join(testsDir, 'packages')
export const dockerDir  = path.join(harnessDir, 'docker')
export const repoRoot   = path.join(testsDir, '..')
export const outputDir  = path.join(testsDir, 'output')
export const dataDir    = path.join(testsDir, 'analytics')
```

All paths computed at module load from `process.cwd()`. Cannot override without `cd`. Some CLI flags offer override but many step modules import the constants directly, bypassing the override.

---

## Behavioral Analysis

**B1: `paths.ts` anchors all runtime paths to `process.cwd()` — every package assumes the same working directory**

Same as S10, behavioral perspective: the library extraction goal is blocked because there is no injection point for paths. The CLI cannot be used as a library without `cd`-ing to the right directory first.

---

**B2: `process.exit()` is called inside data-transformation functions — errors cannot propagate**

Same as S5, behavioral perspective. Notably `step-3-read-config.ts`:

```ts
const config = await readTestSuiteConfig(configFilePath).catch((err: Error) => {
  process.stderr.write(`Error: Failed to read config: ${err.message}\n`)
  return process.exit(1)  // used as .catch() return value — looks like it returns a valid config
})
```

This is particularly confusing: `process.exit(1)` is used as the return value of `.catch()`. The function looks like it returns a `TestSuiteConfig` but actually terminates the process.

---

**B3: Business logic — skill description parsing, train/test splitting, improvement prompt construction, and frontmatter rewriting — all live in the CLI package**

Files: `scil/step-2-split-sets.ts`, `scil/step-3-read-skill.ts`, `scil/step-7-improve-description.ts`, `scil/step-8-apply-description.ts`, `test-runners/skill-call/build-temp-plugin.ts`

Two independent `replaceDescription` implementations with different escaping:

```ts
// step-8-apply-description.ts
function replaceDescription(frontmatter: string, newDescription: string): string {
  const escaped = newDescription.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  ...
}

// build-temp-plugin.ts
function replaceDescription(frontmatter: string, newDescription: string): string {
  const sanitized = sanitizeForYaml(newDescription)
  ...
}
```

---

**B4: LLM judge infrastructure failures silently recorded as test failures**

File: `cli/src/test-eval-steps/step-3b-evaluate-llm-judges.ts`

Docker failures, network errors, model rate limits all fall into the catch block and write `passed: false, judge_score: 0` to permanent Parquet storage. The `console.log` warning is the only signal.

---

**B5: `getTestRuns` in web performs aggregation that `data` doesn't expose**

File: `web/src/server/routes/test-runs.ts`

Loads all per-test rows into memory and groups in JavaScript. Grows linearly with test history. `TestRunSummary` is a web-only type.

---

**B6: `Totals` is mutated in place while `failures` is tracked locally**

`accumulateTotals` mutates `totalDurationMs`/`totalInputTokens`/`totalOutputTokens` in place, but callers track `failures` as a separate local variable and merge on return. Works by accident of sequential execution.

---

**B7: SQL queries use string interpolation for HTTP-derived values**

File: `data/src/analytics.ts`

```ts
const existsRows = (await conn.runAndReadAll(`
  SELECT 1 FROM read_parquet('${dataDir}/test-run.parquet')
  WHERE type = 'result' AND test_run_id = '${testRunId}'
  LIMIT 1
`)).getRowObjects()
```

`runId` from `c.req.param('runId')` (HTTP URL) flows directly into DuckDB SQL. DuckDB supports file I/O functions (`COPY TO`, `read_csv`) — a crafted runId could exfiltrate arbitrary files.

---

**B8: `re-eval-marker.ts` read-modify-write without file locking**

```ts
export async function markAsReEvaluated(outputDir: string, runId: string): Promise<void> {
  const existing = await getReEvaluatedRuns(outputDir)
  if (!existing.includes(runId)) {
    existing.push(runId)
    await writeFile(markerPath(outputDir), JSON.stringify(existing), 'utf8')
  }
}
```

Concurrent `test-eval` processes can both read before either writes, one overwriting the other's entry.

---

**B9: `scil-summary.json` uses unique in-process format adapter**

Files: `cli/src/scil/step-9-write-output.ts`, `data/src/analytics.ts`

Only SCIL summaries require JSON → strip fields → temp JSONL → Parquet pipeline. Schema mismatch between writer and reader caught only at query time.

---

**B10: `runInSandbox` drains stdout before reading stderr — potential pipe deadlock**

File: `cli/src/lib/sandbox.ts`

stdout is fully drained in a while loop before `stderrPromise` is awaited. Under high stderr volume, the stderr pipe buffer could fill and block the subprocess.

---

## Concurrency Analysis

**C1: Race condition on shared `results` array in concurrent promise pool**

File: `cli/src/scil/step-5-run-eval.ts`

```ts
const task = runSingleQuery(item.test, item.runIndex, opts).then(result => {
  results.push(result)
})
// ...
return { ...results[0], passed, runIndex: 0 }
```

`results[0]` is whichever sandbox call resolved first — non-deterministic under load. `aggregateByMajorityVote` uses `results[0]` as the template, so fields like `events`, `actual`, `promptContent`, `expected` are from an arbitrary run.

---

**C2: Unhandled promise rejection in concurrent promise pool on sandbox failure**

File: `cli/src/scil/step-5-run-eval.ts`

No `.catch()` on `task` or `tracked`. If one sandbox fails, `Promise.race(pending)` throws and the loop exits, orphaning in-flight tasks. Their rejections are unhandled.

---

**C3: Read-modify-write race on `re-evaluated-runs.json` marker file**

File: `cli/src/re-eval-marker.ts`

Concurrent `test-eval` processes can both read the same file contents, both see their runId is absent, both append, and one write overwrites the other. Lost marker entries cause `update-analytics` to append instead of replace, silently duplicating rows in Parquet.

---

**C4: Concurrent `appendFile` calls to same JSONL files**

File: `data/src/jsonl-writer.ts`

Currently safe (sequential for-of loops in test runners). Fragile: `jsonl-writer` has no internal synchronization. Any future refactoring to parallel test execution would corrupt JSONL output.

---

**C5: Shared `TextDecoder` instance across interleaved async reads in `clean` command**

File: `cli/src/commands/clean.ts`

Both `drain` calls share one `TextDecoder` across `Promise.all`. Multi-byte UTF-8 split across chunks could corrupt output.

---

**C6: Mutable `totals` object passed by reference and mutated in `accumulateTotals`**

Files: `cli/src/lib/metrics.ts`, `prompt/index.ts`, `skill-call/index.ts`

Works sequentially. Would race if parallelized.

---

**C7: TOCTOU in `importJsonlToParquet` Parquet file existence check**

File: `data/src/analytics.ts`

`existsSync` check then branch then create/merge. Safe under current sequential usage; breaks under parallel imports.

---

**C8: Web server creates new DuckDB instances per request with no connection pooling**

Files: `data/src/analytics.ts`, `web/src/server/index.ts`

Every query function creates `DuckDBInstance.create(':memory:')`. Only `conn.closeSync()` is called; the `DuckDBInstance` itself is never disposed. Unbounded memory under concurrent load.

---

**C9: `process.exit(1)` in async error path terminates process without awaiting in-flight work**

Files: `prompt/index.ts`, `skill-call/index.ts`

`process.exit(1)` terminates before buffered file I/O flushes. JSONL output may be truncated if a prompt file is missing after earlier tests have run.

---

## Risk Assessment

**R1 (Critical): `process.exit` and `process.cwd` patterns block library extraction entirely**
- Addresses: S5, S10, B1, B2, C9
- Likelihood: Near certain | Severity: High | Blast radius: Multi-module | Reversibility: Moderate
- 11 exit sites across 8 files. 20+ files import `paths.ts`. Every new CLI commit deepens the migration cost.

**R2 (High): SQL injection via string interpolation of HTTP-derived `runId`**
- Addresses: B7
- Likelihood: Possible | Severity: Critical | Blast radius: System-wide | Reversibility: Moderate
- `c.req.param('runId')` → unparameterized DuckDB SQL. DuckDB supports file I/O functions.

**R3 (High): SCIL domain logic stranded in CLI blocks data-package ownership goal**
- Addresses: S3, B3, S1, S6
- Likelihood: Near certain | Severity: Medium | Blast radius: Multi-module | Reversibility: Moderate
- Two divergent `replaceDescription` with different escaping. Re-eval markers in CLI. Volatile high-churn files.

**R4 (High): LLM judge infrastructure failures silently recorded as test failures in permanent storage**
- Addresses: B4
- Likelihood: Likely | Severity: High | Blast radius: Multi-module | Reversibility: Difficult
- False failures permanently in Parquet, indistinguishable from genuine test failures.

**R5 (High): Promise pool race conditions and missing error handling in SCIL eval**
- Addresses: C1, C2
- Likelihood: Likely | Severity: High | Blast radius: Single module | Reversibility: Easy
- Non-deterministic results, orphaned in-flight tasks on any sandbox failure.

**R6 (Medium): DuckDB instance-per-request, unbounded memory under concurrent load**
- Addresses: C8
- Likelihood: Possible | Severity: Medium | Blast radius: Single module | Reversibility: Easy

**R7 (Medium): Test-run aggregation logic in web instead of data package**
- Addresses: S2, B5
- Likelihood: Likely | Severity: Medium | Blast radius: Single module | Reversibility: Easy

**R8–R13 (Low):** Re-eval marker race (low-concurrency tool), TOCTOU in Parquet creation (sequential usage is safe), duplicated types/wrappers (cosmetic), duplicated tests.json path (stable convention), TextDecoder sharing and pipe deadlock (unlikely in practice), fragile JSONL writer (latent risk only).

---

## Architectural Recommendations

### A1: Replace process.exit with typed errors to enable library extraction
**Addresses:** S5, S10, B1, B2, C9, R1 — **Priority: Critical**

```pseudo
// cli/src/lib/errors.ts — shared error types
class HarnessError extends Error {
  constructor(message: string, public readonly exitCode: number = 1) {
    super(message)
  }
}
class ConfigNotFoundError extends HarnessError { ... }
class RunNotFoundError extends HarnessError { ... }

// cli/src/lib/path-config.ts — injectable path configuration
interface PathConfig {
  testsDir:    string
  harnessDir:  string
  dockerDir:   string
  repoRoot:    string
  outputDir:   string
  dataDir:     string
}

function createPathConfig(rootDir: string): PathConfig { ... }

// cli/index.ts — sole process.exit boundary
async function runCommand(handler: () => Promise<number>): Promise<never> {
  try {
    const exitCode = await handler()
    process.exit(exitCode)
  } catch (err) {
    if (err instanceof HarnessError) {
      process.stderr.write(err.message + '\n')
      process.exit(err.exitCode)
    }
    throw err
  }
}

// Step functions change from:
//   process.exit(1)
// To:
//   throw new ConfigNotFoundError(`tests.json not found: ${configFilePath}`)
```

Files changed: `cli/src/paths.ts`, `cli/index.ts`, plus 8 step files with `process.exit` calls.

---

### A2: Parameterize DuckDB queries to prevent SQL injection
**Addresses:** B7, R2 — **Priority: High (security)**

```pseudo
// data/src/analytics.ts
async function queryTestRunDetails(dataDir: string, testRunId: string) {
  // Validate format first
  if (!/^\d{8}-\d{6}/.test(testRunId)) {
    throw new Error(`Invalid test run ID format: ${testRunId}`)
  }

  const conn = await getConnection(dataDir)
  const existsRows = await conn.runAndReadAll(
    `SELECT 1 FROM read_parquet($1)
     WHERE type = 'result' AND test_run_id = $2
     LIMIT 1`,
    [`${dataDir}/test-run.parquet`, testRunId]
  )
}
```

Files changed: `data/src/analytics.ts` (all query functions).

---

### A3: Extract SCIL domain logic from CLI into data package
**Addresses:** S1, S3, S6, B3, R3 — **Priority: High**

```pseudo
// data/src/skill-frontmatter.ts — consolidated YAML frontmatter operations
export function parseFrontmatter(content: string): { raw: string, body: string }
export function stripNonTriggeringFields(frontmatter: string): string
export function replaceDescription(frontmatter: string, newDescription: string): string  // one implementation
export function buildTempPluginFiles(skillMdContent: string, pluginName: string, skillName: string, overrideDescription?: string): {
  pluginJson: string
  skillMd: string
}

// data/src/scil-split.ts — seeded PRNG and train/test splitting
export function splitSets(suite, skillFile, tests, holdout): ScilTestCase[]

// data/src/scil-prompt.ts — LLM improvement prompt construction
export function buildImprovementPrompt(opts): string

// data/src/re-eval-marker.ts — re-evaluation bookkeeping (moved from cli)
export async function getReEvaluatedRuns(outputDir: string): Promise<string[]>
export async function markAsReEvaluated(outputDir: string, runId: string): Promise<void>
export async function clearReEvaluatedRuns(outputDir: string, runIds: string[]): Promise<void>

// data/src/run-status.ts — run evaluation status queries
export async function hasBeenEvaluated(runDir: string): Promise<boolean>
export async function filterUnevaluated(outputDir: string, runIds: string[]): Promise<string[]>
```

Files changed: New files in `data/src/`; CLI SCIL steps become thin callers; duplicate `replaceDescription` eliminated.

---

### A4: Distinguish LLM judge infrastructure failures from test failures
**Addresses:** B4, R4 — **Priority: High**

```pseudo
// data/src/types.ts — extend TestResultRecord
interface TestResultRecord {
  // ... existing fields ...
  status?: 'evaluated' | 'infrastructure-error'  // default: 'evaluated'
  error_message?: string                          // present only when status = 'infrastructure-error'
}

// cli/src/test-eval-steps/step-3b-evaluate-llm-judges.ts — catch block
catch (error) {
  allResults.push({
    ...otherFields,
    passed: false,
    status: 'infrastructure-error',
    error_message: errorMessage,
    judge_score: 0,
  })
}

// data/src/analytics.ts — queries filter by default
// WHERE (status IS NULL OR status != 'infrastructure-error')
```

Files changed: `data/src/types.ts`, `cli/src/test-eval-steps/step-3b-evaluate-llm-judges.ts`, `data/src/analytics.ts`.

---

### A5: Fix promise pool error handling and non-deterministic aggregation
**Addresses:** C1, C2, R5 — **Priority: High**

```pseudo
// cli/src/scil/step-5-run-eval.ts — fixed promise pool

interface WorkResult {
  test: ScilTestCase
  runIndex: number
  result?: QueryResult
  error?: Error
}

// Index-based storage — no ordering dependency
const workResults: WorkResult[] = workItems.map(item => ({ test: item.test, runIndex: item.runIndex }))

for (let i = 0; i < workItems.length; i++) {
  const task = runSingleQuery(workItems[i].test, workItems[i].runIndex, opts)
    .then(result => { workResults[i].result = result })
    .catch(error => { workResults[i].error = error instanceof Error ? error : new Error(String(error)) })
  // ... pool management
}

// aggregateByMajorityVote — sort before picking representative
function aggregateByMajorityVote(results: QueryResult[]): QueryResult {
  const sorted = [...results].sort((a, b) => a.runIndex - b.runIndex)
  const passCount = sorted.filter(r => r.passed).length
  const passed = passCount > sorted.length / 2
  return { ...sorted[0], passed, runIndex: 0 }
}
```

Files changed: `cli/src/scil/step-5-run-eval.ts`.

---

### A6: Move test-run aggregation from web into data package
**Addresses:** S2, B5, R7 — **Priority: Medium**

```pseudo
// data/src/analytics.ts — new SQL-based aggregation
async function queryTestRunSummaries(dataDir: string): Promise<TestRunSummary[]> {
  // GROUP BY in DuckDB SQL — no in-memory grouping
}

// web/src/server/routes/test-runs.ts — becomes thin
async function getTestRuns(c: Context, dataDir: string) {
  const runs = await queryTestRunSummaries(dataDir)
  return c.json({ runs })
}
```

Files changed: `data/src/types.ts`, `data/src/analytics.ts`, `data/index.ts`, `web/src/server/routes/test-runs.ts`.

---

### A7: Introduce a shared DuckDB connection manager
**Addresses:** C8, R6 — **Priority: Medium**

```pseudo
// data/src/connection.ts
const instances = new Map<string, DuckDBInstance>()

export async function withConnection<T>(
  dataDir: string,
  fn: (conn: DuckDBConnection) => Promise<T>
): Promise<T> {
  const instance = instances.get(dataDir) ?? await DuckDBInstance.create(':memory:')
  if (!instances.has(dataDir)) instances.set(dataDir, instance)
  const conn = await instance.connect()
  try {
    return await fn(conn)
  } finally {
    conn.closeSync()
  }
}
```

Files changed: New `data/src/connection.ts`; `data/src/analytics.ts` (all query functions).

---

### A8: Consolidate Totals type and remove trivial wrappers
**Addresses:** S4, S7, S8, B6, R10 — **Priority: Low**

Define one canonical `RunTotals` in `data/src/types.ts`. Make `accumulateTotals` return a new object (immutable). Delete `parseEvents` and `extractTestMetrics` one-line wrappers — callers import directly from `@testdouble/harness-data`.

---

## Recommended Implementation Order

1. **A2** — SQL injection fix. Small, isolated, immediately de-risks the active security issue.
2. **A5** — Promise pool fix. Small, isolated, fixes active correctness bugs in SCIL eval.
3. **A1** — Replace `process.exit` + `paths.ts` with injectable config. This unblocks everything else.
4. **A4** — Add `status` field to distinguish judge infrastructure failures.
5. **A3** — Move SCIL domain logic and re-eval marker to data package. Largest refactor; A1 must be done first.
6. **A6** — Move test-run aggregation to data package.
7. **A7** — DuckDB connection manager.
8. **A8** — Consolidate types and remove wrappers.

## Verification

- `bun test` in `tests/packages/cli/` — no `process.exit` mocks should remain after A1
- `bun test` in `tests/packages/data/` — new modules from A3 should be fully tested
- Manual: hit `/api/analytics/per-test/:runId` with a crafted `runId` containing a single quote — should return 400, not 500, after A2
- Manual: run a SCIL eval with `concurrency > 1` and kill one Docker container mid-run — should report error and complete with remaining results, not crash, after A5
- Manual: run `update-analytics-data` after a `test-eval` with a judge that fails — verify `status: 'infrastructure-error'` row in Parquet and dashboard shows it separately after A4
