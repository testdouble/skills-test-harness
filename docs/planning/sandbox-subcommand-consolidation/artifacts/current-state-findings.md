# Current State Findings: Sandbox Sub-command Consolidation

## Provenance

Produced by this run's own discovery round on 2026-09-22. No prior findings report existed for this area.

- `han-core:structural-analyst` — static structure of `packages/cli`, the eight command modules and their tests, the
  user-facing strings in `packages/sandbox-integration/src/`, `Makefile`, and `README.md`. Returned `S-1` through `S-8`.
- `han-core:behavioral-analyst` — runtime behavior of the same area. Returned `B-1` through `B-10`.
- `han-core:concurrency-analyst` — **not dispatched.** The area contains no concurrent access, no async coordination,
  and no shared mutable state. Every `await` in the three moving commands is a single sequential subprocess call.
- The run's own sweep — project context, ADRs, coding standards, git churn, the full documentation inventory, and a
  live probe of nested Yargs behavior (`C-9`).

Findings below merge both agents' output. Where the two worded one finding differently, it is recorded once carrying
both originating identifiers.

## Project Context

- **Stack:** TypeScript on the Bun runtime, ESNext target, strict mode. Yargs 18.2.0 for CLI parsing, typed against
  `@types/yargs` 17.0.35 (Yargs 18 ships no bundled types; the major versions differ but `CommandModule` resolves).
  Vitest for tests.
- **Conventions source:** `CLAUDE.md` and `docs/project-discovery.md`, both present.
- **ADRs found:** two under `docs/adrs/`.
  - `20260515000000-migrate-sandbox-cli-to-sbx.md` — bears directly on this change. See `C-12`.
  - `20260326084800-skip-permissions-in-test-sandbox.md` — status `proposed`; references
    `packages/cli/src/commands/sandbox-setup.ts` only as a file-path table entry.
- **Coding standards found:** 14 under `docs/coding-standards/`. Three bear on this area:
  `test-file-organization.md` (co-location, describe/it naming), `esm-import-conventions.md` (`.js` extensions on
  relative imports, `import type` for type-only imports), and `step-based-pipeline.md` — which scopes itself to
  `packages/execution/src/` and does **not** govern `packages/cli`.
- **Recent churn:** over the last 90 days, `packages/sandbox-integration/src/sandbox.ts` and `lifecycle.ts` changed
  twice each; `clean.ts` changed once; `shell.ts` and `sandbox-setup.ts` show no changes. The area is quiet.

## Gaps

What was searched for and not found:

- **No test file for `sandbox-setup.ts`.** Every other command module has a co-located `.test.ts`. This is a gap
  against `docs/coding-standards/test-file-organization.md`, which documents co-location as the convention. Noted
  during the review round: that standard does **not** contain language about exemptions, and it carries
  `**Status:** proposed` rather than accepted, so it is a documented convention rather than an enforced rule. See
  `C-6`.
- **No status field on the sbx migration ADR.** `20260515000000-migrate-sandbox-cli-to-sbx.md` carries no
  `**Status:**` line, so it cannot be read as accepted, proposed, or superseded. The other ADR does carry one.
- **No nested-command precedent anywhere in the repository.** See `C-3`.
- **No CLI integration or end-to-end test.** Nothing executes the built binary and asserts on its output. Every
  command test imports the module directly and calls `handler()` with the delegate mocked. No test would catch a
  command that fails to register in `index.ts`.
- **No deprecation or command-stability policy document.** Nothing beyond `C-12` states what the project owes users
  when a command name changes.

## Findings

### C-1: The command module contract is uniform across all eight modules

- **Claim:** Every command module exports exactly four named bindings with the same shapes, and no module exports a
  default. `index.ts` consumes each as a namespace object that structurally matches Yargs' `CommandModule` interface.
- **Location:** `packages/cli/src/commands/*.ts` — all eight modules.
- **Evidence:**
  ```ts
  export const command = 'clean'
  export const describe = 'Remove the Test Sandbox'
  export function builder(yargs: Argv): Argv {
    return yargs
  }
  export async function handler(): Promise<void> { /* ... */ }
  ```
  `command` is a string literal; `describe` a one-line string; `builder` takes and returns `Argv`; `handler` is
  `async (argv: Record<string, unknown>) => Promise<void>`, except in `clean.ts:12` and `shell.ts:11`, which declare
  `handler()` with no parameter because they read no flags.
- **Raised by:** structural-analyst `S-1`.
- **Confidence:** Verified.
- **Bears on:** S-1, S-2, S-3, S-4, D-2.

### C-2: `index.ts` registers every module flat, via dynamic import, under `.strict()`

- **Claim:** All eight commands are registered as siblings at the top level. `index.ts` is the only file in the
  repository that calls `.command(...)` on a live Yargs instance.
- **Location:** `packages/cli/index.ts:6-20`.
- **Evidence:**
  ```ts
  await yargs(hideBin(process.argv))
    .scriptName('skillwalker')
    .command(await import('./src/commands/test-run.js'))
    .command(await import('./src/commands/test-eval.js'))
    .command(await import('./src/commands/shell.js'))
    .command(await import('./src/commands/clean.js'))
    .command(await import('./src/commands/update-analytics.js'))
    .command(await import('./src/commands/scil.js'))
    .command(await import('./src/commands/acil.js'))
    .command(await import('./src/commands/sandbox-setup.js'))
    .demandCommand(1)
    .strict()
    .showHelpOnFail(true)
    .parseAsync()
  ```
  Registration order is not alphabetical and does not group the three sandbox commands: `update-analytics`, `scil`,
  and `acil` sit between `clean` and `sandbox-setup`.
- **Raised by:** structural-analyst `S-2`, behavioral-analyst `B-9`.
- **Confidence:** Verified.
- **Bears on:** S-4, D-1.

### C-3: No nested or multi-level command exists anywhere in the codebase

- **Claim:** A `sandbox` parent with child sub-commands is a pattern being introduced to this codebase, not one being
  followed from precedent within it.
- **Location:** `packages/cli/index.ts`, `packages/cli/src/commands/*.ts`.
- **Evidence:** A repository-wide grep for `.command(` outside test files returns only the eight lines at
  `index.ts:9-16`. No command module's `builder` calls `.command(...)` to register children. `docs/cli.md:15` states
  the binary exposes "Eight CLI commands" and lists them flat.
- **Raised by:** structural-analyst `S-3`, behavioral-analyst `B-9`.
- **Confidence:** Verified.
- **Bears on:** S-4, D-2.

### C-4: The three moving commands have almost no incoming coupling

- **Claim:** Nothing imports `sandbox-setup.ts`, `clean.ts`, or `shell.ts` except `index.ts` and their own co-located
  tests. They are also the only three command modules that do not import `../paths.js`.
- **Location:** `packages/cli/src/commands/{sandbox-setup,clean,shell}.ts`.
- **Evidence:** Each imports exactly one function from `@testdouble/sandbox-integration` — `createSandbox`,
  `removeSandbox`, and `openShell` respectively — and `clean.ts` additionally imports `SANDBOX_NAME` and
  `SandboxError`. The other five command modules all import `../paths.js`; these three do not.
- **Raised by:** structural-analyst `S-4`.
- **Confidence:** Verified.
- **Bears on:** S-1, S-2, S-3.

### C-5: Three hint strings inside `sandbox-integration` hardcode the flat `sandbox-setup` spelling

- **Claim:** `packages/sandbox-integration` names a CLI invocation string with no import relationship to
  `packages/cli`. Nothing enforces that the string matches a registered command. After the hard cut, all three of
  these failure-path messages would tell a user to run a command that no longer exists.
- **Location:** `packages/sandbox-integration/src/lifecycle.ts:41`, `packages/sandbox-integration/src/sandbox.ts:30`,
  `packages/sandbox-integration/src/sandbox.ts:45`.
- **Evidence:**
  ```ts
  // lifecycle.ts:41 — inside createSandbox, stderr, when the sandbox already exists
  process.stderr.write(`  ./build/skillwalker sandbox-setup\n`)

  // sandbox.ts:30 — inside listSandboxNames, in a thrown SandboxError, when `sbx ls --quiet` exits non-zero
  `Unable to list sandboxes with sbx (exit code ${proc.exitCode ?? 1}): ${stdout}${stderr}\nRun \`sbx login\`, then retry \`./build/skillwalker sandbox-setup\`.`

  // sandbox.ts:45 — inside ensureSandboxExists, in a thrown SandboxError, when the sandbox is absent
  throw new SandboxError(`Sandbox "${SANDBOX_NAME}" not found. Run './build/skillwalker sandbox-setup' first.`, null)
  ```
  No hint string in that package names `clean` or `shell`.

  **Corrected during the review round.** An earlier wording of this finding said the `sandbox.ts:45` message is the
  pre-check that `openShell` and, transitively, `clean` and `sandbox-setup` rely on. That call graph is wrong:
  `removeSandbox` (which `clean` calls) invokes `spawnSbx` directly and never calls `ensureSandboxExists`, and
  `createSandbox` checks existence through a private `sandboxExists()` that never throws this message. The actual
  callers of `ensureSandboxExists` are `openShell` (`lifecycle.ts:59`) and three paths outside this package:
  `packages/execution/src/scil/loop.ts:45`, `packages/execution/src/acil/loop.ts:46`, and
  `packages/execution/src/evals/run-evals.ts:32`. The frequency claim survives the correction and gets stronger — the
  message gates the SCIL, ACIL, and eval runs, which are the project's main workflows.
- **Raised by:** structural-analyst `S-4`, behavioral-analyst `B-5`.
- **Confidence:** Verified.
- **Bears on:** S-7, D-4.

### C-6: Tests pin `command` as an exact literal, and `sandbox-setup` has no test at all

- **Claim:** Seven of the eight command modules carry a co-located test asserting `expect(command).toBe('<literal>')`.
  `sandbox-setup.ts` has no test file, so nothing in the repository pins its `command` string, its `describe`, or its
  `builder`/`handler` behavior.
- **Location:** `packages/cli/src/commands/*.test.ts`; `packages/cli/src/commands/sandbox-setup.test.ts` does not exist.
- **Evidence:**
  ```ts
  // clean.test.ts:31-33
  it('exports the correct command string', () => {
    expect(command).toBe('clean')
  })
  ```
  `shell.test.ts:21-23` is structurally identical with `'shell'` substituted. The handler-level assertions
  (`clean.test.ts:40-62`, `shell.test.ts:30-35`) never reference the `command` string, so they survive a rename
  untouched. Only the `toBe(...)` equality assertions are literal-coupled.
- **Raised by:** structural-analyst `S-6`, `S-8`.
- **Confidence:** Verified.
- **Bears on:** S-2, S-3, S-5, D-3.

### C-7: `clean` normalizes `SandboxError`; `shell` and `sandbox-setup` do not

- **Claim:** A failure from the same underlying cause produces a clean one-line stderr message under `clean` and a raw
  Bun stack trace under `shell` or `sandbox-setup`.
- **Location:** `packages/cli/src/commands/clean.ts:12-22`, `packages/cli/index.ts:21-27`,
  `packages/sandbox-integration/src/errors.ts:1-9`.
- **Evidence:**
  ```ts
  // clean.ts — the only one of the three with a try/catch
  } catch (error) {
    if (error instanceof SandboxError) {
      throw new SkillwalkerError(error.message)
    }
    throw error
  }

  // index.ts — only SkillwalkerError is special-cased
  } catch (err) {
    if (err instanceof SkillwalkerError) {
      process.stderr.write(`Error: ${err.message}\n`)
      process.exit(1)
    }
    throw err
  }
  ```
  `SandboxError` extends the built-in `Error`, not `SkillwalkerError`, so it is not caught by the `index.ts` branch.
  `clean`'s rewrap also discards `SandboxError`'s `name` and `exitCode` fields, since `SkillwalkerError`'s constructor
  carries only `message`.
- **Raised by:** behavioral-analyst `B-4`.
- **Confidence:** Verified for the code paths. The agent labeled **Unverified** the exact Bun stderr formatting for
  the uncaught rethrow, having not forced an `ENOENT` condition. That sub-claim carries no blocking weight.
- **Bears on:** Pre-existing condition; not a delta entry. Recorded as context and as a deferral trigger.

### C-8: The Makefile has a `sandbox-setup` target that calls the binary, and a `sandbox-clean` target that bypasses it

- **Claim:** Only the `sandbox-setup` target is coupled to the CLI's registered command name. `sandbox-clean` shells
  out to `sbx` directly and re-types the sandbox name as a literal.
- **Location:** `Makefile:1-7`, `packages/sandbox-integration/src/sandbox.ts:4`.
- **Evidence:**
  ```make
  .PHONY: sandbox-setup sandbox-clean dev build web update-analytics-data test clear-data

  sandbox-setup: build
  	./build/skillwalker sandbox-setup

  sandbox-clean:
  	sbx rm --force claude-skills-skillwalker
  ```
  `claude-skills-skillwalker` is a second, independently maintained copy of the value at `sandbox.ts:4`
  (`export const SANDBOX_NAME = 'claude-skills-skillwalker'`). Make cannot import TypeScript, so the duplication has
  no single source. There is no `clean` or `shell` Makefile target. `sandbox-clean` already differs from
  `skillwalker clean` in mechanism: no build dependency, no error wrapping, no success message.
- **Raised by:** structural-analyst `S-5`, behavioral-analyst `B-10`.
- **Confidence:** Verified.
- **Bears on:** S-8, D-5.

### C-9: Nested Yargs commands work under `.strict()`, and removing a flat name produces exit 1

- **Claim:** The target shape is achievable with the installed Yargs, preserves option parsing, and produces the
  intended failure for a removed command name. Verified by executing a probe, not inferred from documentation.
- **Location:** Probe script written to the session scratchpad; behavior of `yargs` 18.2.0 as installed at
  `node_modules/.bun/yargs@18.2.0`.
- **Evidence:** A probe registering a `sandbox` parent whose `builder` calls `.command(setup).command(clean)
  .command(shell).demandCommand(1)`, under the same top-level `.demandCommand(1).strict().showHelpOnFail(true)` chain
  `index.ts` uses, produced:

  | Invocation | stderr / stdout | Exit |
  | --- | --- | --- |
  | `sandbox setup --repo-root /tmp/x` | `SETUP ran, repo-root=/tmp/x` | 0 |
  | `sandbox clean` | `CLEAN ran` | 0 |
  | `clean` (the removed flat name) | command list, then `Unknown argument: clean` | 1 |
  | `sandbox` (no sub-command) | the three sub-commands listed, then `Not enough non-option arguments: got 0, need at least 1` | 1 |
  | `sandbox bogus` | sub-command list, then `Unknown argument: bogus` | 1 |

  Top-level `--help` collapses the three commands into one line: `skillwalker sandbox  Manage the Test Sandbox`.
  Sub-command help renders as `skillwalker sandbox setup`, `skillwalker sandbox clean`, `skillwalker sandbox shell`.
- **Raised by:** the run's own probe, corroborating behavioral-analyst `B-6`, `B-7`, and `B-8`.
- **Confidence:** Verified by execution.
- **Bears on:** S-4, S-5, S-6, D-1, D-2.

### C-10: `--repo-root` parsing does not depend on the command sitting at the top level

- **Claim:** Nesting `sandbox-setup` under a parent does not change how its one option is parsed or read.
- **Location:** `packages/cli/src/commands/sandbox-setup.ts:7-17`.
- **Evidence:**
  ```ts
  export function builder(yargs: Argv): Argv {
    return yargs.option('repo-root', {
      type: 'string',
      default: process.cwd(),
      describe: 'Target repo root to mount in the sandbox (defaults to current working directory)',
    })
  }
  export async function handler(argv: Record<string, unknown>): Promise<void> {
    await createSandbox(argv['repo-root'] as string)
  }
  ```
  `builder` receives whatever `Argv` instance Yargs hands it for that command's scope, regardless of nesting depth.
  The probe at `C-9` confirmed `--repo-root` arrives intact through two levels. `clean` and `shell` declare no
  options at all.
- **Raised by:** behavioral-analyst `B-8`, corroborated by the run's probe.
- **Confidence:** Verified by execution.
- **Bears on:** S-1.

### C-11: Six documentation files name these commands, beyond the code

- **Claim:** The documentation inventory is wider than the code inventory. The structural agent's `S-4` stated that
  `clean` and `shell` are named "only in `index.ts`, their own source/test files, and `docs/cli.md`". That claim is
  **too narrow** — its grep was scoped to code, the `Makefile`, and `README.md`. This run's own sweep found four more
  documentation files naming them.
- **Location:** Repository-wide grep, excluding `node_modules`, `.git`, and `build`.
- **Evidence:** Files naming at least one of the three commands, and what must change in each:
  - `docs/cli.md` — the "Eight CLI commands" summary line, a Mermaid dispatch diagram with `shell`/`clean`/`setup`
    nodes, three Key Files rows, a delegation bullet, and three Testing rows.
  - `docs/skillwalker-architecture.md:35,81,107,120,392` — a package-node command list, a dependency edge label, a
    boundary paragraph, a command table row, and a dependency-graph bullet.
  - `docs/sandbox-integration.md:32,174,215,271,279` — a Mermaid node reading `clean · shell` / `sandbox-setup ·
    test-run`, a "Called by" line, an error-table row, and two setup-sequence steps.
  - `docs/sandbox-integration-package.md:75,113,149,181,192` — a pre-flight description, a Consumer line, a Mermaid
    node, a consumer-table row, and an error-table row.
  - `docs/skill-call-improvement-loop.md:27` and `docs/agent-call-improvement-loop.md:27` — a setup command block each.
  - `README.md:43` — the step-2 setup block.

  Two further files name the commands but are **historical records that must not be rewritten**:
  `docs/adrs/20260515000000-migrate-sandbox-cli-to-sbx.md` (see `C-12`), `docs/adrs/20260326084800-skip-permissions-in-test-sandbox.md:84`,
  and `docs/planning/bun-runtime-dependency-upgrade/artifacts/current-state-findings.md:556`, a prior planning run's
  record of the code as it stood then.

  `docs/getting-started/` contains no reference to any of the three commands.
- **Raised by:** the run's own sweep. Corrects structural-analyst `S-4`.
- **Confidence:** Verified.
- **Bears on:** S-9, D-5, D-6.

### C-12: The sbx migration ADR commits to keeping these exact command names stable

- **Claim:** An existing ADR records a decision that this change reverses. Its stated consequence becomes false when
  the hard cut lands.
- **Location:** `docs/adrs/20260515000000-migrate-sandbox-cli-to-sbx.md:3,14`.
- **Evidence:**
  > We will rename `@testdouble/docker-integration` to `@testdouble/sandbox-integration` and `DockerError` to
  > `SandboxError` at the same time, **while keeping user-facing Skillwalker commands such as `sandbox-setup`,
  > `shell`, and `clean` stable.**

  And under Consequences:
  > - Existing Skillwalker command names remain stable for users and scripts.

  The same ADR also supplies the precedent for a hard cut over a compatibility shim, in its rejected option:
  > **Compatibility adapter** — lower short-term risk for users with the old CLI, but adds branching around a retired
  > command and keeps outdated terminology in the codebase.

  The ADR carries no `**Status:**` field.
- **Raised by:** the run's own sweep.
- **Confidence:** Verified.
- **Bears on:** D-6.

### C-13: Builder bodies are already duplicated across the package

- **Claim:** Repeated builder logic is an existing, unaddressed pattern in this package, not something the
  consolidation introduces.
- **Location:** `packages/cli/src/commands/{clean,shell}.ts`, `{scil,acil}.ts`.
- **Evidence:** `clean.ts:8-10` and `shell.ts:7-9` have byte-identical bodies (`return yargs`). `scil.ts:9-28` and
  `acil.ts:9-29` define nine nearly identical `.option(...)` calls differing only in `--skill` versus `--agent` and
  describe wording. A `--repo-root` option of the same shape is defined separately in four modules.
- **Raised by:** structural-analyst `S-7`.
- **Confidence:** Verified.
- **Bears on:** Context for the YAGNI sweep. No delta entry.

### C-14: `createSandbox` and `openShell` never inspect their child process exit code

- **Claim:** Both can present exit code 0 to the shell even when the underlying `sbx` session failed. Pre-existing and
  independent of the rename; it carries forward unchanged under any new command name.
- **Location:** `packages/sandbox-integration/src/lifecycle.ts:37-63`.
- **Evidence:**
  ```ts
  const runProc = spawnSbx(['run', '--name', SANDBOX_NAME, 'claude', repoRoot], {
    stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
  })
  await runProc.exited
  process.stderr.write(`\nSandbox "${SANDBOX_NAME}" is ready. You can now run tests.\n`)
  ```
  `removeSandbox` (`lifecycle.ts:20-35`) is the exception — it checks `proc.exitCode` and throws a descriptive
  `SandboxError`. The behavioral agent verified `openShell` empirically: with no TTY, `sbx` printed
  `ERROR: the input device is not a TTY` and the process still exited 0.
- **Raised by:** behavioral-analyst `B-1`, `B-3`.
- **Confidence:** Verified by execution for `openShell`; verified by reading for `createSandbox`.
- **Bears on:** Pre-existing condition. Recorded as a deferral, not a delta entry.

## Findings No Agent Could Audit

- **The real `sbx` binary's behavior.** Neither agent could exercise the actual Test Sandbox lifecycle end to end
  (`sbx login`, `sbx run`, a real OAuth flow). Every claim about what `sbx` returns rests on reading `spawnSbx` call
  sites and on the mocked tests. Closing this would take a machine with an authenticated `sbx` and a disposable
  sandbox. Nothing in this change alters the arguments passed to `sbx`, so the exposure is low.
- **Bun's uncaught-exception stderr formatting.** Flagged inline on `C-7`. Closing it would take forcing an `ENOENT`
  by removing `sbx` from `PATH` and capturing the output.
- **Whether any user has scripted the flat command names.** No telemetry, no analytics on command invocation, and no
  way to inspect anyone's shell history or CI configuration outside this repository. Within the repository, `C-8` and
  `C-11` are the complete inventory of callers. Outside it, the exposure is unknowable from here.
