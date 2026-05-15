# Skill Call Improvement Loop (SCIL)

> **Tier 4 · Skill/agent authors tuning behavior, plus contributors.** This is the mechanics reference for the `scil` command — every flag, the holdout model, the divergent-convergent phase system, and the output files. Read [Building SCIL Evals](scil-evals-guide.md) first if you haven't run the loop yet.

Use `scil` to iteratively tune a skill's description against real prompts until trigger accuracy holds. The command runs an evaluate-score-improve loop, tracks the best description across iterations, and writes it back to `SKILL.md`. This page documents every CLI flag, how holdout validation prevents overfitting, the phase system that controls improvement strategy and early exit, and the output files each run produces.

Skill descriptions determine when Claude routes a user prompt to a skill. Getting them right is iterative — you test trigger accuracy, find failures, improve the description, and repeat. The `scil` command automates this cycle using the same Docker-based infrastructure as `test-run`.

## How It Works

SCIL runs a loop over `skill-call` type tests in a test suite:

1. **Evaluate** — run each test case against the current skill description in a Docker container, recording whether the skill was invoked as expected
2. **Score** — compute trigger accuracy across all test cases
3. **Improve** — send the failures and history to Claude in a Docker container and ask for an improved description, using phase-specific instructions (see [Divergent-Convergent Phases](#divergent-convergent-phases) below)
4. **Repeat** — loop up to `--max-iterations` times, tracking the best description found
5. **Apply** — write the best description back to `SKILL.md`, either automatically (`--apply`) or after prompting

At the end of every iteration, SCIL prints a progress summary. When the loop exits, it shows a table of all iterations with accuracy scores and highlights the best result.

## Prerequisites

`scil` uses the same Docker sandbox as `test-run`. Build the harness and set up the sandbox before running:

```bash
make build
./harness sandbox-setup
```

## Test Suite Requirements

`scil` reads `skill-call` type tests from `tests.json`. Only tests with `"type": "skill-call"` are used — skill-prompt tests are ignored.

Example `tests.json` with skill-call tests:

```json
{
  "plugins": ["r-and-d"],
  "tests": [
    {
      "name": "Skill Call: /code-review",
      "type": "skill-call",
      "model": "opus",
      "skillFile": "r-and-d:code-review",
      "promptFile": "skill-call-code-review.md",
      "scaffold": "ruby-project",
      "expect": [
        { "skill-call": true }
      ]
    },
    {
      "name": "Skill Call: no code review",
      "type": "skill-call",
      "model": "sonnet",
      "skillFile": "r-and-d:code-review",
      "promptFile": "skill-call-no-code-review.md",
      "scaffold": "ruby-project",
      "expect": [
        { "skill-call": false }
      ]
    }
  ]
}
```

Each test case checks whether the skill fires (`true`) or does not fire (`false`) for a given prompt. SCIL uses these as the evaluation set.

## Running SCIL

All commands are run from the `tests/` directory.

**Basic run — infer skill from tests.json:**

```bash
./harness scil --suite code-review
```

**Specify the target skill explicitly:**

```bash
./harness scil --suite code-review --skill r-and-d:code-review
```

**Increase iterations:**

```bash
./harness scil --suite code-review --max-iterations 10
```

**Auto-apply the best description without prompting:**

```bash
./harness scil --suite code-review --apply
```

**Hold out 40% of tests for validation:**

```bash
./harness scil --suite code-review --holdout 0.4
```

**Run containers in parallel:**

```bash
./harness scil --suite code-review --concurrency 3
```

**Run each test multiple times and aggregate by majority vote:**

```bash
./harness scil --suite code-review --runs-per-query 3
```

**Debug mode — dump raw stream-json to stdout:**

```bash
./harness scil --suite code-review --debug
```

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--suite` | *(required)* | Test suite name |
| `--skill` | *(inferred)* | Target skill in `plugin:skill` format. Inferred if the suite has only one distinct skill |
| `--max-iterations` | `5` | Maximum number of improvement iterations |
| `--holdout` | `0` | Fraction of tests held out as a validation set (e.g. `0.4` = 40%). Default `0` disables holdout |
| `--concurrency` | `1` | Number of parallel sandbox exec calls during evaluation |
| `--runs-per-query` | `1` | How many times to run each test case. Results are aggregated by majority vote |
| `--model` | `opus` | Claude model used for generating improved descriptions |
| `--debug` | `false` | Dump raw sandbox output to stdout |
| `--apply` | `false` | Auto-apply the best description to `SKILL.md` without prompting |

## Holdout Sets

When `--holdout` is greater than `0`, SCIL splits the test cases into a train set and a test set before the loop begins. The split is:

- **Deterministic** — the same suite+skill always produces the same split
- **Stratified** — at least one positive (`expected: true`) and one negative (`expected: false`) in each set when possible

During the loop, only train results are shown to the improvement prompt. Test accuracy is tracked separately and not included in the prompt, preventing data leakage. The best iteration is selected by highest test accuracy (not train accuracy) when holdout is active.

Without `--holdout`, all tests are in the train set and best iteration is selected by highest train accuracy.

## Divergent-Convergent Phases

Each iteration runs in one of three phases, determined by `getPhase(iteration, maxIterations)` from the data package. The phases control the improvement prompt strategy and early-exit behavior:

| Phase | Strategy | Early Exit |
|-------|----------|------------|
| **Explore** | Write a fundamentally different description from scratch — new vocabulary, new framing, no incremental edits | Never |
| **Transition** | Combine the strongest elements from the best-performing iterations while still experimenting with boundary statements | Never |
| **Converge** | Make targeted, surgical edits to fix failing cases without regressing passing ones. When holdout failures exist and train accuracy is perfect, the specific failing holdout queries are shown to the prompt | Yes, on perfect accuracy |

Phase allocation depends on `maxIterations`:
- **5 or fewer iterations:** Two phases — explore (first half, rounded up), converge (second half)
- **6+ iterations:** Three phases — explore, transition, converge (divided in thirds, remainder distributed left to right)

During explore and transition phases, new descriptions are always generated regardless of current accuracy. During converge, improvement is skipped when accuracy is already perfect. The loop only exits early on perfect train+test accuracy once the converge phase has been reached.

The phase is recorded in each iteration's output and displayed in console progress and the summary table.

## Selecting the Best Iteration

SCIL tracks the best iteration throughout the loop:

- With holdout: highest test accuracy wins; tie-break goes to the earlier iteration
- Without holdout: highest train accuracy wins; tie-break goes to the earlier iteration

The loop exits early when both train and test accuracy reach 100%, but only during or after the converge phase.

## Applying the Description

At the end of the loop, SCIL reports the best description found. If `--apply` was passed, it writes the new description directly to the `description:` field in the skill's `SKILL.md` frontmatter. Otherwise, it prompts interactively.

The description is enforced to a maximum of 1024 characters, matching the Claude Code skill description limit.

## Output Files

Each `scil` run writes output to `tests/output/{run-id}/`:

- **`scil-iteration.jsonl`** — one line per iteration with description, accuracy scores, and per-query results
- **`scil-summary.json`** — final summary with original description, best description, best iteration number, and accuracy at each iteration

For the step-by-step guide covering the full workflow from writing tests to running SCIL, see [Building SCIL Evals](scil-evals-guide.md).

## Console Output

During the loop:

```
Iteration 1/5 [explore] — train: 62% (5/8)
  FAIL (should trigger): "Prompt: /code-review on a Go project"
  FAIL (should trigger): "Prompt: please review this pull request"
  New description: The code-review skill performs ...

Iteration 2/5 [explore] — train: 87% (7/8)
  FAIL (should trigger): "Prompt: please review this pull request"
  New description: The code-review skill performs ...
```

At the end:

```
Best iteration: 3 (train: 100%)

Iteration  Phase       Train   Test
---------  ----------  ------  ----
1          explore     62%     —
2          explore     87%     —
3          explore     100%    —
4          converge    100%    —   ← best

Best description:
The code-review skill performs a thorough review of ...

Apply this description to SKILL.md? [y/N]
```

## Related References

- [Building SCIL Evals](scil-evals-guide.md) — step-by-step guide covering the full workflow from writing tests to running SCIL
- [Test Suite Reference](test-suite-reference.md) — full tests.json field reference for `skill-call` type tests
- [Writing Skill-Call Evals](write-scil-evals.md) — using the `/write-scil-evals` skill to generate test suites
- [Test Harness README](../README.md) — prerequisites, setup, and running tests
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context in the Docker sandbox
- [CLI Package](cli.md) — CLI package implementing the `scil` command and test-run pipeline
- [Data Package](data.md) — Shared data layer providing SCIL train/test splitting, prompt building, and frontmatter manipulation
- [Evals Package](evals.md) — Evaluation engine providing `evaluateSkillCall` used by SCIL step-5
- [Agent Call Improvement Loop](agent-call-improvement-loop.md) — parallel implementation for agent descriptions

---

**Next:** [Building SCIL Evals](scil-evals-guide.md) — manual test authoring and iteration strategies for the loop.
**Related:** [Agent Call Improvement Loop](agent-call-improvement-loop.md) — the parallel loop for agent descriptions.
