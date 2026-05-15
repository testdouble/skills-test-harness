# LLM Judge Evaluation

> **Tier 4 · Skill/agent authors tuning quality evals, plus contributors.** This is the mechanics reference for the `llm-judge` expectation — the rubric format, scoring model, judge prompt construction, and result fields. Read [Building Rubric Evals](rubric-evals-guide.md) first if you haven't written a rubric yet.

Use the `llm-judge` expectation to score skill or agent output against a rubric of discrete criteria with a second Claude invocation. This page documents how to configure the expectation, the rubric file format and criterion types, how the judge prompt is built and scored, the result rows it writes, error handling, and prompt size limits.

The LLM judge extends the test harness beyond code-based assertions (`result-contains`, `skill-call`) to support semantic quality evaluation — e.g., "does the code review call out the SQL injection on line 23?"

The judge runs as step 3b in the `test-eval` pipeline, after existing expectations are evaluated and before results are written.

## Configuration

### tests.json

Add an `llm-judge` expectation to any skill-prompt or agent-prompt test:

```json
{
  "name": "Prompt: /code-review quality",
  "type": "skill-prompt",
  "promptFile": "prompt-code-review.md",
  "scaffold": "ruby-project",
  "expect": [
    { "result-contains": "# Code Review" },
    { "llm-judge": { "rubricFile": "code-review-quality.md", "model": "opus", "threshold": 0.8 } }
  ]
}
```

Agent-prompt tests use the same `llm-judge` expectation format:

```json
{
  "name": "Agent Prompt: gap-analyzer quality",
  "type": "agent-prompt",
  "agentFile": "r-and-d:gap-analyzer",
  "promptFile": "prompt-gap-analysis.md",
  "scaffold": "ruby-project",
  "expect": [
    { "llm-judge": { "rubricFile": "gap-analyzer-quality.md", "model": "opus", "threshold": 0.8 } }
  ]
}
```

### Options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `rubricFile` | string | yes | — | Filename of the rubric in the suite's `rubrics/` directory |
| `model` | string | no | `"opus"` | Claude model used as the judge (`"opus"`, `"sonnet"`) |
| `threshold` | number | no | `1.0` | Fraction of criteria that must pass (0.0–1.0) for the expectation to pass |

### Validation

At test suite load time, the harness validates that every referenced rubric file exists at `test-suites/{suite}/rubrics/{rubricFile}`. Missing rubric files cause an immediate error.

## Rubric Files

### Location

```
tests/test-suites/{suite}/rubrics/{filename}.md
```

### Format

Rubric files are markdown. The parser extracts all lines starting with `- ` as criteria, stripping the prefix. Headings and other markdown are ignored by the parser but useful for organization.

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

### File Output Sections

When a skill or agent writes files to the filesystem, the rubric can include `## File:` sections to evaluate those files separately from the transcript output:

```markdown
## File: docs/gap-analysis.md
### Presence
- The analysis identifies the missing authentication middleware

### Depth
- The analysis includes a concrete migration plan
```

Each `## File:` section targets a specific output file path. Within a file section, criteria use the same four categories (Presence, Specificity, Depth, Absence) — but each category is optional. Empty categories are omitted rather than shown with zero bullets.

File sections appear after the transcript-scoped sections. The rubric parser (`parseRubricSections`) produces `RubricSection` objects with `type: 'transcript'` for standard criteria and `type: 'file'` with a `filePath` for file-scoped criteria.

**Auto-fail behavior:** If the agent does not produce an output file referenced by a `## File:` section, all criteria in that section automatically fail with reasoning "Output file was not produced by the agent." These auto-failed criteria are not sent to the judge — they bypass the LLM invocation entirely. If all criteria in the rubric are auto-failed (every file is missing), the judge is not invoked at all.

### Criterion Types

Good rubrics mix several types of assertion:

| Type | What it checks | Example |
|------|---------------|---------|
| **Presence** | Output identifies something specific | "The review identifies the SQL injection in users_controller.rb" |
| **Specificity** | Output references concrete details (file, line, symbol) | "Each issue references a specific file name and line number" |
| **Depth** | Output is actionable — explains or fixes | "Each issue includes a concrete code fix" |
| **Absence** | Output avoids something harmful or incorrect | "The review does not hallucinate issues not in the scaffold" |
| **Completeness** | Output addresses all instances, not just one | "Every method with missing error handling is flagged" |
| **Structure** | Output is organized in a required way | "Issues are grouped by severity" |

### Writing Good Criteria

**Write criteria against observed failures, not adversarial scenarios.** If the skill historically misses N+1 queries but always catches SQL injection, include an N+1 criterion. Don't invent failure modes the skill has never exhibited.

**Constrain the scaffold, not the skill.** Criteria are most reliable when the scaffold is specific — a file with a known bug on a known line. "The review identifies the missing `before_action :authenticate_user!` in `UsersController`" is gradeable. "The review finds all security issues" is not.

**Make criteria specific and measurable.** "The output mentions security" is weak. "The output identifies the missing `authenticate_user!` call in `UsersController#create`" is strong.

## How the Judge Works

### Judge Prompt

The harness builds a prompt for the judge Claude invocation containing:

1. **Scaffold files** — all files from the test's scaffold directory (each truncated at 5KB), giving the judge the same source material the skill worked with
2. **Transcript** — a summary of tool calls made during the skill or agent run (tool name, key arguments, first 2000 chars of each result)
3. **Final output** — the result text from the skill or agent run
4. **Output file content** — content of files the skill/agent wrote to the filesystem, included only when the rubric has `## File:` sections and the corresponding files exist in `output-files.jsonl` (matched by `buildTestCaseId(suite, test.name)`, not raw `test.name`)
5. **Rubric criteria** — numbered list of criteria with instructions to respond as JSON. File-scoped criteria are prefixed with `[File: path]` to give the judge context about which file to evaluate

For skill-prompt tests, the judge prompt header describes the output as a "skill run." For agent-prompt tests, the header describes it as an "agent run," giving the judge appropriate context about the execution model.

The judge is asked to respond with a JSON object:

```json
{
  "criteria": [
    { "criterion": "The review identifies...", "passed": true, "reasoning": "Line 42 mentions..." },
    { "criterion": "Each issue includes...", "passed": false, "reasoning": "Issue 2 has no fix" }
  ]
}
```

### Execution

The judge runs as a separate Claude invocation inside the Docker sandbox using `--print` mode. No skill plugins are loaded — the judge evaluates output only, it does not run the skill.

### Scoring

- **Score** = number of passing criteria / total criteria (0.0–1.0)
- **Passed** = score >= threshold
- A threshold of `0.8` with 10 criteria means at least 8 must pass

## Output

### test-results.jsonl

The judge writes two types of rows to `test-results.jsonl`:

**Per-criterion rows** (`expect_type: "llm-judge"`):

```jsonl
{ "expect_type": "llm-judge", "expect_value": "The review identifies the missing auth check", "passed": true, "reasoning": "Line 42 explicitly mentions...", "judge_model": "opus", "rubric_file": "code-review-quality.md" }
```

| Field | Description |
|-------|-------------|
| `expect_type` | `"llm-judge"` |
| `expect_value` | The criterion text |
| `passed` | Whether the judge determined this criterion was met |
| `reasoning` | The judge's explanation |
| `judge_model` | Model used for judging |
| `rubric_file` | Source rubric filename |

**Aggregate row** (`expect_type: "llm-judge-aggregate"`):

```jsonl
{ "expect_type": "llm-judge-aggregate", "expect_value": "code-review-quality.md", "passed": false, "judge_model": "opus", "judge_threshold": 0.8, "judge_score": 0.75, "rubric_file": "code-review-quality.md" }
```

| Field | Description |
|-------|-------------|
| `expect_type` | `"llm-judge-aggregate"` |
| `expect_value` | Rubric filename |
| `passed` | Whether `score >= threshold` |
| `judge_model` | Model used for judging |
| `judge_threshold` | The configured threshold |
| `judge_score` | Fraction of criteria that passed (0.0–1.0) |
| `rubric_file` | Source rubric filename |

### Failure Counting

Only `llm-judge-aggregate` rows with `passed: false` count toward test failures. Per-criterion rows do not add to the failure count individually — they provide diagnostic detail.

### Console Output

During evaluation, the judge prints progress:

```
Running LLM judge (opus) for "Prompt: /code-review quality" with 9 criteria...
  - [PASS] llm-judge "The review identifies the missing auth check..."
  - [FAIL] llm-judge "Each issue includes a suggested fix..."
  - [PASS] llm-judge-aggregate score=0.75 threshold=0.80
```

## Error Handling

If the judge invocation fails (sandbox error, invalid JSON response, file read error), the harness:

- Logs a warning: `⚠ LLM judge evaluation failed: {error}`
- Returns a single aggregate row with `passed: false`, `judge_score: 0`, and the error message in `reasoning`
- Per-criterion rows are not generated for failed evaluations

## Usage

### Running Tests with Judge Evaluation

```bash
# Run the test suite to produce output
./harness test-run --suite code-review

# Evaluate all expectations including llm-judge
./harness test-eval

# Evaluate a specific run
./harness test-eval <run-id>

# Evaluate with debug output (shows sandbox stderr)
./harness test-eval <run-id> --debug
```

### Re-evaluating After Rubric Changes

Since `test-eval` re-evaluates from stored test output, you can edit a rubric file and re-run evaluation without re-running the test:

```bash
# Edit the rubric
vim tests/test-suites/code-review/rubrics/code-review-quality.md

# Re-evaluate the same run
./harness test-eval <run-id>
```

### Inspecting Results

```bash
# View all judge results for a run
cat tests/output/<run-id>/test-results.jsonl | grep llm-judge

# View only failures
cat tests/output/<run-id>/test-results.jsonl | grep llm-judge | grep '"passed":false'

# View aggregate scores
cat tests/output/<run-id>/test-results.jsonl | grep llm-judge-aggregate
```

## Prompt Size Limits

The judge prompt has built-in truncation to stay within OS argument limits (macOS ARG_MAX ~256KB):

- Scaffold files: 5KB per file
- Transcript tool results: 2000 chars per result
- Edit tool results: 250 chars each for old/new text

## Known Limitations

- **Token usage not tracked**: Judge invocations run outside the test metrics path. Token costs from judge runs are not included in test run totals.
- **No per-criterion failure counting**: Only the aggregate row affects the test pass/fail total. Individual criterion failures are informational only.
- **Single model per expectation**: Each `llm-judge` expectation uses one model. To compare judge models, add separate expectations with different `model` values.

## Related References

- [Building Rubric Evals](rubric-evals-guide.md) — step-by-step guide covering the full workflow from writing rubrics to evaluating results
- [Test Suite Configuration](test-suite-reference.md) — full tests.json field reference including the `llm-judge` expectation format
- [Writing Skill Eval Rubrics](write-skill-eval-rubric.md) — using the `/write-skill-eval-rubric` skill to generate rubric files for skills
- [Writing Agent Eval Rubrics](write-agent-eval-rubric.md) — using the `/write-agent-eval-rubric` skill to generate rubric files for agents
- [Test Harness README](../README.md) — prerequisites, setup, and running tests
- [Test Scaffolding](test-scaffolding.md) — how scaffolds provide project context for the judge
- [Parquet Schema](parquet-schema.md) — analytics fields for judge results (`reasoning`, `judge_model`, `judge_threshold`, `judge_score`)
- [Docker Integration](docker-integration.md) — `runInSandbox` API used to execute judge invocations
- [Evals Package](evals.md) — Package containing the LLM judge implementation, boolean evals, and evaluation orchestrator
- [Claude Integration](claude-integration.md) — `runClaude()` wrapper used to invoke the judge model

---

**Next:** [Building Rubric Evals](rubric-evals-guide.md) — write a rubric and run judge evaluation end to end.
**Related:** [Parquet Schema](parquet-schema.md) — the analytics fields judge results land in.
