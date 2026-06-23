package com.pocketpal.diffusion

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.concurrent.Executors

/**
 * StableDiffusionModule — RN bridge over stable-diffusion.cpp (ADR-004).
 *
 * Design guarantees that satisfy the requirements:
 *  - R5  load/unload are deterministic (new_sd_ctx / free_sd_ctx via JNI).
 *  - R8  EVERY native failure is mapped to a typed code the JS layer knows; nothing
 *        escapes as an uncaught crash. NULL ctx / OOM / missing / corrupt are caught.
 *  - sd.cpp context is NOT thread-safe, so ALL native calls run on a single-thread
 *        executor and a `busy` flag rejects concurrent generate() with BUSY.
 *
 * The JNI layer (libsd_bridge.so, built from stable-diffusion.cpp via the module's
 * CMakeLists — see graft/android/diffusion/CMakeLists.txt) exposes the `nativeXxx`
 * methods. Reference packaging: Aatricks/llmedge (Apache-2.0).
 */
class StableDiffusionModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val worker = Executors.newSingleThreadExecutor()
    @Volatile private var ctxPtr: Long = 0L      // native sd_ctx_t*; 0 == not loaded
    @Volatile private var busy: Boolean = false
    @Volatile private var cancelRequested: Boolean = false

    override fun getName() = "StableDiffusionModule"

    companion object {
        private const val TAG = "ArcaneSD"
        init {
            try {
                System.loadLibrary("sd_bridge")
            } catch (t: Throwable) {
                Log.e(TAG, "failed to load libsd_bridge", t)
            }
        }
        // --- JNI surface (implemented in cpp/sd_bridge.cpp) ---
        // Returns 0 on failure (OOM / missing / corrupt / unsupported). Backend: 0=cpu,1=qnn.
        @JvmStatic external fun nativeLoad(modelPath: String, backend: Int): Long
        // Returns absolute path of the written PNG, or null on failure. Sets lastError.
        @JvmStatic external fun nativeGenerate(
            ctx: Long, prompt: String, negative: String, width: Int, height: Int,
            steps: Int, cfg: Float, sampler: String, seed: Long, outPath: String
        ): String?
        @JvmStatic external fun nativeCancel(ctx: Long)
        @JvmStatic external fun nativeFree(ctx: Long)
        // Last native error string for mapping (R8). Empty if none.
        @JvmStatic external fun nativeLastError(): String
        // Reports whether the QNN/NPU backend is usable on this device (R7).
        @JvmStatic external fun nativeBackendAvailable(backend: Int): Boolean
    }

    /** Load a model; resolves with the capability envelope or rejects with a typed code. */
    @ReactMethod
    fun loadModel(path: String, backend: String, promise: Promise) {
        worker.execute {
            try {
                if (!File(path).exists()) {
                    promise.reject("MODEL_MISSING", "model not found: $path"); return@execute
                }
                val backendInt = if (backend == "qnn") 1 else 0
                if (backendInt == 1 && !nativeBackendAvailable(1)) {
                    // R7: NPU not present -> tell JS, which falls back to cpu.
                    promise.reject("BACKEND_UNAVAILABLE", "qnn backend not available"); return@execute
                }
                if (ctxPtr != 0L) { nativeFree(ctxPtr); ctxPtr = 0L }   // single-resident (R5)
                val ptr = nativeLoad(path, backendInt)
                if (ptr == 0L) { promise.reject(classify(nativeLastError(), "MODEL_UNSUPPORTED"), nativeLastError()); return@execute }
                ctxPtr = ptr
                promise.resolve(capabilities(if (backendInt == 1) "qnn" else "cpu"))
            } catch (t: Throwable) {
                promise.reject("ENGINE_FAULT", t.message, t)
            }
        }
    }

    @ReactMethod
    fun generate(params: ReadableMap, promise: Promise) {
        worker.execute {
            if (ctxPtr == 0L) { promise.reject("NOT_LOADED", "no model loaded"); return@execute }
            if (busy) { promise.reject("BUSY", "a generation is already running"); return@execute }
            busy = true
            cancelRequested = false
            try {
                val outPath = File(reactContext.cacheDir, "scene_${System.currentTimeMillis()}.png").absolutePath
                val uri = nativeGenerate(
                    ctxPtr,
                    params.getString("prompt") ?: "",
                    if (params.hasKey("negativePrompt")) params.getString("negativePrompt") ?: "" else "",
                    params.getInt("width"), params.getInt("height"),
                    params.getInt("steps"), params.getDouble("cfgScale").toFloat(),
                    params.getString("sampler") ?: "euler_a",
                    if (params.hasKey("seed")) params.getDouble("seed").toLong() else -1L,
                    outPath
                )
                if (cancelRequested) { promise.reject("CANCELLED", "cancelled by user"); return@execute }
                if (uri == null) { promise.reject(classify(nativeLastError(), "ENGINE_FAULT"), nativeLastError()); return@execute }
                val res = Arguments.createMap().apply {
                    putString("uri", "file://$uri")
                    putDouble("seed", params.getDouble("seed"))
                    putInt("width", params.getInt("width"))
                    putInt("height", params.getInt("height"))
                }
                promise.resolve(res)
            } catch (t: Throwable) {
                promise.reject(classify(t.message ?: "", "ENGINE_FAULT"), t.message, t)
            } finally {
                busy = false
            }
        }
    }

    @ReactMethod
    fun cancel(promise: Promise) {
        cancelRequested = true
        if (ctxPtr != 0L) try { nativeCancel(ctxPtr) } catch (_: Throwable) {}
        promise.resolve(null)
    }

    @ReactMethod
    fun unloadModel(promise: Promise) {
        worker.execute {
            try {
                if (ctxPtr != 0L) { nativeFree(ctxPtr); ctxPtr = 0L }   // R5 free RAM
                promise.resolve(null)
            } catch (t: Throwable) {
                promise.reject("ENGINE_FAULT", t.message, t)
            }
        }
    }

    @ReactMethod
    fun isLoaded(promise: Promise) = promise.resolve(ctxPtr != 0L)

    // Required for NativeEventEmitter (progress events).
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    private fun emitProgress(p: Double) {
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("sd_progress", Arguments.createMap().apply { putDouble("progress", p) })
    }

    /** Map a raw native error string onto one of our typed codes (R8). */
    private fun classify(raw: String, fallback: String): String {
        val s = raw.lowercase()
        return when {
            s.contains("cancel") -> "CANCELLED"
            s.contains("oom") || s.contains("out of memory") || s.contains("alloc") -> "OUT_OF_MEMORY"
            s.contains("not found") || s.contains("no such file") || s.contains("enoent") -> "MODEL_MISSING"
            s.contains("corrupt") || s.contains("magic") || s.contains("checksum") -> "MODEL_CORRUPT"
            s.contains("version") || s.contains("unsupported") -> "MODEL_UNSUPPORTED"
            s.contains("qnn") || s.contains("npu") || s.contains("backend") -> "BACKEND_UNAVAILABLE"
            else -> fallback
        }
    }

    // Capability envelope reported to JS. Conservative caps for on-device SD-1.5; the
    // JS validation layer enforces these before any future generate() call (R8).
    private fun capabilities(backend: String): WritableMap = Arguments.createMap().apply {
        putInt("minDim", 256); putInt("maxDim", 768); putInt("dimMultiple", 64)
        putInt("minSteps", 1); putInt("maxSteps", 50)
        putDouble("minCfg", 1.0); putDouble("maxCfg", 20.0)
        putInt("maxPromptChars", 1500)
        putArray("samplers", Arguments.createArray().apply {
            pushString("euler_a"); pushString("euler"); pushString("dpmpp_2m"); pushString("lcm")
        })
        putString("backend", backend)
    }
}
