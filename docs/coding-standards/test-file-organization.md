# Test File Organization and Naming

- **Status:** proposed
- **Date Created:** 2026-03-28 08:10
- **Last Updated:** 2026-03-28 08:10
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - All workspace packages (`packages/cli`, `packages/data`, `packages/web`, `packages/test-fixtures`)

## Introduction

This coding standard defines how test files are named, located, and internally structured across the test harness monorepo.

### Purpose

Consistent test file organization ensures that tests are discoverable, that unit and integration tests run in separate passes with appropriate timeouts, and that individual test cases trace back to test plans and edge-case analyses.

### Scope

All TypeScript test files under `packages/*/src/` that are executed by Vitest.

## Background

The harness uses two Vitest configurations to separate fast unit tests from slower integration tests that touch the filesystem or DuckDB. The naming suffix (`.test.ts` vs `.integration.test.ts`) is the mechanism that routes each file to the correct config. Co-locating test files alongside their implementation (rather than in a separate `__tests__/` tree) keeps navigation simple in a monorepo with multiple workspace packages.

Test case annotations (`TP-###`, `EC#`) were introduced to maintain traceability between test plans, edge-case analyses, and the tests that cover them. Without these annotations, it becomes difficult to verify that a test plan item has been implemented or that an edge case is covered.

## Coding Standard

### Test File Naming Suffixes

Unit test files use the `.test.ts` suffix. Integration test files use the `.integration.test.ts` suffix. The base vitest config (`vitest.config.ts`) includes `*.test.ts` and explicitly excludes `*.integration.test.ts`, while the integration config (`vitest.integration.config.ts`) includes only `*.integration.test.ts`.

**Correct usage:**

```typescript
// Unit test — fast, no external dependencies
// File: packages/data/src/config.test.ts

// Integration test — real filesystem, DuckDB, or Docker
// File: packages/data/src/analytics.integration.test.ts
```

**What to avoid:**

```typescript
// Don't use generic suffixes that bypass config routing
// File: packages/data/src/analytics.spec.ts        ← not matched by either config
// File: packages/data/src/analytics-test.ts         ← not matched by either config

// Don't put integration tests in .test.ts files — they'll run in the fast pass
// without the extended timeout
// File: packages/data/src/analytics.test.ts         ← if it touches DuckDB, use .integration.test.ts
```

**Project references:**
- `vitest.config.ts` — unit test config, excludes `*.integration.test.ts`
- `vitest.integration.config.ts` — integration test config with 30s timeout
- `packages/data/src/analytics.integration.test.ts` — integration test example

### Co-located Test Files

Test files live alongside their implementation files in the same directory, not in a separate test tree.

**Correct usage:**

```
packages/cli/src/lib/
  errors.ts
  errors.test.ts
  metrics.ts
  metrics.test.ts
```

**What to avoid:**

```
packages/cli/src/lib/
  errors.ts
  metrics.ts
packages/cli/__tests__/lib/
  errors.test.ts       ← separate test tree adds indirection
  metrics.test.ts
```

**Project references:**
- `packages/cli/src/lib/errors.ts` and `packages/cli/src/lib/errors.test.ts` — co-located pair
- `packages/data/src/stream-parser.ts` and `packages/data/src/stream-parser.test.ts` — co-located pair

### describe Block Grouping

Each `describe` block groups tests by the function, class, or logical unit under test. The describe label matches the exported name being tested.

**Correct usage:**

```typescript
// Single function — describe label matches exported function name
describe('accumulateTotals', () => {
  it('returns a new object with accumulated metrics', () => { ... })
  it('returns a new object rather than mutating the original', () => { ... })
})

// Class — describe label matches class name
describe('HarnessError', () => {
  it('is an instance of Error', () => { ... })
  it('has name set to HarnessError', () => { ... })
})

// Command handler — describe label includes the command name and aspect
describe('test-run builder', () => { ... })
describe('test-run handler', () => { ... })
```

**What to avoid:**

```typescript
// Don't use generic or disconnected describe labels
describe('utils', () => { ... })           // ← too vague, which util?
describe('tests for metrics', () => { ... }) // ← redundant "tests for" prefix
describe('step 7', () => { ... })          // ← use the function name, not the step number
```

**Project references:**
- `packages/cli/src/lib/errors.test.ts` — one describe per error class
- `packages/cli/src/lib/metrics.test.ts` — describe matches `accumulateTotals`
- `packages/cli/src/commands/test-run.test.ts` — multiple describe blocks for exports, builder, handler

### it Block Descriptions

Test case descriptions use action phrases that describe the behavior being verified. Start with a verb (returns, passes, throws, calls, handles, etc.) rather than "should" or "test that".

**Correct usage:**

```typescript
it('returns a new object with accumulated metrics', () => { ... })
it('throws ConfigNotFoundError when tests.json does not exist', () => { ... })
it('passes suite to resolvePaths', () => { ... })
it('routes prompt and undefined-type tests to runPromptTests', () => { ... })
it('handles NaN holdout without crashing', () => { ... })
```

**What to avoid:**

```typescript
it('should return a new object', () => { ... })          // ← avoid "should" prefix
it('test that config not found throws', () => { ... })   // ← avoid "test that" prefix
it('works', () => { ... })                               // ← too vague
it('error case', () => { ... })                          // ← describes category, not behavior
```

**Project references:**
- `packages/data/src/expectations.test.ts` — concise verb-first descriptions
- `packages/data/src/stream-parser.test.ts` — consistent "returns/ignores/skips" phrasing

### Test Plan Traceability Annotations (TP-###)

When a test case implements a specific test plan item, annotate it with a `// TP-###:` comment immediately above the `it` block. The number corresponds to the item ID in the test plan document.

**Correct usage:**

```typescript
// TP-011: holdout=0 assigns all tests to train
it('assigns all tests to train when holdout is 0', () => {
  const tests = makeManyTests(3, 2)
  const result = splitSets('suite', 'p:s', tests, 0)
  expect(result.every(t => t.set === 'train')).toBe(true)
})

// TP-012: Deterministic splitting — same inputs produce same outputs
it('produces identical results for identical inputs', () => { ... })
```

**What to avoid:**

```typescript
// Don't embed TP references only in the it description — they should be in comments
// where they're scannable without reading the full test name
it('assigns all tests to train when holdout is 0 (TP-011)', () => { ... })

// Don't omit the TP reference when implementing a planned test item
it('assigns all tests to train when holdout is 0', () => { ... })  // ← which plan item?
```

**Project references:**
- `packages/cli/src/scil/step-2-split-sets.test.ts` — extensive TP-### annotations throughout

### Edge Case Annotations (EC#)

When a test case covers a specific edge case from an edge-case analysis, append `(EC#)` to the `it` description string. The number corresponds to the edge case ID from the analysis.

**Correct usage:**

```typescript
it('produces identical IDs for names that differ only in stripped characters (EC10)', () => {
  const id1 = buildTestCaseId('suite', 'test: foo')
  const id2 = buildTestCaseId('suite', 'test foo')
  expect(id1).toBe(id2)
})

it('throws SyntaxError when a non-empty line is not valid JSON (EC8)', () => {
  ;(globalThis as any).Bun.file.mockReturnValue(makeFakeFile(true, '{"a":1}\ncorrupt line\n'))
  await expect(readJsonlFile('/some/file.jsonl')).rejects.toThrow(SyntaxError)
})

it('silently drops tests with an unrecognized type value (EC2)', async () => { ... })
```

**What to avoid:**

```typescript
// Don't put EC annotations in comments above — they belong in the it description
// so they appear in test runner output
// EC10
it('produces identical IDs for names that differ only in stripped characters', () => { ... })

// Don't use inconsistent formats
it('edge case 10: identical IDs', () => { ... })  // ← use (EC#) suffix format
```

**Project references:**
- `packages/data/src/config.test.ts` — `(EC10)`, `(EC23)` annotations
- `packages/data/src/jsonl-reader.test.ts` — `(EC8)` annotation
- `packages/cli/src/test-runners/steps/step-8-run-test-cases.test.ts` — `(EC2)` annotation

### Vitest Config Separation

Unit and integration tests use separate Vitest configurations. The default `vitest.config.ts` runs unit tests only, `vitest.integration.config.ts` runs integration tests with an extended timeout, and `vitest.all.config.ts` runs everything via `make test`.

**Correct usage:**

```typescript
// vitest.config.ts — unit tests only
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    exclude: ['packages/*/src/**/*.integration.test.ts', '**/node_modules/**'],
  },
})

// vitest.integration.config.ts — integration tests with extended timeout
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.integration.test.ts'],
    testTimeout: 30000,
  },
})
```

**What to avoid:**

```typescript
// Don't put all tests in a single config — integration tests need longer timeouts
// and should not slow down the unit test feedback loop
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.integration.test.ts'],
    testTimeout: 30000,  // ← penalizes unit tests with unnecessary timeout overhead
  },
})
```

**Project references:**
- `vitest.config.ts` — unit test configuration
- `vitest.integration.config.ts` — integration test configuration
- `vitest.all.config.ts` — combined configuration for `make test`

## Additional Resources

### Project Documentation

- [Integration Test Lifecycle](./integration-test-lifecycle.md) — temp directory lifecycle, real filesystem/DuckDB usage, extracted test helpers, and section comments
- [Test Suite Reference](../test-suite-reference.md) — tests.json field reference for eval test suites
- [Project Discovery](../project-discovery.md) — workspace package layout and test commands
