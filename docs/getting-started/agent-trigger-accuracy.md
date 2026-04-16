# Improving Agent Trigger Accuracy

This guide assumes you've completed the setup steps in the [Test Harness README](../../README.md).

Agent trigger accuracy measures whether Claude correctly delegates tasks to your custom agent. When trigger accuracy is low, your agent either gets invoked on unrelated prompts (false positives) or fails to activate when it should (false negatives). This guide walks you through creating agent-call tests, running them, and reviewing the results.

## What you'll do

1. Write your test configuration using the `/write-acil-evals` skill
2. Run the test suite to measure current trigger accuracy
3. Import the results into the analytics database
4. View the results in the harness-web dashboard

## Step 1: Write your test configuration

Use the `/write-acil-evals` skill to generate a test suite for your agent:

```
/write-acil-evals plugin:agent
```

For example, to test the `gap-analyzer` agent in the `r-and-d` plugin:

```
/write-acil-evals r-and-d:gap-analyzer
```

The skill interviews you to collect three categories of prompts:

- **Positive triggers** — prompts that should delegate to your agent (3-5 recommended)
- **Negative triggers** — prompts that should not delegate to your agent (3+ recommended)
- **Sibling triggers** — prompts that should trigger other agents or skills in the same plugin, not yours (3+ if applicable)

It generates two things in `tests/test-suites/{agent-name}/`:

- `tests.json` — the test configuration with one entry per prompt
- `prompts/agent-call-*.md` — individual prompt files

For details on the skill's full workflow and prompt category conventions, see [Writing Agent-Call Evals](../write-acil-evals.md). For the complete `tests.json` field reference, see [Test Suite Configuration](../test-suite-configuration.md).

## Step 2: Run the test suite

Run all tests in your suite:

```bash
./harness test-run --suite {agent-name}
```

The harness executes each prompt inside the Docker sandbox, records whether your agent was delegated to, and prints a pass/fail summary.

**Tip:** To run a single test in isolation (useful for debugging):

```bash
./harness test-run --suite {agent-name} --test "Agent Call: some test name"
```

**Tip:** To see raw Claude output for troubleshooting:

```bash
./harness test-run --suite {agent-name} --debug
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

- **Improve your trigger description** — Use the ACIL (Agent Call Improvement Loop) to iteratively refine your agent's description based on test failures. See [Agent Call Improvement Loop](../agent-call-improvement-loop.md) for mechanics and CLI flags.
- **Measure agent output quality** — Once your agent triggers reliably, you can measure how well it performs its job using rubric evals. See [Improving Agent Effectiveness](agent-effectiveness.md).
