# CLI Package

> **Tier 5 · Contributor reference.** Internal documentation for the `@testdouble/harness-cli` package — the CLI layer only: Yargs command registration, argument and flag parsing, and path resolution from `process.cwd()`. If you're a user looking for what commands and flags to run, see [Getting Started: Skill Trigger Accuracy](getting-started/skill-trigger-accuracy.md). For pipeline internals (test-run/test-eval steps, SCIL/ACIL loops, error hierarchy, path config), see [Execution Package](./execution.md).

This page documents the CLI boundary: the eight commands the `harness` binary exposes, how each command builder parses its arguments and flags, how paths are resolved once via `createPathConfig(process.cwd())`, and how `HarnessError` is caught for clean exit. The CLI owns no pipeline logic — every command is a thin wrapper that delegates to `@testdouble/harness-execution` (test-run, test-eval, SCIL, ACIL) or `@testdouble/docker-integration` (sandbox lifecycle). Pipeline implementation, the numbered step files, and all core types live in [Execution Package](./execution.md).

The `@testdouble/harness-cli` package is the command-line entry point for the test harness. It is a thin Yargs wrapper that parses arguments, resolves paths from `process.cwd()`, and delegates all pipeline orchestration to `@testdouble/harness-execution`.

- **Last Updated:** 2026-05-15
- **Authors:**
  - River Bailey (river.bailey@testdouble.com)

## Summary

- Eight CLI commands exposed via the `harness` binary: `test-run`, `test-eval`, `scil`, `acil`, `update-analytics-data`, `shell`, `clean`, and `sandbox-setup`
- All test execution happens inside a Docker sandbox via `@testdouble/docker-integration`, with Claude invoked through `@testdouble/claude-integration`
- Two test runner types handle different test kinds: prompt tests (full Claude sessions) and skill-call tests (trigger detection with temporary stripped-down plugins)
- The SCIL (Skill Call Improvement Loop) command iteratively improves skill descriptions by running evaluation cycles and using Claude to generate better descriptions
- The ACIL (Agent Call Improvement Loop) command iteratively improves agent descriptions by running evaluation cycles and using Claude to generate better descriptions

Key files:
- `packages/cli/index.ts` — CLI entry point, Yargs command registration
- `packages/cli/src/commands/test-run.ts` — Test execution orchestrator
- `packages/cli/src/commands/test-eval.ts` — Evaluation pipeline
- `packages/cli/src/commands/scil.ts` — SCIL command entry point
- `packages/cli/src/commands/acil.ts` — ACIL command entry point

## Architecture

```
                       harness <command> [options]
                                |
                                v
                    ┌───────────────────────┐
                    │      index.ts         │
                    │   Yargs dispatcher    │
                    └───────────┬───────────┘
                                │
        ┌───────────┬───────────┼───────────┬───────────┬───────────┬───────────┬───────────┐
        v           v           v           v           v           v           v           v
   test-run    test-eval      scil        acil     update-     shell       clean      sandbox-
                                                  analytics                            setup
        │           │           │           │           │           │           │           │
        │           │           │           │           │           │           │           │
        v           v           v           v           v           v           v           v
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │     ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ prompt   │ │ harness- │ │ scil     │ │ acil     │ │     │ docker-  │ │ docker-  │ │ docker-  │
  │ runner   │ │ evals    │ │ steps    │ │ steps    │ │     │ integr.  │ │ integr.  │ │ integr.  │
  │ skill-   │ │          │ │ 1-10     │ │ 1-10     │ │     │ openShell│ │ remove   │ │ create   │
  │ call     │ │ evaluate │ │ loop.ts  │ │ loop.ts  │ │     └──────────┘ │ Sandbox  │ │ Sandbox  │
  │ runner   │ │ TestRun  │ │          │ │          │ │                   └──────────┘ └──────────┘
  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
       │            │            │            │          │
       v            v            v            v          v
  ┌───────────────────────────────────────────────────────────┐
  │                  @testdouble/harness-data                  │
  │     types, config, JSONL I/O, analytics, SCIL, ACIL       │
  └───────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/cli/index.ts` | CLI entry point — registers all Yargs commands, handles `HarnessError` |
| `packages/cli/src/paths.ts` | Singleton path resolution — exports `testsDir`, `repoRoot`, `outputDir`, `dataDir` |
| `packages/cli/src/commands/test-run.ts` | `test-run` command — delegates to `@testdouble/harness-execution` test-run pipeline |
| `packages/cli/src/commands/test-eval.ts` | `test-eval` command — delegates to `@testdouble/harness-execution` eval pipeline |
| `packages/cli/src/commands/scil.ts` | `scil` command — entry point for the Skill Call Improvement Loop |
| `packages/cli/src/commands/acil.ts` | `acil` command — entry point for the Agent Call Improvement Loop |
| `packages/cli/src/commands/update-analytics.ts` | `update-analytics-data` command — imports JSONL to Parquet |
| `packages/cli/src/commands/shell.ts` | `shell` command — opens interactive shell in Docker sandbox |
| `packages/cli/src/commands/clean.ts` | `clean` command — removes the Docker sandbox |
| `packages/cli/src/commands/sandbox-setup.ts` | `sandbox-setup` command — creates sandbox and authenticates via OAuth |

## Core Types

All core types (`PathConfig`, `ScilConfig`, `AcilConfig`, `SkillFileContent`, `HarnessError`, `ConfigNotFoundError`, `RunNotFoundError`) are defined in `@testdouble/harness-execution`. See [execution.md](./execution.md) for type definitions.

## Implementation Details

### Command Delegation

Each command module in `packages/cli/src/commands/` is a thin Yargs wrapper that parses arguments, validates options, and delegates to `@testdouble/harness-execution`:

- **test-run** — Calls the execution package's test-run pipeline (10-step orchestration, test runner dispatch, prompt and skill-call runners)
- **test-eval** — Calls the execution package's eval pipeline (run discovery, evaluation, result writing, re-eval marking)
- **scil** — Calls `runScilLoop()` from the execution package for iterative skill description improvement
- **acil** — Calls `runAcilLoop()` from the execution package for iterative agent description improvement
- **update-analytics-data** — Calls the execution package's analytics ingestion
- **shell** / **clean** / **sandbox-setup** — Delegate to `@testdouble/docker-integration` for sandbox lifecycle

See [execution.md](./execution.md) for implementation details of each pipeline (test-run steps, test-eval steps, SCIL loop, ACIL loop, concurrency pool, scoring, error hierarchy).

### Error Handling

The CLI catches `HarnessError` at the top level (`index.ts`) and writes the message to stderr with a clean exit code 1. All other errors propagate as unhandled exceptions. The error hierarchy (`HarnessError`, `ConfigNotFoundError`, `RunNotFoundError`) is defined in `@testdouble/harness-execution`.

## Configuration

| Option | Command | Description | Default |
|--------|---------|-------------|---------|
| `--suite` | `test-run` | Test suite name (omit to run all) | all suites |
| `--test` | `test-run` | Filter to single test by name | none |
| `--debug` | `test-run`, `test-eval`, `scil` | Show Docker/debug output | `false` |
| `--suite` | `scil`, `acil` | Test suite name (required) | none |
| `--skill` | `scil` | Target skill in `plugin:skill` format | inferred |
| `--agent` | `acil` | Target agent in `plugin:agent` format | inferred |
| `--max-iterations` | `scil`, `acil` | Maximum improvement iterations | `5` |
| `--holdout` | `scil`, `acil` | Fraction held out for validation | `0` |
| `--concurrency` | `scil`, `acil` | Parallel sandbox exec calls | `1` |
| `--runs-per-query` | `scil`, `acil` | Runs per test case for majority vote | `1` |
| `--model` | `scil`, `acil` | Model for improvement prompt | `opus` |
| `--apply` | `scil`, `acil` | Auto-apply best description | `false` |
| `--output-dir` | `update-analytics-data` | Path to test output directory | `tests/output/` |
| `--data-dir` | `update-analytics-data` | Path to analytics data directory | `tests/analytics/` |

## Testing

- `packages/cli/src/paths.test.ts` — Tests `createPathConfig` and `getAllTestSuites`
- `packages/cli/src/commands/test-run.test.ts` — Tests `test-run` command builder and handler
- `packages/cli/src/commands/test-eval.test.ts` — Tests `test-eval` command builder and handler
- `packages/cli/src/commands/scil.test.ts` — Tests `scil` command builder and handler
- `packages/cli/src/commands/acil.test.ts` — Tests `acil` command builder and handler
- `packages/cli/src/commands/update-analytics.test.ts` — Tests `update-analytics-data` command
- `packages/cli/src/commands/shell.test.ts` — Tests `shell` command
- `packages/cli/src/commands/clean.test.ts` — Tests `clean` command

### Test Patterns

Test files are co-located with their source files. Tests use Vitest with the standard `describe`/`it` pattern. Pipeline step tests, test runner tests, eval step tests, and SCIL/ACIL step tests live in `packages/execution/` — see [execution.md](./execution.md).

## Related Documentation

- [Execution Package](./execution.md) — Execution orchestration layer that the CLI delegates to (test-run, test-eval, SCIL pipelines, error hierarchy, path config)
- [Test Harness Architecture](./test-harness-architecture.md) — System-wide architecture, package boundaries, and data flow
- [Test Suite Reference](./test-suite-reference.md) — How `tests.json` files are structured
- [Docker Integration](./docker-integration.md) — Docker sandbox API and consumer patterns
- [Skill Call Improvement Loop](./skill-call-improvement-loop.md) — Detailed SCIL algorithm and design
- [Parquet Schema](./parquet-schema.md) — Schema for analytics data produced by `update-analytics-data`
- [Data Package](./data.md) — Shared data layer: types, config parsing, JSONL I/O, DuckDB analytics, SCIL utilities
- [Evals Package](./evals.md) — Evaluation engine consumed by `test-eval` and SCIL commands
- [Claude Integration](./claude-integration.md) — Claude CLI wrapper API used for running prompts in the sandbox
- [Web Dashboard](./web.md) — Web dashboard that displays results produced by CLI commands
- [Test Fixtures](./test-fixtures.md) — Shared test fixture data used by CLI unit tests
- [Project Discovery](./project-discovery.md) — Repository-wide project scan including CLI package details

---

**Next:** [Execution Package](./execution.md) — the pipeline orchestration every command delegates to, plus all core type definitions.
**Related:** [Test Harness Architecture](./test-harness-architecture.md) — where the CLI layer sits in the package dependency graph.
