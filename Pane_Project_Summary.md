# Pane — Project Summary

*Codename during early development: xEFB. A modern, Fluent-styled EFB
(Electronic Flight Bag) plugin for X-Plane 12, inspired by AviTab but with a
contemporary UI closer to MSFS's EFB.*

---

## 1. Concept

AviTab is the existing open-source EFB for X-Plane, but its UI toolkit is an
older immediate-mode C++ widget system — functional, but visually dated.
Pane's goal is the same core idea (a virtual tablet in the cockpit showing
charts, maps, weather, flight data) with a UI built using real modern design
tooling and rendering, closer to what Microsoft Flight Simulator's EFB looks
like.

## 2. Architecture decision

Rather than building a new immediate-mode UI toolkit, Pane embeds a real web
rendering engine (**Ultralight**) inside the X-Plane plugin and paints its
output onto a GL texture mapped onto the cockpit's 3D tablet object. This
means the actual interface is written in HTML/CSS/JS (optionally
React + a Fluent-style component library), not hand-rolled C++ widgets.

```
DatarefBridge (reads XPLM datarefs: position, fuel, heading, etc.)
   → UltralightHost (offscreen web view; pushes sim state into JS each frame)
      → resources/ui/*.html/js  (the actual EFB interface)
   → TabletSurface (GL texture; blits the web view's bitmap onto the 3D tablet mesh)
```

**Why this approach:** it swaps out AviTab's UI layer for something that can
achieve genuine Fluent-style design (animated transitions, blur/acrylic
materials, proper typography) without reimplementing an animation/easing
system in C++. The plugin core (SDK glue, dataref polling, texture pipeline)
stays close to how AviTab already solves that problem.

**Alternatives considered:** Flutter (embedded, `fluent_ui` package) and a
custom Skia/ImGui-based UI — both viable, but a web view was judged the
most practical starting point given the design-tool-driven workflow.

## 3. Scaffold delivered

A starter C++ project was built out, including:
- `CMakeLists.txt` — wires the X-Plane SDK and Ultralight SDK (both
  license-gated downloads, not bundled).
- `src/plugin/PluginMain.cpp` — plugin lifecycle (`XPluginStart/Stop`),
  draw callback, flight-loop callback.
- `src/render/TabletSurface.*` — GL texture target + draw-to-tablet logic.
- `src/render/UltralightHost.*` — offscreen web view wrapper.
- `src/bridge/DatarefBridge.*` — reads XPLM datarefs into a `SimState`
  struct, pushed into JS via `window.__xefb.onSimState(json)`.
- `resources/ui/index.html` — placeholder Fluent-styled page.
- `README.md` — build instructions and suggested build order (static
  texture → web view → dataref bridge → pointer input → port real EFB
  features).

The C++ compiles against real SDK headers, but the actual Ultralight/GL/XPLM
calls are stubbed as commented pseudocode pending the real SDKs.

## 4. Design process

- Explored **Penpot** as an open-source Figma alternative for mockups (free
  hosted cloud version, no self-hosting needed) before settling on using
  **Claude Design** instead, since it produces real HTML/CSS directly.
- Three design directions were mocked up:
  - **1a** — lock screen → home screen → app launcher (Pane / Navigraph /
    Browser / Settings), frosted glass, clickable through all 10 screens.
  - **1b** — tile launcher with top tabs, denser MSFS-style app grid.
  - **1c** — night/amber theme, map-forward, bottom bar (glare-friendly).
- **Decision: 1a is the locked-in final design.**
- Key insight from the 1a direction: making Navigraph and a general Browser
  first-class *tiles* (rather than custom-built features) offloads the
  hardest technical problem in the whole project — sectional chart
  rendering — onto an embedded real webpage instead of custom code, since
  Ultralight is a full browser engine and can point at live external sites
  when network access is available.

## 5. Key technical findings along the way

- **X-Plane 12 uses real weather** (live METARs + GFS data) internally, so
  the "Weather at a glance" dashboard cards likely don't need any external
  API — they can read directly from XP12's weather datarefs, the same way
  `DatarefBridge` already reads position/fuel.
- **The 2D map** doesn't need full sectional-chart fidelity — a VATSIM
  Radar-style flat map (MapLibre GL + a vendored/pre-baked vector tile set,
  since there's no guaranteed inflight internet) is realistic to build,
  versus true aeronautical chart rendering which was the far harder ask.
- **Licensing note:** AviTab is GPLv3 — reusing its code directly would
  inherit that license; writing Pane's logic fresh (as done here) keeps
  licensing flexible at the cost of reimplementing things like chart/navdata
  parsing.
- **No server required** for the plugin itself — everything runs locally
  inside the X-Plane process. A server only becomes relevant for optional
  online features (live chart services, ADS-B, etc.), and even then it's
  hitting existing third-party APIs, not self-hosting anything.

## 6. Current status / handoff

The Claude Design export (`xEFB Mockups.dc.html` + supporting JS) contains
the finalized 1a design as an interactive canvas doc — it uses
Design-tool-specific template bindings (`sc-if`, `onClick="{{ }}"`) that only
resolve inside Claude Design's own runtime, so it needs to be converted into
real static HTML/CSS/JS before it can live inside the Ultralight web view.

State flags identified in 1a (one per nav-rail destination): `showLock`,
`isHome`, `isRoute`, `isCharts`, `isMap`, `isWx`, `isPerf`, `isChecks`,
`isAc`, `isBrief`, plus waypoint-selection sub-states and staggered-reveal
animation flags.

A separate handoff brief (titled "Project xEFB" — the original working name)
carries full context for Claude Code to carry out the screen-by-screen
conversion.

## 7. Open / next steps

- [ ] Convert 1a's screens (home, route, charts, map, weather, perf,
      checklists, aircraft, briefing, lock) into real `resources/ui` files.
- [ ] Download and integrate the real X-Plane SDK and Ultralight SDK; fill
      in the stubbed GL/XPLM/Ultralight calls.
- [ ] Confirm `backdrop-filter` support in Ultralight's CPU rasterizer;
      fall back to a pre-blurred background layer if unsupported.
- [ ] Investigate XP12's weather datarefs (`sim/weather/*`) to back the
      weather dashboard without an external API.
- [ ] Decide map scope (which regions to vendor tiles for) and pick a
      basemap pipeline (e.g. OSM → `tippecanoe`/`planetiler`).
- [ ] Confirm Navigraph charts can be embedded via URL inside Ultralight,
      and design an offline-degradation path for when there's no inflight
      network access.
- [ ] Decide how far the xEFB → Pane rename should propagate (namespaces,
      plugin signature string, JS global `window.__xefb`, file/folder names)
      versus leaving internal code references as-is for now.
