// ModelGovernor (Requirement R5): guarantees only ONE heavy model is resident in RAM
// at a time. A phone cannot hold a multi-GB LLM and a Stable-Diffusion model together,
// so before loading one we unload the other. This is the "single-resident" traffic cop.
//
// It is engine-agnostic: the real app injects adapters that wrap llama.rn (text) and the
// native DiffusionModule (image). Here we depend only on a tiny async interface so the
// state machine is fully unit-testable in Node.

export type EngineKind = 'llm' | 'diffusion';

export type ResidentState =
  | { status: 'empty' }
  | { status: 'loading'; kind: EngineKind }
  | { status: 'loaded'; kind: EngineKind }
  | { status: 'unloading'; kind: EngineKind };

// An adapter the governor controls. load()/unload() must be idempotent-safe; the
// governor serializes calls so they never overlap.
export type EngineAdapter = {
  kind: EngineKind;
  load: () => Promise<void>;
  unload: () => Promise<void>;
  isLoaded: () => boolean;
};

export type GovernorEvent =
  | { type: 'state'; state: ResidentState }
  | { type: 'swap'; from: EngineKind; to: EngineKind }
  | { type: 'error'; kind: EngineKind; error: unknown };

export class ModelGovernor {
  private adapters: Record<EngineKind, EngineAdapter>;
  private state: ResidentState = { status: 'empty' };
  // Serializes all transitions so two ensure() calls can't race the RAM.
  private queue: Promise<unknown> = Promise.resolve();
  private listeners: ((e: GovernorEvent) => void)[] = [];

  constructor(llm: EngineAdapter, diffusion: EngineAdapter) {
    this.adapters = { llm, diffusion };
  }

  onEvent(fn: (e: GovernorEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  getState(): ResidentState {
    return this.state;
  }

  // The only public way to get a model ready. Resolves once `kind` is the resident,
  // unloading the other engine first if necessary. Serialized via the queue.
  ensure(kind: EngineKind): Promise<void> {
    const run = this.queue.then(() => this.ensureNow(kind));
    // keep the chain alive even if this op rejects
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // Free whatever is resident (e.g. when leaving the game screen to reclaim RAM).
  releaseAll(): Promise<void> {
    const run = this.queue.then(() => this.unloadCurrent());
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private emit(e: GovernorEvent) {
    for (const l of this.listeners) l(e);
  }

  private setState(s: ResidentState) {
    this.state = s;
    this.emit({ type: 'state', state: s });
  }

  private async unloadCurrent(): Promise<void> {
    if (this.state.status === 'loaded') {
      const cur = this.state.kind;
      this.setState({ status: 'unloading', kind: cur });
      try {
        await this.adapters[cur].unload();
      } catch (error) {
        // Even if unload reports an error, we must not leave the governor wedged;
        // surface it but proceed to empty so a reload can be attempted.
        this.emit({ type: 'error', kind: cur, error });
      }
      this.setState({ status: 'empty' });
    }
  }

  private async ensureNow(kind: EngineKind): Promise<void> {
    // Already the resident and actually loaded — nothing to do.
    if (this.state.status === 'loaded' && this.state.kind === kind && this.adapters[kind].isLoaded()) {
      return;
    }

    const previous = this.state.status === 'loaded' ? this.state.kind : null;

    // Unload the other engine first (single-resident guarantee).
    if (previous && previous !== kind) {
      await this.unloadCurrent();
      this.emit({ type: 'swap', from: previous, to: kind });
    } else if (this.state.status !== 'empty') {
      // defensive: ensure we are empty before loading
      await this.unloadCurrent();
    }

    this.setState({ status: 'loading', kind });
    try {
      await this.adapters[kind].load();
    } catch (error) {
      this.emit({ type: 'error', kind, error });
      this.setState({ status: 'empty' });
      throw error; // caller decides how to surface; governor stays consistent (empty)
    }
    this.setState({ status: 'loaded', kind });
  }
}
