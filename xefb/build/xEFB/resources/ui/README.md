# resources/ui — the EFB web app

Converted from design variant **1a** in `design-doc/xEFB Mockups.dc.html`.
This is the page Ultralight loads (`file:///ui/index.html`, see
`UltralightHost` / `PluginMain.cpp`).

## Files

| File | Purpose |
|------|---------|
| `index.html` | All 12 screens in one page + the lock overlay + in-app header. No router — screens are `<section data-screen>` toggled by `[hidden]`. |
| `app.css` | Design tokens, the 10 keyframes copied verbatim from the design, shared component classes, the scale-to-fit wrapper, empty-state + map styles, the `no-backdrop` fallback. |
| `app.js` | Port of the state machine from the design doc's `<script type="text/x-dc">`. Owns nav/lock/toggles, clock + idle auto-lock, the scaler, sim-state ingest, OFP wiring, empty-state logic, and the `window.__xefb` bridge. |
| `map.js` | Self-contained canvas moving map — route, own-ship, track, range rings, graticule, optional dark-filtered raster basemap (tile + canvas share one projection, no offset). `window.EfbMap`. |
| `ofp.js` | SimBrief OFP fetch + parse to a normalized plan (route, weights, fuel, weather, full text OFP). `window.EfbOfp`. |
| `checklists.js` | Authored normal checklists — **Zibo 737-800** (8 phases, real FCOM items) + a generic fallback. `window.EfbChecklists`. |
| `browser-home.html` | Offline start page for the Browser tab (aviation bookmark tiles + search). New tabs open here. |
| `mock-states.json` | Named `onSimState` payloads for manual browser testing. |

Everything is data-driven from one `State` object + `render()`. Every screen
re-renders on `onSimState` / `onOfp`; the metric/imperial toggle is a display
transform applied at render (`fmtWeightKg` / `fmtDistNm` / `fmtAltFt`), not a
separate data path. Local time is derived from the aircraft/origin longitude,
not the host machine's timezone.

No build step, no dependencies. Only the moving-map basemap and the SimBrief
fetch touch the network, and both degrade cleanly offline. Fonts: system stack.

## Testing in a plain browser (no plugin, no X-Plane)

```sh
cd resources/ui && python -m http.server 8777    # then open http://localhost:8777
```

The plugin normally drives the UI via `window.__xefb.onSimState(json)`. To do
that by hand from the devtools console:

```js
window.EfbDev.unlock();                       // skip the lock screen
window.EfbDev.mock();                          // list the mock states
window.EfbDev.mock('enroute_route_loaded');    // apply one
window.EfbDev.mock('parked_no_route');         // parked at KSEA, no plan
window.EfbDev.reset();                          // back to a fresh "just loaded" state
window.EfbDev.demoRoute();                      // load the built-in demo route

// or feed a raw payload directly (string or object, flat or nested):
window.__xefb.onSimState(JSON.stringify({
  position: { lat: 47.4502, lon: -122.3088, heading: 0 },
  route: null,
  weather: null
}));
```

`onSimState` accepts a JSON **string or object**, in the flat shape the plugin
emits (`latitude`/`longitude`/`altitudeFt`/`headingDeg`/`groundSpeedKts`/…) or
a nested `{ position, route, weather }` shape. `route`: object = apply, `null`
= clear, absent = leave as-is.

Two extra fields drive the clock and boarding readouts:

| field | meaning |
|---|---|
| `localOffsetSec` | civil UTC offset where the aircraft is — the plugin sends `sim/time/local_time_sec − sim/time/zulu_time_sec`. Used for the LOCAL clock / greeting so half-hour zones (IST +5:30) read correctly. Falls back to the OFP's `orig_timezone`, then `round(lon/15)`. |
| `paxCount` | passengers aboard, straight from the aircraft (Zibo `laminar/B738/actual_passengers_number` etc.; `DatarefBridge` has the candidate list). `-1` / absent → fall back to the OFP's planned pax. Shown on the overview PAX tile and the launcher (`<n> pax aboard`). |

## Empty states

Each data screen shows a neutral empty state (dim icon + one line + hint) when
its data isn't available yet. `render()` toggles `[data-empty="KEY"]`:

| key | shown when | screens |
|---|---|---|
| `route` | no OFP imported | Flight plan (table), Weather (along-route panel), Moving map (a chip only — the basemap still shows from live position) |
| `airport` | no destination known | Charts |
| `perf` | no OFP | Perf & W&B |
| `sim` | `onSimState` never received | Checklists |

The header pill reads `NO SIM` until the first `onSimState`, then `XP12`.

## Native contract

- **Sim state in:** `window.__xefb.onSimState(payload)` — see above. Position
  updates feed the moving map and `[data-sim]` nodes without a full re-render.
- **OFP in:** `window.__xefb.onOfp(rawSimbriefJson)` — the plugin's server-side
  SimBrief fetch delivers here; `window.__xefb.onOfpError(msg)` on failure.
- **Browser state in:** `window.__xefb.onBrowserState({activeId, tabs:[…]})` and
  `onBrowserTabs(n)` from the multi-tab `BrowserWindow`.
- **Actions out:** `window.__xefb.invoke(action, payload)`. In use:
  `browserNewTab/CloseTab/ActivateTab/Navigate/Back/Forward/Reload {…}`,
  `browserViewport {x,y,w,h,active}` (see below),
  `fetchOfp {userid|username}`, `groundService {id,on}`, `fuelTruck {on,targetKg}`,
  `pushback {cmd}` (BetterPushback), plus not-yet-implemented `uplinkRouteToFms`,
  `sendVspeedsToFms`, `applyPayloadToSim` (logged only).

### The composited browser

The Browser screen no longer opens a separate X-Plane window. `#browserViewport`
in `index.html` is an empty box; `app.js` measures its on-screen rect (in
EFB-view px, via `getBoundingClientRect()` ÷ `--efb-scale`) and sends it with
`invoke("browserViewport", {x,y,w,h,active})` on every render + resize. The
plugin (`BrowserWindow`) then paints the active tab's `View` bitmap into that
rect on top of the EFB bitmap, and routes any mouse / wheel / keyboard that
lands inside it to the browser instead of the EFB view. New tabs open
`file:///ui/browser-home.html`.

**In a plain browser** (no plugin — `window.__xefb.invoke` absent) the Browser
screen instead renders the page in an `<iframe>` inside `#browserViewport`, with
a local multi-tab model (`LB` in `app.js`). Many aviation sites send
`X-Frame-Options`, so the frame may be blank — a "open ↗" link is overlaid for
those. The real plugin uses a top-level Ultralight `View`, which isn't subject
to that.
- The moving-map tile source is swappable: `EfbMap.setTileSource(urlTemplate,
  cssFilter)` — the default (OSM, dark-filtered) is fine for dev but public OSM
  tiles rate-limit; point it at your own source for real use.

## Still placeholder / pending

- **CG envelope** — needs the aircraft's %MAC + moment arms.
- **Takeoff V-speeds** — currently a rough TOW estimate; a real calc needs AFM
  tables + runway/wind/temp.
- **Weather radar / SIGWX tiles** — no regional precip/cloud-top tile source
  wired (`§4` of the bugfix list).
- **In-EFB geo-referenced chart viewer** — the Charts screen and Browser open
  Navigraph Charts Cloud for real; an embedded viewer with own-ship overlay
  needs the Navigraph API (`docs/navigraph-integration.md`).
- **Zibo ground-service datarefs** — `GroundBridge` has candidate names per
  service; verify/adjust against the loaded Zibo version.

## Constraints carried over from the handoff

- **`backdrop-filter`** may not work in Ultralight's CPU rasterizer. `app.js`
  feature-detects and adds `html.no-backdrop` (opaque panels).
- **Fixed 1360×850 canvas**, scaled with `--efb-scale = min(vw/1360, vh/850)`.
- Touch targets kept ≥44 px.
