---
name: skillwalker-release
description: >
  Cuts a Skillwalker release from main: checks that main is clean, current, and green in CI, bumps the version in
  packages/cli/package.json by patch, minor, or major or to an exact X.Y.Z, commits and tags it, pushes, follows the
  release.yml workflow that builds the macOS archives, verifies the draft GitHub Release and its checksums, and
  publishes it. The release commit includes new CHANGELOG.md notes written by skillwalker-release-notes. Use when releasing, cutting, shipping, tagging, or publishing a new Skillwalker version, or bumping the
  version for a release. Requires the gh CLI, authenticated with repo access. Does not write or update the Homebrew
  formula or the homebrew-tap repo, and does not change code, docs, or the release workflow itself.
argument-hint: "[patch|minor|major|X.Y.Z]"
disable-model-invocation: true
allowed-tools: Skill, Bash(git push origin *), Bash(gh release edit *), Bash(gh release view *)
---

# Release Skillwalker

Cut a versioned release: write the release notes, bump, commit, tag, push, let `.github/workflows/release.yml` build the macOS archives, verify
them, and publish. The requested version is `$ARGUMENTS` (may be empty).

Run every script from the repository root. Each script prints its reason and exits non-zero on failure. When one fails,
stop, show the user its output, and do not continue to later steps BECAUSE each step assumes the previous one held.

## Step 1: Preflight

Check the repo by running `${CLAUDE_SKILL_DIR}/scripts/preflight.sh`. Capture `current_version` and `head` from its
output.

- Exit code 2 means CI on `HEAD` is still running. Tell the user, show the CI URL, and stop. They can re-run
  `/skillwalker-release` once CI finishes.
- Exit code 1 means the repo is not releasable. Show the reason and stop. Never fix it yourself (checkout, pull, stash,
  or push) BECAUSE the user owns the state of their main branch.

## Step 2: Resolve the Version

1. If `$ARGUMENTS` is empty, ask the user which version to release. Show `current_version` and the three candidates
   (next patch, next minor, next major), and accept an exact `X.Y.Z` as well.
2. Resolve it by running `${CLAUDE_SKILL_DIR}/scripts/next-version.sh {request}`, where `{request}` is `patch`,
   `minor`, `major`, or the exact version. Capture the printed version as `{version}`.

## Step 3: Write the Release Notes

Invoke the `skillwalker-release-notes` skill with the Skill tool, passing `{version}` as its argument. Tell it that it
is running inside `/skillwalker-release`: it must not commit, and it must hand control back when the notes are
prepended.

When it finishes, confirm that `CHANGELOG.md` now begins its release sections with `## v{version} - `. Then continue
immediately to Step 4. Never treat the release-notes report as the end of the release BECAUSE the version bump, tag,
and publish still have to run.

If the release-notes skill stops without prepending (no changes since the last release, a failed format check, or no
readability editor), stop the release and show the user why. `CHANGELOG.md` is unchanged in that case.

## Step 4: Approval to Push

Show the user the new `v{version}` section from the top of `CHANGELOG.md`, then ask them to approve releasing
`v{version}`. State exactly what happens next: `packages/cli/package.json` goes from `current_version` to `{version}`,
a `chore(release): v{version}` commit holding that change and the new `CHANGELOG.md` notes is created on `main` at
`head` with an annotated `v{version}` tag, and both are pushed to `origin`, which starts the release workflow.

If the user declines, undo the notes by running `${CLAUDE_SKILL_DIR}/scripts/discard-changelog.sh`, then stop. The
working tree is back to `head` and nothing else was changed.

## Step 5: Commit, Tag, and Push

1. Create the commit and tag by running `${CLAUDE_SKILL_DIR}/scripts/prepare-release.sh {version}`.
2. Push the commit with `git push origin main`. If the push is rejected, stop and tell the user: the commit and tag
   exist only locally, and `git tag -d v{version} && git reset --hard origin/main` discards them. Do not run that
   yourself.
3. Push the tag with `git push origin v{version}`. Always push `main` before the tag BECAUSE the tag must point at a
   commit that is already on `main`.

## Step 6: Follow the Release Workflow

Follow the workflow by running `${CLAUDE_SKILL_DIR}/scripts/watch-release.sh v{version}` with the Bash timeout set to
its 600000 ms maximum. The builds take several minutes.

- If the command times out, run it again. It finds the same run and keeps following it.
- If it exits 1, show the user the failed jobs and log excerpt it printed, plus the run URL, and stop. Never delete or
  move the tag BECAUSE the tag is public once pushed. Tell the user the tag and commit stay in place. To retry after a
  fix, they can delete the tag with `git push origin :refs/tags/v{version}` and `git tag -d v{version}`, then re-run
  `/skillwalker-release {version}`.

## Step 7: Verify the Draft Release

Verify the release by running `${CLAUDE_SKILL_DIR}/scripts/verify-release.sh v{version}`. It checks that both archives
and both `.sha256` files are attached, that each archive matches its checksum, and that this Mac's archive runs, prints
`{version}` from `--version`, and passes `codesign --verify`. Capture the `url` and the `sha256` lines.

If it fails, show the output and stop. Leave the release as a draft.

## Step 8: Approval to Publish

Ask the user to approve publishing the draft release at `url`. Publishing makes the archives publicly downloadable,
which Homebrew needs.

If the user declines, stop and tell them the draft is ready to publish from the GitHub UI.

## Step 9: Publish and Report

1. Publish with `gh release edit v{version} --draft=false`.
2. Confirm it with `gh release view v{version} --json isDraft,url`. `isDraft` must be `false`.
3. Report to the user: the release URL, the tag, the release workflow run URL, and the two `sha256` lines from Step 7.
   The formula's `sha256` fields need these values.
