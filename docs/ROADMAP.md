# ROADMAP — live phase checklist

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` needs on-device verify

## Phase 0 — Foundation & governance  `[~]`
- [x] Decode requirements → `docs/REQUIREMENTS.md`
- [x] Architecture, decisions, roadmap docs
- [x] Author the 3 original story bibles
- [x] Auto-checker contract → `docs/AUTOCHECK.md`
- [ ] First checkpoint committed + pushed

## Phase 1 — Research / "download" (Sonnet agents)  `[x]`
- [x] Pocket Pal source structure & build process
- [x] On-device diffusion engine selection (+ NPU/edge path)
- [x] Play Billing two-flavor strategy
- [x] Fold findings into DECISIONS.md (ADR-004, 007) + RESEARCH.md

## Phase 1.5 — Engine-agnostic core logic (pure TS, unit-tested here)  `[x]`
- [x] Diffusion error taxonomy + native-error mapper (R8) — `core/src/diffusion/errors.ts`
- [x] Diffusion param validation/clamp (R8) — `core/src/diffusion/params.ts`
- [x] LLM→game JSON parser + repair + fallback — `core/src/story/contract.ts`
- [x] ModelGovernor single-resident state machine (R5) — `core/src/engine/governor.ts`
- [x] EntitlementService trial gate + backend interface (R9/R10) — `core/src/billing/entitlement.ts`
- [x] 33 unit tests green (`cd core && npm test`)

## Phase 2 — Fork & boot Pocket Pal  `[~]`
- [x] Android SDK/NDK installed (NDK 27.3.13750724, android-36, build-tools 36)
- [x] `scripts/fork-pocketpal.sh` + `apply-graft.sh` (reproducible vendoring + graft)
- [ ] Run the fork + graft + `yarn install` in the env `[!]`
- [ ] Reproduce a clean debug APK build (baseline) `[!]`

## Phase 3 — ModelGovernor + diffusion native module  `[~]`
- [x] `ModelGovernor` single-resident load/unload/reload (core, tested)
- [x] `StableDiffusionModule.kt` + `sd_bridge.cpp` JNI + `capabilities()` (graft)
- [x] Param validation — full limit/error taxonomy (R8) (core, tested)
- [x] CPU backend wired to stable-diffusion.cpp (`fetch-sdcpp.sh` + CMakeLists)
- [x] Optional QNN/NPU backend path + graceful CPU fallback (R7) (DiffusionEngine.load)
- [x] Diffusion model catalog + HF urls (R6) (`diffusionCatalog.ts`)
- [ ] Native build of sd.cpp verified on device `[!]`

## Phase 4 — Game layer  `[~]`
- [x] StoryEngine: bible → system prompt → structured turn loop (graft)
- [x] LLM→game JSON parser w/ repair + fallback (core, tested)
- [x] GameScreen (story view, image pane, choices, model status, paywall) (graft)
- [x] Wire text → image_prompt → DiffusionEngine per turn (StoryEngine)
- [ ] Live play-test on device `[!]`

## Phase 5 — Monetization  `[~]`
- [x] EntitlementService + trial gate (R9) (core, tested)
- [x] PlayBillingBackend (release) / DebugGrantBackend (debug) (R10) (graft)
- [x] Build-type BILLING_BYPASS wiring + BuildConfig bridge (graft + gradle patch)
- [x] $1.99 managed product config notes for Play Console (docs/RESEARCH.md §C)
- [ ] Verify bypass absent from release variant `[!]` (auto-checker grep)

## Phase 6 — Build & deliver  `[~]`
- [x] Produce **standalone debug APK (free unlock)** — `dist/arcane-terminal-debug-freeunlock.apk`
      (241 MB, BUILD SUCCESSFUL, our Kotlin modules + JS game bundle verified inside)
- [x] Release notes + install/test guide — `docs/INSTALL_AND_TEST.md`
- [x] Wire `sd_bridge` into app `jni/CMakeLists.txt` — `libsd_bridge.so` (62 MB,
      stable-diffusion.cpp + ggml) verified inside the APK with JNI exports
- [x] In-app HuggingFace SD model download (R6) in the launcher
- [ ] Produce signed release APK (real billing) — deferred per "ALL JUST DEBUG"

## Build environment notes (this headless box)
- Android SDK/NDK installed via `scripts/setup-android-sdk.sh`.
- Gradle wrapper (9.0.0) + AGP need **JDK 17** with the **system truststore**
  (`/etc/ssl/certs/java/cacerts`) — the bundled Temurin truststore failed TLS to
  services.gradle.org behind this env's CA.
- `prodDebug` bundles JS (standalone APK). Full build ~22 min (RN New-Arch native compile).

## Phase 7 — Auto-check & harden
- [ ] Run Opus auto-checker against REQUIREMENTS.md each milestone
- [ ] Close every gap it reports
- [ ] Final sanity pass: wiring complete, all errors caught, no bizarre UX
