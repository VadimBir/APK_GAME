# LLM → Game response contract

Every story's `system_prompt` instructs the local LLM to end each turn with a fenced
JSON block. The Story Engine parses this. Keep it small — phones are slow.

```json
{
  "narration": "2-4 sentences, second person, in-tone.",
  "image_prompt": "comma-separated visual tags for the CURRENT scene, in the story's visual_style",
  "choices": ["short verb phrase", "another option"],
  "state": {
    "location": "location_id",
    "add_items": ["item_id"],
    "remove_items": ["item_id"],
    "flags": { "door_open": true },
    "meter": { "oil": 7 },
    "ending": null
  }
}
```

Rules the engine enforces (and repairs):
- If the model wraps prose around the JSON, the engine extracts the first valid object.
- Missing fields default safely (`choices=[]`, `add_items=[]`, `ending=null`).
- `image_prompt` is always prefixed with the story's `visual_style` before diffusion.
- `ending` ∈ {null, "win", and the story's lose keys}; a non-null ending stops the loop.
- On unparseable output: one silent re-prompt, then a deterministic fallback beat.
  The game NEVER crashes on bad model output (R8 spirit).
