package com.pocketpal

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.pocketpal.billing.BillingConfigModule
import com.pocketpal.diffusion.StableDiffusionModule

/**
 * Registers ARCANE TERMINAL's added native modules. Must be added to the package list
 * in MainApplication.kt (the graft patches this in):
 *   packages.add(ArcanePackage())
 */
class ArcanePackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): MutableList<NativeModule> =
        mutableListOf(
            StableDiffusionModule(ctx),
            BillingConfigModule(ctx),
        )

    override fun createViewManagers(ctx: ReactApplicationContext): MutableList<ViewManager<*, *>> =
        mutableListOf()
}
