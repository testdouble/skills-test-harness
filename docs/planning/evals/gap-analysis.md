# Evals Gap Analysis

**Sources**:
- [Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — Anthropic Engineering Blog
- [Claude Console Evaluation Tool](https://platform.claude.com/docs/en/test-and-evaluate/eval-tool) — Anthropic Platform Docs
- [Define Success Criteria and Build Evaluations](https://platform.claude.com/docs/en/test-and-evaluate/define-success) — Anthropic Platform Docs

**Scope**: Comparison of eval frameworks from the above sources against the current test harness, plus an integration analysis for the Console Eval Tool

---

## Summary

The test harness covers the execution and basic assertion layer of evals well: it runs Claude Code inside Docker, captures full stream-JSON transcripts, evaluates four assertion types, stores results in Parquet for trending, and exposes a web UI for review. However, the article describes a substantially broader eval discipline — one that includes multiple grader types, non-determinism metrics, trial repetition, environment isolation, partial credit, model-based grading, calibration against human judgment, and long-term suite governance. Most of those layers are absent.

---

## What the Test Harness Has

### Test Case Definition
[`tests/test-suites/{suite}/tests.json`](../test-suites/)

Each test case specifies a prompt file, optional model override, and an array of typed expectations. Four assertion types are supported:

| Type | Checks |
|---|---|
| `result-contains` | Output includes a substring |
| `result-does-not-contain` | Output excludes a substring |
| `skill-call` | A named skill was successfully invoked |
| `no-skill-call` | A named skill was not invoked |

These map to the article's **code-based graders** — fast, cheap, and objective, but brittle to valid variations.

### Skill/Agent Invocation
[`tests/packages/cli/src/commands/run-test.ts`](../packages/cli/src/commands/run-test.ts)

Claude Code runs inside a Docker container via `docker run` with `--output-format stream-json`. Each test receives a prompt from a file, one model, and one set of plugins. The full event stream is captured to JSONL.

### Transcript Storage
[`tests/packages/data/src/jsonl-writer.ts`](../packages/data/src/jsonl-writer.ts)

Three JSONL files per run: `test-config.jsonl`, `test-run.jsonl` (all stream events), and `test-results.jsonl` (per-expectation pass/fail). This aligns with the article's concept of a **transcript** — "the complete trial record including outputs, tool calls, reasoning, and intermediate results."

### Metrics Tracking
[`tests/docs/parquet-schema.md`](./parquet-schema.md)

The `test-run.parquet` table captures: `total_cost_usd`, `num_turns`, `duration_ms`, `input_tokens`, `output_tokens`, `is_error`, `stop_reason`. These support cost and token trending over time.

### Historical Analytics and Trending
[`tests/packages/data/src/analytics.ts`](../packages/data/src/analytics.ts)

`queryPerTest()` returns per-test pass rates, cost, and token usage across all runs. `queryTestRunDetails()` gives expectation-level results for a single run. The web UI ([`tests/packages/web/`](../packages/web/)) visualizes this as a test run history list, detail view, and per-test analytics table.

### CI/CD Integration
[`tests/Makefile`](../Makefile)

`run-test` exits non-zero when any test fails, making it suitable as a CI gate.

---

## What the Article Describes That the Harness Lacks

### 1. Multiple Grader Types

The article defines [three grader types](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#three-grader-types):

> **Code-based graders** — string matching, binary tests, tool-call verification
> **Model-based graders** — rubric scoring, natural language assertions, pairwise comparison
> **Human graders** — SME review, spot-check sampling, inter-annotator agreement

The harness implements only code-based graders (substring match and skill-call detection). **Model-based grading** — where an LLM judges output quality against a rubric — is entirely absent. This is a significant gap for skill evals, where outputs are often freeform text and correctness is not binary.

The article is explicit that code-based graders are "brittle to valid variations, lacking nuance, limited for subjective tasks." Skills like `/code-review`, `/investigate`, or `/project-documentation` produce outputs where a substring check cannot reliably measure quality.

### 2. Non-Determinism Metrics: pass@k and pass^k

The article describes [two metrics](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#non-determinism-metrics) for handling model non-determinism:

> **pass@k** — likelihood of at least one correct solution across k attempts (useful when one success suffices)
> **pass^k** — probability all k trials succeed (useful when reliability every interaction is required)

The harness runs each test case exactly once per run. There is no concept of **trials** — repeated attempts at the same task to produce statistically stable results. The article notes: "multiple trials produce consistent results due to model non-determinism." A single-run result may pass or fail due to chance rather than skill quality.

**Relevant harness path**: [`tests/packages/cli/src/commands/run-test.ts`](../packages/cli/src/commands/run-test.ts) — the outer loop iterates over test cases with no inner trial loop.

### 3. Environment Isolation Between Trials

The article's [Step 4](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#step-4-build-robust-stable-eval-harnesses) is emphatic:

> "Each trial needs 'isolation' — clean environment starting states. Unnecessary shared state between runs causes correlated failures from infrastructure flakiness rather than agent performance."

The article also warns of a specific failure mode:

> "Claude gaining unfair advantages examining git history from previous trials in internal evals."

The harness runs each test inside Docker, which provides container-level isolation. However, there is no mechanism to enforce a clean workspace state *within* a test suite run. If one test case writes files that another can observe, or if Docker layer caching carries state, isolation is not guaranteed. There is no explicit isolation protocol or per-test environment reset.

### 4. Partial Credit / Grading Continuums

The article's [Step 5](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#step-5-design-thoughtful-graders) addresses partial credit:

> "For multifaceted tasks, incorporate partial credit. Support agents correctly identifying problems and verifying customers but failing refund processing show meaningful improvement versus immediate failure. Representing this success continuum matters."

The harness models each expectation as a boolean `passed` field. There is no scoring continuum, no weighted expectations, and no partial credit. An assertion either passes or fails. This makes it impossible to distinguish "completely wrong" from "almost right," and can make progress invisible when a skill improves on some dimensions but not all.

**Relevant harness path**: [`tests/packages/data/src/expectations.ts`](../packages/data/src/expectations.ts) — all evaluators return `boolean`.

### 5. Outcome Verification vs. Transcript Inspection

The article distinguishes between grading **transcripts** (what the agent said/did) and grading **outcomes** (what actually resulted in the environment):

> "**Outcome**: Final environment state post-trial (e.g., whether a flight reservation actually exists in the database)"

The harness only inspects Claude's stream-JSON output — it does not verify downstream state. For skills that write files, create commits, open PRs, or call external APIs, there is no mechanism to check whether those effects actually occurred correctly. The `skill-call` assertion only confirms Claude invoked a skill, not that the skill produced correct output or side effects.

### 6. Simulated User Personas for Conversational Evals

The article describes [conversational agent evaluation](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#conversational-agents):

> "Conversational evals often require simulating user personas with a second LLM, as demonstrated in τ-Bench and τ2-Bench."

All harness prompts are static files. There is no support for multi-turn conversations, simulated user responses, or dynamic persona-driven exchanges. Skills that are inherently interactive (e.g., clarification-seeking skills) cannot be evaluated realistically with a single static prompt.

### 7. Positive and Negative Case Balance

The article's [Step 3](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#step-3-balance-problem-sets):

> "Test both positive cases (where behavior should occur) and negative cases (where it shouldn't). One-sided evals produce one-sided optimization."

The harness supports both `skill-call` and `no-skill-call` assertion types, and `result-contains`/`result-does-not-contain` pairs — so the building blocks for balanced testing exist. However, there is no structural enforcement or tooling guidance requiring suites to include both positive and negative cases. Whether a suite is balanced is entirely up to the author.

### 8. Eval Suite Saturation Monitoring

The article's [Step 7](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#step-7-monitor-capability-eval-saturation):

> "**Eval saturation** occurs when agents pass all solvable tasks, eliminating improvement signals."

The harness has no concept of capability evals vs. regression evals, no saturation detection, and no mechanism for graduating high-performing tests into a regression suite. All tests are treated identically regardless of their pass rate history. There is no tooling to flag when a suite has become too easy or to prompt authors to add harder cases.

### 9. Capability Evals vs. Regression Evals

The article defines a distinction the harness does not implement:

> "**Capability evals** assess what agents do well, starting at low pass rates to provide 'a hill to climb.' **Regression evals** verify maintained performance on previously mastered tasks, targeting ~100% pass rates."

The harness has no way to tag a test as a capability eval (expected to fail initially) vs. a regression eval (expected to always pass). All tests are graded identically, and any failure is treated as a CI failure. This conflation makes it impossible to use the harness for exploratory, "can we get here?" capability tracking without also triggering CI failures.

### 10. Transcript Review Workflow

The article's [Step 6](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#step-6-examine-transcripts):

> "Understanding whether graders work requires reading transcripts from many trials. When tasks fail, transcripts reveal whether agents made genuine mistakes or graders rejected valid solutions."

The harness captures the full stream-JSON transcript in [`test-run.jsonl`](../output/). However, the web UI does not expose transcript content — it shows only summary metrics (pass/fail counts, cost, tokens) and expectation results. There is no way to browse the actual conversation — tool calls, Claude's reasoning, intermediate outputs — from the web interface. Transcript review requires manually reading raw JSONL files.

**Relevant paths**:
- Capture: [`tests/packages/data/src/jsonl-writer.ts`](../packages/data/src/jsonl-writer.ts)
- Web UI: [`tests/packages/web/src/client/`](../packages/web/src/client/) — no transcript viewer

### 11. Grader Calibration Against Human Judgment

The article's [Step 5](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#step-5-design-thoughtful-graders):

> "Model grading requires careful calibration with human experts, ensuring minimal divergence between human and model judgments."

The harness has no calibration layer at all. There is no structured human review workflow, no way to record human judgments alongside automated results, and no tooling to compare human vs. automated grader agreement. Human review is ad-hoc — someone reads JSONL files if they want to investigate.

### 12. Grader Bypass / "Cheat" Prevention

The article warns:

> "Graders should resist bypasses — agents shouldn't 'cheat' evals. Tasks and graders should require genuinely solving problems rather than exploiting unintended loopholes."

The current `result-contains` grader checks for a substring in Claude's final response. A skill could satisfy this expectation by simply echoing the expected string without actually performing the underlying task. There is no mechanism to detect or prevent this class of grader exploitation.

### 13. Eval-Driven Development / Suite Ownership

The article's [Step 8](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#step-8-maintain-eval-suites-long-term):

> "Practicing **eval-driven development** means building evals defining planned capabilities before agents fulfill them, iterating until strong performance."
>
> "People closest to product requirements and users best position themselves to define success."

The harness has no documentation or process guidance for eval-driven development as a practice. There is no framework for writing tests before building skills, no suite ownership conventions, and no onramp for non-engineers (product managers, etc.) to contribute test cases. The harness is a technical tool without a surrounding process.

---

## Comparison Matrix

| Article Concept | Harness Status | Gap Severity |
|---|---|---|
| Code-based graders (string match, skill-call) | **Present** | — |
| Transcript capture | **Present** | — |
| Cost and token metrics | **Present** | — |
| Historical trending / analytics | **Present** | — |
| CI/CD integration (exit codes) | **Present** | — |
| Model-based (LLM) graders | **Absent** | High |
| Trial repetition (pass@k / pass^k) | **Absent** | High |
| Outcome verification (env state) | **Absent** | High |
| Partial credit / scoring continuums | **Absent** | Medium |
| Transcript viewer in web UI | **Absent** | Medium |
| Capability vs. regression eval tagging | **Absent** | Medium |
| Saturation detection | **Absent** | Medium |
| Simulated user personas (multi-turn) | **Absent** | Medium |
| Grader calibration against human judgment | **Absent** | Medium |
| Positive/negative case balance enforcement | **Partial** (types exist, not enforced) | Low |
| Environment isolation guarantees | **Partial** (Docker, no explicit reset) | Low |
| Grader bypass / cheat prevention | **Absent** | Low |
| Eval-driven development process | **Absent** | Low |

---

## Highest-Priority Gaps

Based on the article's framing, three gaps stand out as highest-leverage for improving signal quality:

**1. Model-based graders** — The majority of skills produce freeform text where substring matching is inadequate. Adding an LLM-as-judge grader with a rubric would unlock evaluation of quality, not just keyword presence. The article recommends structured rubrics grading isolated dimensions with separate LLM judges to prevent hallucination.

**2. Trial repetition** — Running each test once gives a single sample from a non-deterministic system. Even a small number of trials (e.g., 3) would produce more stable pass rates and enable pass@k / pass^k metrics, making it possible to distinguish "usually works" from "always works."

**3. Transcript viewer** — The data is already being captured. Surfacing it in the web UI would enable the transcript review workflow the article identifies as essential for validating that graders are actually measuring what matters, and for distinguishing agent failures from grader failures.

---

## Claude Console Evaluation Tool

The [Console Eval Tool](https://platform.claude.com/docs/en/test-and-evaluate/eval-tool) is Anthropic's built-in prompt evaluation UI. It targets a different problem than this harness — prompt engineering for single LLM API calls rather than agentic skill execution — but it introduces several patterns and capabilities that are instructive for where the harness has gaps.

### What the Console Eval Tool Does

**Parameterized prompts via `{{variable}}` syntax**
Prompts use double-brace template variables (e.g., `{{COLOR}}`, `{{SOUND}}`). Test cases provide values for each variable, letting a single prompt template drive many test inputs without duplicating prompt files.

**Test case generation**
The tool can auto-generate test cases one row at a time using Claude, with editable generation logic. Test cases can also be imported from CSV or entered manually. This dramatically lowers the cost of building large, diverse test sets.

**Side-by-side prompt comparison**
Multiple prompt versions can be run against the same test set simultaneously, with outputs displayed side-by-side. This directly supports the prompt iteration loop: change something, see the difference across all cases at once.

**5-point human quality grading**
Responses can be rated on a 1–5 scale directly in the UI. This is the human grader layer — structured, in-context, and recorded alongside automated results.

**Prompt versioning**
New prompt versions can be created and run against the existing test set, building a history of how changes affect quality.

**LLM-based graders via the API** (from [Define Success Criteria](https://platform.claude.com/docs/en/test-and-evaluate/define-success))
The broader platform docs describe several LLM-as-judge grader patterns with code examples:
- **Likert scale** — rate tone/quality 1–5 (e.g., "Rate this response for being empathetic")
- **Ordinal scale** — rate context utilization 1–5
- **Binary classification** — classify outputs as correct/incorrect or safe/unsafe
- **Rubric-based scoring** — detailed rubric prompts with chain-of-thought reasoning before a final verdict

All patterns call Claude via the API in a separate invocation, using a different model than the one being evaluated (recommended practice to reduce self-serving bias).

### Comparison: Console Eval Tool vs. This Harness

| Capability | Console Eval Tool | This Harness |
|---|---|---|
| **Target use case** | Single-turn / simple prompt LLM calls | Agentic Claude Code skill execution |
| **Execution environment** | Anthropic API (direct) | Docker container (Claude Code CLI) |
| **Skill/plugin invocation** | Not supported | Native (`--plugin-dir` flags) |
| **Tool use tracking** | Not supported | `skill-call` / `no-skill-call` assertions |
| **Multi-step agentic runs** | Not supported | Full stream-JSON capture |
| **Cost/token tracking** | Not supported | `total_cost_usd`, token counts in Parquet |
| **Parameterized prompts** | `{{variable}}` template syntax | Static prompt files (no templating) |
| **Test case generation** | AI-generated via Claude | Manual JSON authoring only |
| **CSV test case import** | Supported | Not supported |
| **Side-by-side comparison** | Supported in UI | Not supported |
| **Human quality grading (1–5)** | Supported in UI | Not supported |
| **Prompt versioning** | Supported in UI | No prompt versioning |
| **LLM-based graders** | Via API (code examples in docs) | Not supported |
| **Historical trending** | Not supported | Parquet + DuckDB analytics |
| **CI/CD integration** | Not supported | Exit codes, Makefile |
| **Transcript viewer** | Not supported | Partially (JSONL stored, not in web UI) |

The tools are **complementary, not competitive**. The Console Eval Tool excels at rapid prompt iteration for single-turn quality. This harness excels at agentic integration testing — verifying that skills trigger correctly, don't regress, and produce output the test expected across multiple model versions over time.

### Gaps the Console Eval Tool Highlights in This Harness

These are capabilities the Console Eval Tool has that this harness currently lacks and that would be feasible to add:

**1. Parameterized prompt templates**
The Console's `{{variable}}` pattern enables one prompt file to cover many input variations. The harness currently requires a separate prompt file per test case. Adding template variable substitution to the prompt loading step (see [`tests/packages/data/src/config.ts`](../packages/data/src/config.ts) `readPromptFile()`) would make it practical to cover edge cases without file proliferation.

**2. Human quality rating in the web UI**
The Console's 1–5 grading is the entry point for structured human evaluation. The harness web UI ([`tests/packages/web/src/client/`](../packages/web/src/client/)) shows pass/fail and cost but has no mechanism for a human to record a quality judgment. Adding a rating column to the `test-results.parquet` schema and a rating widget in the run detail view would close this gap.

**3. LLM-as-judge grader type**
The [Define Success Criteria docs](https://platform.claude.com/docs/en/test-and-evaluate/define-success) give concrete code patterns for calling Claude to evaluate Claude's output. Adding an `llm-judge` expectation type to `tests.json` — where the value is a rubric string — would let test authors write expectations like:

```json
{ "llm-judge": "The response should identify at least two concrete code quality issues and explain why each is problematic." }
```

The grader would call the Anthropic API with the rubric and the actual response, parse a pass/fail verdict, and record it alongside existing expectations. This is the single highest-leverage addition available: it would make the harness viable for evaluating freeform skill output quality, not just invocation behavior.

**4. Test case generation from SKILL.md**
The Console generates test cases from a task description. The same pattern — prompt Claude to produce test cases — could be applied here: given a `SKILL.md` file, generate a set of prompt files and `tests.json` entries covering the skill's described use cases. This would lower the barrier to creating well-populated test suites for new skills.

---

## Integration Recommendation: LLM-as-Judge Grader

The most actionable integration between the Console Eval Tool's patterns and this harness is adding an `llm-judge` expectation type. Here is how it maps to the existing architecture:

**Schema change** — [`tests/packages/data/src/types.ts`](../packages/data/src/types.ts)

The `TestExpectation` discriminated union gains a new member:
```typescript
| { "llm-judge": string }  // value is the rubric/assertion in natural language
```

**Grader implementation** — [`tests/packages/data/src/expectations.ts`](../packages/data/src/expectations.ts)

A new `evaluateLlmJudge(rubric, resultText)` function calls the Anthropic API:
```typescript
// Pattern from https://platform.claude.com/docs/en/test-and-evaluate/define-success
// Uses a separate model from the one being evaluated (e.g., haiku for cost efficiency)
// Prompts with chain-of-thought + binary verdict extraction
```

**Cost tracking** — The LLM judge invocation has its own token cost. The grader should return token usage alongside the verdict so it can be included in `total_cost_usd` attribution per test.

**Config requirement** — An `ANTHROPIC_API_KEY` env var is needed. The Docker execution already supports `.env` file injection via `buildDockerEnvFlags()` in [`tests/packages/data/src/config.ts`](../packages/data/src/config.ts), but the judge call runs in the harness process (not in the container), so the key must be available in the host environment.

**Grader calibration** (per [Demystifying Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents#step-5-design-thoughtful-graders)) — Before relying on LLM judge verdicts, a sample of judgments should be reviewed against human expectations to confirm the rubric is producing intended results. The transcript viewer gap (#10 above) becomes more important once LLM judging is in place: reviewers need to see both the full transcript and the judge's reasoning to validate calibration.
