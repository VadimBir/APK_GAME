# Builds libsd_bridge.so: our JNI shim + stable-diffusion.cpp (ADR-004).
# Added via add_subdirectory() from the app's jni/CMakeLists.txt. stable-diffusion.cpp is
# vendored under third_party/ by scripts/fetch-sdcpp.sh. CPU-only baseline: no Vulkan
# (broken on Adreno/Mali), no OpenCL by default (Adreno-only). Examples/WebP/WebM off to
# keep the NDK compile lean.
cmake_minimum_required(VERSION 3.22.1)

set(CMAKE_CXX_STANDARD 17)

# Lean, CPU-only stable-diffusion.cpp build.
set(SD_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(SD_BUILD_EXAMPLES    OFF CACHE BOOL "" FORCE)
set(SD_WEBP              OFF CACHE BOOL "" FORCE)
set(SD_WEBM              OFF CACHE BOOL "" FORCE)
set(SD_VULKAN           OFF CACHE BOOL "" FORCE)
set(SD_OPENCL           OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP         OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE      OFF CACHE BOOL "" FORCE)

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/third_party/stable-diffusion.cpp sdcpp_build)

add_library(sd_bridge SHARED ${CMAKE_CURRENT_SOURCE_DIR}/sd_bridge.cpp)
target_include_directories(sd_bridge PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/stable-diffusion.cpp/include
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/stable-diffusion.cpp/thirdparty)
find_library(log-lib log)
target_link_libraries(sd_bridge stable-diffusion ${log-lib})
