# ESM Import Conventions

- **Status:** proposed
- **Date Created:** 2026-03-28 08:16
- **Last Updated:** 2026-03-28 08:16
- **Authors:**
  - River Bailey (mxriverlynn, river.bailey@testdouble.com)
- **Reviewers:**
- **Applies To:**
  - All workspace packages (`packages/cli`, `packages/data`, `packages/web`, `packages/test-fixtures`)

## Introduction

This coding standard defines how ESM imports and exports are written across the test harness monorepo. It covers relative import extensions, Node.js built-in prefixes, workspace package references, type-only imports, and type re-exports.

### Purpose

The harness runs on Bun with ESNext module resolution. Bun's ESM loader requires `.js` extensions on relative imports even though source files are `.ts`. Without consistent conventions, imports fail at runtime or produce confusing errors. Separating type-only imports ensures clean compile-time erasure and avoids pulling runtime dependencies into type-only consumers.

### Scope

All TypeScript source and test files under `packages/*/src/` in the test harness monorepo.

## Background

Bun's module resolution follows the Node.js ESM spec, which requires fully-specified relative paths including file extensions. TypeScript's `moduleResolution: "bundler"` or `"nodenext"` settings accept `.js` extensions in `.ts` source files and resolve them to the corresponding `.ts` files during type checking. This means every relative import must use `.js` even though no `.js` files exist on disk.

The Node.js `node:` protocol prefix was introduced in Node 14.18 and is supported by Bun. It disambiguates built-in modules from npm packages with the same name (e.g., a hypothetical `fs` package on npm) and makes the import's origin immediately clear to readers.

The monorepo uses Bun workspaces with scoped package names (`@testdouble/harness-data`, `@testdouble/harness-cli`, etc.). Cross-package imports use these package names rather than relative paths so that Bun's workspace resolution handles version alignment and so imports remain stable when internal directory structures change.

## Coding Standard

### Use .js Extensions in Relative Imports

All relative imports must include the `.js` file extension, even though source files are `.ts`. This is required for Bun ESM compatibility. The TypeScript compiler resolves `.js` extensions to the corresponding `.ts` files during type checking.

**Correct usage:**

```typescript
// Relative import within the same directory
import { handler } from './command.js'

// Relative import from a parent directory
import { resolvePaths } from '../test-runners/steps/step-1-resolve-paths.js'

// Relative import of local types
import type { TestSuiteConfig } from './types.js'

// Relative import of test helpers
import { makeTmpDir, writeJsonl } from './analytics-test-helpers.js'
```

**What to avoid:**

```typescript
// Missing extension — fails at runtime under Bun ESM
import { handler } from './command'

// Using .ts extension — not valid in ESM resolution
import { handler } from './command.ts'

// Using directory index shorthand — not valid in ESM resolution
import { handler } from './commands/'
```

**Project references:**
- `packages/cli/src/commands/test-run.test.ts` — relative imports with `.js` extensions throughout
- `packages/data/src/config.test.ts` — `import { buildTestCaseId } from './config.js'`
- `packages/data/src/analytics.integration.test.ts` — `import { importJsonlToParquet } from './analytics.js'`

### Use node: Prefix for Node.js Built-ins

Always use the `node:` protocol prefix when importing Node.js built-in modules. This disambiguates built-ins from npm packages and makes the import's origin explicit.

**Correct usage:**

```typescript
import { rm, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
```

**What to avoid:**

```typescript
// Missing node: prefix — ambiguous, could be an npm package
import { rm, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
```

**Project references:**
- `packages/data/src/analytics.integration.test.ts` — `import { rm, mkdir, writeFile } from 'node:fs/promises'`, `import { existsSync } from 'node:fs'`, `import path from 'node:path'`
- `packages/data/src/config.test.ts` — `vi.mock('node:fs', ...)` and `import { existsSync } from 'node:fs'`

### Use Workspace Package Names for Cross-Package Imports

Cross-package imports use the workspace package name (e.g., `@testdouble/harness-data`), not relative paths that reach into sibling package directories. Bun workspace resolution ensures the correct version is used, and imports remain stable if internal directory structures change.

**Correct usage:**

```typescript
// Import types from a workspace package
import type { ParsedRunMetrics, RunTotals } from '@testdouble/harness-data'

// Import functions from a workspace package
import { buildClaudePluginFlags } from '@testdouble/harness-data'

// Import from test fixtures package
import { loadFixtures } from '@testdouble/test-fixtures'
```

**What to avoid:**

```typescript
// Reaching into sibling package with a relative path — fragile, bypasses workspace resolution
import type { RunTotals } from '../../data/src/types'

// Using a bare path that doesn't match the package name
import { buildClaudePluginFlags } from 'harness-data'
```

**Project references:**
- `packages/cli/src/lib/metrics.ts` — `import type { ParsedRunMetrics, RunTotals } from '@testdouble/harness-data'`
- `packages/data/src/analytics.integration.test.ts` — `import { loadFixtures } from '@testdouble/test-fixtures'`

### Use import type for Type-Only Imports

When importing only types (interfaces, type aliases, or types used solely in type position), use `import type` to ensure they are erased at compile time. This prevents runtime side effects and keeps the compiled output clean.

**Correct usage:**

```typescript
// All imports are types — use import type
import type { ParsedRunMetrics, RunTotals } from '@testdouble/harness-data'
import type { TestSuiteConfig } from './types.js'
```

**What to avoid:**

```typescript
// Using a regular import for type-only usage — needlessly retains the import at runtime
import { TestSuiteConfig } from './types.js'

// Mixing types and values in one import when types could be separated
// (acceptable when unavoidable, but prefer separate import type when all are types)
import { RunTotals, accumulateTotals } from '@testdouble/harness-data'
// ↑ If RunTotals is only used as a type, split it out:
import type { RunTotals } from '@testdouble/harness-data'
import { accumulateTotals } from '@testdouble/harness-data'
```

**Project references:**
- `packages/cli/src/lib/metrics.ts` — `import type { ParsedRunMetrics, RunTotals } from '@testdouble/harness-data'`
- `packages/data/src/config.test.ts` — `import type { TestSuiteConfig } from './types.js'`

### Use export type for Type Re-Exports

When a module re-exports types from its dependencies, use `export type` to make it clear the re-export is erased at compile time. This is the counterpart to `import type` on the consumer side.

**Correct usage:**

```typescript
import type { ParsedRunMetrics, RunTotals } from '@testdouble/harness-data'

// Re-export the type so consumers of this module can access it
export type { RunTotals }

export function accumulateTotals(totals: RunTotals, metrics: ParsedRunMetrics): RunTotals {
  // ...
}
```

**What to avoid:**

```typescript
import type { ParsedRunMetrics, RunTotals } from '@testdouble/harness-data'

// Regular export of a type-only import — may cause runtime errors or confuse bundlers
export { RunTotals }
```

**Project references:**
- `packages/cli/src/lib/metrics.ts` — `export type { RunTotals }` re-exports the type from `@testdouble/harness-data`

## Additional Resources

### Project Documentation

- [Test File Organization and Naming](./test-file-organization.md) — co-located test file placement and naming conventions
- [Project Discovery](../project-discovery.md) — workspace package layout and Bun runtime details

### External Resources

- [Bun Module Resolution](https://bun.sh/docs/runtime/modules) — Bun's ESM module resolution behavior
- [TypeScript ESM Support](https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-nodenext) — TypeScript's `nodenext` module resolution and `.js` extensions
- [Node.js node: Imports](https://nodejs.org/api/esm.html#node-imports) — the `node:` protocol prefix for built-in modules
