// JNI bridge: StableDiffusionModule.kt  <->  stable-diffusion.cpp (ADR-004, R5, R8).
// Implements the `nativeXxx` methods declared in StableDiffusionModule.kt. Every failure
// path sets g_last_error (read back via nativeLastError) so the Kotlin/JS layers can map
// it to a typed code — NULL ctx and NULL image are never swallowed.
#include <jni.h>
#include <string>
#include <mutex>
#include <android/log.h>
#include "stable-diffusion.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"   // from stable-diffusion.cpp/thirdparty (added to include dirs)

#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "ArcaneSDjni", __VA_ARGS__)

static std::string g_last_error;
static std::mutex  g_mutex;          // serialize: sd.cpp context is not thread-safe

// Use the library's own name->enum mapper; fall back to euler_a if unrecognized.
static sample_method_t map_sampler(const std::string& s) {
    sample_method_t m = str_to_sample_method(s.c_str());
    if ((int)m < 0) return EULER_A_SAMPLE_METHOD;
    return m;
}

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_pocketpal_diffusion_StableDiffusionModule_nativeLoad(
        JNIEnv* env, jclass, jstring jpath, jint backend) {
    std::lock_guard<std::mutex> lk(g_mutex);
    g_last_error.clear();
    const char* path = env->GetStringUTFChars(jpath, nullptr);

    sd_ctx_params_t p; sd_ctx_params_init(&p);
    p.model_path        = path;
    p.diffusion_flash_attn = true;          // lower RAM (research: ~1.5GB Q4_0)
    // backend: 0=cpu (baseline). 1=qnn handled by a separate path (R7) — not here.

    sd_ctx_t* ctx = new_sd_ctx(&p);
    env->ReleaseStringUTFChars(jpath, path);
    if (ctx == nullptr) {
        // new_sd_ctx returns NULL on OOM / missing / corrupt / unsupported.
        if (g_last_error.empty()) g_last_error = "new_sd_ctx returned null (oom or unsupported model)";
        LOGE("%s", g_last_error.c_str());
        return 0;
    }
    return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT jstring JNICALL
Java_com_pocketpal_diffusion_StableDiffusionModule_nativeGenerate(
        JNIEnv* env, jclass, jlong ctxPtr, jstring jprompt, jstring jneg,
        jint width, jint height, jint steps, jfloat cfg, jstring jsampler,
        jlong seed, jstring joutPath) {
    std::lock_guard<std::mutex> lk(g_mutex);
    g_last_error.clear();
    auto* ctx = reinterpret_cast<sd_ctx_t*>(ctxPtr);
    if (ctx == nullptr) { g_last_error = "not loaded"; return nullptr; }

    const char* prompt  = env->GetStringUTFChars(jprompt, nullptr);
    const char* neg     = env->GetStringUTFChars(jneg, nullptr);
    const char* sampler = env->GetStringUTFChars(jsampler, nullptr);
    const char* outPath = env->GetStringUTFChars(joutPath, nullptr);

    sd_img_gen_params_t g; sd_img_gen_params_init(&g);
    g.prompt          = prompt;
    g.negative_prompt = neg;
    g.width           = width;
    g.height          = height;
    g.seed            = seed;
    g.batch_count     = 1;
    // sampler/steps/cfg live in the nested sample_params on this API version.
    sd_sample_params_init(&g.sample_params);
    g.sample_params.sample_steps      = steps;
    g.sample_params.guidance.txt_cfg  = cfg;
    g.sample_params.sample_method     = map_sampler(sampler);

    sd_image_t* img = generate_image(ctx, &g);

    std::string result;
    if (img == nullptr || img->data == nullptr) {
        if (g_last_error.empty()) g_last_error = "generate_image returned null (oom or invalid params)";
        LOGE("%s", g_last_error.c_str());
    } else {
        // write PNG to outPath (stb_image_write bundled with stable-diffusion.cpp)
        if (stbi_write_png(outPath, img->width, img->height, img->channel, img->data, 0)) {
            result = outPath;
        } else {
            g_last_error = "failed to write png";
        }
        free(img->data);
        free(img);
    }

    env->ReleaseStringUTFChars(jprompt, prompt);
    env->ReleaseStringUTFChars(jneg, neg);
    env->ReleaseStringUTFChars(jsampler, sampler);
    env->ReleaseStringUTFChars(joutPath, outPath);
    return result.empty() ? nullptr : env->NewStringUTF(result.c_str());
}

JNIEXPORT void JNICALL
Java_com_pocketpal_diffusion_StableDiffusionModule_nativeCancel(JNIEnv*, jclass, jlong) {
    // stable-diffusion.cpp lacks a hard mid-run abort; cancellation is enforced in Kotlin
    // by dropping the result. Hook a step callback here if the pinned version supports it.
}

JNIEXPORT void JNICALL
Java_com_pocketpal_diffusion_StableDiffusionModule_nativeFree(JNIEnv*, jclass, jlong ctxPtr) {
    std::lock_guard<std::mutex> lk(g_mutex);
    auto* ctx = reinterpret_cast<sd_ctx_t*>(ctxPtr);
    if (ctx) free_sd_ctx(ctx);   // deterministic RAM release (R5)
}

JNIEXPORT jstring JNICALL
Java_com_pocketpal_diffusion_StableDiffusionModule_nativeLastError(JNIEnv* env, jclass) {
    return env->NewStringUTF(g_last_error.c_str());
}

JNIEXPORT jboolean JNICALL
Java_com_pocketpal_diffusion_StableDiffusionModule_nativeBackendAvailable(JNIEnv*, jclass, jint backend) {
    // CPU (0) always available. QNN (1) requires the Qualcomm runtime + Hexagon NPU (R7);
    // the dedicated QNN backend reports its own availability — default false here.
    return backend == 0 ? JNI_TRUE : JNI_FALSE;
}

} // extern "C"
