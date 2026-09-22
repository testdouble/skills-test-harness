#!/usr/bin/env bash
# Validate a generated scaffold against the constraints in SKILL.md.
#
# Usage: validate-scaffold.sh {scaffold-dir}
#
# Emits structured key: value pairs on stdout and always exits 0 so the skill
# can read the findings and fix them rather than crash on a violation.
#
# Output keys:
#   status            one of: ok | violations | error
#   reason            (only when status=error) explanation for the operator
#   scaffold-dir      the directory that was checked
#   files-checked     number of regular files under the scaffold
#   syntax-checkers   space-separated list of `{ext}={tool}` pairs used, or "none"
#   syntax-unchecked  space-separated list of source extensions present that no
#                     available tool could check, or "none"
#   errors            count of error-severity findings
#   warnings          count of warning-severity findings
#   findings-start / findings-end
#                     wrap one finding per line: `{error|warning} {path} {message}`
#   findings: none    when nothing was found
#
# Checks:
#   error    a .git directory anywhere in the scaffold
#   error    a lock file (package-lock.json, yarn.lock, pnpm-lock.yaml,
#            Gemfile.lock, go.sum, Cargo.lock, poetry.lock, Pipfile.lock,
#            composer.lock) — allowed only when it is itself a planted signal
#   error    a dependency directory (node_modules, vendor, __pycache__, .venv,
#            venv, .bundle)
#   error    a marker comment that labels a planted signal (BUG HERE,
#            INTENTIONAL ISSUE/BUG/FLAW, PLANTED SIGNAL, TEST FIXTURE)
#   error    a source file that fails a syntax check with an available tool
#   warning  an application source file outside the 50-150 line range (files
#            under config/, spec/, test/, tests/, __tests__/ and index.* barrels
#            are skipped)
# status is `violations` when any error was found; warnings alone leave it `ok`.

DIR="${1%/}"

if [ -z "$DIR" ]; then
  echo "status: error"
  echo "reason: usage: validate-scaffold.sh {scaffold-dir}"
  exit 0
fi
if [ ! -d "$DIR" ]; then
  echo "status: error"
  echo "reason: $DIR is not a directory"
  exit 0
fi

echo "scaffold-dir: $DIR"

FINDINGS=""
add() { FINDINGS="$FINDINGS
$1 $2 $3"; }

# --- forbidden directories -------------------------------------------------
for d in .git node_modules vendor __pycache__ .venv venv .bundle; do
  find "$DIR" -type d -name "$d" 2>/dev/null | sort | while IFS= read -r hit; do
    case "$d" in
      .git) echo "error $hit .git directory; Skillwalker runs git init itself" ;;
      *)    echo "error $hit dependency directory; remove it" ;;
    esac
  done
done > "${TMPDIR:-/tmp}/validate-scaffold.$$"
FINDINGS="$FINDINGS
$(cat "${TMPDIR:-/tmp}/validate-scaffold.$$")"

# Regular files, excluding anything inside a forbidden directory.
FILES=$(find "$DIR" -type f \
  -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/vendor/*' \
  -not -path '*/__pycache__/*' -not -path '*/.venv/*' -not -path '*/venv/*' \
  -not -path '*/.bundle/*' 2>/dev/null | sort)
COUNT=$(printf '%s\n' "$FILES" | sed '/^$/d' | wc -l | tr -d ' ')
echo "files-checked: $COUNT"

# --- lock files --------------------------------------------------------------
printf '%s\n' "$FILES" | while IFS= read -r f; do
  case "$(basename "$f")" in
    package-lock.json|yarn.lock|pnpm-lock.yaml|Gemfile.lock|go.sum|Cargo.lock|poetry.lock|Pipfile.lock|composer.lock)
      echo "error $f lock file; remove unless it is itself a planted signal" ;;
  esac
done > "${TMPDIR:-/tmp}/validate-scaffold.$$"
FINDINGS="$FINDINGS
$(cat "${TMPDIR:-/tmp}/validate-scaffold.$$")"

# --- marker comments ---------------------------------------------------------
printf '%s\n' "$FILES" | while IFS= read -r f; do
  [ -f "$f" ] || continue
  grep -niE 'BUG HERE|INTENTIONAL(LY)? ?(ISSUE|BUG|FLAW|VULNERAB)|PLANTED SIGNAL|TEST FIXTURE' "$f" 2>/dev/null \
    | while IFS= read -r line; do
        n="${line%%:*}"
        echo "error $f:$n marker comment labels a planted signal; signals must look like real code"
      done
done > "${TMPDIR:-/tmp}/validate-scaffold.$$"
FINDINGS="$FINDINGS
$(cat "${TMPDIR:-/tmp}/validate-scaffold.$$")"

# --- source files: line counts and syntax --------------------------------------
SOURCE_EXT='js|mjs|cjs|jsx|ts|tsx|py|rb|go|rs|java|kt|cs|php|swift|ex|exs|scala|c|cc|cpp|h|hpp|sh'
CHECKERS=""
UNCHECKED=""
note_checker()   { case " $CHECKERS " in *" $1 "*) ;; *) CHECKERS="$CHECKERS $1" ;; esac; }
note_unchecked() { case " $UNCHECKED " in *" $1 "*) ;; *) UNCHECKED="$UNCHECKED $1" ;; esac; }

SRC_FINDINGS=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  ext="${f##*.}"
  echo "$ext" | grep -qE "^($SOURCE_EXT)$" || continue

  # Line-count guidance targets application source. Config, test, and barrel
  # files are legitimately short, so skip them.
  countable=1
  case "$f" in
    */config/*|*/spec/*|*/test/*|*/tests/*|*/__tests__/*|*/index.*) countable=0 ;;
  esac
  lines=$(wc -l < "$f" | tr -d ' ')
  if [ "$countable" -eq 0 ]; then
    :
  elif [ "$lines" -lt 50 ]; then
    SRC_FINDINGS="$SRC_FINDINGS
warning $f $lines lines; source files should run roughly 50-150 lines unless a short file is deliberate"
  elif [ "$lines" -gt 150 ]; then
    SRC_FINDINGS="$SRC_FINDINGS
warning $f $lines lines; source files should run roughly 50-150 lines so signals are not buried"
  fi

  ok=1; tool=""
  case "$ext" in
    js|mjs|cjs)
      if command -v node >/dev/null 2>&1; then tool=node; node --check "$f" >/dev/null 2>&1 || ok=0; fi ;;
    py)
      if command -v python3 >/dev/null 2>&1; then tool=python3
        python3 -c 'import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])' "$f" >/dev/null 2>&1 || ok=0; fi ;;
    rb)
      if command -v ruby >/dev/null 2>&1; then tool=ruby; ruby -c "$f" >/dev/null 2>&1 || ok=0; fi ;;
    go)
      if command -v gofmt >/dev/null 2>&1; then tool=gofmt; gofmt -e "$f" >/dev/null 2>&1 || ok=0; fi ;;
    php)
      if command -v php >/dev/null 2>&1; then tool=php; php -l "$f" >/dev/null 2>&1 || ok=0; fi ;;
    sh)
      tool=bash; bash -n "$f" >/dev/null 2>&1 || ok=0 ;;
  esac
  if [ -n "$tool" ]; then
    note_checker "$ext=$tool"
    [ "$ok" -eq 1 ] || SRC_FINDINGS="$SRC_FINDINGS
error $f fails syntax check ($tool); the file must parse apart from intentional logic bugs"
  else
    note_unchecked "$ext"
  fi
done <<EOT
$FILES
EOT
FINDINGS="$FINDINGS
$SRC_FINDINGS"

# JSON files parse with python3 or jq when either is present.
JSON_FINDINGS=""
JSON_TOOL=""
if command -v python3 >/dev/null 2>&1; then JSON_TOOL=python3
elif command -v jq >/dev/null 2>&1; then JSON_TOOL=jq; fi
if [ -n "$JSON_TOOL" ]; then
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    case "$f" in *.json) ;; *) continue ;; esac
    note_checker "json=$JSON_TOOL"
    if [ "$JSON_TOOL" = python3 ]; then
      python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" >/dev/null 2>&1 || JSON_FINDINGS="$JSON_FINDINGS
error $f invalid JSON ($JSON_TOOL)"
    else
      jq empty "$f" >/dev/null 2>&1 || JSON_FINDINGS="$JSON_FINDINGS
error $f invalid JSON ($JSON_TOOL)"
    fi
  done <<EOT
$FILES
EOT
fi
FINDINGS="$FINDINGS
$JSON_FINDINGS"

rm -f "${TMPDIR:-/tmp}/validate-scaffold.$$"

echo "syntax-checkers:${CHECKERS:- none}"
echo "syntax-unchecked:${UNCHECKED:- none}"

FINDINGS=$(printf '%s\n' "$FINDINGS" | sed '/^[[:space:]]*$/d')
ERRORS=$(printf '%s\n' "$FINDINGS" | grep -c '^error ' | tr -d ' ')
WARNINGS=$(printf '%s\n' "$FINDINGS" | grep -c '^warning ' | tr -d ' ')
echo "errors: $ERRORS"
echo "warnings: $WARNINGS"
if [ -n "$FINDINGS" ]; then
  echo "findings-start"
  printf '%s\n' "$FINDINGS"
  echo "findings-end"
else
  echo "findings: none"
fi
if [ "$ERRORS" -gt 0 ]; then echo "status: violations"; else echo "status: ok"; fi
exit 0
