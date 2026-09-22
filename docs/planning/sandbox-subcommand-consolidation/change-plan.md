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
([D-1](artifacts/change-decision-log.md#d-1-old-flat-command-names-are-removed-outright)). Every place that told
someone to type one of them now names the new spelling instead: two thrown error messages, a stderr hint, a Makefile
recipe, the README, and six docs files.

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
its `builder` registers the three children and requires one of them. Its `handler` is an unreachable no-op that
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

**Target state.** A co-located unit test for the setup module, with three blocks following the shape the sibling
command tests use:

- `describe('sandbox setup command exports', ...)` pinning `command === 'setup'` and a non-empty `describe`.
- `describe('sandbox setup builder', ...)` asserting `options['repo-root']` matches
  `{ type: 'string', default: process.cwd() }`, built through the same local `buildOptions()` fake-yargs helper that
  `acil.test.ts:56-66`, `scil.test.ts`, and `test-run.test.ts` already use.
- `describe('sandbox setup handler', ...)` asserting the handler calls `createSandbox` with the resolved
  `--repo-root`.

**Behavior.** Preserving. Adding a test changes nothing a user observes.

**Why.** S-8 changes a literal that nothing currently pins, in the one command module with no co-located test
([C-6](artifacts/current-state-findings.md#c-6-tests-pin-command-as-an-exact-literal-and-sandbox-setup-has-no-test-at-all)).
`docs/coding-standards/test-file-organization.md` documents co-location as the project's convention. It carries
`Status: proposed` and says nothing about exemptions, so it is a convention this module was the sole gap against
rather than a rule it violated.

The builder block was added during the review round. `setup.ts` is the fourth module declaring a `--repo-root` option
of the same shape ([C-13](artifacts/current-state-findings.md#c-13-builder-bodies-are-already-duplicated-across-the-package))
and was the only one of the four not asserting its default. Verified during the build: deleting
`default: process.cwd()` from the builder fails this test and nothing else.

**Depends on.** S-8.

**Decision.** [D-8](artifacts/change-decision-log.md#d-8-the-setup-module-gains-the-co-located-test-it-never-had)

### S-10: Test Sandbox hint and error text in `@testdouble/sandbox-integration` — Re-scoped

**Target state.** The three user-facing strings name `sandbox setup`, and the conditions that produce each are
unchanged. The replacement text, in full:

```
lifecycle.ts:41   ./build/skillwalker sandbox setup
sandbox.ts:30     Unable to list sandboxes with sbx (exit code {n}): {stdout}{stderr}
                  Run `sbx login`, then retry `./build/skillwalker sandbox setup`.
sandbox.ts:45     Sandbox "claude-skills-skillwalker" not found. Run './build/skillwalker sandbox setup' first.
```

Each is the current string with `sandbox-setup` replaced by `sandbox setup`; no other word changes.

**Behavior.** Changing. The observer is anyone who hits a sandbox failure path. Settled by the user's answer:
"Everything, including docs." Without this entry, the most common failure message in the system would direct people to
a command that returns `Unknown argument`.

**Why.** These strings are the only place the CLI's command surface is named outside `packages/cli`, and nothing
enforces that they match a registered command
([C-5](artifacts/current-state-findings.md#c-5-three-hint-strings-inside-sandbox-integration-hardcode-the-flat-sandbox-setup-spelling)).

**Depends on.** S-3.

**Decision.** [D-3](artifacts/change-decision-log.md#d-3-the-rename-reaches-error-strings-the-makefile-the-readme-and-six-docs-files)

### S-11: The `Makefile` `sandbox-setup` target and the `README.md` setup step — Re-scoped

**Target state.** The Make target is still named `sandbox-setup` and still depends on `build`; its recipe invokes
`./build/skillwalker sandbox setup`. Running `make sandbox-setup` creates the Test Sandbox, as it does today.

The README's step-2 setup block at `README.md:43` reads `./build/skillwalker sandbox setup`. Someone following the
getting-started instructions from a clean checkout types a command that exists.

**Behavior.** Preserving. The observer is anyone running `make sandbox-setup` or following the README, and what they
get is unchanged. The target name is deliberately not renamed
([D-9](artifacts/change-decision-log.md#trivial-decisions)).

**Why.** Both invoke the compiled binary by command name, so both break at S-3 unless they change
([C-8](artifacts/current-state-findings.md#c-8-the-makefile-has-a-sandbox-setup-target-that-calls-the-binary-and-a-sandbox-clean-target-that-bypasses-it),
[C-11](artifacts/current-state-findings.md#c-11-six-documentation-files-name-these-commands-beyond-the-code)).

The README was named in this plan's opening paragraph and in Unit 3 from the start. However, an earlier draft of this
entry covered only the Makefile, leaving the README with no target state and no acceptance criterion. The review round
caught it. `C-11` lists the README as an item distinct from the six docs files Unit 4 covers, so it belongs here.

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

### S-13: `packages/cli/src/command-registration.integration.test.ts` — Added

**Target state.** An integration test that spawns the CLI entry point as a subprocess and asserts on what it prints.
It covers five things:

1. `sandbox` appears in the top-level command list.
2. `clean`, `shell`, and `sandbox-setup` do not.
3. A removed flat name exits 1 with `Unknown argument: clean`.
4. A bare `sandbox` lists all three sub-commands and exits 1.
5. An unknown sub-command exits 1.

It reads the command column of the help output rather than matching free text, so a command's description cannot be
mistaken for a registration.

It covers no success path. Those dispatch into `createSandbox`, `removeSandbox`, and `openShell`, which need a real or
faked `sbx`. Every assertion here short-circuits inside Yargs before any handler runs, so the test needs no sandbox and
introduces no flakiness.

The `.integration.test.ts` suffix routes it to `vitest.integration.config.ts`, per
`docs/coding-standards/test-file-organization.md`, because spawning a subprocess crosses a real process boundary.

**Behavior.** Preserving. Adding a test changes nothing a user observes.

**Why.** This plan's own top risk is a command that fails to register: the import paths in `index.ts` are plain string
literals with no static check, and nothing exercised `index.ts`
([Gaps](artifacts/current-state-findings.md#gaps)). That was recorded as a risk closed by a one-time manual check,
which leaves nothing behind for the next change. Verified during the build: pointing the `sandbox` registration at a
nonexistent module leaves all 938 unit tests passing and fails four of these five assertions.

**Depends on.** S-4.

**Decision.** [D-10](artifacts/change-decision-log.md#d-10-an-integration-test-guards-command-registration)

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

Everything else in the delta is behavior-preserving. `make sandbox-setup` still creates the sandbox (S-11). The two
moved modules keep their exports, and their tests pass unmodified (S-6, S-7). The added test and ADR change nothing a
user observes (S-9, S-12).

## Change Units

### Unit 1: Nest the three commands

**What it does.** Creates the parent command and moves the three children under it, so the CLI exposes
`sandbox setup`, `sandbox clean`, and `sandbox shell` and stops exposing the flat names.

**Delta entries.** S-1, S-2, S-3, S-4, S-5, S-6, S-7, S-8, S-9, S-13.

**Ordering constraint.** None before it; everything else depends on it. This unit **cannot be split** into "move the
files" and "rewire `index.ts`". The import paths in `index.ts` are plain string literals with no static check tying
them to real files, and nothing in the test suite exercises `index.ts` at all
([Gaps](artifacts/current-state-findings.md#gaps)). Either half alone is a commit where the CLI is broken and
`make test` still passes.

**How you know it worked.** `clean.test.ts` and `shell.test.ts` pass unmodified, and the unit count rises from 934
only by the tests this unit adds. `bun run test:integration` passes, including the five assertions S-13 adds. Each row
of the Target State table above reproduces against both `bun run packages/cli/index.ts` and the compiled
`./build/skillwalker`, including the exit codes. The compiled binary matters separately, because it is what the
Makefile and the README tell people to run.

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

- **A command that fails to register used to be invisible to the test suite.** Every command test mocks its delegate,
  and the import paths in `index.ts` are plain string literals with no static check. A typo there would pass the
  unit suite and break the built binary. Blast radius: the entire CLI, since `index.ts` is the single entry point.
  **Closed by S-13**, which spawns the entry point and asserts on registration. Measured: with the `sandbox`
  registration pointed at a nonexistent module, all 938 unit tests still pass and four of S-13's five assertions fail.
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

Each entry below failed one of two gates. The **evidence test** asks whether anything shows the item is needed now — a
stated need, a named dependency, a code path that breaks without it, or a measured problem. The **simpler-version
test** asks whether a strictly simpler structure satisfies that same evidence. Nothing here is rejected; each carries
the trigger that would reopen it.

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

### Enforcement tying the hint strings to the registered command names

**Why deferred:** Evidence test, on the fix rather than the problem. S-10 corrects today's instance of a naming
convention that two independently-editable packages must agree on, with no import relationship and no test tying them
together ([C-5](artifacts/current-state-findings.md#c-5-three-hint-strings-inside-sandbox-integration-hardcode-the-flat-sandbox-setup-spelling)).
The change therefore leaves the same unpinned contract it just fixed, reset to zero. A shared constant is not
available — `packages/sandbox-integration` does not depend on `packages/cli`, and inverting that dependency to share a
string would be a worse structure than the duplication. A test asserting the hint text names a registered command is
possible but needs a home in neither package's natural boundary.
**Reopen when:** The strings drift again — that is, the next time a sandbox command is renamed — or a second class of
cross-package user-facing string appears and the pair justifies a shared mechanism.
**Source:** `han-core:junior-developer`, Step 7 review round.

### A `.fail()` handler mapping retired command names to their new spelling

**Why deferred:** The recorded boundary answers it. The review round observed that `Unknown argument: clean` tells
someone what is wrong but not where the command went. It proposed a small lookup table in a Yargs `.fail()` callback
printing one extra line. The user was shown this exact behavior when choosing the hard cut. The option they selected
was described as "typing `clean` fails with Yargs' 'Unknown argument' error and the help listing," and they chose it.
The same handler would also replace `Not enough non-option arguments: got 0, need at least 1` on a bare `sandbox` with
plain language.
**Reopen when:** Someone reports being unable to find a moved command, which is the evidence this currently lacks.
**Source:** `han-core:user-experience-designer` UX-1 and UX-6, Step 7 review round.

### Making the `sbx ls` failure hint name the command the user ran

**Why deferred:** Evidence test. That message always recommends `sandbox setup`, but it is reachable from
`sandbox shell`, `scil`, `acil`, and eval runs. Someone running `sandbox shell` is told to retry a command that is
not what they wanted. Pre-existing — the same context-independence existed under the flat name, and S-10 changed only
the spelling. A real fix needs the throw site to know its caller, which is a structural change a rename does not
reach. The message's primary instruction, `sbx login`, is correct in every calling context.
**Reopen when:** Someone reports following the hint and getting nowhere.
**Source:** `han-core:user-experience-designer` UX-3, Step 7 review round.

### Naming the sub-commands in the `sandbox` parent's description

**Why deferred:** Evidence test. Top-level help now shows `Manage the Test Sandbox` where it previously showed the
words `shell`, `clean`, and `setup`, so someone scanning for "shell" has to go one level in. Widening the description
to something like `Manage the Test Sandbox (setup, clean, shell)` would restore that at no cost, but nothing indicates
anyone has been lost. `skillwalker sandbox --help` exits 0 and lists all three, so the extra hop is cheap.
**Reopen when:** Someone reports not finding a sandbox command after the change.
**Source:** `han-core:user-experience-designer` UX-5, Step 7 review round.

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

None blocking.

One non-blocking item the builder inherits: **S-13 covers registration, not dispatch.** Its assertions all
short-circuit inside Yargs before a handler runs, so nothing automated proves that `sandbox setup` reaches
`createSandbox` in the built binary. Closing that needs a fake `sbx` on `PATH`, which is a materially larger piece of
work than this change calls for. The handler-level unit tests pin the delegation, and the Target State table was run
by hand against the compiled binary, so the gap is narrow. But it is real, and it is the seam a future sandbox change
should close.

## Review Findings

Three specialists reviewed the plan in one round: `han-core:junior-developer` as generalist stress-tester,
`han-core:user-experience-designer` on the command surface, and `han-core:test-engineer` on what pins the preserved
behavior. Each verified its findings against the working tree rather than the plan's description of it, and two of
them executed the CLI themselves. Nothing was labeled `Unverified` in a way that would have carried blocking severity.

Findings that changed the plan:

| Finding | Raised by | What changed |
| --- | --- | --- |
| The README was promised in the opening paragraph and in Unit 3, but had no delta entry or acceptance criterion | junior-developer | S-11 extended to cover it explicitly |
| S-9's citation claimed the test-organization standard "states no per-file exemptions"; it says no such thing and is itself `Status: proposed` | junior-developer | Corrected in S-9, D-8, and the findings' Gaps section |
| The registration risk was closed by a one-time manual check that leaves nothing behind | test-engineer | S-13 added, with a measured demonstration that it catches the failure |
| `setup.ts` was the only one of four modules declaring `--repo-root` without asserting its default | test-engineer | S-9 gained a builder block, verified to fail when the default is deleted |
| S-10 quoted the strings being replaced but gave no worked example of the replacement text | test-engineer | S-10 now pins all three replacement strings in full |
| C-5 stated a call graph that does not hold — `clean` and `setup` never reach `ensureSandboxExists` | user-experience-designer | Corrected in C-5; the frequency claim survives and strengthens |
| The unpinned hint-string contract is reintroduced rather than closed | junior-developer | Recorded as a deferral with its reopening trigger |
| Four usability observations on the new surface | user-experience-designer | Three recorded as deferrals; one recorded below as an open recommendation |

Findings deliberately not acted on:

- **D-6's file-layout decision was challenged as a YAGNI candidate** under the symmetry anti-pattern, on the grounds
  that a simpler version exists. That version would leave `clean.ts` and `shell.ts` at their flat paths, rename
  `sandbox-setup.ts` in place, and have the parent import all three flat. The challenge is partly sustained: D-6's original rationale never
  ran the simpler-version test, and never recorded the flat alternative. D-6 now records it. The subdirectory is kept,
  because its justification rests on `C-4` — an existing cohesion in the import graph — rather than on symmetry alone.
  This is the one place the change went past the minimum the recorded reason required, and it is reversible.
- **`lifecycle.ts:40` still reads `sbx rm --force claude-skills-skillwalker`**, one line above the hint S-10 rewrote.
  It instructs someone to bypass the CLI to do what `sandbox clean` now does, which sits awkwardly beside this
  change's own "one spelling per action" premise. Left alone deliberately: a raw `sbx` call is the more reliable
  recovery instruction precisely when the sandbox is in a bad state. Swapping it would change what the message
  tells people to do, rather than what it calls a command. Surfaced as a recommendation rather than absorbed.
- **D-7's claim that the parent's empty `handler` is "required rather than chosen"** was challenged as resting on a
  `@types/yargs` 17 declaration against a Yargs 18 runtime. Settled by measurement instead of argument: deleting the
  export fails `tsc --noEmit` with `TS2769` against the types this project installs. The claim stands.

The decisions each finding produced are recorded in
[`artifacts/change-decision-log.md`](artifacts/change-decision-log.md).
