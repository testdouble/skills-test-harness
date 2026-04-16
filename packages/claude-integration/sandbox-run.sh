#!/bin/sh
set -e

SCAFFOLD_PATH="$1"
shift

# Read plugin dir count and collect plugin dir paths
PLUGIN_DIR_COUNT="$1"
shift

PLUGIN_DIRS=""
i=0
while [ "$i" -lt "$PLUGIN_DIR_COUNT" ]; do
  DIR="$1"
  shift
  LOCAL_DIR=$(mktemp -d)
  cp -r "$DIR/." "$LOCAL_DIR/"
  PLUGIN_DIRS="$PLUGIN_DIRS $LOCAL_DIR"
  i=$((i + 1))
done

# Remaining args are claude args (without --plugin-dir flags)

# Always create a working directory and init git for file extraction
WORK=$(mktemp -d)

if [ -n "$SCAFFOLD_PATH" ] && [ -d "$SCAFFOLD_PATH" ]; then
  cp -r "$SCAFFOLD_PATH/." "$WORK/"
fi

cd "$WORK"
git init -b main -q
git config user.email "test@test.com"
git config user.name "Test"
git add -A
git commit -q -m "Initial commit" --allow-empty

# Write workdir path so sandbox-extract.sh can find it after execution
echo "$WORK" > /tmp/last-workdir

# Build plugin dir flags safely (no eval needed)
PLUGIN_FLAGS=""
for d in $PLUGIN_DIRS; do
  PLUGIN_FLAGS="$PLUGIN_FLAGS --plugin-dir $d"
done

# Use exec with explicit args to avoid eval quoting issues
exec claude $PLUGIN_FLAGS "$@"
