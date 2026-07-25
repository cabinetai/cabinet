#!/usr/bin/env bash

set -euo pipefail

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean." >&2
  exit 1
fi

starting_branch="$(git branch --show-current)"
if [[ "$starting_branch" != "main" ]]; then
  echo "Run this script from main." >&2
  exit 1
fi

git fetch upstream
git fetch origin
git switch upstream-main
git reset --hard upstream/main
git push --force-with-lease origin upstream-main
git switch main
git merge --no-ff upstream-main

echo "Merged upstream-main into main."
echo "Run: npm ci && npm test && npm run lint && npm run build"
echo "Then push main after validation."
