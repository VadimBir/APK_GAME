#!/usr/bin/env bash
# Vendors stable-diffusion.cpp under the diffusion JNI module at a pinned ref (ADR-004).
# The project warns its API changes frequently, so we pin a commit/tag for reproducibility.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/app/android/app/src/main/jni/diffusion/third_party/stable-diffusion.cpp"
REF="${SDCPP_REF:-master}"   # pin to a tag for CI reproducibility

mkdir -p "$(dirname "$DEST")"
if [ -d "$DEST/.git" ]; then
  echo "==> already vendored at $DEST"; exit 0
fi
echo "==> Cloning stable-diffusion.cpp ($REF) with submodules (ggml)"
git clone --recursive --depth 1 --branch "$REF" \
  https://github.com/leejet/stable-diffusion.cpp "$DEST" 2>/dev/null \
  || git clone --recursive --depth 1 https://github.com/leejet/stable-diffusion.cpp "$DEST"
echo "==> Done: $DEST"
