# ARCHITECTURE

## High-level

```
┌──────────────────────────────────────────────────────────────────┐
│                     ARCANE TERMINAL (Android, RN)                  │
│                     (fork of Pocket Pal AI)                        │
│                                                                    │
│  React Native / TypeScript                                         │
│  ┌────────────┐   ┌──────────────┐   ┌───────────────────────┐    │
│  │  Game UI   │   │ Story Engine │   │  Model Manager (UI)   │    │
│  │ (screens)  │◄─►│ (TS narrative│◄─►│  load/unload/reload   │    │
│  │            │   │  orchestrator)│   │  single-resident      │    │
│  └─────┬──────┘   └──────┬───────┘   └─────────┬─────────────┘    │
│        │                 │                     │                   │
│        ▼                 ▼                     ▼                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │            ModelGovernor (TS) — the RAM traffic cop          │  │
│  │  guarantees only ONE heavy model resident at a time          │  │
│  └───────┬───────────────────────────────────┬────────────────┘  │
│          │ JSI/bridge                          │ Native module     │
│          ▼                                      ▼                  │
│  ┌──────────────────┐                ┌────────────────────────┐   │
│  │  llama.rn         │                │  DiffusionModule (new) │   │
│  │  (llama.cpp)      │                │  JNI → native engine   │   │
│  │  TEXT generation  │                │  IMAGE generation      │   │
│  └──────────────────┘                └───────┬────────────────┘   │
│                                              │                     │
│                              ┌───────────────┴───────────────┐    │
│                              ▼                               ▼     │
│                    ┌──────────────────┐         ┌──────────────────┐
│                    │ CPU backend       │         │ NPU backend (opt)│
│                    │ (default, HF GGUF)│         │ Qualcomm QNN     │
│                    └──────────────────┘         └──────────────────┘
└──────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Story Engine (TypeScript) — `app/src/game/`
- Loads a **story bible** (`content/stories/*.json`) → builds the LLM **system prompt**.
- Maintains game state (location, inventory, flags, turn count, trial gate).
- On each player action: calls the LLM via `llama.rn`, parses a **structured response**
  (narration + a compact `image_prompt` + state deltas), updates state.
- Feeds `image_prompt` (+ a per‑story visual style preamble) to the DiffusionModule.

### 2. ModelGovernor (TypeScript) — `app/src/engine/ModelGovernor.ts`
- The single source of truth for "what heavy model is loaded right now."
- API: `ensureLLM()`, `ensureDiffusion()`, `releaseAll()`. Switching from text→image
  **unloads the LLM**, frees RAM, then loads diffusion (and vice‑versa) — implementing
  the sequential single‑resident requirement (R5).
- Emits progress + memory telemetry to the UI.

### 3. DiffusionModule (native Android, new) — `app/android/.../diffusion/`
- JNI bridge to the chosen native engine (see `docs/DECISIONS.md` for engine pick).
- Surface: `loadModel(path, backend)`, `generate(params, onProgress)`, `cancel()`,
  `unloadModel()`, `capabilities()`.
- **Validation layer** (`DiffusionParams.validate()`) runs BEFORE any native call and
  rejects out‑of‑range cfg/steps/resolution with typed errors (R8).
- **Backends**: `cpu` (default) and `qnn` (optional NPU, R7), chosen at load time and
  reported by `capabilities()`; unsupported backend degrades gracefully to `cpu`.

### 4. Model acquisition — `app/src/models/`
- Reuses Pocket Pal's HuggingFace download plumbing for the LLM GGUF.
- Adds a **diffusion model catalog** (HF repo ids, sizes, sha) + downloader (R6).

### 5. Monetization — `app/src/billing/`
- `EntitlementService` — single `isUnlocked()` gate; trial counter for lite mode (R9).
- `BillingBackend` interface with two implementations selected at **compile time**:
  - `PlayBillingBackend` (release) — real purchase (R10a).
  - `DebugGrantBackend` (debug) — free auto‑grant (R10b), compiled out of release.

## Data contract: LLM → game

The story system prompt instructs the model to answer in a fenced JSON block:

```json
{
  "narration": "Two to four sentences of second-person prose.",
  "image_prompt": "terse comma-separated visual tags for the scene",
  "choices": ["go north", "examine the altar"],
  "state": { "location": "vault", "add_items": ["brass key"], "flags": {"door_open": true}, "ending": null }
}
```

The Story Engine tolerates malformed output (R8 spirit): it strips prose around the
JSON, repairs common errors, and on total failure falls back to a deterministic
"the air is still…" beat plus a re‑prompt, never crashing.

## Memory budget reasoning (why sequential)

A typical target phone has 6–8 GB RAM, ~3–4 GB usable by one app. A 3–4B Q4 LLM is
~2–2.5 GB; an SD‑1.x model is ~1–2 GB at runtime. Holding both risks OOM, so the
ModelGovernor enforces one‑at‑a‑time. Narration and illustration therefore alternate:
generate text → swap → generate image → swap back for the next turn. The UI hides this
behind a "the terminal is dreaming…" transition.
