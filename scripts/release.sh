#!/usr/bin/env bash
set -euo pipefail

# Cabinet Release Script
# Usage: ./scripts/release.sh [patch|minor|major]
# Default: patch

BUMP_TYPE="${1:-patch}"

# Get current version
CURRENT=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT"

# Calculate next version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
case "$BUMP_TYPE" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  *) echo "Usage: $0 [patch|minor|major]"; exit 1 ;;
esac
VERSION="$MAJOR.$MINOR.$PATCH"
TAG="v$VERSION"

echo "Bumping to: $VERSION ($BUMP_TYPE)"
echo ""

# 1. Bump versions
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$VERSION\"/" package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" cli/package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" cabinetai/package.json
npm install --package-lock-only --silent
npm run release:manifest -- --tag "$TAG"

echo ""
echo "Versions bumped. Manifest generated."

# 2. Commit, tag, push
git add package.json cli/package.json cabinetai/package.json package-lock.json cabinet-release.json
git commit -m "Release $TAG"
git tag "$TAG"
git push origin main
git push origin "$TAG"

echo ""
echo "========================================="
echo "  Released $TAG"
echo "========================================="
echo ""
echo "GitHub Actions is now running 4 jobs:"
echo "  1. GitHub Release + cabinet-release.json"
echo "  2. npm publish create-cabinet@$VERSION"
echo "  3. npm publish cabinetai@$VERSION"
echo "  4. macOS Electron DMG + ZIP (signed)"
echo ""
echo "Watch progress:"
echo "  gh run list --limit 1 -R hilash/cabinet"
echo "  gh run watch \$(gh run list --limit 1 -R hilash/cabinet --json databaseId -q '.[0].databaseId')"
echo ""
echo "Verify after completion:"
echo "  npm view create-cabinet version"
echo "  npm view cabinetai version"
echo "  gh release view $TAG -R hilash/cabinet"
