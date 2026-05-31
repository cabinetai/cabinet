#!/usr/bin/env bash
set -euo pipefail

APP_URL="${1:-http://localhost:4000}"
DEBUG_PORT="${DEBUG_PORT:-9222}"
VERSION_ENDPOINT="http://127.0.0.1:${DEBUG_PORT}/json/version"
LIST_ENDPOINT="http://127.0.0.1:${DEBUG_PORT}/json/list"
PROFILE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cabinet-chrome-debug.XXXXXX")"

find_browser() {
  local candidates=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  local path_candidates=(
    "google-chrome"
    "google-chrome-stable"
    "chrome"
    "chromium"
    "chromium-browser"
  )

  for candidate in "${path_candidates[@]}"; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      command -v "${candidate}"
      return 0
    fi
  done

  return 1
}

if ! BROWSER_BIN="$(find_browser)"; then
  echo "No supported Chrome/Chromium binary was found." >&2
  echo "Looked for macOS app bundles first, then PATH binaries (google-chrome/chromium)." >&2
  exit 1
fi

echo "Launching ${BROWSER_BIN}"
echo "App URL: ${APP_URL}"
echo "Temporary profile: ${PROFILE_DIR}"

"${BROWSER_BIN}" \
  --remote-debugging-port="${DEBUG_PORT}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  "${APP_URL}" >/dev/null 2>&1 &

for _ in $(seq 1 50); do
  if curl -fsS "${VERSION_ENDPOINT}" >/dev/null 2>&1; then
    echo "DevTools ready."
    echo "${VERSION_ENDPOINT}"
    echo "${LIST_ENDPOINT}"
    curl -fsS "${LIST_ENDPOINT}"
    echo
    exit 0
  fi
  sleep 0.2
done

echo "Chrome was launched, but the DevTools endpoint did not come up in time." >&2
echo "Check whether port ${DEBUG_PORT} is already in use." >&2
exit 1
