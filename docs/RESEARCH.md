# RESEARCH FINDINGS (Phase 1)

Condensed, decision-relevant facts from the three Sonnet research agents. Full
rationale lives in `docs/DECISIONS.md` (ADR-004, ADR-007).

## A. Pocket Pal AI (the fork base)
- Repo `github.com/a-ghorbani/pocketpal-ai`, **MIT** (fork & republish OK). Latest ~v1.15.x.
- **Bare React Native 0.82.1**, React 19, **New Architecture (TurboModules/Fabric)**,
  **Hermes**. TS 5. MobX state. React Navigation 7 (drawer). RN Paper UI.
- Inference: **`llama.rn` 0.12.4** (llama.cpp GGUF) — `initLlama()` in `src/store/ModelStore.ts`.
- **Sequential load/unload already exists**: `ModelStore.releaseContext()` uses a
  stop‑await‑release mutex + "last‑one‑wins" `pendingModelId` → directly supports R5.
- Models stored under `RNFS.DocumentDirectoryPath/models/hf/{author}/{repo}/{file}`.
- Native module pattern to mirror: `HardwareInfoModule` (+ JNI `CMakeLists.txt` linking
  `hardware_info.cpp` into `libappmodules.so`). `StorefrontModule` shows an IAP‑ish bridge.
- Build: **Node ≥22.21**, **Yarn 1.22.22**, **JDK 17**, **NDK 27.3.13750724**,
  compileSdk 36, minSdk 24, ABIs arm64‑v8a + x86_64. `yarn install` runs
  `scripts/postinstall.sh` (patch‑package + clones OpenCL headers → needs network).
- Existing flavors: dimension `distribution` = {prod, e2e}. We ADD dimension `billing`.
- Gotchas: New Arch + Reanimated 4 committed; patch‑package mandatory; JDK 17 required
  (our env has 21 — may need a 17 toolchain); custom JNI CMake path in build.gradle.

## B. On-device diffusion (the extension)
- **Primary: `leejet/stable-diffusion.cpp` (MIT)** — ggml/GGUF twin of llama.cpp.
  - Android arm64, `ANDROID_PLATFORM=android-28`, **CPU‑only baseline** (Vulkan broken
    on Adreno/Mali; OpenCL = Adreno‑only, crashes elsewhere → opt‑in only).
  - C API: `new_sd_ctx()` / `txt2img(...)` / `free_sd_ctx()` (deterministic load/unload).
  - Q4_0 SD‑1.5 ≈ 1.57 GB disk / ~1.5 GB RAM (+flash‑attn). Context **not thread‑safe**
    → serialize on one worker thread.
  - Params: width/height **multiple of 64**, cfg default 7 (no internal clamp), steps
    default 20 (LCM 4–8), seed −1=random, samplers euler_a/euler/heun/dpm++2m/lcm.
  - Failure modes (→ our `errors.ts`): NULL ctx on OOM/missing/corrupt/unsupported;
    non‑mult‑64 dims → garbage; VAE decode adds ~500 MB (use `--vae-tiling`).
- **Default model (R6):** `second-state/stable-diffusion-v1-5-GGUF` →
  `stable-diffusion-v1-5-Q4_0.gguf`.
- **Integration template:** `Aatricks/llmedge` (Apache‑2.0) bundles llama.cpp + sd.cpp
  into one AAR — candidate to vendor or mirror as a TurboModule.
- **Fallback:** `wangzhaode/mnn-stable-diffusion` (MNN, Apache‑2.0).
- **Edge/NPU (R7, optional):** Qualcomm **QNN** (Hexagon, Snapdragon 8 Gen1+) via the
  `xororz/local-dream` dual‑engine pattern. Proprietary SDK → optional backend, CPU fallback.
- Rejected: ONNX RT SD (huge RAM, op gaps), MediaPipe Image Gen (deprecated, no cfg, API31+).

## C. Billing / two builds
- **`react-native-iap` v14.7.x (MIT)**, Play Billing Library **8**, needs
  `react-native-nitro-modules`. Product `full_game_unlock`, non‑consumable, **$1.99**.
- Two outputs via Gradle **`billing` flavor dimension**: `dev` (BILLING_BYPASS=true,
  `.dev` suffix, free grant) vs `prod` (real billing). Compile‑time constant ⇒ bypass
  cannot reach release. License‑testing accounts = Google's free real‑billing test path.
- Must `finishTransaction({isConsumable:false})` (acknowledge ≤72 h). Restore =
  `getAvailablePurchases()`. Cache entitlement for offline.
