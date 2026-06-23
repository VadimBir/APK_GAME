# ARCANE TERMINAL — an offline AI story engine for Android

> A fully **on-device**, **offline** text‑adventure game where a **local LLM**
> narrates branching 80s‑style interactive fiction and a **local diffusion model**
> paints a matching scene image for each beat of the story. No servers. No accounts.
> Your phone does all of it.

This project **forks and extends [Pocket Pal AI](https://github.com/a-ghorbani/pocketpal-ai)**
(an open‑source React Native on‑device LLM app) and grafts on:

1. **A local image‑generation engine** (Stable Diffusion, on‑device, fully offline)
   exposed to the app as a native Android module — extending Pocket Pal "to do
   images as well."
2. **A game layer** — three original interactive stories written in the spirit of
   the great 80s text adventures, narrated by the local LLM.
3. **Sequential single‑model management** — only one heavy model is resident at a
   time (LLM *or* diffusion), with explicit load / unload / reload, because a phone
   cannot hold both in RAM.
4. **Exhaustive error handling** around the diffusion engine — every config limit
   (cfg scale, resolution, steps, sampler, VRAM/RAM/OOM) is validated up front and
   every failure path is caught and surfaced to the player, never crashed.
5. **Freemium monetization** — a free lite/trial, then a one‑time **$1.99** unlock
   via Google Play Billing.
6. **Two build outputs**:
   - `release` — real Google Play Billing (purchase request sent to Google).
   - `debug` — the unlock is **free** so the build can be tested end‑to‑end without paying.

## Why "extend an APK" = "fork the source"

You asked to *extend existing APKs (e.g. Pocket Pal)*. You cannot inject a whole
diffusion engine into a compiled `.apk` — the realistic, supported way to extend it
is to **fork the open‑source project and rebuild**. Pocket Pal is MIT/Apache‑style
open source, so this is allowed. See `docs/DECISIONS.md`.

## Repository layout

```
docs/                 Vision, architecture, decisions, roadmap, autocheck spec
content/stories/      The 3 original interactive-fiction "story bibles"
app/                  The forked + extended Android app (added during build phases)
app/autocheck/        The automated Opus "sanity checker" harness spec & fixtures
scripts/              Build, fetch, and CI helper scripts
```

## Status

See `docs/ROADMAP.md` for the live phase checklist. This is a multi‑phase build;
every checkpoint is committed and pushed to `claude/local-llm-game-images-ohuhhz`.

## The autonomous build model

A **separate Opus "sanity checker" agent** reviews each milestone against the
original requirements in `docs/REQUIREMENTS.md` and reports gaps (missing wiring,
uncaught errors, bizarre UX). Its contract is in `docs/AUTOCHECK.md`.
