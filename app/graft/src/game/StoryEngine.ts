// StoryEngine — the per-turn orchestrator that wires EVERYTHING together (R1,R2,R5,R9).
// It is deliberately UI-agnostic and engine-agnostic: the GameScreen drives it, and it
// drives the ModelGovernor (sequential single-resident), the LLM adapter (llama.rn), the
// diffusion engine, the turn parser, and the entitlement/trial gate.
//
// One player action => one turn:
//   1. entitlement.canTakeTurn()  (gate the free trial; else signal paywall)   [R9]
//   2. governor.ensure('llm')     (unload diffusion if resident)               [R5]
//   3. llm.complete(prompt)       (narrate)                                     [R1]
//   4. parseTurn(raw)             (repair/fallback; never throws)
//   5. governor.ensure('diffusion') (unload llm)                               [R5]
//   6. diffusion.generate(...)    (illustrate the SAME scene)                  [R2]
//   7. entitlement.consumeTurn()  (count the free turn)                        [R9]
//
// Steps 5–6 are best-effort: if image generation fails, the story still advances with
// the narration and a typed, user-facing error (R8) — the game never crashes.

import { ModelGovernor } from '../core/engine/governor.ts';
import { parseTurn, fallbackTurn, type TurnResponse } from '../core/story/contract.ts';
import { EntitlementService } from '../core/billing/entitlement.ts';
import {
  clampParams,
  DEFAULT_PARAMS,
  type DiffusionCapabilities,
  type DiffusionParams,
} from '../core/diffusion/params.ts';
import { DiffusionError } from '../core/diffusion/errors.ts';

export type StoryBible = {
  id: string;
  title: string;
  visual_style: string;
  system_prompt: string;
  world: { start_location: string; goal: string };
};

// What the LLM adapter (wrapping llama.rn) must provide.
export type LlmAdapter = {
  // Returns the raw model text for a single completion. The governor guarantees the
  // model is resident before this is called.
  complete: (systemPrompt: string, transcript: ChatTurn[]) => Promise<string>;
};

// What the diffusion bridge must provide (see DiffusionEngine.ts).
export type DiffusionAdapter = {
  capabilities: () => DiffusionCapabilities;
  generate: (params: DiffusionParams, onProgress?: (p: number) => void) => Promise<ImageResult>;
};

export type ImageResult = { uri: string; seed: number; width: number; height: number };
export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type TurnOutput =
  | { kind: 'turn'; response: TurnResponse; image: ImageResult | null; imageError: DiffusionError | null; ended: string | null }
  | { kind: 'paywall' }; // out of free turns and locked

export type EngineState = {
  status: 'idle' | 'narrating' | 'illustrating';
  message: string;
};

export class StoryEngine {
  private bible: StoryBible;
  private governor: ModelGovernor;
  private llm: LlmAdapter;
  private diffusion: DiffusionAdapter;
  private entitlement: EntitlementService;
  private transcript: ChatTurn[] = [];
  private onState: (s: EngineState) => void;

  constructor(args: {
    bible: StoryBible;
    governor: ModelGovernor;
    llm: LlmAdapter;
    diffusion: DiffusionAdapter;
    entitlement: EntitlementService;
    onState?: (s: EngineState) => void;
  }) {
    this.bible = args.bible;
    this.governor = args.governor;
    this.llm = args.llm;
    this.diffusion = args.diffusion;
    this.entitlement = args.entitlement;
    this.onState = args.onState ?? (() => {});
  }

  // The opening beat: a synthetic first action so the model sets the scene.
  async begin(): Promise<TurnOutput> {
    this.transcript = [];
    return this.take('begin the adventure');
  }

  // Process one player action through the full pipeline.
  async take(action: string): Promise<TurnOutput> {
    // 1. Trial gate (R9).
    if (!(await this.entitlement.canTakeTurn())) {
      return { kind: 'paywall' };
    }

    this.transcript.push({ role: 'user', content: action });

    // 2-4. Narrate with the LLM (governor ensures it's the resident model). [R5,R1]
    this.onState({ status: 'narrating', message: 'The terminal is thinking…' });
    let response: TurnResponse;
    try {
      await this.governor.ensure('llm');
      const raw = await this.llm.complete(this.bible.system_prompt, this.transcript);
      const parsed = parseTurn(raw);
      if (parsed.ok) {
        response = parsed.value;
      } else {
        // one silent re-prompt, then deterministic fallback (never crash). [R8 spirit]
        const raw2 = await this.llm.complete(
          this.bible.system_prompt + '\nRespond ONLY with the JSON object.',
          this.transcript,
        );
        const parsed2 = parseTurn(raw2);
        response = parsed2.ok ? parsed2.value : fallbackTurn(this.bible.visual_style);
      }
    } catch (e) {
      // LLM totally failed: keep the game alive with a fallback beat.
      response = fallbackTurn(this.bible.visual_style);
    }
    this.transcript.push({ role: 'assistant', content: response.narration });

    // 5-6. Illustrate the SAME scene (best-effort; failures are typed, not fatal). [R5,R2,R8]
    let image: ImageResult | null = null;
    let imageError: DiffusionError | null = null;
    if (response.image_prompt) {
      this.onState({ status: 'illustrating', message: 'The terminal is dreaming…' });
      try {
        await this.governor.ensure('diffusion');
        const params = this.buildImageParams(response.image_prompt);
        image = await this.diffusion.generate(params);
      } catch (e) {
        imageError = e instanceof DiffusionError ? e : new DiffusionError('ENGINE_FAULT', String(e));
      }
    }

    // 7. Count the free turn (no-op once unlocked). [R9]
    await this.entitlement.consumeTurn();

    this.onState({ status: 'idle', message: '' });
    const ended = response.state.ending ?? null;
    return { kind: 'turn', response, image, imageError, ended };
  }

  // Compose the final diffusion params: story visual style + the model's scene tags,
  // clamped to the engine's real capabilities so out-of-range values can never reach
  // native code (R8). Uses the loaded engine's reported caps, not just defaults.
  private buildImageParams(scenePrompt: string): DiffusionParams {
    const caps = this.diffusion.capabilities();
    const loose: DiffusionParams = {
      ...DEFAULT_PARAMS,
      prompt: `${this.bible.visual_style}, ${scenePrompt}`,
    };
    return clampParams(loose, caps);
  }

  getTranscript(): ChatTurn[] {
    return this.transcript.slice();
  }

  // Called when leaving the game to reclaim RAM (R5).
  async dispose(): Promise<void> {
    await this.governor.releaseAll();
  }
}
