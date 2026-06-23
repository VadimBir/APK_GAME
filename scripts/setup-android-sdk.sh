#!/usr/bin/env bash
# Installs the Android command-line tools + the exact SDK/NDK Pocket Pal needs.
# Idempotent: safe to re-run. Honors $ANDROID_SDK_ROOT (default: $HOME/android-sdk).
set -euo pipefail

SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/android-sdk}"
CMDLINE_VER="11076708"   # cmdline-tools 12.0 (stable as of 2025/2026)
NDK_VER="27.3.13750724"  # required by Pocket Pal (docs/RESEARCH.md)
BUILD_TOOLS="36.0.0"
PLATFORM="android-36"

echo "==> Android SDK root: $SDK_ROOT"
mkdir -p "$SDK_ROOT/cmdline-tools"

if [ ! -d "$SDK_ROOT/cmdline-tools/latest" ]; then
  echo "==> Downloading command-line tools"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/cmdtools.zip" \
    "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_VER}_latest.zip"
  unzip -q "$tmp/cmdtools.zip" -d "$tmp"
  mkdir -p "$SDK_ROOT/cmdline-tools/latest"
  mv "$tmp/cmdline-tools/"* "$SDK_ROOT/cmdline-tools/latest/"
  rm -rf "$tmp"
fi

export ANDROID_SDK_ROOT="$SDK_ROOT"
export ANDROID_HOME="$SDK_ROOT"
SDKMANAGER="$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"

echo "==> Accepting licenses"
yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true

echo "==> Installing platform-tools, $PLATFORM, build-tools $BUILD_TOOLS, NDK $NDK_VER"
"$SDKMANAGER" --install \
  "platform-tools" \
  "platforms;$PLATFORM" \
  "build-tools;$BUILD_TOOLS" \
  "ndk;$NDK_VER" \
  "cmake;3.22.1"

echo "==> Writing local.properties hint"
echo "sdk.dir=$SDK_ROOT" > "$(dirname "$0")/../app/android/local.properties" 2>/dev/null || true

cat <<EOF

==> DONE. Add these to your shell / CI env:
    export ANDROID_SDK_ROOT="$SDK_ROOT"
    export ANDROID_HOME="$SDK_ROOT"
    export PATH="\$PATH:$SDK_ROOT/platform-tools:$SDK_ROOT/cmdline-tools/latest/bin"
    NDK: $SDK_ROOT/ndk/$NDK_VER
EOF
