#!/usr/bin/env bash
# Build the game and commit it to the local `gh-pages` branch.
# Then publish with:  git push origin gh-pages
# (GitHub Pages: Settings → Pages → Source "Deploy from a branch" → gh-pages / root)
set -euo pipefail
cd "$(dirname "$0")/.."

GITHUB_PAGES=true npx vite build
cp dist/index.html dist/404.html   # SPA fallback
touch dist/.nojekyll

SRC_SHA=$(git rev-parse --short HEAD)
TMP=$(mktemp -d)
git worktree add -f "$TMP" gh-pages 2>/dev/null || git worktree add -f -b gh-pages "$TMP"
# replace the branch contents with the fresh build
git -C "$TMP" rm -rq --ignore-unmatch . || true
cp -R dist/. "$TMP"/
git -C "$TMP" add -A
git -C "$TMP" commit -qm "Deploy ${SRC_SHA}" || echo "Nothing changed"
git worktree remove --force "$TMP"
echo "Listo. Publica con: git push origin gh-pages"
