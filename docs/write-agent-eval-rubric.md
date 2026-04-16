# Writing Agent Eval Rubrics

The `write-agent-eval-rubric` skill generates quality rubric files for LLM-judge evaluation of agent test suites. It interviews the user to collect categorized criteria and produces rubric markdown files under `tests/test-suites/{suite}/rubrics/`, then configures `llm-judge` expectations in `tests.json` for `agent-prompt` type tests.

## When to Use

Use this skill when you need to:

- Create a new quality rubric for an agent's agent-prompt tests
- Add `llm-judge` expectations to an existing agent test suite
- Update criteria in an existing agent rubric file

This skill produces **rubric files and llm-judge expectations only** — it does not generate agent-call tests. Use `write-acil-evals` for trigger accuracy testing.

## Usage

Invoke the skill with a `plugin:agent` argument:

```
/write-agent-eval-rubric r-and-d:gap-analyzer
```

If no argument is provided, the skill will ask which plugin:agent to write rubric evals for.

## What It Produces

The skill creates (or updates) a rubric file and configures llm-judge expectations:

```
tests/test-suites/{agent-name}/
  rubrics/
    {agent-name}-quality.md    # rubric file with categorized criteria
  tests.json                   # updated with llm-judge expectations
  prompts/                     # new prompt files if tests were created
    prompt-{name}.md
```

### Rubric file format

Rubric files use markdown with criteria organized into four categories:

```markdown
## Rubric: {agent-name} of {scaffold-name} scaffold

### Presence — things the {output-type} must identify
- The analysis identifies the missing authentication check in UsersController#create

### Specificity — the {output-type} must be concrete
- Each identified issue references a specific file name and line number

### Depth — the {output-type} must be actionable
- The authentication finding includes a suggested fix

### Absence — the {output-type} must not do these things
- The analysis does not hallucinate issues not present in the scaffold
```

If no scaffold is used, the title is formatted as `## Rubric: {agent-name} quality`.

When the agent writes output files to the filesystem, the rubric can include `## File:` sections after the transcript categories:

```markdown
## File: docs/gap-analysis.md
### Presence
- The analysis identifies the missing authentication middleware

### Depth
- The analysis includes a concrete migration plan
```

Each `## File:` section targets a specific output file path. Criteria categories within file sections are optional — only include the categories that have criteria. If the agent does not produce a referenced file, all criteria in that section auto-fail.

### llm-judge expectation format

Each llm-judge expectation in `tests.json` follows this format:

```json
{
  "llm-judge": {
    "rubricFile": "gap-analyzer-quality.md",
    "model": "opus",
    "threshold": 0.8
  }
}
```

- `rubricFile` — filename of the rubric in the suite's `rubrics/` directory (required)
- `model` — Claude model used to judge the output (default: `"opus"`)
- `threshold` — fraction of criteria that must pass for the expectation to pass (default: `0.8`)

### Test case format

Agent-prompt tests reference the agent via the `agentFile` field in `plugin:agent` format:

```json
{
  "name": "Agent Prompt: gap-analyzer quality",
  "type": "agent-prompt",
  "agentFile": "r-and-d:gap-analyzer",
  "promptFile": "prompt-gap-analysis.md",
  "model": "opus",
  "scaffold": "ruby-project",
  "expect": [
    { "llm-judge": { "rubricFile": "gap-analyzer-quality.md", "model": "opus", "threshold": 0.8 } }
  ]
}
```

## Workflow

The skill walks through a 12-step process:

1. **Identify the target agent** — parse the `plugin:agent` argument, read the agent's definition file, and detect whether the agent writes output files to the filesystem
2. **Locate and inspect the test suite** — read existing `tests.json`, rubrics, and scaffold files; detect create vs. update mode
3. **Determine test targets** — list agent-prompt tests to receive the rubric; optionally create new agent-prompt tests. When file output was detected, collect output file paths and update prompts to specify where files should be written
4. **Interview: Presence criteria** — things the output MUST identify or include
5. **Interview: Specificity criteria** — the output must reference concrete details (files, lines, methods)
6. **Interview: Depth criteria** — the output must be actionable (fixes, examples, reasoning)
7. **Interview: Absence criteria** — things the output must NOT do (hallucinations, incorrect claims)
8. **Interview: File output criteria** — when file output was detected, collect criteria for each output file across the four categories (each optional). Skipped when no file output is detected
9. **Configure llm-judge settings** — set model and threshold (defaults: opus, 0.8)
10. **Determine rubric filename** — default `{agent-name}-quality.md`, or use existing filename for updates
11. **Preview** — show rubric content (including `## File:` sections if applicable), tests.json changes, and new prompt files for confirmation
12. **Write files** — create or update rubric, tests.json, and prompt files

## Create vs. Update

- **New rubric**: Creates the rubric file, adds `llm-judge` expectations to selected tests, and optionally creates new agent-prompt test entries
- **Existing rubric**: Shows current criteria per category and asks the user what to add, modify, or remove. Never removes criteria without explicit confirmation.

## What to Do Next

After generating the rubric, you can:

1. **Run the tests** to produce output for the judge to evaluate:
   ```bash
   ./harness test-run --suite {agent-name}
   ```

2. **Evaluate results** including the llm-judge expectations:
   ```bash
   ./harness test-eval
   ```

3. **Inspect judge results** in `output/{run-id}/test-results.jsonl` — look for `llm-judge` rows (per-criterion pass/fail with reasoning) and `llm-judge-aggregate` rows (overall score vs. threshold).

4. **Iterate on criteria** — if criteria are too strict or too lenient, re-run `/write-agent-eval-rubric` to update them, then re-evaluate with `./harness test-eval <run-id>` (re-evaluates without re-running the test).

For details on how the llm-judge system works, see [LLM Judge Evaluation](llm-judge.md).

## References

- [Building Rubric Evals](rubric-evals-guide.md) — step-by-step guide covering the full workflow from writing rubrics to evaluating results
- [Test Suite Configuration](test-suite-configuration.md) — full tests.json field reference including the `llm-judge` expectation format and `agent-prompt` test type
- [LLM Judge Evaluation](llm-judge.md) — judge mechanics: prompt construction, scoring, output format, error handling
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context for the judge
- [Writing Skill Eval Rubrics](write-skill-eval-rubric.md) — the equivalent skill for skill-based rubric evals
- [Test Harness README](../README.md) — prerequisites, setup, and running tests
