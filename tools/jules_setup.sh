#!/usr/bin/env bash
# Jules VM environment setup for LocalShare.
#
# Paste the body of this script into Jules' "environment setup" field
# (repo settings -> Environment). Jules runs it once per fresh VM before it
# touches the repo. It only installs the toolchain; it does NOT modify the repo.
set -euo pipefail

# 1. Linux desktop build dependencies (needed for `flutter build linux`).
sudo apt-get update
sudo apt-get install -y \
  curl git unzip xz-utils zip libglu1-mesa \
  clang cmake ninja-build pkg-config libgtk-3-dev liblzma-dev \
  libstdc++-12-dev xvfb

# 2. Flutter SDK, pinned to the version this project uses.
FLUTTER_VERSION="3.27.1"
FLUTTER_HOME="/opt/flutter"
if [ ! -d "$FLUTTER_HOME" ]; then
  sudo git clone --depth 1 --branch "$FLUTTER_VERSION" \
    https://github.com/flutter/flutter.git "$FLUTTER_HOME"
fi
sudo chown -R "$(id -u):$(id -g)" "$FLUTTER_HOME" 2>/dev/null || true
export PATH="$FLUTTER_HOME/bin:$PATH"

# Make Flutter available to later Jules steps and non-login shells.
grep -q 'FLUTTER_HOME' "$HOME/.bashrc" 2>/dev/null || \
  echo "export PATH=\"$FLUTTER_HOME/bin:\$PATH\"" >> "$HOME/.bashrc"

flutter --version
flutter config --no-analytics >/dev/null 2>&1 || true

# 3. Warm the package cache so the first `flutter test` is fast.
cd "$(dirname "$0")/.." 2>/dev/null || cd "${JULES_WORKSPACE:-$PWD}"
flutter pub get

echo "Jules environment ready."
