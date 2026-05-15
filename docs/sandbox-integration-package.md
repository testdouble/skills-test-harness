# Sandbox Integration Package

> **Tier 5 · Contributor reference.** Internal API deep-dive for the `@testdouble/sandbox-integration` package — the barrel exports, every public function signature, the consumer import map, and test patterns. If you're a user who just needs the sandbox set up before running tests, see [Getting Started: Skill Trigger Accuracy](getting-started/skill-trigger-accuracy.md).

This page is the typed reference for the package's public surface: each exported symbol, its signature and behavior, which consumer imports it, the error matrix, and the `Bun.spawn` mocking conventions for its tests. For the architecture-level walkthrough and the `sandbox-run.sh` script, see [Sandbox Integration](sandbox-integration.md).

The `@testdouble/sandbox-integration` package is the single point of contact for Docker Sandboxes via `sbx` in the test harness. It wraps the `sbx` CLI subcommands and exposes a typed TypeScript API for creating, removing, verifying, and executing commands inside Test Sandboxes.

- **Package:** `@testdouble/sandbox-integration` (v0.1.0, private)
- **Runtime:** Bun (ESNext target, strict TypeScript)
- **Test framework:** Vitest
- **Location:** `packages/sandbox-integration/`

## Purpose

No other package in the test harness spawns `sbx` processes directly. All Sandbox CLI access is funneled through this package, which provides two categories of functionality:

1. **Sandbox execution** -- verifying the sandbox exists and running commands inside it (`ensureSandboxExists`, `execInSandbox`)
2. **Lifecycle management** -- creating, removing, and opening interactive shells in the sandbox (`createSandbox`, `removeSandbox`, `openShell`)

The package returns a clean `SandboxResult` type instead of exposing raw `Bun.spawn` process handles, giving consumers a stable interface decoupled from the process spawning implementation.

## Public API

All public symbols are re-exported from the barrel file `index.ts`:

```typescript
export { SANDBOX_NAME, ensureSandboxExists, execInSandbox } from './src/sandbox.js'
export { createSandbox, removeSandbox, openShell } from './src/lifecycle.js'
export { SandboxError } from './src/errors.js'
export type { SandboxResult } from './src/types.js'
```

## Core Types

### SandboxResult

Return type of `execInSandbox`. Captures the full output of a command run inside the sandbox.

```typescript
interface SandboxResult {
  exitCode: number   // Process exit code; defaults to 1 when proc.exitCode is null
  stdout: string     // Full captured stdout
  stderr: string     // Full captured stderr
}
```

### SandboxError

Custom error class thrown by sandbox verification and lifecycle functions.

```typescript
class SandboxError extends Error {
  constructor(message: string, public exitCode: number | null)
  name: 'SandboxError'
}
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `SANDBOX_NAME` | `'claude-skills-harness'` | Name of the Docker Desktop sandbox used for all test execution |

## Module Reference

### sandbox.ts -- Sandbox Execution

#### ensureSandboxExists()

```typescript
async function ensureSandboxExists(): Promise<void>
```

Pre-flight check that the sandbox is running. Runs `sbx ls --quiet` and verifies `SANDBOX_NAME` exactly matches one output line. Throws `SandboxError` with `exitCode: null` if the sandbox is not found, with a message directing the user to run `./harness sandbox-setup`.

**Consumers:**
- `cli/src/commands/test-run.ts` -- before the per-suite test loop
- `cli/src/scil/loop.ts` -- before the SCIL iteration loop
- `lifecycle.ts: openShell()` -- before spawning an interactive bash session

#### execInSandbox()

```typescript
async function execInSandbox(
  command: string,
  args: string[],
  scaffoldPath: string | null,
  debug: boolean
): Promise<SandboxResult>
```

Primary execution function. Builds and spawns the command `sbx exec claude-skills-harness <command> <scaffoldPath> ...args`.

**Output handling:**
- stdout is streamed chunk-by-chunk via a `ReadableStream` reader. When `debug` is `true`, each chunk is also written to `process.stdout` in real time.
- stderr is drained in parallel via `new Response(stream).text()`. When `debug` is `true` and stderr is non-empty, it is written to `process.stderr`.
- Both streams are fully captured regardless of the `debug` flag.
- Does not throw on non-zero exit codes; the caller inspects `SandboxResult.exitCode`.

**Consumer:** `claude-integration/src/run-claude.ts` imports `execInSandbox` as the execution primitive for all Claude invocations inside the sandbox.

### lifecycle.ts -- Lifecycle Management

#### createSandbox()

```typescript
async function createSandbox(repoRoot: string): Promise<void>
```

Checks whether the sandbox already exists via an internal `sandboxExists()` helper (runs `sbx ls --quiet`). If found, prints a help message to stderr explaining how to recreate it, and returns early. Otherwise, spawns `sbx run --name claude-skills-harness claude <repoRoot>` with inherited stdio for interactive OAuth login. Prints progress messages to stderr.

**Consumer:** `cli/src/commands/sandbox-setup.ts`

#### removeSandbox()

```typescript
async function removeSandbox(): Promise<void>
```

Runs `sbx rm --force claude-skills-harness`. Drains stdout and stderr in parallel using a `drainStream` helper. Throws `SandboxError` with the process exit code and captured output on non-zero exit.

**Consumer:** `cli/src/commands/clean.ts` -- catches `SandboxError` and re-throws as `HarnessError`

#### openShell()

```typescript
async function openShell(): Promise<void>
```

Calls `ensureSandboxExists()` first, then spawns `sbx exec -it claude-skills-harness bash` with inherited stdio for an interactive debugging session.

**Consumer:** `cli/src/commands/shell.ts`

### errors.ts -- Error Types

Contains the `SandboxError` class (see Core Types above). Extends `Error` with an explicit `name` property set to `'SandboxError'` and an `exitCode` field that accepts `number | null`.

### types.ts -- Type Definitions

Contains the `SandboxResult` interface (see Core Types above).

## Architecture

```
                     ┌──────────────────────────────────────────────┐
                     │            @testdouble/harness-cli           │
                     │                                              │
                     │  commands/           scil/                   │
                     │  ┌──────────────┐   ┌──────────────┐        │
                     │  │ sandbox-setup│   │ loop         │        │
                     │  │ clean        │   └──────┬───────┘        │
                     │  │ shell        │          │                │
                     │  │ test-run     │          │                │
                     │  └──────┬───────┘          │                │
                     └─────────┼──────────────────┼────────────────┘
                               │                  │
                     ┌─────────▼──────────────────▼────────────────┐
                     │       @testdouble/claude-integration         │
                     │       (run-claude.ts)                        │
                     └─────────────────────┬───────────────────────┘
                                           │
                     ┌─────────────────────▼───────────────────────┐
                     │       @testdouble/sandbox-integration         │
                     │                                              │
                     │  ┌─────────────────┐  ┌──────────────────┐  │
                     │  │  sandbox.ts      │  │  lifecycle.ts     │ │
                     │  │                 │  │                  │  │
                     │  │ ensureSandbox   │  │ createSandbox()  │  │
                     │  │  Exists()      │◄─│ removeSandbox()  │  │
                     │  │ execInSandbox()│  │ openShell()      │  │
                     │  │ SANDBOX_NAME   │  │                  │  │
                     │  └───────┬─────────┘  └──────────────────┘  │
                     │          │                                   │
                     │  ┌───────▼─────────┐  ┌──────────────────┐  │
                     │  │  types.ts        │  │  errors.ts        │ │
                     │  │  SandboxResult   │  │  SandboxError      │ │
                     │  └─────────────────┘  └──────────────────┘  │
                     └─────────────────────────────────────────────┘
                                           │
                                           ▼
                                  Docker Desktop Sandbox
                                  "claude-skills-harness"
```

**Dependency flow:** CLI commands and the SCIL loop import lifecycle and verification functions directly. The `claude-integration` package imports `execInSandbox` as the execution primitive. All Sandbox CLI access bottlenecks through this package.

## Consumer Import Map

| Consumer | Imports |
|----------|---------|
| `cli/src/commands/sandbox-setup.ts` | `createSandbox` |
| `cli/src/commands/clean.ts` | `removeSandbox`, `SANDBOX_NAME`, `SandboxError` |
| `cli/src/commands/shell.ts` | `openShell` |
| `cli/src/commands/test-run.ts` | `ensureSandboxExists` |
| `cli/src/scil/loop.ts` | `ensureSandboxExists` |
| `claude-integration/src/run-claude.ts` | `execInSandbox` |

## Error Handling

| Scenario | Error Type | Behavior |
|----------|------------|----------|
| Sandbox not found by `ensureSandboxExists` | `SandboxError` (exitCode: `null`) | Thrown with message suggesting `./harness sandbox-setup` |
| `sbx rm` fails | `SandboxError` (exitCode: process code) | Thrown with stdout+stderr in message |
| Non-zero exit from `execInSandbox` | No error thrown | Returned in `SandboxResult.exitCode`; caller decides |
| `proc.exitCode` is null in `execInSandbox` | No error thrown | Defaults to `1` in `SandboxResult` |

## Testing

Three test files with full coverage of the public API:

| File | Covers |
|------|--------|
| `src/errors.test.ts` | `SandboxError` construction, properties, inheritance |
| `src/sandbox.test.ts` | `ensureSandboxExists`, `execInSandbox` |
| `src/lifecycle.test.ts` | `removeSandbox`, `createSandbox`, `openShell` |

### Test Patterns

**Bun.spawn mocking:** Tests stub the global `Bun` object via `vi.stubGlobal` in `beforeEach` and restore in `afterEach`:

```typescript
beforeEach(() => {
  vi.stubGlobal('Bun', { spawn: vi.fn() })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
```

**ReadableStream mocks:** Mock return values use real `ReadableStream` instances so they work with `new Response(stream).text()`:

```typescript
function makeStream(content: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (content) controller.enqueue(new TextEncoder().encode(content))
      controller.close()
    }
  })
}
```

**Dynamic imports:** Modules under test are imported dynamically inside each `it` block via `await import('./sandbox.js')` so that `Bun.spawn` stubs are in place before module-level code executes.

**Module mocking:** `lifecycle.test.ts` mocks `sandbox.js` via `vi.mock` to isolate lifecycle functions from the sandbox module, providing a controlled `ensureSandboxExists` stub.

## File Inventory

| File | Purpose |
|------|---------|
| `package.json` | Package metadata (name, version, devDependencies) |
| `tsconfig.json` | TypeScript config (ESNext, bundler resolution, strict, bun-types) |
| `index.ts` | Barrel re-export of all public symbols |
| `src/types.ts` | `SandboxResult` interface |
| `src/errors.ts` | `SandboxError` class |
| `src/sandbox.ts` | `SANDBOX_NAME`, `ensureSandboxExists`, `execInSandbox` |
| `src/lifecycle.ts` | `createSandbox`, `removeSandbox`, `openShell` |
| `src/errors.test.ts` | Unit tests for `SandboxError` |
| `src/sandbox.test.ts` | Unit tests for sandbox execution functions |
| `src/lifecycle.test.ts` | Unit tests for lifecycle management functions |

## Related Documentation

- [Sandbox Integration](sandbox-integration.md) -- Original architecture and consumer reference
- [Test Scaffolding](test-scaffolding.md) -- How scaffolds provide project context in the Test Sandbox
- [Test Harness Architecture](test-harness-architecture.md) -- System architecture and package boundaries
- [Cross-Runtime Meta Property Resolution](coding-standards/cross-runtime-meta-resolution.md) -- Coding standard for `import.meta` fallback chains

---

**Next:** [Sandbox Integration](sandbox-integration.md) -- the architecture walkthrough and the `sandbox-run.sh` script that runs inside the container.
**Related:** [Test Harness Architecture](test-harness-architecture.md) -- where this package sits in the dependency graph.
