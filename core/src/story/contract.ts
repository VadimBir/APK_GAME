// Parser + repair for the LLM's per-turn response (see content/RESPONSE_CONTRACT.md).
// The on-device LLM is small and will sometimes wrap prose around the JSON, omit
// fields, or emit trailing commas. This module extracts the first valid object,
// repairs common defects, and NEVER throws on bad model output — on total failure it
// returns a typed `parseFailed` marker so the Story Engine can re-prompt or fall back
// (Requirement R8 spirit: no crash on bad output).

export type TurnState = {
  location?: string;
  add_items?: string[];
  remove_items?: string[];
  flags?: Record<string, boolean>;
  meter?: Record<string, number>;
  ending?: string | null;
};

export type TurnResponse = {
  narration: string;
  image_prompt: string;
  choices: string[];
  state: TurnState;
};

export type ParseResult =
  | { ok: true; value: TurnResponse }
  | { ok: false; reason: 'no_json' | 'invalid_json' | 'wrong_shape'; raw: string };

// Pull the first balanced {...} block out of arbitrary text (handles prose + code
// fences around it, and braces inside strings).
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // unbalanced
}

// Best-effort cleanup of the common small-model JSON defects.
function repairJsonish(s: string): string {
  return s
    // strip ``` fences if any slipped in
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    // remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1')
    // smart quotes -> straight quotes
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string') as string[];
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function coerceState(v: unknown): TurnState {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: TurnState = {};
  if (typeof s.location === 'string') out.location = s.location;
  out.add_items = asStringArray(s.add_items);
  out.remove_items = asStringArray(s.remove_items);
  if (s.flags && typeof s.flags === 'object') {
    out.flags = {};
    for (const [k, val] of Object.entries(s.flags as Record<string, unknown>)) {
      out.flags[k] = Boolean(val);
    }
  }
  if (s.meter && typeof s.meter === 'object') {
    out.meter = {};
    for (const [k, val] of Object.entries(s.meter as Record<string, unknown>)) {
      const n = typeof val === 'number' ? val : Number(val);
      if (Number.isFinite(n)) out.meter[k] = n;
    }
  }
  out.ending = typeof s.ending === 'string' && s.ending.length > 0 ? s.ending : null;
  return out;
}

// Main entry. Always returns a ParseResult; never throws.
export function parseTurn(raw: string): ParseResult {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'no_json', raw: String(raw) };
  const block = extractFirstJsonObject(raw);
  if (!block) return { ok: false, reason: 'no_json', raw };

  let obj: unknown;
  try {
    obj = JSON.parse(block);
  } catch {
    try {
      obj = JSON.parse(repairJsonish(block));
    } catch {
      return { ok: false, reason: 'invalid_json', raw };
    }
  }

  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'wrong_shape', raw };
  const o = obj as Record<string, unknown>;

  // narration is the one field we truly need; everything else defaults safely.
  const narration = typeof o.narration === 'string' ? o.narration.trim() : '';
  if (!narration) return { ok: false, reason: 'wrong_shape', raw };

  return {
    ok: true,
    value: {
      narration,
      image_prompt: typeof o.image_prompt === 'string' ? o.image_prompt.trim() : '',
      choices: asStringArray(o.choices),
      state: coerceState(o.state),
    },
  };
}

// Deterministic fallback beat used after a re-prompt also fails. Keeps the game alive.
export function fallbackTurn(visualStyle: string): TurnResponse {
  return {
    narration: 'The terminal flickers. For a moment the words refuse to come. You wait, and the scene settles again around you.',
    image_prompt: `${visualStyle}, a dim uncertain scene, faint static`,
    choices: ['look around', 'wait'],
    state: { add_items: [], remove_items: [], ending: null },
  };
}
