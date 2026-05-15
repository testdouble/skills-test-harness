# Cross-Runtime Meta Property Resolution

- **Status:** proposed
- **Date Created:** 2026-03-28 08:45
- **Last Updated:** 2026-03-28 10:15
- **Authors:**
  - River Bailey (mxriverlynn, river.bailey@testdouble.com)
- **Reviewers:**
- **Applies To:**
  - All workspace packages (`packages/cli`, `packages/data`, `packages/web`, `packages/test-fixtures`, `packages/sandbox-integration`)

## Introduction

This coding standard defines how to resolve the current file's directory path using `import.meta` properties in a way that works across the Bun runtime, the Vitest test runner, and Bun compiled binaries.

### Purpose

The test harness runs production code under Bun but executes tests under Vitest (which uses Node). Additionally, the CLI and web binaries are compiled via `bun build --compile`, which introduces a third runtime context where `import.meta.dir` resolves to a virtual `/$bunfs/root` path. Bun provides `import.meta.dir` for the current file's directory, but this property is `undefined` in Vitest. Conversely, `import.meta.dirname` works in Node/Vitest but is not always available in Bun. In compiled binaries, `import.meta.dir` resolves to `/$bunfs/root` for ALL bundled modules regardless of their original source location, making relative path resolution produce nonexistent virtual paths. Without a consistent resolution strategy, code that derives paths from `import.meta` will break in one or more of these contexts.

### Scope

All TypeScript source files under `packages/*/src/` that need to resolve filesystem paths relative to the current file's location at runtime.

## Background

The ESM specification defines `import.meta` as a host-populated object, meaning each runtime decides which properties to expose. This has led to fragmentation:

- **Bun** provides `import.meta.dir` (the directory of the current file) and `import.meta.path` (the full file path), but does not reliably provide `import.meta.dirname`.
- **Node.js** (used by Vitest) provides `import.meta.dirname` and `import.meta.filename` (added in Node 21.2 / 22), but does not provide `import.meta.dir`.
- **Bun compiled binaries** (`bun build --compile`) set `import.meta.dir` to `/$bunfs/root` for ALL bundled modules. This is a virtual filesystem path inside the binary — it does not preserve per-module source directories and does not correspond to any real filesystem path. Files referenced relative to this path will not exist.
- **Both runtimes** provide `import.meta.url` as a `file://` URL string, which is the only truly universal property.

The `import.meta.url` fallback uses `new URL(import.meta.url).pathname` to extract a filesystem path from the URL, then `path.dirname()` to get the directory. This is functionally equivalent to `import.meta.dir` / `import.meta.dirname` but works in every ESM-compliant runtime.

An alternative approach uses `fileURLToPath` from `node:url`, which correctly handles edge cases like spaces and special characters in paths. Either URL-based approach is acceptable as the final fallback.

## Coding Standard

### Use the Fallback Chain for Current Directory Resolution

When resolving the current file's directory, use a nullish-coalescing fallback chain that tries runtime-specific properties first and falls back to the universal `import.meta.url` approach.

**Correct usage:**

```typescript
import path from 'node:path'

// Fallback chain: Bun → Node → universal
const currentDir = import.meta.dir ?? import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname)

// Use currentDir to resolve relative paths
const configPath = path.resolve(currentDir, '..', 'config.json')
const scriptPath = path.resolve(currentDir, '..', 'sandbox-run.sh')
```

**Alternative with fileURLToPath (also correct):**

```typescript
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Fallback chain with fileURLToPath for the universal fallback
const currentDir = import.meta.dir ?? import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url))
```

**What to avoid:**

```typescript
// Bun-only — undefined in Vitest, produces "undefined" in path segments
const scriptPath = path.resolve(import.meta.dir, '..', 'sandbox-run.sh')

// Node-only — may be undefined in Bun
const scriptPath = path.resolve(import.meta.dirname, '..', 'sandbox-run.sh')

// Missing fallback chain — only works if the first property exists
const currentDir = import.meta.dir || import.meta.dirname
```

**Project references:**
- `packages/bun-helpers/src/resolve.ts` — canonical implementation of the fallback chain (inside `currentDir`)

Note: The raw fallback chain is encapsulated in `@testdouble/bun-helpers`. Use the helper instead of writing the chain directly. See "Use `@testdouble/bun-helpers` for Path Resolution" below.

### Extract the Fallback Chain to a Module-Level Constant

Assign the resolved directory to a `const` at module scope rather than inlining the fallback chain at each usage site. This keeps path derivations readable and ensures the resolution happens once.

**Correct usage:**

```typescript
import path from 'node:path'

const currentDir = import.meta.dir ?? import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname)

// Derived paths are clean and readable
const sandboxRunScript = path.resolve(currentDir, '..', 'sandbox-run.sh')
const templatesDir = path.resolve(currentDir, 'templates')
```

**What to avoid:**

```typescript
import path from 'node:path'

// Inlining the fallback at every usage — noisy and error-prone
const script = path.resolve(
  import.meta.dir ?? import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  '..', 'sandbox-run.sh'
)
const templates = path.resolve(
  import.meta.dir ?? import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  'templates'
)
```

**Project references:**
- `packages/sandbox-integration/src/sandbox.ts` — `const currentDir` assigned at module scope, then used to derive `sandboxRunScript`

### Use `@testdouble/bun-helpers` for Path Resolution

The `@testdouble/bun-helpers` package provides helper functions that encapsulate the fallback chain and handle compiled binary path resolution. This is the recommended approach for all new code.

**`currentDir(meta)`** — resolves the current file's directory across all three runtime contexts (Bun source, Vitest/Node, compiled binary):

```typescript
import { currentDir } from '@testdouble/bun-helpers'

const FIXTURES_DIR = currentDir(import.meta)
```

**`resolveRelativePath(meta, sourcePath, compiledPath)`** — resolves a file path that must work in both source mode and compiled binaries. Accepts two paths: one relative to the source file (used in Bun source and Vitest), and one relative to the compiled binary's directory (used when `import.meta.dir` is a `$bunfs` path). Throws if the resolved path does not exist.

```typescript
import { resolveRelativePath } from '@testdouble/bun-helpers'

const sandboxRunScript = resolveRelativePath(
  import.meta,
  '../sandbox-run.sh',                          // relative to source file (src/ → parent)
  'packages/sandbox-integration/sandbox-run.sh'   // relative to compiled binary directory
)
```

The caller must pass `import.meta` directly because `import.meta` is scoped to the calling module and cannot be read from inside a helper in a different module.

**Project references:**
- `packages/bun-helpers/src/resolve.ts` — implementation of `currentDir` and `resolveRelativePath`
- `packages/sandbox-integration/src/sandbox.ts` — uses `resolveRelativePath` to locate `sandbox-run.sh`
- `packages/test-fixtures/load-fixtures.ts` — uses `currentDir` to locate the fixtures directory

### Handle Compiled Binary Path Resolution

When the harness is compiled via `bun build --compile`, all modules are bundled into a single executable. In this context, `import.meta.dir` resolves to `/$bunfs/root` for every module — it does not preserve the original source file's directory. This means any path resolved relative to `import.meta.dir` will point to a nonexistent `$bunfs` virtual path.

The `resolveRelativePath` helper handles this by accepting a second path (`compiledPath`) that is relative to the directory containing the compiled binary. The compiled binary's location is determined via `process.execPath`. The Makefile compiles binaries to the `tests/` directory (e.g., `tests/harness`), so `compiledPath` values are relative to `tests/`.

**What to avoid:**

```typescript
// Breaks in compiled binary — import.meta.dir is /$bunfs/root for ALL modules
const currentDir = import.meta.dir ?? import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname)
const script = path.resolve(currentDir, '..', 'sandbox-run.sh')
// Result in compiled binary: /$bunfs/sandbox-run.sh (does not exist)
```

**Correct approach:**

```typescript
import { resolveRelativePath } from '@testdouble/bun-helpers'

const script = resolveRelativePath(
  import.meta,
  '../sandbox-run.sh',                          // works in source mode
  'packages/sandbox-integration/sandbox-run.sh'   // works in compiled binary
)
```

**When you need `resolveRelativePath`:** Any code that resolves a non-TypeScript sibling file (shell scripts, config files, templates) AND is included in a compiled binary (`packages/cli` or `packages/web`). TypeScript imports are bundled into the binary and do not need path resolution.

**When `currentDir` is sufficient:** Code that only needs the directory path itself (e.g., to locate fixture directories) and either does not run in compiled binaries or only accesses files that are bundled via `import ... with { type: 'file' }`.

## Additional Resources

### Project Documentation

- [ESM Import Conventions](./esm-import-conventions.md) — related conventions for import extensions, `node:` prefix, and `import type`
- [bun-helpers](../bun-helpers.md) — full package documentation including architecture, implementation details, and consumer guide
- [Project Discovery](../project-discovery.md) — workspace package layout and Bun runtime details

### External Resources

- [Bun import.meta](https://bun.sh/docs/api/import-meta) — Bun's `import.meta` properties including `dir`, `path`, `url`
- [Node.js import.meta](https://nodejs.org/api/esm.html#importmeta) — Node.js `import.meta` properties including `dirname`, `filename`, `url`
- [MDN import.meta](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import.meta) — baseline ESM spec for `import.meta`
