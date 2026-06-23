// Wiring factory: assembles the full game stack from Pocket Pal's existing pieces +
// our graft. This is where Pocket Pal's llama.rn context and HF download plumbing meet
// the diffusion engine, the governor, and the trial gate. Keep integration points here
// so the GameScreen stays declarative.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ModelGovernor, type EngineAdapter } from '../core/engine/governor.ts';
import { EntitlementService, type KeyValueStore } from '../core/billing/entitlement.ts';
import { StoryEngine, type LlmAdapter, type StoryBible } from './StoryEngine.ts';
import { DiffusionEngine } from '../diffusion/DiffusionEngine.ts';
import { makeBillingBackend } from '../billing/backends.ts';
import { DEFAULT_DIFFUSION_MODEL, diffusionModelLocalPath } from '../models/diffusionCatalog.ts';

// AsyncStorage adapter for the entitlement cache + trial counter.
const kvStore: KeyValueStore = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
};

// Pocket Pal's ModelStore is the source of the live llama.rn context. We wrap it so the
// governor can load/unload the LLM. `modelStore` is the existing MobX store instance.
//   - load():   modelStore.initContext(selectedModel)  (already mutex-guarded upstream)
//   - unload(): modelStore.releaseContext(true)          (stop-await-release)
// See docs/RESEARCH.md §A — these already implement sequential single-model semantics.
export function makeLlmAdapter(modelStore: any, selectedModelId: string): { adapter: EngineAdapter; llm: LlmAdapter } {
  const adapter: EngineAdapter = {
    kind: 'llm',
    isLoaded: () => Boolean(modelStore.context) && modelStore.activeModelId === selectedModelId,
    load: async () => {
      const model = modelStore.availableModels.find((m: any) => m.id === selectedModelId);
      if (!model) throw new Error(`LLM model not found: ${selectedModelId}`);
      await modelStore.initContext(model);
    },
    unload: async () => {
      await modelStore.releaseContext(true);
    },
  };

  const llm: LlmAdapter = {
    complete: async (systemPrompt, transcript) => {
      const ctx = modelStore.context;
      if (!ctx) throw new Error('LLM context not available');
      const messages = [
        { role: 'system', content: systemPrompt },
        ...transcript.map((t) => ({ role: t.role, content: t.content })),
      ];
      // llama.rn completion. Stop tokens kept minimal; the parser tolerates extra prose.
      const out = await ctx.completion({
        messages,
        n_predict: 400,
        temperature: 0.8,
        top_p: 0.95,
      });
      return (out && (out.text ?? out.content)) || '';
    },
  };

  return { adapter, llm };
}

export type GameStack = {
  engine: StoryEngine;
  governor: ModelGovernor;
  diffusion: DiffusionEngine;
  entitlement: EntitlementService;
};

// Build everything for a chosen story + LLM. `docDir` is RNFS.DocumentDirectoryPath.
export async function buildGameStack(args: {
  bible: StoryBible;
  modelStore: any;
  selectedLlmId: string;
  docDir: string;
  onState?: (s: { status: string; message: string }) => void;
}): Promise<GameStack> {
  const diffusion = new DiffusionEngine();

  const diffusionAdapter: EngineAdapter = {
    kind: 'diffusion',
    isLoaded: () => diffusion.isLoaded(),
    load: async () => {
      const path = diffusionModelLocalPath(args.docDir, DEFAULT_DIFFUSION_MODEL);
      await diffusion.load(path, 'cpu');
    },
    unload: async () => diffusion.unload(),
  };

  const { adapter: llmAdapter, llm } = makeLlmAdapter(args.modelStore, args.selectedLlmId);
  const governor = new ModelGovernor(llmAdapter, diffusionAdapter);
  const entitlement = new EntitlementService(makeBillingBackend(), kvStore);

  const engine = new StoryEngine({
    bible: args.bible,
    governor,
    llm,
    diffusion: {
      capabilities: () => diffusion.capabilities(),
      generate: (p, onP) => diffusion.generate(p, onP),
    },
    entitlement,
    onState: args.onState as any,
  });

  return { engine, governor, diffusion, entitlement };
}
