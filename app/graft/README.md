# The ARCANE TERMINAL graft kit

This folder holds everything we ADD to the Pocket Pal fork. It is kept separate from the
vendored upstream source so the fork can be regenerated cleanly. `scripts/apply-graft.sh`
copies these into the right places inside `app/` and patches the upstream files.

```
graft/
├── src/
│   ├── game/StoryEngine.ts        per-turn orchestrator (LLM→parse→image→gate)  [R1,R2,R5,R9]
│   ├── game/wiring.ts             assembles governor + adapters + entitlement
│   ├── diffusion/DiffusionEngine.ts  JS side of the native SD module (validate+map) [R8]
│   ├── billing/backends.ts        DebugGrant (free) vs PlayBilling (real), compile-time [R10]
│   ├── models/diffusionCatalog.ts HuggingFace SD model catalog                    [R6]
│   └── screens/GameScreen/index.tsx  playable UI (narration+image+choices+paywall)
└── android/
    ├── ArcanePackage.kt           registers the two native modules
    ├── diffusion/StableDiffusionModule.kt  RN bridge, error mapping, serialized   [R5,R8]
    ├── diffusion/CMakeLists.txt + sd_bridge.cpp  JNI over stable-diffusion.cpp     [R8]
    └── billing/BillingConfigModule.kt  exposes BuildConfig.BILLING_BYPASS to JS    [R10]
```

The pure TypeScript in `../core/` (diffusion validation, turn parser, ModelGovernor,
EntitlementService) is the tested heart; `apply-graft.sh` vendors it to `app/src/core`.

## Build flow
```
scripts/fork-pocketpal.sh     # clone PP into app/, then apply-graft.sh
scripts/fetch-sdcpp.sh        # vendor stable-diffusion.cpp under jni/diffusion/third_party
scripts/setup-android-sdk.sh  # NDK 27.3.13750724, android-36, build-tools 36
scripts/build-apks.sh         # -> dist/arcane-terminal-debug-freeunlock.apk + -release.apk
```

## Map to requirements
See `docs/REQUIREMENTS.md`. Inline `[Rn]` tags mark where each is satisfied. The auto-checker
(`docs/AUTOCHECK.md`) audits the wired result against that list.
