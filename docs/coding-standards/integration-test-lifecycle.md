# Integration Test Lifecycle

- **Status:** proposed
- **Date Created:** 2026-03-28 08:17
- **Last Updated:** 2026-03-28 08:17
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - All workspace packages that contain integration tests (`packages/data`, `packages/cli`, `packages/web`)

## Introduction

This coding standard defines the lifecycle patterns for integration tests — how they set up temporary resources, clean them up, organize helpers, and interact with real infrastructure like the filesystem and DuckDB.

### Purpose

Integration tests touch real I/O (filesystem, DuckDB) and need careful resource management to avoid leaking temp directories, accumulating stale files, or interfering with parallel test runs. These conventions ensure every integration test starts with a clean environment and leaves no residue, while keeping test files readable through consistent structure.

### Scope

All TypeScript integration test files (`*.integration.test.ts`) and their associated helper modules across workspace packages, executed by the `vitest.integration.config.ts` configuration.

## Background

The harness runs integration tests separately from unit tests using a dedicated Vitest config with an extended 30-second timeout. Integration tests create real files on disk and query real DuckDB instances rather than using mocks, because the patterns under test (JSONL-to-Parquet conversion, analytics queries, file-system operations) depend heavily on I/O behavior that mocks cannot faithfully replicate.

A recurring problem in integration test suites is leaked resources — temp directories that accumulate across runs, database handles left open, or tests that pass individually but fail when run in parallel because they share state. The lifecycle patterns in this standard prevent these issues by enforcing per-test isolation through `beforeEach`/`afterEach` hooks and a shared helper module for resource creation.

## Coding Standard

### Module-Scope Variable with beforeEach/afterEach Lifecycle

Declare the `tmpDir` variable at module scope so both `beforeEach` (creation) and `afterEach` (cleanup) can access it. Create a fresh temp directory in `beforeEach` using the `makeTmpDir()` helper, and remove it in `afterEach` with `rm()` using `recursive` and `force` flags.

**Correct usage:**

```typescript
import { rm } from 'node:fs/promises'
import { makeTmpDir } from './analytics-test-helpers.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await makeTmpDir()
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})
```

**What to avoid:**

```typescript
// Don't create the temp directory inline in each test — cleanup becomes
// inconsistent and easy to forget
describe('importJsonlToParquet', () => {
  it('creates a parquet file', async () => {
    const tmpDir = await makeTmpDir()  // ← no afterEach cleanup, leaked on failure
    // ... test body ...
    await rm(tmpDir, { recursive: true, force: true })  // ← skipped if test throws
  })
})

// Don't use a shared directory across tests without per-test isolation
const tmpDir = '/tmp/harness-tests'  // ← parallel tests collide, no cleanup guarantee
```

**Project references:**
- `packages/data/src/analytics.integration.test.ts` — canonical lifecycle pattern with `makeTmpDir()` in `beforeEach` and `rm()` in `afterEach`

### Real Filesystem and DuckDB Instead of Mocks

Integration tests use real filesystem operations (`writeFile`, `mkdir`, `existsSync`) and real DuckDB instances (`DuckDBInstance.create(':memory:')`) rather than mocks. This validates actual I/O behavior including file creation, directory structure, SQL queries, and Parquet file generation.

**Correct usage:**

```typescript
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'

it('creates a new parquet file from JSONL', async () => {
  const runDir = path.join(tmpDir, '20260101T100001')
  await writeJsonl(path.join(runDir, 'test-config.jsonl'), [
    makeConfigRecord({ testRunId: '20260101T100001', suite: 's', testName: 'test one' }),
  ])

  const parquetPath = path.join(tmpDir, 'out.parquet')
  const result = await importJsonlToParquet({
    jsonlGlob: `${tmpDir}/*/test-config.jsonl`,
    parquetPath,
  })

  expect(result).toBe(true)
  expect(existsSync(parquetPath)).toBe(true)
})

// DuckDB for reading back results
async function readParquet<T>(parquetPath: string): Promise<T[]> {
  const instance = await DuckDBInstance.create(':memory:')
  const conn = await instance.connect()
  const rows = (await conn.runAndReadAll(
    `SELECT * FROM read_parquet('${parquetPath}')`
  )).getRowObjects()
  conn.closeSync()
  return rows as unknown as T[]
}
```

**What to avoid:**

```typescript
// Don't mock the filesystem in integration tests — that's what unit tests are for
vi.mock('node:fs/promises')
const writeFile = vi.fn()

// Don't mock DuckDB — integration tests exist to verify real query behavior
vi.mock('@duckdb/node-api')
```

**Project references:**
- `packages/data/src/analytics.integration.test.ts` — real filesystem writes and DuckDB reads throughout
- `packages/data/src/analytics-test-helpers.ts` — `writeJsonl()` and `writeRunFixture()` use real `mkdir` and `writeFile`

### Extracted Test Helper Modules

Integration test helpers (temp directory creation, fixture writers, record factories) are extracted to dedicated helper files named `*-test-helpers.ts`, co-located with the integration test file. This keeps test files focused on assertions and avoids duplicating setup logic across test cases.

**Correct usage:**

```typescript
// analytics-test-helpers.ts — dedicated helper module
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'harness-test-'))
}

export async function writeJsonl(filePath: string, records: unknown[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n'
  await writeFile(filePath, content, 'utf8')
}

export async function writeRunFixture(opts: { ... }): Promise<void> { ... }
```

```typescript
// analytics.integration.test.ts — imports helpers, stays focused on assertions
import {
  makeTmpDir,
  writeJsonl,
  writeRunFixture,
  makeConfigRecord,
} from './analytics-test-helpers.js'
```

**What to avoid:**

```typescript
// Don't inline complex setup logic in the test file
describe('importJsonlToParquet', () => {
  it('creates a parquet file', async () => {
    // ← 20 lines of fixture setup obscure what's being tested
    const runDir = path.join(tmpDir, '20260101T100001')
    await mkdir(runDir, { recursive: true })
    const config = {
      test_run_id: '20260101T100001',
      suite: 's',
      plugins: [],
      test: { name: 'test one', promptFile: 'prompt.md', model: 'sonnet', expect: [] },
    }
    await writeFile(path.join(runDir, 'test-config.jsonl'), JSON.stringify(config) + '\n')
    // ... more setup ...
  })
})
```

**Project references:**
- `packages/data/src/analytics-test-helpers.ts` — exports `makeTmpDir`, `writeJsonl`, `writeRunFixture`, `makeConfigRecord`, `makeRunResultRecord`, `makeResultRecord`, `makeScilIterationRecord`, `writeScilRunFixture`
- `packages/data/src/analytics.integration.test.ts` — imports and uses the helper module

### node: Prefix for Node.js Built-in Imports

Always use the `node:` protocol prefix when importing Node.js built-in modules. This distinguishes built-in modules from npm packages, prevents name collisions, and is the recommended practice for modern Node.js and Bun.

**Correct usage:**

```typescript
import { rm, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
```

**What to avoid:**

```typescript
// Don't omit the node: prefix — ambiguous and inconsistent with the codebase
import { rm, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
```

**Project references:**
- `packages/data/src/analytics.integration.test.ts` — all Node built-in imports use `node:` prefix
- `packages/data/src/analytics-test-helpers.ts` — all Node built-in imports use `node:` prefix

### Section Comments for Visual Organization

Integration test files use horizontal-rule section comments to visually separate major sections: helpers, test lifecycle, and each logical group of tests. The format is `// ─── {section name} ───` padded with box-drawing characters to 80 columns.

**Correct usage:**

```typescript
// ─── helpers ──────────────────────────────────────────────────────────────────

async function readParquet<T>(parquetPath: string): Promise<T[]> { ... }

// ─── test lifecycle ───────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(async () => {
  tmpDir = await makeTmpDir()
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ─── importJsonlToParquet ─────────────────────────────────────────────────────

describe('importJsonlToParquet', () => { ... })
```

**What to avoid:**

```typescript
// Don't use inconsistent separator styles
/* === HELPERS === */
// --- test lifecycle ---
/** *** importJsonlToParquet *** */

// Don't omit separators in large integration test files — they become
// difficult to navigate without visual landmarks
```

**Project references:**
- `packages/data/src/analytics.integration.test.ts` — uses `// ───` section separators for helpers, test lifecycle, and each describe group
- `packages/data/src/analytics-test-helpers.ts` — uses `// ───` section separators for directory helpers, fixture factories, and scenario builder

### Extended Timeout via Integration Config

Integration tests run under `vitest.integration.config.ts`, which sets `testTimeout: 30000` (30 seconds). This is configured at the Vitest level, not per-test. Tests that need filesystem or DuckDB access must use the `.integration.test.ts` suffix so they are routed to this config.

**Correct usage:**

```typescript
// vitest.integration.config.ts
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
// Don't set per-test timeouts — use the integration config instead
it('creates a parquet file', { timeout: 30000 }, async () => { ... })

// Don't put integration tests in .test.ts files — they'll run under the
// unit test config with the default (shorter) timeout
// File: analytics.test.ts  ← will timeout on DuckDB operations
```

**Project references:**
- `vitest.integration.config.ts` — integration test config with 30s timeout
- `vitest.config.ts` — unit test config that excludes `*.integration.test.ts`

## Additional Resources

### Project Documentation

- [Test File Organization and Naming](./test-file-organization.md) — file naming suffixes, co-location, describe/it patterns, and Vitest config separation
- [Project Discovery](../project-discovery.md) — workspace package layout and test commands
