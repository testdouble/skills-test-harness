# Analytics

> **Tier 1 · Anyone querying results.** Assumes you've completed [setup](../../README.md#setup), run at least one test suite, and imported data with `./harness update-analytics-data`. This page gets you queryable cross-run metrics from the CLI.

Import test run data into a DuckDB database backed by Parquet files, then query it from the CLI or the web dashboard. This page covers importing data, running queries, and finding your way around the analytics output.

## Importing data

After running tests (and optionally evaluating them with `test-eval`), import the results:

```bash
./harness update-analytics-data
```

This scans `tests/output/` for test run directories and converts their JSONL files into Parquet tables under `analytics/data/`. The conversion is idempotent — runs already imported are skipped, so you can run this command as often as you like.

The importer reads three files from each run directory:

- `test-config.jsonl` — test configuration records
- `test-run.jsonl` — Claude stream-json events
- `test-results.jsonl` — evaluation results (present only if `test-eval` has been run)

It also imports SCIL and ACIL loop output when present (`scil-iteration.jsonl`, `scil-summary.json`, `acil-iteration.jsonl`, `acil-summary.json`).

## CLI queries

The harness provides two built-in analytics queries:

### Per-test metrics

Aggregate pass/fail metrics across all runs, grouped by test name:

```bash
./harness analytics per-test
```

Use this to spot trends — which tests pass reliably, which ones are flaky, and how pass rates change over time.

### Test run details

Drill into a specific run:

```bash
./harness analytics test-run-details --run-id <run-id>
```

Use this to inspect a single run's results without opening the web dashboard. Run IDs are timestamps in `YYYYMMDDTHHmmss` format — you can find them in the `tests/output/` directory names or in the web dashboard's Test Run History page.

### Output formats

Both queries support JSON and CSV output:

```bash
./harness analytics per-test --format json
./harness analytics per-test --format csv
```

## Data location and schema

Parquet files are stored at `analytics/data/`. The key tables are:

- **`test-config.parquet`** — one row per test case per run
- **`test-run.parquet`** — one row per Claude event per run
- **`test-results.parquet`** — one row per expectation or criterion evaluated
- **`scil-iteration.parquet`** — one row per SCIL iteration
- **`scil-summary.parquet`** — one row per SCIL run
- **`acil-iteration.parquet`** — one row per ACIL iteration
- **`acil-summary.parquet`** — one row per ACIL run

For the complete field reference for each table, see [Parquet Schema](../parquet-schema.md).

## Viewing in the dashboard

For a visual interface to your analytics data, use the harness-web dashboard. See [Viewing Results](viewing-results.md) for a full walkthrough, including the Per-Test Analytics page that surfaces cross-run trends, suite breakdowns, and cost analysis.

## Related documentation

- [Viewing Results](viewing-results.md) — using the harness-web dashboard
- [Parquet Schema](../parquet-schema.md) — field reference for analytics Parquet files
- [CLI](../cli.md) — full CLI command reference
- [Data Package](../data.md) — shared data layer: types, DuckDB queries, and analytics functions

---

**Next:** [Parquet Schema](../parquet-schema.md) — the complete field reference for every analytics table you just imported.
**Related:** [Viewing Results](viewing-results.md) — explore the same data visually in the harness-web dashboard.
