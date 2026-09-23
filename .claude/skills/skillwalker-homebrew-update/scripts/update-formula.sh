#!/usr/bin/env bash
# Points Formula/skillwalker.rb in the tap at a published Skillwalker release:
# checks the release is public and each archive matches its .sha256 file, then
# rewrites both url and sha256 lines and runs ruby -c and brew style. Prints the
# resulting diff. Exits 3 when the formula is already at this version.
# Usage: update-formula.sh TAP_DIR X.Y.Z
set -euo pipefail

tap_dir=${1:?usage: update-formula.sh TAP_DIR X.Y.Z}
version=${2:?usage: update-formula.sh TAP_DIR X.Y.Z}
version=${version#v}
formula="$tap_dir/Formula/skillwalker.rb"
repo=testdouble/skillwalker

fail() {
  echo "UPDATE FAILED: $1" >&2
  exit 1
}

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "'$2' is not a version in X.Y.Z form."
[ -f "$formula" ] || fail "$formula does not exist."

current=$(sed -nE 's#.*/releases/download/v([0-9]+\.[0-9]+\.[0-9]+)/.*#\1#p' "$formula" | sort -u)
[ "$(wc -l <<<"$current" | tr -d ' ')" = "1" ] || fail "the formula's URLs do not share one version: $(echo $current)"
if [ "$current" = "$version" ]; then
  echo "Formula/skillwalker.rb is already at $version." >&2
  exit 3
fi
[ "$(printf '%s\n%s\n' "$current" "$version" | sort -V | tail -1)" = "$version" ] ||
  fail "$version is older than the formula's current version $current."

draft=$(gh release view "v$version" --repo "$repo" --json isDraft --jq .isDraft 2>/dev/null) ||
  fail "there is no v$version release on $repo."
[ "$draft" = "false" ] || fail "the v$version release is still a draft, so its downloads are not public. Publish it first."

downloads=$(mktemp -d)
trap 'rm -rf "$downloads"' EXIT

for arch in arm64 x86_64; do
  archive="skillwalker-$version-darwin-$arch.tar.gz"
  url="https://github.com/$repo/releases/download/v$version/$archive"

  # Download the way Homebrew will, without GitHub credentials
  curl -fsSL -o "$downloads/$archive" "$url" || fail "$url did not download."
  curl -fsSL -o "$downloads/$archive.sha256" "$url.sha256" || fail "$url.sha256 did not download."
  actual=$(shasum -a 256 "$downloads/$archive" | awk '{print $1}')
  expected=$(awk '{print $1}' "$downloads/$archive.sha256")
  [ "$actual" = "$expected" ] || fail "$archive hashes to $actual, but its .sha256 file says $expected."

  # Rewrite this architecture's url, then the sha256 line that follows it
  awk -v arch="$arch" -v url="$url" -v sha="$actual" '
    $0 ~ "url \".*-darwin-" arch "\\.tar\\.gz\"" { sub(/url ".*"/, "url \"" url "\""); pending = 1 }
    pending && /sha256 "/ && !/url/ { sub(/sha256 "[0-9a-f]*"/, "sha256 \"" sha "\""); pending = 0 }
    { print }
  ' "$formula" >"$downloads/formula.rb"
  cp "$downloads/formula.rb" "$formula"

  grep -q "$url" "$formula" || fail "could not find the $arch url line in $formula."
  grep -q "$actual" "$formula" || fail "could not find the $arch sha256 line in $formula."
  echo "sha256 $archive $actual"
done

ruby -c "$formula" >/dev/null || fail "$formula is not valid Ruby after the update."
brew style "$formula" >/dev/null || { brew style "$formula" >&2; fail "brew style rejected $formula."; }

echo "--- diff ---"
git -C "$tap_dir" diff -- Formula/skillwalker.rb
