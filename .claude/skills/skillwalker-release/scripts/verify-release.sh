#!/usr/bin/env bash
# Checks the GitHub Release for a tag: all four archives are attached, each
# archive matches its .sha256 file, and the archive for this Mac's architecture
# runs, reports the release version, and passes codesign verification.
# Prints one "sha256 <archive> <hash>" line per archive for the formula.
set -euo pipefail

tag=${1:?usage: verify-release.sh vX.Y.Z}
version=${tag#v}

fail() {
  echo "VERIFY FAILED: $1" >&2
  exit 1
}

release=$(gh release view "$tag" --json url,isDraft,assets)
echo "url=$(jq -r .url <<<"$release")"
echo "draft=$(jq -r .isDraft <<<"$release")"

archives=("skillwalker-$version-darwin-arm64.tar.gz" "skillwalker-$version-darwin-x86_64.tar.gz")
for archive in "${archives[@]}"; do
  for asset in "$archive" "$archive.sha256"; do
    jq -e --arg name "$asset" '.assets | any(.name == $name)' <<<"$release" >/dev/null ||
      fail "release $tag is missing $asset"
  done
done

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
gh release download "$tag" --dir "$dir" --pattern 'skillwalker-*'

for archive in "${archives[@]}"; do
  actual=$(shasum -a 256 "$dir/$archive" | awk '{print $1}')
  expected=$(awk '{print $1}' "$dir/$archive.sha256")
  [ "$actual" = "$expected" ] || fail "$archive hashes to $actual, but its .sha256 file says $expected"
  echo "sha256 $archive $actual"
done

case "$(uname -m)" in
  arm64) local_arch=arm64 ;;
  x86_64) local_arch=x86_64 ;;
  *) echo "skipped run check: no archive for $(uname -m)"; exit 0 ;;
esac

name="skillwalker-$version-darwin-$local_arch"
tar -xzf "$dir/$name.tar.gz" -C "$dir"
reported=$("$dir/$name/skillwalker" --version)
[ "$reported" = "$version" ] || fail "$name/skillwalker --version printed '$reported', expected '$version'"
codesign --verify "$dir/$name/skillwalker" "$dir/$name/skillwalker-web" ||
  fail "$name binaries fail codesign verification"
echo "checked $name: --version $reported, signatures valid"
