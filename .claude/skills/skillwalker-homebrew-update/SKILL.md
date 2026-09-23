---
name: skillwalker-homebrew-update
description: >
  Updates the Skillwalker Homebrew formula in the testdouble/homebrew-tap repo to a published release: confirms the
  release is public and each macOS archive matches its checksum file, rewrites the formula's url and sha256 lines for
  Apple silicon and Intel, checks the formula with ruby and brew style, and commits and pushes it after approval. Use
  when updating, bumping, or publishing the Homebrew formula or tap for a new Skillwalker version, or when
  skillwalker-release reaches its Homebrew step. Requires the gh CLI and Homebrew. Does not cut, tag, or publish the
  release itself; use skillwalker-release for that.
argument-hint: "[X.Y.Z]"
allowed-tools: Bash(gh release view *)
---

# Update the Skillwalker Homebrew Formula

Point `Formula/skillwalker.rb` in `testdouble/homebrew-tap` at one published Skillwalker release, so
`brew install testdouble/tap/skillwalker` installs it. The version is `$ARGUMENTS` (may be empty).

Run every script from the skillwalker repository root. When a script exits non-zero, show the user its output and stop.

## Step 1: Resolve the Version

If `$ARGUMENTS` is empty, find the latest published release with
`gh release view --repo testdouble/skillwalker --json tagName --jq .tagName` and use it. Call the version `{version}`,
without the `v`.

## Step 2: Find the Tap

Find a checkout to edit by running `${CLAUDE_SKILL_DIR}/scripts/locate-tap.sh`. Capture `tap_dir` and `temp`.

It uses `../homebrew-tap` when that folder's origin is `testdouble/homebrew-tap`, fast-forwarding it to `origin/main`
when it is only behind. It stops when that clone is on another branch, has uncommitted changes, or has unpushed
commits. Never fix the clone yourself BECAUSE the user owns its state. Without the sibling clone, it clones the tap into
a temp folder (`temp=yes`).

## Step 3: Update the Formula

Update the formula by running `${CLAUDE_SKILL_DIR}/scripts/update-formula.sh {tap_dir} {version}`. It checks that the
`v{version}` release is published and newer than the formula's version, and that both archives download without GitHub
credentials and match their `.sha256` files. It then rewrites both `url` and `sha256` lines, runs `ruby -c` and
`brew style`, and prints the `sha256` lines and the formula diff.

- Exit code 3 means the formula already points at `{version}`. Tell the user there is nothing to update, run
  `${CLAUDE_SKILL_DIR}/scripts/discard-formula.sh {tap_dir} {temp}` to remove any temp clone, and stop.
- Exit code 1 means a check failed. Show the reason, run `${CLAUDE_SKILL_DIR}/scripts/discard-formula.sh {tap_dir}
  {temp}` to undo any partial edit, and stop.

## Step 4: Approval to Push

Show the user the formula diff, then ask them to approve pushing it. State what happens next: a `skillwalker {version}`
commit goes to the `main` branch of `testdouble/homebrew-tap`, and from then on `brew install` and `brew upgrade`
install `{version}` for everyone.

If the user declines, undo the edit by running `${CLAUDE_SKILL_DIR}/scripts/discard-formula.sh {tap_dir} {temp}`, then
stop.

## Step 5: Commit and Push

Publish the update by running `${CLAUDE_SKILL_DIR}/scripts/publish-formula.sh {tap_dir} {version} {temp}`. Capture the
`commit` URL. If the push is rejected, stop and tell the user the commit exists only in `{tap_dir}`, so nothing reached
Homebrew users.

## Step 6: Report

Tell the user the formula now installs `{version}`, with the tap commit URL and the two `sha256` lines. Remind them
that `brew upgrade skillwalker` picks it up after `brew update`.

When `skillwalker-release` invoked this skill, hand control back to it after reporting.
