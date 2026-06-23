# DECISION RECORD (ADR log)

Decisions are appended; superseded ones are marked. Each maps to requirements in
`docs/REQUIREMENTS.md`.

## ADR-001 — Extend Pocket Pal by forking source, not patching the APK
**Status:** Accepted. **Reqs:** R3.
You cannot add a native diffusion engine to a compiled binary. Pocket Pal is
open source under a permissive license, so we fork the source and rebuild. "Extend
the APK" is honored as "extend the app and ship a new APK."

## ADR-002 — Base architecture: Fork Pocket Pal (React Native) + native diffusion module
**Status:** Accepted (user choice). **Reqs:** R3, R5.
User selected "Fork Pocket Pal (RN) + native diffusion" over a fresh Kotlin app.
We keep Pocket Pal's `llama.rn` text stack and model‑download plumbing, and add a new
Android native module for diffusion exposed to JS.

## ADR-003 — Stories are original works inspired by 80s classics
**Status:** Accepted (user choice). **Reqs:** R4.
To stay Play‑store safe we write three original interactive fictions echoing the
*feel* of early‑80s adventures (subterranean vault crawl, derelict‑station mystery,
haunted manor), with no trademarked names, characters, or text.

## ADR-004 — Diffusion engine: stable-diffusion.cpp (primary), MNN (fallback), QNN (edge)
**Status:** Accepted (research complete). **Reqs:** R6, R7, R8, R5.
- **Primary: `leejet/stable-diffusion.cpp`** (MIT). It is the ggml twin of llama.cpp:
  same GGUF format, same HuggingFace tooling, same mental model as Pocket Pal's
  `llama.rn`. Q4_0 SD‑1.5 is ~1.57 GB on disk / ~1.5 GB RAM with flash‑attention —
  fits alongside (sequentially, not concurrently) the LLM on a 6–8 GB phone.
  Deterministic `new_sd_ctx()` / `free_sd_ctx()` gives clean load/unload for R5.
- **Default model (R6):** `second-state/stable-diffusion-v1-5-GGUF` →
  `stable-diffusion-v1-5-Q4_0.gguf`, downloaded via the same HF plumbing as the LLM.
- **Integration:** mirror Pocket Pal's `HardwareInfoModule` JNI/CMake pattern; build
  sd.cpp via `add_subdirectory` in the module's CMakeLists and expose a TurboModule.
  Reference: `Aatricks/llmedge` (Apache‑2.0) already bundles llama.cpp + sd.cpp into a
  single AAR — used as the integration template / possible vendored AAR.
- **CPU‑only baseline** (no Vulkan — confirmed broken on Adreno/Mali; OpenCL only helps
  on Adreno and crashes elsewhere, so it is opt‑in, not default).
- **Fallback:** `wangzhaode/mnn-stable-diffusion` (MNN, Apache‑2.0) if sd.cpp's Android
  build regresses.
- **Edge/NPU backend (R7, optional):** Qualcomm **QNN** (Hexagon NPU) following the
  `xororz/local-dream` dual‑engine pattern. Proprietary SDK (requires a Qualcomm
  agreement) → shipped as a separate optional backend, never the default, with
  graceful fallback to CPU (`BACKEND_UNAVAILABLE` → `cpu`).
- **Error taxonomy (R8):** the documented sd.cpp failure modes (NULL ctx on OOM/missing
  /corrupt model, non‑multiple‑of‑64 dims producing garbage, unclamped cfg/steps,
  non‑thread‑safe context) map 1:1 onto `core/src/diffusion/errors.ts` and are validated
  pre‑flight by `core/src/diffusion/params.ts`. Generation calls are serialized on a
  dedicated thread (BUSY guard) because the sd.cpp context is not thread‑safe.

## ADR-005 — Sequential single-model residency via ModelGovernor
**Status:** Accepted. **Reqs:** R5.
A TS governor guarantees one heavy model in RAM; text↔image alternation unloads the
other engine first. See `docs/ARCHITECTURE.md`.

## ADR-006 — Two build variants via Gradle product flavors + compile-time entitlement backend
**Status:** Accepted. **Reqs:** R10.
`release` compiles `PlayBillingBackend`; `debug` compiles `DebugGrantBackend` (free
unlock). Selection via `buildConfigField`/flavor source sets so the bypass is **not
present** in the release artifact. Billing library finalized by the billing research
agent (ADR-007).

## ADR-007 — Billing: react-native-iap v14 + Gradle `billing` flavor dimension
**Status:** Accepted (research complete). **Reqs:** R9, R10, R11.
- **Library:** `react-native-iap` v14.7.x (MIT). Bundles **Play Billing Library 8**
  (compliant past Aug 2026) and supports RN ≥0.79 (Pocket Pal is 0.82.1). Pulls in
  `react-native-nitro-modules`. Alternative `react-native-purchases` (RevenueCat)
  rejected — adds a server dependency we don't need for a single $1.99 unlock.
- **Product:** `full_game_unlock`, one‑time / non‑consumable, **$1.99**.
  `finishTransaction({ isConsumable: false })` acknowledges within 72 h (else Google
  auto‑refunds).
- **Two outputs (R10) via a SECOND flavor dimension `billing`** layered on Pocket Pal's
  existing `distribution` dimension:
  - `dev`  → `buildConfigField boolean BILLING_BYPASS true`, `applicationIdSuffix ".dev"`
    → free auto‑grant (`DebugGrantBackend`).
  - `prod` → `BILLING_BYPASS false` → real Play purchase (`PlayBillingBackend`).
  Because `BILLING_BYPASS` is a **compile‑time constant** baked per‑flavor, the bypass
  literal is `false` in the release bytecode — it structurally cannot ship in release.
  The auto‑checker greps the release variant to assert no `DebugGrantBackend` symbol.
- **Flag→JS:** a tiny custom native module (mirrors Pocket Pal's existing native modules,
  zero extra dep) exposes `BuildConfig.BILLING_BYPASS`; `EntitlementService` picks the
  backend from it.
- **Entitlement:** local `AsyncStorage` cache + `getAvailablePurchases()` re‑verify on
  foreground; offline‑friendly (already implemented & tested in
  `core/src/billing/entitlement.ts`). Restore = re‑query (Android keeps non‑consumables).
- **Testing real billing free of charge:** Play Console **license‑testing** accounts
  (the Google‑approved path), distinct from our `dev` flavor bypass.
- **Build tasks:** debug free‑unlock APK `assembleDev<...>Debug`; signed release
  `assembleProd<...>Release` / `bundleProd<...>Release` (AAB for Play). Keystore via
  gitignored `key.properties`.

## ADR-008 — Autonomous build governance
**Status:** Accepted. **Reqs:** R12, R13, R14.
- Sonnet subagents do research/"download" reconnaissance.
- Opus (this brain) implements.
- A separate Opus **auto‑checker** validates each milestone against REQUIREMENTS.md
  (`docs/AUTOCHECK.md`). Checkpoints are committed + pushed continuously.
