# Consolidate Test Sandbox commands under a sandbox parent

- **Status:** proposed
- **Date Created:** 2026-09-22 10:47
- **Last Updated:** 2026-09-22 10:47
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**

## Context

The `skillwalker` binary exposed eight top-level commands. Three of them — `sandbox-setup`, `clean`, and `shell` — all manage the Test Sandbox lifecycle, and each delegates to a single function in `@testdouble/sandbox-integration`. They were already a cluster in the code: the only three command modules that import nothing from `src/paths.ts`, and the only three whose sole production dependency is that one package.

Nothing in the command surface showed that. `skillwalker --help` listed them as three unrelated entries interleaved with the eval commands, and the names gave no hint that `clean` removes a sandbox rather than clearing output data — a real ambiguity, since the `Makefile` also has a `clear-data` target that removes `output/` and `analytics/`.

This ADR records the decision to group them under a `sandbox` parent command, and to remove the old flat spellings rather than keep them working alongside the new ones.

## Decision Drivers

- The three commands share one responsibility and one dependency, and the command surface should say so.
- `clean` is ambiguous at the top level. `sandbox clean` is not.
- Carrying two spellings for every command is the cost the project already declined once, in [Migrate sandbox integration to sbx](./20260515000000-migrate-sandbox-cli-to-sbx.md), which rejected a compatibility adapter because it "adds branching around a retired command and keeps outdated terminology in the codebase."
- Skillwalker is a development tool used inside this repository. The population that has scripted the flat command names is small and reachable, which makes a hard cut cheap here in a way it would not be for a published CLI.

## Considered Options

- **Hard cutover to nested sub-commands.** `sandbox setup`, `sandbox clean`, and `sandbox shell` are the only spellings. The flat names fail with Yargs' `Unknown argument` and exit 1. One spelling per action, and no dead branches.
- **Nested sub-commands with the flat names kept as hidden aliases.** Nothing anyone has scripted breaks. The CLI carries two spellings of every sandbox command indefinitely, with no date at which the second one goes away.
- **Nested sub-commands with a deprecation warning on the flat names.** Both spellings work and the old one warns. Defers a second decision — when the warning becomes a removal — that nothing currently forces.

The hard cutover was chosen, consistent with the precedent set in the sbx migration.

## Consequences

- `skillwalker --help` shows one `sandbox` entry where it showed three, so the Test Sandbox operations are discoverable as a group. Finding `shell` now requires knowing to look under `sandbox`.
- Anyone typing `skillwalker clean`, `skillwalker shell`, or `skillwalker sandbox-setup` gets the command listing, `Unknown argument`, and exit 1. Yargs does not say where the command went, so a person who has not read this change has to find it in the listing.
- The three failure-path hint strings in `@testdouble/sandbox-integration` now name `sandbox setup`. These strings are coupled to the CLI's command surface by nothing but their own text — no import relationship enforces that they name a registered command, and nothing catches it if they drift.
- The `sandbox-setup` Make target keeps its name and invokes `./build/skillwalker sandbox setup`, so `make sandbox-setup` behaves as before. The `sandbox-clean` target still bypasses the binary and calls `sbx rm --force` directly; it was left alone.
- `packages/cli/src/commands/sandbox/setup.ts` gained the co-located test it never had, closing the one standing gap against [Test File Organization and Naming](../coding-standards/test-file-organization.md).
- The command-name stability consequence recorded in [Migrate sandbox integration to sbx](./20260515000000-migrate-sandbox-cli-to-sbx.md) no longer holds. That ADR's migration decision stands; only its stability statement is superseded.
- Nesting is now a pattern in this codebase where it previously had no precedent. A second grouped command would follow `packages/cli/src/commands/sandbox.ts` as its model.

## References

- [Change Plan: Sandbox Sub-command Consolidation](../planning/sandbox-subcommand-consolidation/change-plan.md) — the surface delta, the behavior changes, and the decisions behind them.
- [Migrate sandbox integration to sbx](./20260515000000-migrate-sandbox-cli-to-sbx.md) — the ADR this one supersedes in part.
