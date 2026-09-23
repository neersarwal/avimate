cmake_minimum_required(VERSION 3.20)
project(xEFB CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---------------------------------------------------------------------------
# External SDKs — NOT in this repo. Point CMake at the extracted folders:
#   XPSDK_DIR      -> .../XPSDK4.3.0        (or .../XPSDK4.3.0/SDK)
#   ULTRALIGHT_DIR -> ".../Ultralight SDK"
#
# Example (from the parent of this repo, where both SDKs were unpacked):
#   cmake -B build -DCMAKE_BUILD_TYPE=Release \
#       -DXPSDK_DIR="../XPSDK4.3.0" \
#       -DULTRALIGHT_DIR="../Ultralight SDK"
# ---------------------------------------------------------------------------
set(XPSDK_DIR "" CACHE PATH "Path to extracted X-Plane SDK")
set(ULTRALIGHT_DIR "" CACHE PATH "Path to extracted Ultralight SDK")

if(NOT XPSDK_DIR)
    message(FATAL_ERROR "Set -DXPSDK_DIR=/path/to/XPSDK4.3.0")
endif()
if(NOT ULTRALIGHT_DIR)
    message(FATAL_ERROR "Set -DULTRALIGHT_DIR=\"/path/to/Ultralight SDK\"")
endif()

# The 4.3.0 download nests everything under an "SDK" folder.
if(EXISTS "${XPSDK_DIR}/SDK/CHeaders")
    set(XPSDK_ROOT "${XPSDK_DIR}/SDK")
else()
    set(XPSDK_ROOT "${XPSDK_DIR}")
endif()
if(NOT EXISTS "${XPSDK_ROOT}/CHeaders/XPLM")
    message(FATAL_ERROR "Can't find CHeaders/XPLM under ${XPSDK_ROOT}")
endif()

# xEFB loads on X-Plane 11.50+ AND X-Plane 12 from one binary:
#   * The whole codebase compiles at the XPLM303 baseline (XP11's ceiling) so
#     the compiler blocks XP12-only APIs in shared paths.
#   * Only src/bridge/WeatherBridge.cpp gets XPLM400+ (to #include XPLMWeather.h);
#     even there every XP12 call is resolved at runtime via XPLMFindSymbol.
# Turn OFF for a pure XP11 build (drops the XP12 weather adapter).
option(XEFB_ENABLE_XP12_APIS "Build the runtime-gated XP12 weather adapter" ON)

find_package(OpenGL REQUIRED)

add_library(xefb_plugin SHARED
    src/plugin/PluginMain.cpp
    src/render/TabletSurface.cpp
    src/render/UltralightHost.cpp
    src/render/BrowserWindow.cpp
    src/bridge/DatarefBridge.cpp
    src/bridge/WeatherBridge.cpp
    src/bridge/GroundBridge.cpp
    src/net/HttpClient.cpp
)

target_include_directories(xefb_plugin PRIVATE
    ${XPSDK_ROOT}/CHeaders/XPLM
    ${XPSDK_ROOT}/CHeaders/Widgets
    "${ULTRALIGHT_DIR}/include"
    src
)

target_link_libraries(xefb_plugin PRIVATE
    OpenGL::GL
    "${ULTRALIGHT_DIR}/lib/Ultralight${CMAKE_STATIC_LIBRARY_SUFFIX}"
    "${ULTRALIGHT_DIR}/lib/UltralightCore${CMAKE_STATIC_LIBRARY_SUFFIX}"
    "${ULTRALIGHT_DIR}/lib/WebCore${CMAKE_STATIC_LIBRARY_SUFFIX}"
    "${ULTRALIGHT_DIR}/lib/AppCore${CMAKE_STATIC_LIBRARY_SUFFIX}"
)

# --- platform: XPLM link + plugin naming ---
if(WIN32)
    target_compile_definitions(xefb_plugin PRIVATE IBM=1)
    target_link_libraries(xefb_plugin PRIVATE "${XPSDK_ROOT}/Libraries/Win/XPLM_64.lib")
    set(XEFB_PLATFORM_DIR "win_x64")
elseif(APPLE)
    target_compile_definitions(xefb_plugin PRIVATE APL=1)
    target_link_libraries(xefb_plugin PRIVATE
        "-F${XPSDK_ROOT}/Libraries/Mac" "-framework XPLM")
    set_target_properties(xefb_plugin PROPERTIES
        LINK_FLAGS "-undefined dynamic_lookup")
    set(XEFB_PLATFORM_DIR "mac_x64")
else()
    target_compile_definitions(xefb_plugin PRIVATE LIN=1)
    set_target_properties(xefb_plugin PROPERTIES LINK_FLAGS "-undefined")
    set(XEFB_PLATFORM_DIR "lin_x64")
endif()

# Baseline feature level: XPLM303 == X-Plane 11.20 .. 11.51 (forward-compatible
# with XP12). The SDK headers gate declarations on each level individually.
target_compile_definitions(xefb_plugin PRIVATE
    XPLM200 XPLM210 XPLM300 XPLM301 XPLM303)

# WeatherBridge.cpp is the ONLY translation unit that sees the XP12 SDK.
if(XEFB_ENABLE_XP12_APIS)
    set_source_files_properties(src/bridge/WeatherBridge.cpp PROPERTIES
        COMPILE_DEFINITIONS "XPLM400;XPLM401;XPLM410;XPLM411;XPLM420;XEFB_XP12_APIS=1")
endif()

set_target_properties(xefb_plugin PROPERTIES
    PREFIX ""
    OUTPUT_NAME "xEFB"
    SUFFIX ".xpl"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/xEFB/${XEFB_PLATFORM_DIR}"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/xEFB/${XEFB_PLATFORM_DIR}"
)

# --- assemble a drop-in plugin folder: build/xEFB/ ---
#   xEFB/<platform>/xEFB.xpl
#   xEFB/<platform>/*.dll         (Ultralight runtime, Windows)
#   xEFB/resources/               (the EFB web app + Ultralight's cacert/icu)
set(XEFB_STAGE "${CMAKE_BINARY_DIR}/xEFB")

add_custom_command(TARGET xefb_plugin POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CMAKE_SOURCE_DIR}/resources" "${XEFB_STAGE}/resources"
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${ULTRALIGHT_DIR}/resources" "${XEFB_STAGE}/resources"
    COMMENT "Staging resources/ into ${XEFB_STAGE}")

if(WIN32)
    add_custom_command(TARGET xefb_plugin POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${ULTRALIGHT_DIR}/bin" "${XEFB_STAGE}/${XEFB_PLATFORM_DIR}"
        COMMENT "Copying Ultralight DLLs next to xEFB.xpl")
endif()

message(STATUS "xEFB: XPSDK_ROOT=${XPSDK_ROOT}")
message(STATUS "xEFB: staged plugin -> ${XEFB_STAGE} (copy into X-Plane/Resources/plugins/)")
