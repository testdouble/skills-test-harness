# Docker Integration Package

The `@testdouble/docker-integration` package is the single point of contact for all Docker Desktop sandbox interactions in the test harness. It wraps the `docker sandbox` CLI subcommands and exposes a typed TypeScript API for creating, removing, verifying, and executing commands inside Docker Desktop sandboxes.

- **Package:** `@testdouble/docker-integration` (v0.1.0, private)
- **Runtime:** Bun (ESNext target, strict TypeScript)
- **Test framework:** Vitest
- **Location:** `packages/docker-integration/`

## Purpose

No other package in the test harness spawns `docker` processes directly. All Docker CLI access is funneled through this package, which provides two categories of functionality:

1. **Sandbox execution** -- verifying the sandbox exists and running commands inside it (`ensureSandboxExists`, `execInSandbox`)
2. **Lifecycle management** -- creating, removing, and opening interactive shells in the sandbox (`createSandbox`, `removeSandbox`, `openShell`)

The package returns a clean `SandboxResult` type instead of exposing raw `Bun.spawn` process handles, giving consumers a stable interface decoupled from the process spawning implementation.

## Public API

All public symbols are re-exported from the barrel file `index.ts`:

```typescript
export { SANDBOX_NAME, ensureSandboxExists, execInSandbox } from './src/sandbox.js'
export { createSandbox, removeSandbox, openShell } from './src/lifecycle.js'
export { DockerError } from './src/errors.js'
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

### DockerError

Custom error class thrown by sandbox verification and lifecycle functions.

```typescript
class DockerError extends Error {
  constructor(message: string, public exitCode: number | null)
  name: 'DockerError'
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

Pre-flight check that the sandbox is running. Runs `docker sandbox ls` and verifies `SANDBOX_NAME` appears in the output. Throws `DockerError` with `exitCode: null` if the sandbox is not found, with a message directing the user to run `./harness sandbox-setup`.

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

Primary execution function. Builds and spawns the command `docker sandbox exec claude-skills-harness <command> <scaffoldPath> ...args`.

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

Checks whether the sandbox already exists via an internal `sandboxExists()` helper (runs `docker sandbox ls`). If found, prints a help message to stderr explaining how to recreate it, and returns early. Otherwise, spawns `docker sandbox run --name claude-skills-harness claude <repoRoot>` with inherited stdio for interactive OAuth login. Prints progress messages to stderr.

**Consumer:** `cli/src/commands/sandbox-setup.ts`

#### removeSandbox()

```typescript
async function removeSandbox(): Promise<void>
```

Runs `docker sandbox rm claude-skills-harness`. Drains stdout and stderr in parallel using a `drainStream` helper. Throws `DockerError` with the process exit code and captured output on non-zero exit.

**Consumer:** `cli/src/commands/clean.ts` -- catches `DockerError` and re-throws as `HarnessError`

#### openShell()

```typescript
async function openShell(): Promise<void>
```

Calls `ensureSandboxExists()` first, then spawns `docker sandbox exec -it claude-skills-harness -- bash` with inherited stdio for an interactive debugging session.

**Consumer:** `cli/src/commands/shell.ts`

### errors.ts -- Error Types

Contains the `DockerError` class (see Core Types above). Extends `Error` with an explicit `name` property set to `'DockerError'` and an `exitCode` field that accepts `number | null`.

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
                     │       @testdouble/docker-integration         │
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
                     │  │  SandboxResult   │  │  DockerError      │ │
                     │  └─────────────────┘  └──────────────────┘  │
                     └─────────────────────────────────────────────┘
                                           │
                                           ▼
                                  Docker Desktop Sandbox
                                  "claude-skills-harness"
```

**Dependency flow:** CLI commands and the SCIL loop import lifecycle and verification functions directly. The `claude-integration` package imports `execInSandbox` as the execution primitive. All Docker CLI access bottlenecks through this package.

## Consumer Import Map

| Consumer | Imports |
|----------|---------|
| `cli/src/commands/sandbox-setup.ts` | `createSandbox` |
| `cli/src/commands/clean.ts` | `removeSandbox`, `SANDBOX_NAME`, `DockerError` |
| `cli/src/commands/shell.ts` | `openShell` |
| `cli/src/commands/test-run.ts` | `ensureSandboxExists` |
| `cli/src/scil/loop.ts` | `ensureSandboxExists` |
| `claude-integration/src/run-claude.ts` | `execInSandbox` |

## Error Handling

| Scenario | Error Type | Behavior |
|----------|------------|----------|
| Sandbox not found by `ensureSandboxExists` | `DockerError` (exitCode: `null`) | Thrown with message suggesting `./harness sandbox-setup` |
| `docker sandbox rm` fails | `DockerError` (exitCode: process code) | Thrown with stdout+stderr in message |
| Non-zero exit from `execInSandbox` | No error thrown | Returned in `SandboxResult.exitCode`; caller decides |
| `proc.exitCode` is null in `execInSandbox` | No error thrown | Defaults to `1` in `SandboxResult` |

## Testing

Three test files with full coverage of the public API:

| File | Covers |
|------|--------|
| `src/errors.test.ts` | `DockerError` construction, properties, inheritance |
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
| `src/errors.ts` | `DockerError` class |
| `src/sandbox.ts` | `SANDBOX_NAME`, `ensureSandboxExists`, `execInSandbox` |
| `src/lifecycle.ts` | `createSandbox`, `removeSandbox`, `openShell` |
| `src/errors.test.ts` | Unit tests for `DockerError` |
| `src/sandbox.test.ts` | Unit tests for sandbox execution functions |
| `src/lifecycle.test.ts` | Unit tests for lifecycle management functions |

## Related Documentation

- [Docker Integration](docker-integration.md) -- Original architecture and consumer reference
- [Test Scaffolding](test-scaffolding.md) -- How scaffolds provide project context in the Docker sandbox
- [Test Harness Architecture](test-harness-architecture.md) -- System architecture and package boundaries
- [Cross-Runtime Meta Property Resolution](coding-standards/cross-runtime-meta-resolution.md) -- Coding standard for `import.meta` fallback chains
