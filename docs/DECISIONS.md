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

## ADR-004 — Diffusion engine selection
**Status:** Pending research (background agent) → to be finalized.
Candidates, in priority order pending the engine report:
1. **stable-diffusion.cpp** (ggml) — mirrors the llama.cpp approach, NDK‑buildable,
   GGUF models from HuggingFace. Preferred for consistency (R6).
2. **MediaPipe Image Generator** — Google‑supported on‑device SD, simplest integration.
3. **ONNX Runtime** SD pipeline — fallback.
Optional NPU backend: **Qualcomm QNN** as the "edge device" path (R7).
Final pick recorded here once the diffusion research agent returns.

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

## ADR-007 — Billing library
**Status:** Pending research (background agent).
Choosing between `react-native-iap` and Google's newer Play Billing wrapper; target
Play Billing Library 7+. Final pick recorded once the billing agent returns.

## ADR-008 — Autonomous build governance
**Status:** Accepted. **Reqs:** R12, R13, R14.
- Sonnet subagents do research/"download" reconnaissance.
- Opus (this brain) implements.
- A separate Opus **auto‑checker** validates each milestone against REQUIREMENTS.md
  (`docs/AUTOCHECK.md`). Checkpoints are committed + pushed continuously.
