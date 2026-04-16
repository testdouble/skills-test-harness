# Project Discovery

- **Last Updated:** 2026-04-02

## Repository

- Default branch: origin/main
- Docs: `tests/docs/`
- ADRs: `tests/docs/adrs/`
- README: `tests/README.md`

## testdouble-harness (Workspace Root)

- Root: `tests/`
- Language: TypeScript (ESNext target, strict mode)
- Package manager: Bun
- Dependency manifest: `tests/package.json`
- Lock file: `tests/bun.lock`

### Frameworks and Tooling

- Test: Vitest ^4.1.0
- DB: DuckDB (`@duckdb/node-api`)
- Build: Bun compile + Vite 8
- Task runner: `tests/Makefile`

### Commands and Tests

- Install: `bun install`
- Test (unit): `bunx vitest run`
- Test (integration): `bunx vitest run --config vitest.integration.config.ts`
- Test (all): `make test`
- Build: `make build`
- Dev server: `make dev`
- Test file pattern: `*.test.ts`, `*.integration.test.ts`, `*.unit.test.ts`

### Workspace Packages

#### @testdouble/harness-cli

- Root: `tests/packages/cli/`
- Dependency manifest: `tests/packages/cli/package.json`
- CLI framework: Yargs
- Compiled binary: `tests/harness`
- Depends on: `@testdouble/harness-execution`, `@testdouble/harness-data`, `@testdouble/docker-integration`, `@testdouble/claude-integration` (workspace)
- Test directory: co-located in `packages/cli/src/`

#### @testdouble/harness-execution

- Root: `tests/packages/execution/`
- Dependency manifest: `tests/packages/execution/package.json`
- Owns: test-run pipeline, test-eval pipeline, SCIL/ACIL improvement loops, error hierarchy, path config
- Depends on: `@testdouble/harness-data`, `@testdouble/harness-evals`, `@testdouble/claude-integration`, `@testdouble/docker-integration` (workspace)
- Test directory: co-located in `packages/execution/src/`

#### @testdouble/harness-data

- Root: `tests/packages/data/`
- Dependency manifest: `tests/packages/data/package.json`
- DB: DuckDB (`@duckdb/node-api`)
- Test directory: co-located in `packages/data/src/`

#### @testdouble/harness-evals

- Root: `tests/packages/evals/`
- Dependency manifest: `tests/packages/evals/package.json`
- Owns: boolean evals, LLM judge scoring, rubric parsing
- Depends on: `@testdouble/harness-data`, `@testdouble/claude-integration` (workspace)
- Test directory: co-located in `packages/evals/src/`

#### @testdouble/claude-integration

- Root: `tests/packages/claude-integration/`
- Dependency manifest: `tests/packages/claude-integration/package.json`
- Owns: Claude CLI execution, plugin directory resolution
- Depends on: `@testdouble/docker-integration`, `@testdouble/bun-helpers` (workspace)
- Test directory: co-located in `packages/claude-integration/src/`

#### @testdouble/docker-integration

- Root: `tests/packages/docker-integration/`
- Dependency manifest: `tests/packages/docker-integration/package.json`
- Owns: Docker sandbox lifecycle, command execution
- Depends on: `@testdouble/bun-helpers` (workspace)

#### @testdouble/harness-web

- Root: `tests/packages/web/`
- Dependency manifest: `tests/packages/web/package.json`
- Web server: Hono
- Frontend: React 18 + React Router 6
- CSS: Tailwind CSS v4
- Build: Vite 8 (`@vitejs/plugin-react`, `@tailwindcss/vite`)
- Compiled binary: `tests/harness-web`
- Depends on: `@testdouble/harness-data` (workspace)
- Test directory: co-located in `packages/web/src/`

#### @testdouble/bun-helpers

- Root: `tests/packages/bun-helpers/`
- Owns: cross-runtime path resolution (`currentDir`, `resolveRelativePath`)
- No workspace dependencies

#### @testdouble/test-fixtures

- Root: `tests/packages/test-fixtures/`
- No runtime dependencies
- Exports fixture data via `load-fixtures.ts` and wildcard sub-path exports

### Infrastructure

- Native library: `tests/libduckdb.dylib` (platform-specific, copied during build)
- Analytics store: `tests/analytics/` (Parquet files)
- Test output: `tests/output/` (timestamped JSONL run data)
- Docker sandbox: `tests/packages/docker-integration/` (see [docs/docker-integration.md](docker-integration.md))
- Test suites: `tests/test-suites/` (11 test suites)

### Documentation

- `tests/docs/test-harness-architecture.md` — System architecture, package boundaries, data flow, and dependency graph
- `tests/docs/docker-integration.md` — Docker sandbox API, lifecycle, and consumer patterns
- `tests/docs/llm-judge.md` — LLM-as-judge evaluation approach
- `tests/docs/parquet-schema.md` — DuckDB/Parquet table schemas
- `tests/docs/rubric-evals-guide.md` — rubric-based evaluation guide
- `tests/docs/scil-evals-guide.md` — SCIL evaluation guide
- `tests/docs/skill-call-improvement-loop.md` — iterative skill improvement feedback loop
- `tests/docs/test-plan.md` — overall test strategy
- `tests/docs/test-plan-analytics-integration.md` — analytics integration test plan
- `tests/docs/test-scaffolding.md` — scaffold directory setup for sandbox tests
- `tests/docs/test-suite-configuration.md` — tests.json field reference
- `tests/docs/write-skill-eval-rubric.md` — authoring skill rubric files
- `tests/docs/write-agent-eval-rubric.md` — authoring agent rubric files
- `tests/docs/script-extraction.md` — extracting mechanical steps from skills into shell scripts
- `tests/docs/write-scil-evals.md` — authoring SCIL eval configs
- `tests/docs/write-acil-evals.md` — authoring ACIL eval configs
- `tests/docs/agent-call-improvement-loop.md` — iterative agent description improvement feedback loop
- `tests/docs/execution.md` — execution package: test-run pipeline, test-eval, SCIL/ACIL loops, error hierarchy
- `tests/docs/cli.md` — CLI package: thin Yargs wrapper, command definitions, path resolution
- `tests/docs/data.md` — data package: types, config parsing, JSONL I/O, DuckDB analytics
- `tests/docs/evals.md` — evals package: boolean evals, LLM judge scoring, orchestrator
- `tests/docs/claude-integration.md` — Claude CLI wrapper API, argument construction, sandbox delegation
- `tests/docs/docker-integration-package.md` — Docker integration package: full API, error handling, testing
- `tests/docs/web.md` — web dashboard: Hono API, React SPA, analytics views
- `tests/docs/bun-helpers.md` — cross-runtime path resolution utilities
- `tests/docs/test-fixtures.md` — shared test fixture data, loadFixtures utility
- `tests/docs/adrs/` — architecture decision records
- `tests/docs/planning/` — planning and design documents
