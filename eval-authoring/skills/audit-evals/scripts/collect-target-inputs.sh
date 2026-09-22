#!/usr/bin/env bash
# Collect the inputs /audit-evals compares an eval against.
#
# Usage: collect-target-inputs.sh {plugin} {name}
#
# Run from the repository root. Resolves {name} as a skill first
# ({plugin}/skills/{name}/SKILL.md), then as an agent ({plugin}/agents/{name}.md).
# Emits structured key: value pairs on stdout and always exits 0.
#
# Output keys:
#   status            one of: ok | error
#   reason            (only when status=error) explanation for the operator
#   target-type       skill | agent
#   target-file       path to the SKILL.md or agent definition
#   eval-dir         evals/{name}
#   eval-exists      true | false
#   reference-files-start / reference-files-end   (skills only)
#   reference-files: none
#   agents-start / agents-end
#                     one line per dispatched agent: `{plugin}:{agent} {path} {found|missing}`
#   agents: none
#   siblings-start / siblings-end
#                     one line per other skill or agent in the plugin: `{skill|agent} {plugin}:{name} {path}`
#   siblings: none
#
# Agent detection scans the target and its references for subagent_type values
# (always reported) and backticked plugin:name tokens (reported only when they
# resolve to an agent file). Values resolve in the plugin that defines the agent.

PLUGIN="$1"
NAME="$2"

if [ -z "$PLUGIN" ] || [ -z "$NAME" ]; then
  echo "status: error"; echo "reason: usage: collect-target-inputs.sh {plugin} {name}"; exit 0
fi

if [ -f "$PLUGIN/skills/$NAME/SKILL.md" ]; then
  TYPE=skill; TARGET="$PLUGIN/skills/$NAME/SKILL.md"; TDIR="$PLUGIN/skills/$NAME"
elif [ -f "$PLUGIN/agents/$NAME.md" ]; then
  TYPE=agent; TARGET="$PLUGIN/agents/$NAME.md"; TDIR=""
else
  echo "status: error"
  echo "reason: no skill at $PLUGIN/skills/$NAME/SKILL.md and no agent at $PLUGIN/agents/$NAME.md (run from the repository root)"
  exit 0
fi

echo "status: ok"
echo "target-type: $TYPE"
echo "target-file: $TARGET"
echo "eval-dir: evals/$NAME"
if [ -f "evals/$NAME/tests.json" ]; then echo "eval-exists: true"; else echo "eval-exists: false"; fi

REFS=""
if [ -n "$TDIR" ] && [ -d "$TDIR/references" ]; then
  REFS=$(find "$TDIR/references" -type f 2>/dev/null | sort)
fi
if [ -n "$REFS" ]; then
  echo "reference-files-start"; echo "$REFS"; echo "reference-files-end"
else
  echo "reference-files: none"
fi

SCAN_FILES="$TARGET"
[ -n "$REFS" ] && SCAN_FILES="$SCAN_FILES
$REFS"

STRICT=$(echo "$SCAN_FILES" | while IFS= read -r f; do
  [ -f "$f" ] || continue
  grep -oE 'subagent_type[[:space:]]*[:=][[:space:]]*["'"'"'`]?[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?' "$f" 2>/dev/null \
    | sed -E 's/^subagent_type[[:space:]]*[:=][[:space:]]*["'"'"'`]?//'
done | sort -u)
LOOSE=$(echo "$SCAN_FILES" | while IFS= read -r f; do
  [ -f "$f" ] || continue
  grep -oE '`[A-Za-z0-9_-]+:[A-Za-z0-9_-]+`' "$f" 2>/dev/null | tr -d '`'
done | sort -u)

resolve() {
  case "$1" in
    *:*) echo "$1 ${1%%:*}/agents/${1#*:}.md" ;;
    *)   echo "$PLUGIN:$1 $PLUGIN/agents/$1.md" ;;
  esac
}
LINES=""
for n in $STRICT; do
  set -- $(resolve "$n")
  if [ -f "$2" ]; then LINES="$LINES
$1 $2 found"; else LINES="$LINES
$1 $2 missing"; fi
done
for n in $LOOSE; do
  set -- $(resolve "$n")
  [ -f "$2" ] && LINES="$LINES
$1 $2 found"
done
LINES=$(echo "$LINES" | sed '/^$/d' | sort -u)
if [ -n "$LINES" ]; then
  echo "agents-start"; echo "$LINES"; echo "agents-end"
else
  echo "agents: none"
fi

SIBS=""
for f in $(find "$PLUGIN/skills" -mindepth 2 -maxdepth 2 -name SKILL.md 2>/dev/null | sort); do
  s=$(basename "$(dirname "$f")")
  [ "$TYPE" = skill ] && [ "$s" = "$NAME" ] && continue
  SIBS="$SIBS
skill $PLUGIN:$s $f"
done
for f in $(find "$PLUGIN/agents" -maxdepth 1 -name '*.md' 2>/dev/null | sort); do
  a=$(basename "$f" .md)
  [ "$TYPE" = agent ] && [ "$a" = "$NAME" ] && continue
  SIBS="$SIBS
agent $PLUGIN:$a $f"
done
SIBS=$(echo "$SIBS" | sed '/^$/d')
if [ -n "$SIBS" ]; then
  echo "siblings-start"; echo "$SIBS"; echo "siblings-end"
else
  echo "siblings: none"
fi
exit 0
