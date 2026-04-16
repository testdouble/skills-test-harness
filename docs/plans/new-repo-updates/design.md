# New Repo Updates Plan

This plan addresses issues found after moving the test harness from a sub-folder of an internal repo to its own standalone repository.

## Summary of Findings

The codebase was cleanly extracted: all workspace packages are present, internal `@testdouble/*` references resolve correctly, and all 994 unit tests pass across 74 test files. No broken imports or missing packages were found.

However, several issues need attention:

---

## Issue 1: `repoRoot` path-config points to parent directory

**Status:** Needs change

**Evidence:** `packages/execution/src/lib/path-config.ts:17` sets `repoRoot: path.join(testsDir, '..')`, which resolves to the parent of the harness repo.

**Impact:** `repoRoot` is used extensively to:
- Locate SKILL.md files: `path.join(repoRoot, pluginName, 'skills', skillName, 'SKILL.md')` (build-temp-plugin.ts, step-1-resolve-and-load.ts)
- Locate agent .md files: `path.join(repoRoot, pluginName, 'agents', agentName + '.md')` (acil/step-1-resolve-and-load.ts)
- Resolve plugin directories: `path.join(repoRoot, pluginName)` (plugin-flags.ts)
- Create Docker sandbox workspace: `createSandbox(repoRoot)` passes this path to `docker sandbox run` (lifecycle.ts)

**Context:** When this was a sub-folder (e.g., `parent-repo/tests/`), `repoRoot` pointed to `parent-repo/` where plugins like `r-and-d/` lived. Now that the harness is standalone, the parent directory is arbitrary (e.g., `/Users/mxriverlynn/dev/testdouble/`).

**Resolution:** Add a `--repo-root` CLI flag to `harness` commands that need it, defaulting to `process.cwd()`. This makes the harness a standalone tool that can point at any target repo containing plugins/skills.

### Implementation details

**1. `createPathConfig` — remove `repoRoot` from the return value**

`packages/execution/src/lib/path-config.ts` currently derives `repoRoot` as `path.join(testsDir, '..')`. Since `repoRoot` is no longer derivable from the harness directory, and every execution function already receives `repoRoot` via its own config/options parameter (not via `PathConfig`), remove `repoRoot` from both the `PathConfig` interface and the `createPathConfig` return value.

Update `packages/execution/src/lib/path-config.test.ts` — remove the test at line 16 ("sets repoRoot to parent of root").

**2. `paths.ts` — remove `repoRoot` export**

`packages/cli/src/paths.ts` currently calls `createPathConfig(process.cwd())` at module load time and re-exports the static results including `repoRoot`. Since only `repoRoot` needs to become dynamic (all other values — `testsDir`, `outputDir`, `dataDir`, `harnessDir` — are correctly derived from `process.cwd()`), the simplest change is to remove the `repoRoot` export from `paths.ts` rather than restructuring the entire module.

Remove the `repoRoot` re-export. The utility functions `getTestSuiteDir` and `getAllTestSuites` depend on `testsDir` (not `repoRoot`), so they continue to work unchanged. Each CLI command that needs `repoRoot` will get it from its `--repo-root` argv value instead.

**3. Add `--repo-root` option to CLI commands (`harness`)**

Add the option to the builder of each command that uses `repoRoot`:

- `packages/cli/src/commands/test-run.ts` — add `--repo-root` option (string, default `process.cwd()`), pass `argv['repo-root']` as `repoRoot` to `runTestSuite`
- `packages/cli/src/commands/scil.ts` — same pattern, pass `argv['repo-root']` as `repoRoot` into `ScilConfig`
- `packages/cli/src/commands/acil.ts` — same pattern, pass `argv['repo-root']` as `repoRoot` into `AcilConfig`
- `packages/cli/src/commands/sandbox-setup.ts` — same pattern, pass `argv['repo-root']` to `createSandbox`

Update corresponding test files to include `'repo-root'` in builder assertions and `repoRoot` in handler call expectations:
- `packages/cli/src/commands/test-run.test.ts`
- `packages/cli/src/commands/scil.test.ts`
- `packages/cli/src/commands/acil.test.ts`

**4. Makefile — no changes needed**

The Makefile invokes `./harness` and `./harness-web` without path flags, so it will pick up the `process.cwd()` default automatically. No Makefile changes required for this issue.

---

## Issue 2: Stale `.gitignore` entries from old repo

**Status:** Needs cleanup

**Evidence:** `.gitignore` contains entries for directories that don't exist and aren't referenced in any source code:
- `dist/code/`
- `dist/cowork/`
- `dist/.cowork-staging/`
- `dist/.gist-staging/`
- Comment referencing `plugin-marketplace-dist/`

**Impact:** Low — no functional impact, but creates confusion about what this repo produces.

**Resolution:** Remove these stale entries. Keep all entries that are relevant to this repo's actual build outputs (`harness`, `harness-web`, `libduckdb.dylib`, `output/`, `analytics/`, etc.).

---

## Issue 3: `bunx vitest` resolution failure

**Status:** Needs investigation/fix

**Evidence:** Running `bunx vitest run --config vitest.all.config.ts` fails with:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../node_modules/.bin/dist/cli.js'
```

The Makefile uses `bunx vitest` which hits this error. Running `bun run vitest run --config vitest.all.config.ts` works correctly.

**Impact:** `make test` fails. The root `package.json` scripts (`npm run test`) also use bare `vitest run` which may hit the same issue.

**Resolution:** Update the Makefile `test` target to use `bun run vitest` instead of `bunx vitest`. This is a known bun issue where `bunx` resolves the binary differently than `bun run`.

**Files to change:**
- `Makefile` line 44 — change `bunx vitest run` to `bun run vitest run`

---

## Issue 4: Makefile hardcodes `libduckdb.dylib` (macOS-only)

**Status:** Acceptable for now

**Evidence:** `Makefile:35` copies `libduckdb.dylib` — the `.dylib` extension is macOS-specific. On Linux it would be `.so`.

**Impact:** Build would fail on Linux. However, the Makefile already does platform-specific DuckDB binding detection via `DUCKDB_PLATFORM`, so it handles cross-platform there. The `.dylib` copy is only needed for the compiled binary's runtime linking on macOS.

**Resolution:** This is acceptable if this tool is only used on macOS developer machines. If Linux support is needed in the future, the `cp` line should use platform-conditional logic (e.g., `dylib` on Darwin, `so` on Linux). No change needed now.

---

## Issue 5: Root `package.json` scripts vs Makefile config mismatch

**Status:** Minor cleanup

**Evidence:** 
- Root `package.json` `"test"` script runs `vitest run` (uses default `vitest.config.ts` which excludes integration tests)
- Makefile `test` target runs `vitest run --config vitest.all.config.ts` (includes all tests with 30s timeout)

**Impact:** Running `bun test` gives different results than `make test`. Developers might be confused about which to use.

**Resolution:** The separation is intentional — `vitest.config.ts` excludes integration tests (fast feedback), while `vitest.all.config.ts` includes them with a 30s timeout (may need Docker). Keep `package.json` `"test"` as unit-only. Align `"test:all"` to use the single `vitest.all.config.ts` config instead of running two separate vitest passes. Document in CLAUDE.md that `make test` is the canonical way to run all tests.

**Files to change:**
- `package.json` — update `"test:all"` script to `vitest run --config vitest.all.config.ts` (single pass instead of two separate runs)

---

## Issue 6: `project-discovery.md` has stale `tests/` prefixed paths

**Status:** Needs cleanup

**Evidence:** `docs/project-discovery.md` prefixes all paths with `tests/` (e.g., `tests/docs/`, `tests/packages/cli/`, `tests/README.md`, `tests/Makefile`). This was correct when the harness lived at `parent-repo/tests/`, but now that it's a standalone repo, the root is the repo itself.

Additionally, the "Commands and Tests" section references `bunx vitest run` which hits the same Issue 3 resolution failure.

**Impact:** Misleading documentation — any tool or agent consuming `project-discovery.md` will look for files at wrong paths.

**Resolution:** Remove the `tests/` prefix from all paths. Update `bunx vitest` references to `bun run vitest`.

**Files to change:**
- `docs/project-discovery.md` — strip `tests/` prefix from all paths; update vitest commands

---

## Changes NOT needed

These were investigated and found to be fine:

- **Workspace package references:** All `workspace:*` dependencies resolve correctly within the monorepo
- **TypeScript configs:** Each package has its own `tsconfig.json`, none reference external paths
- **Binary artifacts:** `harness`, `harness-web`, and `libduckdb.dylib` exist locally but are properly gitignored (not tracked in git)
- **bun.lock:** Present and correct for all workspace dependencies
- **Test suites:** All 14 test suite directories are present with valid `tests.json` configs
- **Shell scripts:** `packages/claude-integration/sandbox-run.sh` and `sandbox-extract.sh` use relative path resolution via `bun-helpers` — no hardcoded paths

---

## Iteration Summary

- **Iterations completed:** 3
- **Assumptions challenged:** 6
  - `createPathConfig` needs a second `repoRoot` parameter → **Refuted**: simpler to remove `repoRoot` from `PathConfig` entirely since execution functions already receive it via their own config objects
  - Web server needs `--repo-root` for consistency → **Refuted**: YAGNI — `harness-web` doesn't use `repoRoot` and adding it is speculative
  - `paths.ts` needs full restructuring to `createPaths()` → **Refuted**: only `repoRoot` is dynamic; simpler to remove that one export and keep everything else static
  - `package.json` `test` should match Makefile's all-tests config → **Refuted**: the separation is intentional (unit-only for fast feedback vs. all for CI)
  - `project-discovery.md` paths are correct → **Refuted**: all paths have stale `tests/` prefix from old repo structure
  - `getTestSuiteDir`/`getAllTestSuites` need refactoring → **Verified as fine**: they depend on `testsDir` (static from cwd), not `repoRoot`
- **New issues added:** 1 (Issue 6: `project-discovery.md` stale paths)
- **Consolidations made:** Simplified Issue 1 implementation (3 steps instead of 5; removed web server scope and PathConfig restructuring)
