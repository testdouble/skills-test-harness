# CLAUDE.md — Test Harness

## Project Discovery

- See [`docs/project-discovery.md`](docs/project-discovery.md) for full project discovery details including languages, frameworks, tooling, commands, test structure, documentation paths, and infrastructure.
- Default branch: origin/main
- Docs: `docs/`
- ADRs: `docs/adrs/`

### Coding Standards

- [Custom Error Class Hierarchy](docs/coding-standards/custom-error-hierarchy.md) — Single-rooted error hierarchy extending HarnessError, with explicit name properties and domain-specific constructors
- [Test File Organization and Naming](docs/coding-standards/test-file-organization.md) — Test file naming suffixes, co-location, describe/it conventions, and traceability annotations
- [Immutable Data Patterns](docs/coding-standards/immutable-data-patterns.md) — Return new objects from transformations, verify immutability in tests, use spread for test data variation
- [ESM Import Conventions](docs/coding-standards/esm-import-conventions.md) — .js extensions in relative imports, node: prefix for built-ins, workspace package names, import type for type-only imports
- [Vitest Mocking Patterns](docs/coding-standards/vitest-mocking-patterns.md) — Mock declaration order, cleanup lifecycle, global stub management, return value patterns, and call argument extraction
- [Integration Test Lifecycle](docs/coding-standards/integration-test-lifecycle.md) — Temp directory lifecycle with beforeEach/afterEach, real filesystem and DuckDB usage, extracted test helpers, section comments, and integration config timeout
- [Test Data Factory Functions](docs/coding-standards/test-data-factories.md) — make* prefix convention, file-local factories, partial override pattern, shared fixtures in test-fixtures package, inline event builders, and module-level mock constants
- [Step-Based Pipeline Architecture](docs/coding-standards/step-based-pipeline.md) — Numbered step files, single-responsibility functions, explicit parameters, co-located tests, and orchestrator call-order verification
- [Cross-Runtime Meta Property Resolution](docs/coding-standards/cross-runtime-meta-resolution.md) — Fallback chain for import.meta.dir/dirname/url to resolve file paths across Bun runtime and Vitest test runner
- [NaN-Safe Numeric Handling](docs/coding-standards/nan-safe-numeric-handling.md) — Guard with isNaN() before comparisons and formatting, coerce NaN to 0 for scores, guard both sides of comparisons
- [Exhaustive Switch Statements](docs/coding-standards/exhaustive-switch-statements.md) — Default case with never type assertion for discriminated union switches, block scope, include discriminant in error message
- [Vacuous Truth Guards](docs/coding-standards/vacuous-truth-guards.md) — Check array length before .every() to prevent empty arrays from triggering success-path logic
- [Consistent Derived Key Usage](docs/coding-standards/consistent-derived-key-usage.md) — All write and read paths for JSONL records must use the same key derivation function (e.g., buildTestCaseId) to prevent silent empty-result mismatches
- [No Lint Disabling](docs/coding-standards/no-lint-disabling.md) — No lint-disable comments or per-file rule overrides; fix the code, import the right type, or change the rule globally

### testdouble-harness

- Language: TypeScript (Bun runtime, ESNext target, strict mode)
- Test: `make test` (Vitest, unit + integration)
- Build: `make build` (Bun compile + Vite 8)
- Dev server: `make dev`
- Packages: `packages/cli` (Yargs CLI), `packages/execution` (test-run, test-eval, SCIL/ACIL orchestration), `packages/data` (DuckDB), `packages/web` (Hono + React 18 + Tailwind v4), `packages/test-fixtures`, `packages/sandbox-integration` (Test Sandbox API)
- See [`docs/sandbox-integration.md`](docs/sandbox-integration.md) for Test Sandbox architecture, API reference, and consumer patterns
- See [`docs/test-harness-architecture.md`](docs/test-harness-architecture.md) for system architecture, package boundaries, data flow, and dependency graph
- See [`docs/execution.md`](docs/execution.md) for the execution package: test-run pipeline, test-eval, SCIL/ACIL loops, error hierarchy, and path config
- See [`docs/cli.md`](docs/cli.md) for the CLI package: thin Yargs wrapper, command definitions, path resolution
- See [`docs/bun-helpers.md`](docs/bun-helpers.md) for cross-runtime path resolution utilities (currentDir, resolveRelativePath)
- See [`docs/claude-integration.md`](docs/claude-integration.md) for Claude CLI wrapper API, argument construction, and sandbox delegation
- See [`docs/test-fixtures.md`](docs/test-fixtures.md) for shared test fixture data, loadFixtures utility, and analytics JSONL scenario catalog
- See [`docs/data.md`](docs/data.md) for the shared data layer: types, config parsing, JSONL I/O, DuckDB analytics, stream parsing, and SCIL/ACIL utilities
- See [`docs/web.md`](docs/web.md) for the web dashboard: Hono API server, React SPA, test run and SCIL views, per-test analytics
- See [`docs/evals.md`](docs/evals.md) for the evaluation engine: boolean evals, LLM judge scoring, rubric parsing, and the `evaluateTestRun` orchestrator
- See [`docs/sandbox-integration-package.md`](docs/sandbox-integration-package.md) for the sandbox integration package deep-dive: full public API, error handling matrix, and testing patterns

### Guides and Configuration

- See [`docs/scil-evals-guide.md`](docs/scil-evals-guide.md) for building and running SCIL trigger accuracy evals
- See [`docs/rubric-evals-guide.md`](docs/rubric-evals-guide.md) for building and running LLM-judge quality evals
- See [`docs/test-suite-reference.md`](docs/test-suite-reference.md) for the full tests.json field reference
- See [`docs/test-scaffolding.md`](docs/test-scaffolding.md) for how scaffolds provide project context in the Test Sandbox
- See [`docs/skill-call-improvement-loop.md`](docs/skill-call-improvement-loop.md) for SCIL mechanics: holdout splits, scoring, improvement prompt
- See [`docs/agent-call-improvement-loop.md`](docs/agent-call-improvement-loop.md) for ACIL mechanics: agent detection, temp plugin isolation, holdout splits, scoring
- See [`docs/llm-judge.md`](docs/llm-judge.md) for judge mechanics: prompt construction, scoring, output format
- See [`docs/parquet-schema.md`](docs/parquet-schema.md) for analytics Parquet field reference
- See [`docs/build-skill-eval-scaffold.md`](docs/build-skill-eval-scaffold.md) for the `/build-skill-eval-scaffold` skill workflow
- See [`docs/build-agent-eval-scaffold.md`](docs/build-agent-eval-scaffold.md) for the `/build-agent-eval-scaffold` skill workflow
- See [`docs/write-scil-evals.md`](docs/write-scil-evals.md) for the `/write-scil-evals` skill workflow
- See [`docs/write-acil-evals.md`](docs/write-acil-evals.md) for the `/write-acil-evals` skill workflow
- See [`docs/write-skill-eval-rubric.md`](docs/write-skill-eval-rubric.md) for the `/write-skill-eval-rubric` skill workflow
- See [`docs/write-agent-eval-rubric.md`](docs/write-agent-eval-rubric.md) for the `/write-agent-eval-rubric` skill workflow
- See [`docs/script-extraction.md`](docs/script-extraction.md) for the `/script-extraction` skill workflow
