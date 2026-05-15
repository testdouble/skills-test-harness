# Viewing Results in the Dashboard

> **Tier 1 · Anyone reviewing results.** Assumes you've completed [setup](../../README.md#setup), run at least one test suite, and imported data with `./harness update-analytics-data` (see [Analytics](analytics.md) for the import command). This page gets you a browser dashboard for inspecting every test run, improvement loop, and cross-run trend.

Launch the harness-web dashboard and use each page to inspect test run results, SCIL and ACIL improvement loop history, and cross-run analytics — all from your browser.

## Launching the dashboard

From the `tests/` directory:

```bash
./harness-web
```

Open `http://localhost:3099` in your browser.

To use a different port:

```bash
./harness-web --port 8080
```

**Note:** The dashboard reads from the analytics Parquet files. Make sure you've imported your test data first — see [Analytics](analytics.md) for the import command.

## Test Run History

**Route:** `/` (the default landing page)

This page lists all test runs with aggregate stats:

- **Total runs** — how many test runs have been recorded
- **Total tests** — the sum of all test cases across all runs
- **Average pass rate** — the overall pass rate across all runs

Each row shows a single test run with its suite name, date, test count, and a pass-rate progress bar. Click a row to drill into the run detail.

This is where you'll land after running any test suite — whether you're testing [skill trigger accuracy](skill-trigger-accuracy.md), [skill effectiveness](skill-effectiveness.md), [agent trigger accuracy](agent-trigger-accuracy.md), or [agent effectiveness](agent-effectiveness.md).

## Test Run Detail

**Route:** `/runs/:runId`

This page shows the results of a single test run, broken into three sections:

### Test summary

A table of every test in the run, showing:

- Test name, suite, and model
- Pass/fail status
- Token usage (input and output tokens)
- Cost in USD
- Number of conversation turns

### Expectation results

A table of individual expectation assertions. Each row shows the expectation type (e.g., `skill-call`, `agent-call`, `result-contains`), the expected value, and whether it passed.

For skill-call and agent-call tests, this is where you see whether your skill or agent was correctly triggered (or correctly not triggered). For details on how these expectations work, see [Test Suite Reference](../test-suite-reference.md).

### LLM judge results

This section only appears for tests with `llm-judge` expectations. Each judge group shows:

- **Rubric metadata** — rubric file, judge model, threshold, and overall score
- **Pass/fail status** — whether the aggregate score met the threshold
- **Per-criterion table** — each rubric criterion with its pass/fail result and the judge's reasoning
- **Full output** — a collapsible panel showing the skill's complete output, rendered as markdown

This is the key section when you're working on [skill effectiveness](skill-effectiveness.md) or [agent effectiveness](agent-effectiveness.md). The per-criterion breakdown tells you exactly which quality criteria your skill is meeting and which it's missing. For details on how the judge scores criteria, see [LLM Judge Evaluation](../llm-judge.md). For tips on refining your rubric based on these results, see [Building Rubric Evals](../rubric-evals-guide.md).

## SCIL History

**Route:** `/scil`

This page lists all SCIL (Skill Call Improvement Loop) runs with aggregate stats:

- **Total runs** — how many SCIL improvement loops have been executed
- **Unique skills** — how many distinct skills have been improved
- **Average best accuracy** — the average best accuracy achieved across all runs

Each row shows a single SCIL run with the target skill, iteration count, and best training accuracy. Click a row to drill into the detail.

For context on how the SCIL loop works, see [Skill Call Improvement Loop](../skill-call-improvement-loop.md). For how to set up the tests that feed SCIL, see [Improving Skill Trigger Accuracy](skill-trigger-accuracy.md).

## SCIL Detail

**Route:** `/scil/:runId`

This page shows a single SCIL improvement loop run:

- **Original description** — the skill description before the loop started
- **Iterations** — each iteration shows:
  - The rewritten description Claude proposed
  - Training accuracy (and test/holdout accuracy if holdout was used)
  - A train results table showing expected vs actual trigger behavior per prompt
- **Best description** — highlighted with a green border, showing which iteration produced the highest accuracy

This is where you review how SCIL refined your skill's description over multiple iterations. For the full guide on running SCIL including holdout, concurrency, and auto-apply options, see [Building SCIL Evals](../scil-evals-guide.md).

## ACIL History and Detail

**Routes:** `/acil` and `/acil/:runId`

These pages mirror the SCIL pages but for agent improvement loops. ACIL History lists all ACIL runs with target agent, iteration count, and best accuracy. ACIL Detail shows the iteration-by-iteration refinement of an agent's description.

For context on how the ACIL loop works, see [Agent Call Improvement Loop](../agent-call-improvement-loop.md). For how to set up the tests that feed ACIL, see [Improving Agent Trigger Accuracy](agent-trigger-accuracy.md).

## Per-Test Analytics

**Route:** `/analytics`

This page aggregates data across all test runs to show trends and patterns:

- **Summary stats** — total runs, total tests, overall pass rate, total cost, and average turns
- **Donut chart** — visual pass/fail breakdown across all tests
- **Suite breakdown** — per-suite run count, test count, and pass rate with progress bars
- **Cost by test** — horizontal bar chart showing the most expensive tests
- **Expectation types** — summary of which expectation types are in use

This is useful for spotting patterns over time — which suites are improving, which tests are consistently expensive, and where failures cluster. For more on the underlying data and CLI query options, see [Analytics](analytics.md).

## Related documentation

- [Analytics](analytics.md) — importing data and CLI queries
- [Web Dashboard (architecture)](../web.md) — API endpoints, component hierarchy, and technical details
- [LLM Judge Evaluation](../llm-judge.md) — how the judge scores criteria
- [Parquet Schema](../parquet-schema.md) — field reference for the underlying analytics data

---

**Next:** [Analytics](analytics.md) — query the same data from the CLI and understand the import that feeds this dashboard.
**Related:** [LLM Judge Evaluation](../llm-judge.md) — how the per-criterion scores in the dashboard's LLM judge section are produced.
