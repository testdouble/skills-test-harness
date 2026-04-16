# Vitest Mocking Patterns

- **Status:** proposed
- **Date Created:** 2026-03-28 08:16
- **Last Updated:** 2026-03-28 08:16
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - All workspace packages (`packages/cli`, `packages/data`, `packages/web`)

## Introduction

This coding standard defines how Vitest mocks are declared, configured, cleaned up, and verified across the test harness monorepo.

### Purpose

Consistent mocking patterns prevent test pollution (state leaking between tests), reduce confusion about mock lifecycle, and make test files readable by establishing a predictable structure: mocks at the top, imports below, setup in `beforeEach`, teardown in `afterEach`.

### Scope

All TypeScript test files under `packages/*/src/` that use `vi.mock()`, `vi.fn()`, `vi.mocked()`, or `vi.stubGlobal()` from Vitest.

## Background

Vitest hoists `vi.mock()` calls to the top of the file at compile time, so they execute before imports regardless of where they appear in source. However, relying on implicit hoisting makes the code harder to read and reason about. The convention in this project is to write `vi.mock()` calls explicitly before the imports they affect, so the source order matches the execution order.

The project also uses Bun as its runtime, which means some tests need to stub `globalThis.Bun` APIs (e.g., `Bun.file`, `Bun.spawn`). These global stubs require careful lifecycle management to avoid polluting other tests.

## Coding Standard

### Mock Declaration Order

All `vi.mock()` calls MUST appear before the imports of the modules they mock. Group all `vi.mock()` calls together at the top of the file (after the vitest import), then follow with all `import` statements.

**Correct usage:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../test-runners/steps/step-1-resolve-paths.js', () => ({
  resolvePaths: vi.fn(),
}))
vi.mock('../test-runners/steps/step-2-validate-config.js', () => ({
  validateConfig: vi.fn(),
}))

import { handler } from './test-run.js'
import { resolvePaths } from '../test-runners/steps/step-1-resolve-paths.js'
import { validateConfig } from '../test-runners/steps/step-2-validate-config.js'
```

**What to avoid:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler } from './test-run.js'
import { resolvePaths } from '../test-runners/steps/step-1-resolve-paths.js'

// Don't place vi.mock() after the imports it affects — even though Vitest
// hoists it, the source order is misleading
vi.mock('../test-runners/steps/step-1-resolve-paths.js', () => ({
  resolvePaths: vi.fn(),
}))
```

**Project references:**
- `packages/cli/src/commands/test-run.test.ts` — 11 `vi.mock()` calls grouped before all imports
- `packages/cli/src/test-runners/steps/step-8-run-test-cases.test.ts` — mock declarations before imports of mocked modules
- `packages/data/src/jsonl-reader.test.ts` — `vi.mock('node:fs/promises')` before `import { readdir }`

### Mock Cleanup in beforeEach

Use `vi.clearAllMocks()` at the start of `beforeEach` to reset call counts and recorded arguments from the previous test. Follow it with `vi.mocked(fn).mockReturnValue()` calls to set up default return values for the current test.

**Correct usage:**

```typescript
beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(resolvePaths).mockReturnValue({ testSuiteDir: '/suites/my-suite' })
  vi.mocked(validateConfig).mockResolvedValue({ configFilePath: '/suites/my-suite/tests.json' })
  vi.mocked(readConfig).mockResolvedValue(mockConfig)
})
```

**What to avoid:**

```typescript
// Don't skip clearAllMocks — previous test's call counts leak into assertions
beforeEach(() => {
  vi.mocked(resolvePaths).mockReturnValue({ testSuiteDir: '/suites/my-suite' })
})

// Don't use restoreAllMocks when you only need to clear call history —
// restoreAllMocks removes the mock implementation entirely
beforeEach(() => {
  vi.restoreAllMocks()  // ← this undoes the vi.fn() from vi.mock(), breaking the mock
})
```

**Project references:**
- `packages/cli/src/commands/test-run.test.ts` — `vi.clearAllMocks()` followed by default mock return values
- `packages/cli/src/test-runners/steps/step-8-run-test-cases.test.ts` — `vi.clearAllMocks()` in `afterEach` with default mocks in `beforeEach`

### Global Stub Lifecycle

When stubbing Bun globals (or any `globalThis` property), use `vi.stubGlobal()` in `beforeEach` and pair it with `vi.unstubAllGlobals()` plus `vi.restoreAllMocks()` in `afterEach`. This ensures global state is fully cleaned up between tests.

**Correct usage:**

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Bun', {
    spawn: vi.fn(() => ({ exited: Promise.resolve() })),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
```

```typescript
// For Bun.file stubs with a helper factory
function makeFakeFile(exists: boolean, content = '') {
  return {
    exists: vi.fn().mockResolvedValue(exists),
    text: vi.fn().mockResolvedValue(content),
  }
}

beforeEach(() => {
  vi.stubGlobal('Bun', { file: vi.fn().mockReturnValue(makeFakeFile(false)) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
```

**What to avoid:**

```typescript
// Don't assign to globalThis directly — vi.unstubAllGlobals() won't know to clean it up
beforeEach(() => {
  ;(globalThis as any).Bun = { spawn: vi.fn() }
})

// Don't forget afterEach cleanup — global stubs leak into other test files
beforeEach(() => {
  vi.stubGlobal('Bun', { file: vi.fn() })
})
// missing afterEach with vi.unstubAllGlobals()
```

**Project references:**
- `packages/cli/src/commands/shell.test.ts` — `vi.stubGlobal('Bun', { spawn })` with full `afterEach` cleanup
- `packages/data/src/jsonl-reader.test.ts` — `vi.stubGlobal('Bun', { file })` with `makeFakeFile` helper and full `afterEach` cleanup

### Mock Return Value Patterns

Use the appropriate mock return method for the function's signature:

- `vi.mocked(fn).mockReturnValue(value)` — synchronous functions
- `vi.mocked(fn).mockResolvedValue(value)` — async functions (wraps value in `Promise.resolve`)
- `vi.mocked(fn).mockReturnValueOnce(value)` / `.mockResolvedValueOnce(value)` — when sequential calls must return different values

Chain `.mockResolvedValueOnce()` calls for multi-call scenarios.

**Correct usage:**

```typescript
// Sync return
vi.mocked(resolvePaths).mockReturnValue({ testSuiteDir: '/suites/my-suite' })

// Async return
vi.mocked(validateConfig).mockResolvedValue({ configFilePath: '/suites/my-suite/tests.json' })

// Sequential async returns — first call returns firstTotals, second returns secondTotals
vi.mocked(runTestCases)
  .mockResolvedValueOnce(firstTotals)
  .mockResolvedValueOnce(secondTotals)
```

**What to avoid:**

```typescript
// Don't wrap in Promise.resolve manually when mockResolvedValue exists
vi.mocked(validateConfig).mockReturnValue(Promise.resolve({ configFilePath: '...' }))

// Don't use mockReturnValue for async functions — it works but skips the
// implicit Promise.resolve, making the intent unclear
vi.mocked(readConfig).mockReturnValue(Promise.resolve(mockConfig))

// Don't use mockResolvedValue when you need different values per call —
// it sets the permanent default, overriding any prior mockResolvedValueOnce
vi.mocked(runTestCases).mockResolvedValueOnce(firstTotals)
vi.mocked(runTestCases).mockResolvedValue(secondTotals)  // ← overrides the once
```

**Project references:**
- `packages/cli/src/commands/test-run.test.ts` — mix of `mockReturnValue`, `mockResolvedValue`, `mockResolvedValueOnce` chaining, and `mockImplementation`

### Extracting Mock Call Arguments

Use `vi.mocked(fn).mock.calls[N]` with destructuring to extract and verify arguments passed to a mock. This is preferred over `.toHaveBeenCalledWith()` when you need to inspect individual arguments or run complex assertions on them.

**Correct usage:**

```typescript
// Destructure to extract a specific argument for detailed assertion
const [promptTests] = vi.mocked(runPromptTests).mock.calls[0]
expect(promptTests.every(t => t.type === 'prompt' || t.type === undefined)).toBe(true)
expect(promptTests).toHaveLength(2)

// Access a specific positional argument by index
const passedTotals = vi.mocked(runPromptTests).mock.calls[0][7]
expect(passedTotals).toBe(totals)

// Verify arguments across multiple calls
expect(vi.mocked(runTestCases).mock.calls[0][1]).toBe('suite-a')
expect(vi.mocked(runTestCases).mock.calls[1][1]).toBe('suite-b')
```

**What to avoid:**

```typescript
// Don't use toHaveBeenCalledWith for complex argument assertions —
// it produces hard-to-read failure messages when objects are large
expect(vi.mocked(runPromptTests)).toHaveBeenCalledWith(
  expect.arrayContaining([expect.objectContaining({ type: 'prompt' })]),
  // ... 7 more positional args
)

// Don't access mock internals without vi.mocked() — loses type safety
const calls = (runPromptTests as any).mock.calls[0]
```

**Project references:**
- `packages/cli/src/test-runners/steps/step-8-run-test-cases.test.ts` — destructured `mock.calls[0]` for routing assertions, indexed `mock.calls[0][7]` for totals threading
- `packages/cli/src/commands/test-run.test.ts` — `mock.calls[0][1]` and `mock.calls[1][1]` for multi-suite argument verification

### vi.mock Factory Shape

The factory function passed to `vi.mock()` must return an object whose keys match the named exports of the mocked module. Each export is replaced with `vi.fn()`. Never return the real module partially mixed with mocks.

**Correct usage:**

```typescript
// Each named export gets its own vi.fn()
vi.mock('../test-runners/steps/step-1-resolve-paths.js', () => ({
  resolvePaths: vi.fn(),
}))

vi.mock('../lib/sandbox.js', () => ({
  SANDBOX_NAME: 'claude-skills-harness',
  ensureSandboxExists: vi.fn(),
}))
```

**What to avoid:**

```typescript
// Don't spread the real module — partial mocks create confusing behavior
// where some calls hit real code and others hit mocks
vi.mock('../lib/sandbox.js', async () => {
  const actual = await vi.importActual('../lib/sandbox.js')
  return { ...actual, ensureSandboxExists: vi.fn() }
})

// Don't return a default export shape when the module uses named exports
vi.mock('../lib/sandbox.js', () => vi.fn())

// Don't forget to include non-function exports that tests reference
vi.mock('../lib/sandbox.js', () => ({
  ensureSandboxExists: vi.fn(),
  // missing SANDBOX_NAME — tests that import it will get undefined
}))
```

**Project references:**
- `packages/cli/src/commands/test-run.test.ts` — 11 factories, each returning an object with named exports as `vi.fn()`
- `packages/cli/src/commands/shell.test.ts` — factory includes both a constant (`SANDBOX_NAME`) and a function (`ensureSandboxExists`)
- `packages/data/src/jsonl-reader.test.ts` — factory for `node:fs/promises` with `readdir: vi.fn()`

## Additional Resources

### Project Documentation

- [Test File Organization and Naming](./test-file-organization.md) — companion standard covering file naming, co-location, describe/it conventions, and test plan annotations
- [Test Plan](../test-plan.md) — overall test strategy
- [Project Discovery](../project-discovery.md) — workspace package layout and test commands

### External Resources

- [Vitest Mocking Reference](https://vitest.dev/guide/mocking) — official Vitest mocking documentation
- [Vitest vi API](https://vitest.dev/api/vi) — `vi.mock`, `vi.fn`, `vi.mocked`, `vi.stubGlobal` API reference
