import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelGovernor, type EngineAdapter, type GovernorEvent } from '../src/engine/governor.ts';

// A fake engine adapter that records load/unload and tracks loaded state. A shared
// `resident` array lets tests assert that the two engines are NEVER both loaded.
function makeAdapter(kind: 'llm' | 'diffusion', resident: Set<string>, log: string[], opts: { failLoad?: boolean } = {}): EngineAdapter {
  let loaded = false;
  return {
    kind,
    isLoaded: () => loaded,
    load: async () => {
      log.push(`load:${kind}`);
      if (opts.failLoad) throw new Error(`load ${kind} failed`);
      // The invariant we care about: nothing else may be resident when we load.
      assert.equal(resident.size, 0, `another model resident when loading ${kind}: ${[...resident]}`);
      resident.add(kind);
      loaded = true;
    },
    unload: async () => {
      log.push(`unload:${kind}`);
      resident.delete(kind);
      loaded = false;
    },
  };
}

test('loads the requested engine', async () => {
  const resident = new Set<string>();
  const log: string[] = [];
  const g = new ModelGovernor(makeAdapter('llm', resident, log), makeAdapter('diffusion', resident, log));
  await g.ensure('llm');
  assert.deepEqual(g.getState(), { status: 'loaded', kind: 'llm' });
  assert.deepEqual([...resident], ['llm']);
});

test('swapping engines unloads the previous one FIRST (single-resident, R5)', async () => {
  const resident = new Set<string>();
  const log: string[] = [];
  const events: GovernorEvent[] = [];
  const g = new ModelGovernor(makeAdapter('llm', resident, log), makeAdapter('diffusion', resident, log));
  g.onEvent((e) => events.push(e));

  await g.ensure('llm');
  await g.ensure('diffusion');

  // unload of llm must occur before load of diffusion
  assert.deepEqual(log, ['load:llm', 'unload:llm', 'load:diffusion']);
  assert.deepEqual([...resident], ['diffusion']);
  assert.ok(events.some((e) => e.type === 'swap' && e.from === 'llm' && e.to === 'diffusion'));
});

test('ensure() is idempotent when already loaded', async () => {
  const resident = new Set<string>();
  const log: string[] = [];
  const g = new ModelGovernor(makeAdapter('llm', resident, log), makeAdapter('diffusion', resident, log));
  await g.ensure('llm');
  await g.ensure('llm');
  assert.deepEqual(log, ['load:llm']); // no second load
});

test('concurrent ensure() calls are serialized and never co-resident', async () => {
  const resident = new Set<string>();
  const log: string[] = [];
  const g = new ModelGovernor(makeAdapter('llm', resident, log), makeAdapter('diffusion', resident, log));
  // Fire a rapid alternating burst without awaiting between calls.
  await Promise.all([g.ensure('llm'), g.ensure('diffusion'), g.ensure('llm'), g.ensure('diffusion')]);
  // The invariant assertion inside load() would have thrown if both were ever resident.
  assert.equal(resident.size, 1);
  assert.equal(g.getState().status, 'loaded');
});

test('failed load leaves governor consistent (empty) and rethrows', async () => {
  const resident = new Set<string>();
  const log: string[] = [];
  const g = new ModelGovernor(
    makeAdapter('llm', resident, log, { failLoad: true }),
    makeAdapter('diffusion', resident, log),
  );
  await assert.rejects(() => g.ensure('llm'), /load llm failed/);
  assert.deepEqual(g.getState(), { status: 'empty' });
  // governor still usable afterward
  await g.ensure('diffusion');
  assert.deepEqual(g.getState(), { status: 'loaded', kind: 'diffusion' });
});

test('releaseAll frees the resident model', async () => {
  const resident = new Set<string>();
  const log: string[] = [];
  const g = new ModelGovernor(makeAdapter('llm', resident, log), makeAdapter('diffusion', resident, log));
  await g.ensure('diffusion');
  await g.releaseAll();
  assert.deepEqual(g.getState(), { status: 'empty' });
  assert.equal(resident.size, 0);
});
