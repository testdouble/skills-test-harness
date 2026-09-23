#!/usr/bin/env bash
# Checks that the repo is in a state a release can be cut from.
# Prints the current CLI version on success. Exits 1 with a reason on failure,
# or 2 when CI on HEAD has not finished yet.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fail() {
  echo "PREFLIGHT FAILED: $1" >&2
  exit "${2:-1}"
}

for tool in gh jq bun; do
  command -v "$tool" >/dev/null || fail "$tool is not installed. Install it with: brew install $tool"
done

if ! gh auth status >/dev/null 2>&1; then
  fail "gh is not authenticated. Run: gh auth login"
fi

branch=$(git branch --show-current)
[ "$branch" = "main" ] || fail "on branch '$branch'. Releases are cut from main: git checkout main"

[ -z "$(git status --porcelain)" ] || fail "working tree has uncommitted changes. Commit or stash them first."

git fetch --quiet origin main --tags || fail "could not fetch from origin."
head=$(git rev-parse HEAD)
remote=$(git rev-parse origin/main)
[ "$head" = "$remote" ] || fail "local main ($head) differs from origin/main ($remote). Pull or push first."

ci=$(gh run list --workflow ci.yml --commit "$head" --limit 1 --json status,conclusion,url \
  --jq '.[0] // empty | "\(.status) \(.conclusion) \(.url)"')
[ -n "$ci" ] || fail "no CI run found for $head."
read -r ci_status ci_conclusion ci_url <<<"$ci"
[ "$ci_status" = "completed" ] || fail "CI is still running on $head: $ci_url" 2
[ "$ci_conclusion" = "success" ] || fail "CI finished '$ci_conclusion' on $head: $ci_url"

version=$(jq -r .version packages/cli/package.json)
echo "current_version=$version"
echo "head=$head"
echo "ci=$ci_url"
