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

**Resolution:** Add a `--repo-root` CLI flag to both `harness` and `harness-web`, defaulting to `process.cwd()`. This makes the harness a standalone tool that can point at any target repo containing plugins/skills.

### Implementation details

**1. `createPathConfig` — accept `repoRoot` as an explicit parameter**

`packages/execution/src/lib/path-config.ts` currently derives `repoRoot` as `path.join(testsDir, '..')`. Change the function signature to `createPathConfig(rootDir: string, repoRoot: string)` and use the passed value directly instead of deriving it.

Update `packages/execution/src/lib/path-config.test.ts` accordingly — the test at line 16 ("sets repoRoot to parent of root") should assert the passed-through value instead.

**2. `paths.ts` — make `repoRoot` settable instead of derived**

`packages/cli/src/paths.ts` currently calls `createPathConfig(process.cwd())` at module load time and re-exports the static results. This pattern doesn't support per-command CLI flags.

Replace the static module-level exports with a `createPaths(repoRoot: string)` function that commands call from their handlers, passing the `--repo-root` argv value. Each command already imports from `paths.ts` and passes values individually to execution functions, so this is a straightforward change.

**3. Add `--repo-root` option to CLI commands (`harness`)**

Add the option to the builder of each command that uses `repoRoot`:

- `packages/cli/src/commands/test-run.ts` — add `--repo-root` option (string, default `process.cwd()`), call `createPaths(argv['repo-root'])`, pass result to `runTestSuite`
- `packages/cli/src/commands/scil.ts` — same pattern, pass into `ScilConfig`
- `packages/cli/src/commands/acil.ts` — same pattern, pass into `AcilConfig`
- `packages/cli/src/commands/sandbox-setup.ts` — same pattern, pass to `createSandbox`

Update corresponding test files to include `'repo-root'` in builder assertions and `repoRoot` in handler call expectations:
- `packages/cli/src/commands/test-run.test.ts`
- `packages/cli/src/commands/scil.test.ts`
- `packages/cli/src/commands/acil.test.ts`

**4. Add `--repo-root` option to web server (`harness-web`)**

`packages/web/src/server/index.ts` already uses yargs for `--port` and `--data-dir`. Add `--repo-root` (string, default `process.cwd()`) alongside them. The web server doesn't currently use `repoRoot`, but it should be wired through for consistency — if future routes need it, the plumbing is in place.

**5. Makefile — no changes needed**

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
- `Makefile` line 43 — change `bunx vitest run` to `bun run vitest run`

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

**Resolution:** Align root `package.json` test script to use the same config as the Makefile, or document the difference. Since the Makefile is the primary interface (per project conventions), the `package.json` scripts should match.

**Files to change:**
- `package.json` — update `"test"` script to use `--config vitest.all.config.ts`

---

## Changes NOT needed

These were investigated and found to be fine:

- **Workspace package references:** All `workspace:*` dependencies resolve correctly within the monorepo
- **TypeScript configs:** Each package has its own `tsconfig.json`, none reference external paths
- **Binary artifacts:** `harness`, `harness-web`, and `libduckdb.dylib` exist locally but are properly gitignored (not tracked in git)
- **bun.lock:** Present and correct for all workspace dependencies
- **Test suites:** All 14 test suite directories are present with valid `tests.json` configs
- **Shell scripts:** `packages/claude-integration/sandbox-run.sh` and `sandbox-extract.sh` use relative path resolution via `bun-helpers` — no hardcoded paths
