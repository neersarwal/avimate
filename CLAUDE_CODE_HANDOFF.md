# Pane — Claude Code handoff (bugfix pass v2)

Owner: Neer
Scope: fix the issues below in the converted `resources/ui` build (post Design-export
conversion). Grouped by root cause, not by screen, since several screens share the same
underlying bug.

---

## 0. Context Claude Code should already have

- Architecture: `DatarefBridge` → `UltralightHost` (pushes `window.__xefb.onSimState(json)`
  each frame) → `resources/ui/*` → `TabletSurface`. No server; everything runs locally
  inside the X-Plane process.
- SimBrief integration is v1/no-auth: plain `xml.fetcher.php` endpoint (username/Pilot ID),
  no OAuth. Route/position data comes from XP itself, not from SimBrief.
- The Claude Design export used template bindings (`sc-if`, `onClick="{{ }}"`) that only
  resolve in Design's runtime — the conversion was supposed to replace these with real JS
  state and event handlers. Most of the bugs below are symptoms of that conversion being
  incomplete: static/mocked values were carried over verbatim instead of being wired to a
  live data source.

---

## 1. Root cause: no single reactive state store — most screens never re-render

**Symptoms this explains:**
- Airport name, top bar flight number, and lock screen data don't change after SimBrief
  import (img 1, 8, 11, 13's `DEVICE NAME` field showing stale `xEFBOS`)
- Block fuel and other OFP-derived numbers don't update after import
- Unit toggle (metric/imperial) has no effect anywhere
- Perf & W&B screen doesn't reflect any input changes
- Route turbulence / freezing level cards static (img 6)
- Radar & WX altitude pills don't swap their label text (img 5)

**Fix:**
- Introduce one central JS state object (e.g. `window.__pane.state`) fed by two sources:
  `onSimState(json)` (per-frame, from `DatarefBridge`) and a new `onOfpUpdate(json)`
  (fired once per successful SimBrief fetch, not per-frame).
- Every screen component should subscribe to state changes (simple pub/sub or a tiny
  reactive layer — doesn't need a framework) rather than reading values once at load time.
  Right now components appear to read `state` once during the Design→HTML conversion and
  never again.
- Unit toggle should be a derived display transform (convert on render), not a separate
  data path — this is likely why it currently does nothing: the toggle probably flips a
  flag that no formatter actually checks.
- Audit every screen for hardcoded literals left over from the Design mockup (e.g. `20.3
  KLB`, `146`, `74`, `VIDP`/`VEGT`) and replace with state reads.

---

## 2. Vertical profile chart doesn't work (img 7)

- Confirm whether this is a rendering bug (chart lib not receiving data) or a data bug
  (waypoint altitude/ETA array never populated from the OFP parse). Given the labels
  render but values are static, this is likely the same state-binding issue as Section 1 —
  check this screen isn't on its own disconnected data path before treating it as a
  separate bug.

## 3. Moving map offset (img 4)

- The route line and waypoint diamonds are rendering shifted from the basemap labels
  underneath. Likely causes to check, in order:
  - Projection mismatch between the vector tile basemap (MapLibre GL, presumably
    EPSG:3857) and the coordinate transform used to place the route overlay.
  - Device-pixel-ratio scaling applied to one layer but not the other.
  - Stale tile cache vs. live overlay redraw — confirm both layers repaint on the same
    frame/resize event.

## 4. Radar & WX tile is fully non-functional (img 5)

- Currently shows the literal placeholder string. This one's not wired at all yet —
  needs the actual precip/cloud-tops/winds tile source connected (per the vendored/
  pre-baked tile plan in the project decisions — confirm regional tile availability before
  wiring the toggle pills).
- Altitude pill labels (`Winds FL340` etc.) should read from the same state store as the
  Perf screen's cruise altitude, not a separate hardcoded value.

## 5. Performance & W&B screen — broken end to end

- Given the scope ("totally fucked, no changes anywhere"), treat this as needing a full
  rebuild of its data bindings rather than a patch: audit every field against the state
  store from Section 1, confirm inputs write back to state (not just display it), and
  confirm the screen re-renders on both `onSimState` and `onOfpUpdate`.

## 6. Checklists — needs real content, not just working bindings

- Should render all items unticked by default with a `0/0` counter that updates as items
  are checked.
- Needs actual checklist item sets per phase (Preflight, and the others) — these don't
  exist yet and need to be authored, not just bound. Confirm which aircraft's checklist to
  source (Zibo 737, given the Ground tile note below) before writing content.

## 7. Ground tile — needs real functionality, not a static screen

- Integrate BetterPushback for pushback control.
- Add Zibo-style ground service controls: fuel truck (with a fuel-quantity entry field),
  and the other standard ground-service pills (GPU, air start, catering, jetway/stairs,
  etc. — match what Zibo's ground service menu exposes).
- All service pills should default to **off** on load.

## 8. Charts tile

- No real chart source is wired — needs the Navigraph Charts Cloud embed (per the staged
  v1 plan: browser tile pointed at `charts.navigraph.com`, no OAuth needed for this).
- ICAO search box doesn't submit/filter — check the input has an actual handler wired to
  either a local airport-code validator or directly driving the embedded charts URL.

## 9. Can't view full OFP

- The OFP detail view (img 7's fuller context) isn't reachable — confirm there's an actual
  route/nav to a full-OFP screen and that it's rendering the parsed SimBrief XML rather
  than nothing.

## 10. Browser tile doesn't work at all

- Needs a working Ultralight-hosted webview surface with basic navigation chrome (address
  bar, back/forward, tab state). This sounds unstarted rather than buggy — confirm scope
  with Neer before implementing (a real multi-tab browser vs. a single embedded view is a
  meaningfully different amount of work).

## 11. Home-screen greeting placeholder never resolves (img 8)

- `{Your name fetched from Navigraph}` is literal template text, never replaced. Source
  the pilot name from the SimBrief OFP payload (SimBrief profile includes pilot name) since
  v1 has no Navigraph OAuth identity to pull from — don't block this on the deferred
  Navigraph SDK integration.

## 12. Browser tile home-card shows "3 tabs" with nothing open (img 9)

- Stale/hardcoded tab count left over from the Design mockup. Should read the live tab
  count (0 when none open) and the label should just be "Browser" with no tab count
  shown when the count is 0, not "0 tabs".

## 13. Home dashboard (img 10) — timezone and weather sync

- Currently shows the user's local system timezone. Should show local time **at the
  departure/relevant airport** derived from its coordinates, not the host machine's
  timezone.
- The weather-along-route summary should pull from the same data source as the Radar & WX
  tile (Section 4) rather than being independently static, and should refresh on a 10-minute
  interval, not just once at load.

## 14. Home/overview card (img 11) — content correctness

- Same root cause as Section 1: the app tile grid and status pills (Before start / Boarding)
  need to reflect real OFP + sim state (correct block time, correct boarding count) instead
  of the Design mockup's placeholder numbers.

## 15. Remove the Navigraph account card entirely (img 12)

- This whole card should be deleted from Settings/wherever it currently renders — not
  deferred, not stubbed, just removed. Consistent with v1 not doing Navigraph
  OAuth/account linking.

## 16. "About this tablet" panel (img 13)

- `ADDON VERSION` should start at `0.1.0` (this is the first real build, not `2.4.1` —
  that was placeholder Design-mockup text), and should be driven by an actual version
  constant Claude Code should establish now.
- `SIMULATOR` should reflect whichever XP12 build the user is actually running, read via
  dataref/SDK version query — not hardcoded.
- Remove the `NAV DATA` / AIRAC row entirely.

---

## Suggested order of attack

1. Build the central state store + subscription pattern (Section 1) — this unblocks the
   majority of the other bugs, since most screens just need to be wired to it once it
   exists.
2. Fix map projection offset (Section 3) and Radar & WX wiring (Section 4) — self-contained,
   don't depend on Section 1.
3. Rebuild Perf & W&B bindings (Section 5) on top of the new state store.
4. Author checklist content + wire counters (Section 6).
5. Ground tile functionality (Section 7) — likely the largest net-new scope item.
6. Charts search + embed (Section 8), full OFP view (Section 9).
7. Browser tile (Section 10) — confirm scope before starting, this is closer to a new
   feature than a bugfix.
8. Cleanup pass: Sections 11–16 (placeholder text, stale counts, timezone fix, remove
   Navigraph card, fix About panel).
