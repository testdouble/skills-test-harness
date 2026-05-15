# Building SCIL Evals

> **Tier 2 · Skill authors (trigger accuracy).** This guide covers writing skill-call test suites by hand and running the SCIL (Skill Call Improvement Loop) to refine a skill's trigger description. If you're starting fresh, run [Getting Started: Skill Trigger Accuracy](getting-started/skill-trigger-accuracy.md) first — it walks the `/write-scil-evals` quick start end to end.

Write skill-call tests manually, run and evaluate them, then use the `scil` command to iteratively tune a skill's description against real prompts until trigger accuracy holds.

This guide assumes you've completed setup and run at least one test suite — see [Getting Started: Skill Trigger Accuracy](getting-started/skill-trigger-accuracy.md) if you haven't.

The fastest way to scaffold a SCIL eval suite is the `/write-scil-evals` skill, which interviews you for positive, negative, and sibling trigger prompts and generates the `tests.json` and prompt files. That path is covered in the getting-started guide and in [Writing Skill-Call Evals](write-scil-evals.md). The rest of this guide covers the manual alternative and the SCIL loop.

## Step 1: Write the Test Suite Manually

Create a test suite directory with the following structure:

```
tests/test-suites/{skill-name}/
  tests.json
  prompts/
    skill-call-{slug}.md
    ...
```

### Write prompt files

Each prompt file contains a single user message — the kind of thing a real user would type. Write prompts that exercise the skill's trigger boundary:

**Positive trigger** (`prompts/skill-call-review-ruby-code.md`):
```markdown
Please review the code in this project and let me know about any issues you find.
```

**Negative trigger** (`prompts/skill-call-movie-review.md`):
```markdown
Write me a review of the movie Inception.
```

**Sibling trigger** (`prompts/skill-call-write-docs.md`):
```markdown
Can you write documentation for the authentication module?
```

### Write tests.json

Configure the test suite with `"type": "skill-call"` tests. Each test points to a prompt file and declares whether the skill should trigger.

```json
{
  "plugins": ["r-and-d"],
  "tests": [
    {
      "name": "Skill Call: review ruby code",
      "type": "skill-call",
      "model": "opus",
      "skillFile": "r-and-d:code-review",
      "promptFile": "skill-call-review-ruby-code.md",
      "scaffold": "ruby-project",
      "expect": [
        { "skill-call": true }
      ]
    },
    {
      "name": "Skill Call: movie review",
      "type": "skill-call",
      "model": "sonnet",
      "skillFile": "r-and-d:code-review",
      "promptFile": "skill-call-movie-review.md",
      "expect": [
        { "skill-call": false }
      ]
    },
    {
      "name": "Skill Call: write docs (sibling)",
      "type": "skill-call",
      "model": "sonnet",
      "skillFile": "r-and-d:code-review",
      "promptFile": "skill-call-write-docs.md",
      "expect": [
        { "skill-call": false }
      ]
    }
  ]
}
```

**Key conventions:**
- Positive triggers use `"model": "opus"` — the strongest model should reliably trigger
- Negative and sibling triggers use `"model": "sonnet"` — if a weaker model resists false triggers, the description is well-bounded
- Aim for 3-5 positive triggers and 3+ negative triggers
- Include sibling triggers when the plugin has multiple skills

For the full field reference, see [Test Suite Reference](test-suite-reference.md).

## Step 2: Run and Evaluate

Run the test suite to check current trigger accuracy:

```bash
./harness test-run --suite code-review
```

Then evaluate the results:

```bash
./harness test-eval
```

The output shows each test with its pass/fail status. If some tests fail, that's expected — it means the skill description needs tuning, which is what SCIL does.

To run a single test in isolation (useful for debugging):

```bash
./harness test-run --suite code-review --test "Skill Call: movie review"
```

To see raw Claude output for debugging:

```bash
./harness test-run --suite code-review --debug
```

## Step 3: Improve with SCIL

The `scil` command automates the evaluate-score-improve cycle. It reads your `skill-call` tests, runs them against the current description, identifies failures, and asks Claude to write a better description. This repeats up to `--max-iterations` times.

### Basic Run

```bash
./harness scil --suite code-review
```

SCIL infers the target skill from the test suite. If the suite targets multiple skills, specify one explicitly:

```bash
./harness scil --suite code-review --skill r-and-d:code-review
```

### With Holdout Validation

Hold out a fraction of tests as a validation set to detect overfitting:

```bash
./harness scil --suite code-review --holdout 0.4
```

The holdout set is not shown to the improvement prompt. The best iteration is selected by holdout accuracy, not training accuracy.

### Run Faster with Concurrency

Run multiple sandbox containers in parallel:

```bash
./harness scil --suite code-review --concurrency 3
```

### Auto-Apply the Best Description

Skip the confirmation prompt and write the best description directly to SKILL.md:

```bash
./harness scil --suite code-review --apply
```

### All CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--suite` | *(required)* | Test suite name |
| `--skill` | *(inferred)* | Target skill in `plugin:skill` format |
| `--max-iterations` | `5` | Maximum improvement iterations |
| `--holdout` | `0` | Fraction of tests held out for validation (e.g. `0.4`) |
| `--concurrency` | `1` | Parallel sandbox containers during evaluation |
| `--runs-per-query` | `1` | Runs per test case; results aggregated by majority vote |
| `--model` | `opus` | Model used for generating improved descriptions |
| `--debug` | `false` | Dump raw sandbox output to stdout |
| `--apply` | `false` | Auto-apply the best description without prompting |

### Reading SCIL Output

During the loop, SCIL prints progress per iteration:

```
Iteration 1/5 [explore] — train: 62% (5/8)
  FAIL (should trigger): "Prompt: /code-review on a Go project"
  FAIL (should trigger): "Prompt: please review this pull request"
  New description: The code-review skill performs ...

Iteration 2/5 [explore] — train: 87% (7/8)
  FAIL (should trigger): "Prompt: please review this pull request"
  New description: The code-review skill performs ...
```

Each iteration shows its phase (`explore`, `transition`, or `converge`). Early iterations explore diverse approaches; later iterations make targeted refinements. See [SCIL Divergent-Convergent Phases](skill-call-improvement-loop.md#divergent-convergent-phases) for details.

At the end, a summary table shows all iterations with their phases:

```
Best iteration: 4 (train: 100%)

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

### Output Files

Each SCIL run writes to `tests/output/{run-id}/`:

- **`scil-iteration.jsonl`** — one line per iteration with description, accuracy scores, and per-query results
- **`scil-summary.json`** — final summary with original description, best description, and accuracy history

## Iterating on Your Eval Suite

After the first SCIL run, you may want to refine the test suite:

- **Add prompts that exposed edge cases** — if SCIL found failure patterns, add more prompts in that area
- **Rebalance positive vs. negative** — ensure both sides of the trigger boundary are well-represented
- **Add scaffolds** — some skills behave differently with vs. without project context
- **Re-run SCIL** — each run starts fresh from the current SKILL.md description

## Related References

- [Test Suite Reference](test-suite-reference.md) — full tests.json field reference
- [Writing Skill-Call Evals](write-scil-evals.md) — the `/write-scil-evals` skill workflow and prompt categories
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context in the Docker sandbox
- [CLI Package](cli.md) — CLI implementing the `scil` command and test-run pipeline
- [Data Package](data.md) — SCIL train/test splitting, prompt building, and frontmatter manipulation
- [Evals Package](evals.md) — `evaluateSkillCall` used by SCIL step-5

---

**Next:** [Skill Call Improvement Loop](skill-call-improvement-loop.md) — detailed SCIL mechanics: holdout splits, scoring, the improvement prompt, and every CLI flag.
**Related:** [Building Rubric Evals](rubric-evals-guide.md) — once triggering is reliable, measure output quality with an LLM judge.
