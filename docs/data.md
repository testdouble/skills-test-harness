# Data Package (`@testdouble/harness-data`)

> **Tier 5 · Contributor reference.** Internal documentation for the `packages/data` package. If you're a user looking to query analytics data, see [Analytics](getting-started/analytics.md).

The shared data layer every other harness package depends on. Change this package when you need to touch a type that flows through the pipeline, the `tests.json` parser, JSONL I/O, the DuckDB analytics queries, stream-JSON parsing, SCIL/ACIL train/test splitting, or skill/agent frontmatter manipulation.

What this package owns:

- All TypeScript types that flow through the harness pipeline: test configuration, stream events, expectation results, analytics query shapes, and SCIL/ACIL domain types
- Configuration parsing that reads `tests.json`, normalizes expectation shorthand formats into discriminated union types, validates scaffolds, and defaults model to `"sonnet"`
- DuckDB analytics for JSONL-to-Parquet import and SQL-based queries over test run summaries, per-test details, and SCIL/ACIL improvement history
- Stream-JSON parsing, JSONL read/write, SCIL train/test set splitting, skill description frontmatter manipulation, re-evaluation markers, and run status tracking

- **Last Updated:** 2026-05-15
- **Authors:**
  - River Bailey (river.bailey@testdouble.com)

Key files:
- `packages/data/src/types.ts` — All shared TypeScript interfaces and type unions
- `packages/data/src/config.ts` — Test suite configuration parsing and validation
- `packages/data/src/analytics.ts` — DuckDB JSONL-to-Parquet import and test run queries
- `packages/data/src/connection.ts` — Cached in-memory DuckDB instance management
- `packages/data/index.ts` — Public API barrel export

## Architecture

```
                    tests.json
                        |
                        v
              +-------------------+
              |    config.ts      |     readTestSuiteConfig()
              |  parse & validate |     resolvePromptPath()
              +--------+----------+     readPromptFile()
                       |                buildTestCaseId()
                       v                validateScaffolds()
              +-------------------+
              |    types.ts       |     TestCase, TestExpectation,
              |  shared contracts |     StreamJsonEvent, TestResultRecord,
              +--------+----------+     ScilTestCase, PerTestRow, ...
                       |
          +------------+-------------+
          |            |             |
          v            v             v
  +--------------+ +----------+ +-----------------+
  | jsonl-writer | | jsonl-   | | stream-parser   |
  | append to    | | reader   | | parse stream    |
  | output/      | | read     | | JSON, extract   |
  | JSONL files  | | JSONL    | | metrics & skills |
  | (incl.       | |          | |                 |
  | output-files)| |          | |                 |
  +--------------+ +----------+ +-----------------+
          |
          v
  +-------------------+     +-------------------+
  |   analytics.ts    |<--->|   connection.ts    |
  | importJsonl       |     | withConnection()   |
  | ToParquet()       |     | cached DuckDB      |
  | queryPerTest()    |     | instances           |
  | queryTestRun      |     +-------------------+
  | Summaries()       |
  | queryTestRun      |
  | Details()         |
  +-------------------+
          |
          v
  +-------------------+     +-------------------+
  |   run-status.ts   |     | re-eval-marker.ts |
  | queryScilHistory  |     | track re-evaluated|
  | queryScilRun      |     | run IDs on disk   |
  | Details()         |     +-------------------+
  | queryAcilHistory  |
  | queryAcilRun      |
  | Details()         |
  +-------------------+

  +-------------------+     +-------------------+     +-------------------+
  |   scil-split.ts   |     |  scil-prompt.ts   |     |  acil-prompt.ts   |
  | splitSets()       |     | buildImprovement  |     | buildAcilImprove  |
  | stratified train/ |     | Prompt()          |     | mentPrompt()      |
  | test holdout      |     +-------------------+     +-------------------+
  +-------------------+
                             +-------------------+
                             |   phase.ts        |
                             | getPhase()        |
                             | getPhaseInstr()   |
                             +-------------------+

  +-------------------+
  | skill-frontmatter |
  | .ts               |
  | parse/replace     |
  | YAML descriptions |
  +-------------------+
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/data/index.ts` | Barrel export — public API surface for all consumers |
| `packages/data/src/types.ts` | All shared interfaces: test config, stream events, analytics rows, output files, SCIL types |
| `packages/data/src/config.ts` | Reads and normalizes `tests.json`, resolves prompt paths, validates scaffolds |
| `packages/data/src/connection.ts` | Manages cached in-memory DuckDB instances via `withConnection()` |
| `packages/data/src/stream-parser.ts` | Parses newline-delimited stream JSON, extracts metrics, skill invocations, and agent invocations |
| `packages/data/src/jsonl-writer.ts` | Appends test config, run events, results, and output files to JSONL files in `output/` |
| `packages/data/src/jsonl-reader.ts` | Generic JSONL file reader (returns typed array) |
| `packages/data/src/analytics.ts` | DuckDB JSONL-to-Parquet import, test run summaries, per-test queries, detail views |
| `packages/data/src/run-status.ts` | SCIL and ACIL analytics: history and run detail queries over Parquet |
| `packages/data/src/re-eval-marker.ts` | Tracks re-evaluated run IDs via `.re-evaluated-runs.json` marker file |
| `packages/data/src/scil-split.ts` | Deterministic stratified train/test splitting with seeded PRNG |
| `packages/data/src/scil-prompt.ts` | Builds LLM improvement prompts from SCIL iteration results |
| `packages/data/src/acil-prompt.ts` | Builds LLM improvement prompts from ACIL iteration results (agent-specific terminology) |
| `packages/data/src/phase.ts` | Phase assignment (`getPhase`) and phase-specific prompt instructions (`getPhaseInstructions`) for divergent-convergent iteration strategy |
| `packages/data/src/skill-frontmatter.ts` | Parses and replaces `description` fields in YAML frontmatter |

## Core Types

```typescript
// Expectation discriminated union — mirrors the expect script types
type TestExpectation =
  | { type: 'result-contains';         value: string }
  | { type: 'result-does-not-contain'; value: string }
  | { type: 'skill-call';              value: boolean; skillFile: string }
  | { type: 'agent-call';              value: boolean; agentFile: string }
  | { type: 'llm-judge';              rubricFile: string; model?: string; threshold?: number }

// A single test case from tests.json
interface TestCase {
  name:       string
  type?:      string
  promptFile: string
  skillFile?: string
  agentFile?: string
  model?:     string      // defaults to "sonnet" when absent
  scaffold?:  string      // name of scaffolds/{name}/ directory in test suite
  expect:     TestExpectation[]
}

// Stream-JSON event union — covers shapes seen in test-run.jsonl
type StreamJsonEvent = SystemInitEvent | AssistantEvent | UserEvent | ResultEvent

// Analytics query result — per-test aggregation
interface PerTestRow {
  test_run_id:             string
  test_name:               string
  suite:                   string
  all_expectations_passed: boolean
  total_cost_usd:          number
  num_turns:               number
  input_tokens:            number
  output_tokens:           number
}

// SCIL domain types
interface ScilTestCase extends TestCase {
  set: 'train' | 'test'
}
```

```typescript
// Output file captured from the sandbox
interface OutputFileRow {
  testName:    string
  filePath:    string
  fileContent: string
}

// Test run detail view — returned by queryTestRunDetails()
interface TestRunDetails {
  summary:         TestRunDetailRow[]
  expectations:    TestRunExpectationRow[]
  llmJudgeGroups:  LlmJudgeGroup[]
  outputFiles:     OutputFileRow[]
}
```

See `packages/data/src/types.ts` for the complete set of 40+ interfaces covering JSONL record shapes, analytics row types, SCIL/ACIL iteration/summary records, LLM judge criteria, output file rows, and run detail views.

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TEST_CONFIG_FILENAME` | `'tests.json'` | Expected filename for test suite configuration |
| Default model | `'sonnet'` | Applied to `TestCase.model` when absent in `tests.json` |
| Run ID format | `/^\d{8}T\d{6}$/` | Timestamp-based ID validated by `validateRunId()` (e.g. `20260316T153306`) |
| MARKER_FILE | `'.re-evaluated-runs.json'` | Filename for tracking re-evaluated runs in `output/` |

## Implementation Details

### Configuration Parsing (`config.ts`)

`readTestSuiteConfig()` reads a `tests.json` file and normalizes the shorthand expectation format into typed discriminated unions. The normalization handles three expectation patterns:

| Format | Input | Normalized Output |
|--------|-------|-------------------|
| Result check | `{ "result-contains": "hello" }` | `{ type: "result-contains", value: "hello" }` |
| Simplified skill-call | `{ "skill-call": true }` + `test.skillFile` | `{ type: "skill-call", value: true, skillFile: "..." }` |
| Full skill-call | `{ "skill-call": { skill: "...", expected: true } }` | `{ type: "skill-call", value: true, skillFile: "..." }` |
| Simplified agent-call | `{ "agent-call": true }` + `test.agentFile` | `{ type: "agent-call", value: true, agentFile: "..." }` |
| Full agent-call | `{ "agent-call": { agent: "...", expected: true } }` | `{ type: "agent-call", value: true, agentFile: "..." }` |
| LLM judge | `{ "llm-judge": { rubricFile: "..." } }` | `{ type: "llm-judge", rubricFile: "..." }` |

```typescript
// Test case ID generation — used as join key between test-run and test-config
function buildTestCaseId(suite: string, testName: string): string {
  const normalized = testName.replace(/ /g, '-').replace(/[^a-zA-Z0-9-]/g, '')
  return `${suite}-${normalized}`
}
```

Note: The regex normalization strips non-ASCII and special characters, which means names differing only in stripped characters (e.g., `"test: foo"` vs `"test foo"`) produce identical IDs — a silent collision risk.

### DuckDB Connection Management (`connection.ts`)

Uses a `Map<string, DuckDBInstance>` cache keyed by `dataDir` path. Each call to `withConnection()` gets or creates an in-memory DuckDB instance, connects, executes the callback, then closes the connection (but keeps the instance cached).

```typescript
async function withConnection<T>(dataDir: string, fn: (conn: any) => Promise<T>): Promise<T> {
  const instance = await getInstance(dataDir)  // cached or new :memory:
  const conn = await instance.connect()
  try {
    return await fn(conn)
  } finally {
    conn.closeSync()
  }
}
```

Test-only exports `_resetCache()` and `_cacheSize()` allow test isolation.

### JSONL-to-Parquet Import (`analytics.ts`)

`importJsonlToParquet()` handles three scenarios for each table:

| Scenario | Behavior |
|----------|----------|
| Parquet does not exist | `COPY ... TO parquet` from JSONL directly |
| Parquet exists, no replacement IDs | `UNION ALL BY NAME` new rows whose `test_run_id` is not already present |
| Parquet exists, with `replaceRunIds` | Remove matching IDs from existing Parquet, then union with new data |

The optional `filter` callback enables pre-filtering JSONL rows (used by `test-run` to keep only `type === 'result'` events). Old all-events schema is detected by the presence of a `message` column and auto-migrated by deleting and rebuilding.

`updateAllParquet()` orchestrates import for eight tables: `test-config`, `test-run`, `test-results`, `output-files`, `scil-iteration`, `scil-summary`, `acil-iteration`, and `acil-summary`. SCIL and ACIL summaries each require a special step that converts per-run `.json` files to a temp JSONL before import.

### Analytics Queries (`analytics.ts`, `run-status.ts`)

Three main query functions join across Parquet files:

- **`queryPerTest()`** — Joins `test-run`, `test-config`, and `test-results` to produce per-test rows with pass/fail, cost, turns, and token counts
- **`queryTestRunSummaries()`** — Aggregates per-test results into run-level pass/fail counts by suite
- **`queryTestRunDetails()`** — Returns detailed per-test summaries, individual expectation results, grouped LLM judge criteria, and output files for a single run

All queries filter out `infrastructure-error` status rows when the `status` column exists in the Parquet schema (backward compatibility with older data).

SCIL-specific queries in `run-status.ts`:
- **`queryScilHistory()`** — Lists all SCIL runs with iteration counts and best train accuracy
- **`queryScilRunDetails()`** — Returns summary and per-iteration detail for a single SCIL run, with BigInt-to-Number conversion for DuckDB struct/list values

ACIL-specific queries in `run-status.ts`:
- **`queryAcilHistory()`** — Lists all ACIL runs grouped by `test_run_id` and `agent_file`, with iteration counts and best train accuracy
- **`queryAcilRunDetails()`** — Returns summary and per-iteration detail for a single ACIL run, with BigInt-to-Number conversion for DuckDB struct/list values

### Stream JSON Parsing (`stream-parser.ts`)

Parses Claude's newline-delimited JSON stream output into typed events:

```typescript
// Parse raw stream output into typed events
function parseStreamJsonLines(raw: string): StreamJsonEvent[]

// Extract final result text from the event stream
function getResultText(events: StreamJsonEvent[]): string | null

// Extract skill invocation names from successful tool_use_result events
function getSkillInvocations(events: StreamJsonEvent[]): string[]

// Extract agent type identifiers from completed tool_use_result events
function getAgentInvocations(events: StreamJsonEvent[]): string[]

// Aggregate metrics across all events (duration, tokens, error status)
function extractMetrics(events: StreamJsonEvent[]): ParsedRunMetrics
```

### SCIL Train/Test Splitting (`scil-split.ts`)

`splitSets()` produces a deterministic stratified split using a seeded PRNG (mulberry32). The seed is derived from `hashString(`${suite}:${entityFile}`)`, ensuring the same test cases always land in the same split for a given suite/entity pair. The `entityFile` parameter accepts both skill files and agent files — it is used only as a hash seed for deterministic splitting. `getExpectedTrigger()` recognizes both `skill-call` and `agent-call` expectation types.

Stratification preserves the ratio of positive (expected trigger) to negative (expected no-trigger) cases. When `holdout === 0`, all cases go to the train set.

### ACIL Improvement Prompt (`acil-prompt.ts`)

`buildAcilImprovementPrompt()` generates agent-specific improvement prompts, modeled on `scil-prompt.ts`. Uses agent terminology ("agent description", "delegates to the agent") and accepts `agentName`, `currentDescription`, `agentBody`, `trainResults` (`AcilQueryResult[]`), optional `testResults` (`AcilQueryResult[]`), `iterations` (`AcilIterationResult[]`), `holdout`, and `phase` (`Phase`). Unlike SCIL, ACIL includes the full agent body (system prompt) so the improver understands what the agent does. The `phase` parameter controls the improvement instructions via `getPhaseInstructions()`, and `testResults` are used to surface specific holdout failures during the converge phase.

### Divergent-Convergent Phases (`phase.ts`)

Two functions control the phased iteration strategy used by both SCIL and ACIL:

- **`getPhase(iteration, maxIterations)`** — Returns the phase (`'explore'`, `'transition'`, or `'converge'`) for a given iteration number. With 5 or fewer iterations, uses two phases (explore then converge). With 6+, uses three phases (explore, transition, converge), dividing iterations in thirds with remainder distributed left to right.

- **`getPhaseInstructions(phase, entityType, iterations, holdoutFailures?)`** — Returns phase-specific prompt instructions for the improvement prompt. Each phase produces different guidance:
  - **Explore:** Write a fundamentally different description from scratch — new vocabulary, new framing
  - **Transition:** Combine strongest elements from best-performing iterations while experimenting
  - **Converge:** Make targeted, surgical edits. When train accuracy is perfect and holdout failures exist, the specific failing queries are included in the prompt

The `Phase` type (`'explore' | 'transition' | 'converge'`) is exported and used in iteration result types throughout the harness.

### Skill Frontmatter Manipulation (`skill-frontmatter.ts`)

Three utilities for working with YAML frontmatter `description` fields. These operate on any file with a `description:` field in YAML frontmatter — both skill `SKILL.md` files and agent `.md` files:

- **`parseDescription()`** — Handles quoted, unquoted, and multi-line block scalar (`>` / `|`) formats
- **`replaceDescription()`** — Replaces the description in-place, escaping quotes and backslashes
- **`sanitizeForYaml()`** — Collapses newlines and multiple spaces for single-line output

### Re-evaluation Markers (`re-eval-marker.ts`)

Tracks which test runs have been re-evaluated via a `.re-evaluated-runs.json` file in the output directory. Used by `updateAllParquet()` to pass `replaceRunIds` so re-evaluated results overwrite previous Parquet data rather than being skipped as duplicates.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `dataDir` parameter | Path to Parquet storage directory (`analytics/data/`) | None — passed by callers |
| `outputDir` parameter | Path to JSONL output directory (`output/`) | None — passed by callers |

## Testing

- `packages/data/src/config.test.ts` — Unit tests for `buildTestCaseId`, `resolvePromptPath`, `validateScaffolds` (mocked filesystem)
- `packages/data/src/config-bun.test.ts` — Unit tests for `readTestSuiteConfig`, `readPromptFile` (stubbed `Bun.file`)
- `packages/data/src/stream-parser.test.ts` — Unit tests for stream parsing and metric extraction
- `packages/data/src/jsonl-writer.test.ts` — Unit tests for JSONL file writing
- `packages/data/src/jsonl-reader.test.ts` — Unit tests for JSONL file reading
- `packages/data/src/connection.test.ts` — Unit tests for DuckDB connection caching
- `packages/data/src/skill-frontmatter.test.ts` — Unit tests for YAML frontmatter parsing and replacement
- `packages/data/src/scil-split.test.ts` — Unit tests for deterministic train/test splitting
- `packages/data/src/scil-prompt.test.ts` — Unit tests for SCIL improvement prompt generation
- `packages/data/src/acil-prompt.test.ts` — Unit tests for ACIL improvement prompt generation
- `packages/data/src/phase.test.ts` — Unit tests for phase assignment and phase-specific instructions
- `packages/data/src/re-eval-marker.test.ts` — Unit tests for re-evaluation tracking
- `packages/data/src/analytics.unit.test.ts` — Unit tests for analytics helpers
- `packages/data/src/analytics.integration.test.ts` — Integration tests with real DuckDB and temp directories
- `packages/data/src/analytics-test-helpers.ts` — Shared test fixture factories (`makeConfigRecord`, `writeRunFixture`, etc.)

### Test Patterns

- **Bun API stubbing:** Tests that call `Bun.file()` use `vi.stubGlobal('Bun', ...)` with mock file objects
- **Filesystem mocking:** `existsSync` is mocked via `vi.mock('node:fs')` for scaffold validation tests
- **DuckDB integration tests:** Use real DuckDB with temp directories, writing fixture JSONL files via helper functions before running queries
- **Deterministic SCIL splitting:** Tests verify the same seed always produces the same split assignment

## Related References

- [Test Harness Architecture](./test-harness-architecture.md) — System architecture, package boundaries, and data flow
- [Parquet Schema Reference](./parquet-schema.md) — Column-level schema for all Parquet tables
- [Test Suite Reference](./test-suite-reference.md) — Format and semantics of `tests.json` files
- [SCIL Improvement Loop](./skill-call-improvement-loop.md) — How SCIL uses train/test splits and iterative description refinement
- [LLM Judge](./llm-judge.md) — LLM judge evaluation system that produces the criteria grouped by `queryTestRunDetails()`
- [CLI Package](./cli.md) — CLI commands that orchestrate data reading/writing through this package
- [Evals Package](./evals.md) — Evaluation engine that consumes types and JSONL readers from this package
- [Web Dashboard](./web.md) — Web dashboard that queries DuckDB analytics exposed by this package
- [Test Fixtures](./test-fixtures.md) — Shared test fixture data including analytics JSONL scenarios for integration tests

---

**Next:** [Test Harness Architecture](./test-harness-architecture.md) — see how this package fits into the package dependency graph and data flow.
**Related:** [Parquet Schema Reference](./parquet-schema.md) — column-level schema for the analytics tables this package imports and queries.
