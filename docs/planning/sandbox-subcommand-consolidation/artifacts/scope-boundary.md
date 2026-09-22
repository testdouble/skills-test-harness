# Scope Boundary: Sandbox Sub-command Consolidation

## Work Item

No ticket, issue, or pull request exists. The boundary is the user's typed request when invoking
`han-planning:plan-a-change`, supplemented by their answers to the confirmation turn on 2026-09-22.

## Stated Scope

Quoted word for word from the skill invocation:

> to consolidate the CLI commands for "sandbox-create", "clean", and "shell" into sub-commands: "sandbox create",
> "sandbox clean", "sandbox shell". create a branch for this, commit as you go. push and open a draft mode pr

The request names `sandbox-create` as an existing command. No such command exists; the binary registers `sandbox-setup`
(`packages/cli/src/commands/sandbox-setup.ts:4`). The confirmation turn surfaced the discrepancy and the user settled it
(see Operator-Stated Scope).

## Stated Exclusions

None stated.

## Operator-Stated Scope

Four asks were put to the user in the confirmation turn. Their answers are scope statements in their own right:

1. **Old flat command names after the change** — "Hard cut, old names gone." No aliases, no deprecation warnings.
   Typing `clean` after the change fails with Yargs' unknown-argument error.
2. **The verb on the setup sub-command** — the user first accepted `sandbox create`, then corrected it mid-turn:
   > ah, make the sub-command "sandbox setup" then

   The correction governs. The sub-command is `sandbox setup`, so that command moves without a verb change.
3. **How far the rename reaches** — "Everything, including docs." In scope: the error and hint strings inside
   `packages/sandbox-integration`, the `Makefile` targets, `README.md` setup steps, and every `docs/` file naming these
   commands.
4. **What the draft PR contains** — "The plan and the implementation." This run writes the plan and then carries it out
   on the same branch.

## Direction of Travel

Answered. The three flat command names — `sandbox-setup`, `clean`, and `shell` — are being removed outright. They are
not deprecated, not aliased, and not kept reachable. The `sandbox` parent command is their only spelling after the
change.

The project has precedent for this shape of cut: the sbx migration ADR
(`docs/adrs/20260515000000-migrate-sandbox-cli-to-sbx.md`) refused a `docker sandbox` fallback on the grounds that dual
command support adds stale branching.

## Visual Material Received

None received.

## Record Provenance

Established by `han-planning:plan-a-change` on 2026-09-22. Not inherited from a prior record; no
`artifacts/scope-boundary.md` existed for this area before this run. No conflicting work item was supplied, so no
conflict was resolved.
