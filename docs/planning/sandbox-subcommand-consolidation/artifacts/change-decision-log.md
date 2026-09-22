# Change Decision Log: Sandbox Sub-command Consolidation

<!--
This file records every decision committed while planning the sandbox sub-command consolidation.
The plan itself lives in [../change-plan.md](../change-plan.md) — this file captures the
question, rationale, evidence, and rejected alternatives behind each decision.
Evidence about the code as it stands today lives in
[current-state-findings.md](current-state-findings.md) as numbered C-N findings.
-->

## Trivial decisions

- D-5: Plan and implementation land on one branch — the branch `consolidate-sandbox-subcommands` carries the planning
  artifacts and the code change, and opens as a single draft pull request. Directly supplied by the user's answer in
  the confirmation turn. — Referenced in plan: Change Units.
- D-9: Makefile target names are left as they are — the `sandbox-setup` target keeps its name and only the command it
  invokes changes. Renaming a Make target is not asked for anywhere in the recorded boundary, and `make sandbox-setup`
  keeps working either way. — Referenced in plan: Surface Delta.

## Full decisions

### D-1: Old flat command names are removed outright

- **Question:** After the three commands move under a `sandbox` parent, do the flat names `sandbox-setup`, `clean`,
  and `shell` keep working?
- **Decision:** No. They are removed from `index.ts` entirely. There are no aliases and no deprecation warnings. A
  user who types `./build/skillwalker clean` gets Yargs' command listing followed by `Unknown argument: clean`, and
  the process exits 1. Verified by execution, not inferred — see `C-9`.
- **Rationale:** The user chose this directly. It also matches the precedent the project set in its own sbx migration
  record, which rejected a compatibility adapter on the grounds that it "adds branching around a retired command and
  keeps outdated terminology in the codebase" (`C-12`).
- **Evidence:** User input, verbatim from the confirmation turn: "Hard cut, old names gone." Corroborated by `C-9`
  (the observed failure output and exit code) and `C-12` (the project's own stated preference for hard cuts).
- **Behavior impact:** **Changing.** The observer is anyone who types one of the three old command names, or any
  script or shell alias that does. They get a non-zero exit and an unknown-argument error where they previously got
  the command. The user's answer: "Hard cut, old names gone."
- **Rejected alternatives:**
  - Hidden aliases keeping both spellings working — rejected because the user declined it, and because it leaves the
    CLI carrying two spellings of every command with no removal date.
  - A deprecation warning on the old spelling — rejected because the user declined it, and because it defers a second
    decision (when the warning becomes a removal) that nothing in the boundary asks to open.
- **Revisit criterion:** If someone reports a broken script or CI job that invoked a flat name, the aliases become
  cheap to add and this decision is worth reopening.
- **Dissent (if any):** None recorded.
- **Settles delta entry:** S-1, S-2, S-3, S-4.
- **Dependent decisions:** D-3, D-4.
- **Referenced in plan:** Why This Change, Surface Delta, Behavior Changes.

### D-2: The setup sub-command is spelled `setup`, not `create`

- **Question:** The user's original request named a command `sandbox-create` that does not exist; the real one is
  `sandbox-setup` (`C-5`). Which verb does the sub-command carry?
- **Decision:** `setup`. The full spelling is `skillwalker sandbox setup`. The module's `command` export changes from
  `'sandbox-setup'` to `'setup'` and nothing else about the command's name changes.
- **Rationale:** The user initially accepted `create`, then reversed it within the same turn. The correction governs.
  The practical effect is that this entry becomes a pure move rather than a move plus a rename, which removes the one
  entry that would have changed a name a user types beyond the nesting itself.
- **Evidence:** User input. The correction, verbatim: "ah, make the sub-command "sandbox setup" then". The premise
  that prompted the question is `C-5` and the `command` export at `packages/cli/src/commands/sandbox-setup.ts:4`.
- **Behavior impact:** **Changing**, but only as a consequence of D-1. The observer is a user typing the command. The
  verb they type is unchanged; its position moves from `skillwalker sandbox-setup` to `skillwalker sandbox setup`.
- **Rejected alternatives:**
  - `sandbox create` — rejected by the user's own correction. It would have read more evenly beside `clean` and
    `shell` and matched the underlying `createSandbox` function name (`C-4`), but it renames a verb users already
    know for no reason the boundary records.
- **Revisit criterion:** If the underlying `createSandbox` function is ever renamed, the pairing argument for
  `create` returns.
- **Dissent (if any):** None recorded.
- **Settles delta entry:** S-8.
- **Dependent decisions:** D-8.
- **Referenced in plan:** Surface Delta, Behavior Changes.

### D-3: The rename reaches error strings, the Makefile, the README, and six docs files

- **Question:** How far past `packages/cli` does the change reach?
- **Decision:** Everything that names a command a user could type is updated. That is: the three hint strings in
  `packages/sandbox-integration` (`C-5`), the `Makefile` `sandbox-setup` target body (`C-8`), `README.md:43`, and the
  six documentation files inventoried in `C-11`. Historical records are **not** rewritten — the two ADRs and the prior
  planning run's findings file keep their text, per D-4.
- **Rationale:** The user chose the widest of three offered reaches. The strongest independent support is `C-5`: all
  three hint strings are printed on failure paths, and after the cut they would instruct a user to run a command that
  produces `Unknown argument`. A failure message that sends someone to a non-existent command is worse than no message.
- **Evidence:** User input, verbatim: "Everything, including docs." Corroborated by `C-5` (the three strings and the
  conditions that print them), `C-8` (the Makefile target that invokes the binary), and `C-11` (the documentation
  inventory, which corrected an over-narrow claim from the structural analyst).
- **Behavior impact:** **Changing.** The observer is a user who hits a sandbox failure path. The text of two thrown
  `SandboxError` messages and one stderr hint block changes to name the new spelling. The user's answer: "Everything,
  including docs."
- **Rejected alternatives:**
  - Code and error messages only, docs in a follow-up — rejected by the user. It would have left six docs files
    naming commands that no longer exist.
  - `packages/cli` only — rejected by the user. It would have left the binary's own failure messages pointing at a
    removed command, which is the worst of the three outcomes.
- **Revisit criterion:** None. This is settled by the boundary.
- **Dissent (if any):** None recorded.
- **Settles delta entry:** S-10, S-11.
- **Dependent decisions:** D-4.
- **Referenced in plan:** Surface Delta, Behavior Changes, Change Units.

### D-4: A new ADR records this decision, superseding the sbx record's stability consequence

- **Question:** `C-12` records an existing ADR that decided to keep these exact command names stable, and lists
  "Existing Skillwalker command names remain stable for users and scripts" among its consequences. This change makes
  that consequence false. What happens to that record?
- **Decision:** Write a new ADR at `docs/adrs/` recording the consolidation decision, and mark
  `20260515000000-migrate-sandbox-cli-to-sbx.md` as superseded with respect to that consequence. The sbx record's
  own decision text is not rewritten — it was accurate about the migration it described. The new ADR is authored
  through the project's `han-documentation:architectural-decision-record` skill so it matches the established
  template.
- **Rationale:** The user chose this over a lighter superseding note and over leaving the records untouched. It gives
  the next reader a record of why the names changed rather than leaving them to reconcile a contradiction themselves.
- **Evidence:** User input, selected in escalation. The contradiction itself is `C-12`, quoting
  `docs/adrs/20260515000000-migrate-sandbox-cli-to-sbx.md:3,14`. Note from `C-12` that the sbx ADR carries no
  `**Status:**` field today, while the other ADR does — so the superseded marking also supplies a status line the
  record currently lacks.
- **Behavior impact:** **Preserving.** No code path changes. The observer is a reader of the decision records, and
  what they see is additive.
- **Rejected alternatives:**
  - A short superseding note on the old ADR, with no new record — rejected by the user. Lighter, but it records that
    the names changed without recording why.
  - Leaving the decision records untouched — rejected by the user. Cheapest, and defensible on the grounds that ADRs
    are records of their own moment, but it leaves a stale-reading consequence line with nothing pointing past it.
- **Revisit criterion:** None.
- **Dissent (if any):** None recorded.
- **Settles delta entry:** S-12.
- **Dependent decisions:** None.
- **Referenced in plan:** Surface Delta, Change Units.

### D-6: The three children move into a `commands/sandbox/` subdirectory

- **Question:** Do the three child modules stay as flat files in `packages/cli/src/commands/`, or move into a
  subdirectory that mirrors the command nesting?
- **Decision:** They move. The layout after the change is:
  ```
  packages/cli/src/commands/
    sandbox.ts              # the parent, beside the directory rather than inside it
    sandbox/
      setup.ts              # was sandbox-setup.ts
      setup.test.ts         # new, per D-8
      clean.ts              # moved unmodified
      clean.test.ts         # moved unmodified
      shell.ts              # moved unmodified
      shell.test.ts         # moved unmodified
  ```
  The parent sits beside `sandbox/` rather than at `sandbox/index.ts`. `./commands/sandbox.js` and
  `./commands/sandbox/setup.js` are distinct ESM specifiers and do not collide.
- **Rationale:** `C-4` establishes that the three modules are already a cluster — the only three that import nothing
  from `../paths.js`, each depending on exactly one package. The subdirectory makes a cohesion that already exists in
  the import graph visible in the filesystem, and it mirrors the command nesting being introduced. A second
  `index.ts` one directory below the CLI entry point at `packages/cli/index.ts` was rejected as confusable with it.
- **Evidence:** `C-4` (the existing cluster), `C-1` (the uniform contract the moved modules keep). The architect
  verified that nothing depends on the flat layout: no glob or `readdir` scans `commands/`; `vitest.config.ts` and
  `vitest.all.config.ts` both match `packages/*/src/**/*.test.ts` recursively, so moved and added test files are
  collected with no config edit; `packages/cli/tsconfig.json` has no `include` allowlist; and `scripts/build.ts`
  compiles from `packages/cli/index.ts` and bundles transitively, so the move is invisible to the build.
- **Behavior impact:** Preserving. No observable change follows from where a file sits.
- **Rejected alternatives:**
  - Keep the three as flat files, renamed — rejected because the filesystem would then contradict the command
    structure, and a reader looking for what `sandbox` dispatches to would have to read `sandbox.ts` to find out.
  - Put the parent at `sandbox/index.ts` — rejected because this package already has an `index.ts` with an unrelated
    meaning, and a second one directory down invites confusion for no gain.
- **Revisit criterion:** If a second nested parent command appears and a different layout serves both better.
- **Dissent (if any):** None recorded.
- **Settles delta entry:** S-6, S-7.
- **Dependent decisions:** D-7.
- **Referenced in plan:** Target State, Surface Delta.

### D-7: The parent module imports its children statically

- **Question:** Does the `sandbox` parent load its three children with `await import(...)`, matching how `index.ts`
  loads every command today, or with static imports?
- **Decision:** Static imports. The parent module is pinned as:
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
  `command` is the bare string `'sandbox'`, not `'sandbox <command>'`. `handler` is an empty async function that is
  unreachable at runtime.
- **Rationale:** Three separate reasons converge. First, a dynamic import inside `builder` would make this one
  module's `builder` async while every other module's is `(yargs: Argv) => Argv`, breaking the uniform shape `C-1`
  records for zero benefit. Second, `index.ts` already defers the whole subtree behind its own top-level
  `await import(...)`, so a second dynamic layer buys no laziness — the three files load at the same moment either
  way. Third, no finding asks for per-child lazy loading, so the simpler structure wins the simpler-version test.

  The empty `handler` is required rather than chosen: `CommandModule` declares `handler` non-optional in the installed
  `@types/yargs` 17.0.35, while `demandCommand(1)` in the builder means Yargs rejects a bare `sandbox` invocation
  before dispatch ever reaches it. The bare `'sandbox'` command string is pinned from observed help output, not
  preference.
- **Evidence:** `C-1` (the uniform builder signature), `C-2` (the existing top-level dynamic import), `C-9` (the
  probe, which exercised this exact chained-`.command()` shape under the same
  `.demandCommand(1).strict().showHelpOnFail(true)` chain and rendered the help line as
  `skillwalker sandbox  Manage the Test Sandbox`). The architect independently re-derived the `CommandModule` and
  `CommandBuilder` type shapes from `@types/yargs` `index.d.ts` lines 987-1010 and 203 to confirm both the
  required-`handler` claim and that `.command()` is generic over the `Argv` it is called on, so nothing ties it to the
  top level. A second probe in this run confirmed the static namespace-import form runs.
- **Behavior impact:** Preserving. The module is new; what a user observes is recorded at S-4.
- **Rejected alternatives:**
  - `await import(...)` inside `builder` — type-checks, since `CommandBuilder` permits a `Promise<Argv>` return, but
    breaks the uniform builder signature for no gain.
  - A shared `CommandModule` base type, or a barrel file re-exporting the three children — both deferred under YAGNI;
    see the plan's `## Deferred (YAGNI)` section.
- **Revisit criterion:** If a child module ever becomes expensive enough to load that deferring it matters.
- **Dissent (if any):** None recorded.
- **Settles delta entry:** S-5.
- **Dependent decisions:** None.
- **Referenced in plan:** Target State, Surface Delta.

### D-8: The setup module gains the co-located test it never had

- **Question:** S-8 changes the `command` literal in the one command module with no test. Does this change add one?
- **Decision:** Yes. `packages/cli/src/commands/sandbox/setup.test.ts` follows the shape every other command test
  uses: a `describe('sandbox setup command exports', ...)` block pinning `command === 'setup'` and a non-empty
  `describe` string, and a `describe('sandbox setup handler', ...)` block asserting the handler calls `createSandbox`
  with the resolved `--repo-root` value, with `@testdouble/sandbox-integration` mocked as `shell.test.ts` mocks it.
- **Rationale:** This is not new scope. The change edits a literal that nothing currently pins, in the one module that
  is a standing gap against the project's own co-location standard. The test is how the edit is verified.
- **Evidence:** `C-6` (no `sandbox-setup.test.ts` exists; the other seven modules all assert their `command` string as
  an exact literal). `docs/coding-standards/test-file-organization.md` requires co-location and states no per-file
  exemptions. The scope-justification floor applies: the boundary's silence about tests does not cut a necessity of
  the work it does ask for.
- **Behavior impact:** Preserving.
- **Rejected alternatives:**
  - Move and rename without adding a test — rejected because it would change an unpinned literal in the one module
    with no coverage, leaving the riskiest edit in the change as the only unverified one.
- **Revisit criterion:** None.
- **Dissent (if any):** None recorded.
- **Settles delta entry:** S-9.
- **Dependent decisions:** None.
- **Referenced in plan:** Surface Delta.
