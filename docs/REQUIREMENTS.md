# REQUIREMENTS — source of truth

These are the user's requirements, decoded from the original brief. The automated
sanity‑checker (`docs/AUTOCHECK.md`) validates the build against THIS list. Each
item has a stable ID so the checker can report pass/fail per requirement.

## Product

- **R1** Text‑based game that runs a **local LLM** for narration, fully offline.
- **R2** **Local image generation** that produces an image **related to the current
  story text**, fully offline / on‑device.
- **R3** Built by **forking and extending an existing open‑source app (Pocket Pal AI)**
  rather than from scratch; the diffusion capability is the extension.
- **R4** Three story experiences, **original works inspired by top 80s text adventures**
  (no owned IP — Play‑store safe).

## Engine / models

- **R5** **Sequential single‑model loading**: only one heavy model resident at a time;
  the app can **load → unload → reload** models on demand (LLM vs diffusion never
  co‑resident on a phone).
- **R6** Diffusion should be **easy to obtain** — default to **HuggingFace** model
  download.
- **R7** **Separate optional support for edge‑device NPU acceleration** (e.g. Qualcomm
  QNN) as an alternate backend, distinct from the default CPU/HuggingFace path.
- **R8** **Exhaustive error handling** for the diffusion engine: validate every config
  limit (cfg scale range, resolution caps, step caps, sampler support) and **catch
  every failure** (OOM, model‑missing, corrupt model, cancellation) — surface to the
  user, never crash.

## Monetization & distribution

- **R9** Freemium: **free lite/trial**, then unlock full game for a one‑time **$1.99**.
- **R10** **Two build outputs**:
  - **R10a** `release` — real **Google Play Billing**; purchase request sent to Google.
  - **R10b** `debug` — the unlock is **free** (billing bypassed/auto‑granted) so the
    full app can be tested without paying. The bypass must **not** exist in release.
- **R11** Deliverable is a **full‑scale installable APK** (both variants) that can be
  downloaded and tested on a real device.

## Process

- **R12** The "brain" model produces **documentation** and **commits/pushes every
  checkpoint** to the feature branch.
- **R13** A **separate Opus auto‑checker agent** verifies the work matches these
  requirements: everything wired, no gaps, no uncaught issues, nothing bizarre.
- **R14** Research/"download" work delegated to **Sonnet agents**; heavy
  implementation by **Opus**.

## Known environment constraints (honest scope)

- **C1** This build environment is **headless** — no Android device/emulator. We can
  compile APKs, run unit/instrumentation‑logic tests, and structurally verify, but
  **actual on‑device LLM/diffusion inference must be verified on the user's phone.**
  The auto‑checker covers everything verifiable here and explicitly flags what needs
  device testing.
