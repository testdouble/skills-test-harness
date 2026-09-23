---
name: skillwalker-release-notes
description: >
  Writes the release notes for a new Skillwalker version and prepends them to CHANGELOG.md in the repository root,
  covering every user-facing change merged since the previous release tag. Each section gets the version and date, a
  short plain-language summary, and New Features, Enhancements, Bug Fixes, and Breaking Changes, with related changes
  grouped under named headings. Use when writing, drafting, or updating release notes or the changelog for an upcoming
  version, or when skillwalker-release reaches its release-notes step. Never edits existing release notes. Does not
  bump the version, commit, tag, push, or publish; use skillwalker-release to cut the release itself.
argument-hint: "[X.Y.Z]"
allowed-tools: Bash(git show *), Bash(git log *)
---

# Write Skillwalker Release Notes

Prepend the release notes for one version to `CHANGELOG.md`. The version is `$ARGUMENTS` (may be empty).

Never edit, reword, reformat, or move an existing release section in `CHANGELOG.md` BECAUSE published notes are a record
of what shipped. All drafting and editing happens in a separate draft file, and only
`${CLAUDE_SKILL_DIR}/scripts/prepend-notes.ts` writes to `CHANGELOG.md`.

Run every script from the repository root. When a script exits non-zero, show the user its output and stop.

## Step 1: Resolve the Version

If `$ARGUMENTS` is empty, ask the user which version the notes are for, showing the `version` in
`packages/cli/package.json` as the current release. Accept `X.Y.Z` or `vX.Y.Z`. Call the answer `{version}`, without
the `v`.

## Step 2: Collect the Changes

Collect everything since the previous release by running `${CLAUDE_SKILL_DIR}/scripts/collect-changes.sh {version}`.
Capture `previous_tag`, `range`, `draft`, and `date` from the first lines of its output. The rest lists merged pull
requests and every commit in the range with its subject, body, and changed files.

- Exit code 3 means nothing has changed since `previous_tag`. Tell the user and stop.
- Exit code 1 means the version is malformed or `CHANGELOG.md` already has a section for it. Show the reason and stop.

## Step 3: Draft the Notes

1. Read `${CLAUDE_SKILL_DIR}/references/notes-format.md`. It defines the template, which changes to include, how to
   pick a category, how to group, and how to write the summary and bullets.
2. Decide, for each commit, whether a user would notice it, and if so which category it belongs in. When a commit's
   subject and body do not make its effect clear, read the change with `git show --stat {sha}` or `git show {sha}`.
3. Write the draft to the `draft` path with the Write tool, using `{version}` and `date` in the heading.

## Step 4: Check the Draft

Check the format by running `bun ${CLAUDE_SKILL_DIR}/scripts/check-notes.ts {draft} {version}`. If it lists problems,
fix them in the draft and run it again. Repeat until it prints `ok`. Stop and show the user the remaining problems if
three rounds of fixes do not get there.

## Step 5: Readability Pass on the New Notes Only

Dispatch the `han-communication:readability-editor` agent with the Agent tool. In the prompt:

- Give it the `draft` path as the only file it may read for rewriting or edit. Say that it must not open, read, or edit
  `CHANGELOG.md` or any other file BECAUSE the existing release notes must stay exactly as published.
- Name the audience: people who install and run Skillwalker, reading what changed in this release.
- State the required shape, which it must keep: the `## v{version} - {date}` heading unchanged; a summary paragraph of
  3 to 5 sentences with 10 to 15 words each; the four `###` category headings unchanged and in order; `####` group
  headings; every bullet in the form `- {thing that changed} - {summary of change}`; and `- None in this release.`
  lines unchanged.
- Ask it to preserve every fact and edit the file in place.

If the agent is not available (the `han-communication` plugin is not installed), stop without touching `CHANGELOG.md`.
Tell the user the readability pass is required, and show them the draft path so the notes are not lost.

## Step 6: Re-check the Edited Draft

Run `bun ${CLAUDE_SKILL_DIR}/scripts/check-notes.ts {draft} {version}` again BECAUSE the readability pass can break the
required shape. Fix any problem it lists, without undoing the editor's rewording where the format allows, until it
prints `ok`.

## Step 7: Prepend to the Changelog

Prepend the draft by running `bun ${CLAUDE_SKILL_DIR}/scripts/prepend-notes.ts {draft} {version}`. It creates
`CHANGELOG.md` if it does not exist, inserts the new section above every existing one, and refuses to write if the old
sections would change.

## Step 8: Report

Show the user the new section as it now appears at the top of `CHANGELOG.md`, and the `range` it covers.

- When `skillwalker-release` invoked this skill, say the notes are ready and hand control back to it. Do not commit.
- Otherwise, tell the user `CHANGELOG.md` is changed but not committed, so they can review it.
