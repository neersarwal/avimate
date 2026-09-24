# [Plugin name TBD] — a modern, Fluent-styled EFB for X-Plane 12

*(codename `xEFB` internally, previously also called "Pane" — folder and
file names, the JS bridge global `window.__xefb`, and the final product
name are still being decided; see the note at the bottom.)*

## What this is

This is an **Electronic Flight Bag (EFB)** plugin for **X-Plane 12** (and
X-Plane 11.50+) — an in-sim tablet, in the spirit of AviTab, but with its
whole interface built as a real web app instead of an immediate-mode C++
widget toolkit. That means the UI can use a proper design system (Fluent UI)
and modern web tooling, rather than hand-rolled ImGui-style controls.

Concretely, once installed it adds a resizable window (and eventually a 3D
cockpit tablet) inside X-Plane that shows:

- A **moving map** with your route, aircraft position and track
- A **SimBrief OFP** view — route, overview, weather — fetched live from
  your SimBrief flight plan
- A **Navigraph Charts / SimBrief Dispatch / VATSIM map** browser, opened
  in an in-sim web view
- Live sim data (position, heading, groundspeed, fuel, weather/METAR) fed
  into the UI in real time

It's meant to be a drop-in AviTab-style plugin, but modern, maintainable,
and easy to extend with new screens since it's just a web app under the
hood. This is the first plugin in a planned small lineup of X-Plane 12
tools — the eventual studio/dev-team name it'll ship under hasn't been
decided yet either.

## How it fits together

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

## What's real vs. still to do

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
- The **entire `resources/ui` web app** (converted from design 1a), plus a
  working **canvas moving map** (route + own-ship + track, dark raster basemap),
  **SimBrief OFP** fetch/parse driving the route table / overview / weather, and
  **empty states** on every data screen — all verified in a browser.

**Still to do** (labelled placeholders, not fake data):

- The **3D cockpit tablet mesh**. 3D draw-phase callbacks don't fire under
  Vulkan/Metal, so the texture has to reach the mesh another way (replace the
  OBJ8 material texture, or a cockpit-device screen). The 2D window works now.
- `NavigraphClient` — OAuth device flow + charts API + SimBrief-id lookup.
  Interface + full guide in `docs/navigraph-integration.md`; needs a
  `client_id`.
- `window.__xefb.invoke` actions `uplinkRouteToFms`, `callTug`, weather inject
  (`XPLMSetWeatherAtLocation`), etc. — currently logged only.
- In-app chart PDF viewer, weather radar, CG envelope, Perf numbers from the OFP.

## X-Plane version support

Built to load on **X-Plane 11.50+ and X-Plane 12 from one binary**:

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

## To make this build

You need the two SDKs (both license-gated downloads):
- **X-Plane SDK 4.x**: https://developer.x-plane.com/sdk/plugin-sdk-downloads/
  — one download; the `XPLMxxx` levels are compile defines, not separate SDKs.
- **Ultralight SDK 1.4.x**: https://ultralig.ht/

```sh
cmake -G Ninja -B build -DCMAKE_BUILD_TYPE=Release \
    -DXPSDK_DIR="/path/to/XPSDK4.3.0" \
    -DULTRALIGHT_DIR="/path/to/Ultralight SDK"
cmake --build build
```

`XPSDK_DIR` can point at the download root or its inner `SDK/` folder — CMake
figures it out. The build stages a drop-in plugin folder at `build/xEFB/`:

```
xEFB/
├── win_x64/   xEFB.xpl + Ultralight*.dll / AppCore.dll
└── resources/ the web app + Ultralight's cacert.pem / icudt*.dat
```

Copy that `xEFB/` folder into `X-Plane 12/Resources/plugins/` (or the XP11
equivalent). Open it from the **Plugins → xEFB → Show / hide EFB** menu.

A pre-built copy of this folder is committed at `build/xEFB/` in this repo
for convenience — you can copy that directly into X-Plane without building
from source, as long as it's reasonably up to date with the code.

## Suggested next steps

1. Wire the `nativeInvoke` actions in `PluginMain`'s invoke handler to real
   plugin behaviour (FMS uplink, pushback, Simbrief fetch, weather inject).
2. Solve the 3D tablet-mesh texture path (see `TabletSurface.cpp`).
3. Build out the placeholder screens (moving map, charts, radar) against real
   data — one page/route in `resources/ui` at a time.
4. Optionally vendor a component library locally under `resources/ui/vendor/`
   — no CDN access mid-flight.
5. Settle on the final plugin/studio name and do the rename pass across
   folders, filenames, the plugin signature, and the JS bridge global.

## Licensing note

AviTab is GPLv3. If you fork/reuse its dataref or chart-parsing code
directly, this project inherits GPLv3 obligations. Writing the EFB logic
fresh (as this scaffold does) keeps it free to choose its own license later,
at the cost of reimplementing things like PDF chart rendering and navdata
parsing that AviTab already solved.

This repo is currently private and closed-source while the project
stabilizes toward a v1. A formal license (and the studio/publisher name)
will be added once that's decided.

## About the name

The product name isn't finalized yet (candidates include Avimate, Wingman,
FirstOfficer, TacCom, and the earlier working name "Pane"). Until it's
settled, the plugin folder, `.xpl` filename, menu item, and JS bridge
global (`window.__xefb`) are all still using the original `xEFB` codename
on purpose. Don't rename those on your own; see `docs/` or ask before
changing anything outside this README.
