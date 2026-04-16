# Immutable Data Patterns

- **Status:** proposed
- **Date Created:** 2026-03-28 08:16
- **Last Updated:** 2026-03-28 08:16
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - All workspace packages (`packages/cli`, `packages/data`, `packages/web`)

## Introduction

This coding standard defines how data transformations and test data construction use immutable patterns throughout the test harness codebase.

### Purpose

Immutable data patterns prevent a class of bugs where shared state is accidentally modified, causing test pollution, ordering dependencies, and difficult-to-diagnose failures. By always returning new objects from transformation functions and using spread operators for test data variation, the codebase maintains predictable data flow and isolated test cases.

### Scope

All TypeScript source and test files under `packages/*/src/` — both production functions that transform data and test files that construct or vary test data.

## Background

The test harness accumulates metrics across test runs, threads configuration through multi-step pipelines, and reuses fixture data across many test cases. In each of these scenarios, mutating an input object would silently corrupt downstream consumers. Early in development, a totals-accumulation function mutated its input, which caused cascading incorrect metrics when the same totals object was passed to multiple accumulation calls. Adopting a return-new-object convention eliminated that bug category entirely.

Spread-based test data variation complements this by ensuring that shared fixtures (like `mockTestSuiteConfig` or `defaultTotals`) remain stable across test cases even when individual tests need slightly different configurations.

## Coding Standard

### Return New Objects From Transformation Functions

Functions that transform or accumulate data return a new object rather than mutating their input. The input parameters are treated as read-only even when TypeScript does not enforce it with `Readonly<T>`.

**Correct usage:**

```typescript
// Returns a new RunTotals object — the input `totals` is never modified
export function accumulateTotals(totals: RunTotals, metrics: ParsedRunMetrics): RunTotals {
  return {
    totalDurationMs: totals.totalDurationMs + metrics.durationMs,
    totalInputTokens: totals.totalInputTokens + metrics.inputTokens,
    totalOutputTokens: totals.totalOutputTokens + metrics.outputTokens,
    failures: totals.failures,
  }
}
```

**What to avoid:**

```typescript
// Mutating the input object — callers holding a reference to `totals` see unexpected changes
export function accumulateTotals(totals: RunTotals, metrics: ParsedRunMetrics): RunTotals {
  totals.totalDurationMs += metrics.durationMs
  totals.totalInputTokens += metrics.inputTokens
  totals.totalOutputTokens += metrics.outputTokens
  return totals // same reference, now modified
}
```

**Project references:**
- `packages/cli/src/lib/metrics.ts` — `accumulateTotals` returns a new object

### Tests Verify Immutability Explicitly

When a function is required to return a new object, tests verify two things: (1) the return value is not the same reference as the input (`not.toBe`), and (2) the original input's values are unchanged after the call.

**Correct usage:**

```typescript
it('returns a new object rather than mutating the original', () => {
  const totals: RunTotals = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }
  const metrics = { durationMs: 10, inputTokens: 5, outputTokens: 3, isError: false, result: null }
  const result = accumulateTotals(totals, metrics)
  expect(result).not.toBe(totals)           // new reference
  expect(totals.totalDurationMs).toBe(0)    // original unchanged
  expect(result.totalDurationMs).toBe(10)   // new object has correct value
})
```

**What to avoid:**

```typescript
// Only checking values, not reference identity — a mutating implementation would pass
it('accumulates metrics', () => {
  const totals: RunTotals = { totalDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, failures: 0 }
  const metrics = { durationMs: 10, inputTokens: 5, outputTokens: 3, isError: false, result: null }
  const result = accumulateTotals(totals, metrics)
  expect(result.totalDurationMs).toBe(10)   // passes even if totals was mutated in place
})
```

**Project references:**
- `packages/cli/src/lib/metrics.test.ts` — `accumulateTotals` immutability test

### Spread for Test Data Variation

Tests use the spread operator to create variations of shared fixtures. This ensures the original fixture remains unmodified for other test cases. For nested properties like arrays, spread both the outer object and the inner array.

**Correct usage:**

```typescript
// Top-level spread to override a single property
const promptOnlyConfig = { ...mockTestSuiteConfig }

// Nested spread to extend an array without mutating the original
const configWithSkillCall = {
  ...mockTestSuiteConfig,
  tests: [
    ...mockTestSuiteConfig.tests,
    { name: 'Skill: code-review trigger', type: 'skill-call', promptFile: 'trigger.md', skillFile: 'r-and-d:code-review', expect: [] },
  ],
}

// Spread in a helper to provide a fresh copy per call
function callRunTestCases(config = mockTestSuiteConfig, totals = { ...defaultTotals }) {
  return runTestCases(config, 'code-review', '/mock/test-suites/code-review', [], false, '20260320T094845', totals)
}

// Spread to override a single field on a mock object
const testWithScaffold = { ...mockTest, scaffold: 'ruby-project' }
```

**What to avoid:**

```typescript
// Mutating a shared fixture directly — pollutes other tests
mockTestSuiteConfig.tests.push(newTest)

// Assigning properties on a shared object
defaultTotals.totalDurationMs = 500

// Forgetting to spread the inner array — the original array is shared by reference
const configWithSkillCall = {
  ...mockTestSuiteConfig,
  tests: mockTestSuiteConfig.tests.concat(newTest), // concat is safe, but push() is not
}
// Even worse:
mockTestSuiteConfig.tests.push(newTest) // mutates the shared fixture's array
```

**Project references:**
- `packages/cli/src/test-runners/steps/step-8-run-test-cases.test.ts` — spread for config variations and fresh totals copies
- `packages/cli/src/test-runners/skill-call/index.test.ts` — spread for mock test and metrics variations
- `packages/cli/src/test-runners/prompt/index.test.ts` — spread for test and metrics variations
- `packages/cli/src/commands/test-run.test.ts` — spread for argv variations

## Additional Resources

### Project Documentation

- [Test File Organization and Naming](./test-file-organization.md) — companion coding standard for test structure and naming conventions
- [Test Plan](../test-plan.md) — overall test strategy
- [Project Discovery](../project-discovery.md) — workspace package layout and test commands
