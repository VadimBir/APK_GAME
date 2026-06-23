# AUTOCHECK — the separate Opus "sanity checker" agent

A **separate Opus agent**, distinct from the implementer, audits each milestone
against `docs/REQUIREMENTS.md`. It is intentionally adversarial: its job is to find
gaps, dead wiring, uncaught errors, and "bizarre" UX before the user ever sees them.

## Contract

**Input:** the current branch state + `docs/REQUIREMENTS.md` + the milestone being claimed.

**Output:** a markdown report `app/autocheck/reports/REPORT-<phase>.md` with, per
requirement ID (R1..R14, C1):
- `PASS` / `PARTIAL` / `FAIL` / `DEFERRED(device)`
- Evidence (file:line, test name, or grep result) — claims must be grounded.
- For non-PASS: the concrete gap and the smallest fix.

It also runs a **wiring sweep**: every feature surfaced in the UI must trace to a real
implementation (no buttons that call nothing), and every native error code must have a
JS handler. Anything failing the sweep is reported as `FAIL: dead wiring`.

## How the brain invokes it

After each phase, the brain launches:

```
Agent(subagent_type="general-purpose", model="opus",
      description="Auto-check phase N",
      prompt= <contents of app/autocheck/PROMPT.md with PHASE=N>)
```

The brain must NOT mark a roadmap item `[x]` for a verifiable requirement until the
checker returns `PASS` (or `DEFERRED(device)` for C1 items). FAIL/PARTIAL items are
fixed and re-checked.

## Checklists the auto-checker enforces

### Error-handling taxonomy (R8) — every one must be caught + surfaced
- Model file missing / wrong path
- Model corrupt / unsupported format / version mismatch
- `cfg_scale` out of supported range
- `steps` over cap / `<= 0`
- `width`/`height` over cap, not multiple of 64, or non-square unsupported
- Unsupported sampler / scheduler
- Out of memory (allocation failure) during load or generate
- Generation cancelled by user mid-run
- Backend unavailable (e.g. QNN requested on a non-NPU device) → fallback to CPU
- Concurrent generate request while one is in flight
- LLM still resident when diffusion load requested (governor must unload first)

### Wiring sweep
- Each UI action → handler → service → engine call exists and is reachable.
- Each `DiffusionError` enum value → a user-facing message.
- `release` build contains **no** `DebugGrantBackend` symbol (grep the variant).

### Bizarre-UX sweep
- No screen where the model status is unknown/blank.
- Trial gate actually blocks after the free limit and the $1.99 path is reachable.
- Image always corresponds to the latest narration (no stale image).
