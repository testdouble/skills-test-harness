#!/usr/bin/env bash
# Undoes release notes written during a release that was not approved:
# restores CHANGELOG.md to its committed state, or removes it if it was new.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if git ls-files --error-unmatch CHANGELOG.md >/dev/null 2>&1; then
  git checkout --quiet -- CHANGELOG.md
  echo "restored CHANGELOG.md to HEAD"
elif [ -f CHANGELOG.md ]; then
  rm CHANGELOG.md
  echo "removed the new CHANGELOG.md"
else
  echo "CHANGELOG.md was not changed"
fi
