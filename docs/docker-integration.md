# Docker Integration

> **Tier 5 · Contributor reference.** Internal documentation for the `@testdouble/docker-integration` package — the sandbox API, the `sandbox-run.sh` script, error handling, and test patterns. If you're a user who just needs the sandbox set up before running tests, see [Getting Started: Skill Trigger Accuracy](getting-started/skill-trigger-accuracy.md).

This page tells you how the harness talks to Docker: the functions you call to create, verify, run inside, and tear down the sandbox; what `sandbox-run.sh` does inside the container; how errors propagate to each consumer; and how to mock `Bun.spawn` when testing this package. For the typed public-API deep dive, see [Docker Integration Package](docker-integration-package.md).

Centralized package for all Docker Desktop sandbox interactions in the test harness — creating, removing, and executing commands inside sandboxes.

- **Last Updated:** 2026-05-15
- **Authors:**
  - River Bailey

## Summary

- The `@testdouble/docker-integration` package is the single point of contact for all Docker CLI commands in the test harness. No other package spawns `docker` processes directly.
- Provides two categories of functions: **sandbox execution** (`ensureSandboxExists`, `runInSandbox`) for running Claude inside the sandbox, and **lifecycle management** (`createSandbox`, `removeSandbox`, `openShell`) for managing the sandbox itself.
- Uses Docker Desktop sandboxes (not traditional containers) via the `docker sandbox` CLI subcommands.
- Returns a clean `SandboxResult` type instead of exposing raw `Bun.spawn` process handles.

Key files:
- `packages/docker-integration/index.ts` — Public API barrel export
- `packages/docker-integration/src/sandbox.ts` — `ensureSandboxExists`, `runInSandbox`, `SANDBOX_NAME`
- `packages/docker-integration/src/lifecycle.ts` — `createSandbox`, `removeSandbox`, `openShell`
- `packages/docker-integration/sandbox-run.sh` — Shell script executed inside the sandbox to prepare the working directory and invoke Claude

## Architecture

```
                         ┌──────────────────────────────────────────┐
                         │          @testdouble/harness-cli         │
                         │                                          │
                         │  commands/        test-runners/   scil/  │
                         │  ┌──────────┐    ┌────────────┐  ┌────┐ │
                         │  │clean     │    │prompt/     │  │loop│ │
                         │  │shell     │    │skill-call/ │  │s5  │ │
                         │  │sandbox-  │    │            │  │s7  │ │
                         │  │ setup    │    │            │  │    │ │
                         │  │test-run  │    │            │  │    │ │
                         │  └────┬─────┘    └─────┬──────┘  └──┬─┘ │
                         │       │                │            │    │
                         └───────┼────────────────┼────────────┼────┘
                                 │                │            │
                    ┌────────────▼────────────────▼────────────▼──────┐
                    │       @testdouble/docker-integration            │
                    │                                                 │
                    │  ┌─────────────────┐   ┌────────────────────┐  │
                    │  │   sandbox.ts     │   │   lifecycle.ts      │ │
                    │  │                 │   │                    │  │
                    │  │ ensureSandbox   │   │ createSandbox()    │  │
                    │  │  Exists()      │◄──│ removeSandbox()    │  │
                    │  │ runInSandbox() │   │ openShell()        │  │
                    │  │ SANDBOX_NAME   │   │                    │  │
                    │  └───────┬─────────┘   └────────────────────┘  │
                    │          │                                      │
                    │          ▼                                      │
                    │   sandbox-run.sh                                │
                    │   (runs inside Docker)                          │
                    └────────────────────────────────────────────────┘
                                       │
                                       ▼
                              Docker Desktop Sandbox
                              "claude-skills-harness"
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/docker-integration/package.json` | Package metadata (`@testdouble/docker-integration`) |
| `packages/docker-integration/index.ts` | Barrel re-export of all public symbols |
| `packages/docker-integration/src/sandbox.ts` | `SANDBOX_NAME`, `ensureSandboxExists`, `runInSandbox` |
| `packages/docker-integration/src/lifecycle.ts` | `createSandbox`, `removeSandbox`, `openShell` |
| `packages/docker-integration/src/types.ts` | `SandboxResult` interface |
| `packages/docker-integration/src/errors.ts` | `DockerError` class |
| `packages/docker-integration/sandbox-run.sh` | Scaffold setup and Claude invocation inside the sandbox |
| `packages/docker-integration/src/sandbox.test.ts` | Tests for sandbox execution functions |
| `packages/docker-integration/src/lifecycle.test.ts` | Tests for lifecycle management functions |
| `packages/docker-integration/src/errors.test.ts` | Tests for `DockerError` |

## Core Types

```typescript
// types.ts — Return type of runInSandbox
export interface SandboxResult {
  exitCode: number   // proc.exitCode, defaults to 1 if null
  stdout: string     // full captured stdout
  stderr: string     // full captured stderr
}

// errors.ts — Thrown by sandbox and lifecycle functions
export class DockerError extends Error {
  constructor(message: string, public exitCode: number | null) {
    super(message)
    this.name = 'DockerError'
  }
}
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `SANDBOX_NAME` | `'claude-skills-harness'` | Name of the Docker Desktop sandbox used for all test execution |

## Implementation Details

### Sandbox Execution

#### ensureSandboxExists

Pre-flight check that the sandbox is running. Runs `docker sandbox ls` and verifies `SANDBOX_NAME` appears in the output. Throws `DockerError` with `exitCode: null` if not found.

Called by:
- `commands/test-run.ts` — before the per-suite test loop
- `scil/loop.ts` — before the SCIL iteration loop
- `lifecycle.ts: openShell()` — before spawning an interactive bash session

#### runInSandbox

The primary execution function. Spawns a Claude process inside the Docker sandbox and captures all output.

```typescript
export async function runInSandbox(
  claudeArgs: string[],
  scaffoldPath: string | null,
  debug: boolean
): Promise<SandboxResult>
```

**Command built:** `docker sandbox exec claude-skills-harness <sandboxRunScript> <scaffoldPath> ...claudeArgs`

**Output handling:**
- stdout is streamed chunk-by-chunk via a `ReadableStream` reader. When `debug` is `true`, each chunk is also written to `process.stdout` in real time.
- stderr is drained in parallel via `new Response(stream).text()`. When `debug` is `true` and stderr is non-empty, it is written to `process.stderr`.
- Both streams are fully captured regardless of the `debug` flag.

**Consumers and their claude args patterns:**

| Consumer | Key Args | Scaffold |
|----------|----------|----------|
| Prompt test runner | `--dangerously-skip-permissions`, `--plugin-dir` (all plugins), `--print` | From test config |
| Skill-call test runner | `--plugin-dir` (temp single-skill plugin), `--print` | From test config |
| SCIL step-5 (runEval) | `--plugin-dir` (temp plugin), `--print` | From test config |
| SCIL step-7 (improveDescription) | `--model`, `--print` (no plugins) | `null` |
| LLM judge (step-3b) | `--model`, `--print` (no plugins) | `null` |

### sandbox-run.sh

Shell script that runs inside the Docker sandbox. Receives `SCAFFOLD_PATH` as `$1` and remaining args are passed through to `claude`.

```sh
#!/bin/sh
set -e

SCAFFOLD_PATH="$1"
shift  # remaining args are claude args

if [ -n "$SCAFFOLD_PATH" ] && [ -d "$SCAFFOLD_PATH" ]; then
  WORK=$(mktemp -d)
  cp -r "$SCAFFOLD_PATH/." "$WORK/"
  cd "$WORK"
  git init -b main -q
  git config user.email "test@test.com"
  git config user.name "Test"
  git add -A
  git commit -q -m "Initial commit" --allow-empty
fi

exec claude "$@"
```

When a scaffold path is provided, it copies the scaffold into a fresh temp directory and initializes a git repository with a single commit. This gives Claude a clean, committed working tree to operate in. When no scaffold is needed, `runInSandbox` passes an empty string and the script skips directly to `exec claude`.

### Lifecycle Management

#### createSandbox

```typescript
export async function createSandbox(repoRoot: string): Promise<void>
```

Checks if the sandbox already exists via an internal `sandboxExists()` helper. If it does, prints a help message to stderr and returns. Otherwise, spawns `docker sandbox run --name claude-skills-harness claude <repoRoot>` with inherited stdio for interactive OAuth login.

Called by `commands/sandbox-setup.ts`.

#### removeSandbox

```typescript
export async function removeSandbox(): Promise<void>
```

Runs `docker sandbox rm claude-skills-harness`. Drains stdout and stderr in parallel. Throws `DockerError` with the process exit code on failure.

Called by `commands/clean.ts`, which catches `DockerError` and re-throws as `HarnessError`.

#### openShell

```typescript
export async function openShell(): Promise<void>
```

Calls `ensureSandboxExists()` first, then spawns `docker sandbox exec -it claude-skills-harness -- bash` with inherited stdio for an interactive debugging session.

Called by `commands/shell.ts`.

### Cross-Runtime Path Resolution

The path to `sandbox-run.sh` is resolved at module scope using the project's cross-runtime fallback chain:

```typescript
const currentDir = import.meta.dir ?? import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname)
const sandboxRunScript = path.resolve(currentDir, '..', 'sandbox-run.sh')
```

- `import.meta.dir` — Bun runtime
- `import.meta.dirname` — Node / Vitest
- `path.dirname(new URL(import.meta.url).pathname)` — Universal ESM fallback

See [Cross-Runtime Meta Property Resolution](coding-standards/cross-runtime-meta-resolution.md) for the full standard.

## Error Handling

| Scenario | Error Type | Behavior |
|----------|------------|----------|
| Sandbox not found by `ensureSandboxExists` | `DockerError` (exitCode: `null`) | Thrown with message suggesting `./harness sandbox-setup` |
| `docker sandbox rm` fails | `DockerError` (exitCode: process code) | Thrown with stdout+stderr in message |
| Non-zero exit code from `runInSandbox` | No error thrown | Returned in `SandboxResult.exitCode`; caller decides |
| `runInSandbox` with `proc.exitCode` null | No error thrown | `exitCode` defaults to `1` in `SandboxResult` |

**Consumer error handling patterns:**

| Layer | Pattern |
|-------|---------|
| CLI commands (`clean.ts`) | Catches `DockerError`, re-throws as `HarnessError` |
| Pre-flight checks (`test-run.ts`, `loop.ts`) | No catch — `DockerError` propagates and crashes the process |
| Test runners (`prompt/`, `skill-call/`) | Checks `exitCode` on `SandboxResult`, increments failure counter |
| LLM judge (`step-3b`) | Catches all errors, records `status: 'infrastructure-error'` in results |
| SCIL step-5 | Catches errors per work-item, logs to stderr, continues |

## Testing

- `packages/docker-integration/src/errors.test.ts` — `DockerError` construction and properties
- `packages/docker-integration/src/sandbox.test.ts` — `ensureSandboxExists` and `runInSandbox` with mocked `Bun.spawn`
- `packages/docker-integration/src/lifecycle.test.ts` — `removeSandbox`, `createSandbox`, `openShell` with mocked `Bun.spawn` and `sandbox.js`

### Test Patterns

`Bun.spawn` is mocked via `vi.stubGlobal`:

```typescript
beforeEach(() => {
  vi.stubGlobal('Bun', { spawn: vi.fn() })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
```

Mock return values use real `ReadableStream` instances (not fake objects) so they work with `new Response(stream).text()`:

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

Modules under test are imported dynamically inside each `it` block via `await import('./sandbox.js')` so that `Bun.spawn` stubs are in place before the module-level `import.meta` resolution runs.

## Troubleshooting

### Sandbox not found

If `ensureSandboxExists` throws `DockerError`, run:

1. `./harness sandbox-setup` — creates the sandbox and completes OAuth
2. Verify with `docker sandbox ls` — should list `claude-skills-harness`

### Sandbox already exists during setup

`createSandbox` returns early with a help message. To recreate:

1. `docker sandbox rm claude-skills-harness`
2. `./harness sandbox-setup`

### Tests fail with "Cannot read properties of undefined (reading 'exited')"

This means a `Bun.spawn` mock is missing a return value. Ensure every `spawn` call in the test has a corresponding `mockReturnValue` or `mockReturnValueOnce` with at least `{ exited: Promise.resolve() }`.

## Related Documentation

- [Test Scaffolding](test-scaffolding.md) — How scaffolds provide project context in the Docker sandbox
- [LLM Judge](llm-judge.md) — Judge evaluation runs inside the sandbox via `runInSandbox`
- [Test Suite Reference](test-suite-reference.md) — Test case config including scaffold and model fields consumed by `runInSandbox`
- [Skill Call Improvement Loop](skill-call-improvement-loop.md) — SCIL uses `ensureSandboxExists` and `runInSandbox`
- [Skip Permissions in Test Sandbox](adrs/20260326084800-skip-permissions-in-test-sandbox.md) — ADR on using `--dangerously-skip-permissions` inside the sandbox
- [Cross-Runtime Meta Property Resolution](coding-standards/cross-runtime-meta-resolution.md) — Coding standard for the `import.meta` fallback chain used in this package
- [Claude Integration](./claude-integration.md) — Higher-level Claude CLI wrapper that delegates to this package via `execInSandbox`

---

**Next:** [Docker Integration Package](./docker-integration-package.md) — the typed public-API deep dive: barrel exports, consumer import map, and file inventory.
**Related:** [Claude Integration](./claude-integration.md) — the layer directly above this one.
