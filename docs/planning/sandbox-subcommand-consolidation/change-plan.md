# Change Plan: Sandbox Sub-command Consolidation

## Why This Change

Three commands that all manage the Test Sandbox sit flat in the CLI alongside the eval commands, so nothing in the
command list shows they belong together. This change groups them under one `sandbox` parent, giving
`skillwalker sandbox setup`, `skillwalker sandbox clean`, and `skillwalker sandbox shell`.

The recorded reason is **a deliberate improvement with no triggering event**. Nothing is broken, no defect prompted
this, and no prior report exists. The source is the user's own request, quoted in full in
[`artifacts/scope-boundary.md`](artifacts/scope-boundary.md#stated-scope).

## What Changes, In One Paragraph

After this change the CLI has one command that owns the Test Sandbox lifecycle instead of three scattered ones. The
`sandbox` command answers for grouping and dispatch and nothing else — it holds no logic of its own, and each of its
three children does exactly what it does today. The old flat spellings stop working outright
([D-1](artifacts/change-decision-log.md#d-1-old-flat-command-names-are-removed-outright)), so every place that told
someone to type one of them — two thrown error messages, a stderr hint, a Makefile recipe, the README, and six docs
files — names the new spelling instead.

## Current State

Eight commands are registered flat in `packages/cli/index.ts`, each passed to Yargs as a whole imported module that
structurally matches `CommandModule` ([C-2](artifacts/current-state-findings.md#c-2-indexts-registers-every-module-flat-via-dynamic-import-under-strict)).
Every command module exports the same four bindings — `command`, `describe`, `builder`, `handler` — and no module
deviates from that shape ([C-1](artifacts/current-state-findings.md#c-1-the-command-module-contract-is-uniform-across-all-eight-modules)).

The structural property this change addresses is that **the grouping exists in the import graph but not in the command
surface**. The three sandbox commands are already the only three that import nothing from `../paths.js` and depend on
exactly one package, `@testdouble/sandbox-integration`
([C-4](artifacts/current-state-findings.md#c-4-the-three-moving-commands-have-almost-no-incoming-coupling)). They are a
cluster in every respect except the one a user sees.

Three facts shape how the change has to be carried out:

- **Nesting has no precedent here.** No command module's `builder` registers children, anywhere in the repository
  ([C-3](artifacts/current-state-findings.md#c-3-no-nested-or-multi-level-command-exists-anywhere-in-the-codebase)).
  The pattern is being introduced, not followed.
- **Three hint strings hardcode the flat `sandbox-setup` spelling**, inside a package that has no import relationship
  to the CLI, so nothing enforces that they match a real command
  ([C-5](artifacts/current-state-findings.md#c-5-three-hint-strings-inside-sandbox-integration-hardcode-the-flat-sandbox-setup-spelling)).
  All three print on failure paths.
- **Nothing exercises the CLI end to end.** Every command test imports its module directly with the delegate mocked,
  so no test would catch a command that fails to register
  ([Gaps](artifacts/current-state-findings.md#gaps)).

## Target State

`packages/cli/src/commands/sandbox.ts` is a parent command that owns grouping and dispatch. It holds no sandbox logic:
its `builder` registers the three children and requires one of them, and its `handler` is an unreachable no-op that
exists only because Yargs' `CommandModule` type declares `handler` non-optional
([D-7](artifacts/change-decision-log.md#d-7-the-parent-module-imports-its-children-statically)).

The three children live in `packages/cli/src/commands/sandbox/`, beside the parent file rather than inside a directory
the parent also occupies ([D-6](artifacts/change-decision-log.md#d-6-the-three-children-move-into-a-commandssandbox-subdirectory)).
Each child keeps the same four-export contract every other command module follows, and each keeps delegating to the
single `@testdouble/sandbox-integration` function it calls today.

**The parent module contract, pinned:**

```ts
// packages/cli/src/commands/sandbox.ts
import type { Argv } from 'yargs'
import * as clean from './sandbox/clean.js'
import * as setup from './sandbox/setup.js'
import * as shell from './sandbox/shell.js'

export const command = 'sandbox'
export const describe = 'Manage the Test Sandbox'

export function builder(yargs: Argv): Argv {
  return yargs.command(setup).command(clean).command(shell).demandCommand(1)
}

export async function handler(): Promise<void> {}
```

`command` is the bare string `'sandbox'`, not `'sandbox <command>'`. That is pinned from observed output, not chosen:
the probe rendered the help line as `skillwalker sandbox  Manage the Test Sandbox` with no positional placeholder
([C-9](artifacts/current-state-findings.md#c-9-nested-yargs-commands-work-under-strict-and-removing-a-flat-name-produces-exit-1)).

**The observable CLI surface after the change**, verified by executing a probe rather than inferred from documentation
([C-9](artifacts/current-state-findings.md#c-9-nested-yargs-commands-work-under-strict-and-removing-a-flat-name-produces-exit-1)):

| What a user types | What they get | Exit |
| --- | --- | --- |
| `skillwalker sandbox setup --repo-root <path>` | creates the sandbox; `--repo-root` arrives intact through both levels | 0 |
| `skillwalker sandbox clean` | removes the sandbox | 0 |
| `skillwalker sandbox shell` | opens the interactive shell | 0 |
| `skillwalker sandbox` | the three sub-commands listed, then `Not enough non-option arguments: got 0, need at least 1` | 1 |
| `skillwalker sandbox bogus` | sub-command list, then `Unknown argument: bogus` | 1 |
| `skillwalker clean` (removed spelling) | command list, then `Unknown argument: clean` | 1 |

## Surface Delta

### S-1: `skillwalker clean` — Removed

**Target state.** There is no top-level `clean` command. Removing the Test Sandbox is `skillwalker sandbox clean`.

**Behavior.** Changing. Anyone typing `skillwalker clean` gets `Unknown argument: clean` and exit 1. Settled by the
user's answer in the confirmation turn: "Hard cut, old names gone."

**Why.** The consolidation's point is one spelling per action. Keeping the flat name would leave two.

**Decision.** [D-1](artifacts/change-decision-log.md#d-1-old-flat-command-names-are-removed-outright)

### S-2: `skillwalker shell` — Removed

**Target state.** There is no top-level `shell` command. Opening a shell in the sandbox is `skillwalker sandbox shell`.

**Behavior.** Changing. Same observable as S-1, with `shell` substituted. Settled by the same user answer.

**Why.** As S-1.

**Decision.** [D-1](artifacts/change-decision-log.md#d-1-old-flat-command-names-are-removed-outright)

### S-3: `skillwalker sandbox-setup` — Removed

**Target state.** There is no top-level `sandbox-setup` command. Creating the sandbox is `skillwalker sandbox setup`.

**Behavior.** Changing. Same observable as S-1. This is the one of the three with callers outside the CLI package: the
`Makefile` recipe (S-11) and three hint strings (S-10) both name it.

**Why.** As S-1.

**Decision.** [D-1](artifacts/change-decision-log.md#d-1-old-flat-command-names-are-removed-outright)

### S-4: `skillwalker sandbox` — Added

**Target state.** `sandbox` is a command that groups the three Test Sandbox operations and dispatches to them. It
performs no sandbox work itself; invoked bare, it lists its children and exits 1.

**Behavior.** Changing. A new command appears in `--help`, collapsing three former entries into one line reading
`skillwalker sandbox  Manage the Test Sandbox`.

**Why.** It is the grouping the change exists to create.

**Depends on.** S-5.

**Decision.** [D-1](artifacts/change-decision-log.md#d-1-old-flat-command-names-are-removed-outright)

### S-5: `packages/cli/src/commands/sandbox.ts` — Added

**Target state.** A command module exporting `command`, `describe`, `builder`, and `handler`, matching the contract
every other command module follows ([C-1](artifacts/current-state-findings.md#c-1-the-command-module-contract-is-uniform-across-all-eight-modules)).
Its `builder` statically imports the three children and registers them with `demandCommand(1)`. Its `handler` is an
empty async function, unreachable because `demandCommand(1)` rejects a bare invocation before dispatch. The full
contract is pinned under Target State above.

**Behavior.** Preserving. The module is new and nothing observes it directly; what a user sees is S-4.

**Why.** Yargs nests by registering children inside a parent's `builder`, so the parent must exist as a module.

**Decision.** [D-7](artifacts/change-decision-log.md#d-7-the-parent-module-imports-its-children-statically)

### S-6: `packages/cli/src/commands/clean.ts` — Moved

**Target state.** The module lives at `packages/cli/src/commands/sandbox/clean.ts`. Its four exports are byte-for-byte
what they are today, including `export const command = 'clean'`. Its co-located test moves with it, unmodified.

**Behavior.** Preserving. The module's exports are unchanged, and `clean.test.ts`'s `expect(command).toBe('clean')`
passes without edit ([C-6](artifacts/current-state-findings.md#c-6-tests-pin-command-as-an-exact-literal-and-sandbox-setup-has-no-test-at-all)).
The CLI-level change a user sees is recorded at S-1, not here.

**Why.** Nesting comes from where a module is registered, not from its own `command` string, so the move needs no
edit to the module itself.

**Depends on.** S-5.

**Decision.** [D-6](artifacts/change-decision-log.md#d-6-the-three-children-move-into-a-commandssandbox-subdirectory)

### S-7: `packages/cli/src/commands/shell.ts` — Moved

**Target state.** The module lives at `packages/cli/src/commands/sandbox/shell.ts`, with its four exports unchanged,
including `export const command = 'shell'`. Its co-located test moves with it, unmodified.

**Behavior.** Preserving. As S-6, with `shell` substituted.

**Why.** As S-6.

**Depends on.** S-5.

**Decision.** [D-6](artifacts/change-decision-log.md#d-6-the-three-children-move-into-a-commandssandbox-subdirectory)

### S-8: `packages/cli/src/commands/sandbox-setup.ts` — Moved

**Target state.** The module lives at `packages/cli/src/commands/sandbox/setup.ts`, and its `command` export is the
literal `'setup'`. Its `describe`, `builder`, and `handler` are unchanged, including the `--repo-root` option and its
`process.cwd()` default. This entry names both the move and the rename, rather than splitting them, because the two are
one edit to one file.

**Behavior.** Changing, at the module level: the `command` export's value differs. No test observes it today, because
this is the one command module with no co-located test
([C-6](artifacts/current-state-findings.md#c-6-tests-pin-command-as-an-exact-literal-and-sandbox-setup-has-no-test-at-all));
S-9 adds one. The CLI-level change is recorded at S-3.

**Why.** `sandbox-setup` nested under `sandbox` would read as `skillwalker sandbox sandbox-setup`. The verb alone is
what remains, and the user chose `setup` over `create`.

**Depends on.** S-5.

**Decision.** [D-2](artifacts/change-decision-log.md#d-2-the-setup-sub-command-is-spelled-setup-not-create)

### S-9: `packages/cli/src/commands/sandbox/setup.test.ts` — Added

**Target state.** A co-located unit test for the setup module, following the shape every other command test uses:
`describe('sandbox setup command exports', ...)` pinning `command === 'setup'` and a non-empty `describe`, and
`describe('sandbox setup handler', ...)` asserting the handler calls `createSandbox` with the resolved `--repo-root`.

**Behavior.** Preserving. Adding a test changes nothing a user observes.

**Why.** S-8 changes a literal that nothing currently pins. The project's own coding standard requires co-located
tests and states no per-file exemptions, and this module is the one gap against it
([C-6](artifacts/current-state-findings.md#c-6-tests-pin-command-as-an-exact-literal-and-sandbox-setup-has-no-test-at-all)).

**Depends on.** S-8.

**Decision.** [D-8](artifacts/change-decision-log.md#d-8-the-setup-module-gains-the-co-located-test-it-never-had)

### S-10: Test Sandbox hint and error text in `@testdouble/sandbox-integration` — Re-scoped

**Target state.** The three user-facing strings name `sandbox setup`. Specifically: the stderr hint at
`lifecycle.ts:41` printed when the sandbox already exists; the `SandboxError` message at `sandbox.ts:30` thrown when
`sbx ls --quiet` exits non-zero; and the `SandboxError` message at `sandbox.ts:45` thrown when the named sandbox is
absent. The conditions that produce each are unchanged — only the command the text names changes.

**Behavior.** Changing. The observer is anyone who hits a sandbox failure path. Settled by the user's answer:
"Everything, including docs." Without this entry, the most common failure message in the system would direct people to
a command that returns `Unknown argument`.

**Why.** These strings are the only place the CLI's command surface is named outside `packages/cli`, and nothing
enforces that they match a registered command
([C-5](artifacts/current-state-findings.md#c-5-three-hint-strings-inside-sandbox-integration-hardcode-the-flat-sandbox-setup-spelling)).

**Depends on.** S-3.

**Decision.** [D-3](artifacts/change-decision-log.md#d-3-the-rename-reaches-error-strings-the-makefile-the-readme-and-six-docs-files)

### S-11: The `Makefile` `sandbox-setup` target — Re-scoped

**Target state.** The target is still named `sandbox-setup` and still depends on `build`. Its recipe invokes
`./build/skillwalker sandbox setup`. Running `make sandbox-setup` creates the Test Sandbox, as it does today.

**Behavior.** Preserving. The observer is anyone running `make sandbox-setup`, and what they get is unchanged. The
target name is deliberately not renamed
([D-9](artifacts/change-decision-log.md#trivial-decisions)).

**Why.** The recipe invokes the compiled binary by command name, so it breaks at S-3 unless it changes
([C-8](artifacts/current-state-findings.md#c-8-the-makefile-has-a-sandbox-setup-target-that-calls-the-binary-and-a-sandbox-clean-target-that-bypasses-it)).

**Depends on.** S-3.

**Decision.** [D-3](artifacts/change-decision-log.md#d-3-the-rename-reaches-error-strings-the-makefile-the-readme-and-six-docs-files)

### S-12: A new ADR recording this decision — Added

**Target state.** An ADR under `docs/adrs/` records the consolidation and the hard cut, and
`20260515000000-migrate-sandbox-cli-to-sbx.md` carries a status marking it superseded with respect to its
command-name-stability consequence. That record's own decision text is unchanged, because it was accurate about the
migration it described.

**Behavior.** Preserving. Nothing executes an ADR.

**Why.** An existing decision record states "Existing Skillwalker command names remain stable for users and scripts,"
which this change makes untrue
([C-12](artifacts/current-state-findings.md#c-12-the-sbx-migration-adr-commits-to-keeping-these-exact-command-names-stable)).

**Depends on.** S-1.

**Decision.** [D-4](artifacts/change-decision-log.md#d-4-a-new-adr-records-this-decision-superseding-the-sbx-records-stability-consequence)

## Behavior Changes

Six entries change something observable. Every one was settled by the user before it was committed, and none is a
side effect the plan discovered afterwards.

1. **The three old command names stop working** (S-1, S-2, S-3). Someone who types `./build/skillwalker clean` today
   removes the sandbox. Afterwards they get the command list, the line `Unknown argument: clean`, and exit code 1.
   The same holds for `shell` and `sandbox-setup`. **User's decision:** "Hard cut, old names gone." No aliases and no
   deprecation warnings.
2. **A new grouped command appears** (S-4). `skillwalker --help` shows one line, `skillwalker sandbox  Manage the
   Test Sandbox`, where it previously showed three separate entries. Typing `skillwalker sandbox` with nothing after
   it lists the three sub-commands and exits 1.
3. **The setup verb keeps its spelling but moves position** (S-8). `skillwalker sandbox-setup` becomes
   `skillwalker sandbox setup`. **User's decision**, reversing an earlier answer within the same turn: "ah, make the
   sub-command "sandbox setup" then."
4. **Three failure messages name a different command** (S-10). The most frequently seen is the one thrown when the
   sandbox does not exist, which currently reads `Sandbox "claude-skills-skillwalker" not found. Run
   './build/skillwalker sandbox-setup' first.` **User's decision:** "Everything, including docs."

Everything else in the delta is behavior-preserving. `make sandbox-setup` still creates the sandbox (S-11), the two
moved modules keep their exports and their tests pass unmodified (S-6, S-7), and the added test and ADR change nothing
a user observes (S-9, S-12).

## Change Units

### Unit 1: Nest the three commands

**What it does.** Creates the parent command and moves the three children under it, so the CLI exposes
`sandbox setup`, `sandbox clean`, and `sandbox shell` and stops exposing the flat names.

**Delta entries.** S-1, S-2, S-3, S-4, S-5, S-6, S-7, S-8, S-9.

**Ordering constraint.** None before it; everything else depends on it. This unit **cannot be split** into "move the
files" and "rewire `index.ts`". The import paths in `index.ts` are plain string literals with no static check tying
them to real files, and nothing in the test suite exercises `index.ts` at all
([Gaps](artifacts/current-state-findings.md#gaps)), so either half alone is a commit where the CLI is broken and
`make test` still passes.

**How you know it worked.** `bun run vitest run --config vitest.config.ts` passes at 934 tests, the same count as
before the change, with `clean.test.ts` and `shell.test.ts` unmodified. `bun run packages/cli/index.ts --help` lists
`sandbox` and does not list `clean`, `shell`, or `sandbox-setup`. Each row of the Target State table above reproduces,
including the exit codes.

### Unit 2: Correct the failure messages

**What it does.** Updates the three strings in `@testdouble/sandbox-integration` so a sandbox failure directs people
at a command that exists.

**Delta entries.** S-10.

**Ordering constraint.** After Unit 1. Before Unit 1 lands, these strings are correct as they stand.

**How you know it worked.** `bun run vitest run --config vitest.config.ts` still passes, and no string matching
`skillwalker sandbox-setup` remains in `packages/sandbox-integration/src/`.

### Unit 3: Update the Makefile and README

**What it does.** Points the `sandbox-setup` Make target and the README's setup step at the new spelling.

**Delta entries.** S-11.

**Ordering constraint.** After Unit 1, for the same reason as Unit 2.

**How you know it worked.** The recipe line reads `./build/skillwalker sandbox setup`, and the target name and its
`build` dependency are unchanged.

### Unit 4: Update the documentation

**What it does.** Updates the six docs files that name these commands — the prose, the tables, and the Mermaid node
labels inventoried in
[C-11](artifacts/current-state-findings.md#c-11-six-documentation-files-name-these-commands-beyond-the-code).

**Delta entries.** None; this unit carries no code surface.

**Ordering constraint.** After Unit 1, for accuracy. Nothing depends on it.

**How you know it worked.** No occurrence of `skillwalker sandbox-setup`, `skillwalker clean`, or `skillwalker shell`
survives outside the two ADRs and the prior planning run's findings file, which are historical records left intact.

### Unit 5: Record the decision

**What it does.** Adds the new ADR and marks the sbx migration record superseded with respect to its
command-stability consequence.

**Delta entries.** S-12.

**Ordering constraint.** After Unit 1, so the ADR describes something that exists.

**How you know it worked.** The new ADR exists under `docs/adrs/` following the project's template, and the sbx record
carries a status line it previously lacked.

## Risks

- **A command that fails to register is invisible to the test suite.** Nothing exercises `index.ts`, and every command
  test mocks its delegate, so a typo in one of the dynamic-import path strings would pass `make test` and break the
  built binary. Detected early by running the Target State table by hand at the end of Unit 1; that check is the only
  thing standing in for the integration test this repository does not have. Blast radius: the entire CLI, since
  `index.ts` is the single entry point.
- **The hard cut reaches outside the repository.** `C-8` and `C-11` are the complete inventory of callers *inside* the
  repository, and after Units 1 through 4 none of them names a removed command. Anyone's shell alias, personal script,
  or CI job that invokes a flat name is outside what this run can see, and it breaks with `Unknown argument` and exit
  1. Not detectable from here; named so the choice stays visible.
- **`--repo-root` is the one option crossing the new nesting boundary.** Verified to arrive intact through two levels
  ([C-9](artifacts/current-state-findings.md#c-9-nested-yargs-commands-work-under-strict-and-removing-a-flat-name-produces-exit-1),
  [C-10](artifacts/current-state-findings.md#c-10---repo-root-parsing-does-not-depend-on-the-command-sitting-at-the-top-level)),
  so the risk is low, but it is the only argument-parsing behavior the change could plausibly disturb. Detected by the
  `sandbox setup --repo-root` row of the Target State table.

## Deferred (YAGNI)

### A shared `CommandModule` base type, or a barrel file for `commands/sandbox/`

**Why deferred:** Simpler-version test. No module among the eight declares a shared type today — all eight rely on
structural typing ([C-1](artifacts/current-state-findings.md#c-1-the-command-module-contract-is-uniform-across-all-eight-modules)).
A barrel would be one more file re-exporting three imports the parent can name directly.
**Reopen when:** A second nested parent command exists and the loose-export pattern causes a defect a shared type
would have caught.
**Source:** `han-core:software-architect`, Step 4.

### Collapsing the duplicated `builder` bodies

**Why deferred:** Evidence test. `clean.ts` and `shell.ts` have byte-identical `return yargs` bodies, and a
`--repo-root` option of the same shape is defined in four separate modules
([C-13](artifacts/current-state-findings.md#c-13-builder-bodies-are-already-duplicated-across-the-package)). This
duplication predates the change and is not what the change is for; absorbing it would enlarge the diff without the
recorded reason asking for it.
**Reopen when:** A fifth module needs the same `--repo-root` definition, or the definitions drift apart in a way that
produces a real defect.
**Source:** `han-core:structural-analyst` C-13; confirmed as a non-goal by `han-core:software-architect`.

### Normalizing the error-handling asymmetry across the three commands

**Why deferred:** Evidence test. `clean` rewraps `SandboxError` into `SkillwalkerError` so `index.ts` prints a clean
one-line message; `shell` and `setup` do not, so the same class of failure surfaces as a raw stack trace
([C-7](artifacts/current-state-findings.md#c-7-clean-normalizes-sandboxerror-shell-and-sandbox-setup-do-not)).
Real, and pre-existing. Moving files neither causes nor fixes it, and the recorded reason does not reach it.
**Reopen when:** Someone reports a confusing stack trace from `sandbox shell` or `sandbox setup`, or the error
hierarchy is revisited for its own sake.
**Source:** `han-core:behavioral-analyst` B-4, recorded as C-7.

### Making `createSandbox` and `openShell` check their child process exit codes

**Why deferred:** Evidence test. Both can report exit 0 when the underlying `sbx` session failed; `openShell` was
observed exiting 0 after `sbx` printed `ERROR: the input device is not a TTY`
([C-14](artifacts/current-state-findings.md#c-14-createsandbox-and-openshell-never-inspect-their-child-process-exit-code)).
This is a genuine defect, it is pre-existing, and it carries forward unchanged under any command name. It is not this
change's to fix.
**Reopen when:** A failed sandbox creation is mistaken for a successful one, or CI needs a reliable exit code from
either command.
**Source:** `han-core:behavioral-analyst` B-1 and B-3, recorded as C-14.

## Cut for Scope

### Reconciling `make sandbox-clean` with `skillwalker sandbox clean`

**What it would have done.** The Makefile's `sandbox-clean` target shells out to `sbx rm --force
claude-skills-skillwalker` directly, bypassing the binary, and re-types the sandbox name as a literal with no shared
source ([C-8](artifacts/current-state-findings.md#c-8-the-makefile-has-a-sandbox-setup-target-that-calls-the-binary-and-a-sandbox-clean-target-that-bypasses-it)).
Now that the CLI has a `sandbox clean`, having `make sandbox-clean` do a different thing by a different mechanism is
more confusing than it was. This entry would have pointed the target at the binary.

**Why it was cut.** The recorded boundary asks to consolidate three CLI commands
([Stated Scope](artifacts/scope-boundary.md#stated-scope)). It does not ask to change what a Make target does, and
`make sandbox-clean` works the same before and after this change. The divergence predates the consolidation.

### Renaming the `sandbox-setup` Make target

**What it would have done.** Renamed the target so `make` and the CLI use matching words.

**Why it was cut.** Nothing in the boundary asks for it, and the coupling point is the recipe line, not the target
name ([C-8](artifacts/current-state-findings.md#c-8-the-makefile-has-a-sandbox-setup-target-that-calls-the-binary-and-a-sandbox-clean-target-that-bypasses-it)).
Renaming it would break anyone's muscle memory and any script calling `make sandbox-setup` for a symmetry argument
with no finding behind it ([D-9](artifacts/change-decision-log.md#trivial-decisions)).

Either of these can be reinstated. Saying so is itself a valid justification, and the reinstated entry records it.

## Open Items

None blocking. One non-blocking item the builder inherits: **no test exercises the CLI end to end**, so the Target
State table has to be run by hand at the end of Unit 1. Adding an integration test that spawns the built binary would
close it permanently, and it is outside this change's recorded reason.

## Review Findings

To be completed by the Step 7 review round.
