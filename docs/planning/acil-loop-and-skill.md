# ACIL — Agent-Call Improvement Loop

## Context

We have a new custom agent (`r-and-d:gap-analyzer`) and want to build an automated improvement loop for agent descriptions, analogous to the existing SCIL (Skill-Call Improvement Loop). Claude Code uses an agent's `description` frontmatter to decide when to delegate tasks — just like it uses skill descriptions for triggering. ACIL will iteratively test and improve agent descriptions to maximize trigger accuracy.

## Design Decisions

- **Unit under test**: Agent `description` field (autonomous delegation by Claude)
- **Isolation**: Load target agent + ALL plugin entities (sibling agents + skills), all with no-op bodies
- **Stripping**: Keep only `name`, `description`, `model` in frontmatter; strip `tools`, `permissionMode`, `allowed-tools`, `argument-hint`, etc.
- **Naming**: `plugin:agent-name` format (matches skill-call convention)
- **CLI**: `./harness acil --suite <name>`
- **Code structure**: `tests/packages/execution/src/acil/` alongside `scil/`, shared logic extracted to `common/`
- **Improvement prompt**: Includes full agent body (system prompt)
- **Test layout**: `agent-call` as new type in existing `tests.json`
- **Types**: Create parallel ACIL types (`AcilQueryResult`, `AcilTrainResult` with `agentFile`) rather than reusing SCIL types with misnamed `skillFile`
- **Split function**: Generalize `splitSets` param from `skillFile` to `entityFile`
- **Temp plugin builder**: Shared between `test-run` agent-call runner and ACIL step-4 (located at `test-runners/agent-call/build-temp-plugin.ts`)
- **Temp plugin.json**: Explicitly declare `"agents": "./agents"` and `"skills": "./skills"`
- **Negative tests**: `/write-acil-evals` generates negatives targeting both sibling agents AND sibling skills
- **Scope**: Includes `/write-acil-evals` skill, `test-run` agent-call support, and dashboard/analytics support

## Phase 0: Spike — Capture Agent Stream Events (COMPLETED)

**Goal**: Determine the stream-json event shape when Claude delegates to a custom agent.

**Status**: Completed 2026-04-02. Full findings documented in [`../agent-stream-event-spike.md`](../agent-stream-event-spike.md). Fixture data saved at `tests/packages/test-fixtures/data/agent-stream-events.json`.

### Findings

**Method**: Ran Claude with `--print --verbose --output-format stream-json --plugin-dir r-and-d` and a prompt that triggered the `gap-analyzer` agent.

**Agent discovery**: Custom agents from plugins appear in the `system.init` event's `agents` array using `plugin:agent` format (e.g., `r-and-d:gap-analyzer`). Agents are discovered from the `agents/` directory by convention — no explicit `"agents"` key is required in `plugin.json`.

**Detection path**: Agent invocations are detectable via `user` events with `tool_use_result.agentType`:

```json
{
  "type": "user",
  "tool_use_result": {
    "status": "completed",
    "agentId": "ae0cc5e57350ea3cb",
    "agentType": "r-and-d:gap-analyzer",
    "totalDurationMs": 219806,
    "totalTokens": 76750,
    "totalToolUseCount": 30
  }
}
```

**Key differences from skill invocations**:

| Aspect | Skill Invocation | Agent Invocation |
|--------|-----------------|------------------|
| Tool name in assistant event | `Skill` | `Agent` |
| Identifier field in `tool_use_result` | `commandName` | `agentType` |
| Success indicator | `success: true/false` | `status: "completed"/"failed"` |
| Identifier format | `skill-name` | `plugin:agent-name` |
| System events | None | `task_started`, `task_progress`, `task_notification` |

**Type impact**: `ToolUseResult` must be extended with `agentType?`, `agentId?`, `status?`. The `success` field must become optional (agent results do not include it).

**Plugin loading**: `--plugin-dir <path>` loads a local plugin directory. Already supported by `runClaude({ pluginDirs: [tempDir] })` in the claude-integration package. No new infrastructure needed for temp plugin loading.

## Phase 1: Extract Shared Utilities from SCIL

Extract reusable SCIL steps into `tests/packages/execution/src/common/`:

| File | Extracted From | Changes |
|---|---|---|
| `common/score.ts` | `scil/step-6-score.ts` | None — pure math, self-contained, no external deps beyond type imports |
| `common/write-output.ts` | `scil/step-9-write-output.ts` | Add `prefix` param to parameterize filenames (`scil-iteration.jsonl` → `{prefix}-iteration.jsonl`) |
| `common/print-report.ts` | `scil/step-10-print-report.ts` | None — already uses neutral terminology ("Iteration", "Train", "Test", no "skill" wording) |

Update SCIL step files to re-export from `common/`:
- `scil/step-6-score.ts` → re-export from `../common/score.js`
- `scil/step-9-write-output.ts` → delegate to `../common/write-output.js` with `prefix: 'scil'`
- `scil/step-10-print-report.ts` → re-export from `../common/print-report.js`

**Verification**: `make test` — all existing SCIL tests pass after extraction.

## Phase 2: Update Data Layer

### 2.1 Types (`tests/packages/data/src/types.ts`)

Add to `TestExpectation` union:
```typescript
| { type: 'agent-call'; value: boolean; agentFile: string }
```

Add to `TestCase`:
```typescript
agentFile?: string
```

Add parallel ACIL types (not reusing `ScilTrainResult` / `QueryResult` which have `skillFile`):
```typescript
export interface AcilTrainResult {
  testName:  string
  agentFile: string
  expected:  boolean
  actual:    boolean
  passed:    boolean
  runIndex:  number
}

export interface AcilQueryResult {
  testName:      string
  agentFile:     string
  promptContent: string
  expected:      boolean
  actual:        boolean
  passed:        boolean
  runIndex:      number
  events:        StreamJsonEvent[]
}

export interface AcilIterationResult {
  iteration:     number
  description:   string
  trainResults:  AcilQueryResult[]
  testResults:   AcilQueryResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

export interface AcilTestCase extends TestCase {
  set: 'train' | 'test'
}
```

### 2.2 Config parser (`tests/packages/data/src/config.ts`)

Add `agent-call` parsing block in the `expect.map` callback (after the `skill-call` block):
```typescript
if (type === 'agent-call') {
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    // Full format: { "agent-call": { "agent": "...", "expected": true/false } }
    // Validate obj.agent (string) and obj.expected (boolean)
    return { type: 'agent-call', value: obj.expected, agentFile: obj.agent } as TestExpectation
  }
  // Simplified format: { "agent-call": true/false } with test.agentFile
  // Validate value is boolean and test.agentFile exists
  return { type: 'agent-call', value, agentFile: test.agentFile } as TestExpectation
}
```

### 2.3 Type update: `ToolUseResult` (`tests/packages/data/src/types.ts`)

Extend `ToolUseResult` to support agent result fields (Phase 0 spike finding):

```typescript
export interface ToolUseResult {
  commandName?: string    // present on skill invocations
  success?:     boolean   // present on skill invocations (was required, now optional)
  agentType?:   string    // present on agent invocations — "plugin:agent" format
  agentId?:     string    // present on agent invocations — task execution ID
  status?:      string    // present on agent invocations — "completed" | "failed"
}
```

**Breaking change**: `success` changes from required to optional. Existing code that reads `success` already checks for truthy values (`=== true`), so this is safe.

### 2.4 Stream parser (`tests/packages/data/src/stream-parser.ts`)

Add `getAgentInvocations`:

```typescript
export function getAgentInvocations(events: StreamJsonEvent[]): string[] {
  return events
    .filter(e => {
      const userEvent = e as UserEvent
      return (
        userEvent.type === 'user' &&
        userEvent.tool_use_result?.agentType != null &&
        userEvent.tool_use_result.status === 'completed'
      )
    })
    .map(e => (e as UserEvent).tool_use_result!.agentType!)
}
```

This mirrors `getSkillInvocations` but uses `agentType` (instead of `commandName`) and `status === 'completed'` (instead of `success === true`).

Add tests in `stream-parser.test.ts` using fixture data from `tests/packages/test-fixtures/data/agent-stream-events.json`.

Export from `tests/packages/data/index.ts` (already exports from `stream-parser.js`, so the new function is automatically available).

### 2.5 Split sets (`tests/packages/data/src/scil-split.ts`)

Two changes:

1. **Rename `skillFile` param to `entityFile`** in `splitSets` signature (it's just a hash seed):
   ```typescript
   export function splitSets(suite: string, entityFile: string, tests: TestCase[], holdout: number)
   ```

2. **Update `getExpectedTrigger`** to recognize both types:
   ```typescript
   function getExpectedTrigger(test: TestCase): boolean {
     for (const e of test.expect) {
       if (e.type === 'skill-call' || e.type === 'agent-call') {
         return (e as { value: boolean }).value
       }
     }
     return true
   }
   ```

Update all callers of `splitSets` (SCIL `step-2` and any tests) for renamed param.

### 2.6 ACIL improvement prompt (`tests/packages/data/src/acil-prompt.ts`)

New file modeled on `scil-prompt.ts` with agent-specific wording:
- "You are an expert at writing agent descriptions for Claude Code plugins."
- "An agent description determines when Claude delegates to the agent."
- `## Agent Name` / `## Agent Body (what the agent does)`
- Parameters: `agentName`, `currentDescription`, `agentBody`, `trainResults`, `iterations`, `holdout`
- Uses `AcilQueryResult` type for train results (has `agentFile` not `skillFile`)

Export from `tests/packages/data/index.ts`.

### 2.7 Frontmatter utilities

`tests/packages/data/src/skill-frontmatter.ts` — `parseDescription`, `replaceDescription`, `sanitizeForYaml` are all generic YAML operations. They work on any file with a `description:` field. **No changes needed** — reuse directly for agent `.md` files.

## Phase 3: Add Agent Evaluation

In `tests/packages/evals/src/boolean-evals.ts`:

1. Add `evaluateAgentCall`:
   ```typescript
   export function evaluateAgentCall(agentFile: string, shouldBeCalled: boolean, events: StreamJsonEvent[]): boolean {
     const called = getAgentInvocations(events).includes(agentFile)
     return shouldBeCalled ? called : !called
   }
   ```

2. Add `agent-call` case to `evaluateExpectation` switch:
   ```typescript
   case 'agent-call':
     passed = evaluateAgentCall(expectation.agentFile, expectation.value, events)
     break
   ```

3. `EvaluableExpectation` type (`Exclude<TestExpectation, { type: 'llm-judge' }>`) automatically includes `agent-call` once the union is updated. No change needed.

4. `evaluateAllExpectations` — no change needed; filters by `!== 'llm-judge'` which passes `agent-call` through.

5. `test-eval` (`tests/packages/evals/src/evaluate.ts`) — no change needed; delegates to `evaluateAllExpectations` which handles the new type.

6. Add tests in `boolean-evals.test.ts`.

## Phase 4: Build ACIL Pipeline

### 4.1 Agent-Call Temp Plugin Builder (shared)

Create `tests/packages/execution/src/test-runners/agent-call/build-temp-plugin.ts`:

This is the most complex new code. Shared by both `test-run` agent-call runner (Phase 4.2) and ACIL step-4 (Phase 4.4).

Two exported functions (mirroring `skill-call/build-temp-plugin.ts`):

**`buildTempAgentPlugin(agentFile, runDir, repoRoot)`** — for test-run (uses original description):
1. Parse `pluginName` and `agentName` from `agentFile` (split on `:`)
2. Read original `plugin.json` from `{repoRoot}/{pluginName}/.claude-plugin/plugin.json`
3. Glob `{repoRoot}/{pluginName}/agents/*.md` for all agents
4. Glob `{repoRoot}/{pluginName}/skills/*/SKILL.md` for all skills
5. Create temp directory at `{runDir}/temp-plugins/{pluginName}-{agentName}/`
6. Write `.claude-plugin/plugin.json` with explicit `"agents": "./agents"` and `"skills": "./skills"`
7. For each agent: parse frontmatter, keep `name`/`description`/`model`, strip everything else, replace body with no-op
8. For each skill: parse frontmatter, keep `name`/`description`, strip `allowed-tools`/`argument-hint`, replace body with no-op
9. Return `{ tempDir }`

**`buildTempAgentPluginWithDescription(agentFile, runDir, overrideDescription, repoRoot)`** — for ACIL (overrides target agent description):
- Same as above but replaces target agent's description with `overrideDescription`

No-op bodies:
- Agents: `\nRespond with: "agent triggered" — nothing else.\n`
- Skills: `\nRespond with: "skill triggered" — nothing else.\n`

Stripping function for agents:
```typescript
function stripNonTriggeringAgentFields(frontmatter: string): string {
  return frontmatter
    .replace(/^tools:.*$/m, '')
    .replace(/^disallowedTools:.*$/m, '')
    .replace(/^permissionMode:.*$/m, '')
    .replace(/^maxTurns:.*$/m, '')
    .replace(/^skills:.*$/m, '')
    .replace(/^mcpServers:.*$/m, '')
    .replace(/^hooks:[\s\S]*?(?=\n\w|\n---)/m, '')  // multi-line hooks block
    .replace(/^memory:.*$/m, '')
    .replace(/^background:.*$/m, '')
    .replace(/^effort:.*$/m, '')
    .replace(/^isolation:.*$/m, '')
    .replace(/^initialPrompt:.*$/m, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
```

### 4.2 Agent-Call Test Runner for `test-run`

Create `tests/packages/execution/src/test-runners/agent-call/index.ts`:

Export `runAgentCallTests(tests, config, suite, testSuiteDir, debug, testRunId, totals, outputDir, repoRoot)` — mirrors `runSkillCallTests` from `skill-call/index.ts`:
- Uses `buildTempAgentPlugin` (from same directory) instead of `buildTempPlugin`
- Uses `test.agentFile!` instead of `test.skillFile!`
- Logs `agentFile` in test config output

Update `tests/packages/execution/src/test-runners/steps/step-8-run-test-cases.ts`:
```typescript
import { runAgentCallTests } from '../agent-call/index.js'

// Add after existing filters:
const agentCallTests = config.tests.filter(t => t.type === 'agent-call')

// Add after existing runners:
current = await runAgentCallTests(agentCallTests, config, suite, testSuiteDir, debug, testRunId, current, outputDir, repoRoot)
```

### 4.3 ACIL Types

Create `tests/packages/execution/src/acil/types.ts`:
```typescript
export type { AcilTestCase, AcilQueryResult, AcilIterationResult } from '@testdouble/harness-data'

export interface AcilConfig {
  suite:         string
  agent?:        string      // plugin:agent-name format
  maxIterations: number
  holdout:       number
  concurrency:   number
  runsPerQuery:  number
  model:         string
  debug:         boolean
  apply:         boolean
  outputDir:     string
  testsDir:      string
  repoRoot:      string
}
```

### 4.4 ACIL Pipeline Steps

Create `tests/packages/execution/src/acil/` with:

| Step | File | Strategy | Key Differences from SCIL |
|---|---|---|---|
| 1 | `step-1-resolve-and-load.ts` | **Adapt** | Filter `agent-call` tests; resolve `{plugin}/agents/{name}.md`; infer agent from `agentFile` on expectations |
| 2 | `step-2-split-sets.ts` | **Reuse** | Re-export `splitSets` from `@testdouble/harness-data` |
| 3 | `step-3-read-agent.ts` | **Adapt** | Read agent `.md`; reuse `parseDescription` from `@testdouble/harness-data` |
| 4 | `step-4-build-temp-plugin.ts` | **Delegate** | Import `buildTempAgentPluginWithDescription` from `../test-runners/agent-call/build-temp-plugin.js` |
| 5 | `step-5-run-eval.ts` | **Adapt** | Import `evaluateAgentCall` from `@testdouble/harness-evals`; use `AcilQueryResult` |
| 6 | `step-6-score.ts` | **Reuse** | Re-export from `../common/score.js` |
| 7 | `step-7-improve-description.ts` | **Adapt** | Use `buildAcilImprovementPrompt` with `agentName`/`agentBody` params |
| 8 | `step-8-apply-description.ts` | **Adapt** | Write to agent `.md` instead of `SKILL.md`; prompt says "agent .md" |
| 9 | `step-9-write-output.ts` | **Reuse** | Delegate to `../common/write-output.js` with `prefix: 'acil'` |
| 10 | `step-10-print-report.ts` | **Reuse** | Re-export from `../common/print-report.js` |
| — | `loop.ts` | **Adapt** | Orchestrator mirroring `scil/loop.ts` with agent-specific imports |

### 4.5 ACIL Loop Orchestrator

`tests/packages/execution/src/acil/loop.ts` — mirrors `scil/loop.ts` structure:
- Step 1: `resolveAndLoad(config.suite, config.agent, config.testsDir, config.repoRoot)`
- Step 2: `splitSets(config.suite, agentFile, tests, config.holdout)`
- Step 3: `readAgent(agentMdPath)` → returns `{ name, description, body }`
- Steps 4-10: Same loop structure as SCIL
- Apply step: writes to agent `.md` path, prompts "Apply this description to agent .md?"

Export from `tests/packages/execution/index.ts`:
```typescript
export { runAcilLoop } from './src/acil/loop.js'
export type { AcilConfig } from './src/acil/types.js'
```

## Phase 5: Add CLI Command

Create `tests/packages/cli/src/commands/acil.ts` mirroring `scil.ts`:
- `command = 'acil'`
- `describe = 'Agent Call Improvement Loop — iteratively improve an agent description for trigger accuracy'`
- Options: `--suite` (required), `--agent` (optional, plugin:agent format), `--max-iterations` (5), `--holdout` (0), `--concurrency` (1), `--runs-per-query` (1), `--model` (opus), `--debug`, `--apply`
- Handler: construct `AcilConfig` from argv + paths, call `runAcilLoop(config)`
- Paths from `../paths.js` (same as SCIL)

Register in CLI entry point (check how `scil` is registered — likely auto-discovered via Yargs command directory or explicit import).

## Phase 6: Dashboard & Analytics Support

### 6.1 Run status detection (`tests/packages/data/src/run-status.ts`)

Update to recognize `acil-iteration.jsonl` and `acil-summary.json` alongside SCIL files when determining run type and status.

### 6.2 Analytics pipeline (`tests/packages/data/src/analytics.ts`)

Update to ingest `acil-iteration.jsonl` records into analytics, parallel to SCIL iteration ingestion.

### 6.3 Update analytics CLI (`tests/packages/cli/src/commands/update-analytics.ts`)

Ensure `update-analytics` command picks up ACIL output files.

### 6.4 Web dashboard (`tests/packages/web/`)

Add ACIL views parallel to existing SCIL views:
- Route for ACIL runs
- Iteration history display
- Summary view

## Phase 7: Build `/write-acil-evals` Skill

Create `.claude/skills/write-acil-evals/SKILL.md` modeled on `.claude/skills/write-scil-evals/SKILL.md`.

9-step workflow adapted for agents:

1. **Identify target agent** — Parse `plugin:agent` arg, validate `{plugin}/agents/{agent}.md` exists, read name/description
2. **Detect siblings** — List all sibling **agents** via `{plugin}/agents/*.md` AND all sibling **skills** via `{plugin}/skills/*/SKILL.md`; read each name/description
3. **Determine test suite location** — Default `tests/test-suites/{agent-name}/`
4. **Collect positive trigger prompts** — 3-5 prompts that SHOULD trigger the agent
5. **Collect negative trigger prompts** — 3+ prompts with overlapping vocabulary but different intent
6. **Collect sibling trigger prompts** — 3+ prompts targeting sibling agents AND sibling skills (both categories)
7. **Generate test configuration** — For each prompt:
   - Create prompt file named `agent-call-{descriptive-slug}.md`
   - Create test entry with `"type": "agent-call"`, `"agentFile": "{plugin}:{agent}"`, `"model": "opus"` (positive) or `"sonnet"` (negative/sibling), `"expect": [{ "agent-call": true/false }]`
8. **Present summary for review**
9. **Write files** after user confirms

## Phase 8: Tests

Co-located `.test.ts` for each new file:

**New test files:**
- `tests/packages/execution/src/acil/step-1-resolve-and-load.test.ts`
- `tests/packages/execution/src/acil/step-3-read-agent.test.ts`
- `tests/packages/execution/src/acil/step-5-run-eval.test.ts`
- `tests/packages/execution/src/acil/loop.test.ts` (orchestrator call-order verification)
- `tests/packages/execution/src/test-runners/agent-call/build-temp-plugin.test.ts` (critical — verify all entities included as no-ops, stripping correct, description override works)
- `tests/packages/data/src/acil-prompt.test.ts`

**Updated test files:**
- `tests/packages/data/src/stream-parser.test.ts` — add `getAgentInvocations` tests
- `tests/packages/data/src/scil-split.test.ts` — update for renamed `entityFile` param, add `agent-call` type test
- `tests/packages/data/src/config.test.ts` — add `agent-call` parsing tests
- `tests/packages/evals/src/boolean-evals.test.ts` — add `evaluateAgentCall` tests
- `tests/packages/execution/src/test-runners/steps/step-8-run-test-cases.test.ts` — add agent-call dispatch test

## Execution Order

```
Phase 0 (spike) ✅ DONE ──────────────┐
Phase 1 (extract shared utils) ───────┤
                                       ├─→ Phase 2 (data layer) ─→ Phase 3 (evals) ─→ Phase 4 (pipeline + test-run) ─→ Phase 5 (CLI)
                                       │                                                       │
                                       │                                                       └─→ Phase 6 (dashboard)
                                       │
                                       └─→ Phase 7 (write-acil-evals skill, after Phase 2)
```

- Phase 0 completed 2026-04-02 — all dependent work is unblocked
- Phase 1 has no dependencies and can start immediately
- Phase 6 can start once Phase 4 output formats are settled
- Phase 7 can start once Phase 2 types are done
- Phase 8 (tests) runs alongside each phase

## Verification

1. **After Phase 0** ✅: Documented stream event shape at `tests/docs/agent-stream-event-spike.md`; fixture data saved at `tests/packages/test-fixtures/data/agent-stream-events.json`; detection path confirmed via `tool_use_result.agentType`
2. **After Phase 1**: `make test` — all existing SCIL tests pass with extracted common utilities
3. **After Phase 2**: Unit tests for new types, config parsing, split generalization, ACIL prompt
4. **After Phase 3**: Unit tests for `evaluateAgentCall`
5. **After Phase 4**: `make test` — all ACIL and test-run unit tests pass
6. **After Phase 5**: `./harness acil --help` prints usage; `./harness acil --suite gap-analyzer` runs end-to-end
7. **End-to-end**: Write a small gap-analyzer agent-call test suite by hand, run `./harness acil --suite gap-analyzer` and verify the loop executes, scores, and improves the description
8. **Write-acil-evals**: Use `/write-acil-evals r-and-d:gap-analyzer` to generate a full test suite, then run ACIL on it

## Key Risks

1. ~~**Agent stream events may differ fundamentally**~~ — **DE-RISKED** (Phase 0 spike completed 2026-04-02). Agent delegation produces parseable `user` events with `tool_use_result.agentType` containing the `plugin:agent` identifier. Detection strategy confirmed and implementation path defined
2. **Large plugin context** — r-and-d has 14 agents + 11 skills; all loaded as no-ops could overwhelm Claude's selection. Mitigation: test with a smaller plugin first if needed
3. **Multi-line frontmatter stripping** — some agent fields like `hooks` can be multi-line YAML blocks. The stripping regex must handle these correctly. The `build-temp-plugin.test.ts` tests should cover this
4. **`splitSets` rename** — changing `skillFile` to `entityFile` touches SCIL callers and tests. Low risk but requires updating imports
