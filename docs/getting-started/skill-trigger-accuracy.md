# Improving Skill Trigger Accuracy

This guide assumes you've completed the setup steps in the [Test Harness README](../../README.md).

Skill trigger accuracy measures whether Claude correctly routes user prompts to your custom skill. When trigger accuracy is low, your skill either fires on unrelated prompts (false positives) or fails to fire when it should (false negatives). This guide walks you through creating skill-call tests, running them, and reviewing the results.

## What you'll do

1. Write your test configuration using the `/write-scil-evals` skill
2. Run the test suite to measure current trigger accuracy
3. Import the results into the analytics database
4. View the results in the harness-web dashboard

## Step 1: Write your test configuration

Use the `/write-scil-evals` skill to generate a test suite for your skill:

```
/write-scil-evals plugin:skill
```

For example, to test the `code-review` skill in the `r-and-d` plugin:

```
/write-scil-evals r-and-d:code-review
```

The skill interviews you to collect three categories of prompts:

- **Positive triggers** — prompts that should trigger your skill (3-5 recommended)
- **Negative triggers** — prompts that should not trigger your skill (3+ recommended)
- **Sibling triggers** — prompts that should trigger other skills in the same plugin, not yours (3+ if applicable)

It generates two things in `tests/test-suites/{skill-name}/`:

- `tests.json` — the test configuration with one entry per prompt
- `prompts/skill-call-*.md` — individual prompt files

For details on the skill's full workflow and prompt category conventions, see [Writing Skill-Call Evals](../write-scil-evals.md). For the complete `tests.json` field reference, see [Test Suite Configuration](../test-suite-configuration.md).

## Step 2: Run the test suite

Run all tests in your suite:

```bash
./harness test-run --suite {skill-name}
```

The harness executes each prompt inside the Docker sandbox, records whether your skill was triggered, and prints a pass/fail summary.

**Tip:** To run a single test in isolation (useful for debugging):

```bash
./harness test-run --suite {skill-name} --test "Skill Call: some test name"
```

**Tip:** To see raw Claude output for troubleshooting:

```bash
./harness test-run --suite {skill-name} --debug
```

For the full list of CLI flags, see [CLI](../cli.md).

## Step 3: Import data into analytics

Import your test run results into the analytics database:

```bash
./harness update-analytics-data
```

This is idempotent — runs already imported are skipped. For more detail on analytics data and CLI queries, see [Analytics](analytics.md).

## Step 4: View your results

Launch the harness-web dashboard to inspect your test run:

```bash
./harness-web
```

Open `http://localhost:3099` in your browser. You'll see your test run in the Test Run History page, and can click through to see per-test pass/fail results. For a full walkthrough of the dashboard, see [Viewing Results](viewing-results.md).

## Next Steps

- **Improve your trigger description** — Use the SCIL (Skill Call Improvement Loop) to iteratively refine your skill's description based on test failures. See [Skill Call Improvement Loop](../skill-call-improvement-loop.md) for mechanics and CLI flags, and [Building SCIL Evals](../scil-evals-guide.md) for the full guide including manual test authoring and iteration strategies.
- **Measure skill output quality** — Once your skill triggers reliably, you can measure how well it performs its job using rubric evals. See [Improving Skill Effectiveness](skill-effectiveness.md).
