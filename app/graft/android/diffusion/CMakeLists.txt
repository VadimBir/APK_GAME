# Builds libsd_bridge.so: our JNI shim + stable-diffusion.cpp (ADR-004).
# Included from the app module. stable-diffusion.cpp is added as a subproject; pin it to a
# tagged commit for reproducibility (the project warns its API changes frequently).
cmake_minimum_required(VERSION 3.22.1)
project(sd_bridge)

set(CMAKE_CXX_STANDARD 17)

# stable-diffusion.cpp is vendored under third_party/ (added by scripts/fetch-sdcpp.sh)
# or pulled via FetchContent. CPU-only baseline: no Vulkan (broken on Adreno/Mali),
# OpenCL is opt-in for Adreno only.
set(SD_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/third_party/stable-diffusion.cpp sdcpp_build)

add_library(sd_bridge SHARED sd_bridge.cpp)
target_include_directories(sd_bridge PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/stable-diffusion.cpp)
target_link_libraries(sd_bridge stable-diffusion android log)
