# Release Notes Format

## Contents

- Template
- Which changes to include
- Choosing a category
- Grouping changes
- Writing the summary paragraph
- Writing bullets
- Crediting contributors
- Example

## Template

Copy this shape exactly. `scripts/check-notes.ts` enforces it.

```markdown
## v{version} - {date}

{Summary paragraph: 3 to 5 sentences, each 10 to 15 words.}

### New Features

- {thing that changed} - {summary of change} [#{pr}]({pr url}) by [@{login}](https://github.com/{login})

#### {Named change}

- {thing that changed} - {summary of change} [#{pr}]({pr url}), [#{issue}]({issue url}) by [@{login}](https://github.com/{login})
- {thing that changed} - {summary of change}

### Enhancements

- None in this release.

### Bug Fixes

- {thing that changed} - {summary of change}

### Breaking Changes

- None in this release.
```

Rules the template carries:

- All four category headings always appear, in this order: New Features, Enhancements, Bug Fixes, Breaking Changes.
- A category with nothing in it holds exactly one line: `- None in this release.`
- Ungrouped bullets come first in a category, then `####` groups. A bullet after a group would read as part of it.
- Nothing else goes in the section: no links lists, no contributor lists, no horizontal rules.

## Which changes to include

The notes are for people who install and run Skillwalker. Include a change only when a user would notice it: a new
command, flag, or behavior, a fix to something they could hit, a changed default, a new way to install, or a user-facing
guide.

Leave out internal-only work BECAUSE it buries the changes users care about:

- Tests, including smoke tests and fixtures.
- CI jobs that only check code (lint, format, type check, test runs).
- Formatting, style, and refactors with no behavior change.
- Planning, investigation, and contributor-only docs (`docs/planning/`, coding standards, ADRs).
- Release chores (`chore(release):` commits) and Claude Code skills under `.claude/`.

A change that is internal in form but user-visible in effect is included. A release workflow that makes Homebrew
installs possible counts; a new unit test does not.

One exception: every merged pull request is credited (see Crediting contributors). A pull request whose changes are all
internal-only becomes a single Enhancements bullet that names what it improved for the project, such as
"Dependencies - Bun, React, and other libraries now run their latest releases." Small internal commits inside a
user-facing pull request are still left out.

## Choosing a category

Start from the Conventional Commit type, then correct it by what the change does for a user:

| Signal                                                               | Category         |
| -------------------------------------------------------------------- | ---------------- |
| `!` after the type, or a `BREAKING CHANGE:` footer                   | Breaking Changes |
| A removed or renamed command, flag, or file a user relies on         | Breaking Changes |
| A changed default or output format that breaks an existing workflow  | Breaking Changes |
| `feat`: something a user could not do before                         | New Features     |
| `feat` or `perf`, or user-facing `docs`: an existing thing got better | Enhancements     |
| `fix`: something that was wrong now works                            | Bug Fixes        |

A change goes in exactly one category. Breaking Changes wins over every other category BECAUSE a user must see it before
upgrading.

## Grouping changes

Group two or more related changes under a `####` heading that names the higher-level change in plain words, such as
"Homebrew-ready releases" or "Clearer sandbox errors". Several commits that deliver one user-visible change become one
bullet, not several. Never make a group of one; a lone change stays a plain bullet.

## Writing the summary paragraph

Write 3 to 5 sentences, each 10 to 15 words. Say what the release means for a user, in plain language, most important
change first. Name no commit types, file paths, or internal package names. Count the words in each sentence.

## Writing bullets

Every bullet is `- {thing that changed} - {summary of change}`, with a space, a hyphen, and a space between the parts.

- **Thing that changed** is what a user touches: a command (`skillwalker --version`), a flag, a page, an error message,
  a workflow. Put commands and flags in backticks.
- **Summary of change** is one short sentence on what is different now, from the user's side, ending with a period.

## Crediting contributors

`scripts/collect-credits.sh` lists every pull request merged and every issue completed in the release, with the GitHub
logins to credit for each. Those are issue reporters, pull request authors, and commit authors and co-authors. It
already leaves out AI and bot accounts, and reviewers and commenters are never credited. Use its list as the only source
of credits BECAUSE `scripts/check-notes.ts` rejects any credit that is not in it.

- Every pull request and every issue in the list is linked on the bullet that describes its change. An issue goes on
  the same bullet as the pull request that closed it.
- A bullet built from several pull requests or issues links all of them, and credits every contributor to any of them,
  each login once.
- Credits trail the summary sentence after one space: linked numbers separated by commas, then ` by `, then linked
  usernames separated by commas. There are no parentheses around the credits.
- Link a pull request or issue as `[#5](https://github.com/testdouble/skillwalker/pull/5)`, with the exact `url` from
  the list. Link a user as `[@robsdudeson](https://github.com/robsdudeson)`, with the login as both the text and the
  path.
- A change pushed straight to `main`, with no pull request, gets no credit.

## Example

```markdown
## v0.2.0 - 2026-09-23

Skillwalker can now be packaged and installed with Homebrew on any Mac. Each release builds signed programs for Apple
silicon and Intel Macs automatically. The version command now reports the real release number instead of unknown.
Sandbox error messages now name the right command for installed copies of Skillwalker.

### New Features

#### Homebrew-ready releases

- Release archives - Each version tag builds signed macOS archives for Apple silicon and Intel. [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)
- `SKILLWALKER_SCRIPTS_DIR` - Points Skillwalker at sandbox scripts kept in a folder that survives upgrades. [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)

### Enhancements

- `skillwalker --version` - Prints the release version instead of "unknown". [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)
- Sandbox setup - Runs Claude Code in Docker Sandboxes through the `sbx` command. [#5](https://github.com/testdouble/skillwalker/pull/5), [#4](https://github.com/testdouble/skillwalker/issues/4) by [@robsdudeson](https://github.com/robsdudeson)

### Bug Fixes

- macOS code signature - Compiled programs now pass signature checks, so macOS no longer blocks them. [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)
- Sandbox error messages - Retry hints now say `skillwalker` instead of the `./build/skillwalker` path. [#17](https://github.com/testdouble/skillwalker/pull/17) by [@mxriverlynn](https://github.com/mxriverlynn)

### Breaking Changes

- None in this release.
```
