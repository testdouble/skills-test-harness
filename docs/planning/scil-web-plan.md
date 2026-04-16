# SCIL Analytics & Screen Designs

## Context

The `scil` CLI command now produces two output files per run in the timestamped output directory:
- `scil-iteration.jsonl` — one JSONL record per iteration of skill description improvement
- `scil-summary.json` — a single JSON object summarizing the full run (best iteration, best description, original description)

These files need to be imported into the analytics parquet store (alongside the existing test-config/test-run/test-results tables), exposed through new API routes, and presented in a new "SCIL History" web UI section with a list screen and a detail screen.

---

## Part 1: Data Layer (`tests/packages/data/src/analytics.ts`)

### 1a. Extend `importJsonlToParquet` — add optional `selectExpression`

Add an optional `selectExpression?: string` parameter (defaults to `'*'`). Apply it in **both** the CREATE path and the APPEND path's `read_json` side:

- CREATE: `COPY (SELECT ${selectExpression} FROM read_json(...))`
- APPEND: `SELECT * FROM read_parquet(existing) UNION ALL BY NAME (SELECT ${selectExpression} FROM read_json(...) WHERE ...)`

This lets the scil-iteration import denormalize `skill_file` from the nested `trainResults` array.

### 1b. Add scil-summary JSON → JSONL helper

Add a private helper `convertScilSummariesToTempJsonl(outputDir): Promise<string | null>`:
- Glob for `{outputDir}/*/scil-summary.json` using Node's `readdir`/`fs/promises`
- For each matching file: read, parse JSON, extract top-level fields only (drop `iterations` array): `test_run_id`, `originalDescription`, `bestIteration`, `bestDescription`
- Write all records as single-line JSONL to a single OS temp file (`os.tmpdir()`)
- Return the temp file path, or `null` if no files found

The caller (`updateAllParquet`) is responsible for cleaning up this temp file after `importJsonlToParquet` returns.

### 1c. Extend `updateAllParquet` — add two SCIL tables

Add after existing three tables:

**`scil-iteration`**:
- jsonlGlob: `{outputDir}/*/scil-iteration.jsonl`
- parquet: `{dataDir}/scil-iteration.parquet`
- selectExpression: `'*, trainResults[1].skillFile AS skill_file'`
  (DuckDB uses 1-based list indexing; `trainResults[1]` is the first element)

**`scil-summary`**:
- No glob — call `convertScilSummariesToTempJsonl(outputDir)` to produce a temp JSONL path
- If `null` returned, log "no data found for: scil-summary" and skip
- parquet: `{dataDir}/scil-summary.parquet`
- Call `importJsonlToParquet({ jsonlGlob: tempPath, parquetPath: ... })` (no selectExpression needed)
- Clean up temp file in a `finally` block after the call

### 1d. New query functions

**`queryScilHistory(dataDir)`** → `ScilHistoryRow[]`

```sql
SELECT
  i.test_run_id,
  i.skill_file,
  MAX(i.iteration) AS iteration_count,
  MAX(i.trainAccuracy) AS best_train_accuracy
FROM read_parquet('{dataDir}/scil-iteration.parquet') i
GROUP BY i.test_run_id, i.skill_file
ORDER BY i.test_run_id DESC
```

**`queryScilRunDetails(dataDir, runId)`** → `ScilRunDetails`
- Validate run exists in `scil-summary.parquet`, throw `SCIL run not found: {runId}` if not
- Query 1: one row from `scil-summary.parquet` WHERE `test_run_id = '{runId}'`
- Query 2: all rows from `scil-iteration.parquet` WHERE `test_run_id = '{runId}'` ORDER BY iteration ASC
- Return `{ summary: ScilSummaryRow, iterations: ScilIterationRow[] }`

---

## Part 2: Types (`tests/packages/data/src/types.ts`)

```typescript
// JSONL record shapes for SCIL output files
export interface ScilTrainResult {
  testName:  string
  skillFile: string
  expected:  boolean
  actual:    boolean
  passed:    boolean
  runIndex:  number
}

export interface ScilIterationRecord {
  test_run_id:   string
  iteration:     number
  description:   string
  trainResults:  ScilTrainResult[]
  testResults:   ScilTrainResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

export interface ScilSummaryRecord {
  test_run_id:         string
  originalDescription: string
  bestIteration:       number
  bestDescription:     string
}

// Analytics query result shapes
export interface ScilHistoryRow {
  test_run_id:         string
  skill_file:          string
  iteration_count:     number
  best_train_accuracy: number
}

export interface ScilSummaryRow {
  test_run_id:         string
  originalDescription: string
  bestIteration:       number
  bestDescription:     string
}

export interface ScilIterationRow {
  test_run_id:   string
  iteration:     number
  skill_file:    string
  description:   string
  trainResults:  ScilTrainResult[]
  testResults:   ScilTrainResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

export interface ScilRunDetails {
  summary:    ScilSummaryRow
  iterations: ScilIterationRow[]
}
```

---

## Part 3: CLI command (`tests/packages/cli/src/commands/update-analytics.ts`)

Extend `ALL_TABLES` array to include `'scil-iteration'` and `'scil-summary'`.

---

## Part 4: Web Server

### 4a. New route file: `tests/packages/web/src/server/routes/scil.ts`

```typescript
import type { Context } from 'hono'
import { queryScilHistory, queryScilRunDetails } from '@testdouble/harness-data'

export async function getScilHistory(c: Context, dataDir: string): Promise<Response>
export async function getScilRunById(c: Context, dataDir: string): Promise<Response>
```

- `getScilHistory`: calls `queryScilHistory(dataDir)`, returns `{ runs }`
- `getScilRunById`: reads `runId` via `c.req.param('runId')`, calls `queryScilRunDetails(dataDir, runId)`, returns `{ summary, iterations }`. On `SCIL run not found:` error, returns `{ error: 'Not found' }` with 404.

### 4b. Route tests: `tests/packages/web/src/server/routes/scil.test.ts`

New test file following the same pattern as `analytics.test.ts`. Test cases:
- `getScilHistory` returns `{ runs }` with correct shape
- `getScilRunById` returns `{ summary, iterations }` for a known runId
- `getScilRunById` returns 404 for an unknown runId

### 4c. Register routes in `tests/packages/web/src/server/index.ts`

```typescript
import { getScilHistory, getScilRunById } from './routes/scil'
// ...
app.get('/api/scil', (c) => getScilHistory(c, dataDir))
app.get('/api/scil/:runId', (c) => getScilRunById(c, dataDir))
```

---

## Part 5: Integration Tests (`tests/packages/data/src/analytics.integration.test.ts`)

Add fixture helpers in `analytics-test-helpers.ts`:
- `makeScilIterationRecord(overrides?)` — builds a `ScilIterationRecord`
- `makeScilSummaryRecord(overrides?)` — builds a `ScilSummaryRecord`
- `writeScilRunFixture(dir, runId, iterations)` — writes `scil-iteration.jsonl` + `scil-summary.json` to `dir/{runId}/`

Add integration test cases:
1. `updateAllParquet` imports `scil-iteration.jsonl` → `scil-iteration.parquet` (verifies row count, `skill_file` denormalization)
2. `updateAllParquet` imports `scil-summary.json` → `scil-summary.parquet` (verifies field projection, `iterations` array NOT present as column)
3. `updateAllParquet` deduplicates SCIL runs by `test_run_id` on second import
4. `queryScilHistory` returns correct rows with `iteration_count` and `best_train_accuracy`
5. `queryScilRunDetails` returns correct `summary` + `iterations` for a known `runId`
6. `queryScilRunDetails` throws with message `SCIL run not found: {runId}` for unknown run

---

## Part 6: Frontend React (`tests/packages/web/src/client/`)

### 6a. Update `NavBar.tsx`

Add a `NavLink` to `/scil` between "History" and "Analytics", matching the existing NavLink style:
```tsx
<NavLink to="/scil" ...>SCIL History</NavLink>
```

### 6b. Update `index.tsx`

Add two new routes:
```tsx
import { ScilHistory } from './pages/ScilHistory'
import { ScilDetail } from './pages/ScilDetail'
// ...
<Route path="/scil" element={<ScilHistory />} />
<Route path="/scil/:runId" element={<ScilDetail />} />
```

### 6c. New page: `ScilHistory.tsx`

Fetches `GET /api/scil`, renders:
- **Page header**: "SCIL History" title + subtitle
- **Stats row** (3 cards): Total Runs, Unique Skills, Avg Best Accuracy (computed from runs data client-side)
- **Table**: columns — RUN ID (Link to `/scil/:runId`), SKILL, BEST ACCURACY, ITERATIONS
- Loading / error / empty states following `TestRunHistory.tsx` pattern

### 6d. New page: `ScilDetail.tsx`

Fetches `GET /api/scil/:runId`, renders:
- **Back link**: "← Back to SCIL History" to `/scil`
- **Run header**: "SCIL Run {runId}"
- **Original Description card**: block of text with section header
- **Iterations section**: numbered list, each iteration shows:
  - Iteration number + accuracy badges (trainAccuracy / testAccuracy)
  - Description text block
  - trainResults table: columns — TEST NAME, EXPECTED, ACTUAL, PASSED (✓/✗)
- **Best Description card**: highlighted (lime green accent), shows `bestDescription` + "Best: iteration {bestIteration}"
- Loading / error / 404 states following `TestRunDetail.tsx` pattern

---

## Part 7: Screen Designs (`tests/docs/test-harness.pen`)

Use Pencil MCP tools (`batch_get`, `batch_design`) to:
1. **Copy "Test Run History" screen** as basis for "SCIL History"
2. **SCIL History screen**: update nav, title, stats cards (Total Runs, Unique Skills, Avg Best Accuracy), table columns (RUN ID, SKILL, BEST ACCURACY, ITERATIONS)
3. **SCIL Detail screen** (modeled after Test Run Detail):
   - Header + back link
   - "Original Description" card
   - Iterations section with per-iteration description + trainResults table
   - "Best Description" highlighted card

---

## Critical Files

**Data layer:**
- `tests/packages/data/src/analytics.ts` — extend `importJsonlToParquet`, `updateAllParquet`, add query functions
- `tests/packages/data/src/types.ts` — new SCIL types
- `tests/packages/data/src/analytics-test-helpers.ts` — new fixture factories
- `tests/packages/data/src/analytics.integration.test.ts` — new test cases

**CLI:**
- `tests/packages/cli/src/commands/update-analytics.ts` — extend ALL_TABLES

**Web server:**
- `tests/packages/web/src/server/index.ts` — register new routes
- `tests/packages/web/src/server/routes/scil.ts` — new file
- `tests/packages/web/src/server/routes/scil.test.ts` — new file

**Frontend:**
- `tests/packages/web/src/client/components/NavBar.tsx` — add SCIL History nav link
- `tests/packages/web/src/client/index.tsx` — add /scil and /scil/:runId routes
- `tests/packages/web/src/client/pages/ScilHistory.tsx` — new file
- `tests/packages/web/src/client/pages/ScilDetail.tsx` — new file

**Designs:**
- `tests/docs/test-harness.pen` — SCIL History + SCIL Detail screen designs

---

## Verification

1. Run `bun test tests/packages/data/src/analytics.integration.test.ts` — all SCIL tests pass
2. Run `./harness update-analytics-data` — prints `updated: scil-iteration.parquet` and `updated: scil-summary.parquet`
3. Start `harness-web` and verify:
   - `GET /api/scil` returns `{ runs: [...] }` with test_run_id, skill_file, iteration_count, best_train_accuracy
   - `GET /api/scil/20260324T095814` returns `{ summary: {...}, iterations: [...] }` with 3 iterations and nested trainResults
   - `GET /api/scil/nonexistent` returns 404
4. Open the web UI at `http://localhost:3099/scil` — SCIL History table renders
5. Click a run ID — SCIL Detail renders with original description, iterations, best description
6. Open `tests/docs/test-harness.pen` in Pencil — review SCIL History and SCIL Detail screen designs
