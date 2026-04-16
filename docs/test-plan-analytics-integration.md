# Test Plan: analytics.ts — DuckDB Integration Tests

## Scope

| Attribute | Value |
|-----------|-------|
| Scope type | User-specified file |
| Files analyzed | 1 |
| Branch | test-harness/unit-testing-harness |
| Language | TypeScript |
| Test framework | Vitest 4.1.0 (integration config) |

### Files

- `tests/packages/data/src/analytics.ts`

---

## Test Plan

### CRIT — Critical Priority

**TP-001** (from EC1) **[Edge Case — SQL injection via testRunId HTTP parameter]**
- **Type:** Edge case
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:173,185,208,218` — `testRunId` from `c.req.param('runId')` (web route) is string-interpolated directly into four SQL statements
- **Test approach:** Call `queryTestRunDetails(dataDir, "run-1' OR '1'='1")` against a real DuckDB instance with parquet fixtures. Assert the query does not return unexpected rows — documenting the injection surface. Also test a `testRunId` containing `'; SELECT 1; --` to confirm SQL structure is subverted.
- **Priority justification:** `testRunId` is user-controlled HTTP input. DuckDB supports file-reading functions (`read_csv`, `read_parquet`) that could be exploited to read arbitrary local files. This is the highest-risk code path in the entire harness.

**TP-002** (from EC8, T13) **[Edge Case/Coverage Gap — JOIN normalization mismatch between SQL and buildTestCaseId]** ✅ TESTED
- **Type:** Edge case
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:154-155` and `202-203` — `regexp_replace` chain in JOIN condition must match `buildTestCaseId` in `config.ts:40-41`
- **Test approach:** Create fixtures where test name contains spaces and special characters (`"test: do something!"`). Set `test_case` field using `testCaseId()` helper (same logic as `buildTestCaseId`). Call `queryPerTest`. Assert row is returned — confirming the SQL regex and TypeScript normalization agree. Covered in `analytics.integration.test.ts` ("JOIN condition correctly matches test names with spaces and special characters").
- **Priority justification:** A drift between the SQL normalization and TypeScript `buildTestCaseId` causes silent data loss — queries return empty results for runs that actually executed. No error is raised; data simply disappears.

---

### HIGH — High Priority

**TP-003** (from T1) **[Coverage Gap — importJsonlToParquet creates new parquet]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:63-67` — COPY to new parquet
- **Test approach:** Write JSONL to tmpdir, call `importJsonlToParquet`, assert returns `true`, parquet file exists, and reading it back returns the correct row. Covered.
- **Priority justification:** Core write path; all analytics depends on it working correctly.

**TP-004** (from T2, EC5) **[Coverage Gap — UNION ALL BY NAME append with test_run_id deduplication]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:68-78` — UNION ALL BY NAME with NOT IN dedup
- **Test approach:** Import run-1, then import run-1 again plus run-2. Assert parquet contains exactly one run-1 and one run-2. Covered.
- **Priority justification:** Dedup logic is the most complex code in the file. A regression would cause duplicate analytics rows inflating all metrics.

**TP-005** (from T3) **[Coverage Gap — queryPerTest three-table JOIN]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:133-166`
- **Test approach:** Full round-trip: write fixtures → `updateAllParquet` → `queryPerTest`. Assert correct field values including `all_expectations_passed`, `total_cost_usd` (rounded to 2dp), `num_turns`, `input_tokens`, `output_tokens`. Covered.
- **Priority justification:** This query is the primary analytics endpoint. Incorrect JOIN logic would surface as empty or wrong data in the web UI.

**TP-006** (from T4, T5) **[Coverage Gap — queryTestRunDetails happy path and not-found throw]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:168-227`
- **Test approach:** Full round-trip for happy path (summary + expectations returned). Separate test for non-existent `testRunId` — assert throws `"Test run not found: ..."`. Both covered.
- **Priority justification:** This drives the test run detail page. The not-found error message format matters: the web route checks `err.message.startsWith('Test run not found:')` to produce a 404.

**TP-007** (from T6) **[Coverage Gap — filter path only imports matching rows]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:24-50` — DuckDB GLOB file discovery, line iteration, filter, tmp JSONL
- **Test approach:** JSONL with mixed result/assistant events, filter to `type === 'result'`. Assert only result rows appear in parquet. Covered.
- **Priority justification:** This is how `updateAllParquet` keeps `test-run.parquet` to result events only. A bug here would corrupt the test-run analytics table with all event types.

**TP-008** (from EC9) **[Edge Case — INNER JOIN silently drops orphaned test-run rows]** ✅ TESTED
- **Type:** Edge case
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:151-155` — INNER JOIN on test_run_id
- **Test approach:** Create test-run rows for `run-1` but test-config for `run-99`. After `updateAllParquet`, call `queryPerTest`. Assert `run-1` does not appear in results. Covered.
- **Priority justification:** If `appendTestConfig` fails but `appendTestRun` succeeds (or import is partial), affected runs silently disappear from analytics with no error. Documents this behavior.

**TP-009** (from EC13) **[Edge Case — queryPerTest throws when parquet files are missing]** ✅ TESTED
- **Type:** Edge case
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:139,151,152` — `read_parquet` on all three files
- **Test approach:** Call `queryPerTest` against an empty `dataDir`. Assert it throws a DuckDB IO error. Covered. Documents that the web route has no protection against this on first use.
- **Priority justification:** The web server returns a 500 if analytics are queried before any `updateAllParquet` has been run. This is the expected first-launch failure mode.

**TP-010** (from EC12) **[Edge Case — queryTestRunDetails throws when test-results.parquet is missing]** ✅ TESTED
- **Type:** Edge case
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:183-185` — the summary query reads `test-results.parquet` but there's no pre-check for its existence
- **Test approach:** Manually import only test-run and test-config parquets, skip test-results. Call `queryTestRunDetails`. Assert it throws even though the existence check at line 172 passes (run is found in test-run parquet). Covered.
- **Priority justification:** The existence check only validates `test-run.parquet`. If test-results was never created, the summary query fails with an uncaught DuckDB error — the web route catch only handles "Test run not found" errors.

**TP-011** (from T10) **[Coverage Gap — updateAllParquet full orchestration]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:88-131`
- **Test approach:** Full round-trip with all three JSONL files in output structure. Assert all three parquets created, `updated` list contains all three table names, and `test-run.parquet` contains only result events. Covered.
- **Priority justification:** This is the entry point called by the CLI's `update-analytics` command. A regression here breaks all analytics.

**TP-012** (from T11, EC7) **[Coverage Gap + Edge Case — schema migration deletes old test-run parquet]** ✅ TESTED
- **Type:** Coverage gap + edge case
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:103-120` — `DESCRIBE` check for `message` column, `unlink` old parquet
- **Test approach:** Create a DuckDB parquet with a `message` column (old schema). Run `updateAllParquet`. Assert old data is gone and new parquet contains only result events. Covered.
- **Priority justification:** Without this migration, users upgrading from old schema would get wrong analytics data forever.

---

### MED — Medium Priority

**TP-013** (from T7, T8) **[Coverage Gap — importJsonlToParquet returns false for no-file and no-match cases]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:52-58` (no files) and `43-46` (filter removes all)
- **Test approach:** Two tests: (1) glob matches no files → returns false, no parquet created; (2) filter rejects all rows → returns false. Both covered. Note: **this also caught a real bug** — `COUNT(*)` from DuckDB GLOB returns `BigInt(0)`, not `number 0`, so `=== 0` was always false. Fixed in `analytics.ts` line 55: `if (lineCount === 0)` → `if (!lineCount)`.
- **Priority justification:** Without these guards, `importJsonlToParquet` would attempt `read_json` on an empty glob and throw a DuckDB IO error instead of returning false cleanly.

**TP-014** (from T9) **[Coverage Gap — filter path skips malformed JSON lines]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:34-39` — catch block in filter loop
- **Test approach:** JSONL with valid + malformed + non-matching lines. Assert only valid matching rows appear in parquet, no error thrown. Covered.
- **Priority justification:** Protects against partial JSONL writes (process killed during write). Without this, one corrupted line in a historical run would cause all future imports to fail.

**TP-015** (from EC10, T12) **[Edge Case — LEFT JOIN returns null all_expectations_passed when no test-results rows]** ✅ TESTED
- **Type:** Edge case
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:156-159` — LEFT JOIN to `expect_summary`
- **Test approach:** Create fixtures where `test-results.parquet` has rows for a different `test_run_id`. Call `queryPerTest`. Assert `all_expectations_passed` is `null`. Covered. This also documents that `PerTestRow.all_expectations_passed` is typed as `boolean` but can be `null` at runtime.
- **Priority justification:** Tests with no expectations (or zero expectations written) appear as failures in the UI because `null` is falsy. Important behavior to document.

**TP-016** (from T3 variant) **[Coverage Gap — queryPerTest reflects correct pass/fail from test-results aggregation]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:137-141` — `bool_and(passed)` in CTE
- **Test approach:** Create fixtures with one passing and one failing expectation. Assert `all_expectations_passed` is `false`. Covered (via "reflects all_expectations_passed=false" test).
- **Priority justification:** `bool_and` is the SQL function that determines overall test pass/fail. A regression here would misreport test outcomes.

**TP-017** (from T3 variant) **[Coverage Gap — queryPerTest ordering]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:161` — `ORDER BY r.test_run_id DESC, c.test.name`
- **Test approach:** Create two runs with distinct IDs. Assert results are ordered with newer run first. Covered.
- **Priority justification:** The UI table relies on this ordering for displaying recent runs first.

**TP-018** (from T4 variant) **[Coverage Gap — queryTestRunDetails isolation per testRunId]** ✅ TESTED
- **Type:** Coverage gap
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:208,218` — `WHERE test_run_id = '...'`
- **Test approach:** Import two runs. Query details for run-1 only. Assert summary and expectations only contain run-1 data. Covered.
- **Priority justification:** A missing WHERE clause would return all runs' data when querying a specific run.

---

### LOW — Low Priority

**TP-019** (from T14, EC6) **[Edge Case — UNION ALL BY NAME tolerates new columns in JSONL]**
- **Type:** Edge case
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:71-74` — `UNION ALL BY NAME`
- **Test approach:** Create parquet with columns {A, B}. Append JSONL with columns {A, B, C}. Read back and assert C column has NULL for original rows and correct value for new row.
- **Priority justification:** This validates a DuckDB behavior assumption. Schema evolution is infrequent, and DuckDB's `UNION ALL BY NAME` is well-documented. Low risk.

**TP-020** (from EC2) **[Edge Case — SQL injection via directory path arguments]**
- **Type:** Edge case
- **Test level:** Integration
- **Code path:** `tests/packages/data/src/analytics.ts:26,52,64-77` — `jsonlGlob` and `parquetPath` interpolated into SQL
- **Test approach:** Call `importJsonlToParquet` with a `jsonlGlob` containing a single quote. Verify either correct handling or document that the path injection is exploitable only from CLI args (lower risk than HTTP input).
- **Priority justification:** Lower risk than TP-001 (CLI arg vs HTTP param), but same root cause. Worth documenting.

---

## Deferred Tests

- **S1: importJsonlToParquet — tmp JSONL file cleanup** — `analytics.ts:82-84` — Verifying temp file deletion via filesystem timing would be brittle. The `finally` block is a simple `unlink`; the risk of it breaking is low. Consider verifying via spy on `unlink` if needed.
- **S2: DuckDB connection cleanup in finally blocks** — `analytics.ts:83,117` — Testing that `closeSync` was called contradicts the integration test approach (no mocking). DuckDB instance/connection cleanup is internal resource management.
- **S3: updateAllParquet — .tmp file cleanup during migration** — `analytics.ts:114-115` — Requires very specific filesystem state (stale .tmp alongside old-schema parquet). Very low risk relative to setup complexity.
- **S4: Concurrent writes to the same parquet file** — `analytics.ts:63-78` — Reproducing a race condition reliably in a test would be timing-sensitive and flaky. `updateAllParquet` is sequential in practice. Document the limitation in a code comment instead.
- **S5: DuckDB instance not closed after query functions** — `analytics.ts:133-165, 168-227` — `queryPerTest` and `queryTestRunDetails` lack try/finally for connection cleanup on error. Verifying the resource leak requires DuckDB internals. Track as a code quality issue rather than a test.

---

## Dropped Edge Cases

- **Single quote in test.name breaks SQL** — Test names flow from parquet column values, not SQL string interpolation. Safe.
- **NaN/Infinity in numeric fields** — Written by `appendTestRun` from Claude API data which produces standard numbers. Unrealistic pipeline scenario.
- **CRLF line endings in JSONL** — Files are written by the same system using `JSON.stringify + \n`. Always LF.
- **DuckDB GLOB permission errors** — Environmental concern, not application logic.
- **Integer overflow in token counting** — JavaScript 64-bit floats; Claude token counts are well within safe integer range.

---

## Coverage Summary

| Priority | Count | Implemented |
|----------|-------|-------------|
| CRIT | 2 | 1 of 2 ✅ |
| HIGH | 10 | 10 of 10 ✅ |
| MED | 6 | 6 of 6 ✅ |
| LOW | 2 | 0 of 2 |
| **Total** | **20** | **17 of 20** |

**Coverage health:** Strong. All HIGH and MED priority items are covered by the 24 integration tests. The tests exercise every exported function against real DuckDB instances and real filesystem fixtures, making them durable against implementation changes.

**Bug caught:** TP-013 discovered a live bug — `COUNT(*)` from DuckDB GLOB returns JavaScript `BigInt`, not `number`, so `=== 0` was always `false`. The "no files found" early return never executed, causing DuckDB to throw an IO error instead. Fixed in `analytics.ts:55`.

**Most significant open gap:** TP-001 (SQL injection via `testRunId`). The `testRunId` parameter comes from an HTTP route and is interpolated directly into four SQL strings. DuckDB supports file-reading functions that could be exploited to read arbitrary local files. Mitigation requires parameterized queries or strict ID validation (e.g., `if (!/^[a-zA-Z0-9T]+$/.test(testRunId)) throw ...`).

**Recommended focus for next implementation pass:** Implement TP-001 (SQL injection fix) and TP-019 (schema evolution). The SQL injection is a real security risk if the web server is exposed beyond localhost.
