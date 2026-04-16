# Sources

- `tests/docs/planning/evals/prd.md` — internal PRD identifying LLM-as-judge as the highest-priority eval gap
- `tests/docs/planning/evals/gap-analysis.md` — gap analysis comparing the harness to Anthropic's eval discipline
- [Anthropic: Develop Tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) — eval design principles, grading strategies, and rubric best practices
- [LangChain: Evaluating Skills](https://blog.langchain.com/evaluating-skills/) — validates scaffold-based constrained testing (buggy code > open-ended tasks); adds the principle that rubric criteria should reflect actual observed failure modes, not adversarial edge cases; validates tracing agent actions (transcript) as a requirement for meaningful evaluation

**Sources evaluated but not cited:**
- [Anthropic: Eval Tool](https://platform.claude.com/docs/en/test-and-evaluate/eval-tool) — covers the Console's UI-based eval tool; validates `{{variable}}` parameterized templates and 5-point quality scoring as useful future additions (both already in the internal PRD backlog), but doesn't change the current plan
- Anthropic "Complete Guide to Building Skills for Claude" (PDF) — could not be parsed; binary content unreadable by fetch tool

---

# Context

The test harness grades test expectations with code-based graders only (`result-contains`, `result-does-not-contain`, `skill-call`). These can't evaluate semantic quality — e.g., "does the code review call out the SQL injection on line 23?" This plan adds an `llm-judge` expectation type that evaluates a Claude skill output against a discrete rubric of criteria using a second Claude invocation in the Docker sandbox. The judge runs as a new step (`step-3b`) in the test-eval pipeline, after existing expectations are evaluated and before results are written.

---

# Decisions

- **Rubric format:** Discrete criteria as bullet points in a `.md` file. Each criterion gets its own pass/fail + reasoning.
- **Judge context:** Result text + scaffold file contents (read from repo at eval time) + transcript summary (tool name, key args, first 500 chars of result per call).
- **Pass threshold:** Configurable via optional `threshold` float (0.0–1.0, default 1.0). Specified per `llm-judge` expectation.
- **Output:** N criterion rows (`expect_type: 'llm-judge'`) + 1 aggregate row (`expect_type: 'llm-judge-aggregate'`) with `judge_threshold` and `judge_score` fields.
- **Judge location:** Docker sandbox — same `runInSandbox()` in `packages/cli`, invoked as `claude --print <prompt> --model <model>`. No skill plugin loaded.
- **Judge model:** Configurable per `llm-judge` expectation via `model` field. Passed directly to `--model` (same shortname pattern as existing tests: `'opus'`, `'sonnet'`). Defaults to `'opus'`.
- **Rubric file path:** `test-suites/{suite}/rubrics/{filename}.md`. Only the filename is specified in tests.json.
- **Architecture:** Pure data functions (`rubric-parser`, `judge-prompt-builder`) in `packages/data`. Judge orchestration (sandbox call, result parsing) in `packages/cli` as `step-3b`. `evaluateAllExpectations` stays sync and unchanged.
- **Wire-in point:** `commands/test-eval.ts` — the orchestrator loop, between `evaluateAllTests` (step-3) and `writeResults` (step-4).
- **tests.json format:** `llm-judge` expectations use the same `{ "llm-judge": { ... } }` shorthand as all other expectations (not a full `{ "type": "...", ... }` object). This is required by the existing `readTestSuiteConfig` parser.
- **Failure counting:** Only `llm-judge-aggregate` rows with `passed: false` count toward `totalFailures`. Per-criterion rows do not add to the failure count individually.

---

# tests.json Schema

All expectations in `tests.json` use the shorthand `{ "<type>": <value> }` format — the same pattern as `result-contains` and `skill-call`. The `llm-judge` value is an object with required `rubricFile` and optional `model`/`threshold`:

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

`model` defaults to `"opus"` if omitted. `threshold` defaults to `1.0` if omitted.

The config parser (`readTestSuiteConfig` in `config.ts`) converts this shorthand via `const [type, value] = Object.entries(e)[0]`, giving `type = "llm-judge"` and `value = { rubricFile, model?, threshold? }`. A new branch alongside the existing `skill-call` handler produces a typed `LlmJudgeExpectation`.

---

# Rubric File Format

Parser: extract all lines starting with `- ` as the criteria list, stripping the leading `- `.

---

## Criterion Types

The judge interprets each criterion from plain English — no special syntax is needed. But rubrics are most useful when they cover several distinct *types* of assertion. Based on the Anthropic eval sources and the use cases for skill testing:

| Type | What it checks | Example |
|------|---------------|---------|
| **Presence** | The output contains or identifies something specific | "The review identifies the SQL injection in users_controller.rb" |
| **Absence** | The output does not do something harmful or incorrect | "The review does not hallucinate issues that are not present in the scaffold" |
| **Specificity** | The output references concrete details (file, line, symbol) rather than vague generalities | "Each identified issue references a specific file name and line number" |
| **Completeness** | The output addresses all instances of something, not just one | "Every method with missing error handling is flagged, not just the first one found" |
| **Depth/quality** | The output goes beyond surface identification to explain or fix | "Each issue includes a concrete code fix, not just a description of the problem" |
| **Structure/format** | The output is organized in a required way | "Issues are grouped by severity (critical, major, minor)" |

Good rubrics mix these types. A rubric that only checks presence misses whether the output is actionable; one that only checks absence misses whether anything useful was produced at all. The Anthropic eval docs recommend making criteria *specific and measurable* — "the output mentions security" is weak; "the output identifies the missing `authenticate_user!` call in `UsersController#create`" is strong.

Two additional principles from the sources:

**Write criteria against observed failures, not adversarial scenarios.** (LangChain) If the `code-review` skill has historically missed N+1 queries but always catches SQL injection, your rubric should include an N+1 criterion. Don't invent failure modes the skill has never actually exhibited — that's adversarial, not representative.

**Constrain the scaffold, not the skill.** (LangChain) Rubric criteria are most reliable when the scaffold is specific: a file with a known bug on a known line. Open-ended scaffolds produce open-ended output that's hard to grade. "The review identifies the missing `before_action :authenticate_user!` in `UsersController`" is gradeable; "the review finds all security issues" is not.

---

## Simple Example

A rubric for the `gh-pr-description` skill — short, three criteria, no scaffold context needed:

`test-suites/gh-pr-description/rubrics/pr-description-quality.md`:
```markdown
## Rubric: PR description quality

- The description includes a summary section explaining what changed and why
- The description includes a test plan section with at least one verification step
- The description does not include filler phrases like "This PR" as the opening words
```

---

## Complex Example

A rubric for the `code-review` skill — multiple criterion types, tied to specific scaffold files and lines:

`test-suites/code-review/rubrics/ruby-project-review.md`:
```markdown
## Rubric: code-review of ruby-project scaffold

### Presence — things the review must identify
- The review identifies the missing authentication check in UsersController#create (users_controller.rb)
- The review identifies the N+1 query in PostsController#index where comments are loaded inside the posts loop (posts_controller.rb, around line 47)
- The review identifies the use of string interpolation in a SQL query in User.search (user.rb), flagging it as a SQL injection risk

### Specificity — the review must be concrete, not vague
- Each identified issue references the specific file name where the problem occurs
- The SQL injection finding names the vulnerable method (User.search) and explains why string interpolation in queries is dangerous

### Depth — the review must be actionable
- The authentication finding includes a suggested fix (e.g., adding a before_action or calling authenticate_user!)
- The N+1 finding includes a suggested fix using eager loading (e.g., includes(:comments))
- The SQL injection finding includes a suggested fix using parameterized queries or ActiveRecord query methods

### Absence — the review must not do these things
- The review does not flag the RSpec test files as having production code issues
- The review does not hallucinate security vulnerabilities that are not present in the scaffold
- The review does not recommend removing the rescue block in ApplicationController without justification
```

---

# Judge Prompt Structure

Built dynamically in the harness and passed to the sandbox via `--print`:

```
You are evaluating the output of a Claude Code skill run.

# Scaffold Files

### users_controller.rb
<file contents, truncated at 5KB per file>

### models/user.rb
<file contents, truncated at 5KB per file>

# Transcript

[Tool: Read] users_controller.rb
Result: class UsersController...

[Tool: Grep] pattern: "authenticate"
Result: (no matches)

[Tool: Edit] users_controller.rb
Old: def create\n  @user = User.new...
New: def create\n  authenticate_user!\n  @user = User.new...

# Final Skill Output

<Claude's ResultEvent.result text>

# Rubric Criteria

Evaluate each criterion below. Respond with ONLY a valid JSON object — no markdown, no explanation outside the JSON:

{
  "criteria": [
    { "criterion": "...", "passed": true, "reasoning": "..." },
    ...
  ]
}

Criteria:
1. The review identifies the missing authentication check in users_controller.rb
2. The review flags the N+1 query on line 47 of posts_controller.rb
3. Each issue includes a suggested fix, not just a description of the problem
4. The review does not hallucinate issues that don't exist in the scaffold
```

**Prompt size note:** Scaffold files are truncated at 5KB each; transcript results at 500 chars each. This keeps the judge prompt well within OS arg limits for `--print` (macOS ARG_MAX ~256KB).

---

# Output Schema (test-results.jsonl)

Extends existing `TestResultRecord` with optional fields:

```typescript
// Existing fields (unchanged):
test_run_id:  string
suite:        string
test_name:    string
expect_type:  string   // adds: 'llm-judge' | 'llm-judge-aggregate'
expect_value: string
passed:       boolean

// New optional fields (null/undefined for non-judge rows):
reasoning?:       string    // per-criterion explanation (llm-judge rows only)
judge_model?:     string    // model used (llm-judge + aggregate rows)
judge_threshold?: number    // threshold applied (aggregate row only)
judge_score?:     number    // passedCriteria/totalCriteria (aggregate row only)
```

**Example rows for a 4-criterion rubric with threshold 0.8 where 3/4 pass:**
```jsonl
{ "expect_type": "llm-judge", "expect_value": "The review identifies the missing auth check", "passed": true, "reasoning": "Line 42 explicitly mentions...", "judge_model": "opus" }
{ "expect_type": "llm-judge", "expect_value": "Each issue includes a suggested fix", "passed": false, "reasoning": "Issue 2 describes the N+1 but offers no fix", "judge_model": "opus" }
{ "expect_type": "llm-judge", "expect_value": "...", "passed": true, ... }
{ "expect_type": "llm-judge", "expect_value": "...", "passed": true, ... }
{ "expect_type": "llm-judge-aggregate", "expect_value": "rubric: code-review-quality.md", "passed": false, "judge_model": "opus", "judge_threshold": 0.8, "judge_score": 0.75 }
```

The aggregate `passed` = `judge_score >= judge_threshold`.

---

# Implementation Plan

## Step 1 — Types (`packages/data/src/types.ts`)

Add `LlmJudgeExpectation` to `TestExpectation` union:
```typescript
| { type: 'llm-judge'; rubricFile: string; model?: string; threshold?: number }
```

Extend `TestResultRecord` with optional fields:
```typescript
reasoning?:       string
judge_model?:     string
judge_threshold?: number
judge_score?:     number
```

## Step 2 — Rubric parser (`packages/data/src/rubric-parser.ts`) — new file

```typescript
export function parseRubricCriteria(markdown: string): string[]
// Extracts and returns lines that start with "- ", stripping the prefix
```

## Step 3 — Judge prompt builder (`packages/data/src/llm-judge-prompt.ts`) — new file

```typescript
export async function buildJudgePrompt(
  criteria: string[],
  resultText: string,
  scaffoldDir: string | null,
  events: StreamJsonEvent[]
): Promise<string>
```

Internal helpers:
- `readScaffoldFiles(dir)` — recursive `fs.readdir` + `fs.readFile`, skips `.git/`, truncates each file at 5KB, returns `Map<relativePath, content>`
- `formatTranscript(events)` — iterates events, pairs AssistantEvent tool_use requests with UserEvent tool_use_results; formats each as `[Tool: <name>] <key-args>\nResult: <first 500 chars>`

Imports `StreamJsonEvent` from `packages/data/src/types.ts`.

## Step 4 — Config parsing + validation (`packages/data/src/config.ts`)

Two changes needed:

**Parsing** — in `readTestSuiteConfig`, add an `llm-judge` branch in the expectation mapping alongside the existing `skill-call` handler:
```typescript
if (type === 'llm-judge') {
  const obj = value as Record<string, unknown>
  if (typeof obj.rubricFile !== 'string') {
    throw new Error(`llm-judge expectation missing required "rubricFile" string in test "${test.name}"`)
  }
  return {
    type: 'llm-judge',
    rubricFile: obj.rubricFile,
    model: typeof obj.model === 'string' ? obj.model : undefined,
    threshold: typeof obj.threshold === 'number' ? obj.threshold : undefined,
  } as TestExpectation
}
```

**Validation** — add a `validateRubrics(testSuiteDir, config)` function following the same pattern as `validateScaffolds`:
- For each test expectation with `type: 'llm-judge'`, resolve `path.join(testSuiteDir, 'rubrics', expectation.rubricFile)`
- Call `existsSync` — throw if not found
- Call this alongside `validateScaffolds` in the test runner setup

## Step 5 — LLM judge step (`packages/cli/src/test-eval-steps/step-3b-evaluate-llm-judges.ts`) — new file

```typescript
export async function evaluateLlmJudges(
  testConfigs: TestConfigRecord[],
  eventsByTestCase: Map<string, StreamJsonEvent[]>,
  testRunId: string,
  debug: boolean
): Promise<TestResultRecord[]>
```

Flow:
1. Filter to test configs that have at least one `llm-judge` expectation in `config.test.expect`
2. For each matching config:
   - Get events: `eventsByTestCase.get(buildTestCaseId(config.suite, config.test.name))`
   - Compute `suiteDir = getTestSuiteDir(config.suite)` (existing function in `paths.ts`)
   - For each `llm-judge` expectation in `config.test.expect`:
     a. Read rubric: `await readFile(path.join(suiteDir, 'rubrics', expectation.rubricFile), 'utf8')`
     b. Parse criteria: `parseRubricCriteria(rubricMarkdown)`
     c. Extract result text: `getResultText(events)`
     d. Compute scaffold dir: `config.test.scaffold ? path.join(suiteDir, 'scaffolds', config.test.scaffold) : null`
     e. Build judge prompt: `await buildJudgePrompt(criteria, resultText, scaffoldDir, events)`
     f. Run judge: `runInSandbox(['--no-session-persistence', '--output-format', 'stream-json', '--model', expectation.model ?? 'opus', '--print', judgePrompt], null, debug)` — note: no `--verbose` flag (unlike prompt runner; we only need the result text) and no `--plugin-dir` args (ensuring no skill is loaded)
     g. Parse judge result: `JSON.parse(getResultText(parseStreamJsonLines(captured)))` → `{ criteria: [...] }`
     h. Compute `score = passedCount / criteria.length`
     i. Compute `threshold = expectation.threshold ?? 1.0`
     j. Build N criterion records + 1 aggregate record
3. Return all records as a flat `TestResultRecord[]`

Error handling: if JSON parse fails or sandbox exits with error, return all criteria as `passed: false` with `reasoning: "judge evaluation failed: <error message>"` and aggregate `passed: false`.

## Step 6 — Wire into orchestrator (`packages/cli/src/commands/test-eval.ts`)

Add `--debug` as a boolean yargs option in `builder`:
```typescript
.option('debug', { type: 'boolean', default: false, describe: 'Enable debug output' })
```

Read it in `handler`: `const debug = argv.debug as boolean`

Updated per-run loop (replacing the existing `evaluateAllTests` + `writeResults` calls):
```typescript
const { results, totals, failures } = await evaluateAllTests(testConfigs, eventsByTestCase, id)
const judgeResults = await evaluateLlmJudges(testConfigs, eventsByTestCase, id, debug)
const judgeFailures = judgeResults.filter(r => r.expect_type === 'llm-judge-aggregate' && !r.passed).length
await writeResults(runDir, [...results, ...judgeResults])
printTotals(totals.totalDurationMs, totals.totalInputTokens, totals.totalOutputTokens, id)
totalFailures += failures + judgeFailures
```

**Note:** Judge token usage/cost is not captured in `totals` — the judge runs a separate sandbox invocation outside the `evaluateAllTests` metrics path. This is a known limitation; tracking is a future improvement.

## Step 7 — Docs (`tests/docs/parquet-schema.md`)

Document the four new nullable columns in `test-results.parquet`: `reasoning`, `judge_model`, `judge_threshold`, `judge_score`.

## Step 8 — First rubric (`test-suites/code-review/rubrics/code-review-quality.md`) — new file

Write concrete criteria for the `code-review` skill based on the existing ruby-project scaffold. Add an `llm-judge` expectation to an existing prompt test in `test-suites/code-review/tests.json`.

---

# Critical Files

| File | Change |
|------|--------|
| `tests/packages/data/src/types.ts` | Add `LlmJudgeExpectation` to union; extend `TestResultRecord` with 4 optional fields |
| `tests/packages/data/src/rubric-parser.ts` | **New** — parse bullet criteria from markdown |
| `tests/packages/data/src/llm-judge-prompt.ts` | **New** — async prompt builder, transcript formatter, scaffold reader |
| `tests/packages/data/src/config.ts` | Parse `llm-judge` shorthand → `LlmJudgeExpectation`; add `validateRubrics()` alongside `validateScaffolds()` |
| `tests/packages/cli/src/test-eval-steps/step-3b-evaluate-llm-judges.ts` | **New** — judge orchestration: sandbox call, JSON parse, return records |
| `tests/packages/cli/src/commands/test-eval.ts` | Add `--debug` flag; call `evaluateLlmJudges`; merge records before `writeResults` |
| `tests/test-suites/code-review/rubrics/code-review-quality.md` | **New** — first rubric |
| `tests/test-suites/code-review/tests.json` | Add `llm-judge` expectation to a test case |
| `tests/docs/parquet-schema.md` | Document new columns |

**Reuse (no changes needed to these):**
- `runInSandbox()` — `tests/packages/cli/src/lib/sandbox.ts`
- `getResultText()`, `parseStreamJsonLines()` — `tests/packages/data/src/stream-parser.ts`
- `writeResults()` — `tests/packages/cli/src/test-eval-steps/step-4-write-results.ts`
- `buildTestCaseId()` — `tests/packages/data/src/config.ts`
- `getTestSuiteDir(suite)` — `tests/packages/cli/src/paths.ts`

**Not changed:**
- `packages/data/src/expectations.ts` — stays sync, untouched
- `packages/data/src/jsonl-writer.ts` — optional fields serialize naturally with `JSON.stringify`

---

# Verification

1. Create `test-suites/code-review/rubrics/code-review-quality.md` with 3–5 criteria matched to the ruby-project scaffold
2. Add an `llm-judge` expectation to a prompt test in `test-suites/code-review/tests.json`
3. Run the test: `./harness test-run --suite code-review --test "Prompt: /code-review quality"`
4. Run the eval: `./harness test-eval --test-run-id <runId>`
5. Inspect `output/{runId}/test-results.jsonl` — verify N criterion rows + 1 aggregate row with correct `expect_type`, `reasoning`, `judge_model`, `judge_threshold`, `judge_score`
6. Write a rubric criterion that should fail (e.g., a hallucination check for a non-existent issue) — confirm `passed: false` with meaningful reasoning
7. Run `make analytics` — confirm new columns appear in `test-results.parquet` and non-judge rows have null values for the new columns
