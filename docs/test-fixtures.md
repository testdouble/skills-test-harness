# Test Fixtures

Shared fixture data and loading utilities for integration and unit tests across all workspace packages in the test harness.

- **Last Updated:** 2026-03-28 15:06
- **Authors:**
  - River Bailey (river.bailey@testdouble.com)

## Overview

- Provides a centralized repository of test fixture data consumed by `@testdouble/cli`, `@testdouble/harness-data`, and `@testdouble/evals` packages
- Exposes two access patterns: `loadFixtures()` for copying fixture directories into temp dirs (integration tests), and direct JSON imports for typed constants (unit tests)
- Contains 17 named analytics scenarios with JSONL fixture files for DuckDB integration tests and 2 JSON fixtures for CLI unit tests
- Depends only on `@testdouble/bun-helpers` for cross-runtime directory resolution via `currentDir()`

Key files:
- `packages/test-fixtures/load-fixtures.ts` - Entry point; exports `loadFixtures()` copy utility
- `packages/test-fixtures/package.json` - Dual-export configuration (`.` and `./*`)
- `packages/test-fixtures/data/analytics/` - JSONL fixture scenarios for analytics integration tests
- `packages/test-fixtures/cli/test-runners/steps/` - JSON fixtures for CLI step unit tests

## Architecture

```
                    @testdouble/test-fixtures
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    │  load-fixtures.ts                        │
                    │  ┌────────────────────────────────┐      │
                    │  │ loadFixtures(name, tmpDir)     │      │
                    │  │   cp(fixtures/name → tmpDir)   │      │
                    │  └──────────┬─────────────────────┘      │
                    │             │                             │
                    │  ┌──────────▼──────────────────────────┐ │
                    │  │  Fixture Data                       │ │
                    │  │                                     │ │
                    │  │  data/analytics/                    │ │
                    │  │    17 scenarios × JSONL files       │ │
                    │  │    (test-run, test-config,          │ │
                    │  │     test-results, scil-iteration,   │ │
                    │  │     scil-summary)                   │ │
                    │  │                                     │ │
                    │  │  cli/test-runners/steps/            │ │
                    │  │    mock-test-suite-config.json      │ │
                    │  │    mock-parsed-metrics.json         │ │
                    │  └────────────────────────────────────┘ │
                    └──────────────────────────────────────────┘
                        │                           │
          ┌─────────────▼──────────┐   ┌────────────▼──────────────┐
          │  Integration Tests     │   │  Unit Tests               │
          │  (loadFixtures → cp)   │   │  (direct JSON import)     │
          │                        │   │                            │
          │  @testdouble/          │   │  @testdouble/cli          │
          │    harness-data        │   │    fixtures.ts             │
          └────────────────────────┘   └────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/test-fixtures/load-fixtures.ts` | Exports `loadFixtures()` to recursively copy a named fixture directory into a temp dir |
| `packages/test-fixtures/package.json` | Dual-export config: `"."` for `loadFixtures`, `"./*"` for direct file imports |
| `packages/test-fixtures/data/analytics/` | 17 named scenario directories, each containing JSONL files for DuckDB analytics queries |
| `packages/test-fixtures/cli/test-runners/steps/mock-test-suite-config.json` | Mock `TestSuiteConfig` JSON for CLI step unit tests |
| `packages/test-fixtures/cli/test-runners/steps/mock-parsed-metrics.json` | Mock `ParsedRunMetrics` JSON for CLI step unit tests |

## Core Types

```typescript
// load-fixtures.ts — the single exported function
export async function loadFixtures(
  fixtureName: string,  // relative path within fixtures dir (e.g., 'data/analytics/returns-one-row')
  tmpOutputDir: string  // destination temp directory for the test
): Promise<void>
```

The function resolves the fixture source using `currentDir(import.meta)` from `@testdouble/bun-helpers`, which provides cross-runtime `__dirname` equivalence across Bun and Node/Vitest environments.

## Implementation Details

### Dual Export Strategy

The package.json configures two export paths to serve different consumer patterns:

```json
{
  "exports": {
    ".": "./load-fixtures.ts",
    "./*": "./*"
  }
}
```

| Export | Pattern | Consumer | Example |
|--------|---------|----------|---------|
| `"."` | Named import of `loadFixtures` | Integration tests that need a full fixture directory tree copied to a temp dir | `import { loadFixtures } from '@testdouble/test-fixtures'` |
| `"./*"` | Direct file path import | Unit tests that need a single JSON fixture as a typed constant | `import config from '@testdouble/test-fixtures/cli/test-runners/steps/mock-test-suite-config.json'` |

### Integration Test Pattern (loadFixtures)

Integration tests in `packages/data/` use `loadFixtures()` to populate a temporary directory with JSONL files before running DuckDB analytics queries. The typical pattern:

```typescript
const dataDir = path.join(tmpDir, 'analytics')
await mkdir(dataDir, { recursive: true })

await loadFixtures('data/analytics/returns-one-row', outputDir)
await updateAllParquet({ outputDir, dataDir })

const rows = await queryPerTest(dataDir)
```

The function performs a recursive `cp()` from the fixture source into the provided `tmpOutputDir`, preserving the directory structure including the timestamped run ID subdirectory.

### Unit Test Pattern (Direct JSON Import)

CLI unit tests in `packages/cli/` import JSON fixtures directly and cast them to their domain types:

```typescript
import mockTestSuiteConfigJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-test-suite-config.json'
import mockParsedMetricsJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-parsed-metrics.json'

export const mockTestSuiteConfig: TestSuiteConfig = mockTestSuiteConfigJson as TestSuiteConfig
export const mockParsedMetrics: ParsedRunMetrics = mockParsedMetricsJson as ParsedRunMetrics
```

### Analytics Fixture Structure

Each analytics scenario lives in a named directory under `data/analytics/` and contains a timestamped run directory (e.g., `20260101T000001/`). The JSONL files mirror the output format of the test harness:

| File | Content | Purpose |
|------|---------|---------|
| `test-run.jsonl` | One record per test case with result, cost, tokens, turns | Core test execution results |
| `test-config.jsonl` | Suite name, plugins, test definition with expectations | Test configuration snapshot |
| `test-results.jsonl` | Per-expectation pass/fail with type, value, and result | Expectation-level results |
| `scil-iteration.jsonl` | Per-iteration train/test accuracy and results | SCIL improvement loop iteration data |
| `scil-summary.json` | Best iteration, accuracy progression | SCIL run summary (not all scenarios include this) |

The 17 named scenarios cover specific analytics query behaviors:

| Scenario | Tests |
|----------|-------|
| `returns-one-row` | Basic single-result query |
| `reflects-failed-expectations` | Failed expectation propagation |
| `returns-multiple-runs-ordered` | Multi-run ordering |
| `rounds-total-cost` | Cost rounding behavior |
| `returns-summary` | Test run detail summary |
| `throws-nonexistent` | Error on missing run ID |
| `only-requested-run` | Filtering to specific run |
| `rounds-cost-4dp` | 4-decimal cost precision |
| `special-chars` | Special character handling |
| `returns-rows-with-accuracy` | SCIL accuracy in query rows |
| `returns-scil-summary` | SCIL run detail retrieval |
| `throws-unknown-scil` | Error on missing SCIL run |
| `ascending-order` | Sort order verification |
| `casts-number` | Numeric type casting |
| `runindex-number` | Run index numeric handling |
| `groups-by-skill` | Skill-level grouping |
| `multiple-runs-ordered` | Multiple SCIL runs ordering |

## Adding a New Fixture

### Adding an Analytics Scenario

1. **Create the scenario directory** — `packages/test-fixtures/data/analytics/{scenario-name}/{timestamp}/` where `{timestamp}` follows the `YYYYMMDDTHHmmSS` format (e.g., `20260101T000017`)
2. **Add JSONL files** — Include at minimum `test-run.jsonl`, `test-config.jsonl`, and `test-results.jsonl`. Add `scil-iteration.jsonl` and `scil-summary.json` only if the scenario tests SCIL-related queries
3. **Write the integration test** — In `packages/data/src/analytics.integration.test.ts`, call `loadFixtures('data/analytics/{scenario-name}', outputDir)` followed by `updateAllParquet()` and the query under test

### Adding a CLI JSON Fixture

1. **Create the JSON file** — Place it under `packages/test-fixtures/cli/` in a path matching the CLI source structure
2. **Import directly** — Use the `"./*"` export path: `import data from '@testdouble/test-fixtures/cli/path/to/fixture.json'`
3. **Cast to domain type** — Assign the import to a typed constant in a co-located `fixtures.ts` file

## Related Documentation

- [Test Harness Architecture](./test-harness-architecture.md) - System architecture including test-fixtures package boundaries and data flow
- [Project Discovery](./project-discovery.md) - Full project discovery details for the test harness workspace
- [Test Data Factory Functions](./coding-standards/test-data-factories.md) - Coding standard for when to use test-fixtures vs inline factories
- [ESM Import Conventions](./coding-standards/esm-import-conventions.md) - Import patterns for workspace packages including test-fixtures
- [Cross-Runtime Meta Resolution](./coding-standards/cross-runtime-meta-resolution.md) - How `currentDir()` resolves paths across Bun and Vitest
- [Integration Test Lifecycle](./coding-standards/integration-test-lifecycle.md) - Temp directory lifecycle pattern used with `loadFixtures()`
