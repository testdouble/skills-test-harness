# Project Discovery

- **Last Updated:** 2026-04-16

## Repository

- Default branch: origin/main
- Docs: `docs/`
- ADRs: `docs/adrs/`
- README: `README.md`

## testdouble-harness (Workspace Root)

- Root: repository root
- Language: TypeScript (ESNext target, strict mode)
- Package manager: Bun
- Dependency manifest: `package.json`
- Lock file: `bun.lock`

### Frameworks and Tooling

- Test: Vitest ^4.1.0
- DB: DuckDB (`@duckdb/node-api`)
- Build: Bun compile + Vite 8
- Task runner: `Makefile`

### Commands and Tests

- Install: `bun install`
- Test (unit): `bun run vitest run`
- Test (integration): `bun run vitest run --config vitest.integration.config.ts`
- Test (all): `make test`
- Build: `make build`
- Dev server: `make dev`
- Test file pattern: `*.test.ts`, `*.integration.test.ts`, `*.unit.test.ts`

### Workspace Packages

#### @testdouble/harness-cli

- Root: `packages/cli/`
- Dependency manifest: `packages/cli/package.json`
- CLI framework: Yargs
- Compiled binary: `harness`
- Depends on: `@testdouble/harness-execution`, `@testdouble/harness-data`, `@testdouble/docker-integration`, `@testdouble/claude-integration` (workspace)
- Test directory: co-located in `packages/cli/src/`

#### @testdouble/harness-execution

- Root: `packages/execution/`
- Dependency manifest: `packages/execution/package.json`
- Owns: test-run pipeline, test-eval pipeline, SCIL/ACIL improvement loops, error hierarchy, path config
- Depends on: `@testdouble/harness-data`, `@testdouble/harness-evals`, `@testdouble/claude-integration`, `@testdouble/docker-integration` (workspace)
- Test directory: co-located in `packages/execution/src/`

#### @testdouble/harness-data

- Root: `packages/data/`
- Dependency manifest: `packages/data/package.json`
- DB: DuckDB (`@duckdb/node-api`)
- Test directory: co-located in `packages/data/src/`

#### @testdouble/harness-evals

- Root: `packages/evals/`
- Dependency manifest: `packages/evals/package.json`
- Owns: boolean evals, LLM judge scoring, rubric parsing
- Depends on: `@testdouble/harness-data`, `@testdouble/claude-integration` (workspace)
- Test directory: co-located in `packages/evals/src/`

#### @testdouble/claude-integration

- Root: `packages/claude-integration/`
- Dependency manifest: `packages/claude-integration/package.json`
- Owns: Claude CLI execution, plugin directory resolution
- Depends on: `@testdouble/docker-integration`, `@testdouble/bun-helpers` (workspace)
- Test directory: co-located in `packages/claude-integration/src/`

#### @testdouble/docker-integration

- Root: `packages/docker-integration/`
- Dependency manifest: `packages/docker-integration/package.json`
- Owns: Docker sandbox lifecycle, command execution
- Depends on: `@testdouble/bun-helpers` (workspace)

#### @testdouble/harness-web

- Root: `packages/web/`
- Dependency manifest: `packages/web/package.json`
- Web server: Hono
- Frontend: React 18 + React Router 6
- CSS: Tailwind CSS v4
- Build: Vite 8 (`@vitejs/plugin-react`, `@tailwindcss/vite`)
- Compiled binary: `harness-web`
- Depends on: `@testdouble/harness-data` (workspace)
- Test directory: co-located in `packages/web/src/`

#### @testdouble/bun-helpers

- Root: `packages/bun-helpers/`
- Owns: cross-runtime path resolution (`currentDir`, `resolveRelativePath`)
- No workspace dependencies

#### @testdouble/test-fixtures

- Root: `packages/test-fixtures/`
- No runtime dependencies
- Exports fixture data via `load-fixtures.ts` and wildcard sub-path exports

### Infrastructure

- Native library: `libduckdb.dylib` (platform-specific, copied during build)
- Analytics store: `analytics/` (Parquet files)
- Test output: `output/` (timestamped JSONL run data)
- Docker sandbox: `packages/docker-integration/` (see [docs/docker-integration.md](docker-integration.md))
- Test suites: `test-suites/` (11 test suites)

### Documentation

- `docs/test-harness-architecture.md` — System architecture, package boundaries, data flow, and dependency graph
- `docs/docker-integration.md` — Docker sandbox API, lifecycle, and consumer patterns
- `docs/llm-judge.md` — LLM-as-judge evaluation approach
- `docs/parquet-schema.md` — DuckDB/Parquet table schemas
- `docs/rubric-evals-guide.md` — rubric-based evaluation guide
- `docs/scil-evals-guide.md` — SCIL evaluation guide
- `docs/skill-call-improvement-loop.md` — iterative skill improvement feedback loop
- `docs/test-scaffolding.md` — scaffold directory setup for sandbox tests
- `docs/test-suite-reference.md` — tests.json field reference
- `docs/write-skill-eval-rubric.md` — authoring skill rubric files
- `docs/write-agent-eval-rubric.md` — authoring agent rubric files
- `docs/script-extraction.md` — extracting mechanical steps from skills into shell scripts
- `docs/write-scil-evals.md` — authoring SCIL eval configs
- `docs/write-acil-evals.md` — authoring ACIL eval configs
- `docs/agent-call-improvement-loop.md` — iterative agent description improvement feedback loop
- `docs/execution.md` — execution package: test-run pipeline, test-eval, SCIL/ACIL loops, error hierarchy
- `docs/cli.md` — CLI package: thin Yargs wrapper, command definitions, path resolution
- `docs/data.md` — data package: types, config parsing, JSONL I/O, DuckDB analytics
- `docs/evals.md` — evals package: boolean evals, LLM judge scoring, orchestrator
- `docs/claude-integration.md` — Claude CLI wrapper API, argument construction, sandbox delegation
- `docs/docker-integration-package.md` — Docker integration package: full API, error handling, testing
- `docs/web.md` — web dashboard: Hono API, React SPA, analytics views
- `docs/bun-helpers.md` — cross-runtime path resolution utilities
- `docs/test-fixtures.md` — shared test fixture data, loadFixtures utility
- `docs/adrs/` — architecture decision records
- `docs/planning/` — planning and design documents
