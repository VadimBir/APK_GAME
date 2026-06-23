package com.pocketpal.billing

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.pocketpal.BuildConfig

/**
 * Exposes the per-buildType compile-time billing flag to JS (R10).
 * `BuildConfig.BILLING_BYPASS` is set in app/build.gradle:
 *   debug   -> true   (free unlock test build, R10b)
 *   release -> false  (real Play Billing, R10a)
 * Because it is a compiled constant, the release APK literally contains `false`.
 */
class BillingConfigModule(context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    override fun getName() = "BillingConfigModule"

    // Constants are available synchronously to JS via NativeModules.BillingConfigModule.
    override fun getConstants(): MutableMap<String, Any> =
        hashMapOf("BILLING_BYPASS" to BuildConfig.BILLING_BYPASS)
}
