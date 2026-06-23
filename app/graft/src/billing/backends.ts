// Billing backend selection (R10). The EntitlementService (core) is backend-agnostic;
// here we pick the concrete backend from a COMPILE-TIME flag baked per build type:
//   - debug build   -> BILLING_BYPASS = true  -> DebugGrantBackend (free unlock, R10b)
//   - release build -> BILLING_BYPASS = false -> PlayBillingBackend (real Play, R10a)
//
// BILLING_BYPASS is read from native BuildConfig via BillingConfigModule (zero extra
// JS dep). Because it is a per-buildType compile-time literal, the free-unlock path is
// physically absent from the release bytecode.

import { NativeModules } from 'react-native';
import {
  PRODUCT_ID,
  type BillingBackend,
  type PurchaseResult,
} from '../core/billing/entitlement.ts';

// Read the compiled flag. Default to FALSE (locked / real billing) if the bridge is
// somehow unavailable — fail safe, never accidentally unlock in release.
export function billingBypassEnabled(): boolean {
  const m = NativeModules.BillingConfigModule;
  return m && m.BILLING_BYPASS === true;
}

// --- DEBUG: free auto-grant. Compiled into debug builds only. ---
class DebugGrantBackend implements BillingBackend {
  async isEntitled(): Promise<boolean> {
    return true; // debug builds are always unlocked for testing
  }
  async purchase(): Promise<PurchaseResult> {
    return { ok: true, mock: true }; // simulate an instant, free purchase
  }
  async restore(): Promise<boolean> {
    return true;
  }
}

// --- RELEASE: real Google Play Billing via react-native-iap v14. ---
// Imported lazily so the debug build need not bundle the IAP native dependency path,
// and so a missing module can be handled gracefully rather than crashing at import.
class PlayBillingBackend implements BillingBackend {
  private iap: typeof import('react-native-iap') | null = null;
  private connected = false;

  private async ensure(): Promise<typeof import('react-native-iap')> {
    if (!this.iap) this.iap = await import('react-native-iap');
    if (!this.connected) {
      await this.iap.initConnection();
      // clear stale pending purchases so re-purchase doesn't ghost-fail (research §7.6)
      if (this.iap.flushFailedPurchasesCachedAsPendingAndroid) {
        try { await this.iap.flushFailedPurchasesCachedAsPendingAndroid(); } catch { /* ok */ }
      }
      this.connected = true;
    }
    return this.iap;
  }

  async isEntitled(): Promise<boolean> {
    const iap = await this.ensure();
    const purchases = await iap.getAvailablePurchases();
    return purchases.some((p: { productId: string }) => p.productId === PRODUCT_ID);
  }

  async purchase(): Promise<PurchaseResult> {
    const iap = await this.ensure();
    try {
      const result = await iap.requestPurchase({ skus: [PRODUCT_ID] });
      const purchase = Array.isArray(result) ? result[0] : result;
      if (!purchase) return { ok: false, reason: 'error', detail: 'no purchase returned' };
      // MUST acknowledge within 72h or Google auto-refunds (research §7.1).
      await iap.finishTransaction({ purchase, isConsumable: false });
      return { ok: true };
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === 'E_USER_CANCELLED') return { ok: false, reason: 'cancelled' };
      if (code === 'E_ITEM_UNAVAILABLE') return { ok: false, reason: 'unavailable' };
      if (code === 'E_DEFERRED_PAYMENT') return { ok: false, reason: 'pending' };
      return { ok: false, reason: 'error', detail: String((e as { message?: string }).message ?? e) };
    }
  }

  async restore(): Promise<boolean> {
    return this.isEntitled(); // Android keeps non-consumables; re-query == restore
  }
}

// The single selector the app uses. The branch is decided by a compile-time literal,
// so tree-shaking/dead-code keeps the unused backend out of each variant.
export function makeBillingBackend(): BillingBackend {
  return billingBypassEnabled() ? new DebugGrantBackend() : new PlayBillingBackend();
}
