import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EntitlementService,
  type BillingBackend,
  type KeyValueStore,
  type PurchaseResult,
} from '../src/billing/entitlement.ts';

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => (m.has(k) ? m.get(k)! : null),
    set: async (k, v) => void m.set(k, v),
  };
}

function backend(opts: { entitled?: boolean; purchase?: PurchaseResult; throwEntitled?: boolean }): BillingBackend {
  let owned = opts.entitled ?? false;
  return {
    isEntitled: async () => {
      if (opts.throwEntitled) throw new Error('offline');
      return owned;
    },
    purchase: async () => {
      const r = opts.purchase ?? { ok: true };
      if (r.ok) owned = true;
      return r;
    },
    restore: async () => owned,
  };
}

test('locked user has limited free turns then is gated', async () => {
  const svc = new EntitlementService(backend({}), memStore(), { freeTurns: 3, cacheTtlMs: 1000 });
  assert.equal(await svc.isUnlocked(), false);
  for (let i = 0; i < 3; i++) {
    assert.equal(await svc.canTakeTurn(), true, `turn ${i} should be allowed`);
    await svc.consumeTurn();
  }
  assert.equal(await svc.canTakeTurn(), false, 'gated after free turns');
  assert.equal(await svc.turnsRemaining(), 0);
});

test('purchase unlocks and grants infinite turns (debug or real backend)', async () => {
  const svc = new EntitlementService(backend({}), memStore(), { freeTurns: 2, cacheTtlMs: 1000 });
  await svc.consumeTurn();
  await svc.consumeTurn();
  assert.equal(await svc.canTakeTurn(), false);
  const r = await svc.unlock();
  assert.equal(r.ok, true);
  assert.equal(await svc.isUnlocked(), true);
  assert.equal(await svc.canTakeTurn(), true, 'unlocked plays freely');
  assert.equal(await svc.turnsRemaining(), Number.POSITIVE_INFINITY);
});

test('consumeTurn is a no-op once unlocked', async () => {
  const svc = new EntitlementService(backend({ entitled: true }), memStore(), { freeTurns: 2, cacheTtlMs: 1000 });
  await svc.consumeTurn();
  assert.equal(await svc.turnsUsed(), 0);
});

test('cancelled purchase does not unlock', async () => {
  const svc = new EntitlementService(backend({ purchase: { ok: false, reason: 'cancelled' } }), memStore(), { freeTurns: 1, cacheTtlMs: 1000 });
  const r = await svc.unlock();
  assert.equal(r.ok, false);
  assert.equal(await svc.isUnlocked(), false);
});

test('entitlement is cached so offline launches still work', async () => {
  const store = memStore();
  const svc1 = new EntitlementService(backend({ entitled: true }), store, { freeTurns: 1, cacheTtlMs: 60_000 });
  assert.equal(await svc1.isUnlocked(), true); // writes cache

  // New service whose backend throws (offline) must still report unlocked from cache.
  const svc2 = new EntitlementService(backend({ throwEntitled: true }), store, { freeTurns: 1, cacheTtlMs: 60_000 });
  assert.equal(await svc2.isUnlocked(), true);
});

test('stale cache is re-verified against backend', async () => {
  const store = memStore();
  let t = 1_000_000;
  const now = () => t;
  // First: entitled, cache written at t.
  const svc = new EntitlementService(backend({ entitled: true }), store, { freeTurns: 1, cacheTtlMs: 1000 }, now);
  assert.equal(await svc.isUnlocked(), true);
  // Advance beyond TTL; backend now reports NOT entitled (e.g. refunded).
  t += 5000;
  const svc2 = new EntitlementService(backend({ entitled: false }), store, { freeTurns: 1, cacheTtlMs: 1000 }, now);
  assert.equal(await svc2.isUnlocked(), false, 'stale cache must re-verify and reflect refund');
});

test('restore re-queries ownership', async () => {
  const svc = new EntitlementService(backend({ entitled: true }), memStore(), { freeTurns: 1, cacheTtlMs: 1000 });
  assert.equal(await svc.restore(), true);
});
