# PRD: Agent-Call Improvement Loop (ACIL)

> **Source Document**: [`acil-loop-and-skill.md`](acil-loop-and-skill.md) — the original technical design document from which this PRD was derived. Refer to it for detailed code-level specifications, type definitions, and regex patterns.

## Problem Statement

Claude Code uses an agent's `description` frontmatter field to decide when to delegate tasks to custom agents — the same mechanism used for skill triggering. Today, there is no automated way to test and iteratively improve agent descriptions for trigger accuracy. The existing SCIL (Skill-Call Improvement Loop) solves this problem for skills, but agents have different metadata fields, different stream event shapes, and different isolation requirements. Plugin developers who build custom agents must manually guess at descriptions and test them by hand, with no feedback loop to measure or improve trigger accuracy.

## Solution

Build ACIL — an automated improvement loop for agent descriptions that mirrors the existing SCIL system. ACIL will:

1. Load agent-call test suites that define prompts and expected trigger/no-trigger outcomes
2. Build isolated temp plugins with no-op agent and skill bodies to test description-only triggering
3. Run evaluation queries against Claude, detect agent delegation via stream events, and score accuracy
4. Iteratively improve the agent description using an LLM prompt informed by pass/fail results
5. Apply the best-performing description back to the agent file

Additionally, build a `/write-acil-evals` skill to generate agent-call test suites, add `agent-call` support to the `test-run` pipeline, and extend the dashboard/analytics to display ACIL results.

## User Stories

### Phase 0 — Spike: Agent Stream Event Discovery (COMPLETED)

> **Prerequisite**: This story blocks all detection and evaluation work (stories 7, 11, 12, 19-26). Phases 1 and 2 type/config work can proceed in parallel.

1. As a harness developer, I want to capture and document the stream-json event shape when Claude delegates to a custom agent, so that I can implement reliable agent invocation detection.

   **Status**: Completed 2026-04-02. Full findings at [`acil-loop-and-skill.spike.md`](acil-loop-and-skill.spike.md).

   **Implementation detail**: Ran Claude with `--print --verbose --output-format stream-json --plugin-dir r-and-d` and a prompt that triggered the `gap-analyzer` agent. Captured stdout. Identified the event fields indicating agent delegation.

   **Spike findings**:
   - Agent invocations appear on `user` events via `tool_use_result.agentType` (e.g., `"r-and-d:gap-analyzer"`), NOT via `commandName` (which is skill-only)
   - Agent results use `status: "completed"/"failed"` instead of `success: true/false`
   - Agent results also include `agentId`, `totalDurationMs`, `totalTokens`, `totalToolUseCount`
   - Agent delegation additionally produces `system` events: `task_started`, `task_progress`, `task_notification` — these are not needed for detection but exist in the stream
   - Agents are discovered from `agents/` directory by convention — no `"agents"` key required in `plugin.json`
   - Plugin loading via `--plugin-dir` is already supported by `runClaude({ pluginDirs })` in the claude-integration package
   - `ToolUseResult` type must be extended: add `agentType?`, `agentId?`, `status?`; make `success` optional

   **Acceptance criteria**:
   - [x] The stream-json event shape for agent delegation is documented with at least one real captured example
   - [x] The field path identifying which agent was invoked is identified: `tool_use_result.agentType` on `user` events
   - [x] Fixture data from the captured events is saved at `tests/packages/test-fixtures/data/agent-stream-events.json`
   - [x] The findings are sufficient to implement `getAgentInvocations()` in the stream parser

### Phase 1 — Extract Shared Utilities from SCIL

2. As a harness developer, I want the scoring logic extracted from `scil/step-6-score.ts` into `common/score.ts`, so that both SCIL and ACIL can reuse it without duplication.

   **Implementation detail**: Move `scoreResults` and `selectBestIteration` to `tests/packages/execution/src/common/score.ts`. The original SCIL step file re-exports from `../common/score.js`. No logic changes — pure math, self-contained.

   **Acceptance criteria**:
   - `common/score.ts` exports `scoreResults` and `selectBestIteration`
   - `scil/step-6-score.ts` re-exports from `../common/score.js`
   - All existing SCIL tests pass (`make test`)

3. As a harness developer, I want the output-writing logic extracted from `scil/step-9-write-output.ts` into `common/write-output.ts` with a configurable filename prefix, so that ACIL can write `acil-iteration.jsonl` and `acil-summary.json` using the same logic.

   **Implementation detail**: Add a `prefix` parameter to the extracted functions. SCIL passes `prefix: 'scil'`, ACIL will pass `prefix: 'acil'`. File naming changes from hardcoded `scil-iteration.jsonl` to `{prefix}-iteration.jsonl`.

   **Acceptance criteria**:
   - `common/write-output.ts` exports parameterized write functions accepting a `prefix` argument
   - `scil/step-9-write-output.ts` delegates to `../common/write-output.js` with `prefix: 'scil'`
   - Output filenames remain unchanged for SCIL (`scil-iteration.jsonl`, `scil-summary.json`)
   - All existing SCIL tests pass

4. As a harness developer, I want the report-printing logic extracted from `scil/step-10-print-report.ts` into `common/print-report.ts`, so that ACIL can reuse the same progress and summary formatting.

   **Implementation detail**: The existing code already uses neutral terminology ("Iteration", "Train", "Test" — no "skill" wording), so no text changes are needed.

   **Acceptance criteria**:
   - `common/print-report.ts` exports `printIterationProgress` and `printFinalSummary`
   - `scil/step-10-print-report.ts` re-exports from `../common/print-report.js`
   - All existing SCIL tests pass

### Phase 2 — Data Layer Updates

5. As a harness developer, I want an `agent-call` expectation type added to the `TestExpectation` union, so that test suites can express "this prompt should/should not trigger agent X."

   **Implementation detail**: Add `| { type: 'agent-call'; value: boolean; agentFile: string }` to the `TestExpectation` union in `tests/packages/data/src/types.ts`. Add optional `agentFile?: string` to `TestCase`.

   **Acceptance criteria**:
   - `TestExpectation` union includes the `agent-call` variant with `type`, `value`, and `agentFile` fields
   - `TestCase` has an optional `agentFile` field
   - TypeScript compiles without errors

6. As a harness developer, I want parallel ACIL result types (`AcilTrainResult`, `AcilQueryResult`, `AcilIterationResult`, `AcilTestCase`), so that ACIL results use correctly-named fields (`agentFile`) instead of reusing SCIL types with misnamed `skillFile`.

   **Implementation detail**: Create types in `tests/packages/data/src/types.ts` as specified in the source document Phase 2.1. `AcilQueryResult` has `agentFile` instead of `skillFile`. `AcilTestCase` extends `TestCase` with `set: 'train' | 'test'`.

   **Acceptance criteria**:
   - All four ACIL types are exported from `@testdouble/harness-data`
   - `AcilQueryResult` uses `agentFile: string` (not `skillFile`)
   - Types compile and are importable from the data package

7. As a harness developer, I want the config parser to recognize `agent-call` expectations in `tests.json`, so that agent-call test suites can be loaded and validated.

   **Implementation detail**: Add an `agent-call` parsing block in the `expect.map` callback of `tests/packages/data/src/config.ts`, supporting both full format (`{ "agent-call": { "agent": "...", "expected": true/false } }`) and simplified format (`{ "agent-call": true/false }` with `test.agentFile`).

   **Acceptance criteria**:
   - Full format `{ "agent-call": { "agent": "r-and-d:gap-analyzer", "expected": true } }` parses correctly
   - Simplified format `{ "agent-call": false }` parses correctly when `test.agentFile` is set
   - Invalid configs (missing agent, wrong types) throw descriptive errors
   - Unit tests in `config.test.ts` cover both formats and error cases

8. As a harness developer, I want a `getAgentInvocations()` function in the stream parser that extracts which agents were invoked from stream-json events, so that agent-call evaluations can detect delegation.

   **Implementation detail**: Add to `tests/packages/data/src/stream-parser.ts`. Filter `user` events where `tool_use_result.agentType` is defined and `tool_use_result.status === 'completed'`. Return the `agentType` values (in `plugin:agent` format). This mirrors `getSkillInvocations` which filters by `tool_use_result.commandName` and `success === true`.

   Requires extending `ToolUseResult` in `types.ts`: add `agentType?: string`, `agentId?: string`, `status?: string`; change `success` from required to optional (agent results do not include it). No changes needed to `StreamJsonEvent` union or `UserEvent` type.

   Export from `tests/packages/data/index.ts` (already re-exports all of `stream-parser.js`).

   **Acceptance criteria**:
   - `getAgentInvocations(events: StreamJsonEvent[]): string[]` is exported from the data package
   - Returns agent identifiers (in `plugin:agent` format) from stream events
   - Unit tests use fixture data from `tests/packages/test-fixtures/data/agent-stream-events.json` (captured during Phase 0 spike)
   - Handles edge cases: no agent invocations, multiple invocations, non-agent events, failed agent invocations (status !== 'completed')
   - `ToolUseResult.success` is now optional (not breaking — existing code checks `=== true`)

9. As a harness developer, I want `splitSets` generalized to accept `entityFile` instead of `skillFile`, so that the same deterministic stratified splitting works for both skill-call and agent-call test suites.

   **Implementation detail**: Rename the `skillFile` parameter to `entityFile` in `tests/packages/data/src/scil-split.ts`. Update `getExpectedTrigger` to recognize both `skill-call` and `agent-call` expectation types. Update all callers (SCIL `step-2` and tests).

   **Acceptance criteria**:
   - `splitSets` signature uses `entityFile` parameter
   - `getExpectedTrigger` handles both `skill-call` and `agent-call` types
   - All existing SCIL callers updated for the renamed parameter
   - Existing SCIL split tests still pass
   - New tests cover `agent-call` type splitting

10. As a harness developer, I want an ACIL improvement prompt builder (`buildAcilImprovementPrompt`), so that the improvement step can generate agent-specific prompts with correct terminology.

    **Implementation detail**: Create `tests/packages/data/src/acil-prompt.ts` modeled on `scil-prompt.ts`. Use agent-specific wording: "agent descriptions", "when Claude delegates to the agent". Parameters include `agentName`, `currentDescription`, `agentBody`, `trainResults` (using `AcilQueryResult`), `iterations`, `holdout`. Export from `tests/packages/data/index.ts`.

    **Acceptance criteria**:
    - `buildAcilImprovementPrompt` is exported from the data package
    - Prompt text uses agent terminology (not skill terminology)
    - Includes agent name, current description, and agent body (system prompt)
    - Structures train results into "should trigger" and "should NOT trigger" sections
    - Includes iteration history and generalization hints
    - Unit tests in `acil-prompt.test.ts` verify prompt structure

11. As a harness developer, I want to confirm that the existing YAML frontmatter utilities (`parseDescription`, `replaceDescription`, `sanitizeForYaml`) work correctly on agent `.md` files, so that ACIL can read and write agent descriptions without new code.

    **Implementation detail**: The utilities in `skill-frontmatter.ts` operate on any file with a `description:` field in YAML frontmatter. No code changes needed — just verify with agent file examples.

    **Acceptance criteria**:
    - Existing `parseDescription` correctly extracts descriptions from agent `.md` frontmatter
    - `replaceDescription` correctly updates descriptions in agent `.md` frontmatter
    - Verified with at least one real agent file (e.g., `r-and-d/agents/gap-analyzer.md`)

### Phase 3 — Agent Evaluation

12. As a harness developer, I want an `evaluateAgentCall` function that checks whether an agent was invoked in stream events, so that agent-call expectations can be scored as pass/fail.

    **Implementation detail**: Add to `tests/packages/evals/src/boolean-evals.ts`. Uses `getAgentInvocations(events).includes(agentFile)` from the data package. Add `agent-call` case to the `evaluateExpectation` switch statement.

    **Acceptance criteria**:
    - `evaluateAgentCall(agentFile, shouldBeCalled, events)` returns correct boolean for positive and negative cases
    - `evaluateExpectation` routes `agent-call` expectations to `evaluateAgentCall`
    - `evaluateAllExpectations` passes `agent-call` through (already filters only `llm-judge`)
    - Unit tests in `boolean-evals.test.ts` cover true-positive, true-negative, false-positive, false-negative

### Phase 4 — ACIL Pipeline

13. As a harness developer, I want a temp plugin builder for agent-call tests that creates isolated plugins with no-op bodies for all agents and skills, so that only descriptions influence triggering decisions.

    **Implementation detail**: Create `tests/packages/execution/src/test-runners/agent-call/build-temp-plugin.ts` with two exported functions: `buildTempAgentPlugin` (uses original description) and `buildTempAgentPluginWithDescription` (overrides target agent's description). For each agent, keep only `name`/`description`/`model` in frontmatter, strip `tools`, `permissionMode`, `allowed-tools`, `hooks`, etc. For each skill, keep only `name`/`description`, strip `allowed-tools`/`argument-hint`. All bodies replaced with no-op responses. Write `plugin.json` with explicit `"agents": "./agents"` and `"skills": "./skills"`.

    **Acceptance criteria**:
    - `buildTempAgentPlugin` creates a temp plugin with all agents and skills from the source plugin
    - All agent frontmatter fields except `name`, `description`, `model` are stripped
    - All skill frontmatter fields except `name`, `description` are stripped
    - Agent bodies replaced with `Respond with: "agent triggered" — nothing else.`
    - Skill bodies replaced with `Respond with: "skill triggered" — nothing else.`
    - `buildTempAgentPluginWithDescription` overrides only the target agent's description
    - Multi-line YAML fields (like `hooks` blocks) are correctly stripped
    - `plugin.json` includes both `"agents"` and `"skills"` paths
    - Unit tests cover: all entities included, correct stripping, description override, multi-line field stripping

14. As a harness developer, I want an agent-call test runner for the `test-run` pipeline, so that `./harness test-run` can execute agent-call test cases alongside skill-call tests.

    **Implementation detail**: Create `tests/packages/execution/src/test-runners/agent-call/index.ts` exporting `runAgentCallTests`, mirroring `runSkillCallTests`. Uses `buildTempAgentPlugin`. Update `step-8-run-test-cases.ts` to filter `agent-call` tests and dispatch to the new runner.

    **Acceptance criteria**:
    - `runAgentCallTests` executes agent-call test cases using temp plugin isolation
    - `step-8-run-test-cases.ts` dispatches `agent-call` type tests to the new runner
    - Test output includes `agentFile` in the logged config
    - Existing skill-call test execution is unaffected

15. As a harness developer, I want ACIL pipeline steps that mirror the SCIL step architecture, so that the ACIL loop follows the same proven numbered-step pattern.

    **Implementation detail**: Create `tests/packages/execution/src/acil/` with steps 1-10, `types.ts`, and `loop.ts`. Steps 2, 6, 9, 10 reuse/re-export from `common/`. Steps 1, 3, 5, 7, 8 are adapted from SCIL equivalents for agent-specific behavior. Step 4 delegates to the agent-call temp plugin builder.

    Steps:
    - Step 1 (`resolve-and-load`): Filter `agent-call` tests, resolve `{plugin}/agents/{name}.md`, infer agent from `agentFile` on expectations
    - Step 2 (`split-sets`): Re-export `splitSets` from data package
    - Step 3 (`read-agent`): Parse agent `.md` frontmatter and body, return `{ name, description, body }`
    - Step 4 (`build-temp-plugin`): Delegate to `buildTempAgentPluginWithDescription`
    - Step 5 (`run-eval`): Execute tests, use `evaluateAgentCall`, return `AcilQueryResult[]`
    - Step 6 (`score`): Re-export from `common/score.js`
    - Step 7 (`improve-description`): Use `buildAcilImprovementPrompt` with `agentName`/`agentBody`
    - Step 8 (`apply-description`): Write to agent `.md` file
    - Step 9 (`write-output`): Delegate to `common/write-output.js` with `prefix: 'acil'`
    - Step 10 (`print-report`): Re-export from `common/print-report.js`

    **Acceptance criteria**:
    - All 10 step files exist in `tests/packages/execution/src/acil/`
    - Reused steps (2, 6, 9, 10) delegate to `common/` implementations
    - Adapted steps use agent-specific types and terminology
    - Step 9 produces `acil-iteration.jsonl` and `acil-summary.json` filenames

16. As a harness developer, I want an ACIL loop orchestrator that coordinates all steps, so that the full improvement loop runs end-to-end.

    **Implementation detail**: Create `tests/packages/execution/src/acil/loop.ts` exporting `runAcilLoop(config: AcilConfig)`. Mirrors `scil/loop.ts` structure: resolve → split → read → iterate (build, eval, score, write, print, improve) → apply. Early exit on perfect accuracy. Export `runAcilLoop` and `AcilConfig` from `tests/packages/execution/index.ts`.

    **Acceptance criteria**:
    - `runAcilLoop` orchestrates steps 1-10 in correct order
    - Early exit when train accuracy (and test accuracy if holdout > 0) reaches 100%
    - Best iteration selected by test accuracy (or train if no holdout)
    - Apply step prompts user before writing (unless `--apply` flag set)
    - Exported from the execution package

### Phase 5 — CLI Command

17. As an end-user, I want an `./harness acil` CLI command, so that I can run the agent-call improvement loop from the terminal.

    **Implementation detail**: Create `tests/packages/cli/src/commands/acil.ts` mirroring `scil.ts`. Register in CLI entry point.

    **Acceptance criteria**:
    - `./harness acil --help` prints usage with all options
    - `./harness acil --suite <name>` runs the ACIL loop end-to-end
    - Options: `--suite` (required), `--agent` (optional, plugin:agent format), `--max-iterations` (default 5), `--holdout` (default 0), `--concurrency` (default 1), `--runs-per-query` (default 1), `--model` (default opus), `--debug`, `--apply`
    - `--agent` is optional and can be inferred from test expectations (like SCIL's `--skill`)

18. As an end-user, I want the ACIL CLI to display iteration progress and a final summary, so that I can see how the description is improving across iterations.

    **Acceptance criteria**:
    - Each iteration prints train/test accuracy and pass/fail per test case
    - Final summary shows original vs. best description, accuracy comparison, and iteration count
    - Output format matches existing SCIL output style

### Phase 6 — Dashboard & Analytics

19. As an end-user, I want ACIL run history visible in the web dashboard, so that I can review past improvement runs and their results.

    **Implementation detail**: Update `tests/packages/data/src/run-status.ts` to recognize `acil-iteration.jsonl` and `acil-summary.json`. Add `queryAcilHistory` and `queryAcilRunDetails` functions parallel to the SCIL equivalents.

    **Acceptance criteria**:
    - Run status detection recognizes ACIL output files alongside SCIL files
    - ACIL runs appear in the dashboard run list with correct type labeling
    - Run details page shows iteration history and accuracy progression

20. As an end-user, I want ACIL iteration data ingested into the analytics pipeline, so that ACIL results are queryable and comparable over time.

    **Implementation detail**: Update `tests/packages/data/src/analytics.ts` to ingest `acil-iteration.jsonl` records into Parquet. Update `tests/packages/cli/src/commands/update-analytics.ts` to pick up ACIL output files.

    **Acceptance criteria**:
    - `update-analytics` command processes ACIL JSONL files into Parquet
    - ACIL records are distinguishable from SCIL records in the analytics data

21. As an end-user, I want ACIL-specific views in the web dashboard (route, iteration history, summary), so that I can visualize agent description improvement progress.

    **Implementation detail**: Add views in `tests/packages/web/` parallel to existing SCIL views.

    **Acceptance criteria**:
    - Dashboard has a route for ACIL runs
    - Iteration history displays per-iteration accuracy and description changes
    - Summary view shows original vs. best description

### Phase 7 — `/write-acil-evals` Skill

22. As an end-user, I want a `/write-acil-evals` skill that generates agent-call test suites, so that I can quickly create evaluation prompts for any custom agent.

    **Implementation detail**: Create `.claude/skills/write-acil-evals/SKILL.md` modeled on `.claude/skills/write-scil-evals/SKILL.md`. 9-step workflow adapted for agents.

    **Acceptance criteria**:
    - Skill exists at `.claude/skills/write-acil-evals/SKILL.md` with correct frontmatter
    - Accepts `plugin:agent` argument (e.g., `r-and-d:gap-analyzer`)
    - Validates that the agent file exists at `{plugin}/agents/{agent}.md`

23. As an end-user, I want `/write-acil-evals` to detect sibling agents AND sibling skills, so that negative test prompts cover both categories of confusion.

    **Implementation detail**: Step 2 of the skill lists all sibling agents via `{plugin}/agents/*.md` AND all sibling skills via `{plugin}/skills/*/SKILL.md`, reading each name/description.

    **Acceptance criteria**:
    - Sibling detection finds both agents and skills in the same plugin
    - Negative prompts are generated for sibling agents (tests that the wrong agent isn't triggered)
    - Negative prompts are generated for sibling skills (tests that a skill isn't triggered instead of the agent)

24. As an end-user, I want `/write-acil-evals` to generate correctly-structured test files, so that the output is immediately usable with `./harness acil`.

    **Implementation detail**: Generate prompt files named `agent-call-{descriptive-slug}.md`. Test entries use `"type": "agent-call"`, `"agentFile": "{plugin}:{agent}"`, `"model": "opus"` (positive) or `"sonnet"` (negative/sibling). Expectations use `{ "agent-call": true/false }`.

    **Acceptance criteria**:
    - Generated `tests.json` uses `agent-call` type with correct `agentFile` field
    - Positive tests use `opus` model, negative/sibling tests use `sonnet`
    - Prompt files follow `agent-call-{slug}.md` naming convention
    - 3-5 positive prompts, 3+ negative prompts, 3+ sibling prompts generated
    - Generated suite runs successfully with `./harness acil --suite <name>`

### Phase 8 — Tests

25. As a harness developer, I want co-located unit tests for every new ACIL module, so that the ACIL pipeline has the same test coverage standard as SCIL.

    **Implementation detail**: New test files co-located with their source files, following the existing `.test.ts` naming convention.

    **Acceptance criteria**:
    - `step-1-resolve-and-load.test.ts` — tests agent resolution and test loading
    - `step-3-read-agent.test.ts` — tests agent frontmatter/body parsing
    - `step-5-run-eval.test.ts` — tests evaluation with mocked Claude runs
    - `loop.test.ts` — orchestrator call-order verification (mocked steps)
    - `build-temp-plugin.test.ts` — verifies entity inclusion, stripping, description override, multi-line field handling
    - `acil-prompt.test.ts` — verifies prompt structure and agent terminology
    - All new tests pass with `make test`

26. As a harness developer, I want existing test files updated to cover agent-call behavior, so that the shared infrastructure is tested for both skill-call and agent-call paths.

    **Acceptance criteria**:
    - `stream-parser.test.ts` — `getAgentInvocations` tests with spike fixture data
    - `scil-split.test.ts` — updated for `entityFile` param rename, new `agent-call` type test
    - `config.test.ts` — `agent-call` expectation parsing (full and simplified formats)
    - `boolean-evals.test.ts` — `evaluateAgentCall` true/false positive/negative tests
    - `step-8-run-test-cases.test.ts` — agent-call dispatch test
    - All updated tests pass with `make test`

## Implementation Decisions

- **Parallel types over reused types**: ACIL gets its own `AcilQueryResult`, `AcilTrainResult`, `AcilIterationResult` rather than reusing SCIL types. This avoids misnamed fields (`skillFile` vs `agentFile`) and keeps the type system honest.
- **Shared common utilities**: Steps that are pure math or formatting (score, write-output, print-report) are extracted to `common/` and parameterized. Steps with domain-specific logic (resolve, read, eval, improve, apply) are adapted as new files.
- **Entity-level generalization**: `splitSets` is generalized with `entityFile` instead of `skillFile` since it's just a hash seed. This is the only SCIL function that changes signature.
- **Temp plugin includes ALL entities**: Both agents and skills from the source plugin are included as no-ops in the temp plugin. This ensures Claude sees the full entity landscape when making delegation decisions, matching production behavior.
- **Plugin.json declares both paths**: Temp plugin's `plugin.json` explicitly declares `"agents": "./agents"` and `"skills": "./skills"` to ensure Claude Code discovers both entity types. (Phase 0 spike confirmed agents are discovered by convention from `agents/`, but explicit declaration is preferred for clarity.)
- **Stripping strategy for agents**: Agent frontmatter fields stripped: `tools`, `disallowedTools`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `initialPrompt`. Only `name`, `description`, `model` are kept — these are the fields that influence delegation decisions.
- **Negative tests cover both entity types**: `/write-acil-evals` generates negatives targeting sibling agents AND sibling skills, since Claude could confuse an agent with either.
- **ACIL improvement prompt includes agent body**: Unlike SCIL which includes skill body, ACIL includes the full agent system prompt so the improver can understand what the agent actually does.
- **No frontmatter utility changes**: `parseDescription`, `replaceDescription`, `sanitizeForYaml` from `skill-frontmatter.ts` work on any YAML frontmatter with a `description:` field — no agent-specific changes needed.
- **Agent detection via `agentType`, not `commandName`**: Phase 0 spike confirmed that agent invocations use `tool_use_result.agentType` (not `commandName`, which is skill-only) and `status: "completed"/"failed"` (not `success: true/false`). The `ToolUseResult` type is extended with optional `agentType`, `agentId`, and `status` fields; `success` becomes optional.
- **Plugin loading via `--plugin-dir`**: Temp plugins are loaded into Claude via the `--plugin-dir` flag, already supported by `runClaude({ pluginDirs })` in the claude-integration package. No new CLI wrapper infrastructure needed.

## Testing Decisions

### What makes a good test

Tests should verify external behavior and contracts, not implementation details. For the ACIL pipeline:
- Test what a function returns or produces given specific inputs
- Mock external dependencies (Claude CLI, filesystem) but not internal logic
- Use real data structures (not mocked types) wherever possible
- Orchestrator tests verify call order and argument passing, not step internals

### Modules to test

| Module | Test Focus | Test Type |
|---|---|---|
| `common/score.ts` | Accuracy math, best-iteration selection | Unit (existing SCIL tests cover this; verify no regression) |
| `common/write-output.ts` | Filename prefix parameterization | Unit |
| `config.ts` (agent-call parsing) | Both expectation formats, validation errors | Unit |
| `stream-parser.ts` (agent invocations) | Event parsing with `agentType`/`status` fields, edge cases | Unit with fixtures from `test-fixtures/data/agent-stream-events.json` |
| `scil-split.ts` (generalized) | `entityFile` rename, `agent-call` type support | Unit |
| `acil-prompt.ts` | Prompt structure, agent terminology | Unit |
| `boolean-evals.ts` (agent-call) | True/false positive/negative evaluation | Unit |
| `build-temp-plugin.ts` | Entity inclusion, field stripping, description override | Unit + integration (filesystem) |
| `acil/step-1` | Agent resolution, test filtering | Unit |
| `acil/step-3` | Agent file parsing | Unit |
| `acil/step-5` | Evaluation with mocked runs | Unit |
| `acil/loop.ts` | Step orchestration order | Unit (mocked steps) |
| `step-8-run-test-cases.ts` | Agent-call dispatch routing | Unit |

### Prior art

- SCIL tests in `tests/packages/execution/src/scil/*.test.ts` — same step-based architecture
- `tests/packages/data/src/config.test.ts` — expectation parsing patterns
- `tests/packages/evals/src/boolean-evals.test.ts` — evaluation function testing patterns
- `tests/packages/execution/src/test-runners/skill-call/build-temp-plugin.test.ts` — temp plugin builder testing patterns
- Test data factory functions using `make*` prefix convention (see coding standards)
- Co-located `.test.ts` files next to source files

### End-to-end verification

After all unit tests pass:
1. Write a small `gap-analyzer` agent-call test suite by hand
2. Run `./harness acil --suite gap-analyzer` and verify the loop executes, scores, and improves
3. Use `/write-acil-evals r-and-d:gap-analyzer` to generate a full test suite
4. Run ACIL on the generated suite

## Out of Scope

- **Modifying SCIL behavior** — SCIL continues to work as-is; only shared utilities are extracted
- **Agent body improvement** — ACIL improves the `description` field only, not the agent's system prompt
- **Multi-plugin agent testing** — ACIL tests one agent within one plugin at a time
- **Agent argument/parameter testing** — Only description-based triggering is tested, not argument passing
- **Automated CI integration** — ACIL is a developer-run CLI tool, not a CI pipeline step
- **Agent runtime behavior testing** — ACIL tests whether Claude delegates to the right agent, not whether the agent produces correct output

## Further Notes

### Source Document

This PRD was derived from [`acil-loop-and-skill.md`](acil-loop-and-skill.md), which contains the full technical design including exact type definitions, regex patterns for frontmatter stripping, code snippets, and detailed per-step specifications. Implementers should reference the source document for code-level details not included here.

### Execution Order and Dependencies

```
Phase 0 (spike) ✅ DONE ──────────────┐
Phase 1 (extract shared utils) ───────┤
                                       ├─→ Phase 2 (data layer) ─→ Phase 3 (evals) ─→ Phase 4 (pipeline) ─→ Phase 5 (CLI)
                                       │                                                       │
                                       │                                                       └─→ Phase 6 (dashboard)
                                       │
                                       └─→ Phase 7 (/write-acil-evals skill, after Phase 2)
```

- Phase 0 completed 2026-04-02 — all dependent work (stories 8, 12, and Phases 3-6) is unblocked
- Phase 1 has no dependencies and can start immediately
- Phase 2 types/config can proceed immediately; stream parser (story 8) is now unblocked by Phase 0 completion
- Phase 6 can start once Phase 4 output formats are settled
- Phase 7 can start once Phase 2 types are done
- Phase 8 tests run alongside each phase

### Key Risks

1. ~~**Agent stream events may differ fundamentally**~~ — **DE-RISKED** (Phase 0 spike completed 2026-04-02). Agent delegation produces parseable `user` events with `tool_use_result.agentType` containing the `plugin:agent` identifier. Detection strategy confirmed: mirrors `getSkillInvocations` pattern.
2. **Large plugin context** — The r-and-d plugin has 14 agents + 11 skills. All loaded as no-ops could overwhelm Claude's selection. Mitigation: test with a smaller plugin first if needed.
3. **Multi-line frontmatter stripping** — Some agent fields like `hooks` can be multi-line YAML blocks. The regex-based stripping must handle these correctly. Critical to test thoroughly in `build-temp-plugin.test.ts`.
4. **`splitSets` rename** — Changing `skillFile` to `entityFile` touches SCIL callers and tests. Low risk but requires updating all import sites.
