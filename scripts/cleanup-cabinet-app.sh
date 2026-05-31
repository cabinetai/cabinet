#!/usr/bin/env bash
# Remove every trace of the packaged Cabinet desktop app on macOS:
# the .app bundle, user data (notes, agents, sqlite), caches, preferences,
# saved state, web storage, logs, and the auto-updater's ShipIt cache.
#
# This is destructive. Cabinet stores your workspace under
#   ~/Library/Application Support/Cabinet/cabinet-data
# and this script deletes it. Back up first if you want to keep anything.
#
# Usage:
#   scripts/cleanup-cabinet-app.sh           # prompts before deleting
#   scripts/cleanup-cabinet-app.sh --yes     # skip the confirmation
#   scripts/cleanup-cabinet-app.sh --dry-run # print targets, delete nothing

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script only supports macOS." >&2
  exit 1
fi

ASSUME_YES=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    -n|--dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

APP_NAME="Cabinet"
BUNDLE_ID="com.runcabinet.cabinet"
HOME_LIB="$HOME/Library"

TARGETS=(
  "/Applications/${APP_NAME}.app"
  "${HOME_LIB}/Application Support/${APP_NAME}"
  "${HOME_LIB}/Caches/${APP_NAME}"
  "${HOME_LIB}/Caches/${BUNDLE_ID}"
  "${HOME_LIB}/Caches/${BUNDLE_ID}.ShipIt"
  "${HOME_LIB}/HTTPStorages/${BUNDLE_ID}"
  "${HOME_LIB}/HTTPStorages/${BUNDLE_ID}.binarycookies"
  "${HOME_LIB}/WebKit/${BUNDLE_ID}"
  "${HOME_LIB}/Preferences/${BUNDLE_ID}.plist"
  "${HOME_LIB}/Saved Application State/${BUNDLE_ID}.savedState"
  "${HOME_LIB}/Logs/${APP_NAME}"
)

echo "Targets:"
existing=()
for t in "${TARGETS[@]}"; do
  if [ -e "$t" ]; then
    echo "  [present] $t"
    existing+=("$t")
  else
    echo "  [absent ] $t"
  fi
done

# Mounted DMG volumes (e.g. /Volumes/Cabinet 0.4.1-arm64)
mounted_volumes=()
while IFS= read -r vol; do
  [ -n "$vol" ] && mounted_volumes+=("$vol")
done < <(ls -d /Volumes/${APP_NAME}* 2>/dev/null || true)

if [ ${#mounted_volumes[@]} -gt 0 ]; then
  echo "Mounted DMG volumes (will be unmounted):"
  for v in "${mounted_volumes[@]}"; do
    echo "  $v"
  done
fi

if [ ${#existing[@]} -eq 0 ] && [ ${#mounted_volumes[@]} -eq 0 ]; then
  echo "Nothing to do — no Cabinet artifacts found."
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run — no changes made."
  exit 0
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  echo
  echo "This will permanently delete your Cabinet workspace and all listed paths."
  read -r -p "Type 'yes' to continue: " reply
  if [ "$reply" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# Quit the app if it's running so file handles release.
if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
  echo "Quitting running ${APP_NAME}..."
  osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    pgrep -x "$APP_NAME" >/dev/null 2>&1 || break
    sleep 1
  done
  pkill -x "$APP_NAME" 2>/dev/null || true
fi

# Unmount any mounted DMG volumes.
if [ ${#mounted_volumes[@]} -gt 0 ]; then
  for v in "${mounted_volumes[@]}"; do
    echo "Unmounting $v"
    hdiutil detach "$v" -quiet 2>/dev/null || hdiutil detach "$v" -force -quiet 2>/dev/null || true
  done
fi

# Remove every existing target.
if [ ${#existing[@]} -gt 0 ]; then
  for t in "${existing[@]}"; do
    echo "Removing $t"
    rm -rf -- "$t"
  done
fi

# Drop any cached LaunchServices registration for the bundle id.
LS_REG="/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister"
if [ -x "$LS_REG" ]; then
  "$LS_REG" -u "/Applications/${APP_NAME}.app" >/dev/null 2>&1 || true
fi

echo "Done. Cabinet desktop app and all known data have been removed."
echo "Note: the installer DMG in ~/Downloads (if any) was not touched."
