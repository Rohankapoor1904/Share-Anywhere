#!/usr/bin/env bash
# Build Linux distributables for LocalShare: a .deb and an AppImage.
#
#   ./packaging/linux/build.sh [version]
#
# Requires: flutter, dpkg-deb. AppImage needs appimagetool on PATH (or the
# script prints how to get it); the .deb has no extra dependencies.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${1:-$(sed -n 's/^version: *\([0-9.]*\).*/\1/p' "$ROOT/pubspec.yaml" | head -1)}"
VERSION="${VERSION:-0.1.0}"
ARCH="$(dpkg --print-architecture)"
OUT="$ROOT/build/packages"
BUNDLE="$ROOT/build/linux/x64/release/bundle"

echo "==> Building release bundle (version $VERSION)"
( cd "$ROOT" && flutter build linux --release )

echo "==> Assembling .deb"
DEB_ROOT="$(mktemp -d)"
trap 'rm -rf "$DEB_ROOT"' EXIT
install -d "$DEB_ROOT/DEBIAN" \
           "$DEB_ROOT/opt/localshare" \
           "$DEB_ROOT/usr/bin" \
           "$DEB_ROOT/usr/share/applications" \
           "$DEB_ROOT/usr/share/icons/hicolor/512x512/apps"
cp -r "$BUNDLE/." "$DEB_ROOT/opt/localshare/"
install -m 0644 "$ROOT/assets/icon/localshare_512.png" \
  "$DEB_ROOT/usr/share/icons/hicolor/512x512/apps/localshare.png"
install -m 0644 "$ROOT/packaging/linux/localshare.desktop" \
  "$DEB_ROOT/usr/share/applications/localshare.desktop"
ln -sf /opt/localshare/localshare "$DEB_ROOT/usr/bin/localshare"

SIZE_KB="$(du -sk "$DEB_ROOT/opt" | cut -f1)"
cat > "$DEB_ROOT/DEBIAN/control" <<EOF
Package: localshare
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Installed-Size: $SIZE_KB
Maintainer: LocalShare <noreply@example.invalid>
Depends: libgtk-3-0, libblkid1, liblzma5
Description: Serverless local file sharing
 Discover and transfer files to nearby devices over your local network
 (mDNS, BLE, HTTPS). No accounts, no cloud, no internet servers.
EOF

install -d "$OUT"
dpkg-deb --build --root-owner-group "$DEB_ROOT" "$OUT/localshare_${VERSION}_${ARCH}.deb"
echo "    -> $OUT/localshare_${VERSION}_${ARCH}.deb"

echo "==> Assembling AppImage"
APPDIR="$(mktemp -d)"
trap 'rm -rf "$DEB_ROOT" "$APPDIR"' EXIT
install -d "$APPDIR/usr/bin" "$APPDIR/usr/share/applications" \
           "$APPDIR/usr/share/icons/hicolor/512x512/apps"
cp -r "$BUNDLE/." "$APPDIR/usr/bin/"
install -m 0644 "$ROOT/assets/icon/localshare_512.png" \
  "$APPDIR/usr/share/icons/hicolor/512x512/apps/localshare.png"
cat > "$APPDIR/localshare.desktop" <<EOF
[Desktop Entry]
Name=LocalShare
Exec=localshare
Icon=localshare
Type=Application
Categories=Network;FileTransfer;
EOF
cp "$APPDIR/localshare.desktop" "$APPDIR/usr/share/applications/localshare.desktop"
ln -sf local/share/icons/hicolor/512x512/apps/localshare.png "$APPDIR/localshare.png"
ln -sf usr/bin/localshare "$APPDIR/AppRun"

if command -v appimagetool >/dev/null 2>&1; then
  ARCH_APPIMAGE="$ARCH" appimagetool "$APPDIR" "$OUT/localshare_${VERSION}_${ARCH}.AppImage"
  echo "    -> $OUT/localshare_${VERSION}_${ARCH}.AppImage"
else
  echo "    appimagetool not found; skipping AppImage."
  echo "    Get it: https://github.com/AppImage/AppImageKit/releases"
  echo "    AppDir left at $APPDIR (move it before the trap cleans up to inspect)."
  APPDIR_KEEP="$ROOT/build/appimage/AppDir"
  install -d "$ROOT/build/appimage"
  cp -r "$APPDIR" "$APPDIR_KEEP" 2>/dev/null || true
fi

echo "==> Done. Artifacts in $OUT"
