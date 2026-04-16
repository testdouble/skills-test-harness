# No Lint Disabling

- **Status:** proposed
- **Date Created:** 2026-04-16
- **Last Updated:** 2026-04-16
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - All TypeScript and JavaScript source files in the workspace
  - `biome.json` (linter configuration)

## Introduction

This coding standard prohibits the use of lint-disabling comments and per-file/per-rule disable configuration. Lint rules exist to catch real defects, enforce consistency, and flag patterns the team has agreed are risky. Disabling them silently removes that protection and creates a slow drift away from the standards the project has chosen to enforce.

### Purpose

A lint-disable comment is a claim that this one case is special — but the cost is permanent: the rule can never again catch regressions on that line, and other engineers see the disable and assume the pattern is sanctioned. If a rule is wrong often enough to need disabling, fix the root cause (change the code, change the types, or change the rule globally) rather than papering over it.

### Scope

All source files under `packages/**`, and the root `biome.json` linter configuration. This applies equally to production code and test code.

## Coding Standard

### Do Not Add Disable Comments

Never add any form of lint-disabling comment, including but not limited to:

- `// biome-ignore <rule>: <reason>`
- `// biome-ignore-start` / `// biome-ignore-end`
- `// eslint-disable-next-line <rule>`
- `// eslint-disable <rule>` / `// eslint-enable <rule>`
- `/* eslint-disable */` / `/* eslint-enable */`
- `// tslint:disable` / `// tslint:disable-next-line`
- File-level `/* eslint-disable */` headers

### Do Not Add Per-File or Per-Path Overrides

Do not add `overrides` or `includes`/`excludes` blocks to `biome.json` that disable rules for specific files or directories. The only acceptable rule-level configuration is a global `"off" | "warn" | "error"` setting that applies to the whole workspace.

### When a Lint Rule Flags Your Code

When a rule flags real code, the fix order is:

1. **Fix the code.** Most lint warnings point at a real issue — a type that should be narrower, an unsafe cast, an unused variable, a pattern the team has agreed to avoid. Change the code to satisfy the rule.
2. **Narrow the type or import the correct one.** `noExplicitAny` usually means a third-party type needs to be imported or a generic needs to be added. Look at the library's `.d.ts` exports before reaching for `any`.
3. **Change the rule globally.** If the rule consistently flags code that the team agrees is correct, change the rule level in `biome.json` for the whole workspace — not for one file. Rule-level changes are a team decision and should be discussed in code review.
4. **Never disable inline.** If none of the above work, the code is wrong or the rule is wrong. Pick one and fix it.

**Project references:**
- `packages/data/src/connection.ts` — `withConnection` uses `DuckDBConnection` instead of `any` for the callback parameter
- `packages/data/src/analytics.ts` — `infraErrorCondition` uses `DuckDBConnection` instead of `any`

### Example: Replacing `any` With the Correct Type

**What to avoid:**

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withConnection<T>(dataDir: string, fn: (conn: any) => Promise<T>): Promise<T> {
  const instance = await getInstance(dataDir)
  const conn = await instance.connect()
  return await fn(conn)
}
```

**Correct usage:**

```typescript
import { type DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'

export async function withConnection<T>(dataDir: string, fn: (conn: DuckDBConnection) => Promise<T>): Promise<T> {
  const instance = await getInstance(dataDir)
  const conn = await instance.connect()
  return await fn(conn)
}
```

The library exports the correct type; importing it removes the need for `any` entirely.

## Additional Resources

### Project Documentation

- [ESM Import Conventions](./esm-import-conventions.md) — covers `import type` for type-only imports used when replacing `any` with library types
