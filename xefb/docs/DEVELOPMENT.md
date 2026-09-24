# Building Avimate from source

This is for contributors building the plugin themselves. If you just want
to install and use Avimate, see the main [README](../README.md) instead —
download a build from the [Releases page](../../../releases).

## Prerequisites

You need the two SDKs (both license-gated downloads):

- **X-Plane SDK 4.x**: https://developer.x-plane.com/sdk/plugin-sdk-downloads/
  — one download; the `XPLMxxx` levels are compile defines, not separate SDKs.
- **Ultralight SDK 1.4.x**: https://ultralig.ht/

Neither SDK is vendored in this repo (see the root `.gitignore`) — download
them yourself and point CMake at their paths.

## Build

```sh
cmake -G Ninja -B build -DCMAKE_BUILD_TYPE=Release \
    -DXPSDK_DIR="/path/to/XPSDK4.3.0" \
    -DULTRALIGHT_DIR="/path/to/Ultralight SDK"
cmake --build build
```

`XPSDK_DIR` can point at the download root or its inner `SDK/` folder — CMake
figures it out.

The build stages a drop-in plugin folder at `build/xEFB/`:

```
xEFB/
├── win_x64/   xEFB.xpl + Ultralight*.dll / AppCore.dll
└── resources/ the web app + Ultralight's cacert.pem / icudt*.dat
```

## Installing your own build

Copy that `xEFB/` folder into `X-Plane 12/Resources/plugins/` (or the XP11
equivalent). Open it from the **Plugins → xEFB → Show / hide EFB** menu.

## Platform notes

Runs on **X-Plane 11.50+ and X-Plane 12 from one binary**:

- The whole codebase compiles against the **XPLM303** feature level (the
  highest XP11 ever reached). The compiler will stop you using an XP12-only
  API in a shared code path.
- The one exception is `src/bridge/WeatherBridge.cpp`, which alone is
  compiled with `XPLM400/410/420` (CMake option `XEFB_ENABLE_XP12_APIS`, on
  by default) so it can `#include <XPLMWeather.h>`. Even there, every XP12
  entry point is resolved at runtime with `XPLMFindSymbol` and falls back to
  `sim/weather/*` datarefs — so the plugin never hard-crashes on XP11 or an
  early XP12 point release.
- `DatarefBridge::simMajor()` (from `XPLMGetVersions()`) picks XP11 vs XP12
  dataref names, weather especially.
- Set `-DXEFB_ENABLE_XP12_APIS=OFF` for a pure XP11 build with no weather
  adapter.

## Architecture

```
XPluginStart
   └─ UltralightHost   (offscreen web view, renders index.html each frame)
   └─ TabletSurface     (GL texture; blits Ultralight's bitmap, draws it
                          onto the cockpit's 3D tablet mesh / a 2D window)
   └─ DatarefBridge     (reads XPLM datarefs, pushes SimState into JS)
```

Every frame: `DatarefBridge::snapshot()` → `UltralightHost::postStateUpdate()`
(JS call into the page) → page re-renders itself → `renderFrame()` rasterizes
it → `TabletSurface::uploadFromHost()` copies pixels into the GL texture →
`drawToTablet()` paints that texture in the cockpit.

## Implementation status

**Implemented and building** against the real X-Plane SDK 4.3.0 + Ultralight
1.4.0:

- `UltralightHost` — CPU-raster Renderer + View, loads `file:///ui/index.html`,
  reads back the BGRA bitmap; JS bridge both ways
  (`window.__xefb.onSimState(json)` in, `window.__xefb.invoke(action, payload)`
  out via a JSCallback bound on `OnDOMReady`).
- `TabletSurface` — real GL texture (`XPLMGenerateTextureNumbers` +
  `glTexSubImage2D`, `GL_BGRA`), draws the quad, maps window clicks back to
  view coordinates.
- `PluginMain` — runs the EFB as a resizable 2D floating window
  (`XPLMCreateWindowEx`, works on GL/Vulkan/Metal), mouse + drag + hover wired
  to Ultralight, a Plugins-menu show/hide item, render capped to 30 Hz and the
  sim-state push to 10 Hz.
- `DatarefBridge` — real dataref reads (position, heading, groundspeed, fuel),
  XP11/XP12 weather-dataref fallback, `XPLMGetVersions` sim-version detect.
- `WeatherBridge` — real `XPLMGetMETARForAirport` / `XPLMGetWeatherAtLocation`,
  resolved via `XPLMFindSymbol` (loads fine on XP11), used for wind/OAT.
- `BrowserWindow` — a second movable/resizable X-Plane window hosting a full
  Ultralight web view for arbitrary URLs. The "Browser" screen opens
  Navigraph Charts / SimBrief Dispatch / the VATSIM map in it
  (`invoke('openBrowser', {url})`), with back/forward/reload + keyboard.
- `HttpClient` — async HTTPS (WinHTTP) on a worker thread, results delivered on
  the main thread from the flight loop. Wired to `fetchOfp` → SimBrief → the UI.
- The **entire `resources/ui` web app**, plus a working **canvas moving map**
  (route + own-ship + track, dark raster basemap), **SimBrief OFP** fetch/parse
  driving the route table / overview / weather, and **empty states** on every
  data screen — all verified in a browser.

**Still to do** (labelled placeholders, not fake data):

- The **3D cockpit tablet mesh**. 3D draw-phase callbacks don't fire under
  Vulkan/Metal, so the texture has to reach the mesh another way (replace the
  OBJ8 material texture, or a cockpit-device screen). The 2D window works now.
- `NavigraphClient` — OAuth device flow + charts API + SimBrief-id lookup.
  Interface + full guide in `navigraph-integration.md`; needs a `client_id`.
- `window.__xefb.invoke` actions `uplinkRouteToFms`, `callTug`, weather inject
  (`XPLMSetWeatherAtLocation`), etc. — currently logged only.
- In-app chart PDF viewer, weather radar, CG envelope, Perf numbers from the OFP.

## Licensing note

AviTab is GPLv3. If you fork/reuse its dataref or chart-parsing code
directly, this project inherits GPLv3 obligations. Writing the EFB logic
fresh (as this scaffold does) keeps it free to choose its own license later.
