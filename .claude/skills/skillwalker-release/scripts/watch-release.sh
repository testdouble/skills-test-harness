#!/usr/bin/env bash
# Waits for the release.yml run started by pushing the given tag, then follows
# it to completion. Safe to re-run: it finds the same run again.
# Exits 0 when the run succeeds, 1 when it fails, with the failed logs printed.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

tag=${1:?usage: watch-release.sh vX.Y.Z}
sha=$(git rev-parse "$tag^{commit}")

run_id=""
for _ in $(seq 1 24); do
  run_id=$(gh run list --workflow release.yml --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  [ -n "$run_id" ] && break
  sleep 5
done
if [ -z "$run_id" ]; then
  echo "No release.yml run appeared for $tag ($sha) within 2 minutes." >&2
  exit 1
fi

echo "run=$(gh run view "$run_id" --json url --jq .url)"

if gh run watch "$run_id" --exit-status --interval 30 >/dev/null 2>&1; then
  gh run view "$run_id" --json jobs --jq '.jobs[] | "job: \(.name): \(.conclusion)"'
  exit 0
fi

gh run view "$run_id" --json jobs --jq '.jobs[] | "job: \(.name): \(.conclusion)"'
echo "--- failed step logs (last 80 lines) ---"
gh run view "$run_id" --log-failed 2>/dev/null | tail -80
exit 1
