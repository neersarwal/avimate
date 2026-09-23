# Navigraph + SimBrief integration

How xEFB talks to Navigraph (charts, account) and SimBrief (OFP / flight plan),
and how to link the two so "Fetch OFP" just works after a single sign-in.

## TL;DR of the relationship

- **Navigraph owns SimBrief.** One Navigraph account; SimBrief is a service
  under it. A Navigraph login therefore also identifies a SimBrief user.
- **SimBrief's OFP API needs no auth** — only a numeric `userid` (or the
  `username` alias). It even sends permissive CORS, so the web view fetches it
  directly today (`resources/ui/ofp.js` → `EfbOfp.fetchDirect`).
- **Navigraph's charts/data APIs need OAuth2.** The token also lets you look
  up the user's SimBrief `userid`, so the pilot never has to type it.
- So the "compatibility layer" is: **do one Navigraph OAuth sign-in, cache the
  tokens in the plugin, derive the SimBrief id from them, and use that id for
  every OFP fetch** — while charts come from the Navigraph API with the same
  token.

## What's already wired

| Piece | Where | State |
|---|---|---|
| SimBrief OFP fetch (unauthenticated, by id) | `resources/ui/ofp.js`, `resources/ui/app.js` `fetchOfp()` | **working** — direct `fetch()` from the web view; native fallback via `window.__xefb.invoke('fetchOfp', {userid})` → `PluginMain` → `HttpClient` → `window.__xefb.onOfp(raw)` |
| OFP → route table / moving map / overview / W&B | `app.js` `applyOfp()` / `renderOfp()`, `map.js` `setRoute()` | **working** |
| Navigraph Charts / SimBrief Dispatch as a real web app | `src/render/BrowserWindow.*`, EFB "Browser" screen → `invoke('openBrowser', {url})` | **working** — a separate Ultralight window; the pilot signs into Navigraph there |
| Navigraph OAuth (device flow) + SimBrief-id lookup + charts API | `src/net/NavigraphClient.*` | **scaffold** — needs a `client_id` and testing against the live API |

## The OAuth flow to use: Device Authorization (RFC 8628)

A cockpit tablet has no good way to host a redirect URI or pop a browser for a
code exchange. The **device authorization grant** is built for exactly this:
the plugin shows a short code + URL, the pilot approves on their phone/PC, the
plugin polls for the token.

Navigraph supports it with PKCE. Endpoints (base `https://identity.api.navigraph.com`):

```
POST /connect/deviceauthorization
  body: client_id, code_challenge, code_challenge_method=S256, scope
  -> { device_code, user_code, verification_uri, verification_uri_complete,
       interval, expires_in }

POST /connect/token          (poll every `interval` seconds)
  body: client_id, device_code, code_verifier,
        grant_type=urn:ietf:params:oauth:grant-type:device_code
  -> 400 { error: "authorization_pending" }   ... keep polling
  -> 400 { error: "slow_down" }               ... back off
  -> 200 { access_token, refresh_token, expires_in, token_type }

POST /connect/token          (refresh, when access_token is near expiry)
  body: client_id, refresh_token, grant_type=refresh_token
  -> 200 { access_token, refresh_token, expires_in }
```

Scopes you want: `openid offline_access charts fmsdata` (`offline_access` is
what gets you a `refresh_token`; `charts` for the charts API; `fmsdata` for
navdata/SimBrief linkage). Confirm the exact scope names against the current
Navigraph API docs for your app.

### Getting a `client_id`

Navigraph runs an API access programme (historically free for non-commercial /
FOSS add-ons). Apply at <https://developer.navigraph.com/>. You'll get a
`client_id` (and for device flow, usually no client secret). Put it in a build
option or a config file — **do not commit it**:

```cmake
# CMakeLists.txt
set(XEFB_NAVIGRAPH_CLIENT_ID "" CACHE STRING "Navigraph API client_id")
if(XEFB_NAVIGRAPH_CLIENT_ID)
  target_compile_definitions(xefb_plugin PRIVATE
    XEFB_NAVIGRAPH_CLIENT_ID="${XEFB_NAVIGRAPH_CLIENT_ID}")
endif()
```

## Token storage

- Persist **only the `refresh_token`** (long-lived) to disk, in the plugin's
  own folder: `<plugin>/xEFB/prefs/navigraph.json`, file perms user-only.
- Keep the `access_token` in memory; refresh it when `< 60 s` from expiry or on
  a `401`.
- On startup: if a `refresh_token` exists, silently refresh → you're signed in
  with no prompt. If refresh fails (revoked / expired), fall back to the device
  flow.
- "Sign out" = delete the file and drop the in-memory tokens.

## Deriving the SimBrief id from a Navigraph token

Two options, in order of preference:

1. **Navigraph user info / preferences endpoint.** The Navigraph identity
   `userinfo` (`GET /connect/userinfo` with the bearer token) and/or the
   Navigraph account API expose the linked SimBrief account. Look for a
   `simbrief_user_id` / `preferred_username` style field. (Field name varies —
   inspect the live response.)
2. **SimBrief itself, via the Navigraph token.** SimBrief's newer API accepts a
   Navigraph bearer token and returns the OFP for "the signed-in user" without
   needing the numeric id at all — check
   `https://www.simbrief.com/api/xml.fetcher.php` docs for the
   `Authorization: Bearer` form.

Once resolved, cache the id next to the refresh token so subsequent sessions
skip the lookup.

## Charts API (once you have a token)

Base `https://charts.api.navigraph.com` (confirm current host/version):

```
GET /2/airports/{icao}                       -> airport metadata
GET /2/airports/{icao}/charts                 -> [{ id, name, category (APP/SID/STAR/TAXI/REF),
                                                    runway, is_georeferenced, ... }]
GET /2/charts/{chartId}/image?type=day|night  -> PNG/WEBP of the chart
GET /2/charts/{chartId}/... (bounding box / transform)  -> georeference for own-ship overlay
```

Wire this into the EFB **Charts** screen: replace the hard-coded chart list
with `airports/{dest}/charts`, load the selected chart image into the viewer
`<img>`, and use the georef + `onSimState` position to draw the own-ship dot.
The EFB already carries the destination ICAO (`renderOfp()` → `#chartAirport`).

## Compatibility-layer design

```
                 ┌─────────────────────────── plugin (C++) ────────────────────────────┐
   Navigraph  ◄──┤ NavigraphClient                                                     │
   identity/     │   • device-flow sign-in  • refresh loop  • token store              │
   charts API    │   • simbriefUserId()     • charts(icao)  • chartImage(id)           │
                 │        │                        │                                   │
   SimBrief   ◄──┤ HttpClient.get(simbrief url with id-or-bearer) ──► onOfp(raw json)  │
   OFP API       │        │                        │                                   │
                 └────────┼────────────────────────┼───────────────────────────────────┘
                          │  window.__xefb.invoke  │  window.__xefb.onOfp / onCharts
                 ┌────────▼────────────────────────▼──── web UI (resources/ui) ────────┐
                 │  Settings→Navigraph: "Sign in"  →  invoke('navigraphSignIn')        │
                 │  Simbrief screen:    "Fetch OFP" →  invoke('fetchOfp')  (id auto)   │
                 │  Charts screen:      pick airport →  invoke('navigraphCharts',{icao})│
                 └────────────────────────────────────────────────────────────────────┘
```

New invoke verbs to add (JS → plugin):

| verb | payload | plugin does |
|---|---|---|
| `navigraphSignIn` | — | start device flow; push `window.__xefb.onNavigraphCode({userCode, url})`, then `onNavigraphLinked({name, simbriefId})` |
| `navigraphSignOut` | — | wipe tokens; `onNavigraphLinked(null)` |
| `fetchOfp` | `{userid?}` | if `userid` given use it; else use the cached SimBrief id (or bearer); GET SimBrief; `onOfp(raw)` |
| `navigraphCharts` | `{icao}` | GET charts list; `onCharts({icao, charts:[…]})` |
| `navigraphChartImage` | `{chartId, night}` | fetch image, hand back a `blob:`/data URL via `onChartImage({chartId, src})` |

New callbacks (plugin → JS): `onNavigraphCode`, `onNavigraphLinked`,
`onCharts`, `onChartImage`, `onOfpError` (already added).

## Build order for this

1. Get a `client_id`; add the CMake option above.
2. Implement `NavigraphClient::signIn()` (device flow) + `refresh()` against
   the live endpoints; verify with a throwaway CLI first.
3. Add token persistence.
4. `simbriefUserId()` — try `userinfo`, fall back to bearer-fetch.
5. Point `fetchOfp` (already in `PluginMain`) at the cached id when the payload
   omits `userid`.
6. `charts(icao)` + `chartImage(id)`; wire the Charts screen.
7. In `Settings → Navigraph`, replace "Manage" with a real "Sign in / Sign out"
   that drives the device flow and shows the user code.

## Notes / gotchas

- **Rate limits:** Navigraph API and SimBrief both rate-limit. Cache chart
  lists per airport for the session; don't re-fetch the OFP every frame.
- **AIRAC currency:** the charts API is tied to the account's subscription +
  current AIRAC. Surface the cycle (the API returns it) in Settings.
- **Offline:** none of this works without network. Keep the core EFB
  (dashboard, checklists, W&B from a cached OFP, the canvas moving map) fully
  functional when `NavigraphClient` is signed-out or offline.
- **Don't ship the `client_id` in git.** Build it in, or read it from a
  gitignored config.
