// DiffusionEngine — the JS side of the native diffusion TurboModule (R2,R5,R6,R7,R8).
// It is the ONLY path the app uses to talk to stable-diffusion.cpp. Every call is
// validated/clamped in JS first (so out-of-range configs never reach native), serialized
// (the sd.cpp context is not thread-safe -> BUSY guard), and every native rejection is
// mapped to a typed DiffusionError (nothing uncaught).

import { NativeModules, NativeEventEmitter } from 'react-native';
import {
  DEFAULT_CAPABILITIES,
  validateParams,
  type DiffusionCapabilities,
  type DiffusionParams,
} from '../core/diffusion/params.ts';
import { DiffusionError, DiffusionErrorCode, mapNativeError } from '../core/diffusion/errors.ts';

export type Backend = 'cpu' | 'qnn';
export type ImageResult = { uri: string; seed: number; width: number; height: number };

// The native TurboModule contract (implemented by StableDiffusionModule.kt).
type NativeSD = {
  // Returns the model's real capability envelope (overrides DEFAULT_CAPABILITIES).
  loadModel: (path: string, backend: Backend) => Promise<DiffusionCapabilities & { backend: Backend }>;
  generate: (params: DiffusionParams) => Promise<ImageResult>;
  cancel: () => Promise<void>;
  unloadModel: () => Promise<void>;
  isLoaded: () => Promise<boolean>;
};

const Native: NativeSD | undefined = NativeModules.StableDiffusionModule;

export class DiffusionEngine {
  private caps: DiffusionCapabilities = DEFAULT_CAPABILITIES;
  private activeBackend: Backend = 'cpu';
  private loaded = false;
  private busy = false;
  private emitter: NativeEventEmitter | null = null;

  constructor() {
    if (Native) {
      try {
        this.emitter = new NativeEventEmitter(NativeModules.StableDiffusionModule);
      } catch {
        this.emitter = null;
      }
    }
  }

  capabilities(): DiffusionCapabilities {
    return this.caps;
  }

  backend(): Backend {
    return this.activeBackend;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  // Load a model with the requested backend. If 'qnn' (edge/NPU, R7) is unavailable on
  // this device, the native layer reports BACKEND_UNAVAILABLE and we transparently retry
  // on 'cpu' (graceful degradation, R7/R8).
  async load(path: string, backend: Backend = 'cpu'): Promise<void> {
    if (!Native) throw new DiffusionError(DiffusionErrorCode.ENGINE_FAULT, 'native module missing');
    try {
      const caps = await Native.loadModel(path, backend);
      this.caps = caps;
      this.activeBackend = caps.backend ?? backend;
      this.loaded = true;
    } catch (e) {
      const err = this.toTyped(e);
      if (err.code === DiffusionErrorCode.BACKEND_UNAVAILABLE && backend !== 'cpu') {
        // fall back to CPU once
        return this.load(path, 'cpu');
      }
      this.loaded = false;
      throw err;
    }
  }

  async unload(): Promise<void> {
    if (!Native || !this.loaded) return;
    try {
      await Native.unloadModel();
    } finally {
      this.loaded = false;
    }
  }

  // Generate one image. Validates params (throws typed config errors BEFORE native),
  // guards against concurrent calls, and maps any native failure to a typed error.
  async generate(
    params: DiffusionParams,
    onProgress?: (p: number) => void,
  ): Promise<ImageResult> {
    if (!Native) throw new DiffusionError(DiffusionErrorCode.ENGINE_FAULT, 'native module missing');
    if (!this.loaded) throw new DiffusionError(DiffusionErrorCode.NOT_LOADED);
    if (this.busy) throw new DiffusionError(DiffusionErrorCode.BUSY);

    // Pre-flight validation against THIS model's capabilities (R8). Throws first error.
    validateParams(params, this.caps);

    let progressSub: { remove: () => void } | null = null;
    if (onProgress && this.emitter) {
      progressSub = this.emitter.addListener('sd_progress', (e: { progress: number }) =>
        onProgress(e.progress),
      );
    }

    this.busy = true;
    try {
      return await Native.generate(params);
    } catch (e) {
      throw this.toTyped(e);
    } finally {
      this.busy = false;
      progressSub?.remove();
    }
  }

  async cancel(): Promise<void> {
    if (Native && this.busy) {
      try {
        await Native.cancel();
      } catch {
        /* cancel is best-effort */
      }
    }
  }

  // Normalize ANY thrown value into a typed DiffusionError so nothing escapes uncaught.
  private toTyped(e: unknown): DiffusionError {
    if (e instanceof DiffusionError) return e;
    // RN native rejections arrive as { code, message }.
    const anyE = e as { code?: string; message?: string };
    if (anyE && typeof anyE.code === 'string' && (DiffusionErrorCode as Record<string, string>)[anyE.code]) {
      return new DiffusionError(anyE.code as DiffusionErrorCode, anyE.message);
    }
    return mapNativeError(anyE?.message ?? String(e));
  }
}
