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

## Status

Working and verified against the real X-Plane SDK 4.3.0 + Ultralight 1.4.0:
the plugin window, sim-data bridge, weather, moving map, SimBrief OFP fetch,
and the in-sim browser for Navigraph/SimBrief/VATSIM.

Not yet done: the 3D cockpit tablet mesh (currently a 2D window only),
Navigraph OAuth/charts integration, a few `invoke` actions that are logged
but not yet wired to real sim behaviour, and the chart/weather-radar/CG
screens. See `docs/` for the detailed breakdown.

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

Runs on X-Plane 11.50+ and X-Plane 12 from one binary; XP12-only weather
APIs are resolved at runtime and fall back cleanly on XP11.

## Suggested next steps

1. Wire the remaining `invoke` actions (FMS uplink, pushback, Simbrief fetch,
   weather inject) to real plugin behaviour.
2. Solve the 3D tablet-mesh texture path.
3. Build out the placeholder screens (charts, radar) against real data.
4. Settle on the final plugin/studio name and do the rename pass across
   folders, filenames, the plugin signature, and the JS bridge global.

## Licensing note

AviTab is GPLv3. If you fork/reuse its dataref or chart-parsing code
directly, this project inherits GPLv3 obligations. Writing the EFB logic
fresh (as this scaffold does) keeps it free to choose its own license later.

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
