# Writing Skill Eval Rubrics

> **Tier 3 · Skill/agent authors building evals.** The `/write-skill-eval-rubric` skill generates quality rubric files and `llm-judge` `tests.json` expectations for a skill's effectiveness evals; you need a target `plugin:skill` (and usually a scaffold) already in place.

Run `/write-skill-eval-rubric` to define how an LLM judge scores a skill's output quality. The skill interviews you for categorized criteria, writes a rubric markdown file under `tests/test-suites/{suite}/rubrics/`, and configures `llm-judge` expectations in `tests.json`. Run it after building a scaffold and before running and evaluating tests.

## When to use this skill

Use this skill when you need to:

- Create a new quality rubric for a skill's skill-prompt tests
- Add `llm-judge` expectations to an existing test suite
- Update criteria in an existing rubric file

## When NOT to use this skill

- You need skill-call (trigger accuracy) tests — this skill produces **rubric files and llm-judge expectations only**. Use `/write-scil-evals` for trigger accuracy testing.
- You need a project fixture for the skill to act on — build it first with `/build-skill-eval-scaffold`.
- You're writing rubrics for an agent rather than a skill — use `/write-agent-eval-rubric` instead.
- You want to run the harness or judge — this skill configures the rubric but does not run tests or invoke the judge.

## Usage

Invoke the skill with a `plugin:skill` argument:

```
/write-skill-eval-rubric r-and-d:code-review
```

If no argument is provided, the skill will ask which plugin:skill to write rubric evals for.

## What It Produces

The skill creates (or updates) a rubric file and configures llm-judge expectations:

```
tests/test-suites/{skill-name}/
  rubrics/
    {skill-name}-quality.md    # rubric file with categorized criteria
  tests.json                   # updated with llm-judge expectations
  prompts/                     # new prompt files if tests were created
    prompt-{name}.md
```

### Rubric file format

Rubric files use markdown with criteria organized into four categories:

```markdown
## Rubric: {skill-name} of {scaffold-name} scaffold

### Presence — things the {output-type} must identify
- The review identifies the missing authentication check in UsersController#create

### Specificity — the {output-type} must be concrete
- Each identified issue references a specific file name and line number

### Depth — the {output-type} must be actionable
- The authentication finding includes a suggested fix

### Absence — the {output-type} must not do these things
- The review does not hallucinate issues not present in the scaffold
```

If no scaffold is used, the title is formatted as `## Rubric: {skill-name} quality`.

When the skill writes output files to the filesystem, the rubric can include `## File:` sections after the transcript categories:

```markdown
## File: docs/analysis.md
### Presence
- The analysis identifies the missing authentication middleware

### Depth
- The analysis includes a concrete migration plan
```

Each `## File:` section targets a specific output file path. Criteria categories within file sections are optional — only include the categories that have criteria. If the skill does not produce a referenced file, all criteria in that section auto-fail.

### Deterministic checks

Alongside the `llm-judge` expectation, the skill proposes up to two `result-contains` strings for text the skill's output format guarantees (a fixed report heading) and up to two `result-does-not-contain` strings for text that means the skill did not run. These are cheap and never flaky, but a mismatch fails the whole test, so the skill proposes none when nothing is guaranteed.

### llm-judge expectation format

Each llm-judge expectation in `tests.json` follows this format:

```json
{
  "llm-judge": {
    "rubricFile": "code-review-quality.md",
    "model": "opus",
    "threshold": 0.8
  }
}
```

- `rubricFile` — filename of the rubric in the suite's `rubrics/` directory (required)
- `model` — Claude model used to judge the output (default: `"opus"`)
- `threshold` — fraction of criteria that must pass for the expectation to pass (default: `0.8`)

## Workflow

The skill walks through a 7-step process with three pauses for the user: test targets, the drafted rubric, and a final preview.

1. **Identify the target skill** — parse and validate the `plugin:skill` argument, run `scripts/collect-target-inputs.sh` to resolve the skill's SKILL.md, reference files, and dispatched agents, then read them to learn the output type, what the skill checks for, and whether it writes files
2. **Inspect the test suite** — read existing `tests.json`, rubrics, and the scaffold files the `skill-prompt` tests use; detect create vs. update mode
3. **Interview: Test targets** — propose which `skill-prompt` tests receive the rubric, whether to add a new one, and (for file-writing skills) the output paths the prompt should pin
4. **Draft the rubric** — Presence, Specificity, Depth, and Absence criteria drawn from the skill's own checks and the scaffold's planted signals; `## File:` sections for file output; zero to two deterministic `result-contains` / `result-does-not-contain` checks for text the skill guarantees; llm-judge settings (defaults: opus, 0.8) and the rubric filename
5. **Interview: Edit the draft** — the user approves, adds, removes, or modifies criteria, checks, and settings
6. **Preview and confirm** — the exact rubric markdown, tests.json changes, and new prompt files
7. **Write and validate** — write everything, then run `scripts/validate-suite.sh` and fix every finding before reporting
## Criteria Categories

### Presence (required)

Things the skill's output MUST identify or include. These are the core expectations — if any are missing from the output, the rubric should fail.

Good presence criteria:
- Reference specific findings tied to scaffold files and line numbers
- Are complete sentences starting with "The {output-type}..."
- Are based on observed failure modes, not adversarial edge cases

### Specificity (required)

The output must be concrete — referencing specific file names, line numbers, method names, or other identifiable details rather than making vague statements.

### Depth (required)

The output must be actionable — not just identifying issues but showing how to fix them, providing examples, or explaining the reasoning.

### Absence (required)

Things the output must NOT do — hallucinating issues that don't exist, suggesting non-idiomatic changes, making incorrect claims, etc.

## Create vs. Update

- **New rubric**: Creates the rubric file, adds `llm-judge` expectations to selected tests, and optionally creates new skill-prompt test entries
- **Existing rubric**: Shows current criteria per category and asks the user what to add, modify, or remove. Never removes criteria without explicit confirmation.

## What to Do Next

After generating the rubric, you can:

1. **Run the tests** to produce output for the judge to evaluate:
   ```bash
   ./build/harness test-run --suite {skill-name}
   ```

2. **Evaluate results** including the llm-judge expectations:
   ```bash
   ./build/harness test-eval
   ```

3. **Inspect judge results** in `output/{run-id}/test-results.jsonl` — look for `llm-judge` rows (per-criterion pass/fail with reasoning) and `llm-judge-aggregate` rows (overall score vs. threshold).

4. **Iterate on criteria** — if criteria are too strict or too lenient, re-run `/write-skill-eval-rubric` to update them, then re-evaluate with `./build/harness test-eval <run-id>` (re-evaluates without re-running the test).

For details on how the llm-judge system works, see [LLM Judge Evaluation](llm-judge.md).

## References

- [Building Rubric Evals](rubric-evals-guide.md) — step-by-step guide covering the full workflow from writing rubrics to evaluating results
- [Test Suite Reference](test-suite-reference.md) — full tests.json field reference including the `llm-judge` expectation format
- [LLM Judge Evaluation](llm-judge.md) — judge mechanics: prompt construction, scoring, output format, error handling
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context for the judge
- [Script Extraction](script-extraction.md) — the `/script-extraction` skill: hardening skills by extracting mechanical steps into scripts
- [Test Harness README](../README.md) — prerequisites, setup, and running tests

---

**Next:** [Building Rubric Evals](rubric-evals-guide.md) — the full manual rubric-authoring and evaluation workflow.
**Related:** [Writing Agent Eval Rubrics](write-agent-eval-rubric.md) — the equivalent skill for agent-based rubric evals.
