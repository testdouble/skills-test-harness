#!/usr/bin/env bash
# Collect the inputs /write-skill-eval-rubric analyzes for a target skill.
#
# Usage: collect-target-inputs.sh {plugin} {skill}
#
# Run from the repository root (the directory that contains the plugin
# directories). Emits structured key: value pairs on stdout and always exits 0
# so the skill can branch on the output without crashing on a missing target.
#
# Output keys:
#   status            one of: ok | error
#   reason            (only when status=error) explanation for the operator
#   skill-file        path to the target SKILL.md
#   reference-files-start / reference-files-end
#                     wrap a newline-separated list of files under the skill's
#                     references/ directory
#   reference-files: none
#                     when the skill has no references/ directory or it is empty
#   agents-start / agents-end
#                     wrap one line per dispatched agent, in the form
#                     `{plugin}:{agent} {resolved-path} {found|missing}`
#   agents: none      when no agent dispatch was detected
#
# Agent detection scans SKILL.md and every reference file for two forms:
#   1. subagent_type values (`subagent_type: "han-core:risk-analyst"`), which are
#      always reported, as found or missing
#   2. qualified `plugin:name` tokens in backticks, which are reported only when
#      they resolve to an agent file, because the same form also names skills
# A subagent_type value is namespaced {agent-plugin}:{agent} and resolves to
# {agent-plugin}/agents/{agent}.md; the agent's plugin is often not the target
# skill's plugin. A bare value resolves inside the target skill's plugin.

PLUGIN="$1"
SKILL="$2"

if [ -z "$PLUGIN" ] || [ -z "$SKILL" ]; then
  echo "status: error"
  echo "reason: usage: collect-target-inputs.sh {plugin} {skill}"
  exit 0
fi

SKILL_DIR="$PLUGIN/skills/$SKILL"
SKILL_FILE="$SKILL_DIR/SKILL.md"

if [ ! -f "$SKILL_FILE" ]; then
  echo "status: error"
  echo "reason: no skill file at $SKILL_FILE (run from the repository root; check the plugin:skill argument)"
  exit 0
fi

echo "status: ok"
echo "skill-file: $SKILL_FILE"

# Reference files, sorted for a stable listing.
REFS=""
if [ -d "$SKILL_DIR/references" ]; then
  REFS=$(find "$SKILL_DIR/references" -type f 2>/dev/null | sort)
fi
if [ -n "$REFS" ]; then
  echo "reference-files-start"
  echo "$REFS"
  echo "reference-files-end"
else
  echo "reference-files: none"
fi

# Files to scan for agent dispatches: the skill body plus every reference file.
SCAN_FILES="$SKILL_FILE"
if [ -n "$REFS" ]; then
  SCAN_FILES="$SCAN_FILES
$REFS"
fi

# Form 1: subagent_type values. Accepts `subagent_type: "x"`, `subagent_type="x"`,
# and `subagent_type: x`, with or without quotes or backticks.
STRICT=$(echo "$SCAN_FILES" | while IFS= read -r f; do
  [ -f "$f" ] || continue
  grep -oE 'subagent_type[[:space:]]*[:=][[:space:]]*["'"'"'`]?[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?' "$f" 2>/dev/null \
    | sed -E 's/^subagent_type[[:space:]]*[:=][[:space:]]*["'"'"'`]?//'
done | sort -u)

# Form 2: backticked plugin:name tokens.
LOOSE=$(echo "$SCAN_FILES" | while IFS= read -r f; do
  [ -f "$f" ] || continue
  grep -oE '`[A-Za-z0-9_-]+:[A-Za-z0-9_-]+`' "$f" 2>/dev/null | tr -d '`'
done | sort -u)

resolve() {
  # Prints "{plugin}:{agent} {path}" for a qualified or bare name.
  case "$1" in
    *:*) echo "$1 ${1%%:*}/agents/${1#*:}.md" ;;
    *)   echo "$PLUGIN:$1 $PLUGIN/agents/$1.md" ;;
  esac
}

LINES=""
for name in $STRICT; do
  set -- $(resolve "$name")
  if [ -f "$2" ]; then LINES="$LINES
$1 $2 found"; else LINES="$LINES
$1 $2 missing"; fi
done
for name in $LOOSE; do
  set -- $(resolve "$name")
  [ -f "$2" ] && LINES="$LINES
$1 $2 found"
done

LINES=$(echo "$LINES" | sed '/^$/d' | sort -u)
if [ -n "$LINES" ]; then
  echo "agents-start"
  echo "$LINES"
  echo "agents-end"
else
  echo "agents: none"
fi
exit 0
