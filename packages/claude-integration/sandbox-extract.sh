#!/bin/sh
set -e

# Extract files written during a test run by diffing against the initial git commit.
# Reads the workdir path from /tmp/last-workdir (written by sandbox-run.sh).
# Emits JSONL to stdout: one {"path":"...","content":"..."} per changed/new file.
# Skips binary files and files over 5MB. Caps total output at 5MB.

MAX_FILE_SIZE=$((5 * 1024 * 1024))
MAX_TOTAL_SIZE=$((5 * 1024 * 1024))

if [ ! -f /tmp/last-workdir ]; then
  exit 0
fi

WORK=$(cat /tmp/last-workdir)
if [ ! -d "$WORK" ]; then
  exit 0
fi

cd "$WORK"

# Collect changed tracked files and new untracked files
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null || true)
UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null || true)

ALL_FILES=$(printf '%s\n%s' "$CHANGED_FILES" "$UNTRACKED_FILES" | sort -u | grep -v '^$' || true)

if [ -z "$ALL_FILES" ]; then
  exit 0
fi

total_size=0

echo "$ALL_FILES" | while IFS= read -r filepath; do
  [ -z "$filepath" ] && continue
  [ ! -f "$filepath" ] && continue

  # Skip files over 5MB
  file_size=$(wc -c < "$filepath")
  if [ "$file_size" -gt "$MAX_FILE_SIZE" ]; then
    echo "Warning: skipping $filepath (${file_size} bytes > ${MAX_FILE_SIZE} limit)" >&2
    continue
  fi

  # Skip binary files (check if file contains null bytes)
  if grep -qP '\x00' "$filepath" 2>/dev/null; then
    echo "Warning: skipping binary file $filepath" >&2
    continue
  fi

  # Check total size cap
  new_total=$((total_size + file_size))
  if [ "$new_total" -gt "$MAX_TOTAL_SIZE" ]; then
    # Emit path-only entry with truncation marker
    printf '{"path":"%s","content":"[truncated: total extraction size limit reached]"}\n' \
      "$(echo "$filepath" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    continue
  fi
  total_size=$new_total

  # Read content and JSON-escape it, then emit JSONL line
  # Use python if available for reliable JSON escaping, fall back to sed
  if command -v python3 >/dev/null 2>&1; then
    content=$(python3 -c "
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8', errors='replace') as f:
    data = f.read()
print(json.dumps({'path': sys.argv[1], 'content': data}))
" "$filepath")
    printf '%s\n' "$content"
  else
    # Fallback: use awk for JSON escaping
    content=$(awk '
      BEGIN { ORS="" }
      NR>1 { printf "\\n" }
      {
        gsub(/\\/, "\\\\")
        gsub(/"/, "\\\"")
        gsub(/\t/, "\\t")
        gsub(/\r/, "\\r")
        print
      }
    ' "$filepath")
    printf '{"path":"%s","content":"%s"}\n' \
      "$(echo "$filepath" | sed 's/\\/\\\\/g; s/"/\\"/g')" \
      "$content"
  fi
done
