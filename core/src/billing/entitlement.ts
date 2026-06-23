// Freemium entitlement + trial gate (Requirements R9, R10).
// The free "lite/trial" lets the player take a limited number of story turns; after
// that, the full game requires the one-time $1.99 unlock. The actual purchase is
// performed by a BillingBackend that is chosen at COMPILE TIME:
//   - release  -> PlayBillingBackend  (real Google Play purchase, R10a)
//   - debug    -> DebugGrantBackend   (free auto-grant, R10b) — compiled out of release
// This core module is backend-agnostic and fully unit-testable.

export const PRODUCT_ID = 'full_game_unlock';
export const PRICE_DISPLAY = '$1.99';

export type PurchaseResult =
  | { ok: true; mock?: boolean }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'pending' | 'error'; detail?: string };

// What the UI/billing native layer must provide. release & debug supply different impls.
export type BillingBackend = {
  // True if Google (or the debug grant) reports the product is owned.
  isEntitled: () => Promise<boolean>;
  // Launch the purchase flow (or auto-grant in debug). Must acknowledge on success.
  purchase: () => Promise<PurchaseResult>;
  // Re-query owned products (restore on a new device / reinstall).
  restore: () => Promise<boolean>;
};

// Tiny persistence interface (AsyncStorage in the app, a Map in tests).
export type KeyValueStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
};

const CACHE_KEY = 'entitlement.unlocked.v1';
const TRIAL_KEY = 'trial.turnsUsed.v1';

export type EntitlementConfig = {
  freeTurns: number; // total free story turns across the trial
  cacheTtlMs: number; // how long to trust the local "unlocked" cache before re-verifying
};

export const DEFAULT_ENTITLEMENT_CONFIG: EntitlementConfig = {
  freeTurns: 12,
  cacheTtlMs: 24 * 60 * 60 * 1000,
};

export class EntitlementService {
  private backend: BillingBackend;
  private store: KeyValueStore;
  private cfg: EntitlementConfig;
  private unlockedMemo: boolean | null = null;
  private now: () => number;

  constructor(
    backend: BillingBackend,
    store: KeyValueStore,
    cfg: EntitlementConfig = DEFAULT_ENTITLEMENT_CONFIG,
    now: () => number = Date.now,
  ) {
    this.backend = backend;
    this.store = store;
    this.cfg = cfg;
    this.now = now;
  }

  // Authoritative-ish unlock check: trust a fresh local cache, otherwise verify with the
  // backend and refresh the cache. Network/billing failure falls back to cache (offline
  // friendly) and never throws.
  async isUnlocked(): Promise<boolean> {
    const cached = await this.readCache();
    if (cached !== null) {
      this.unlockedMemo = cached;
      // Even with a valid cache, opportunistically re-verify in the background is the
      // app's job; here we honor the cache to keep offline play working.
      return cached;
    }
    let entitled = false;
    try {
      entitled = await this.backend.isEntitled();
    } catch {
      // backend unavailable (offline): default to locked unless a stale memo says true
      entitled = this.unlockedMemo === true;
    }
    await this.writeCache(entitled);
    this.unlockedMemo = entitled;
    return entitled;
  }

  // Purchase flow. On success persist the unlock immediately so play continues offline.
  async unlock(): Promise<PurchaseResult> {
    let result: PurchaseResult;
    try {
      result = await this.backend.purchase();
    } catch (e) {
      return { ok: false, reason: 'error', detail: String(e) };
    }
    if (result.ok) {
      await this.writeCache(true);
      this.unlockedMemo = true;
    }
    return result;
  }

  async restore(): Promise<boolean> {
    let owned = false;
    try {
      owned = await this.backend.restore();
    } catch {
      owned = false;
    }
    await this.writeCache(owned);
    this.unlockedMemo = owned;
    return owned;
  }

  // --- trial gate ---

  async turnsUsed(): Promise<number> {
    const raw = await this.store.get(TRIAL_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  async turnsRemaining(): Promise<number> {
    if (await this.isUnlocked()) return Number.POSITIVE_INFINITY;
    return Math.max(0, this.cfg.freeTurns - (await this.turnsUsed()));
  }

  // Returns true if the player may take another turn. If locked and out of free turns,
  // returns false and the UI must show the $1.99 paywall.
  async canTakeTurn(): Promise<boolean> {
    if (await this.isUnlocked()) return true;
    return (await this.turnsUsed()) < this.cfg.freeTurns;
  }

  // Record that a free turn was consumed. No-op once unlocked.
  async consumeTurn(): Promise<void> {
    if (await this.isUnlocked()) return;
    const used = await this.turnsUsed();
    await this.store.set(TRIAL_KEY, String(used + 1));
  }

  // --- cache helpers ---

  private async readCache(): Promise<boolean | null> {
    const raw = await this.store.get(CACHE_KEY);
    if (!raw) return null;
    try {
      const { v, t } = JSON.parse(raw) as { v: boolean; t: number };
      if (this.now() - t > this.cfg.cacheTtlMs) return null; // stale -> re-verify
      return Boolean(v);
    } catch {
      return null;
    }
  }

  private async writeCache(v: boolean): Promise<void> {
    await this.store.set(CACHE_KEY, JSON.stringify({ v, t: this.now() }));
  }
}
