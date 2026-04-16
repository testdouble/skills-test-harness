# PRD: Test Harness Eval Gaps

**Source documents:**
- [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — Anthropic Engineering Blog
- [Claude Console Evaluation Tool](https://platform.claude.com/docs/en/test-and-evaluate/eval-tool) — Anthropic Platform Docs
- [Define Success Criteria and Build Evaluations](https://platform.claude.com/docs/en/test-and-evaluate/define-success) — Anthropic Platform Docs
- [Gap Analysis](./gap-analysis.md) — this repository

---

## Problem Statement

The test harness runs skills inside Docker, captures full stream-JSON transcripts, evaluates four assertion types, and trends metrics over time in Parquet. It is a solid execution and assertion layer. However, it lacks the grading sophistication, statistical stability, and review tooling needed to reliably measure AI skill quality at the level a mature eval discipline requires.

Substring matching cannot evaluate freeform output quality — skills like `/code-review`, `/investigate`, or `/project-documentation` produce prose that is either right or wrong in ways no keyword check can capture. Single-run results are statistically unreliable; because Claude is non-deterministic, a test can pass or fail due to chance rather than actual skill quality. And transcript review requires manually reading raw JSONL files, which makes it impractical to validate whether graders are accurately measuring what matters or to distinguish agent failures from grader failures.

The [gap analysis](./gap-analysis.md) identifies 13 gaps between the current harness and the eval discipline described across three Anthropic sources. This PRD proposes closing the highest-leverage gaps first, then layering in medium-priority capabilities, while explicitly deferring lower-severity or out-of-scope concerns.

---

## Solution

Enhance the harness with the three highest-leverage capabilities from the gap analysis: LLM-as-judge graders, trial repetition with pass@k / pass^k metrics, and a transcript viewer in the web UI. Once those are in place, layer in medium-priority gaps: partial credit scoring, eval tagging (capability vs. regression), saturation detection, parameterized prompt templates, and human quality rating. Defer low-severity and out-of-scope items explicitly.

This staged approach reflects the dependency structure: the transcript viewer is most valuable after LLM judging is in place (reviewers need to see transcript content alongside judge reasoning to calibrate), and saturation detection is most meaningful after tagging separates capability from regression evals.

The solution draws directly from patterns described in [Demystifying Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#three-grader-types), [Define Success Criteria](https://platform.claude.com/docs/en/test-and-evaluate/define-success), and the [Console Eval Tool](https://platform.claude.com/docs/en/test-and-evaluate/eval-tool). The harness and the Console Eval Tool are complementary: the Console excels at rapid prompt iteration for single-turn quality; this harness excels at agentic integration testing across model versions over time. Capabilities borrowed from the Console (LLM judges, human rating, parameterized prompts) adapt those patterns to the agentic execution context.

---

## User Stories

### LLM-as-Judge Grader (Gap 1)

1. As a skill author, I want to write an eval expectation as a natural-language rubric, so that I can evaluate freeform skill output quality without relying on substring matching.
2. As a skill author, I want the LLM judge to use chain-of-thought reasoning before rendering a verdict, so that I can review its reasoning when calibrating the rubric.
3. As a skill author, I want the judge's reasoning to be stored alongside the pass/fail result, so that I can audit why a test passed or failed after the fact.
4. As a skill author, I want the LLM judge to use a different model than the one being evaluated, so that self-serving bias is reduced in grading.
5. As a skill author, I want LLM judge verdicts to be treated the same as other expectation results in pass/fail aggregation, so that CI gates work uniformly.
6. As a harness maintainer, I want a per-expectation judge cost column in the results data, so that I can track total eval cost including grading overhead.
7. As a harness maintainer, I want the `ANTHROPIC_API_KEY` required for judge calls to be read from the host environment, so that no secrets are bundled into the Docker container.
8. As a harness maintainer, I want the LLM judge grader to be testable in isolation with a known rubric and known outputs, so that I can verify the grader logic independently of skill execution.
9. As a reviewer, I want to see the judge's reasoning alongside the transcript in the web UI, so that I can validate whether the rubric is producing intended results.
10. As a CI operator, I want LLM judge failures to cause the same non-zero exit behavior as code-based grader failures, so that quality regressions are caught in CI.

### Trial Repetition and pass@k / pass^k (Gap 2)

11. As a skill author, I want to run a test case multiple times in a single harness invocation, so that I get statistically stable pass rates rather than a single sample from a non-deterministic system.
12. As a skill author, I want to see a pass@k metric per test case, so that I can understand the probability of at least one success across k attempts.
13. As a skill author, I want to see a pass^k metric per test case, so that I can understand whether a skill is reliably correct every time.
14. As a skill author, I want to configure the number of trials per test case, so that I can trade off cost vs. stability based on how critical the test is.
15. As a harness maintainer, I want trial results stored individually in the results data, so that I can compute pass@k and pass^k from raw data rather than only from aggregated summaries.
16. As a harness maintainer, I want the trial repetition loop to be testable with a deterministic mock executor, so that I can verify pass@k / pass^k calculations against hand-computed examples.
17. As a CI operator, I want to configure whether CI gates on pass@k or pass^k, so that I can require "always passes" behavior for regression tests and "sometimes passes" for capability exploration.

### Transcript Viewer (Gap 10)

18. As a reviewer, I want to browse the full conversation transcript — tool calls, Claude's reasoning, and intermediate outputs — from the web UI, so that I do not need to manually read raw JSONL files.
19. As a reviewer, I want to see the transcript alongside the expectation results for a test run, so that I can diagnose whether a failure was caused by an agent mistake or a grader flaw.
20. As a reviewer, I want to navigate between test cases in a run from the transcript view, so that I can efficiently review multiple transcripts in sequence.
21. As a harness maintainer, I want the transcript viewer to be integration-tested against a known JSONL fixture, so that regressions in rendering are caught.

### Partial Credit / Scoring Continuums (Gap 4)

22. As a skill author, I want to write an llm-judge rubric that asks for a numeric score, so that I can represent partial success for multifaceted tasks without a separate expectation type.
23. As a skill author, I want the LLM judge to return a score on a rubric-defined scale, so that I can distinguish "completely wrong" from "partially right" from "correct."
24. As a harness maintainer, I want the results schema to include a `score` field alongside the boolean `passed` field, so that partial credit from llm-judge rubrics is preserved in historical analytics.
25. As a reviewer, I want to see score distributions in the analytics view, so that I can track whether a skill is improving incrementally even when it has not crossed the pass threshold.

### Eval Tagging: Capability vs. Regression (Gap 9)

26. As a skill author, I want to set the existing `type` field to `capability` or `regression` on a test case, so that I can use the harness for exploratory "can we get here?" tracking without triggering CI failures.
27. As a CI operator, I want capability evals to be excluded from CI gate failures, so that a failing capability test does not block a merge.
28. As a CI operator, I want regression evals to gate CI with a near-100% pass rate expectation, so that previously mastered behavior is protected.
29. As a harness maintainer, I want the `type` value to be stored in the results data, so that analytics can separate capability and regression trends.

### Saturation Detection (Gap 8)

30. As a harness maintainer, I want the analytics layer to flag when a capability eval suite has reached a sustained near-100% pass rate, so that I know the suite has saturated and needs harder cases.
31. As a skill author, I want to be notified when my capability evals have saturated, so that I can graduate them to regression evals and add new harder capability cases.
32. As a reviewer, I want the web UI to surface saturation warnings at the suite level, so that stale suites are visible without manual inspection of pass rate trends.

### Parameterized Prompt Templates (Console Eval Tool gap)

33. As a skill author, I want to use `{{variable}}` syntax in prompt files and supply variable values in the test case definition, so that a single prompt template can drive many test inputs without duplicating prompt files.
34. As a skill author, I want missing variable substitutions to produce a clear error, so that I catch template mistakes before a test run completes.
35. As a harness maintainer, I want the prompt template substitution logic to be unit-tested with known variables and expected outputs, so that it is reliable and independently verifiable.

### Human Quality Rating (Console Eval Tool gap / Gap 11 partial)

36. As a reviewer, I want to rate a test run output on a 1–5 quality scale from the web UI, so that I can record structured human judgments alongside automated results.
37. As a harness maintainer, I want human ratings to be stored in the results schema, so that grader calibration analysis can compare human and automated verdicts.
38. As a reviewer, I want to filter the analytics view by human rating, so that I can find high-cost tests that humans rated poorly.

---

## Implementation Decisions

### Expectation Type System

The `TestExpectation` discriminated union gains one new member: an `llm-judge` type whose value is a natural-language rubric string. The existing `result-contains`, `result-does-not-contain`, `skill-call`, and `no-skill-call` types are unchanged. There is no separate `score` expectation type — scores are a property of llm-judge results when the rubric requests one. The `llm-judge` expectation type gains an optional `scoring` sub-field: `{ type: "llm-judge", value: "...", scoring?: { min: number, max: number } }`. When `scoring` is present, the judge prompt instructs the model to return a numeric score within the specified range in addition to a pass/fail verdict, and the `score` field in results is populated. When `scoring` is absent, the judge returns pass/fail only and `score` in results is null.

### Grader Module

The grader module gains one new evaluation function: `evaluateLlmJudge()`, which takes a rubric and result text, calls the Anthropic API with chain-of-thought prompting, and returns a pass/fail verdict plus reasoning, token usage, and an optional numeric `score` field when the rubric's `scoring` sub-field is present. There is no separate `evaluateScore()` function — scores are returned as part of the llm-judge result. The existing code-based graders are unchanged. All graders return a uniform result shape that includes an optional `score`, optional `judge_reasoning`, and token cost attribution.

`evaluateLlmJudge()` does not run in the main harness process. It is invoked by launching a new dedicated `docker run` instance — separate from the skill execution container — with `ANTHROPIC_API_KEY` and other required env vars forwarded from the host. This ensures a clean execution context for each judge call and mirrors the isolation model already used for skill execution. The transcript from the skill execution container is passed into the judge container as input.

### Trial Repetition Loop

The test runner gains an inner trial loop nested inside the existing test case loop. Each `TestCase` gains two optional fields: `trials` (integer, default 1) and `gateOn` (`"pass@k" | "pass^k"`, default `"pass^k"`), both specified per test case in `tests.json`. The inner loop runs the same prompt against Claude the specified number of times, collecting individual results. When `trials` is omitted or 1, `gateOn` has no effect. All trials in a single run share the same `test_run_id`; a `trial_number` integer column distinguishes individual trial records. After all trials complete, pass@k and pass^k are computed from trial rows grouped by `(test_run_id, test_name)` and written to results. The CI exit-code logic reads `gateOn` from each test case to decide which metric to gate on: `"pass^k"` requires all trials to pass (regression semantics); `"pass@k"` requires at least one trial to pass (capability semantics). The inner loop is structured as a testable function that accepts a mock executor interface so it can be verified with deterministic and stochastic mock modes.

### Prompt Template Substitution

The `readPromptFile()` function in the config module gains template variable substitution using `{{variable}}` syntax. Test cases supply a `variables` map. Substitution happens after file read, before the prompt is passed to the executor. Missing variables produce an explicit error. Substitution is a pure function and unit-testable in isolation.

### Results Schema

The `test-results.parquet` schema gains four new columns: `score` (nullable float, populated only by llm-judge grader results when the rubric's `scoring` sub-field is present — not a separate expectation type), `judge_cost_usd` (nullable float, one value per llm-judge expectation row, null for other expectation types), and `judge_reasoning` (nullable string). `judge_cost_usd` tracks the Anthropic API cost of the judge call separately from the skill execution cost and does not roll into `total_cost_usd`. The `test-results.parquet` schema also gains a `trial_number` (nullable integer — null for runs without trial repetition) to distinguish individual trial records within a run. Human ratings are **not** stored in `test-results.parquet` — they live in a sidecar file (see Web UI: Human Rating Widget). The `test-run.parquet` schema gains columns for trial count, pass@k, and pass^k per test-case result row. Existing rows written before these columns existed will have null values; the analytics queries must tolerate nulls.

### Eval Tagging

The `TestCase` model already has a `type?: string` field used today for the values `"prompt"` and `"skill-call"`. This field is **fully replaced** with new values `"capability"` and `"regression"`. The old values `"prompt"` and `"skill-call"` are removed — any test suite using them must update to the new values. This is a breaking change for existing test suites (the live `code-review` suite uses these values today). The execution-mode distinction those old values served is no longer needed: the expectation types (`skill-call`, `no-skill-call`) already encode what the test is verifying, so the `type` field is now free to express only CI gate behavior. When the field is absent, tests default to regression semantics. The test runner and CI exit-code logic respect the new values. The field is written into the results data for analytics filtering.

### Web UI: Transcript Viewer

The web UI gains a transcript viewer route that renders the stream-JSON events from `test-run.jsonl` for a selected test case and run. The viewer displays tool calls, Claude's reasoning, and text output in chronological order. If judge reasoning is present, it is displayed alongside the transcript. Navigation between test cases in a run is supported from this view. The viewer is built against the existing JSONL data already captured by the harness.

### Web UI: Human Rating Widget

The run detail view gains a rating widget (1–5) per test case result. The widget is integrated into the transcript viewer view so reviewers can rate while reading.

Ratings are stored in a sidecar file (`analytics/human-ratings.parquet`) keyed by `(test_run_id, test_name)`, not in `test-results.parquet`. The web server gains a `POST /api/test-runs/:runId/ratings` endpoint that appends a row to the sidecar. When duplicate entries exist for the same key (e.g., a reviewer updates their rating), analytics queries use the latest entry. Analytics queries JOIN `test-results` with the sidecar on `(test_run_id, test_name)` to include human ratings in reporting. All existing web server endpoints remain read-only GET; this POST endpoint is the first write endpoint in the server.

### Saturation Detection

The analytics module gains a saturation detection query: for capability-tagged evals, it computes a rolling pass rate over recent runs and emits a saturation flag when the rate exceeds a 95% threshold for a 5-run window. These are harness-level config defaults (not per-suite) and can be overridden via harness config or environment variable. The web UI surfaces this flag at the suite level.

---

## Testing Decisions

Good tests verify external behavior against a stable interface, not implementation details. Each new module should be tested through its public function signature using the actual inputs and outputs that callers will supply, with mock boundaries at external I/O (Anthropic API calls, file system, Docker) rather than at internal helpers.

**LLM judge grader** — Test the `evaluateLlmJudge()` function in isolation by mocking the Anthropic API client. Supply known rubrics and known outputs; assert that the function returns the correct pass/fail verdict and that judge reasoning is captured. Test edge cases: rubric that should clearly pass, rubric that should clearly fail, API error handling.

**Trial repetition loop** — Test the inner trial loop as a standalone function with a mock executor. Test a deterministic mock (always passes) to verify pass@k = pass^k = 1.0. Test a stochastic mock (alternates pass/fail) to verify pass@k and pass^k are computed correctly against hand-computed expected values.

**pass@k / pass^k calculation** — Unit-test the calculation functions directly with hand-computed examples: k=3 with 2 passes should yield specific known values for both metrics.

**Prompt template substitution** — Unit-test `readPromptFile()` substitution: known template string + known variables map → expected output string. Test missing variable error. Test no-variable passthrough.

**Web UI transcript viewer** — Integration-test the viewer against a known JSONL fixture. Assert that tool calls, text output, and judge reasoning (when present) are rendered in the correct order. The harness has no automated tests today; these will be the first, establishing the pattern for future harness testing.

---

## Out of Scope

**Simulated user personas / multi-turn conversational evals** (Gap 6) — All harness prompts are static files. Supporting τ-Bench style multi-turn simulation with a second LLM playing the user role is a medium-term investment. It requires a new execution mode, not just an additional grader type, and is deferred.

**Grader bypass / cheat prevention** (Gap 12) — The `result-contains` grader can be satisfied by echoing the expected string. Preventing this class of exploitation would require semantic grading (i.e., LLM judges) rather than a structural fix. Adding LLM judges (this PRD) reduces the surface area; dedicated cheat prevention is low severity and deferred.

**Eval-driven development process documentation** (Gap 13) — The article describes a practice of writing evals before building skills. Documenting that process and creating onramps for non-engineer contributors is a process and documentation initiative, not a tooling change. It is deferred and may be addressed as a separate skill or documentation effort.

**Console Eval Tool integration** — The Console Eval Tool targets single-turn LLM API calls; this harness targets agentic Claude Code skill execution. They are complementary. Integrating with or duplicating the Console's side-by-side comparison, prompt versioning, or CSV import features is not in scope. Patterns from the Console (LLM judges, human rating, parameterized prompts) are being adapted, not the tool itself.

**Human grader calibration workflow** (Gap 11 full) — Recording human ratings (this PRD) is the prerequisite. Building a structured calibration workflow — computing inter-annotator agreement, comparing human vs. LLM judge divergence, and alerting on drift — is deferred until LLM judges are in place and a corpus of human ratings exists to calibrate against.

**Outcome verification / environment state checking** (Gap 5) — Verifying that a skill's side effects actually occurred (e.g., that a commit was created, a PR was opened, a file was written) requires post-execution environment inspection that varies by skill. This is a high-severity gap but requires per-skill instrumentation and a new assertion category. It is deferred to a follow-on PRD.

**Positive/negative case balance enforcement** (Gap 7) — The harness already supports both assertion polarities. Structural enforcement (linting test suites for balance) is low severity and deferred.

**Environment isolation guarantees** (Gap 3) — The harness uses Docker for container-level isolation. Guaranteeing clean workspace state within a suite run and preventing Docker layer caching from carrying state between trials is a low-severity operational concern that may be addressed incrementally as trial repetition is implemented.

---

## Further Notes

**LLM judge calibration before CI reliance** — The [Demystifying Evals article](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#step-5-design-thoughtful-graders) is explicit: "Model grading requires careful calibration with human experts, ensuring minimal divergence between human and model judgments." LLM judge verdicts should be reviewed manually against a sample of known outputs before the judge is trusted in a CI gate. The transcript viewer and human rating widget (also in this PRD) are the tooling layer that makes calibration practical. Harness maintainers should establish a calibration baseline before enabling LLM judge failures as CI blockers.

**Staged rollout implied by severity classification** — The [gap analysis](./gap-analysis.md) classifies gaps as High, Medium, and Low severity. This PRD follows that classification: High gaps (LLM judges, trial repetition, transcript viewer) are the first increment; Medium gaps (partial credit, tagging, saturation, parameterized prompts, human rating) are the second; Low gaps and out-of-scope items are deferred. Implementing in this order ensures each layer is useful on its own and that later layers build on validated foundations.

**Relationship to the Console Eval Tool** — The Console Eval Tool and this harness solve different problems and should not be conflated. The Console is excellent for iterating on prompts for direct API calls. This harness is the right tool for testing whether Claude Code skills trigger correctly, invoke the right sub-skills, and produce output matching quality criteria across model versions over time. The patterns borrowed here (LLM judges, `{{variable}}` templates, human rating) are adapted to the agentic execution context, not a replication of the Console.
