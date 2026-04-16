# Bun App Behavioral Specification

This document is the behavioral specification for replacing the bash test harness and analytics scripts with a typed Bun/TypeScript project. Every behavior from the existing scripts is catalogued here, mapped to the appropriate package and module, and described in enough detail to drive implementation without needing to re-read the bash source.

## 1. Overview & Project Layout

### Migration Scope

The following files are **deleted** as part of this replacement:

- `tests/test-harness/scripts/` — all bash scripts (`run-test`, `run-claude`, `build-docker-image`, `build-docker-flags`, `parse-run-output`, `store-output`, `report-totals`, `expects/`)
- `tests/analytics/scripts/` — all analytics scripts (`update-analytics-data`, `per-test`, `test-run-details`)
- `tests/Makefile`

The following directory is **untouched**: `tests/web/` (contains a Pencil design file, unrelated to this work).

### Workspace Layout

```
tests/
  package.json                    ← Bun workspace root
  packages/
    data/                         ← @testdouble/harness-data
      package.json
      src/
        types.ts
        config.ts
        stream-parser.ts
        expectations.ts
        jsonl-writer.ts
        jsonl-reader.ts
        analytics.ts
      index.ts
    cli/                          ← @testdouble/harness-cli  (binary: harness)
      package.json
      src/
        paths.ts
        commands/
          run-test.ts
          shell.ts
          clean.ts
          update-analytics.ts
          analytics/
            per-test.ts
            test-run-details.ts
      index.ts
    web/                          ← @testdouble/harness-web  (binary: harness-web)
      package.json
      vite.config.ts
      src/
        server/
          index.ts
          routes/
            test-runs.ts
            analytics.ts
        client/
          index.tsx
          pages/
            TestRunHistory.tsx
            TestRunDetail.tsx
            PerTestAnalytics.tsx
          components/
```

### Path Resolution (`packages/cli/src/paths.ts`)

All CLI commands resolve paths from `import.meta.dir` so no external environment variables or hard-coded paths are needed.

```ts
// import.meta.dir = tests/packages/cli/src/
const testsDir   = path.resolve(import.meta.dir, '../../../')
const harnessDir = path.join(testsDir, 'test-harness')
const repoRoot   = path.join(testsDir, '..')
```

Derived paths:
- `testSuiteDir` = `{testsDir}/test-suites/{suite}`
- `outputDir`    = `{testsDir}/output`
- `dataDir`      = `{testsDir}/analytics/data`

---

## 2. Script-to-Behavior Mapping

| Bash Script / Makefile Target    | Package   | Module / Function                                                       |
|----------------------------------|-----------|-------------------------------------------------------------------------|
| `run-test` (orchestration loop)  | cli       | `commands/run-test.ts`                                                  |
| `run-claude` (docker run)        | cli       | `commands/run-test.ts` – docker spawn                                   |
| `build-docker-image`             | cli       | `commands/run-test.ts` – docker build step                              |
| `build-docker-flags`             | data      | `config.ts` – `buildDockerEnvFlags`, `buildClaudePluginFlags`           |
| `parse-run-output`               | data      | `stream-parser.ts` – `extractMetrics`                                   |
| `store-output`                   | data      | `jsonl-writer.ts` – `appendTestConfig`, `appendTestRun`, `appendTestResults` |
| `report-totals`                  | cli       | `commands/run-test.ts` – totals output                                  |
| `expects/result-contains`        | data      | `expectations.ts` – `evaluateResultContains`                            |
| `expects/result-does-not-contain`| data      | `expectations.ts` – `evaluateResultDoesNotContain`                      |
| `expects/skill-call`             | data      | `expectations.ts` – `evaluateSkillCall`                                 |
| `expects/no-skill-call`          | data      | `expectations.ts` – `evaluateNoSkillCall`                               |
| `make shell`                     | cli       | `commands/shell.ts`                                                     |
| `make clean`                     | cli       | `commands/clean.ts`                                                     |
| `update-analytics-data`          | cli + data| `commands/update-analytics.ts` + `analytics.ts` – `updateAllParquet`   |
| `analytics/scripts/per-test`     | cli + data| `commands/analytics/per-test.ts` + `analytics.ts` – `queryPerTest`     |
| `analytics/scripts/test-run-details` | cli + data | `commands/analytics/test-run-details.ts` + `analytics.ts` – `queryTestRunDetails` |

---

## 3. Package: `@testdouble/harness-data`

This package contains all pure data logic: type definitions, config reading, stream-JSON parsing, expectation evaluation, JSONL I/O, and DuckDB analytics. It has no CLI concerns and no Docker knowledge.

### 3.1 `types.ts` — Shared TypeScript Types

```ts
// Expectation discriminated union — mirrors the four expect script types
type TestExpectation =
  | { type: 'result-contains';         value: string }
  | { type: 'result-does-not-contain'; value: string }
  | { type: 'skill-call';              value: string }
  | { type: 'no-skill-call';           value: string }

// A single test case from tests.json
interface TestCase {
  name:       string
  type?:      string
  promptFile: string
  model?:     string      // defaults to "sonnet" when absent
  expect:     TestExpectation[]
}

// Top-level tests.json structure
interface TestSuiteConfig {
  plugins: string[]
  tests:   TestCase[]
}

// Stream-JSON event union — covers shapes seen in test-run.jsonl
type StreamJsonEvent =
  | SystemInitEvent
  | AssistantEvent
  | UserEvent
  | ResultEvent

interface SystemInitEvent {
  type:     'system'
  subtype:  'init'
  session_id: string
  // + other init fields
}

interface AssistantEvent {
  type:     'assistant'
  message:  { usage?: UsageStats; [key: string]: unknown }
  // + other fields
}

interface UserEvent {
  type:            'user'
  tool_use_result?: ToolUseResult
  // + other fields
}

interface ResultEvent {
  type:          'result'
  result?:       string
  is_error?:     boolean
  duration_ms?:  number
  num_turns?:    number
  total_cost_usd?: number
  usage?:        UsageStats
  // + other fields
}

interface ToolUseResult {
  commandName?: string
  success:      boolean
  // + other fields
}

interface UsageStats {
  input_tokens:                  number
  output_tokens:                 number
  cache_creation_input_tokens?:  number
  cache_read_input_tokens?:      number
}

interface ParsedRunMetrics {
  durationMs:    number
  inputTokens:   number
  outputTokens:  number
  isError:       boolean
  result:        string | null
}

interface ExpectationResult {
  expect_type:  string
  expect_value: string
  passed:       boolean
}

// JSONL record shapes written to output/{runId}/*.jsonl
interface TestConfigRecord {
  test_run_id: string
  suite:       string
  plugins:     string[]
  test:        TestCase
}

interface TestRunRecord extends StreamJsonEvent {
  test_run_id: string
  test_case?:  string   // added only on type === "result" events
}

interface TestResultRecord {
  test_run_id:  string
  suite:        string
  test_name:    string
  expect_type:  string
  expect_value: string
  passed:       boolean
}

// Analytics query result shapes
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

interface TestRunDetailRow extends PerTestRow {
  is_error: boolean
}

interface TestRunExpectationRow {
  test_run_id:  string
  suite:        string
  test_name:    string
  expect_type:  string
  expect_value: string
  passed:       boolean
}

interface TestRunDetails {
  summary:      TestRunDetailRow[]
  expectations: TestRunExpectationRow[]
}
```

### 3.2 `config.ts` — Config Reading and Flag Construction

**`readTestSuiteConfig(configFilePath: string): Promise<TestSuiteConfig>`**

Reads and JSON-parses the file at `configFilePath`. Applies defaults: `model` on each test defaults to `"sonnet"` when absent. Throws a descriptive error if the file is missing or JSON is invalid.

**`resolvePromptPath(testSuiteDir: string, promptFile: string): string`**

Returns `{testSuiteDir}/prompts/{promptFile}`. Pure path construction; no I/O.

**`readPromptFile(promptPath: string): Promise<string>`**

Reads and returns the file contents. Throws if the file does not exist.

**`buildTestCaseId(suite: string, testName: string): string`**

Replicates the bash normalization in `store-output`:
```bash
NORMALIZED=$(echo "$TEST_NAME" | tr ' ' '-' | tr -dc 'a-zA-Z0-9-')
TEST_CASE="${SUITE}-${NORMALIZED}"
```
In TypeScript: replace spaces with hyphens, then strip any character that is not `[a-zA-Z0-9-]`. Return `"{suite}-{normalizedName}"`.

**`buildDockerEnvFlags(envFilePath: string): string[]`**

Checks whether `envFilePath` exists. If yes: returns `["--env-file", envFilePath]`. If no: returns `[]`.

Source behavior: `build-docker-flags` checks for `$TESTS_DIR/.env`. The call site in `run-test.ts` passes `{testSuiteDir}/.env`.

**`buildClaudePluginFlags(plugins: string[], repoRoot: string): string[]`**

For each plugin in `plugins`, produces `["--plugin-dir", "/repo/{plugin}"]`. Returns a flat concatenated array.

Source behavior (from `build-docker-flags`):
```bash
for p in $(jq -r '.plugins[]' "$CONFIG_FILE"); do
  CLAUDE_FLAGS="$CLAUDE_FLAGS --plugin-dir /repo/$p"
done
```

### 3.3 `stream-parser.ts` — Stream-JSON Parsing

**`parseStreamJsonLines(raw: string): StreamJsonEvent[]`**

Splits `raw` on newlines. For each non-empty line, parses it as JSON. Returns the typed array. Invalid JSON lines should throw (consistent with bash `jq` behavior which would also error).

**`extractMetrics(events: StreamJsonEvent[]): ParsedRunMetrics`**

Mirrors `parse-run-output`:
```bash
DURATION_MS="$(jq -rs '[.[].duration_ms // 0] | add' ...)"
INPUT_TOKENS="$(jq -rs '[.[].usage.input_tokens // 0] | add' ...)"
OUTPUT_TOKENS="$(jq -rs '[.[].usage.output_tokens // 0] | add' ...)"
IS_ERROR="$(jq -rs '[.[].is_error // false] | any ...' ...)"
```

- `durationMs`: sum of `duration_ms` across all events (defaulting 0 when absent)
- `inputTokens`: sum of `usage.input_tokens` across all events (defaulting 0)
- `outputTokens`: sum of `usage.output_tokens` across all events (defaulting 0)
- `isError`: true if any event has `is_error === true`
- `result`: value of `.result` from the first `type === "result"` event, or null

**`getResultText(events: StreamJsonEvent[]): string | null`**

Returns the `.result` field from the first event where `type === "result"`, or null if none found.

**`getSkillInvocations(events: StreamJsonEvent[]): string[]`**

Mirrors the jq filter used in `expects/skill-call`:
```bash
jq -rs '[.[] | select(.type == "user" and .tool_use_result != null) |
  select(.tool_use_result.success == true and .tool_use_result.commandName == $skill)] | length | . > 0'
```

Finds all user-type events with `tool_use_result.success === true` and a non-null `tool_use_result.commandName`. Returns all such `commandName` values as a string array (may contain duplicates if a skill is invoked multiple times).

### 3.4 `expectations.ts` — Expectation Evaluation

**`evaluateExpectation(expectation: TestExpectation, events: StreamJsonEvent[]): ExpectationResult`**

Dispatches to the appropriate sub-evaluator based on `expectation.type`. Returns `{ expect_type, expect_value, passed }`.

**`evaluateResultContains(value: string, events: StreamJsonEvent[]): boolean`**

Mirrors `expects/result-contains`:
- Get result text via `getResultText(events)`
- If null or empty string: return false (bash exits 1 with "Empty result" message)
- Return true if result includes `value` as a substring

**`evaluateResultDoesNotContain(value: string, events: StreamJsonEvent[]): boolean`**

Mirrors `expects/result-does-not-contain`:
- Get result text via `getResultText(events)`
- If null or empty string: return false (bash exits 1 with "Empty result" message)
- Return true if result does NOT include `value` as a substring

**`evaluateSkillCall(skillName: string, events: StreamJsonEvent[]): boolean`**

Mirrors `expects/skill-call`:
- Get skill invocations via `getSkillInvocations(events)`
- Return true if `skillName` appears in the list

**`evaluateNoSkillCall(skillName: string, events: StreamJsonEvent[]): boolean`**

Mirrors `expects/no-skill-call`:
- Get skill invocations via `getSkillInvocations(events)`
- Return true if `skillName` does NOT appear in the list

**`evaluateAllExpectations(expectations: TestExpectation[], events: StreamJsonEvent[]): ExpectationResult[]`**

Maps each expectation through `evaluateExpectation`. Returns results in the same order as the input array.

### 3.5 `jsonl-writer.ts` — Writing JSONL Output Files

**`ensureOutputDir(runDir: string): Promise<void>`**

Creates `runDir` with `mkdir -p` semantics (no error if already exists).

**`appendTestConfig(runDir: string, record: TestConfigRecord): Promise<void>`**

Appends `JSON.stringify(record) + "\n"` to `{runDir}/test-config.jsonl`.

Mirrors `store-output`:
```bash
jq -c --arg run_id "$TEST_RUN_ID" --arg suite "$SUITE" \
  "{test_run_id: \$run_id, suite: \$suite, plugins: .plugins, test: .tests[$TEST_INDEX]}" \
  "$CONFIG_FILE" >> "$RUN_DIR/test-config.jsonl"
```

**`appendTestRun(runDir: string, events: StreamJsonEvent[], testRunId: string, testCaseId: string): Promise<void>`**

Mirrors `store-output`:
```bash
jq -c --arg id "$TEST_RUN_ID" --arg tc "$TEST_CASE" \
  '. + {test_run_id: $id} | if .type == "result" then . + {test_case: $tc} else . end' \
  "$DOCKER_STDOUT" >> "$RUN_DIR/test-run.jsonl"
```

For each event in `events`:
- Add `test_run_id` to the event object
- If `event.type === "result"`: also add `test_case: testCaseId`
- Append the enriched event as a JSON line to `{runDir}/test-run.jsonl`

**`appendTestResults(runDir: string, records: TestResultRecord[]): Promise<void>`**

Mirrors `store-output`:
```bash
jq -c --arg id "$TEST_RUN_ID" --arg suite "$SUITE" --arg test_name "$TEST_NAME" \
  '. + {test_run_id: $id, suite: $suite, test_name: $test_name}' \
  "$EXPECT_RESULTS_FILE" >> "$RUN_DIR/test-results.jsonl"
```

Appends each record as a JSON line to `{runDir}/test-results.jsonl`. The caller is responsible for including `test_run_id`, `suite`, and `test_name` in each `TestResultRecord`.

### 3.6 `jsonl-reader.ts` — Reading JSONL Output Files

**`readJsonlFile<T>(filePath: string): Promise<T[]>`**

Reads the file at `filePath`. Parses each non-empty line as JSON. Returns the array. Returns an empty array if the file does not exist (no error).

**`discoverOutputDirs(outputRootDir: string): Promise<string[]>`**

Lists immediate subdirectories of `outputRootDir`. Returns their full paths. Returns an empty array if `outputRootDir` does not exist.

### 3.7 `analytics.ts` — DuckDB / Parquet Operations

All functions use `duckdb-async` (npm package; no external `duckdb` binary required). All database connections are transient: open, query, close.

**`importJsonlToParquet(options: { jsonlGlob: string; parquetPath: string }): Promise<void>`**

Mirrors `update-analytics-data`'s `import_jsonl` function:

1. If no files match `jsonlGlob`: print `  no files found for: {jsonlGlob}` and return without error.
2. If `parquetPath` does not exist: create parquet from all matching JSONL:
   ```sql
   COPY (SELECT * FROM read_json('{glob}', format='newline_delimited'))
   TO '{parquetPath}' (FORMAT PARQUET)
   ```
3. If `parquetPath` exists: idempotent merge — new records only (deduped by `test_run_id`):
   ```sql
   COPY (
     SELECT * FROM read_parquet('{parquetPath}')
     UNION ALL BY NAME
     (SELECT * FROM read_json('{glob}', format='newline_delimited')
      WHERE test_run_id NOT IN (SELECT DISTINCT test_run_id FROM read_parquet('{parquetPath}')))
   ) TO '{parquetPath}.tmp' (FORMAT PARQUET)
   ```
   Then atomically rename `{parquetPath}.tmp` → `{parquetPath}`.

4. Print `  updated: {basename}.parquet` on success.

**`updateAllParquet(options: { outputDir: string; dataDir: string }): Promise<{ updated: string[] }>`**

Calls `importJsonlToParquet` for each of the three tables:

| Table        | glob pattern                       | parquet path                    |
|--------------|------------------------------------|---------------------------------|
| test-config  | `{outputDir}/*/test-config.jsonl`  | `{dataDir}/test-config.parquet` |
| test-run     | `{outputDir}/*/test-run.jsonl`     | `{dataDir}/test-run.parquet`    |
| test-results | `{outputDir}/*/test-results.jsonl` | `{dataDir}/test-results.parquet`|

Returns `{ updated: string[] }` listing the table names that were updated (i.e., not skipped for no files).

**`queryPerTest(dataDir: string): Promise<PerTestRow[]>`**

Mirrors `analytics/scripts/per-test` exactly:

```sql
WITH expect_summary AS (
  SELECT test_run_id, suite, test_name, bool_and(passed) AS all_expectations_passed
  FROM read_parquet('{dataDir}/test-results.parquet')
  GROUP BY test_run_id, suite, test_name
)
SELECT
  r.test_run_id,
  c.test.name AS test_name,
  c.suite,
  e.all_expectations_passed,
  ROUND(r.total_cost_usd, 2) AS total_cost_usd,
  r.num_turns,
  r.usage.input_tokens AS input_tokens,
  r.usage.output_tokens AS output_tokens
FROM read_parquet('{dataDir}/test-run.parquet') r
JOIN read_parquet('{dataDir}/test-config.parquet') c
  ON r.test_run_id = c.test_run_id
  AND r.test_case = c.suite || '-' ||
      regexp_replace(regexp_replace(c.test.name, ' ', '-', 'g'), '[^a-zA-Z0-9-]', '', 'g')
LEFT JOIN expect_summary e
  ON r.test_run_id = e.test_run_id
  AND c.suite = e.suite
  AND c.test.name = e.test_name
WHERE r.type = 'result'
ORDER BY r.test_run_id DESC, c.test.name
```

**`queryTestRunDetails(dataDir: string, testRunId: string): Promise<TestRunDetails>`**

Mirrors `analytics/scripts/test-run-details` two-query pattern:

1. **Existence check**: query test-run.parquet for `type = 'result' AND test_run_id = '{testRunId}'`. If result is empty, throw `Error("Test run not found: {testRunId}")`.

2. **Summary query** (same join as `queryPerTest`, filtered by `test_run_id`, includes `is_error`):
   ```sql
   WITH expect_summary AS (
     SELECT test_run_id, test_name, bool_and(passed) AS all_expectations_passed
     FROM read_parquet('{dataDir}/test-results.parquet')
     WHERE test_run_id = '{testRunId}'
     GROUP BY test_run_id, test_name
   )
   SELECT
     r.test_run_id,
     c.test.name AS test_name,
     c.suite,
     r.is_error,
     e.all_expectations_passed,
     ROUND(r.total_cost_usd, 4) AS total_cost_usd,
     r.num_turns,
     r.usage.input_tokens AS input_tokens,
     r.usage.output_tokens AS output_tokens
   FROM read_parquet('{dataDir}/test-run.parquet') r
   JOIN read_parquet('{dataDir}/test-config.parquet') c
     ON r.test_run_id = c.test_run_id
     AND r.test_case = c.suite || '-' ||
         regexp_replace(regexp_replace(c.test.name, ' ', '-', 'g'), '[^a-zA-Z0-9-]', '', 'g')
   LEFT JOIN expect_summary e
     ON r.test_run_id = e.test_run_id
     AND c.test.name = e.test_name
   WHERE r.type = 'result'
     AND r.test_run_id = '{testRunId}'
   ORDER BY c.test.name
   ```

3. **Expectation query**:
   ```sql
   SELECT test_run_id, suite, test_name, expect_type, expect_value, passed
   FROM read_parquet('{dataDir}/test-results.parquet')
   WHERE test_run_id = '{testRunId}'
   ORDER BY test_name, expect_type, expect_value
   ```

4. Return `{ summary, expectations }`.

---

## 4. Package: `@testdouble/harness-cli`

Entry point: `harness` binary (declared in `package.json` `bin` field). Top-level CLI uses yargs with subcommands: `run-test`, `shell`, `clean`, `update-analytics`, `analytics` (with nested subcommands).

### 4.1 `harness run-test`

```
harness run-test --suite <name> [--test <name>] [--image <name>]
                 [--max-budget <usd>] [--debug] [--claude-code-version <ver>]
```

**Options:**

| Option                  | Default                    | Description                            |
|-------------------------|----------------------------|----------------------------------------|
| `--suite`               | required                   | Suite name; resolves config file path  |
| `--test`                | (none)                     | Filter to a single test by exact name  |
| `--image`               | `claude-code-test-harness` | Docker image tag                       |
| `--max-budget`          | `5.00`                     | Max Claude budget in USD               |
| `--debug`               | false                      | Stream Docker output live              |
| `--claude-code-version` | `latest`                   | Docker build arg for Claude Code version |

**Step-by-step behavior:**

1. **Resolve paths** via `paths.ts`: `testsDir`, `harnessDir`, `repoRoot` from `import.meta.dir`.
2. **Validate config**: check `{testsDir}/test-suites/{suite}/tests.json` exists; exit 1 with descriptive error if not.
3. **Read config**: call `readTestSuiteConfig(configFilePath)`. If `--test` given, filter `config.tests` to the matching test by exact name. Exit 1 with "Test not found" if no match.
4. **Generate TEST_RUN_ID**: `new Date()` formatted as `YYYYMMDDTHHmmss` in local time. This matches the bash `date +%Y%m%dT%H%M%S` behavior.
5. **Docker build**:
   - Command: `docker build --build-arg CLAUDE_CODE_VERSION={ver} -t {image} {harnessDir}`
   - If `--debug`: use `Bun.spawn` with inherited stdio (stream live to terminal).
   - If not debug: capture all output; on non-zero exit, print captured output to stderr and exit 1.
   - Source: `build-docker-image` script.
6. **Build flags** (once, before the test loop):
   - `dockerFlags = buildDockerEnvFlags('{testSuiteDir}/.env')` → `["--env-file", path]` or `[]`
   - `claudeFlags = buildClaudePluginFlags(config.plugins, repoRoot)` → `["--plugin-dir", "/repo/{plugin}", ...]`
7. **Initialize totals**: `totalDurationMs = 0`, `totalInputTokens = 0`, `totalOutputTokens = 0`, `failures = 0`.
8. **For each test case** (after filter applied):

   a. Print `\nRunning test: {name}` to stderr.

   b. Resolve prompt path via `resolvePromptPath`; read via `readPromptFile`. Exit 1 if missing.

   c. Print truncated prompt to stderr: `  Prompting Claude: {prompt}` (truncate to ~80 chars).

   d. **Docker run** — use `Bun.spawn()` with an argument array (never shell string interpolation) to prevent prompt content from injecting Docker flags:
      ```ts
      const args = [
        "docker", "run", "--rm",
        ...dockerFlags,
        "-v", `${repoRoot}:/repo:ro`,
        "-v", `${testSuiteDir}:/workspace:ro`,
        "-v", `${harnessDir}/structured-output:/structured-output:ro`,
        image,
        "--dangerously-skip-permissions",
        "--no-session-persistence",
        "--output-format", "stream-json",
        "--verbose",
        "--max-budget-usd", maxBudget,
        "--model", test.model ?? "sonnet",
        ...claudeFlags,
        "--print", promptContent,
      ]
      ```
      Capture stdout to string buffer via `Bun.spawn({ stdout: "pipe" })`. If `--debug`: also forward stdout to process stdout live. Capture exit code via `await proc.exited`.

   e. Print `  Test Run Completed` to stderr.

   f. Parse stream-JSON: `parseStreamJsonLines(capturedStdout)`.

   g. Extract metrics: `extractMetrics(events)`.

   h. **Check failures**:
      - If docker exit code ≠ 0: `failures++`, print `  [FAIL] Docker exited with code {N}` to stderr.
      - If `metrics.isError`: `failures++`, print `  [FAIL] Claude reported is_error=true` to stderr.

   i. **Evaluate expectations**: `evaluateAllExpectations(test.expect, events)`.

   j. For each expectation result: print `  [{PASS|FAIL}] {expect_type}: {expect_value}` to stderr.

   k. Print `[PASS] {name}` or `[FAIL] {name}` to stderr.

   l. Print stats to stderr:
      ```
       - Test Stats
         - Duration (ms): {ms}
         - Input Tokens:  {n}
         - Output Tokens: {n}
      ```

   m. Accumulate into totals.

   n. **Write JSONL output**:
      - `runDir = {testsDir}/output/{testRunId}`
      - `testCaseId = buildTestCaseId(suite, test.name)`
      - `ensureOutputDir(runDir)`
      - `appendTestConfig(runDir, { test_run_id: testRunId, suite, plugins: config.plugins, test })`
      - `appendTestRun(runDir, events, testRunId, testCaseId)`
      - `appendTestResults(runDir, expectationResults.map(r => ({ test_run_id: testRunId, suite, test_name: test.name, ...r })))`

9. **Print totals** to stderr (mirrors `report-totals`):
   ```

   Test Execution Totals:
    - Duration (ms): {totalDurationMs}
    - Input Tokens:  {totalInputTokens}
    - Output Tokens: {totalOutputTokens}
   ```

10. Exit 1 if `failures > 0`; exit 0 otherwise.

### 4.2 `harness shell`

```
harness shell [--suite <name>] [--image <name>]
```

Spawns an interactive bash shell inside the Docker container so the developer can inspect the environment Claude Code sees.

- `--suite` (required): resolves `testSuiteDir` for the workspace volume mount.
- `--image` (default: `claude-code-test-harness`): image to use.

Command:
```
docker run --rm -it
  {dockerEnvFlags}
  -v {repoRoot}:/repo:ro
  -v {testSuiteDir}:/workspace:ro
  -v {harnessDir}/structured-output:/structured-output:ro
  --entrypoint bash
  {image}
```

Use `Bun.spawn` with inherited stdio (no output buffering). Wait for process to exit.

### 4.3 `harness clean`

```
harness clean [--image <name>]
```

- `--image` (default: `claude-code-test-harness`).
- Runs `docker rmi {imageName}`.
- On success: print `Removed image: {imageName}`.
- On failure: print the error message (do not re-throw; exit with docker's exit code).

### 4.4 `harness update-analytics`

```
harness update-analytics [--output-dir <path>] [--data-dir <path>]
```

- `--output-dir` (default: `{testsDir}/output` via `paths.ts`)
- `--data-dir` (default: `{testsDir}/analytics/data` via `paths.ts`)

Calls `updateAllParquet({ outputDir, dataDir })`. For each table:
- If updated: print `  updated: {table}.parquet`
- If skipped (no source files): print `  no data found for: {table}`

### 4.5 `harness analytics per-test`

```
harness analytics per-test [--data-dir <path>] [--format <table|json|csv>]
```

- `--data-dir` (default: `{testsDir}/analytics/data` via `paths.ts`)
- `--format` (default: `table`)

Calls `queryPerTest(dataDir)`. Output format:

- **table** (default): ASCII table with columns: `test_run_id`, `test_name`, `suite`, `all_expectations_passed`, `total_cost_usd`, `num_turns`, `input_tokens`, `output_tokens`.
- **json**: `JSON.stringify(rows, null, 2)`.
- **csv**: header row + comma-delimited rows, one per line.

### 4.6 `harness analytics test-run-details`

```
harness analytics test-run-details --run-id <id> [--data-dir <path>] [--format <table|json|csv>]
```

- `--run-id` (required)
- `--data-dir` (default: `{testsDir}/analytics/data` via `paths.ts`)
- `--format` (default: `table`)

Calls `queryTestRunDetails(dataDir, runId)`. If throws "Test run not found", print error to stderr and exit 1.

Output (two sections separated by a blank line):

**Section 1 — Test Summary** (mirrors `test-run-details` first query):
Columns: `test_run_id`, `test_name`, `suite`, `is_error`, `all_expectations_passed`, `total_cost_usd`, `num_turns`, `input_tokens`, `output_tokens`.

**Section 2 — Expectation Results** (mirrors `test-run-details` second query):
Columns: `test_run_id`, `suite`, `test_name`, `expect_type`, `expect_value`, `passed`.

---

## 5. Package: `@testdouble/harness-web`

Standalone binary `harness-web` (declared in `packages/web/package.json` `bin` field). Independent of `packages/cli/`. React client built with Vite.

### Build workflow

- `bun run build` in `packages/web/` runs `vite build` → produces `dist/client/`.
- The Hono server serves static files from `dist/client/` (relative to package root).
- `vite.config.ts` configures `build.outDir = 'dist/client'` and the `@vitejs/plugin-react` plugin.

### 5.1 API Server (`server/index.ts`)

```
harness-web [--port <number>] [--data-dir <path>]
```

- Default port: `3000`.
- `--data-dir` default: derived from `import.meta.dir` relative path to `tests/analytics/data` (e.g., `path.resolve(import.meta.dir, '../../../../analytics/data')` from `src/server/`).
- Creates a Hono app, mounts routes at `/api/`, serves static client build from `dist/client/`, starts with `Bun.serve`.

#### `GET /api/health`

Returns `{ status: "ok" }`. Used by client to detect server availability.

#### `GET /api/test-runs`

Calls `queryPerTest(dataDir)`. Groups rows by `test_run_id` to build a summary list:

```ts
interface TestRunSummary {
  test_run_id:  string
  suite:        string
  date:         string   // derived from test_run_id timestamp: "YYYYMMDDTHHmmss" → ISO string
  total_tests:  number
  passed:       number
  failed:       number
}
```

Returns `{ runs: TestRunSummary[] }` sorted by `test_run_id` descending.

#### `GET /api/test-runs/:runId`

Calls `queryTestRunDetails(dataDir, runId)`. Returns `{ summary, expectations }`. If run not found, returns HTTP 404 with `{ error: "Not found" }`.

#### `GET /api/analytics/per-test`

Calls `queryPerTest(dataDir)`. Supports optional `?suite=` query parameter for server-side filtering. Returns `{ rows: PerTestRow[] }`.

#### `GET /*` (catch-all)

Serves `dist/client/index.html` for SPA client-side routing.

### 5.2 React Client (`client/`)

React 18 + TypeScript + Vite. All data fetched from the local API.

**Global layout:**
- Navigation bar with "Test Harness" title and links: "History" (`/`) and "Analytics" (`/analytics`).
- Error banner component displayed when any fetch fails.

#### Page: Test Run History (`/`)

On mount: `GET /api/test-runs`.

- **Loading state**: spinner or skeleton rows.
- **Empty state**: `"No test runs found. Run tests with: harness run-test --suite <name>"`.
- **Table columns**: Run ID, Suite, Date, Total Tests, Passed, Failed, Pass Rate.
  - Pass Rate: percentage (e.g., `"100%"` or `"75%"`).
  - Rows with 100% pass rate: green highlight; rows with <100%: red highlight.
  - Run ID column: link to `/runs/{test_run_id}`.
- Table sorted by date descending (most recent first).

#### Page: Test Run Detail (`/runs/:runId`)

On mount: `GET /api/test-runs/:runId`.

- Page header: `"Test Run: {runId}"`.
- Back link to `/`.
- **Section 1 — "Test Summary"** table:
  - Columns: Test Name, Suite, Error, All Passed, Cost (USD), Turns, Input Tokens, Output Tokens.
  - Rows where `all_expectations_passed === false` or `is_error === true`: red background or ⚠ icon.
- **Section 2 — "Expectation Results"** table:
  - Columns: Test Name, Type, Expected Value, Passed.
  - Passed rows: ✓ icon (green); failed rows: ✗ icon (red).

#### Page: Per-Test Analytics (`/analytics`)

On mount: `GET /api/analytics/per-test`.

- **Suite filter**: dropdown populated from unique suite values in the fetched data; default "All". Applies client-side filtering.
- **Table columns**: Run ID, Test Name, Suite, All Passed, Cost (USD), Turns, Input Tokens, Output Tokens.
  - Run ID column: link to `/runs/{test_run_id}`.
  - Rows where `all_expectations_passed === false`: red background.
- **Client-side sorting**: clicking a column header toggles asc/desc sort for that column.

---

## 6. Key Source Files for Implementation Reference

These files from the bash implementation contain the exact logic being ported:

| File | What to extract |
|------|-----------------|
| `tests/test-harness/scripts/run-test` | Orchestration loop, flag construction, test-case normalization, failure tracking, totals output |
| `tests/test-harness/scripts/store-output` | Exact enrichment logic: `test_run_id` always added; `test_case` added only on `type === "result"` events |
| `tests/test-harness/scripts/expects/skill-call` | jq filter for `tool_use_result.commandName` extraction |
| `tests/test-harness/scripts/expects/result-contains` | Exact empty-result-as-failure behavior |
| `tests/test-harness/scripts/expects/result-does-not-contain` | Same empty-result-as-failure behavior |
| `tests/test-harness/scripts/expects/no-skill-call` | Negation of skill-call check |
| `tests/test-harness/scripts/parse-run-output` | Exact metric extraction via jq (duration, tokens, is_error) |
| `tests/test-harness/scripts/build-docker-flags` | Flag construction logic, `.env` file detection |
| `tests/analytics/scripts/update-analytics-data` | Idempotent DuckDB import pattern with atomic tmp rename |
| `tests/analytics/scripts/per-test` | Full analytics SQL join query |
| `tests/analytics/scripts/test-run-details` | Two-query pattern: existence check, summary, expectations |
| `tests/test-harness/structured-output/test-result-schema.ts` | Existing type definitions to adapt into `types.ts` |
| `tests/output/20260316T155224/test-run.jsonl` | Live stream-JSON data showing exact event shapes and field names |

---

## 7. Verification Checklist

After implementation, verify correctness against the existing bash output:

1. **JSONL structure**: `harness run-test --suite code-review` produces `tests/output/{runId}/test-config.jsonl`, `test-run.jsonl`, `test-results.jsonl` with the same schema and enrichment as the bash scripts.

2. **Idempotent analytics**: `harness update-analytics` imports JSONL to parquet successfully. Running it a second time produces no duplicate records (deduplication by `test_run_id` works).

3. **Per-test query**: `harness analytics per-test` returns data matching the output of `analytics/scripts/per-test` for the same parquet files.

4. **Test-run-details query**: `harness analytics test-run-details --run-id {id}` returns two sections (summary + expectations) matching the output of `analytics/scripts/test-run-details` for the same run ID.

5. **Web server**: `harness-web` starts on port 3000. Test Run History page loads and displays existing runs. Clicking a Run ID navigates to the detail page and shows both sections.

6. **Suite filter**: Per-Test Analytics page filters correctly by suite when a suite is selected from the dropdown.
