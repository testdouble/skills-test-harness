# Evals Package

The `@testdouble/harness-evals` package (`packages/evals`) contains the evaluation logic for the test harness. It scores test run results against expectations, producing structured pass/fail records for both deterministic boolean checks and semantic LLM judge assessments.

- **Last Updated:** 2026-03-28
- **Package:** `@testdouble/harness-evals` (workspace package, not published)
- **Runtime:** TypeScript on Bun, ESNext target, strict mode
- **Tests:** Vitest (co-located `.test.ts` files)

## Purpose

After the `test-run` pipeline executes prompts inside Docker sandboxes and writes JSONL event streams, the evals package reads those streams and scores each test case's expectations. It serves two consumers:

1. **`test-eval` command** -- Evaluates all expectations (boolean + LLM judge) for a completed test run and converts results into `TestResultRecord` entries written to `test-results.jsonl`.
2. **SCIL improvement loop (`step-5-run-eval`)** -- Uses `evaluateSkillCall` directly to check whether a specific skill was invoked during a prompt execution.
3. **ACIL improvement loop (`step-5-run-eval`)** -- Uses `evaluateAgentCall` directly to check whether a specific agent was invoked during a prompt execution.

## Architecture

```
index.ts                  -- Public barrel export
src/
  types.ts                -- EvalResult, BooleanEvalResult, LlmJudgeEvalResult, progress events
  boolean-evals.ts        -- Deterministic expectation evaluators
  rubric-parser.ts        -- Parses rubric markdown into RubricSection objects (transcript + file sections)
  llm-judge-prompt.ts     -- Builds the prompt sent to the judge model (including output file content)
  llm-judge-eval.ts       -- Orchestrates LLM judge evaluation (with auto-fail for missing files)
  evaluate.ts             -- Top-level evaluateTestRun() orchestrator
  boolean-evals.test.ts   -- Unit tests for boolean evaluators
  rubric-parser.test.ts   -- Unit tests for rubric section parsing
  llm-judge-eval.test.ts  -- Unit tests for LLM judge evaluation
```

### Dependencies

| Dependency | Usage |
|---|---|
| `@testdouble/harness-data` | JSONL I/O, stream event types, config records, `getResultText`, `getSkillInvocations`, `getAgentInvocations`, `parseStreamJsonLines`, `readJsonlFile`, `buildTestCaseId` |
| `@testdouble/claude-integration` | `runClaude()` for invoking the judge model |

## Evaluation Types

### Boolean Evaluations (`boolean-evals.ts`)

Four deterministic evaluators that check test run event streams without any LLM calls:

| Expectation Type | Function | Behavior |
|---|---|---|
| `result-contains` | `evaluateResultContains` | Passes when the final result text includes the expected string (case-sensitive) |
| `result-does-not-contain` | `evaluateResultDoesNotContain` | Passes when the final result text does not include the expected string |
| `skill-call` | `evaluateSkillCall` | Passes when the skill invocation list matches the expected presence/absence of a skill file |
| `agent-call` | `evaluateAgentCall` | Passes when the agent invocation list matches the expected presence/absence of an agent type |

All four return `false` when no result event exists in the stream (except `evaluateSkillCall`/`evaluateAgentCall` with `shouldBeCalled: false`, which return `true` for empty events).

`evaluateAllExpectations` filters out `llm-judge` expectations and maps the remainder through `evaluateExpectation`, returning an array of `ExpectationResult` records.

### LLM Judge Evaluation (`llm-judge-eval.ts`)

Semantic evaluation that sends skill output to a second Claude model for rubric-based scoring:

1. Reads the rubric markdown file from the suite's `rubrics/` directory.
2. Parses rubric sections using `parseRubricSections` — produces `RubricSection` objects with `type: 'transcript'` for standard criteria and `type: 'file'` with a `filePath` for file-scoped criteria.
3. Loads output files from `output-files.jsonl` in the run directory, matching records by `buildTestCaseId(suite, test.name)` (only when the rubric contains file sections).
4. Builds a judge prompt containing scaffold files (if any), a conversation transcript, the final skill output, output file content (for file-scoped sections), and the numbered rubric criteria. File-scoped criteria for missing files are separated as auto-fails.
5. Invokes `runClaude()` with the specified model (default: `opus`) and parses the JSON response. If all criteria are auto-fails, the judge is not invoked.
6. Merges judge results with auto-fail results. Scores each criterion as passed (1.0), partial (0.5), or failed (0.0). Computes an aggregate score as `passedCount / totalCriteria`.
7. Compares the aggregate score against the threshold (default: `1.0`) to determine overall pass/fail.

Error handling wraps each judge evaluation in a try/catch. Failures (rubric not found, sandbox timeout, malformed judge response) produce a result with `status: 'infrastructure-error'` rather than crashing the pipeline.

### Rubric Parser (`rubric-parser.ts`)

Parses rubric markdown into structured `RubricSection` objects. Each section has a `type` (`'transcript'` or `'file'`) and a `criteria` array of bullet-point strings. File sections also carry a `filePath` string.

The parser splits on `## File: {path}` headers — everything before the first file header is a transcript section, and each file header starts a new file section. Within each section, lines starting with `- ` are extracted as criteria. Headings other than `## File:` are ignored.

A backward-compatible `parseRubricCriteria` function flattens all sections into a single criteria list. Returns an empty array for rubrics with no bullet lines, which triggers an `infrastructure-error` in the judge evaluator.

### Judge Prompt Builder (`llm-judge-prompt.ts`)

Constructs a multi-section prompt for the judge model:

1. **System framing** -- "You are evaluating the output of a Claude Code skill run." (or "agent run" for agent-prompt tests).
2. **Scaffold files** -- If the test uses a scaffold directory, recursively reads all files (up to 5 KB each) and includes them as named sections.
3. **Transcript** -- Formats tool-use events from the stream as `[Tool: name] args` with truncated results (500 chars max), giving the judge visibility into intermediate steps.
4. **Final skill output** -- The complete result text.
5. **Output file content** -- For each `## File:` section in the rubric whose file exists in `output-files.jsonl`, the file content is injected as a named section (`# Output File: {path}`). Missing files are excluded and their criteria are auto-failed.
6. **Rubric criteria** -- Numbered criteria list with JSON response format instructions. File-scoped criteria are prefixed with `[File: path]`. Auto-failed criteria (missing files) are excluded from the judge prompt.

The function returns both the prompt string and an `autoFailCriteria` array. Auto-failed criteria bypass the judge entirely — they are merged into the final results with `passed: false` and reasoning "Output file was not produced by the agent."

## Top-Level Orchestrator (`evaluate.ts`)

`evaluateTestRun` is the main entry point consumed by the `test-eval` command:

1. Reads `test-config.jsonl` and `test-run.jsonl` from the run directory.
2. Validates compatibility (events must have `test_case` fields; older runs without this field are rejected with a descriptive error).
3. Groups events by test case ID.
4. For each test case, evaluates boolean expectations first, then LLM judge expectations.
5. Emits progress events via the optional `onProgress` callback for real-time CLI output.
6. Returns all `EvalResult` records (both `BooleanEvalResult` and `LlmJudgeEvalResult`).

## Type System (`types.ts`)

### Result Types

- **`EvalResult`** -- Union of `BooleanEvalResult | LlmJudgeEvalResult`.
- **`BooleanEvalResult`** -- Contains `kind: 'boolean'`, test identifiers, expectation type/value, pass/fail, and status.
- **`LlmJudgeEvalResult`** -- Contains `kind: 'llm-judge'`, test identifiers, judge model, aggregate score and threshold, rubric file path, and an array of `LlmJudgeCriterionResult` entries.
- **`LlmJudgeCriterionResult`** -- Per-criterion result with `passed`, optional `confidence: 'partial'`, and `reasoning`.

### Progress Events

- **`EvalProgressEvent`** -- Union type for `eval-start`, `eval-complete`, and `eval-error` events, consumed by CLI progress logging.
- **`OnProgress`** -- Callback type `(event: EvalProgressEvent) => void`.

### Status Values

All results carry a `status` field:

- `'evaluated'` -- Normal evaluation completed.
- `'infrastructure-error'` -- Evaluation failed due to environment issues (missing rubric, sandbox timeout, parse failure). The result includes `error_message` and `passed: false`.

## Related Documentation

- [Test Harness Architecture](./test-harness-architecture.md) — System architecture, package boundaries, and dependency graph
- [Execution Package](./execution.md) — The `runTestEval()` orchestrator that consumes `evaluateTestRun()`, the SCIL loop that uses `evaluateSkillCall` directly, and the ACIL loop that uses `evaluateAgentCall` directly
- [CLI Package](./cli.md) — Thin Yargs wrapper that delegates to the execution package
- [Data Package](./data.md) — Shared data layer providing JSONL I/O, stream event types, config records, and `getResultText`/`getSkillInvocations`
- [Claude Integration](./claude-integration.md) — `runClaude()` used to invoke the judge model inside the Docker sandbox
- [LLM Judge Evaluation](./llm-judge.md) — Detailed judge mechanics: prompt construction, scoring, output format, and error handling
- [Test Suite Configuration](./test-suite-configuration.md) — `tests.json` field reference including `llm-judge` and `skill-call` expectation formats
- [Parquet Schema](./parquet-schema.md) — Analytics schema for evaluation results stored as Parquet
- [Building Rubric Evals](./rubric-evals-guide.md) — Step-by-step guide to writing and running LLM-judge quality evals
- [Building SCIL Evals](./scil-evals-guide.md) — Step-by-step guide to writing and running trigger accuracy evals
- [Agent Call Improvement Loop](./agent-call-improvement-loop.md) — ACIL mechanics: agent detection, temp plugin isolation, holdout splits, scoring
- [Writing Agent-Call Evals](./write-acil-evals.md) — Skill for generating agent-call test suites
