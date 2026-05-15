# Parquet Schema Reference

The test harness stores analytics data as eight Parquet files in `analytics/data/`. These are written by `./harness update-analytics-data`, which converts JSONL output files to Parquet using DuckDB. The conversion is idempotent — runs already present in the Parquet files are skipped.

---

## Table: `analytics/data/test-config.parquet`

One row per test case per run.

| Field | Type | Description |
|-------|------|-------------|
| `test_run_id` | text | Timestamp ID, e.g. `20260316T153306` |
| `suite` | text | Test suite name, e.g. `code-review` |
| `plugins` | text[] | Plugin names loaded for the run |
| `test` | struct | Full test config: `name`, `type`, `model`, `promptFile`, `skillFile`, `scaffold`, `expect` |

Access nested fields with dot notation: `test.name`, `test.model`, `test.type`.

---

## Table: `analytics/data/test-run.parquet`

One row per Claude stream-json event (heterogeneous — includes `system`, `assistant`, `user`, and `result` events). Filter to `WHERE type = 'result'` for analytics-relevant rows.

| Field | Type | Description |
|-------|------|-------------|
| `type` | text | Event type: `system`, `assistant`, `user`, or `result`. Filter to `'result'` for analytics. |
| `test_run_id` | text | Links to test-config and test-results |
| `test_case` | text | `{suite}-{normalized_name}` — present on result rows; join key to test-config |
| `result` | text (nullable) | The skill's final text output (result rows only) |
| `is_error` | boolean (nullable) | True if run ended with an error (result rows only) |
| `duration_ms` | integer (nullable) | Wall-clock runtime in milliseconds (result rows only) |
| `num_turns` | integer (nullable) | Number of agentic turns (result rows only) |
| `total_cost_usd` | double (nullable) | Estimated USD cost (result rows only) |
| `usage` | struct (nullable) | Nested token counts (result rows only): `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. Access with `usage.input_tokens` etc. |

Note: `run_timestamp` is not stored as a column. Derive it from `test_run_id` via `strptime(test_run_id, '%Y%m%dT%H%M%S')`.

---

## Table: `analytics/data/test-results.parquet`

One row per expectation evaluated. Written by `./harness test-eval`.

| Field | Type | Description |
|-------|------|-------------|
| `test_run_id` | text | Links back to run |
| `suite` | text | Test suite name |
| `test_name` | text | Test case name |
| `expect_type` | text | One of: `result-contains`, `result-does-not-contain`, `skill-call`, `llm-judge`, `llm-judge-aggregate` |
| `expect_value` | text | The value asserted (substring for result checks, boolean string for skill-call, criterion text for llm-judge, rubric filename for llm-judge-aggregate) |
| `passed` | boolean | Whether this expectation passed |
| `reasoning` | text (nullable) | Per-criterion explanation from LLM judge (`llm-judge` rows only) |
| `judge_model` | text (nullable) | Model used for judging (`llm-judge` and `llm-judge-aggregate` rows) |
| `judge_threshold` | double (nullable) | Pass threshold applied (`llm-judge-aggregate` rows only) |
| `judge_score` | double (nullable) | Ratio of passed criteria to total (`llm-judge-aggregate` rows only) |
| `rubric_file` | text (nullable) | Source rubric filename (`llm-judge` and `llm-judge-aggregate` rows) |

Note: Only `llm-judge-aggregate` rows with `passed: false` count toward test failures. Per-criterion `llm-judge` rows provide diagnostic detail only.

---

## Table: `analytics/data/output-files.parquet`

One row per output file captured from the sandbox after a test case runs. Written by `./harness test-run` when skills or agents write files to the filesystem.

| Field | Type | Description |
|-------|------|-------------|
| `test_run_id` | text | Links back to run |
| `test_name` | text | Test case ID (suite-normalized-name format) |
| `file_path` | text | Relative path of the file written inside the sandbox |
| `file_content` | text | Full text content of the captured file |

This table is consumed by `queryTestRunDetails()` to populate the `outputFiles` field in the test run detail API response, and by the LLM judge evaluator to load output file content for `## File:` rubric sections.

---

## Table: `analytics/data/scil-iteration.parquet`

One row per SCIL iteration. Written by `./harness scil`.

| Field | Type | Description |
|-------|------|-------------|
| `test_run_id` | text | SCIL run ID |
| `iteration` | integer | Iteration number (1-based) |
| `phase` | text (nullable) | Iteration phase: `explore`, `transition`, or `converge`. Null for runs before the phase system was added |
| `description` | text | The skill description used in this iteration |
| `trainResults` | struct[] | Array of train set results: `{ testName, skillFile, expected, actual, passed, runIndex }` |
| `testResults` | struct[] | Array of holdout test set results (empty array if no holdout) |
| `trainAccuracy` | double | Fraction of train set tests that passed (0.0–1.0) |
| `testAccuracy` | double (nullable) | Fraction of holdout tests that passed, or null if no holdout |
| `skill_file` | text | Denormalized from `trainResults[1].skillFile` at import time |

---

## Table: `analytics/data/scil-summary.parquet`

One row per SCIL run. Written by `./harness scil`.

| Field | Type | Description |
|-------|------|-------------|
| `test_run_id` | text | SCIL run ID |
| `originalDescription` | text | The skill description before SCIL ran |
| `bestIteration` | integer | Iteration number that produced the best description |
| `bestDescription` | text | The best description found by the loop |

Note: The source `scil-summary.json` file also contains an `iterations` array with per-iteration accuracy data, but this array is stripped during Parquet conversion. Use `scil-iteration.parquet` for per-iteration data.

---

## Table: `analytics/data/acil-iteration.parquet`

One row per ACIL iteration. Written by `./harness acil`.

| Field | Type | Description |
|-------|------|-------------|
| `test_run_id` | text | ACIL run ID |
| `iteration` | integer | Iteration number (1-based) |
| `phase` | text (nullable) | Iteration phase: `explore`, `transition`, or `converge`. Null for runs before the phase system was added |
| `description` | text | The agent description used in this iteration |
| `trainResults` | struct[] | Array of train set results: `{ testName, agentFile, expected, actual, passed, runIndex }` |
| `testResults` | struct[] | Array of holdout test set results (empty array if no holdout) |
| `trainAccuracy` | double | Fraction of train set tests that passed (0.0–1.0) |
| `testAccuracy` | double (nullable) | Fraction of holdout tests that passed, or null if no holdout |
| `agent_file` | text | Denormalized from `trainResults[1].agentFile` at import time |

---

## Table: `analytics/data/acil-summary.parquet`

One row per ACIL run. Written by `./harness acil`.

| Field | Type | Description |
|-------|------|-------------|
| `test_run_id` | text | ACIL run ID |
| `originalDescription` | text | The agent description before ACIL ran |
| `bestIteration` | integer | Iteration number that produced the best description |
| `bestDescription` | text | The best description found by the loop |

Note: The source `acil-summary.json` file also contains an `iterations` array with per-iteration accuracy data, but this array is stripped during Parquet conversion. Use `acil-iteration.parquet` for per-iteration data.

---

## Joining the Tables

### test-run to test-config

Join result rows to test-config via a reconstructed `test_case` key. The normalization matches what the harness writes: spaces become `-`, non-alphanumeric chars (except `-`) are stripped.

```sql
FROM read_parquet('analytics/data/test-run.parquet') r
JOIN read_parquet('analytics/data/test-config.parquet') c
  ON r.test_run_id = c.test_run_id
  AND r.test_case = c.suite || '-' ||
      regexp_replace(regexp_replace(c.test.name, ' ', '-', 'g'), '[^a-zA-Z0-9-]', '', 'g')
WHERE r.type = 'result'
```

### test-results to test-run + test-config

Join test-results for expectation data using `(test_run_id, suite, test_name)`:

```sql
LEFT JOIN (
  SELECT test_run_id, suite, test_name, bool_and(passed) AS all_expectations_passed
  FROM read_parquet('analytics/data/test-results.parquet')
  GROUP BY test_run_id, suite, test_name
) e ON r.test_run_id = e.test_run_id
    AND c.suite = e.suite
    AND c.test.name = e.test_name
```

### scil-summary to scil-iteration

Join on `test_run_id` to get summary context alongside per-iteration data:

```sql
FROM read_parquet('analytics/data/scil-iteration.parquet') i
JOIN read_parquet('analytics/data/scil-summary.parquet') s
  ON i.test_run_id = s.test_run_id
```

---

## Example Queries

**Pass rate by test suite:**

```sql
WITH expect_summary AS (
  SELECT test_run_id, suite, test_name, bool_and(passed) AS all_expectations_passed
  FROM read_parquet('analytics/data/test-results.parquet')
  GROUP BY test_run_id, suite, test_name
)
SELECT c.suite,
       COUNT(*) AS runs,
       ROUND(AVG(e.all_expectations_passed::int) * 100, 1) AS pass_pct
FROM read_parquet('analytics/data/test-run.parquet') r
JOIN read_parquet('analytics/data/test-config.parquet') c
  ON r.test_run_id = c.test_run_id
  AND r.test_case = c.suite || '-' ||
      regexp_replace(regexp_replace(c.test.name, ' ', '-', 'g'), '[^a-zA-Z0-9-]', '', 'g')
LEFT JOIN expect_summary e
  ON r.test_run_id = e.test_run_id AND c.suite = e.suite AND c.test.name = e.test_name
WHERE r.type = 'result'
GROUP BY c.suite
ORDER BY pass_pct DESC;
```

**Average cost and token usage per model:**

```sql
SELECT c.test.model AS model,
       COUNT(*) AS runs,
       ROUND(AVG(r.total_cost_usd), 5) AS avg_cost_usd,
       ROUND(AVG(r.usage.input_tokens)) AS avg_input_tokens,
       ROUND(AVG(r.usage.output_tokens)) AS avg_output_tokens
FROM read_parquet('analytics/data/test-run.parquet') r
JOIN read_parquet('analytics/data/test-config.parquet') c
  ON r.test_run_id = c.test_run_id
  AND r.test_case = c.suite || '-' ||
      regexp_replace(regexp_replace(c.test.name, ' ', '-', 'g'), '[^a-zA-Z0-9-]', '', 'g')
WHERE r.type = 'result'
GROUP BY c.test.model;
```

**SCIL accuracy progression for a run:**

```sql
SELECT i.iteration,
       i.description,
       ROUND(i.trainAccuracy * 100, 1) AS train_pct,
       ROUND(i.testAccuracy * 100, 1) AS test_pct
FROM read_parquet('analytics/data/scil-iteration.parquet') i
WHERE i.test_run_id = '<run-id>'
ORDER BY i.iteration;
```

**Best SCIL result per skill:**

```sql
SELECT s.test_run_id,
       i.skill_file,
       s.bestIteration,
       ROUND(i.trainAccuracy * 100, 1) AS best_train_pct
FROM read_parquet('analytics/data/scil-summary.parquet') s
JOIN read_parquet('analytics/data/scil-iteration.parquet') i
  ON s.test_run_id = i.test_run_id
  AND s.bestIteration = i.iteration;
```

## References

- [Test Harness README](../README.md) — analytics commands and web app
- [Test Suite Configuration](test-suite-reference.md) — tests.json field reference (source of config and results data)
- [LLM Judge Evaluation](llm-judge.md) — explains the `llm-judge` and `llm-judge-aggregate` result types and their fields
- [Skill Call Improvement Loop](skill-call-improvement-loop.md) — SCIL mechanics and output files
- [Data Package](data.md) — DuckDB queries and JSONL-to-Parquet import logic that populates these tables
- [Web Dashboard](web.md) — Web dashboard that queries these Parquet tables via the data layer
- [Agent Call Improvement Loop](agent-call-improvement-loop.md) — ACIL pipeline that produces acil-iteration and acil-summary data
