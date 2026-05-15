# Test Data Factory Functions

- **Status:** proposed
- **Date Created:** 2026-03-28 08:16
- **Last Updated:** 2026-03-28 08:16
- **Authors:**
  - River Bailey (mxriverlynn, river.bailey@testdouble.com)
- **Reviewers:**
- **Applies To:**
  - All workspace packages (`packages/cli`, `packages/data`, `packages/web`, `packages/test-fixtures`)

## Introduction

This coding standard defines how test data is constructed in test files across the harness monorepo, covering factory functions, shared fixtures, inline builders, and module-level mock constants.

### Purpose

Consistent test data construction patterns make tests easier to read, reduce duplication within a file, and establish clear escalation paths for when data should move from file-local factories to shared fixture packages. These conventions ensure that test data setup is immediately recognizable and that the relationship between factory complexity and sharing scope is predictable.

### Scope

All TypeScript test files under `packages/*/src/` that are executed by Vitest, and the `packages/test-fixtures/` package that supplies shared fixture data.

## Background

Test data construction is one of the most repeated patterns in the codebase. Without conventions, test data setup drifts toward inconsistent approaches: some tests use object literals inline, others use helper functions with different naming styles, and shared data ends up duplicated across files. The `make*` prefix convention and the file-local-first principle emerged from the codebase to keep factory functions discoverable and to limit cross-file coupling. The `packages/test-fixtures/` package exists as a clear boundary for when fixture data genuinely needs to be shared across workspace packages.

## Coding Standard

### make* Prefix Convention

All test data factory functions use the `make` prefix followed by a descriptive noun: `makeConfig`, `makeTestCase`, `makeFakeFile`, `makeMockContext`. This convention makes factory functions immediately identifiable in any test file via search or visual scan.

**Correct usage:**

```typescript
function makeConfig(tests: Array<{ name: string; scaffold?: string }>): TestSuiteConfig {
  return {
    plugins: ['r-and-d'],
    tests: tests.map(t => ({
      name: t.name,
      promptFile: 'prompt.md',
      model: 'sonnet',
      ...(t.scaffold ? { scaffold: t.scaffold } : {}),
      expect: [],
    })),
  }
}

function makeTestCase(overrides: Partial<ScilTestCase> = {}): ScilTestCase {
  return {
    name: 'test-1',
    type: 'skill-call',
    promptFile: 'test-1.md',
    set: 'train',
    expect: [{ type: 'skill-call' as const, value: true, skillFile: 'plugin:skill' }],
    ...overrides,
  }
}
```

**What to avoid:**

```typescript
// Don't use other prefixes — "create", "build", "generate", "new" are not the convention
function createConfig(tests: Array<{ name: string }>): TestSuiteConfig { ... }
function buildTestCase(): ScilTestCase { ... }
function newMockContext(): Context { ... }

// Don't use generic names that don't describe what is being made
function getTestData(): TestSuiteConfig { ... }
function setup(): ScilTestCase { ... }
```

**Project references:**
- `packages/data/src/config.test.ts` — `makeConfig` for `TestSuiteConfig`
- `packages/cli/src/scil/step-5-run-eval.test.ts` — `makeTestCase`, `makeOpts`
- `packages/cli/src/scil/step-2-split-sets.test.ts` — `makeTest`, `makeManyTests`
- `packages/web/src/server/routes/analytics.test.ts` — `makeMockContext`

### File-Local Factory Functions

Simple factory functions are defined at the top of the test file that uses them, not extracted into shared modules. A factory stays file-local until it is needed by tests in a different directory. This keeps each test file self-contained and avoids premature abstraction.

**Correct usage:**

```typescript
// packages/data/src/jsonl-reader.test.ts — factory defined in the same file that uses it
function makeFakeFile(exists: boolean, content = '') {
  return {
    exists: () => exists,
    text: () => Promise.resolve(content),
  }
}

describe('readJsonlFile', () => {
  it('returns parsed records from a valid JSONL file', async () => {
    (globalThis as any).Bun.file.mockReturnValue(makeFakeFile(true, '{"a":1}\n{"b":2}\n'))
    // ...
  })
})
```

**What to avoid:**

```typescript
// Don't extract a factory to a shared module when only one test file uses it
// utils/test-helpers.ts
export function makeFakeFile(exists: boolean, content = '') { ... }

// packages/data/src/jsonl-reader.test.ts
import { makeFakeFile } from '../../../utils/test-helpers.js'  // unnecessary indirection
```

**Project references:**
- `packages/data/src/jsonl-reader.test.ts` — `makeFakeFile` defined and used in the same file
- `packages/cli/src/test-runners/steps/step-2-validate-config.test.ts` — `makeBunFile` defined and used in the same file
- `packages/cli/src/scil/step-6-score.test.ts` — `makeResult`, `makeIteration` defined and used in the same file

### Partial Override Pattern for Complex Types

When a factory constructs a type with many fields, accept a `Partial<T>` overrides parameter with sensible defaults. Spread the overrides last so callers only specify what their test cares about. This reduces noise in test cases and makes the meaningful test data stand out.

**Correct usage:**

```typescript
function makeQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    testCaseId: 'suite-test-1',
    testName: 'test-1',
    passed: true,
    events: [],
    ...overrides,
  }
}

// Test only specifies the field it is asserting on
it('marks the query as failed when skill call is missing', () => {
  const result = makeQueryResult({ passed: false })
  expect(result.passed).toBe(false)
})
```

**What to avoid:**

```typescript
// Don't force callers to provide every field — it buries the interesting data
it('marks the query as failed when skill call is missing', () => {
  const result: QueryResult = {
    testCaseId: 'suite-test-1',
    testName: 'test-1',
    passed: false,           // ← the only field this test cares about
    events: [],
  }
  expect(result.passed).toBe(false)
})
```

**Project references:**
- `packages/cli/src/scil/step-5-run-eval.test.ts` — `makeTestCase(overrides)`, `makeOpts(overrides)`
- `packages/data/src/scil-prompt.test.ts` — `makeQueryResult(overrides)`, `makeIterationResult(overrides)`
- `packages/cli/src/scil/step-7-improve-description.test.ts` — `makeQueryResult`, `makeIterationResult`, `makeOpts` all using partial overrides

### Shared Fixtures in Dedicated Package

When fixture data is needed across workspace packages or is too large for inline definition (JSON payloads, full config objects), place it in `packages/test-fixtures/` and import via `@testdouble/test-fixtures`. When fixture data is shared only within a single directory of related tests, use a co-located `fixtures.ts` file.

**Correct usage:**

```typescript
// packages/cli/src/test-runners/steps/fixtures.ts — directory-level shared fixtures
import type { TestSuiteConfig, ParsedRunMetrics } from '@testdouble/harness-data'
import mockTestSuiteConfigJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-test-suite-config.json'
import mockParsedMetricsJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-parsed-metrics.json'

export const mockTestSuiteConfig: TestSuiteConfig = mockTestSuiteConfigJson as TestSuiteConfig
export const mockParsedMetrics: ParsedRunMetrics = mockParsedMetricsJson as ParsedRunMetrics

// packages/cli/src/test-runners/steps/step-8-run-test-cases.test.ts — consuming shared fixtures
import { mockTestSuiteConfig, mockParsedMetrics } from './fixtures.js'
```

**What to avoid:**

```typescript
// Don't duplicate large fixture objects across multiple test files
// packages/cli/src/test-runners/steps/step-8-run-test-cases.test.ts
const mockTestSuiteConfig = { suite: 'my-suite', plugins: ['r-and-d'], tests: [/* 20 lines */] }

// packages/cli/src/test-runners/steps/step-9-print-totals.test.ts
const mockTestSuiteConfig = { suite: 'my-suite', plugins: ['r-and-d'], tests: [/* same 20 lines */] }

// Don't import from test-fixtures when the data is only used in one test file —
// keep it file-local with a make* factory instead
```

**Project references:**
- `packages/test-fixtures/` — shared fixture package with sub-path exports
- `packages/cli/src/test-runners/steps/fixtures.ts` — directory-level fixture re-exports
- `packages/data/src/analytics-test-helpers.ts` — shared integration test helpers with `makeConfigRecord`, `makeRunResultRecord`

### Inline Event Builder Functions

For event-based tests, define small arrow-function builders as module-level constants. These are typed builder functions (not `make*` factories) because they produce single-field event variants rather than complex test objects. Use descriptive names that reflect the event type.

**Correct usage:**

```typescript
// packages/data/src/expectations.test.ts
const resultEvent = (text: string): StreamJsonEvent => ({ type: 'result', result: text })
const skillEvent = (name: string): StreamJsonEvent => ({
  type: 'user',
  tool_use_result: { commandName: name, success: true },
})
const noEvents: StreamJsonEvent[] = []

describe('evaluateResultContains', () => {
  it('returns true when result includes value', () => {
    expect(evaluateResultContains('hello', [resultEvent('say hello world')])).toBe(true)
  })
})
```

**What to avoid:**

```typescript
// Don't construct event objects inline in every test case — too noisy
it('returns true when result includes value', () => {
  expect(evaluateResultContains('hello', [
    { type: 'result', result: 'say hello world' } as StreamJsonEvent,
  ])).toBe(true)
})

// Don't use the make* prefix for simple event builders — reserve make* for
// complex objects with defaults and overrides
function makeResultEvent(text: string): StreamJsonEvent { ... }  // ← overkill for a one-liner
```

**Project references:**
- `packages/data/src/expectations.test.ts` — `resultEvent`, `skillEvent`, `noEvents`

### Module-Level Mock Data Constants

When multiple tests in a file need the same mock value and the value has no meaningful variation, declare it as a module-level `const`. Use `as any` only when the consuming code does not exercise the full type. Group related constants together above the first `describe` block but after all imports and mock setup.

**Correct usage:**

```typescript
// packages/cli/src/commands/test-run.test.ts
const mockConfig = { suite: 'my-suite', tests: [] } as any
const mockTotals = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }
const mockClaudeFlags = ['--flag']

const defaultArgv = {
  suite: 'my-suite',
  test: undefined,
  debug: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolvePaths).mockReturnValue({ testSuiteDir: '/suites/my-suite' })
  vi.mocked(readConfig).mockResolvedValue(mockConfig)
  // ...
})
```

**What to avoid:**

```typescript
// Don't repeat the same literal object in every test case
it('calls resolvePaths with the suite', async () => {
  await handler({ suite: 'my-suite', test: undefined, debug: false })  // duplicated
  // ...
})
it('calls readConfig with resolved path', async () => {
  await handler({ suite: 'my-suite', test: undefined, debug: false })  // duplicated again
  // ...
})

// Don't use module-level constants when each test needs different values —
// use a make* factory with overrides instead
```

**Project references:**
- `packages/cli/src/commands/test-run.test.ts` — `mockConfig`, `mockTotals`, `defaultArgv`

## Additional Resources

### Project Documentation

- [Test File Organization and Naming](./test-file-organization.md) — companion standard covering file naming, co-location, describe/it conventions, and traceability annotations
- [Vitest Mocking Patterns](./vitest-mocking-patterns.md) — conventions for vi.mock, vi.fn, and mock setup
- [Project Discovery](../project-discovery.md) — workspace package layout and test commands
