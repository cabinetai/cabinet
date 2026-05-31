#!/usr/bin/env bash
# Wipe the server-side files that gate the onboarding wizard and tour so
# you can replay the first-run flow. Files are renamed into a timestamped
# backup folder rather than deleted, so a misclick is recoverable.
#
# Usage:
#   scripts/restart-onboarding.sh                # wipes ./data (npm run dev default)
#   CABINET_DATA_DIR=/some/other/dir scripts/restart-onboarding.sh
#
# After running, in the cabinet browser window also clear localStorage:
#   DevTools → Application → Storage → Local Storage → http://localhost:4000
#   delete: cabinet.wizard-done, cabinet.tour-done,
#           cabinet.breaking-changes-warning-ack:v3
#   then Cmd+R.
#
# Or, in the DevTools console (after typing `allow pasting` once):
#   ['cabinet.wizard-done','cabinet.tour-done','cabinet.breaking-changes-warning-ack:v3'].forEach(k => localStorage.removeItem(k)); location.reload();

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${CABINET_DATA_DIR:-$ROOT/data}"
CONFIG_DIR="$DATA_DIR/.agents/.config"
STATE_DIR="$DATA_DIR/.cabinet-state"
BACKUP_DIR="$CONFIG_DIR/.restart-backup-$(date +%s)"

mkdir -p "$BACKUP_DIR"

moved=0
move_if_exists() {
  local src="$1"
  local name="$2"
  if [ -f "$src" ]; then
    mv "$src" "$BACKUP_DIR/$name"
    moved=$((moved + 1))
    echo "  moved $name"
  fi
}

echo "Backing up to: $BACKUP_DIR"
move_if_exists "$CONFIG_DIR/workspace.json"           workspace.json
move_if_exists "$CONFIG_DIR/company.json"             company.json
move_if_exists "$CONFIG_DIR/onboarding-complete.json" onboarding-complete.json
move_if_exists "$STATE_DIR/disclaimer-ack.json"       disclaimer-ack.json

if [ "$moved" -eq 0 ]; then
  rmdir "$BACKUP_DIR" 2>/dev/null || true
  echo "Nothing to wipe — server-side files were already absent."
else
  echo "Done. Now clear localStorage in the cabinet browser window (see header of this script)."
fi
