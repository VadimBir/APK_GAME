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

## Phase 2 — Fork & boot Pocket Pal
- [ ] Vendor the Pocket Pal source into `app/`
- [ ] Rename applicationId / branding → ARCANE TERMINAL
- [ ] Reproduce a clean debug APK build (baseline) `[!]`

## Phase 3 — ModelGovernor + diffusion native module
- [ ] `ModelGovernor.ts` (single-resident load/unload/reload)
- [ ] `DiffusionModule` JNI skeleton + `capabilities()`
- [ ] `DiffusionParams.validate()` — full limit/error taxonomy (R8)
- [ ] CPU backend wired to chosen engine
- [ ] Optional QNN/NPU backend stub + graceful fallback (R7)
- [ ] Diffusion model catalog + HF downloader (R6)

## Phase 4 — Game layer
- [ ] Story Engine: bible → system prompt → structured turn loop
- [ ] LLM→game JSON contract parser w/ repair + fallback
- [ ] Game UI screens (story view, image pane, choices, model status)
- [ ] Wire text → image_prompt → DiffusionModule per turn

## Phase 5 — Monetization
- [ ] EntitlementService + trial gate (R9)
- [ ] PlayBillingBackend (release) / DebugGrantBackend (debug) (R10)
- [ ] Gradle product flavors + buildConfig wiring
- [ ] $1.99 managed product config notes for Play Console

## Phase 6 — Build & deliver
- [ ] Produce debug APK (free unlock) `[!]`
- [ ] Produce signed release APK (real billing) `[!]`
- [ ] Release notes + install/test guide

## Phase 7 — Auto-check & harden
- [ ] Run Opus auto-checker against REQUIREMENTS.md each milestone
- [ ] Close every gap it reports
- [ ] Final sanity pass: wiring complete, all errors caught, no bizarre UX
