# Building Rubric Evals

> **Tier 2 · Skill and agent authors (effectiveness).** This guide covers writing LLM-judge rubrics by hand and iterating on quality criteria against stored output. If you're starting fresh, run [Getting Started: Skill Effectiveness](getting-started/skill-effectiveness.md) first — it walks the `/write-skill-eval-rubric` quick start end to end.

Write rubric criteria by hand, wire them into an `llm-judge` expectation, run the suite, and refine the rubric by re-scoring stored output without re-running the skill.

This guide assumes you've completed setup and run at least one test suite — see [Getting Started: Skill Effectiveness](getting-started/skill-effectiveness.md) if you haven't.

Rubric evals use a second Claude invocation (the "judge") to evaluate whether a skill's output meets quality criteria. Unlike code-based expectations (`result-contains`, `skill-call`), rubric evals can assess semantic qualities like "does the review identify the SQL injection on line 23?"

The fastest way to scaffold a rubric is the `/write-skill-eval-rubric` skill, which interviews you for criteria in four categories, configures the judge model and threshold, and writes the rubric file and `tests.json` updates. For agent rubric evaluation, use `/write-agent-eval-rubric` instead — same workflow, but it targets `agent-prompt` type tests and references agent definition files rather than SKILL.md (see [Writing Agent Eval Rubrics](write-agent-eval-rubric.md)). The skill path is covered in the getting-started guide and in [Writing Skill Eval Rubrics](write-skill-eval-rubric.md). The rest of this guide covers the manual alternative and the iteration loop.

## Step 1: Write the Rubric Manually

### Create the rubric file

Rubric files are markdown with bullet-point criteria. Create the file at:

```
tests/test-suites/{suite}/rubrics/{skill-name}-quality.md
```

Organize criteria into four categories:

```markdown
## Rubric: code-review of ruby-project scaffold

### Presence — things the review must identify
- The review identifies that `forEach` is not a valid Ruby method and should be `each` (lib/example.rb, line 8)
- The review identifies that `total + 1` should be `total + num` (lib/example.rb, line 9)

### Specificity — the review must be concrete
- Each identified issue references the file name `example.rb` or `lib/example.rb`
- The review identifies that manual iteration should be a `.reduce` call

### Depth — the review must be actionable
- At least one finding includes a suggested fix showing the corrected code
- At least one finding suggests removing debugging code

### Absence — the review must not do these things
- The review does not hallucinate bugs not present in the scaffold code
- The review does not suggest non-idiomatic ruby changes
```

The parser extracts all lines starting with `- ` as criteria. Headings are ignored by the parser but useful for organizing the rubric.

### File output criteria

When a skill or agent writes output files to the filesystem (not just transcript text), the rubric can include `## File:` sections to evaluate those files separately:

```markdown
## File: docs/gap-analysis.md
### Presence
- The analysis identifies the missing authentication middleware

### Depth
- The analysis includes a concrete migration plan with numbered steps
```

Each `## File:` section targets a specific output file path. Criteria within file sections follow the same four categories (Presence, Specificity, Depth, Absence) — but each category is optional. Empty categories are omitted.

If the agent does not produce a file referenced by a `## File:` section, all criteria in that section auto-fail with the reasoning "Output file was not produced by the agent." This lets you assert that files must exist without a separate expectation.

File sections appear after the transcript-scoped sections (the standard Presence/Specificity/Depth/Absence categories). The transcript sections evaluate the agent's conversational output; `## File:` sections evaluate the file content.

### Writing good criteria

| Category | What it checks | Example |
|----------|---------------|---------|
| **Presence** | Output identifies something specific | "The review identifies the SQL injection in users_controller.rb" |
| **Specificity** | Output references concrete details | "Each issue references a specific file name and line number" |
| **Depth** | Output is actionable | "Each issue includes a concrete code fix" |
| **Absence** | Output avoids harmful or incorrect content | "The review does not hallucinate issues not in the scaffold" |

Tips:
- Write criteria against observed failures, not adversarial scenarios
- Constrain the scaffold, not the skill — tie criteria to specific files and lines
- "The review identifies the missing `before_action` in `UsersController`" is gradeable; "The review finds all security issues" is not

### Configure the llm-judge expectation

Add an `llm-judge` expectation to a skill-prompt test in `tests.json`:

```json
{
  "name": "Prompt: /code-review quality",
  "type": "skill-prompt",
  "promptFile": "prompt-code-review.md",
  "model": "opus",
  "scaffold": "ruby-project",
  "expect": [
    { "result-contains": "# Code Review:" },
    { "skill-call": { "skill": "r-and-d:code-review", "expected": true } },
    { "llm-judge": { "rubricFile": "code-review-quality.md", "model": "opus", "threshold": 0.8 } }
  ]
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `rubricFile` | yes | — | Filename in the suite's `rubrics/` directory |
| `model` | no | `"opus"` | Claude model used as the judge |
| `threshold` | no | `1.0` | Fraction of criteria that must pass (0.0–1.0) |

A threshold of `0.8` with 10 criteria means at least 8 must pass. The harness validates that the rubric file exists at load time.

For the full field reference, see [Test Suite Reference](test-suite-reference.md).

## Step 2: Run the Tests

Run the test suite to produce output for the judge to evaluate:

```bash
./harness test-run --suite code-review
```

This runs the skill against the prompt and scaffold. The judge does not run yet — it evaluates stored output in the next step.

To run a specific test:

```bash
./harness test-run --suite code-review --test "Prompt: /code-review quality"
```

## Step 3: Evaluate with the Judge

Run the evaluation pipeline, which includes the LLM judge:

```bash
./harness test-eval
```

Or evaluate a specific run:

```bash
./harness test-eval <run-id>
```

### Console Output

The judge prints progress per test:

```
Running LLM judge (opus) for "Prompt: /code-review quality" with 9 criteria...
  - [PASS] llm-judge "The review identifies the missing auth check..."
  - [FAIL] llm-judge "Each issue includes a suggested fix..."
  - [PASS] llm-judge-aggregate score=0.75 threshold=0.80
```

### Result Files

Results are written to `tests/output/{run-id}/test-results.jsonl` with two types of rows:

**Per-criterion rows** (`expect_type: "llm-judge"`) — one per criterion with pass/fail and reasoning:

```json
{ "expect_type": "llm-judge", "expect_value": "The review identifies the missing auth check", "passed": true, "reasoning": "Line 42 explicitly mentions..." }
```

**Aggregate row** (`expect_type: "llm-judge-aggregate"`) — overall score vs. threshold:

```json
{ "expect_type": "llm-judge-aggregate", "expect_value": "code-review-quality.md", "passed": false, "judge_score": 0.75, "judge_threshold": 0.8 }
```

Only the aggregate row affects the test's pass/fail status. Per-criterion rows provide diagnostic detail.

### Inspecting Results

```bash
# View all judge results for a run
cat tests/output/<run-id>/test-results.jsonl | grep llm-judge

# View only failures
cat tests/output/<run-id>/test-results.jsonl | grep llm-judge | grep '"passed":false'

# View aggregate scores
cat tests/output/<run-id>/test-results.jsonl | grep llm-judge-aggregate
```

## Step 4: Iterate on the Rubric

The judge re-evaluates from stored output, so you can refine criteria without re-running the test:

```bash
# Edit the rubric
vim tests/test-suites/code-review/rubrics/code-review-quality.md

# Re-evaluate the same run
./harness test-eval <run-id>
```

Common adjustments:
- **Criteria too strict** — a criterion fails every run because the skill approaches the problem differently than expected. Rewrite to be less prescriptive about how the skill addresses the issue.
- **Criteria too vague** — a criterion passes when it shouldn't. Tie it to a specific file, line, or symbol in the scaffold.
- **Missing criteria** — the skill produces bad output that passes all criteria. Add criteria that catch the failure mode.
- **Threshold tuning** — if 1 out of 10 criteria is borderline, a threshold of `0.8` gives room. If all criteria are essential, use `1.0`.

You can also re-run `/write-skill-eval-rubric` to interactively update the rubric — it detects the existing rubric and lets you add, modify, or remove criteria.

## How the Judge Works

The judge receives a prompt containing:

1. **Scaffold files** — all files from the test's scaffold (each truncated at 5KB)
2. **Tool-call transcript** — tool name, key arguments, and first 500 chars of each result
3. **Final skill output** — the result text
4. **Output file content** — content of any files the skill/agent wrote to the filesystem (only when the rubric contains `## File:` sections)
5. **Numbered criteria** — from the rubric file, with file-scoped criteria prefixed by `[File: path]`

The judge responds with JSON scoring each criterion as pass or fail with reasoning. The aggregate score is `passed_criteria / total_criteria`, compared against the threshold.

The judge runs as a separate Claude invocation in the Test Sandbox using `--print` mode. No skill plugins are loaded — it evaluates output only.

For the complete technical details, see [LLM Judge Evaluation](llm-judge.md).

## Related References

- [Test Suite Reference](test-suite-reference.md) — full tests.json field reference including `llm-judge` expectation format
- [Writing Skill Eval Rubrics](write-skill-eval-rubric.md) — the `/write-skill-eval-rubric` skill workflow and criteria categories
- [Writing Agent Eval Rubrics](write-agent-eval-rubric.md) — the `/write-agent-eval-rubric` skill workflow for agent rubric evals
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context in the Test Sandbox
- [Evals Package](evals.md) — evaluation engine implementing LLM judge and boolean eval logic
- [CLI Package](cli.md) — `test-eval` command that runs rubric evaluations

---

**Next:** [LLM Judge Evaluation](llm-judge.md) — judge mechanics: prompt construction, scoring, output format, and error handling.
**Related:** [Building SCIL Evals](scil-evals-guide.md) — measure and improve when Claude calls the skill, not just how well it performs.
