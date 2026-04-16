# Gap Analysis: Documentation Audit Against ACIL Codebase

## Comparison Direction

Current state: Documentation files in `tests/docs/` and `tests/CLAUDE.md`. Desired state: The actual codebase on branch `r-and-d/gap-analysis`, which includes ACIL functionality added across issues #98-108.

## Scope

Comparison areas analyzed:
1. `tests/CLAUDE.md` -- See references and coding standards completeness
2. `tests/docs/execution.md` -- ACIL pipeline documentation
3. `tests/docs/cli.md` -- CLI commands and file references
4. `tests/docs/data.md` -- ACIL types and utilities
5. `tests/docs/test-suite-configuration.md` -- agent-call test type
6. `tests/docs/evals.md` -- agent-call evaluation
7. `tests/docs/test-harness-architecture.md` -- ACIL in architecture overview
8. `tests/docs/parquet-schema.md` -- ACIL parquet tables
9. `tests/docs/write-acil-evals.md` -- accuracy of new skill doc
10. `tests/docs/write-scil-evals.md` -- ACIL cross-references
11. `tests/docs/agent-call-improvement-loop.md` -- accuracy against code
12. `tests/docs/skill-call-improvement-loop.md` -- ACIL cross-references
13. `tests/docs/project-discovery.md` -- current project structure

Excluded: Non-documentation files, web dashboard internals, test fixture content.

## Summary

Documentation in `tests/docs/` and `tests/CLAUDE.md` was compared against the current codebase on `r-and-d/gap-analysis` to find stale references, missing ACIL coverage, and absent cross-references. The comparison direction is: documentation (current state) toward codebase (desired state).

| Category | Count | Description |
|----------|-------|-------------|
| Missing | 5 | Elements in desired state with no current state correspondence |
| Partial | 5 | Elements present in both but incompletely covered |
| Divergent | 1 | Elements addressing same concern in incompatible ways |
| Implicit | 1 | Assumed capabilities neither confirmed nor denied |

Full analysis written to: /Users/mxriverlynn/dev/testdouble/skills-internal/tests/docs/planning/gap-analysis-docs-audit.md

## Findings

**GAP-001: test-harness-architecture.md does not mention ACIL**
- **Category:** Missing
- **Feature/Behavior:** ACIL loop visibility in the system architecture overview
- **Current State:** `tests/docs/test-harness-architecture.md` -- The architecture diagram (lines 39-50) lists `runScilLoop()` but not `runAcilLoop()`. The execution package description (lines 156-183) mentions SCIL loop but not ACIL loop. The CLI commands table (lines 140-149) lists `scil` but not `acil`. The data flow section (lines 362-365) shows `scil-iteration.jsonl` and `scil-summary.json` but not their ACIL counterparts. The web routes (lines 268-285) show SCIL routes but no ACIL routes. The dependency graph text (line 16) says "Execution orchestration (test-run, test-eval, SCIL pipelines)" -- ACIL is absent.
- **Desired State:** Codebase has `runAcilLoop()` exported from `packages/execution/index.ts` (line 12), `acil` command registered in `packages/cli/index.ts` (line 15), ACIL step files in `packages/execution/src/acil/`, `acil-iteration.jsonl` and `acil-summary.json` output files, and `queryAcilHistory`/`queryAcilRunDetails` in `packages/data/src/run-status.ts`.

**GAP-002: cli.md references nonexistent file paths and omits ACIL command**
- **Category:** Divergent
- **Feature/Behavior:** CLI package structure documentation accuracy
- **Current State:** `tests/docs/cli.md` -- The Key Files table (lines 63-91) references 30 files under `packages/cli/src/` including `src/lib/errors.ts`, `src/lib/output.ts`, `src/lib/metrics.ts`, `src/lib/path-config.ts`, `src/test-runners/`, `src/scil/`, `src/test-eval-steps/`, `src/re-eval-marker.ts`. The overview (line 13) says "Seven CLI commands" and lists them without `acil`. The architecture diagram (lines 27-56) has no `acil` node. The Testing section (lines 266-278) references test files in directories that no longer exist. The CLI is described as owning SCIL steps, test runners, error hierarchy, and path config.
- **Desired State:** The CLI `src/` directory contains only `commands/`, `paths.ts`, and `paths.test.ts`. All `lib/`, `test-runners/`, `scil/`, `test-eval-steps/` directories were extracted to `packages/execution/`. The CLI has 8 commands (including `acil`): confirmed by `packages/cli/index.ts` which registers `.command(await import('./src/commands/acil.js'))`. The CLI `src/commands/` directory contains `acil.ts` and `acil.test.ts`.

**GAP-003: test-suite-configuration.md does not document `agent-call` test type**
- **Category:** Partial
- **Feature/Behavior:** Documentation of the `agent-call` test type alongside `prompt` and `skill-call`
- **Current State:** `tests/docs/test-suite-configuration.md` -- The `type` field description (line 95) says: `How the test is run: "prompt" or "skill-call"`. The Test Types section (lines 103-147) documents only `prompt` and `skill-call`. The `agent-call` expectation type is documented (lines 189-209), and the `agentFile` field is in the test case fields table (line 98), but there is no `### agent-call` section under Test Types explaining how `type: "agent-call"` tests run. The validation section (line 248) validates `skill-call` but does not mention `agent-call` validation.
- **Desired State:** The codebase dispatches `agent-call` tests in `packages/execution/src/test-runners/steps/step-8-run-test-cases.ts` (line 19: `const agentCallTests = config.tests.filter(t => t.type === 'agent-call')`), routing them to `runAgentCallTests` from `packages/execution/src/test-runners/agent-call/index.ts`. This is a distinct test type with its own runner, not just an expectation type.

**GAP-004: test-suite-configuration.md references section missing ACIL cross-reference**
- **Category:** Missing
- **Feature/Behavior:** Cross-reference from test suite configuration to ACIL documentation
- **Current State:** `tests/docs/test-suite-configuration.md` -- The References section (lines 251-261) links to SCIL evals guide and Skill Call Improvement Loop but does not link to the Agent Call Improvement Loop or ACIL evals guide. The skill-call test type description (line 129) cross-references SCIL but no parallel cross-reference exists for agent-call tests to ACIL.
- **Desired State:** ACIL uses `agent-call` tests the same way SCIL uses `skill-call` tests. `tests/docs/agent-call-improvement-loop.md` exists and documents this relationship.

**GAP-005: execution.md Testing section omits ACIL tests**
- **Category:** Partial
- **Feature/Behavior:** Test file documentation for the execution package
- **Current State:** `tests/docs/execution.md` -- The Testing section (lines 323-329) lists test locations for `lib/`, `common/`, `test-runners/steps/`, `test-eval-steps/`, and `scil/` but does not mention `acil/*.test.ts`.
- **Desired State:** The `packages/execution/src/acil/` directory contains 7 test files: `loop.test.ts`, `step-1-resolve-and-load.test.ts`, `step-3-read-agent.test.ts`, `step-5-run-eval.test.ts`, `step-7-improve-description.test.ts`, `step-8-apply-description.test.ts`, `step-9-write-output.test.ts`.

**GAP-006: execution.md Related Documentation section omits ACIL doc link**
- **Category:** Missing
- **Feature/Behavior:** Cross-reference from execution docs to ACIL improvement loop docs
- **Current State:** `tests/docs/execution.md` -- The Related Documentation section (lines 335-344) links to the Skill Call Improvement Loop doc but does not link to the Agent Call Improvement Loop doc.
- **Desired State:** `tests/docs/agent-call-improvement-loop.md` exists and documents the ACIL pipeline that lives in `packages/execution/src/acil/`.

**GAP-007: skill-call-improvement-loop.md has no ACIL cross-reference**
- **Category:** Missing
- **Feature/Behavior:** Cross-reference from SCIL docs to its ACIL counterpart
- **Current State:** `tests/docs/skill-call-improvement-loop.md` -- The References section (lines 198-207) does not mention or link to the Agent Call Improvement Loop or `write-acil-evals`. No text in the document references ACIL at all.
- **Desired State:** `tests/docs/agent-call-improvement-loop.md` line 3 says "It mirrors the [SCIL](skill-call-improvement-loop.md) architecture with agent-specific adaptations." The reverse cross-reference is missing.

**GAP-008: write-scil-evals.md has no ACIL cross-reference**
- **Category:** Missing
- **Feature/Behavior:** Cross-reference from SCIL eval writing docs to its ACIL counterpart
- **Current State:** `tests/docs/write-scil-evals.md` -- The References section (lines 119-126) does not link to `write-acil-evals.md` or `agent-call-improvement-loop.md`. No text mentions the ACIL equivalent.
- **Desired State:** `tests/docs/write-acil-evals.md` exists and its References section (lines 122-123) cross-references both `agent-call-improvement-loop.md` and `write-scil-evals.md`. The reverse link is absent.

**GAP-009: project-discovery.md does not reflect ACIL or execution package**
- **Category:** Partial
- **Feature/Behavior:** Workspace package listing and documentation index accuracy
- **Current State:** `tests/docs/project-discovery.md` -- The Workspace Packages section (lines 38-73) lists `@testdouble/harness-cli`, `@testdouble/harness-data`, `@testdouble/harness-web`, and `@testdouble/test-fixtures`. It omits `@testdouble/harness-execution`, `@testdouble/harness-evals`, `@testdouble/claude-integration`, `@testdouble/docker-integration`, and `@testdouble/bun-helpers`. The CLI package entry (line 45) says "Depends on: `@testdouble/harness-data`" but the CLI now depends on `@testdouble/harness-execution`. The Documentation section (lines 83-106) lists 25 doc files but omits `execution.md`, `write-acil-evals.md`, and `agent-call-improvement-loop.md`. The test suites count (line 79) says "11 skill test suites" which matches the current count but uses "skill" even though agent test suites now exist.
- **Desired State:** The `packages/` directory contains 8 workspace packages: `bun-helpers`, `claude-integration`, `cli`, `data`, `docker-integration`, `evals`, `execution`, `test-fixtures`, `web`. The docs directory contains `execution.md`, `write-acil-evals.md`, and `agent-call-improvement-loop.md`.

**GAP-010: evals.md does not document ACIL as a consumer of evaluateAgentCall**
- **Category:** Partial
- **Feature/Behavior:** Documentation of ACIL loop as a consumer of the evals package
- **Current State:** `tests/docs/evals.md` -- The Purpose section (line 15) lists two consumers: `test-eval` command and "SCIL improvement loop (`step-5-run-eval`)". The SCIL consumer is described as using `evaluateSkillCall` directly. No mention of ACIL as a third consumer. The boolean-evals table (line 50) correctly documents `evaluateAgentCall`, but the Purpose section is incomplete.
- **Desired State:** The ACIL loop in `packages/execution/src/acil/step-5-run-eval.ts` uses `evaluateAgentCall` from `@testdouble/harness-evals`, making it a third consumer of the evals package.

**GAP-011: parquet-schema.md References section omits ACIL doc link**
- **Category:** Partial
- **Feature/Behavior:** Cross-reference from parquet schema to ACIL improvement loop
- **Current State:** `tests/docs/parquet-schema.md` -- The References section (lines 236-243) links to the Skill Call Improvement Loop but not the Agent Call Improvement Loop, even though the document itself documents ACIL tables (`acil-iteration.parquet` at line 96 and `acil-summary.parquet` at line 113).
- **Desired State:** `tests/docs/agent-call-improvement-loop.md` exists and is the authoritative reference for the ACIL pipeline that produces data stored in these tables.

**GAP-012: web.md likely does not document ACIL routes**
- **Category:** Implicit
- **Feature/Behavior:** Web dashboard ACIL views
- **Current State:** `tests/docs/web.md` was not read in full, but a grep for `acil` across the entire `packages/web/` directory returned no matches. The web server routes directory contains `scil.ts` but no `acil.ts`. The architecture doc (line 99-100) shows SCIL web routes but no ACIL routes.
- **Desired State:** If ACIL analytics exist in Parquet (confirmed in `parquet-schema.md` and `run-status.ts`), users would expect web dashboard views for them. However, the web package has no ACIL routes implemented. This gap is in the codebase rather than docs -- the docs accurately reflect the absence of ACIL web views, but the absence itself may be a feature gap.

## Areas Needing Separate Analysis

1. **cli.md full rewrite assessment** -- GAP-002 reveals that `cli.md` is substantially stale: the majority of its Key Files, Testing, and Implementation Details sections reference directories that no longer exist in the CLI package. A separate focused analysis should determine the scope of rewrite needed versus the note at the top of the file (lines 4-5) which acknowledges the extraction but does not go far enough.

2. **web.md ACIL coverage** -- A separate analysis should determine whether ACIL web dashboard views are planned or intentionally deferred, and whether `web.md` needs to document this gap.

3. **project-discovery.md completeness** -- The workspace packages listing is significantly incomplete (4 of 9 packages listed). A separate focused analysis should determine the full scope of updates needed.
