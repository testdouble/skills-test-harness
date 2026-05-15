# Improving Skill Effectiveness

> **Tier 1 · Skill authors.** Assumes you've completed [setup](../../README.md#setup). This page gets you a first rubric-scored skill run end-to-end, with LLM-judge results you can review.

Build a scaffold, write rubric evals, run them, and have an LLM judge score your skill's output against your quality criteria.

## What you'll learn

Skill effectiveness measures how well your skill performs its job — not whether it triggers, but whether its output meets quality criteria. You define those criteria in a rubric, and an LLM judge scores the skill's output against them. Effectiveness is independent of trigger accuracy: a skill can fire reliably and still produce weak output.

## What you'll do

1. Create a project scaffold that gives your skill realistic context to work with
2. Write your test configuration and rubric using the `/write-skill-eval-rubric` skill
3. Run the test suite to produce skill output
4. Evaluate the results with the LLM judge
5. Import the results into the analytics database
6. View the results in the harness-web dashboard

## Step 1: Create a project scaffold

Scaffolds are realistic project directories that your skill analyzes inside the Docker sandbox. They contain source files, configs, and intentionally-planted signals (bugs, missing docs, architectural issues) that your skill should detect.

Use the `/build-skill-eval-scaffold` skill to generate one:

```
/build-skill-eval-scaffold plugin:skill
```

For example:

```
/build-skill-eval-scaffold r-and-d:code-review
```

The skill interviews you about the technology stack, project shape, and specific signals to plant, then generates a scaffold directory at `tests/test-suites/{skill-name}/scaffolds/{scaffold-name}/`.

For details on the scaffold creation workflow, see [Building Skill Eval Scaffolds](../build-skill-eval-scaffold.md). For how scaffolds work inside the Docker sandbox, see [Test Scaffolding](../test-scaffolding.md).

## Step 2: Write your test configuration

Use the `/write-skill-eval-rubric` skill to create a quality rubric and configure test entries:

```
/write-skill-eval-rubric plugin:skill
```

For example:

```
/write-skill-eval-rubric r-and-d:code-review
```

The skill reads your scaffold files and interviews you to collect criteria in four categories:

- **Presence** — things the skill's output must identify (e.g., "The review identifies the SQL injection on line 23")
- **Specificity** — output must reference concrete details (file names, line numbers, method names)
- **Depth** — output must be actionable (fixes, examples, reasoning)
- **Absence** — things the output must not do (hallucinations, incorrect claims)

It generates two things:

- `tests/test-suites/{skill-name}/rubrics/{skill-name}-quality.md` — the rubric file with categorized criteria
- Updates to `tests/test-suites/{skill-name}/tests.json` — skill-prompt test entries with `llm-judge` expectations

**Note:** The skill can create skill-prompt tests from scratch if none exist yet, or add rubric expectations to existing tests.

For details on the skill's full workflow and criteria categories, see [Writing Skill Eval Rubrics](../write-skill-eval-rubric.md). For the complete `tests.json` field reference, see [Test Suite Reference](../test-suite-reference.md).

## Step 3: Run the test suite

Run all tests in your suite:

```bash
./harness test-run --suite {skill-name}
```

This runs your skill against the prompt and scaffold inside the Docker sandbox. The LLM judge does not run yet — it evaluates stored output in the next step.

**Tip:** To run a single test in isolation (useful for debugging):

```bash
./harness test-run --suite {skill-name} --test "Prompt: some test name"
```

**Tip:** To see raw Claude output for troubleshooting:

```bash
./harness test-run --suite {skill-name} --debug
```

For the full list of CLI flags, see [CLI](../cli.md).

## Step 4: Evaluate the results

Run the evaluation pipeline to have the LLM judge score your skill's output against the rubric:

```bash
./harness test-eval
```

The `test-run` step captures Claude's output; `test-eval` scores it against your rubric. These are separate commands because the LLM judge consumes tokens — running a second Claude invocation to evaluate each test. Keeping them separate lets you run tests now and evaluate later when you have tokens to spare, or batch multiple test runs before evaluating them all at once.

The judge prints progress per test, showing each criterion as pass or fail with reasoning. Results are written to `tests/output/{run-id}/test-results.jsonl`.

For details on how the judge constructs its prompt, scores criteria, and handles errors, see [LLM Judge Evaluation](../llm-judge.md).

## Step 5: Import data into analytics

Import your test run and evaluation results into the analytics database:

```bash
./harness update-analytics-data
```

This is idempotent — runs already imported are skipped. For more detail on analytics data and CLI queries, see [Analytics](analytics.md).

## Step 6: View your results

Launch the harness-web dashboard to inspect your test run and judge results:

```bash
./harness-web
```

Open `http://localhost:3099` in your browser. Navigate to your test run to see per-criterion pass/fail results from the LLM judge, including the reasoning behind each score. For a full walkthrough of the dashboard, see [Viewing Results](viewing-results.md).

---

**Next:** [Building Rubric Evals](../rubric-evals-guide.md) — iterate on rubric criteria and re-score stored output without re-running the skill.
**Related:** [Improving Skill Trigger Accuracy](skill-trigger-accuracy.md) — if the skill isn't firing reliably, measure and improve when Claude calls it.
