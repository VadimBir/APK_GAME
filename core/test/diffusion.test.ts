import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DiffusionError,
  DiffusionErrorCode,
  DIFFUSION_ERROR_META,
  mapNativeError,
} from '../src/diffusion/errors.ts';
import {
  validateParams,
  validateAll,
  clampParams,
  DEFAULT_PARAMS,
  DEFAULT_CAPABILITIES,
  type DiffusionParams,
} from '../src/diffusion/params.ts';

const good: DiffusionParams = { ...DEFAULT_PARAMS, prompt: 'a torch-lit stone vault' };

test('every error code has metadata + message (R8 coverage)', () => {
  for (const code of Object.values(DiffusionErrorCode)) {
    const meta = DIFFUSION_ERROR_META[code];
    assert.ok(meta, `missing meta for ${code}`);
    assert.ok(meta.message.length > 0, `empty message for ${code}`);
  }
});

test('valid params pass', () => {
  assert.doesNotThrow(() => validateParams(good));
  assert.equal(validateAll(good).length, 0);
});

test('empty prompt rejected', () => {
  const e = validateAll({ ...good, prompt: '   ' });
  assert.equal(e[0].code, DiffusionErrorCode.PROMPT_EMPTY);
});

test('cfg out of range rejected at both ends', () => {
  assert.equal(validateAll({ ...good, cfgScale: 0.2 })[0].code, DiffusionErrorCode.CFG_OUT_OF_RANGE);
  assert.equal(validateAll({ ...good, cfgScale: 99 })[0].code, DiffusionErrorCode.CFG_OUT_OF_RANGE);
});

test('steps out of range / non-integer rejected', () => {
  assert.equal(validateAll({ ...good, steps: 0 })[0].code, DiffusionErrorCode.STEPS_OUT_OF_RANGE);
  assert.equal(validateAll({ ...good, steps: 9999 })[0].code, DiffusionErrorCode.STEPS_OUT_OF_RANGE);
  assert.equal(validateAll({ ...good, steps: 3.5 })[0].code, DiffusionErrorCode.STEPS_OUT_OF_RANGE);
});

test('dimensions: range + multiple-of-64 enforced', () => {
  assert.equal(validateAll({ ...good, width: 100 })[0].code, DiffusionErrorCode.DIM_OUT_OF_RANGE);
  assert.equal(validateAll({ ...good, width: 9999 })[0].code, DiffusionErrorCode.DIM_OUT_OF_RANGE);
  assert.equal(validateAll({ ...good, width: 500 })[0].code, DiffusionErrorCode.DIM_NOT_MULTIPLE);
});

test('unsupported sampler rejected', () => {
  // ddim is not in DEFAULT_CAPABILITIES.samplers
  assert.equal(validateAll({ ...good, sampler: 'ddim' })[0].code, DiffusionErrorCode.SAMPLER_UNSUPPORTED);
});

test('invalid seed rejected, -1 (random) allowed', () => {
  assert.equal(validateAll({ ...good, seed: -5 })[0].code, DiffusionErrorCode.SEED_INVALID);
  assert.equal(validateAll({ ...good, seed: 2.5 })[0].code, DiffusionErrorCode.SEED_INVALID);
  assert.equal(validateAll({ ...good, seed: -1 }).length, 0);
});

test('validateAll collects MULTIPLE problems at once', () => {
  const e = validateAll({ ...good, prompt: '', cfgScale: 99, steps: 0, sampler: 'ddim' });
  const codes = e.map((x) => x.code);
  assert.ok(codes.includes(DiffusionErrorCode.PROMPT_EMPTY));
  assert.ok(codes.includes(DiffusionErrorCode.CFG_OUT_OF_RANGE));
  assert.ok(codes.includes(DiffusionErrorCode.STEPS_OUT_OF_RANGE));
  assert.ok(codes.includes(DiffusionErrorCode.SAMPLER_UNSUPPORTED));
});

test('clampParams repairs loose values to valid ones', () => {
  const fixed = clampParams({ ...good, width: 500, height: 9999, steps: 9999, cfgScale: 99, sampler: 'ddim', seed: -7 });
  assert.equal(validateAll(fixed).length, 0, 'clamped params must validate');
  assert.equal(fixed.width % DEFAULT_CAPABILITIES.dimMultiple, 0);
  assert.ok(fixed.height <= DEFAULT_CAPABILITIES.maxDim);
  assert.ok(fixed.cfgScale <= DEFAULT_CAPABILITIES.maxCfg);
  assert.equal(fixed.seed, -1, 'bad seed becomes random');
});

test('mapNativeError never returns unknown — every native string maps to a code', () => {
  assert.equal(mapNativeError('CUDA out of memory').code, DiffusionErrorCode.OUT_OF_MEMORY);
  assert.equal(mapNativeError('user cancelled run').code, DiffusionErrorCode.CANCELLED);
  assert.equal(mapNativeError('ENOENT no such file').code, DiffusionErrorCode.MODEL_MISSING);
  assert.equal(mapNativeError('bad magic / corrupt header').code, DiffusionErrorCode.MODEL_CORRUPT);
  assert.equal(mapNativeError('QNN delegate init failed').code, DiffusionErrorCode.BACKEND_UNAVAILABLE);
  assert.equal(mapNativeError('totally weird gibberish').code, DiffusionErrorCode.ENGINE_FAULT);
  assert.ok(mapNativeError('') instanceof DiffusionError);
});
