# Step-Based Pipeline Architecture

- **Status:** proposed
- **Date Created:** 2026-03-28 08:17
- **Last Updated:** 2026-04-02
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - `packages/execution/src/test-runners/steps/` (test execution pipeline)
  - `packages/execution/src/scil/` (skill call improvement loop)
  - `packages/execution/src/acil/` (agent call improvement loop)
  - `packages/execution/src/test-eval/` (test evaluation pipeline)
  - `packages/execution/src/common/` (shared pipeline steps)

## Introduction

This coding standard defines how multi-step operations are decomposed into numbered step files, how each step is structured and tested, and how command handlers orchestrate steps into pipelines.

### Purpose

Step-based pipelines keep complex operations readable and independently testable. Each step has a single responsibility, accepts explicit parameters (no shared mutable state), and produces a well-defined return value. This makes it straightforward to test steps in isolation, verify execution order at the orchestrator level, and insert or reorder steps without refactoring adjacent code.

### Scope

All TypeScript step-based pipelines in `packages/execution/src/`. Currently four pipeline families follow this pattern: the test execution pipeline (`test-runners/steps/`), the skill call improvement loop (`scil/`), the agent call improvement loop (`acil/`), and the test evaluation pipeline (`test-eval/`). Shared steps that are reused across pipelines live in `common/`. Any new multi-step workflow should follow these conventions.

## Background

The harness performs several multi-step workflows — running test suites, evaluating results, and iteratively improving skill or agent descriptions. Early implementations put all logic in the command handler, making handlers difficult to test and reason about. Extracting each operation into a numbered step file solved three problems: (1) individual steps could be tested with focused unit tests, (2) the orchestrator test could verify call order without re-testing step internals, and (3) step numbering made the execution sequence visible in the file listing.

The numbered prefix (`step-N-`) is a file-system convention, not a runtime mechanism. Steps are imported and called explicitly by the orchestrator — there is no dynamic step discovery or auto-registration. This keeps the control flow explicit and easy to trace.

## Coding Standard

### Numbered Step File Naming

Each step file is named `step-{N}-{descriptive-name}.ts` where `{N}` is a sequential integer indicating execution order and `{descriptive-name}` is a lowercase hyphenated description of the operation. Co-located test files use the same base name with a `.test.ts` suffix. All step files for a pipeline live in the same directory.

**Correct usage:**

```
packages/execution/src/test-runners/steps/
  step-1-resolve-paths.ts
  step-1-resolve-paths.test.ts
  step-2-validate-config.ts
  step-2-validate-config.test.ts
  step-3-read-config.ts
  step-3-read-config.test.ts
  ...
  step-10-exit.ts
  step-10-exit.test.ts
```

**What to avoid:**

```
# Don't omit the number — it removes the visual ordering signal
packages/execution/src/test-runners/steps/
  resolve-paths.ts
  validate-config.ts

# Don't use zero-padded numbers — unnecessary and inconsistent with existing convention
packages/execution/src/test-runners/steps/
  step-01-resolve-paths.ts
  step-02-validate-config.ts

# Don't scatter steps across multiple directories
packages/execution/src/test-runners/
  resolve-paths.ts
  steps/validate-config.ts
```

**Project references:**
- `packages/execution/src/test-runners/steps/` — test execution pipeline (step-1 through step-10)
- `packages/execution/src/scil/` — skill call improvement loop (step-1 through step-10)
- `packages/execution/src/acil/` — agent call improvement loop (step-1 through step-10)
- `packages/execution/src/common/` — shared steps reused by both SCIL and ACIL (score, write-output, print-report)

### Single Exported Function Per Step

Each step file exports one primary function. The function name is a camelCase verb phrase describing the operation — it does not include the step number. The function accepts explicit parameters and returns a typed result object. Steps should not read from or write to module-level mutable state.

**Correct usage:**

```typescript
// step-1-resolve-paths.ts — exports resolvePaths
import { getTestSuiteDir } from '../../paths.js'

export function resolvePaths(suite: string): { testSuiteDir: string } {
  const testSuiteDir = getTestSuiteDir(suite)
  return { testSuiteDir }
}
```

```typescript
// step-2-validate-config.ts — exports validateConfig
import path from 'node:path'
import { TEST_CONFIG_FILENAME } from '@testdouble/harness-data'
import { ConfigNotFoundError } from '../../lib/errors.js'

export async function validateConfig(testSuiteDir: string): Promise<{ configFilePath: string }> {
  const configFilePath = path.join(testSuiteDir, TEST_CONFIG_FILENAME)
  if (!(await Bun.file(configFilePath).exists())) {
    throw new ConfigNotFoundError(configFilePath)
  }
  return { configFilePath }
}
```

**What to avoid:**

```typescript
// Don't include the step number in the function name
export function step1ResolvePaths(suite: string) { ... }

// Don't export multiple unrelated functions from a single step
export function resolvePaths(suite: string) { ... }
export function resolveOutputDir(runId: string) { ... }

// Don't rely on shared mutable state instead of parameters
let _suite: string
export function setSuite(s: string) { _suite = s }
export function resolvePaths() { return getTestSuiteDir(_suite) }
```

**Project references:**
- `packages/execution/src/test-runners/steps/step-1-resolve-paths.ts` — single function `resolvePaths`
- `packages/execution/src/test-runners/steps/step-2-validate-config.ts` — single function `validateConfig`
- `packages/execution/src/scil/step-3-read-skill.ts` — single function `readSkill`
- `packages/execution/src/acil/step-3-read-agent.ts` — single function `readAgent`
- `packages/execution/src/test-eval/step-1-resolve-run-dir.ts` — single function `resolveRunDir`

### Step Functions Accept Explicit Parameters

Each step receives all required data through function parameters rather than reading from shared context objects, global state, or module-level variables. Return values are typed objects whose property names describe the data being passed forward. This makes dependencies between steps visible in the orchestrator and keeps each step independently testable.

**Correct usage:**

```typescript
// step-1-resolve-run-dir.ts — accepts testRunId, returns { runDir }
export async function resolveRunDir(testRunId: string): Promise<{ runDir: string }> {
  const runDir = path.join(outputDir, testRunId)
  try {
    await stat(runDir)
  } catch {
    throw new RunNotFoundError(runDir)
  }
  return { runDir }
}
```

```typescript
// Orchestrator threads return values from one step into the next
const { testSuiteDir } = resolvePaths(suite)
const { configFilePath } = await validateConfig(testSuiteDir)
const config = await readConfig(configFilePath, testSuiteDir, testFilter)
```

**What to avoid:**

```typescript
// Don't use a shared context bag that steps mutate
interface PipelineContext {
  suite?: string
  testSuiteDir?: string
  configFilePath?: string
}

export function resolvePaths(ctx: PipelineContext) {
  ctx.testSuiteDir = getTestSuiteDir(ctx.suite!)  // mutates shared state
}

export async function validateConfig(ctx: PipelineContext) {
  ctx.configFilePath = path.join(ctx.testSuiteDir!, TEST_CONFIG_FILENAME)  // reads implicit dependency
}
```

**Project references:**
- `packages/execution/src/test-suite/run-test-suite.ts` — test execution orchestrator threading data between steps
- `packages/execution/src/scil/loop.ts` — SCIL orchestrator threading step results
- `packages/execution/src/acil/loop.ts` — ACIL orchestrator threading step results

### Co-Located Step Tests

Each step file has a co-located test file in the same directory. The test file mocks the step's dependencies and tests the step function in isolation. The describe block label matches the exported function name, not the step number.

**Correct usage:**

```typescript
// step-1-resolve-paths.test.ts
import { describe, it, expect, vi } from 'vitest'
import { resolvePaths } from './step-1-resolve-paths.js'
import { getTestSuiteDir } from '../../paths.js'

vi.mock('../../paths.js', () => ({
  getTestSuiteDir: vi.fn(),
}))

describe('resolvePaths', () => {
  it('delegates to getTestSuiteDir and returns the result as testSuiteDir', () => {
    vi.mocked(getTestSuiteDir).mockReturnValue('/mock/test-suites/my-suite')
    const result = resolvePaths('my-suite')
    expect(result).toEqual({ testSuiteDir: '/mock/test-suites/my-suite' })
  })
})
```

**What to avoid:**

```typescript
// Don't use the step number as the describe label
describe('step 1', () => { ... })

// Don't test multiple steps in a single test file
// step-1-and-2.test.ts
describe('resolvePaths', () => { ... })
describe('validateConfig', () => { ... })  // belongs in step-2-validate-config.test.ts
```

**Project references:**
- `packages/execution/src/test-runners/steps/step-1-resolve-paths.test.ts` — co-located step test
- `packages/execution/src/scil/step-3-read-skill.test.ts` — co-located step test
- `packages/execution/src/acil/step-3-read-agent.test.ts` — co-located step test

### Orchestrator Call-Order Testing

The command handler (orchestrator) test verifies that steps are called in the correct sequence using a `callOrder` array pattern. Each mocked step pushes its name to the array, and the final assertion checks the full expected order. This catches regressions where steps are reordered, skipped, or duplicated.

**Correct usage:**

```typescript
// test-run.test.ts — verifies execution order across all steps
it('calls steps in correct order', async () => {
  const callOrder: string[] = []
  vi.mocked(resolvePaths).mockImplementation(() => {
    callOrder.push('resolvePaths')
    return { testSuiteDir: '/suites/my-suite' }
  })
  vi.mocked(validateConfig).mockImplementation(async () => {
    callOrder.push('validateConfig')
    return { configFilePath: '/suites/my-suite/tests.json' }
  })
  vi.mocked(readConfig).mockImplementation(async () => {
    callOrder.push('readConfig')
    return mockConfig
  })
  vi.mocked(generateRunId).mockImplementation(() => {
    callOrder.push('generateRunId')
    return 'run-123'
  })
  vi.mocked(ensureSandboxExists).mockImplementation(async () => {
    callOrder.push('ensureSandboxExists')
  })
  vi.mocked(buildFlags).mockImplementation(() => {
    callOrder.push('buildFlags')
    return { claudeFlags: mockClaudeFlags }
  })
  vi.mocked(initTotals).mockImplementation(() => {
    callOrder.push('initTotals')
    return mockTotals
  })
  vi.mocked(runTestCases).mockImplementation(async () => {
    callOrder.push('runTestCases')
    return mockTotals
  })
  vi.mocked(printTotals).mockImplementation(() => {
    callOrder.push('printTotals')
  })
  vi.mocked(exitWithResult).mockImplementation((() => {
    callOrder.push('exitWithResult')
  }) as any)

  await handler(defaultArgv)
  expect(callOrder).toEqual([
    'generateRunId',
    'ensureSandboxExists',
    'initTotals',
    'resolvePaths',
    'validateConfig',
    'readConfig',
    'buildFlags',
    'runTestCases',
    'printTotals',
    'exitWithResult',
  ])
})
```

**What to avoid:**

```typescript
// Don't verify order with individual toHaveBeenCalledBefore assertions —
// they only check pairwise order, not the full sequence
expect(resolvePaths).toHaveBeenCalledBefore(validateConfig)
expect(validateConfig).toHaveBeenCalledBefore(readConfig)
// Missing a pair means a reordering bug could slip through

// Don't skip the call-order test — individual parameter tests don't catch
// step reordering or accidental removal
```

**Project references:**
- `packages/execution/src/acil/loop.test.ts` — `callOrder` pattern for ACIL pipeline
- `packages/execution/src/scil/loop.test.ts` — `callOrder` pattern for SCIL pipeline

### Orchestrator Delegates to Steps

The orchestrator (command handler or loop function) imports each step, calls them in sequence, and threads return values between them. The orchestrator contains no domain logic of its own — only sequencing, logging, and control flow (e.g., looping over suites). Helper functions that are not steps (like `ensureSandboxExists`) may also appear in the orchestrator but live outside the steps directory.

**Correct usage:**

```typescript
// test-run.ts — orchestrator calls steps in sequence, threading data
export async function handler(argv: Record<string, unknown>): Promise<void> {
  const testRunId = generateRunId()
  await ensureSandboxExists()
  let totals = initTotals()

  for (const suite of suites) {
    const { testSuiteDir } = resolvePaths(suite)
    const { configFilePath } = await validateConfig(testSuiteDir)
    const config = await readConfig(configFilePath, testSuiteDir, testFilter)
    const { claudeFlags } = buildFlags(config)
    totals = await runTestCases(config, suite, testSuiteDir, claudeFlags, debug, testRunId, totals)
  }

  printTotals(totals.totalDurationMs, totals.totalInputTokens, totals.totalOutputTokens, testRunId)
  exitWithResult(totals.failures)
}
```

**What to avoid:**

```typescript
// Don't inline step logic in the orchestrator
export async function handler(argv: Record<string, unknown>): Promise<void> {
  const testSuiteDir = getTestSuiteDir(argv.suite as string)  // should be in a step
  const configFilePath = path.join(testSuiteDir, 'tests.json')  // should be in a step
  if (!(await Bun.file(configFilePath).exists())) {
    throw new Error('Config not found')  // should be in a step
  }
  // ... more inlined logic
}
```

**Project references:**
- `packages/execution/src/test-suite/run-test-suite.ts` — test execution orchestrator
- `packages/execution/src/scil/loop.ts` — SCIL loop orchestrator
- `packages/execution/src/acil/loop.ts` — ACIL loop orchestrator
- `packages/execution/src/test-eval/run-test-eval.ts` — test evaluation orchestrator

### Exported Types for Step Interfaces

When a step returns a complex result or accepts a structured parameter, define and export a TypeScript interface in the step file (or in a shared `types.ts` within the pipeline directory). This makes the contract between steps explicit and provides IDE-navigable type information.

**Correct usage:**

```typescript
// step-1-resolve-and-load.ts — exports both the function and its return type
export interface ResolvedSkillAndTests {
  skillFile:   string
  skillMdPath: string
  tests:       TestCase[]
}

export async function resolveAndLoad(
  suite: string,
  skill?: string
): Promise<ResolvedSkillAndTests> {
  // ...
}
```

```typescript
// step-3-read-skill.ts — exports the return type
export interface SkillFileContent {
  name:           string
  description:    string
  frontmatterRaw: string
  body:           string
  fullContent:    string
}

export async function readSkill(skillMdPath: string): Promise<SkillFileContent> {
  // ...
}
```

**What to avoid:**

```typescript
// Don't return untyped objects — consumers lose type safety
export async function resolveAndLoad(suite: string) {
  return { skillFile: '...', skillMdPath: '...', tests: [] }  // inferred, not explicit
}

// Don't define step interfaces in a distant shared file unrelated to the pipeline
// types/all-interfaces.ts — too far from where they're used
```

**Project references:**
- `packages/execution/src/scil/step-1-resolve-and-load.ts` — exports `ResolvedSkillAndTests`
- `packages/execution/src/scil/step-3-read-skill.ts` — exports `SkillFileContent`
- `packages/execution/src/scil/types.ts` — shared types for the SCIL pipeline
- `packages/execution/src/acil/step-1-resolve-and-load.ts` — exports resolved agent and tests
- `packages/execution/src/acil/types.ts` — shared types for the ACIL pipeline

### Steps May Be Reused Across Pipelines

When a step is useful in multiple pipelines, import it from its original location rather than duplicating it. The step numbering is local to each pipeline — the same function may be step-4 in one pipeline and used without a number in another orchestrator.

**Correct usage:**

```typescript
// test-eval.ts — reuses step-9 and step-10 from test-runners
import { printTotals } from '../test-runners/steps/step-9-print-totals.js'
import { exitWithResult } from '../test-runners/steps/step-10-exit.js'
```

```typescript
// scil/loop.ts — reuses generateRunId from test-runners
import { generateRunId } from '../test-runners/steps/step-4-generate-run-id.js'
```

**What to avoid:**

```typescript
// Don't duplicate a step function to give it a local step number
// test-eval-steps/step-5-print-totals.ts — copy of test-runners/steps/step-9-print-totals.ts
export function printTotals(...) { ... }  // duplicate code

// Don't create a shared steps/ directory that all pipelines import from —
// keep steps in the pipeline where they originate and cross-import when reusing
```

**Project references:**
- `packages/execution/src/scil/step-6-score.ts` — re-exports `scoreResults` and `selectBestIteration` from `common/score.ts`
- `packages/execution/src/acil/step-6-score.ts` — re-exports from `common/score.ts`
- `packages/execution/src/acil/step-9-write-output.ts` — delegates to `common/write-output.ts` with `prefix: 'acil'`
- `packages/execution/src/acil/step-10-print-report.ts` — re-exports from `common/print-report.ts`

## Additional Resources

### Project Documentation

- [Test File Organization](./test-file-organization.md) — co-location conventions, describe/it naming, and test plan traceability annotations
- [Project Discovery](../project-discovery.md) — workspace package layout and test commands
