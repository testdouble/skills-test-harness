# Execution Package

The `@testdouble/harness-execution` package owns all test execution orchestration, the SCIL and ACIL improvement loops, and test evaluation pipelines — extracted from the CLI to keep the CLI as a thin Yargs wrapper.

- **Last Updated:** 2026-04-06
- **Authors:**
  - River Bailey (river@testdouble.com)

## Overview

- Four high-level orchestrators: `runTestSuite()` for test execution, `runTestEval()` for result evaluation, `runScilLoop()` for iterative skill description improvement, and `runAcilLoop()` for iterative agent description improvement
- All filesystem paths (`outputDir`, `testsDir`, `repoRoot`) are passed as parameters — the package never calls `process.cwd()` or reads environment variables
- Owns the error hierarchy (`HarnessError`, `ConfigNotFoundError`, `RunNotFoundError`), path config factory, and the step-based pipelines that coordinate the other packages
- Sits between the CLI (which parses args and resolves paths) and the lower-level packages (harness-data, harness-evals, claude-integration, docker-integration)

Key files:
- `packages/execution/index.ts` — Barrel exports (public API surface)
- `packages/execution/src/test-suite/run-test-suite.ts` — Test execution orchestrator
- `packages/execution/src/test-eval/run-test-eval.ts` — Evaluation orchestrator
- `packages/execution/src/scil/loop.ts` — SCIL improvement loop orchestrator
- `packages/execution/src/scil/types.ts` — `ScilConfig` interface and re-exported SCIL types
- `packages/execution/src/acil/loop.ts` — ACIL improvement loop orchestrator
- `packages/execution/src/acil/types.ts` — `AcilConfig` interface and re-exported ACIL types

## Architecture

```
                                CLI (thin wrapper)
                                      │
              ┌──────────────┬────────┼────────┬──────────────┐
              v              v        v        v              v
       runTestSuite()  runTestEval()  │  runScilLoop()  runAcilLoop()
              │              │        │        │              │
              v              v        v        v              v
          ┌──────────────────────────────────────────────────────────┐
          │             @testdouble/harness-execution                │
          │                                                          │
          │  test-runners/steps/     test-eval/       scil/   acil/  │
          │  ├── step-1 resolve      run-test-eval    loop    loop   │
          │  ├── step-2 validate     test-eval-steps/ steps   steps  │
          │  ├── step-3 read-config                   1-10    1-10   │
          │  ├── step-4 generate-id  lib/             common/        │
          │  ├── step-6 build-flags  ├── errors.ts    score          │
          │  ├── step-7 init-totals  ├── path-config  write-out      │
          │  ├── step-8 run-tests    ├── metrics.ts   print-rpt      │
          │  ├── step-9 print-totals └── output.ts                   │
          │  └── step-10 exit                                        │
          │                                                          │
          │  test-runners/prompt/    test-runners/skill-call/        │
          │  └── runPromptTests()    ├── runSkillCallTests()         │
          │                          └── buildTempPlugin()           │
          │                          test-runners/agent-call/        │
          │                          └── buildTempAgentPlugin()      │
          └────────┬────────────┬───────────────┬────────────────────┘
                   │            │               │
                   v            v               v
           harness-data   harness-evals   claude-integration
                                               │
                                               v
                                       docker-integration
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/execution/index.ts` | Barrel exports — public API for CLI consumption |
| `packages/execution/src/test-suite/run-test-suite.ts` | `runTestSuite()` — orchestrates the test-run pipeline |
| `packages/execution/src/test-eval/run-test-eval.ts` | `runTestEval()` — orchestrates eval pipeline, converts results |
| `packages/execution/src/scil/loop.ts` | `runScilLoop()` — orchestrates the iterative SCIL improvement loop |
| `packages/execution/src/scil/types.ts` | `ScilConfig` interface, re-exports `ScilTestCase`, `QueryResult`, `IterationResult` |
| `packages/execution/src/test-runners/prompt/index.ts` | Prompt test runner — full Claude sessions with output file extraction |
| `packages/execution/src/test-runners/skill-call/index.ts` | Skill-call test runner — trigger detection with temp plugins |
| `packages/execution/src/test-runners/agent-prompt/index.ts` | Agent-prompt test runner — agent delegation with output file extraction |
| `packages/execution/src/test-runners/agent-call/index.ts` | Agent-call test runner — trigger detection with temp agent plugins |
| `packages/execution/src/test-runners/skill-call/build-temp-plugin.ts` | Temp plugin builder — strips non-triggering fields |
| `packages/execution/src/test-runners/steps/` | 10 numbered step files for the test-run pipeline |
| `packages/execution/src/common/score.ts` | `scoreResults()`, `selectBestIteration()` — shared scoring logic |
| `packages/execution/src/common/write-output.ts` | `writeIterationOutput()`, `writeSummaryOutput()` — shared output writers with prefix parameter |
| `packages/execution/src/common/print-report.ts` | `printIterationProgress()`, `printFinalSummary()` — shared console reporting |
| `packages/execution/src/scil/step-1-resolve-and-load.ts` | Resolves target skill and loads skill-call tests |
| `packages/execution/src/scil/step-5-run-eval.ts` | Runs eval with concurrency pool and majority vote |
| `packages/execution/src/scil/step-6-score.ts` | Re-exports `scoreResults`, `selectBestIteration` from `common/score.ts` |
| `packages/execution/src/scil/step-7-improve-description.ts` | Generates improved descriptions via Claude |
| `packages/execution/src/scil/step-8-apply-description.ts` | Writes best description back to SKILL.md |
| `packages/execution/src/acil/loop.ts` | `runAcilLoop()` — orchestrates the iterative ACIL improvement loop |
| `packages/execution/src/acil/types.ts` | `AcilConfig` interface, re-exports `AcilTestCase`, `AcilQueryResult`, `AcilIterationResult` |
| `packages/execution/src/acil/step-1-resolve-and-load.ts` | Resolves target agent and loads agent-call tests |
| `packages/execution/src/acil/step-3-read-agent.ts` | Reads agent .md frontmatter (name, description, body) |
| `packages/execution/src/acil/step-5-run-eval.ts` | Runs agent-call eval with concurrency pool and majority vote |
| `packages/execution/src/acil/step-7-improve-description.ts` | Generates improved agent descriptions via Claude |
| `packages/execution/src/acil/step-8-apply-description.ts` | Writes best description back to agent .md |
| `packages/execution/src/lib/errors.ts` | `HarnessError`, `ConfigNotFoundError`, `RunNotFoundError` |
| `packages/execution/src/lib/path-config.ts` | `createPathConfig()` — derives all paths from a root directory |
| `packages/execution/src/lib/metrics.ts` | `accumulateTotals()` — immutable token/duration accumulator |
| `packages/execution/src/lib/output.ts` | `writeTestOutput()` — writes test config and run events to JSONL |

## Core Types

```typescript
// packages/execution/src/test-suite/run-test-suite.ts
interface RunTestSuiteOptions {
  suites: string[]       // Suite names to execute
  testFilter?: string    // Optional: filter to single test by name
  debug: boolean         // Show Docker output in real time
  outputDir: string      // Where to write JSONL output (e.g., tests/output/)
  testsDir: string       // Root tests/ directory
  repoRoot: string       // Repository root (parent of testsDir)
}

interface RunTestSuiteResult {
  testRunId: string          // Generated timestamp ID (YYYYMMDDTHHmmss)
  totalDurationMs: number    // Total execution time across all tests
  totalInputTokens: number   // Total input tokens consumed
  totalOutputTokens: number  // Total output tokens consumed
  failures: number           // Number of failed tests
}

// packages/execution/src/test-eval/run-test-eval.ts
interface RunTestEvalOptions {
  testRunId?: string  // Specific run to evaluate (omit to evaluate all unevaluated)
  debug: boolean      // Enable debug output
  outputDir: string   // Where run output is stored
  testsDir: string    // Root tests/ directory (for rubric file resolution)
}

// packages/execution/src/scil/types.ts
interface ScilConfig {
  suite: string           // Test suite name
  skill?: string          // Target skill in plugin:skill format (inferred if omitted)
  maxIterations: number   // Maximum improvement iterations
  holdout: number         // Fraction held out for validation (0-1)
  concurrency: number     // Parallel sandbox exec calls
  runsPerQuery: number    // Runs per test case for majority vote
  model: string           // Model for improvement prompt
  debug: boolean          // Show Docker output in real time
  apply: boolean          // Auto-apply best description without prompting
  outputDir: string       // Where to write SCIL output
  testsDir: string        // Root tests/ directory
  repoRoot: string        // Repository root
}

// packages/execution/src/acil/types.ts
interface AcilConfig {
  suite: string           // Test suite name
  agent?: string          // Target agent in plugin:agent format (inferred if omitted)
  maxIterations: number   // Maximum improvement iterations
  holdout: number         // Fraction held out for validation (0-1)
  concurrency: number     // Parallel sandbox exec calls
  runsPerQuery: number    // Runs per test case for majority vote
  model: string           // Model for improvement prompt
  debug: boolean          // Show Docker output in real time
  apply: boolean          // Auto-apply best description without prompting
  outputDir: string       // Where to write ACIL output
  testsDir: string        // Root tests/ directory
  repoRoot: string        // Repository root
}

// packages/execution/src/lib/path-config.ts
interface PathConfig {
  testsDir: string    // = rootDir
  harnessDir: string  // = rootDir/packages
  repoRoot: string    // = rootDir/..
  outputDir: string   // = rootDir/output
  dataDir: string     // = rootDir/analytics
}

// packages/execution/src/scil/step-3-read-skill.ts
interface SkillFileContent {
  name: string            // Skill name from frontmatter
  description: string     // Current description from frontmatter
  frontmatterRaw: string  // Raw YAML frontmatter
  body: string            // Markdown body after frontmatter
  fullContent: string     // Complete file content
}

// packages/execution/src/lib/errors.ts
class HarnessError extends Error              // Base error — caught at CLI for clean exit
class ConfigNotFoundError extends HarnessError  // tests.json not found
class RunNotFoundError extends HarnessError     // Test run directory not found
```

## Implementation Details

### Path Parameter Design

The execution package never resolves paths from `process.cwd()`. The CLI owns path resolution via `createPathConfig(process.cwd())` and passes the individual fields as parameters:

```typescript
// CLI (packages/cli/src/paths.ts) — the only place process.cwd() is called
import { createPathConfig } from '@testdouble/harness-execution'
const config = createPathConfig(process.cwd())
export const outputDir = config.outputDir
export const testsDir = config.testsDir
export const repoRoot = config.repoRoot

// CLI command (packages/cli/src/commands/test-run.ts) — passes paths explicitly
const result = await runTestSuite({
  suites, testFilter, debug,
  outputDir, testsDir, repoRoot,
})
```

Paths flow through every layer — from orchestrator to step to runner — as explicit function parameters. This makes the package fully testable without filesystem mocks for path resolution.

### runTestSuite Pipeline

The `runTestSuite` function orchestrates a 10-step pipeline for each test suite:

| Step | File | Purpose |
|------|------|---------|
| 1 | `step-1-resolve-paths.ts` | Joins `testsDir` + `test-suites/` + suite name |
| 2 | `step-2-validate-config.ts` | Validates `tests.json` exists (throws `ConfigNotFoundError`) |
| 3 | `step-3-read-config.ts` | Reads config, applies test filter, validates scaffolds |
| 4 | `step-4-generate-run-id.ts` | Generates timestamp ID (`YYYYMMDDTHHmmss`) |
| 6 | `step-6-build-flags.ts` | Resolves plugin directories from config + `repoRoot` |
| 7 | `step-7-init-totals.ts` | Initializes zeroed accumulator |
| 8 | `step-8-run-test-cases.ts` | Dispatches to prompt or skill-call runner by test type |
| 9 | `step-9-print-totals.ts` | Prints run summary to stdout |
| 10 | `step-10-exit.ts` | `exitWithResult(failures)` — exits 0 or 1 |

Step 5 is intentionally absent from the numbering. Step 8 splits tests by type:

```typescript
// packages/execution/src/test-runners/steps/step-8-run-test-cases.ts
const promptTests = config.tests.filter(t => t.type === 'prompt' || t.type === undefined)
const skillCallTests = config.tests.filter(t => t.type === 'skill-call')
```

### Test Runner Dispatch

**Prompt runner** (`test-runners/prompt/index.ts`): Reads the prompt file, runs Claude in Docker with all configured plugins, parses stream-JSON output, extracts metrics, extracts output files from the sandbox, and writes JSONL (including `output-files.jsonl`).

**Skill-call runner** (`test-runners/skill-call/index.ts`): Same flow, but first builds a temporary plugin via `buildTempPlugin(skillFile, runDir, repoRoot)`. The temp plugin has a stripped SKILL.md with only name + description and a no-op body that responds "skill triggered."

**Agent-prompt runner** (`test-runners/agent-prompt/index.ts`): Same as the prompt runner but dispatches to an agent via delegation.

**Agent-call runner** (`test-runners/agent-call/index.ts`): Same as the skill-call runner but builds a temporary agent plugin.

All four runners share the same post-run output file extraction step: after Claude finishes, they call `extractOutputFiles()` from `claude-integration` to retrieve any files the skill/agent wrote inside the sandbox, then call `appendOutputFiles()` from `harness-data` to persist them to `output-files.jsonl` in the run directory.

### Temp Plugin Construction

```typescript
// packages/execution/src/test-runners/skill-call/build-temp-plugin.ts
function stripNonTriggeringFields(frontmatter: string): string {
  return frontmatter
    .replace(/^allowed-tools:.*$/m, '')
    .replace(/^argument-hint:.*$/m, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
```

Two variants: `buildTempPlugin` (original description) and `buildTempPluginWithDescription` (substitutes a custom description for SCIL iterations). Both create a minimal `.claude-plugin/plugin.json` with version `0.0.0`.

### runTestEval Pipeline

When `testRunId` is provided, evaluates that specific run. When omitted, scans `outputDir` for all directories and filters to unevaluated ones (those without a non-empty `test-results.jsonl`).

For each run:
1. Resolves the run directory via `resolveRunDir(id, outputDir)`
2. Reads `test-config.jsonl` to determine the suite
3. Calls `evaluateTestRun()` from `@testdouble/harness-evals`
4. Converts `EvalResult` to `TestResultRecord[]` — boolean evals produce one record; LLM-judge evals produce per-criterion records plus an aggregate
5. Writes results to `test-results.jsonl`
6. Marks forced re-evaluations for analytics reprocessing

### SCIL Loop

The `runScilLoop` function orchestrates 10 steps iteratively:

1. **Resolve and load** — Finds the target skill (explicit or inferred) and loads skill-call tests
2. **Split sets** — Stratified train/test split based on holdout fraction (delegates to harness-data)
3. **Read skill** — Parses SKILL.md frontmatter and body
4. **Build temp plugin** — Creates temp plugin with current (or improved) description
5. **Run eval** — Concurrent sandbox execution with configurable concurrency and majority voting
6. **Score** — Computes train/test accuracy; selects best iteration
7. **Improve description** — Sends failure details and phase-specific instructions to Claude to generate a better description (max 1024 chars). During explore/transition phases, always generates a new description regardless of accuracy. During converge, only improves if accuracy is imperfect
8. **Apply description** — Writes best description to SKILL.md (interactive prompt or `--apply`)
9. **Write output** — Persists iteration JSONL (including phase) and summary JSON
10. **Print report** — Iteration progress (with phase tag) and final comparison table (with phase column)

Each iteration is assigned a phase (`explore`, `transition`, or `converge`) via `getPhase()` from `harness-data`. Early exit on perfect accuracy only occurs during or after the converge phase.

### Concurrency Pool (SCIL Eval)

```typescript
// packages/execution/src/scil/step-5-run-eval.ts — simplified
const pending = new Set<Promise<void>>()
for (const item of workItems) {
  const task = runSingleQuery(item.test, item.runIndex, opts)
  const tracked = task.then(() => { pending.delete(tracked) })
  pending.add(tracked)
  if (pending.size >= opts.concurrency) {
    await Promise.race(pending)
  }
}
await Promise.all(pending)
```

Results are stored in a pre-sized array by work-item index for deterministic ordering. When `runsPerQuery > 1`, results are grouped by test name and aggregated via majority vote.

### Best Iteration Selection

```typescript
// packages/execution/src/common/score.ts
// Primary: test accuracy (when holdout > 0) or train accuracy (when holdout = 0)
// Tiebreaker: train accuracy
// Ties at both levels: earlier iteration wins
```

## Error Handling

| Error Class | Thrown By | Trigger |
|-------------|-----------|---------|
| `HarnessError` | Multiple steps | General errors (prompt not found, config read failure, missing frontmatter) |
| `ConfigNotFoundError` | `step-2-validate-config` | `tests.json` not found in test suite directory |
| `RunNotFoundError` | `step-1-resolve-run-dir` | Test run directory does not exist in `outputDir` |

The CLI catches `HarnessError` at the top level and writes the message to stderr with exit code 1.

## Constants

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| `NOOP_BODY` | `'\nRespond with: "skill triggered" — nothing else.\n'` | `build-temp-plugin.ts` | Body text for stripped temp plugins |
| `MAX_DESCRIPTION_LENGTH` | `1024` | `step-7-improve-description.ts` | Maximum allowed skill description length |

## Testing

- `packages/execution/src/lib/*.test.ts` — Tests for errors, path-config, metrics, output
- `packages/execution/src/common/*.test.ts` — Tests for shared scoring, output writing, and reporting utilities
- `packages/execution/src/test-runners/steps/*.test.ts` — Tests for each pipeline step
- `packages/execution/src/test-eval-steps/*.test.ts` — Tests for eval pipeline steps
- `packages/execution/src/scil/*.test.ts` — Tests for each SCIL step and the loop orchestrator
- `packages/execution/src/acil/*.test.ts` — Tests for each ACIL step and the loop orchestrator

### Test Patterns

Tests are co-located with source files. Tests that previously mocked `paths.js` singletons now pass path values as function parameters, eliminating the need for path mocking. Shared test fixtures are in `packages/execution/src/test-runners/steps/fixtures.ts`, which imports JSON fixtures from `@testdouble/test-fixtures`.

## Related Documentation

- [Test Harness Architecture](./test-harness-architecture.md) — System-wide architecture, package boundaries, and dependency graph
- [CLI Package](./cli.md) — The thin CLI wrapper that delegates to this package
- [Data Package](./data.md) — Shared data layer consumed by execution orchestrators
- [Evals Package](./evals.md) — Evaluation engine called by `runTestEval`
- [Claude Integration](./claude-integration.md) — Claude CLI wrapper used for running prompts in sandbox
- [Docker Integration](./docker-integration.md) — Docker sandbox API used for sandbox lifecycle
- [Skill Call Improvement Loop](./skill-call-improvement-loop.md) — Detailed SCIL algorithm and design
- [Step-Based Pipeline](./coding-standards/step-based-pipeline.md) — Coding standard for the numbered-step architecture
- [Custom Error Hierarchy](./coding-standards/custom-error-hierarchy.md) — Error class conventions
- [Agent Call Improvement Loop](agent-call-improvement-loop.md) — ACIL mechanics: agent detection, temp plugin isolation, holdout splits, scoring

## ACIL Pipeline Steps (received from agent-call-improvement-loop.md — integrate in Tier 5)

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
