# Project xEFB — Claude Code handoff brief

> Note: the project has since been renamed **Pane** for external/product
> purposes. This brief intentionally keeps the "xEFB" working name because
> that's what the current codebase, file paths, and JS globals
> (`window.__xefb`) still use — treat "xEFB" and "Pane" as the same project
> until a rename pass is done (see the open task at the bottom).

## What this project is
A from-scratch, AviTab-inspired EFB plugin for X-Plane 12. Native plugin core
(C++, X-Plane SDK) renders an embedded Ultralight web view into a GL texture
mapped onto the cockpit's 3D tablet object. The actual UI is a normal HTML/
CSS/JS app living under `resources/ui/`.

Architecture recap:
```
DatarefBridge (reads XPLM datarefs)
   → UltralightHost (offscreen web view, calls window.__xefb.onSimState(json) each frame)
      → resources/ui/*.html/js (the actual EFB interface, re-renders from that data)
   → TabletSurface (GL texture; blits Ultralight's bitmap onto the 3D tablet mesh)
```
Files: `CMakeLists.txt`, `src/plugin/PluginMain.cpp`, `src/render/TabletSurface.*`,
`src/render/UltralightHost.*`, `src/bridge/DatarefBridge.*`, `resources/ui/index.html`.
The C++ compiles against real SDK headers but the actual Ultralight/GL/XPLM
calls are currently commented pseudocode — filling those in against the real
SDKs (X-Plane SDK + Ultralight SDK, both license-gated downloads, not
included here) is one of the open tasks.

## What's attached alongside this brief
- The current project scaffold (this repo).
- A Claude Design export folder (`design-doc/`: `xEFB Mockups.dc.html` +
  `support.js` + `image-slot.js`) containing the UI mockups. **Variant 1a is
  the locked-in final design** — ignore 1b (tile launcher) and 1c (night
  amber) variants, they were exploratory alternatives.

## What 1a actually contains
It's an interactive Claude Design "canvas" doc, not plain static HTML — it
uses `sc-if value="{{ stateVar }}"` conditional blocks and
`onClick="{{ handlerName }}"` bindings that only resolve live inside Claude
Design's own runtime (`support.js`). It will NOT render correctly if opened
as a plain file — that JS harness isn't present outside Design.

Confirmed state flags driving 1a's screens (grep for `sc-if value="{{ ... }}"`
in the `.dc.html` to re-derive if the file changes): `showLock` (lock
screen), `isHome`, `isRoute`, `isCharts`, `isMap`, `isWx`, `isPerf`,
`isChecks`, `isAc`, `isBrief` — one flag per nav-rail destination — plus
waypoint-selection sub-states (`wpSel1`-`wpSel5`, `wpArt`) and some
staggered-reveal animation flags (`l1`-`l4`, `s1`-`s3` + their `*off` pairs).

## The task
Extract each state's markup out of the `.dc.html` and convert it into real,
standalone front-end code under `resources/ui/`:

1. Parse `xEFB Mockups.dc.html`, locate the `id="1a"` option block (bounded
   by the next `dv-opt` sibling, `id="1b"`).
2. For each state flag above, extract the markup gated by its `sc-if` block.
3. Rewrite it as real HTML/CSS/JS:
   - `sc-if value="{{ isX }}"` → a real DOM element toggled by JS
     (`element.hidden = !state.isX`, or a small router/view-swap function).
   - `onClick="{{ goHome }}"` etc. → real event listeners calling actual JS
     functions that flip state and re-render, replacing Design's
     template-binding names with concrete function names.
   - Preserve the visual CSS as-is (colors, spacing, the frosted-glass /
     `backdrop-filter` look, the animation keyframes already in the file) —
     only the interactivity layer needs rewriting, not the design.
4. Wire the dashboard's live stat placeholders (fuel, altitude, heading,
   etc.) to listen for `window.__xefb.onSimState(json)`, matching the
   contract already stubbed in `UltralightHost::postStateUpdate` and the
   existing placeholder `resources/ui/index.html`.
5. Structure output as either (a) one `index.html` with all screens as
   hidden/shown sections plus a shared `app.js`, or (b) a light client-side
   router — pick whichever keeps the nav-rail click-through simplest, since
   there's no need for real page navigation/URLs in an embedded web view.
6. Flag anything that depends on features not yet built (live map, Navigraph
   embed, weather radar) with a clear placeholder rather than faking data.

## Known constraints to respect
- No CDN/network access assumed for the core dashboard — Ultralight has no
  guaranteed internet mid-flight. Only the optional Navigraph/Browser tiles
  are expected to hit the network.
- `backdrop-filter` support in Ultralight's CPU rasterizer is unconfirmed —
  if it doesn't render correctly, fall back to a pre-blurred background
  image layer rather than relying on live CSS blur.
- Keep click targets finger-sized (the design brief specifies this) since
  this is a touch-driven cockpit tablet, not a desktop app.

## Open task: xEFB → Pane rename
The project name changed from xEFB to Pane after this codebase and design
doc were created. Nothing has been renamed yet. If/when asked to do a rename
pass, it touches: the plugin signature string in `PluginMain.cpp`
(`com.example.xefb`), the JS global `window.__xefb`, the `xefb_plugin` CMake
target name, and any folder/file names carrying "xefb". Don't do this
silently as part of the UI conversion task above — treat it as a separate,
explicit step.
