#!/usr/bin/env bash
# Finds a clean, current checkout of testdouble/homebrew-tap to edit: the
# sibling ../homebrew-tap when it is that repo, otherwise a fresh clone in a
# temp folder. Prints tap_dir and temp (yes when the caller must remove it).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TAP_REPO=testdouble/homebrew-tap

fail() {
  echo "TAP NOT READY: $1" >&2
  exit 1
}

for tool in gh git brew; do
  command -v "$tool" >/dev/null || fail "$tool is not installed."
done
gh auth status >/dev/null 2>&1 || fail "gh is not authenticated. Run: gh auth login"

sibling="$(cd .. && pwd)/homebrew-tap"
origin=$(git -C "$sibling" remote get-url origin 2>/dev/null || true)

if [[ "$origin" =~ github\.com[:/]$TAP_REPO(\.git)?$ ]]; then
  branch=$(git -C "$sibling" branch --show-current)
  [ "$branch" = "main" ] || fail "$sibling is on branch '$branch', not main."
  [ -z "$(git -C "$sibling" status --porcelain)" ] || fail "$sibling has uncommitted changes."

  git -C "$sibling" fetch --quiet origin main || fail "could not fetch $sibling from origin."
  # Fast-forwarding a clean main loses nothing; anything else is the user's to sort out
  if ! git -C "$sibling" merge --ff-only --quiet origin/main 2>/dev/null; then
    fail "$sibling has commits that are not on origin/main. Push or reset them first."
  fi
  [ "$(git -C "$sibling" rev-parse HEAD)" = "$(git -C "$sibling" rev-parse origin/main)" ] ||
    fail "$sibling has commits that are not on origin/main. Push them first."

  echo "tap_dir=$sibling"
  echo "temp=no"
  exit 0
fi

clone="$(mktemp -d)/homebrew-tap"
gh repo clone "$TAP_REPO" "$clone" -- --quiet || fail "could not clone $TAP_REPO."
echo "tap_dir=$clone"
echo "temp=yes"
