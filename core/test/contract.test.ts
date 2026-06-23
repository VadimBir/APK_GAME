import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTurn, extractFirstJsonObject, fallbackTurn } from '../src/story/contract.ts';

test('parses a clean JSON turn', () => {
  const raw = JSON.stringify({
    narration: 'You stand in the antechamber.',
    image_prompt: 'cold stone vestibule, brass door',
    choices: ['go down', 'take lamp'],
    state: { location: 'antechamber', add_items: ['brass_lamp'], flags: { door_open: false }, meter: { oil: 10 }, ending: null },
  });
  const r = parseTurn(raw);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.narration, 'You stand in the antechamber.');
    assert.deepEqual(r.value.choices, ['go down', 'take lamp']);
    assert.equal(r.value.state.location, 'antechamber');
    assert.deepEqual(r.value.state.add_items, ['brass_lamp']);
    assert.equal(r.value.state.meter?.oil, 10);
    assert.equal(r.value.state.ending, null);
  }
});

test('extracts JSON wrapped in prose and code fences', () => {
  const raw = 'Sure! Here is your turn:\n```json\n{ "narration": "A door creaks.", "image_prompt": "old door" }\n```\nHope that helps.';
  const r = parseTurn(raw);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.narration, 'A door creaks.');
});

test('repairs trailing commas and smart quotes', () => {
  const raw = '{ “narration”: “You wait.”, “choices”: [“wait”,], }';
  const r = parseTurn(raw);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.narration, 'You wait.');
    assert.deepEqual(r.value.choices, ['wait']);
  }
});

test('handles braces inside narration strings', () => {
  const raw = '{ "narration": "The rune {sigil} glows.", "image_prompt": "glowing rune" }';
  const obj = extractFirstJsonObject(raw);
  assert.ok(obj && obj.endsWith('}'));
  const r = parseTurn(raw);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.narration, 'The rune {sigil} glows.');
});

test('missing optional fields default safely', () => {
  const r = parseTurn('{ "narration": "Only narration here." }');
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value.choices, []);
    assert.equal(r.value.image_prompt, '');
    assert.deepEqual(r.value.state.add_items, []);
    assert.equal(r.value.state.ending, null);
  }
});

test('no JSON at all -> not ok, never throws', () => {
  const r = parseTurn('I refuse to answer in JSON, sorry.');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'no_json');
});

test('JSON without narration -> wrong_shape', () => {
  const r = parseTurn('{ "image_prompt": "x", "choices": ["a"] }');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'wrong_shape');
});

test('garbage input never throws and yields a typed failure', () => {
  for (const junk of ['', '{{{{', 'null', '[]', '{"narration": 5}']) {
    const r = parseTurn(junk);
    assert.equal(r.ok, false);
  }
});

test('fallbackTurn is always valid and includes the visual style', () => {
  const t = fallbackTurn('gothic oil painting');
  assert.ok(t.narration.length > 0);
  assert.ok(t.image_prompt.includes('gothic oil painting'));
  assert.equal(t.state.ending, null);
});
