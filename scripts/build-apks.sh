#!/usr/bin/env bash
# Builds BOTH deliverables (R11):
#   1) DEBUG / free-unlock APK  (billing bypassed, R10b)
#   2) RELEASE / real-billing APK (Play Billing, R10a; signed if keystore present)
# Run scripts/fork-pocketpal.sh and scripts/setup-android-sdk.sh first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/dist"
mkdir -p "$OUT"

: "${ANDROID_SDK_ROOT:?Run scripts/setup-android-sdk.sh and export ANDROID_SDK_ROOT}"

echo "==> Installing JS deps (yarn)"
cd "$APP"
corepack enable >/dev/null 2>&1 || true
yarn install --frozen-lockfile

echo "==> Bundling JS is handled by Gradle; building native + APKs"
cd "$APP/android"

# Pocket Pal keeps one shippable flavor: distribution{prod}. The two deliverables come
# from BUILD TYPE: debug -> BILLING_BYPASS=true (free unlock), release -> false (real).
echo "==> [1/2] DEBUG free-unlock APK (prodDebug, R10b)"
./gradlew assembleProdDebug
find "$APP/android/app/build/outputs/apk" -name '*prod*debug*.apk' -exec cp {} "$OUT/arcane-terminal-debug-freeunlock.apk" \; || true

echo "==> [2/2] RELEASE real-billing APK (prodRelease, R10a)"
# Signs with the release keystore if APP_RELEASE_* env / key are present, else debug-signs.
./gradlew assembleProdRelease || echo "!! release build failed — check signing/native config"
find "$APP/android/app/build/outputs/apk" -name '*prod*release*.apk' -exec cp {} "$OUT/arcane-terminal-release.apk" \; || true

echo "==> Artifacts in $OUT:"
ls -la "$OUT"
