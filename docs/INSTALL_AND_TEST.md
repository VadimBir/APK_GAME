# Install & test — ARCANE TERMINAL debug APK

## What you got
`dist/arcane-terminal-debug-freeunlock.apk` (~241 MB)

- **Standalone** — JS bundle is embedded; no Metro/dev server needed.
- **Free unlock** — `BILLING_BYPASS = true` (debug build type), so the $1.99 gate is
  auto-granted for testing (R10b). The real-billing release build flips this to `false`.
- ABIs: `arm64-v8a` (your phone) + `x86_64` (emulator).
- Built from the Pocket Pal fork + the ARCANE TERMINAL graft.

## Install
```
adb install -r dist/arcane-terminal-debug-freeunlock.apk
```
or copy the APK to the phone and tap it (enable "install unknown apps").

## Play
1. Open the app. Open the left **drawer → "Arcane Terminal"**.
2. First time: it asks you to **load a model**. Go to the **Models** tab, download a
   small chat GGUF (any small instruct model), and tap it to load.
3. Back to **Arcane Terminal**, pick one of the three stories. The on-device LLM narrates;
   tap a choice chip to take a turn.

## What works in THIS build
- ✅ On-device **LLM narration** via Pocket Pal's `llama.rn` (R1).
- ✅ The **3 original stories** + branching turn loop, JSON-contract parsing with repair
  and never-crash fallback (R4, R8 spirit).
- ✅ **Sequential single-model** governor (R5) — it unloads the LLM before it would load
  the image model, and vice-versa.
- ✅ **Free-unlock billing** path + trial-gate logic (R9/R10b).
- ✅ Native modules wired (`StableDiffusionModule`, `BillingConfigModule`) and reachable.

## What is NOT in THIS build yet (honest)
- ⏳ **On-device image generation.** The `sd_bridge`/stable-diffusion.cpp native library is
  written and CMake-ready (`app/graft/android/diffusion/*`) but **not yet compiled into
  this APK** (it still needs to be hooked into Pocket Pal's custom `jni/CMakeLists.txt`
  and the SD model downloaded). Until then, image generation **fails gracefully** — you'll
  see "Image unavailable: …" under the narration instead of a crash (that's R8 working).
  The story still plays fully in text.
- ⏳ **Real Google Play billing release APK** (R10a) — the code path exists
  (`PlayBillingBackend`), gated to the release build type; not built here because you asked
  for "ALL JUST DEBUG".
- 🅰️ App label still reads **"PocketPal"** (cosmetic; fork base not yet rebranded).

## Reproduce the build
```
scripts/fork-pocketpal.sh          # vendor PP + apply graft
scripts/fetch-sdcpp.sh             # vendor stable-diffusion.cpp
scripts/setup-android-sdk.sh       # NDK 27.3.13750724, android-36
cd app/android
JAVA_HOME=<jdk17> ./gradlew assembleProdDebug   # -> app-prod-debug.apk
```
Note: this environment needed JDK 17 with the system truststore
(`/etc/ssl/certs/java/cacerts`) for the Gradle wrapper to fetch dependencies.
