#!/usr/bin/env bash
# Vendors the Pocket Pal AI source into app/ as our fork base, then applies the
# ARCANE TERMINAL graft (diffusion module, game screen, billing flavors).
# Idempotent-ish: re-running re-applies the graft over a fresh checkout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
PP_REPO="https://github.com/a-ghorbani/pocketpal-ai.git"
PP_REF="${POCKETPAL_REF:-main}"   # pin to a tag for reproducibility in CI

echo "==> Cloning Pocket Pal ($PP_REF)"
tmp="$(mktemp -d)"
git clone --depth 1 --branch "$PP_REF" "$PP_REPO" "$tmp/pp" 2>/dev/null \
  || git clone --depth 1 "$PP_REPO" "$tmp/pp"

# Strip the upstream git history; we vendor the source into our repo.
rm -rf "$tmp/pp/.git"

echo "==> Vendoring into app/ (preserving our app/graft and app/autocheck)"
mkdir -p "$APP"
# copy everything except dirs we own
rsync -a --exclude 'graft/' --exclude 'autocheck/' "$tmp/pp/" "$APP/"
rm -rf "$tmp"

echo "==> Applying ARCANE TERMINAL graft"
"$ROOT/scripts/apply-graft.sh"

echo "==> DONE. Next: scripts/setup-android-sdk.sh && scripts/build-apks.sh"
