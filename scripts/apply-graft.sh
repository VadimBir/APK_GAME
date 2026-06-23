#!/usr/bin/env bash
# Applies the ARCANE TERMINAL graft onto a vendored Pocket Pal checkout in app/.
# Idempotent where practical. Run by fork-pocketpal.sh, or standalone after a fork.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
GRAFT="$APP/graft"
JAVA_DIR="$APP/android/app/src/main/java/com/pocketpal"
GRADLE="$APP/android/app/build.gradle"
# MainApplication.kt lives under a com/pocketpalai/ directory but declares package
# com.pocketpal — locate it rather than assuming the path.
MAINAPP="$(find "$APP/android/app/src/main/java" -name MainApplication.kt | head -1)"

[ -d "$APP/src" ] || { echo "!! app/ is not a Pocket Pal checkout — run scripts/fork-pocketpal.sh first"; exit 1; }

echo "==> 1. Vendor tested core logic into app/src/core"
rm -rf "$APP/src/core"
mkdir -p "$APP/src/core"
cp -r "$ROOT/core/src/." "$APP/src/core/"

echo "==> 2. Copy graft TS sources into app/src"
cp -r "$GRAFT/src/game"      "$APP/src/"
cp -r "$GRAFT/src/diffusion" "$APP/src/"
cp -r "$GRAFT/src/billing"   "$APP/src/"
cp -r "$GRAFT/src/models"    "$APP/src/" 2>/dev/null || true
mkdir -p "$APP/src/screens/GameScreen"
cp "$GRAFT/src/screens/GameScreen/index.tsx" "$APP/src/screens/GameScreen/index.tsx"

echo "==> 3. Copy story bibles into app assets"
mkdir -p "$APP/src/game/stories"
cp "$ROOT/content/stories/"*.json "$APP/src/game/stories/"

echo "==> 3b. Strip explicit .ts/.tsx import extensions (Metro can't resolve them)"
grep -rEl "from ['\"]\.[^'\"]*\.tsx?['\"]" "$APP/src/core" "$APP/src/game" "$APP/src/diffusion" "$APP/src/billing" "$APP/src/models" "$APP/src/screens/GameScreen" 2>/dev/null | while read -r f; do
  perl -pi -e "s/(from\s+['\"]\.[^'\"]*?)\.tsx?(['\"])/\$1\$2/g" "$f"
done

echo "==> 4. Copy native modules (Kotlin + JNI/C++)"
mkdir -p "$JAVA_DIR/diffusion" "$JAVA_DIR/billing"
cp "$GRAFT/android/diffusion/StableDiffusionModule.kt" "$JAVA_DIR/diffusion/"
cp "$GRAFT/android/billing/BillingConfigModule.kt"      "$JAVA_DIR/billing/"
cp "$GRAFT/android/ArcanePackage.kt"                    "$JAVA_DIR/"
mkdir -p "$APP/android/app/src/main/jni/diffusion"
cp "$GRAFT/android/diffusion/CMakeLists.txt" "$APP/android/app/src/main/jni/diffusion/"
cp "$GRAFT/android/diffusion/sd_bridge.cpp"  "$APP/android/app/src/main/jni/diffusion/"

echo "==> 5. Patch build.gradle: BILLING_BYPASS per build type (R10) + deps"
if ! grep -q "BILLING_BYPASS" "$GRADLE"; then
  # debug -> true (free unlock), release -> false (real billing)
  perl -0pi -e 's/(debug \{\s*\n\s*signingConfig signingConfigs.debug)/$1\n            buildConfigField "boolean", "BILLING_BYPASS", "true"/' "$GRADLE"
  perl -0pi -e 's/(buildConfigField "boolean", "USE_DEV_SUPPORT", "false")/$1\n            buildConfigField "boolean", "BILLING_BYPASS", "false"/' "$GRADLE"
  # add IAP dependency
  perl -0pi -e 's/(dependencies \{)/$1\n    implementation project(":react-native-iap")/' "$GRADLE"
  echo "   patched."
else
  echo "   already patched, skipping."
fi

echo "==> 6. Register ArcanePackage in MainApplication.kt ($MAINAPP)"
if [ -n "$MAINAPP" ] && [ -f "$MAINAPP" ] && ! grep -q "ArcanePackage" "$MAINAPP"; then
  # Insert after the last add(...Package()) call in the getPackages() apply{} block.
  perl -0pi -e 's/(add\(DownloadPackage\(\)\))/$1\n              add(ArcanePackage())/' "$MAINAPP" \
    || echo "   !! could not auto-insert; add 'add(ArcanePackage())' manually"
fi

echo "==> 7. Install added JS dependencies"
cd "$APP"
node "$ROOT/scripts/_add-deps.mjs" || echo "   !! dep merge skipped; add react-native-iap manually"

echo "==> 8. Wire navigation (best-effort)"
node "$ROOT/scripts/_wire-nav.mjs" || cat <<'EOF'
   !! Auto nav wiring skipped. Add manually:
      - ROUTES.GAME in src/utils/navigationConstants.ts
      - export GameScreen from src/screens/index.ts
      - <Drawer.Screen name={ROUTES.GAME} component={GameStoryPicker} /> in App.tsx
EOF

cat <<EOF

==> GRAFT APPLIED.
   Next:
     scripts/fetch-sdcpp.sh        # vendor stable-diffusion.cpp under jni/diffusion/third_party
     scripts/setup-android-sdk.sh  # if not already done
     scripts/build-apks.sh         # builds debug (free) + release (real billing) APKs
EOF
