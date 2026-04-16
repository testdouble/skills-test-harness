# Agent Call Improvement Loop (ACIL)

Agent descriptions determine when Claude delegates tasks to custom agents — the same mechanism used for skill triggering, but with different metadata fields and stream event shapes. The `acil` command automates the cycle of testing trigger accuracy, finding failures, improving the description, and repeating. It mirrors the [SCIL](skill-call-improvement-loop.md) architecture with agent-specific adaptations.

## How It Works

ACIL runs a loop over `agent-call` type tests in a test suite:

1. **Evaluate** — run each test case against the current agent description in a Docker container, recording whether the agent was delegated to as expected
2. **Score** — compute trigger accuracy across all test cases
3. **Improve** — send the failures and history to Claude in a Docker container and ask for an improved description, using phase-specific instructions (see [Divergent-Convergent Phases](#divergent-convergent-phases) below)
4. **Repeat** — loop up to `--max-iterations` times, tracking the best description found
5. **Apply** — write the best description back to the agent `.md` file, either automatically (`--apply`) or after prompting

At the end of every iteration, ACIL prints a progress summary. When the loop exits, it shows a table of all iterations with accuracy scores and highlights the best result.

## Prerequisites

`acil` uses the same Docker sandbox as `test-run`. Build the harness and set up the sandbox before running:

```bash
make build
./harness sandbox-setup
```

## Test Suite Requirements

`acil` reads `agent-call` type tests from `tests.json`. Only tests with `"type": "agent-call"` are used — prompt tests and skill-call tests are ignored.

Example `tests.json` with agent-call tests:

```json
{
  "plugins": ["r-and-d"],
  "tests": [
    {
      "name": "Agent Call: gap-analyzer triggered",
      "type": "agent-call",
      "model": "opus",
      "agentFile": "r-and-d:gap-analyzer",
      "promptFile": "agent-call-gap-analyzer.md",
      "scaffold": "ruby-project",
      "expect": [
        { "agent-call": true }
      ]
    },
    {
      "name": "Agent Call: gap-analyzer not triggered",
      "type": "agent-call",
      "model": "sonnet",
      "agentFile": "r-and-d:gap-analyzer",
      "promptFile": "agent-call-no-gap-analyzer.md",
      "scaffold": "ruby-project",
      "expect": [
        { "agent-call": false }
      ]
    }
  ]
}
```

Each test case checks whether the agent is delegated to (`true`) or not (`false`) for a given prompt. ACIL uses these as the evaluation set.

## Differences from SCIL

While ACIL mirrors the SCIL architecture, several key differences exist:

| Aspect | SCIL | ACIL |
|--------|------|------|
| Target file | `SKILL.md` frontmatter | Agent `.md` frontmatter |
| Entity identifier | `plugin:skill` format | `plugin:agent` format |
| Stream detection | `commandName` on `tool_use_result` events | `agentType` + `status: "completed"` on `tool_use_result` events |
| Temp plugin | Strips `allowed-tools`, `argument-hint` from skills | Strips 12 non-triggering fields from agents (`tools`, `disallowedTools`, `permissionMode`, etc.) |
| Improvement prompt | Includes skill name + description | Includes agent name + description + body |
| Frontmatter fields stripped | `allowed-tools`, `argument-hint` | `tools`, `disallowedTools`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `initialPrompt` |

## Agent Detection

ACIL detects agent delegation via stream-json events. Agent invocations appear as `user` events where `tool_use_result.agentType` is set (e.g., `"r-and-d:gap-analyzer"`) and `tool_use_result.status` is `"completed"`. This is distinct from skill detection, which uses `tool_use_result.commandName` and `tool_use_result.success`.

## Temp Plugin Isolation

For each evaluation query, ACIL builds an isolated temporary plugin containing:

- **All agents** from the source plugin — with bodies replaced by no-op responses and non-triggering frontmatter fields stripped. Only `name`, `description`, and `model` are preserved.
- **All skills** from the source plugin — with bodies replaced by no-op responses and `allowed-tools`/`argument-hint` stripped.
- **Plugin manifest** — `plugin.json` pointing to both `agents/` and `skills/` directories.

When testing an improved description, only the target agent's description is overridden — all other agents and skills retain their original descriptions.

## Pipeline Steps

The ACIL pipeline consists of 10 numbered steps in `packages/execution/src/acil/`:

| Step | File | Function | Description |
|------|------|----------|-------------|
| 1 | `step-1-resolve-and-load.ts` | `resolveAndLoad` | Filter agent-call tests, resolve agent `.md` path, validate identifier format |
| 2 | `step-2-split-sets.ts` | `splitSets` | Re-export from data package — deterministic stratified train/test split |
| 3 | `step-3-read-agent.ts` | `readAgent` | Parse agent frontmatter and body, return name/description/body |
| 4 | `step-4-build-temp-plugin.ts` | `buildTempPlugin` | Delegate to `buildTempAgentPluginWithDescription` |
| 5 | `step-5-run-eval.ts` | `runEval` | Execute tests using `evaluateAgentCall`, return `AcilQueryResult[]` |
| 6 | `step-6-score.ts` | `scoreResults` | Re-export from `common/score.ts` |
| 7 | `step-7-improve-description.ts` | `improveDescription` | Build ACIL improvement prompt, run Claude, validate result |
| 8 | `step-8-apply-description.ts` | `applyDescription` | Write improved description to agent `.md` file |
| 9 | `step-9-write-output.ts` | `writeOutput` | Delegate to `common/write-output.ts` with `prefix: 'acil'` |
| 10 | `step-10-print-report.ts` | `printReport` | Re-export from `common/print-report.ts` |

Steps 6, 9, and 10 are thin re-export wrappers around shared modules in `common/`, which are also used by the SCIL pipeline.

## Shared Modules

ACIL and SCIL share three modules in `packages/execution/src/common/`:

- **`common/score.ts`** — `scoreResults()` and `selectBestIteration()` using generic `Scoreable`/`ScoredIteration` interfaces
- **`common/write-output.ts`** — `writeIterationOutput()` and `writeSummaryOutput()` using `WritableIteration` interface, parameterized by `prefix`
- **`common/print-report.ts`** — `printIterationProgress()` and `printFinalSummary()` using `PrintableResult`/`PrintableIteration` interfaces

## Holdout Sets

When `--holdout` is greater than `0`, ACIL splits the test cases into a train set and a test set before the loop begins. The split is:

- **Deterministic** — the same suite+agent always produces the same split
- **Stratified** — at least one positive (`expected: true`) and one negative (`expected: false`) in each set when possible

During the loop, only train results are shown to the improvement prompt. Test accuracy is tracked separately and not included in the prompt, preventing data leakage. The best iteration is selected by highest test accuracy (not train accuracy) when holdout is active.

Without `--holdout`, all tests are in the train set and best iteration is selected by highest train accuracy.

## Divergent-Convergent Phases

Each iteration runs in one of three phases, determined by `getPhase(iteration, maxIterations)` from the data package. The phases control the improvement prompt strategy and early-exit behavior. ACIL uses the same phase system as SCIL — see [SCIL Divergent-Convergent Phases](skill-call-improvement-loop.md#divergent-convergent-phases) for the full description.

| Phase | Strategy | Early Exit |
|-------|----------|------------|
| **Explore** | Write a fundamentally different description from scratch | Never |
| **Transition** | Combine strongest elements from best-performing iterations | Never |
| **Converge** | Make targeted, surgical edits to fix failing cases | Yes, on perfect accuracy |

During explore and transition phases, new descriptions are always generated regardless of current accuracy. The loop only exits early on perfect accuracy once the converge phase has been reached. The phase is recorded in each iteration's output and displayed in console progress and the summary table.

## Selecting the Best Iteration

ACIL tracks the best iteration throughout the loop:

- With holdout: highest test accuracy wins; tie-break goes to the earlier iteration
- Without holdout: highest train accuracy wins; tie-break goes to the earlier iteration
- NaN accuracy values are coerced to 0 for comparison purposes

The loop exits early when both train and test accuracy reach 100%, but only during or after the converge phase.

## Applying the Description

At the end of the loop, ACIL reports the best description found. If `--apply` was passed, it writes the new description directly to the `description:` field in the agent's `.md` frontmatter. Otherwise, it prompts interactively.

The description is enforced to a maximum of 1024 characters, matching the Claude Code agent description limit.

## Output Files

Each `acil` run writes output to `tests/output/{run-id}/`:

- **`acil-iteration.jsonl`** — one line per iteration with description, accuracy scores, and per-query results
- **`acil-summary.json`** — final summary with original description, best description, best iteration number, and accuracy at each iteration

## Input Validation

ACIL validates agent identifiers before constructing file paths:

- **Format validation** — agent identifiers must match `plugin:agent` format (`/^[a-z0-9-]+:[a-z0-9-]+$/`)
- **Path traversal prevention** — resolved paths are checked with `path.resolve` + `startsWith` to ensure they stay within the repository root

## References

- [Skill Call Improvement Loop (SCIL)](skill-call-improvement-loop.md) — parallel implementation for skill descriptions
- [Test Suite Configuration](test-suite-configuration.md) — full tests.json field reference for `agent-call` type tests
- [Data Package](data.md) — shared data layer providing train/test splitting, ACIL prompt building, and frontmatter manipulation
- [Evals Package](evals.md) — evaluation engine providing `evaluateAgentCall` used by ACIL step-5
- [Execution Package](execution.md) — execution package architecture including ACIL pipeline
