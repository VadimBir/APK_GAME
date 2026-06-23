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

## Play (with images)
On the Arcane Terminal launcher screen you'll see three steps:
1. **Load a chat model** (Models tab) — the narrator.
2. **Download the image model** — one tap downloads Stable Diffusion 1.5 (~1.6 GB GGUF)
   from HuggingFace to the device. Optional; the story plays without it.
3. **Pick a story** and play. Each turn the LLM narrates, then the local SD model paints
   the scene (the app swaps models in/out — only one is in RAM at a time, R5).

## What works in THIS build
- ✅ On-device **LLM narration** via Pocket Pal's `llama.rn` (R1).
- ✅ **On-device image generation** — `libsd_bridge.so` (stable-diffusion.cpp + ggml,
  ~62 MB) is compiled into the APK (`lib/arm64-v8a/`), exposing `nativeLoad/Generate/Free`.
  One-tap in-app **HuggingFace model download** (R2, R6).
- ✅ The **3 original stories** + branching turn loop, JSON parsing with repair and
  never-crash fallback (R4, R8).
- ✅ **Sequential single-model** governor (R5) — unloads the LLM before loading the image
  model, and back, so a phone never holds both.
- ✅ Full **diffusion error taxonomy** caught & surfaced (cfg/steps/res/sampler/OOM/missing
  /corrupt/cancel) — never a crash (R8).
- ✅ **Free-unlock billing** path + trial-gate logic (R9/R10b).

## Not in THIS build (honest)
- ⏳ **Real Google Play billing release APK** (R10a) — the code path exists
  (`PlayBillingBackend`), gated to the release build type; not built here per "ALL JUST
  DEBUG".
- 🅰️ App label still reads **"PocketPal"** (cosmetic; fork base not yet rebranded).
- ℹ️ Image gen is **untested on real hardware from here** (headless build box). The engine,
  validation, model swap, and download are all wired; on-device speed/quality is for you
  to confirm on your phone.

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
