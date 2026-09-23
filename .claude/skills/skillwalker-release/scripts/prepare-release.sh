#!/usr/bin/env bash
# Sets packages/cli/package.json to the given version and commits it with the
# new CHANGELOG.md notes, then creates an annotated vX.Y.Z tag.
# Local only: nothing is pushed.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

version=${1:?usage: prepare-release.sh X.Y.Z}
manifest=packages/cli/package.json

if ! grep -q "^## v$version " CHANGELOG.md 2>/dev/null; then
  echo "CHANGELOG.md has no section for v$version. Write the release notes first." >&2
  exit 1
fi

tmp=$(mktemp)
jq --arg version "$version" '.version = $version' "$manifest" >"$tmp"
mv "$tmp" "$manifest"

git add "$manifest" CHANGELOG.md
git commit --quiet -m "chore(release): v$version"
git tag -a "v$version" -m "Skillwalker v$version"

echo "commit=$(git rev-parse HEAD)"
echo "tag=v$version"
