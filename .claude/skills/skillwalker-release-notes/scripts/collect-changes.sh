#!/usr/bin/env bash
# Lists everything merged since the previous release tag, for drafting the
# release notes of the given version. Also creates the draft file path.
# Exits 1 on a bad version or an existing CHANGELOG.md section, 3 when there
# are no changes since the previous release.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

version=${1:?usage: collect-changes.sh X.Y.Z}
version=${version#v}
if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "'$1' is not a version in X.Y.Z form" >&2
  exit 1
fi

if [ -f CHANGELOG.md ] && grep -q "^## v$version " CHANGELOG.md; then
  echo "CHANGELOG.md already has a section for v$version. Old release notes are never changed." >&2
  exit 1
fi

# When notes are written after a release, this version's tag already exists and
# the range ends there instead of at HEAD
end=HEAD
if git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
  end="v$version"
fi

if previous_tag=$(git describe --tags --abbrev=0 --match 'v*' --exclude "v$version" "$end" 2>/dev/null); then
  range="$previous_tag..$end"
else
  previous_tag=none
  range=$end
fi

commits=$(git log --no-merges --format=%H "$range" --invert-grep --grep '^chore(release):')
if [ -z "$commits" ]; then
  echo "No changes since $previous_tag." >&2
  exit 3
fi

draft_dir=$(mktemp -d)
echo "version=$version"
echo "previous_tag=$previous_tag"
echo "range=$range"
echo "draft=$draft_dir/release-notes-v$version.md"
echo "date=$(date +%Y-%m-%d)"

echo
echo "=== pull requests ==="
git log --merges --format='%s%n    %b' "$range" | grep -v '^\s*$' || echo "(none)"

echo
echo "=== commits (oldest first) ==="
for sha in $(git log --reverse --no-merges --format=%H "$range" --invert-grep --grep '^chore(release):'); do
  echo
  git show --no-patch --format='commit %h%nsubject: %s%nbody:%n%b' "$sha"
  echo "files: $(git show --name-only --format= "$sha" | paste -sd ',' - | sed 's/,/, /g')"
done
