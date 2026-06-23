// Pre-flight validation of diffusion parameters (Requirement R8).
// This runs in JS BEFORE any native call, so out-of-range configs are rejected with a
// typed, user-fixable error instead of crashing the native engine. The bounds come
// from the engine's reported `capabilities()` (so they adapt per model/backend), with
// conservative defaults that match small on-device Stable-Diffusion models.

import { DiffusionError, DiffusionErrorCode } from './errors.ts';

export type Sampler = 'euler_a' | 'euler' | 'dpmpp_2m' | 'ddim' | 'lcm';

export type DiffusionParams = {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: Sampler;
  seed: number; // -1 => random; otherwise non-negative integer
};

// Engine/model capability envelope. Defaults are safe for SD 1.x-class models on a
// mid-range phone. The native layer overrides these from the loaded model.
export type DiffusionCapabilities = {
  minDim: number;
  maxDim: number;
  dimMultiple: number;
  minSteps: number;
  maxSteps: number;
  minCfg: number;
  maxCfg: number;
  samplers: Sampler[];
  maxPromptChars: number;
};

export const DEFAULT_CAPABILITIES: DiffusionCapabilities = {
  minDim: 256,
  maxDim: 768, // on-device cap; larger OOMs on most phones
  dimMultiple: 64,
  minSteps: 1,
  maxSteps: 50,
  minCfg: 1.0,
  maxCfg: 20.0,
  samplers: ['euler_a', 'euler', 'dpmpp_2m', 'lcm'],
  maxPromptChars: 1500,
};

export const DEFAULT_PARAMS: DiffusionParams = {
  prompt: '',
  negativePrompt: 'lowres, blurry, text, watermark, deformed',
  width: 512,
  height: 512,
  steps: 20,
  cfgScale: 7.0,
  sampler: 'euler_a',
  seed: -1,
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

// Throws the FIRST DiffusionError found. Use validateAll() to collect every problem
// for a settings screen.
export function validateParams(
  p: DiffusionParams,
  caps: DiffusionCapabilities = DEFAULT_CAPABILITIES,
): void {
  const errs = validateAll(p, caps);
  if (errs.length > 0) throw errs[0];
}

// Returns every validation error (possibly empty). Never throws.
export function validateAll(
  p: DiffusionParams,
  caps: DiffusionCapabilities = DEFAULT_CAPABILITIES,
): DiffusionError[] {
  const errs: DiffusionError[] = [];

  // prompt
  if (!p.prompt || p.prompt.trim().length === 0) {
    errs.push(new DiffusionError(DiffusionErrorCode.PROMPT_EMPTY));
  } else if (p.prompt.length > caps.maxPromptChars) {
    errs.push(new DiffusionError(DiffusionErrorCode.PROMPT_TOO_LONG, `${p.prompt.length} > ${caps.maxPromptChars}`));
  }

  // dimensions
  for (const [name, v] of [['width', p.width], ['height', p.height]] as const) {
    if (!isFiniteNumber(v) || v < caps.minDim || v > caps.maxDim) {
      errs.push(new DiffusionError(DiffusionErrorCode.DIM_OUT_OF_RANGE, `${name}=${v} not in [${caps.minDim}, ${caps.maxDim}]`));
    } else if (v % caps.dimMultiple !== 0) {
      errs.push(new DiffusionError(DiffusionErrorCode.DIM_NOT_MULTIPLE, `${name}=${v} not a multiple of ${caps.dimMultiple}`));
    }
  }

  // steps
  if (!isFiniteNumber(p.steps) || !Number.isInteger(p.steps) || p.steps < caps.minSteps || p.steps > caps.maxSteps) {
    errs.push(new DiffusionError(DiffusionErrorCode.STEPS_OUT_OF_RANGE, `steps=${p.steps} not in [${caps.minSteps}, ${caps.maxSteps}]`));
  }

  // cfg
  if (!isFiniteNumber(p.cfgScale) || p.cfgScale < caps.minCfg || p.cfgScale > caps.maxCfg) {
    errs.push(new DiffusionError(DiffusionErrorCode.CFG_OUT_OF_RANGE, `cfg=${p.cfgScale} not in [${caps.minCfg}, ${caps.maxCfg}]`));
  }

  // sampler
  if (!caps.samplers.includes(p.sampler)) {
    errs.push(new DiffusionError(DiffusionErrorCode.SAMPLER_UNSUPPORTED, `sampler=${p.sampler}; supported=${caps.samplers.join(',')}`));
  }

  // seed
  if (p.seed !== -1 && (!Number.isInteger(p.seed) || p.seed < 0)) {
    errs.push(new DiffusionError(DiffusionErrorCode.SEED_INVALID, `seed=${p.seed}`));
  }

  return errs;
}

// Coerces loose params toward the nearest valid value instead of failing — used for the
// LLM-driven game path, where we'd rather auto-correct than interrupt the story. Clamps
// ranges, snaps dimensions to the multiple, falls back to a supported sampler, and trims
// an over-long prompt. Returns the repaired params (prompt emptiness is NOT repaired —
// that is a real error the caller must handle).
export function clampParams(
  p: DiffusionParams,
  caps: DiffusionCapabilities = DEFAULT_CAPABILITIES,
): DiffusionParams {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const snap = (v: number) => {
    const c = clamp(v, caps.minDim, caps.maxDim);
    return Math.max(caps.minDim, Math.round(c / caps.dimMultiple) * caps.dimMultiple);
  };
  return {
    prompt: p.prompt.length > caps.maxPromptChars ? p.prompt.slice(0, caps.maxPromptChars) : p.prompt,
    negativePrompt: p.negativePrompt,
    width: snap(isFiniteNumber(p.width) ? p.width : DEFAULT_PARAMS.width),
    height: snap(isFiniteNumber(p.height) ? p.height : DEFAULT_PARAMS.height),
    steps: Math.round(clamp(isFiniteNumber(p.steps) ? p.steps : DEFAULT_PARAMS.steps, caps.minSteps, caps.maxSteps)),
    cfgScale: clamp(isFiniteNumber(p.cfgScale) ? p.cfgScale : DEFAULT_PARAMS.cfgScale, caps.minCfg, caps.maxCfg),
    sampler: caps.samplers.includes(p.sampler) ? p.sampler : caps.samplers[0],
    seed: p.seed === -1 || (Number.isInteger(p.seed) && p.seed >= 0) ? p.seed : -1,
  };
}
