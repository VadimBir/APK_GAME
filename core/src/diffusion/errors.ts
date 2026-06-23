// Diffusion error taxonomy (Requirement R8).
// Every failure mode the on-device diffusion engine can hit is enumerated here so
// that NOTHING is uncaught. The native JNI layer maps engine failures onto these
// codes; the JS/UI layer maps each code onto a user-facing message. The auto-checker
// (docs/AUTOCHECK.md) asserts every code below has a handler + a message.

// Using a const object instead of a TS `enum` so the file runs under Node's
// type-stripping (no transform needed).
export const DiffusionErrorCode = {
  // --- acquisition / load ---
  MODEL_MISSING: 'MODEL_MISSING', // file not found at path
  MODEL_CORRUPT: 'MODEL_CORRUPT', // failed integrity / parse
  MODEL_UNSUPPORTED: 'MODEL_UNSUPPORTED', // format/version the engine can't read
  // --- parameter validation (pre-flight, before any native call) ---
  CFG_OUT_OF_RANGE: 'CFG_OUT_OF_RANGE',
  STEPS_OUT_OF_RANGE: 'STEPS_OUT_OF_RANGE',
  DIM_OUT_OF_RANGE: 'DIM_OUT_OF_RANGE', // width/height too small/large
  DIM_NOT_MULTIPLE: 'DIM_NOT_MULTIPLE', // not a multiple of the engine's stride (64)
  SAMPLER_UNSUPPORTED: 'SAMPLER_UNSUPPORTED',
  SEED_INVALID: 'SEED_INVALID',
  PROMPT_EMPTY: 'PROMPT_EMPTY',
  PROMPT_TOO_LONG: 'PROMPT_TOO_LONG', // exceeds token budget
  // --- runtime ---
  OUT_OF_MEMORY: 'OUT_OF_MEMORY', // allocation failed on load or generate
  CANCELLED: 'CANCELLED', // user cancelled mid-run
  BUSY: 'BUSY', // a generation is already in flight
  NOT_LOADED: 'NOT_LOADED', // generate() called before loadModel()
  BACKEND_UNAVAILABLE: 'BACKEND_UNAVAILABLE', // e.g. QNN requested on non-NPU device
  ENGINE_FAULT: 'ENGINE_FAULT', // catch-all native crash mapped to an error, not a SIGSEGV
} as const;

export type DiffusionErrorCode =
  (typeof DiffusionErrorCode)[keyof typeof DiffusionErrorCode];

// Severity drives UI treatment: 'config' errors are user-fixable (adjust a slider),
// 'resource' errors suggest a smaller model/size, 'fatal' means the engine is unusable.
export type DiffusionErrorSeverity = 'config' | 'resource' | 'transient' | 'fatal';

export type DiffusionErrorMeta = {
  severity: DiffusionErrorSeverity;
  recoverable: boolean;
  // A default user-facing message; the UI may localize/override.
  message: string;
};

export const DIFFUSION_ERROR_META: Record<DiffusionErrorCode, DiffusionErrorMeta> = {
  MODEL_MISSING: { severity: 'fatal', recoverable: true, message: 'The image model file is missing. Re-download it from the model library.' },
  MODEL_CORRUPT: { severity: 'fatal', recoverable: true, message: 'The image model is corrupt. Delete and re-download it.' },
  MODEL_UNSUPPORTED: { severity: 'fatal', recoverable: false, message: 'This image model format is not supported on your device.' },
  CFG_OUT_OF_RANGE: { severity: 'config', recoverable: true, message: 'Guidance (CFG) is out of range. Pick a value within the allowed band.' },
  STEPS_OUT_OF_RANGE: { severity: 'config', recoverable: true, message: 'Step count is out of range for this model.' },
  DIM_OUT_OF_RANGE: { severity: 'config', recoverable: true, message: 'Image size is out of range. Choose a smaller resolution.' },
  DIM_NOT_MULTIPLE: { severity: 'config', recoverable: true, message: 'Image width/height must be a multiple of 64.' },
  SAMPLER_UNSUPPORTED: { severity: 'config', recoverable: true, message: 'That sampler is not available for this model.' },
  SEED_INVALID: { severity: 'config', recoverable: true, message: 'Seed must be a non-negative whole number.' },
  PROMPT_EMPTY: { severity: 'config', recoverable: true, message: 'The scene prompt is empty.' },
  PROMPT_TOO_LONG: { severity: 'config', recoverable: true, message: 'The scene prompt is too long; it will be trimmed.' },
  OUT_OF_MEMORY: { severity: 'resource', recoverable: true, message: 'Not enough memory. Try a smaller image size or a lighter model.' },
  CANCELLED: { severity: 'transient', recoverable: true, message: 'Image generation cancelled.' },
  BUSY: { severity: 'transient', recoverable: true, message: 'An image is already being generated. Please wait.' },
  NOT_LOADED: { severity: 'fatal', recoverable: true, message: 'The image model is not loaded yet.' },
  BACKEND_UNAVAILABLE: { severity: 'resource', recoverable: true, message: 'The selected accelerator is unavailable; falling back to CPU.' },
  ENGINE_FAULT: { severity: 'fatal', recoverable: true, message: 'The image engine hit an unexpected fault and was reset.' },
};

// Strongly-typed error carrying a code, so callers can switch exhaustively.
export class DiffusionError extends Error {
  code: DiffusionErrorCode;
  severity: DiffusionErrorSeverity;
  recoverable: boolean;
  detail: string | undefined;

  constructor(code: DiffusionErrorCode, detail?: string) {
    const meta = DIFFUSION_ERROR_META[code];
    super(meta ? meta.message : code);
    this.name = 'DiffusionError';
    this.code = code;
    this.severity = meta ? meta.severity : 'fatal';
    this.recoverable = meta ? meta.recoverable : false;
    this.detail = detail;
  }
}

// Maps an arbitrary native error string onto a typed code so a raw native failure
// can never escape as an uncaught/unknown error (R8).
export function mapNativeError(raw: string): DiffusionError {
  const s = (raw || '').toLowerCase();
  if (s.includes('cancel')) return new DiffusionError(DiffusionErrorCode.CANCELLED, raw);
  if (s.includes('oom') || s.includes('out of memory') || s.includes('alloc')) return new DiffusionError(DiffusionErrorCode.OUT_OF_MEMORY, raw);
  if (s.includes('not found') || s.includes('no such file') || s.includes('enoent')) return new DiffusionError(DiffusionErrorCode.MODEL_MISSING, raw);
  if (s.includes('corrupt') || s.includes('checksum') || s.includes('magic')) return new DiffusionError(DiffusionErrorCode.MODEL_CORRUPT, raw);
  if (s.includes('unsupported') || s.includes('version')) return new DiffusionError(DiffusionErrorCode.MODEL_UNSUPPORTED, raw);
  if (s.includes('backend') || s.includes('qnn') || s.includes('npu') || s.includes('delegate')) return new DiffusionError(DiffusionErrorCode.BACKEND_UNAVAILABLE, raw);
  if (s.includes('busy') || s.includes('in flight')) return new DiffusionError(DiffusionErrorCode.BUSY, raw);
  return new DiffusionError(DiffusionErrorCode.ENGINE_FAULT, raw);
}
