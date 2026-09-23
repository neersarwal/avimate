# Scaffold manifest — Project xEFB (a.k.a. Pane)

Read `CLAUDE_CODE_HANDOFF.md` first — this file is just a map of what's in
the folder and how to treat each piece.

## Folder layout

```
xefb/
├── CLAUDE_CODE_HANDOFF.md      ← read this first
├── SCAFFOLD_MANIFEST.md        ← this file
├── README.md                   ← build instructions, dependency setup
├── CMakeLists.txt              ← build config (needs XPSDK_DIR / ULTRALIGHT_DIR set)
├── src/
│   ├── plugin/
│   │   └── PluginMain.cpp      ← XPluginStart/Stop, draw + flight-loop callbacks
│   ├── render/
│   │   ├── TabletSurface.h/.cpp    ← GL texture blitter for a 2D window
│   │   ├── UltralightHost.h/.cpp   ← offscreen web view + JS bridge (EFB page)
│   │   └── BrowserWindow.h/.cpp    ← 2nd Ultralight window for Navigraph/SimBrief/VATSIM
│   ├── bridge/
│   │   ├── DatarefBridge.h/.cpp    ← XPLM dataref reads → SimState; sim-version detect
│   │   └── WeatherBridge.h/.cpp    ← XP12 weather API (XPLMFindSymbol-gated) + dataref fallback
│   └── net/
│       ├── HttpClient.h/.cpp       ← async HTTPS (WinHTTP), main-thread callbacks
│       └── NavigraphClient.h       ← OAuth device-flow interface (scaffold — see docs/)
├── docs/
│   └── navigraph-integration.md ← Navigraph OAuth + SimBrief link: full guide
├── resources/
│   └── ui/                     ← the EFB web app (converted from design 1a) — see its README
│       ├── index.html app.css app.js
│       ├── map.js              ← canvas moving map (window.EfbMap)
│       ├── ofp.js              ← SimBrief OFP fetch + parse (window.EfbOfp)
│       ├── mock-states.json    ← named onSimState payloads for browser testing
│       └── README.md
└── design-doc/
    ├── xEFB Mockups.dc.html    ← Claude Design canvas export (source of truth for UI)
    ├── support.js              ← Design's runtime (canvas interactivity only)
    └── image-slot.js           ← Design's image-slot handling (canvas only)
```

## Import directly into Claude Code as-is (safe, no conversion needed)
- `CMakeLists.txt` — real build config, just needs SDK paths supplied.
  Targets the XPLM303 baseline (XP11.50+ and XP12 from one binary);
  `WeatherBridge.cpp` alone gets the XPLM400+ defines.
- `src/plugin/PluginMain.cpp`
- `src/render/TabletSurface.h` / `.cpp`
- `src/render/UltralightHost.h` / `.cpp`
- `src/bridge/DatarefBridge.h` / `.cpp`
- `src/bridge/WeatherBridge.h` / `.cpp`
- `README.md`, `CLAUDE_CODE_HANDOFF.md`

These are real C++/CMake — the SDK calls inside are commented pseudocode,
but the surrounding structure, includes, and function signatures are meant
to be built on directly, not thrown away.

## Do NOT import as-is — needs conversion first
- **`design-doc/xEFB Mockups.dc.html`** — this is a Claude Design canvas
  file, not a web page. It contains real CSS/markup worth reusing, but also
  Design-runtime-only syntax (`sc-if value="{{ }}"`, `onClick="{{ }}"`) that
  will not execute outside Design. **This is source material to extract
  from, not a file to drop into `resources/ui/` unmodified.** See the
  conversion task in `CLAUDE_CODE_HANDOFF.md`.
- **`design-doc/support.js`** — Design's own canvas runtime. Not part of the
  plugin's web view. Do not include it in the built UI bundle.
- **`design-doc/image-slot.js`** — same as above; Design-tool tooling only,
  not app code. The image-slot placeholders it manages (wallpaper, Navigraph
  icon) should be replaced with real static image assets during conversion.

## Done — the 1a conversion
`resources/ui/` is now the converted web app (`index.html` + `app.css` +
`app.js`, all 12 screens, verified in Chrome). The old placeholder
`index.html` is gone. See `resources/ui/README.md` for how the Design-only
syntax was rewritten and what's still a labelled placeholder.

## Quick reference: what's locked in vs. still open
- **Locked in:** design variant 1a (lock → home → xEFB/Navigraph/Browser/
  Settings, frosted glass). Variants 1b and 1c in the design doc are
  discarded alternatives — don't build from them.
- **Still open:** the xEFB → Pane naming pass (see bottom of
  `CLAUDE_CODE_HANDOFF.md`), the real map implementation, Navigraph/Browser
  network-tile embedding, and filling in the stubbed SDK calls once the
  real X-Plane SDK and Ultralight SDK are downloaded locally.
