#!/usr/bin/env bash
# Finds the pull requests merged and issues completed in a release range, and
# who to credit for each: PR authors, commit authors and co-authors, and the
# people who reported the issues. AI and bot accounts are never credited.
# Writes credits.json beside the draft and prints a readable summary.
# Usage: collect-credits.sh {range} {draft}
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

range=${1:?usage: collect-credits.sh RANGE DRAFT}
draft=${2:?usage: collect-credits.sh RANGE DRAFT}
credits="$(dirname "$draft")/credits.json"

command -v gh >/dev/null || { echo "gh is not installed. Install it with: brew install gh" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is not installed. Install it with: brew install jq" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated. Run: gh auth login" >&2; exit 1; }

# Logins that are AI assistants or automation, not people
not_a_person='^(claude|copilot|github-actions|dependabot)$|\[bot\]$'

# Merge commits name the PR in their subject; squash merges end with (#N)
prs=$(git log --format=%s "$range" |
  sed -nE 's/^Merge pull request #([0-9]+) .*/\1/p; s/.*\(#([0-9]+)\)$/\1/p' | sort -un)

# Issues closed as completed while this release was being built
end=${range#*..}
start=${range%%..*}
utc() { TZ=UTC git log -1 --format=%cd --date=format-local:%Y-%m-%dT%H:%M:%SZ "$1"; }
if [ "$start" = "$range" ]; then
  window="closed:<=$(utc "$end")"
else
  window="closed:$(utc "$start")..$(utc "$end")"
fi

pr_json='[]'
unresolved='[]'
linked_issues=''
for pr in $prs; do
  data=$(gh pr view "$pr" --json number,title,url,author,commits,closingIssuesReferences)
  pr_json=$(jq --argjson data "$data" --arg bots "$not_a_person" '. + [{
      kind: "pr",
      number: $data.number,
      title: $data.title,
      url: $data.url,
      contributors: ([$data.author.login] + [$data.commits[].authors[].login | select(. != null and . != "")]
        | unique | map(select(test($bots; "i") | not)))
    }]' <<<"$pr_json")
  unresolved=$(jq --argjson data "$data" '. + [$data.commits[].authors[]
      | select(.login == null or .login == "") | "\(.name) <\(.email)>"] | unique' <<<"$unresolved")
  linked_issues+=" $(jq -r '[.closingIssuesReferences[].number] | join(" ")' <<<"$data")"
done

window_issues=$(gh issue list --state closed --limit 200 --search "reason:completed $window" --json number --jq '.[].number')
issue_json='[]'
for issue in $(printf '%s\n' $linked_issues $window_issues | sort -un); do
  data=$(gh issue view "$issue" --json number,title,url,author,stateReason)
  [ "$(jq -r .stateReason <<<"$data")" = "COMPLETED" ] || continue
  issue_json=$(jq --argjson data "$data" --arg bots "$not_a_person" '. + [{
      kind: "issue",
      number: $data.number,
      title: $data.title,
      url: $data.url,
      contributors: ([$data.author.login] | map(select(test($bots; "i") | not)))
    }]' <<<"$issue_json")
done

jq -n --argjson prs "$pr_json" --argjson issues "$issue_json" --argjson unresolved "$unresolved" \
  '{items: ($prs + $issues), unresolved: $unresolved}' >"$credits"

echo "credits=$credits"
jq -r '.items[] | "\(.kind) #\(.number) \(.url)\n  title: \(.title)\n  contributors: \(.contributors | join(", "))"' "$credits"
jq -r '.unresolved[] | "unresolved co-author (no GitHub login): \(.)"' "$credits"
