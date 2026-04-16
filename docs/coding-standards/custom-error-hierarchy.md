# Custom Error Class Hierarchy

- **Status:** proposed
- **Date Created:** 2026-03-28 08:16
- **Last Updated:** 2026-03-28 08:16
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - All workspace packages (`packages/cli`, `packages/data`, `packages/web`)

## Introduction

This coding standard defines how custom error classes are structured and tested across the test harness monorepo.

### Purpose

A single-rooted error hierarchy ensures that all domain-specific errors can be caught uniformly at process boundaries while still allowing fine-grained handling when needed. Consistent `name` properties and constructor conventions make errors identifiable in logs and catch blocks without relying on fragile message string matching.

### Scope

All TypeScript source files under `packages/*/src/` that define or throw custom error classes.

## Background

The harness CLI uses a top-level try/catch in `packages/cli/index.ts` that catches any `HarnessError` and writes a formatted message to stderr before exiting with code 1. Errors that are not `HarnessError` instances are re-thrown as unexpected failures. This boundary depends on every domain error extending `HarnessError` so that the `instanceof` check works correctly. Without a shared base class, each new error type would need its own catch clause or a brittle string-matching approach.

Setting `this.name` explicitly (rather than relying on `constructor.name`) ensures error identity survives minification, bundling, and serialization, all of which can strip or mangle constructor names.

## Coding Standard

### Base Error Class

All custom errors in the harness extend `HarnessError`, which itself extends the built-in `Error`. `HarnessError` is the single root of the error hierarchy and accepts a plain `message` string.

**Correct usage:**

```typescript
export class HarnessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarnessError'
  }
}
```

**What to avoid:**

```typescript
// Don't create additional intermediate base classes that skip HarnessError
export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppError'
  }
}

// Don't extend Error directly for domain errors — the top-level catch won't see them
export class ConfigNotFoundError extends Error { ... }
```

**Project references:**
- `packages/cli/src/lib/errors.ts` — defines `HarnessError` as the base class

### Always Set this.name

Every custom error class must set `this.name` to the exact string name of the class inside its constructor. This ensures proper identification in catch blocks, logging, and serialized output regardless of minification or bundling.

**Correct usage:**

```typescript
export class RunNotFoundError extends HarnessError {
  constructor(runDir: string) {
    super(`Test run directory not found: ${runDir}`)
    this.name = 'RunNotFoundError'
  }
}
```

**What to avoid:**

```typescript
// Don't omit this.name — defaults to 'Error' in some environments
export class RunNotFoundError extends HarnessError {
  constructor(runDir: string) {
    super(`Test run directory not found: ${runDir}`)
    // missing this.name = 'RunNotFoundError'
  }
}

// Don't use this.constructor.name — unreliable after minification
export class RunNotFoundError extends HarnessError {
  constructor(runDir: string) {
    super(`Test run directory not found: ${runDir}`)
    this.name = this.constructor.name  // breaks when bundled
  }
}
```

**Project references:**
- `packages/cli/src/lib/errors.ts` — all three error classes set `this.name` explicitly

### Specialized Errors Extend HarnessError

Domain-specific errors extend `HarnessError`, never `Error` directly. This preserves the `instanceof HarnessError` check at the CLI process boundary, allowing all harness errors to be caught and formatted uniformly.

**Correct usage:**

```typescript
export class ConfigNotFoundError extends HarnessError {
  constructor(configPath: string) {
    super(`tests.json not found: ${configPath}`)
    this.name = 'ConfigNotFoundError'
  }
}
```

**What to avoid:**

```typescript
// Don't extend Error directly — the top-level catch in index.ts won't handle it
export class ConfigNotFoundError extends Error {
  constructor(configPath: string) {
    super(`tests.json not found: ${configPath}`)
    this.name = 'ConfigNotFoundError'
  }
}
```

**Project references:**
- `packages/cli/src/lib/errors.ts` — `ConfigNotFoundError` and `RunNotFoundError` both extend `HarnessError`
- `packages/cli/index.ts` — top-level catch uses `instanceof HarnessError` to handle all domain errors

### Descriptive Constructor Parameters

Specialized error constructors accept domain-specific parameters and format them into human-readable messages. Callers pass structured data (a path, an ID, a name), not pre-formatted strings. This keeps throw sites clean and error messages consistent.

**Correct usage:**

```typescript
export class ConfigNotFoundError extends HarnessError {
  constructor(configPath: string) {
    super(`tests.json not found: ${configPath}`)
    this.name = 'ConfigNotFoundError'
  }
}

// Throw site is clean — pass the domain value, not a formatted string
throw new ConfigNotFoundError(resolvedPath)
```

**What to avoid:**

```typescript
// Don't accept a pre-formatted message — that pushes formatting to every call site
export class ConfigNotFoundError extends HarnessError {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigNotFoundError'
  }
}

// Every throw site must now duplicate the message format
throw new ConfigNotFoundError(`tests.json not found: ${resolvedPath}`)
throw new ConfigNotFoundError(`Config missing at ${resolvedPath}`)  // inconsistent
```

**Project references:**
- `packages/cli/src/lib/errors.ts` — `ConfigNotFoundError` accepts `configPath`, `RunNotFoundError` accepts `runDir`

### Testing Custom Errors

Error tests verify three properties: the `instanceof` chain (error extends the correct parent), the `name` property (set to the class name string), and the `message` content (includes the domain-specific parameter). Each error class gets its own `describe` block.

**Correct usage:**

```typescript
describe('ConfigNotFoundError', () => {
  it('is an instance of HarnessError', () => {
    const err = new ConfigNotFoundError('/some/path/tests.json')
    expect(err).toBeInstanceOf(HarnessError)
  })

  it('has name set to ConfigNotFoundError', () => {
    const err = new ConfigNotFoundError('/some/path/tests.json')
    expect(err.name).toBe('ConfigNotFoundError')
  })

  it('includes the config path in the message', () => {
    const err = new ConfigNotFoundError('/some/path/tests.json')
    expect(err.message).toContain('/some/path/tests.json')
  })
})
```

**What to avoid:**

```typescript
// Don't skip the instanceof check — it's the whole reason for the hierarchy
describe('ConfigNotFoundError', () => {
  it('has the right message', () => {
    const err = new ConfigNotFoundError('/some/path/tests.json')
    expect(err.message).toBe('tests.json not found: /some/path/tests.json')
    // missing: instanceof and name assertions
  })
})

// Don't assert the exact message string — use toContain for the domain parameter
// Exact matches break when message wording is refined
it('has the right message', () => {
  const err = new ConfigNotFoundError('/some/path/tests.json')
  expect(err.message).toBe('tests.json not found: /some/path/tests.json')  // fragile
})
```

**Project references:**
- `packages/cli/src/lib/errors.test.ts` — tests for `HarnessError`, `ConfigNotFoundError`, and `RunNotFoundError`

## Additional Resources

### Project Documentation

- [Test File Organization and Naming](./test-file-organization.md) — co-located test file conventions and describe/it patterns
- [Project Discovery](../project-discovery.md) — workspace package layout and test commands
