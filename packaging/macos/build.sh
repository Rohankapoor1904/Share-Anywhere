#!/usr/bin/env bash
# Build LocalShare for macOS: .app (release) and a distributable .dmg.
#
#   ./packaging/macos/build.sh [version]
#
# Run on a Mac with Xcode + Flutter. Codesigning/notarization are left to the
# caller (set CODESIGN_IDENTITY to sign, and use notarytool to notarize).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${1:-$(sed -n 's/^version: *\([0-9.]*\).*/\1/p' "$ROOT/pubspec.yaml" | head -1)}"
VERSION="${VERSION:-0.1.0}"
OUT="$ROOT/build/packages"
APP="$ROOT/build/macos/Build/Products/Release/localshare.app"

# 1. Generate the .icns from the icon set.
ICONSET="$ROOT/build/icon.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
for s in 16 32 64 128 256 512 1024; do
  cp "$ROOT/assets/icon/localshare_${s}.png" "$ICONSET/icon_${s}x${s}.png" 2>/dev/null || true
  d=$((s * 2))
  if [ -f "$ROOT/assets/icon/localshare_${d}.png" ]; then
    cp "$ROOT/assets/icon/localshare_${d}.png" "$ICONSET/icon_${s}x${s}@2x.png"
  fi
done
if command -v iconutil >/dev/null 2>&1; then
  iconutil -c icns "$ICONSET" -o "$ROOT/assets/icon/localshare.icns"
fi

# 2. Build.
( cd "$ROOT" && flutter build macos --release )

if [ -n "${CODESIGN_IDENTITY:-}" ] && command -v codesign >/dev/null 2>&1; then
  echo "==> Codesigning with $CODESIGN_IDENTITY"
  codesign --deep --force --options runtime --sign "$CODESIGN_IDENTITY" "$APP"
fi

# 3. Package a .dmg.
mkdir -p "$OUT"
DMG="$OUT/LocalShare-${VERSION}.dmg"
rm -f "$DMG"
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "LocalShare" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"

echo "==> Done. Artifacts in $OUT"
