#!/usr/bin/env bash
#
# Build a production bundle and package it into a Chrome Web Store-ready zip.
#
# The archive contains ONLY the contents of dist/, so manifest.json lands at
# the root of the zip (exactly one manifest -> no "More than one manifest
# found" rejection). Promo images under store/ are excluded because they belong
# on the store listing, not inside the extension package.
#
# Usage:
#   npm run package            # clean production build, then zip
#   SKIP_BUILD=1 npm run package   # zip the existing dist/ without rebuilding
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"

cd "$PROJECT_ROOT"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Building production bundle (npm run build)"
  npm run build
else
  echo "==> SKIP_BUILD=1 set; packaging existing dist/ without rebuilding"
fi

if [[ ! -f "$DIST_DIR/manifest.json" ]]; then
  echo "ERROR: $DIST_DIR/manifest.json not found. Did the build succeed?" >&2
  exit 1
fi

# Guard against the exact failure that got the last upload rejected: there must
# be exactly one manifest.json anywhere in the tree we are about to zip.
manifest_count="$(find "$DIST_DIR" -name manifest.json | wc -l | tr -d ' ')"
if [[ "$manifest_count" != "1" ]]; then
  echo "ERROR: expected exactly one manifest.json in dist/, found $manifest_count:" >&2
  find "$DIST_DIR" -name manifest.json >&2
  exit 1
fi

# Guard against shipping a *development* build. When Vite/CRXJS runs in dev mode
# it writes a dist/ whose service worker and content scripts `import` code from
# the local dev server (http://localhost:5173/@vite/env, /@crx/client, ...).
# Uploading that gets rejected for "Including remotely hosted code in a Manifest
# V3 item." Fail loudly here instead of at the Chrome Web Store.
#
# We scan every packaged file (skipping source maps, which are excluded from the
# zip anyway) for the unambiguous dev-server / remote-import markers. Runtime API
# URLs like https://api.canvasjob.com are fine — those are fetch() targets, not
# code imports — so we deliberately do NOT flag bare https:// strings.
remote_hits="$(
  grep -rlaE "localhost:5173|/@vite/|/@crx/client|from[[:space:]]*['\"]https?://|import[[:space:](]*['\"]https?://" "$DIST_DIR" \
    --exclude='*.map' 2>/dev/null || true
)"
if [[ -n "$remote_hits" ]]; then
  echo "ERROR: dist/ contains remotely hosted / dev-server code. This is a" >&2
  echo "       development build and will be rejected by the Chrome Web Store." >&2
  echo "       Rebuild for production (npm run build) before packaging." >&2
  echo "       Offending files:" >&2
  echo "$remote_hits" | sed 's/^/         /' >&2
  exit 1
fi

# Name the archive after the version Chrome actually reads (the manifest),
# not package.json, so the filename never lies about what is inside.
NAME="$(node -p "require('$DIST_DIR/manifest.json').name" | tr ' ' '-')"
VERSION="$(node -p "require('$DIST_DIR/manifest.json').version")"
OUT_FILE="$PROJECT_ROOT/${NAME}-${VERSION}.zip"

rm -f "$OUT_FILE"

# Zip from *inside* dist/ so every path is relative to the dist root. This is
# what guarantees manifest.json sits at the archive root and no stray project
# files (e.g. the source manifest.json) can sneak in.
(
  cd "$DIST_DIR"
  zip -r -X "$OUT_FILE" . \
    -x '.DS_Store' \
    -x '**/.DS_Store' \
    -x 'store/*' \
    -x '*.map' >/dev/null
)

echo
echo "==> Packaged: $OUT_FILE"
echo "    manifest: $NAME v$VERSION"
echo
echo "Archive contents:"
unzip -l "$OUT_FILE"
