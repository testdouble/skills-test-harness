#!/usr/bin/env bash
# Undoes an unpushed formula update: restores Formula/skillwalker.rb, or removes
# the tap folder entirely when it was a temp clone.
# Usage: discard-formula.sh TAP_DIR TEMP
set -euo pipefail

tap_dir=${1:?usage: discard-formula.sh TAP_DIR TEMP}
temp=${2:?usage: discard-formula.sh TAP_DIR TEMP}

if [ "$temp" = "yes" ]; then
  rm -rf "$(dirname "$tap_dir")"
  echo "removed the temp clone"
else
  git -C "$tap_dir" checkout --quiet -- Formula/skillwalker.rb
  echo "restored Formula/skillwalker.rb in $tap_dir"
fi
