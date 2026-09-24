/* ===================================================================
   xEFB UI runtime — vanilla-JS port of the state machine in
   design-doc/xEFB Mockups.dc.html (<script type="text/x-dc"> block).

   Native side calls window.__xefb.onSimState(json) once per frame
   (see UltralightHost::postStateUpdate). Buttons that need the plugin
   call nativeInvoke(action) -> window.__xefb.invoke(...) once that
   channel exists in UltralightHost.
   =================================================================== */
(function () {
  "use strict";

  /* --- config (was Design props: startScreen / accentColor) --------- */
  var START_SCREEN = "apps";
  var ACCENT = "#4f9cf5";
  var XEFB_VERSION = "0.1.0";        // first real build — bump on release
  var OS_NAME = "xEFBOS";

  var WALLPAPERS = [
    "radial-gradient(58% 40% at 74% 12%,rgba(255,168,88,.34) 0%,rgba(255,168,88,0) 62%),radial-gradient(52% 42% at 14% 22%,rgba(96,150,235,.32) 0%,rgba(96,150,235,0) 66%),radial-gradient(90% 70% at 50% 108%,rgba(6,10,17,.92) 0%,rgba(6,10,17,0) 62%),linear-gradient(168deg,#16304f 0%,#0e1e33 42%,#080c14 100%)",
    "radial-gradient(50% 38% at 84% 8%,rgba(198,214,235,.16) 0%,rgba(198,214,235,0) 64%),radial-gradient(60% 45% at 8% 84%,rgba(90,104,128,.24) 0%,rgba(90,104,128,0) 66%),linear-gradient(160deg,#2a303c 0%,#171b23 46%,#0a0c11 100%)",
    "radial-gradient(52% 40% at 76% 82%,rgba(255,166,74,.3) 0%,rgba(255,166,74,0) 62%),radial-gradient(46% 36% at 18% 14%,rgba(255,120,60,.2) 0%,rgba(255,120,60,0) 64%),linear-gradient(170deg,#3a2612 0%,#1d1409 48%,#0a0705 100%)",
    "radial-gradient(54% 42% at 22% 84%,rgba(64,196,182,.28) 0%,rgba(64,196,182,0) 64%),radial-gradient(48% 38% at 82% 16%,rgba(58,132,168,.26) 0%,rgba(58,132,168,0) 62%),linear-gradient(166deg,#10333a 0%,#0a1d22 46%,#05090b 100%)",
    "#0b0d11"
  ];

  var TITLES = {
    apps: "Home", browser: "Browser", home: "Flight overview", route: "Flight plan",
    charts: "Charts", map: "Moving map", wx: "Weather", perf: "Performance & weight",
    checks: "Checklists", ac: "Aircraft & ground", brief: "Simbrief import", settings: "Settings"
  };
  var METAR = {
    dep: "KSFO 041842Z 29008KT 10SM FEW015 21/13 A3001 RMK AO2 SLP162",
    arr: "KLAX 041847Z 25006KT 6SM BR BKN008 18/16 A2998 RMK AO2 SLP152"
  };
  var TAF = {
    dep: "TAF KSFO 041730Z 0418/0524 29010KT P6SM FEW020 FM050200 28006KT P6SM SCT012 FM051200 26005KT 4SM BR BKN008",
    arr: "TAF KLAX 041720Z 0418/0524 25007KT 5SM BR BKN008 FM042100 26009KT P6SM SCT015 FM050600 22004KT 3SM BR OVC006"
  };
  var WIND = { dep: "290 / 08", arr: "250 / 06" };
  var VIS = { dep: "10 SM", arr: "6 SM" };
  var QNH = { dep: "30.01", arr: "29.98" };

  // Built-in demo route (KSFO SSTIK2 SNS Q13 FIM ANJLL4 KLAX), shown on the
  // moving map / flight plan until a real OFP is loaded.
  var DEMO_ROUTE = {
    routeString: "SSTIK2 SNS Q13 FIM ANJLL4",
    fullRouteString: "KSFO/28R SSTIK2 SNS Q13 FIM ANJLL4 KLAX/24R",
    origin: { icao: "KSFO", rwy: "28R", lat: 37.6189, lon: -122.3750 },
    dest: { icao: "KLAX", rwy: "24R", lat: 33.9425, lon: -118.4081 },
    alternate: "KONT", costIndex: 28, distanceNm: 337, eteSec: 4320,
    cruise: { altitude: 34000, mach: ".78" },
    legs: [
      { ident: "KSFO", kind: "airport", lat: 37.6189, lon: -122.3750, via: "", altFt: 13, distNm: 0, eteSec: 0 },
      { ident: "SSTIK", kind: "wpt", lat: 37.4200, lon: -122.1600, via: "SSTIK2", altFt: 5000, distNm: 12, eteSec: 240 },
      { ident: "MENLO", kind: "wpt", lat: 37.2600, lon: -121.9600, via: "SSTIK2", altFt: 11000, distNm: 21, eteSec: 360 },
      { ident: "SNS", kind: "vor", lat: 36.6641, lon: -121.6033, via: "Q13", altFt: 24000, distNm: 48, eteSec: 540 },
      { ident: "BSR", kind: "vor", lat: 36.1806, lon: -121.6489, via: "Q13", altFt: 34000, distNm: 62, eteSec: 660 },
      { ident: "RZS", kind: "vor", lat: 34.5106, lon: -119.7711, via: "Q13", altFt: 34000, distNm: 57, eteSec: 600 },
      { ident: "FIM", kind: "vor", lat: 34.3572, lon: -118.8817, via: "ANJLL4", altFt: 24000, distNm: 71, eteSec: 780 },
      { ident: "SILEX", kind: "wpt", lat: 34.1500, lon: -118.6000, via: "ANJLL4", altFt: 10000, distNm: 39, eteSec: 480 },
      { ident: "KLAX", kind: "airport", lat: 33.9425, lon: -118.4081, via: "ILS", altFt: 125, distNm: 27, eteSec: 420 }
    ]
  };

  /* --- state ------------------------------------------------------- */
  var State = {
    screen: null, locked: true, unlocking: false, leaving: false,
    wp: 1, al: 2, now: new Date(), chart: 2, wx: "dep",
    l1: true, l2: true, l3: false, l4: true,
    inj: false,
    // ground services + BetterPushback — ALL default off (bugfix spec §7)
    gsvc: {}, pushback: { state: "idle" },
    s1: true, s2: false, s3: false,
    // checklists: all items unticked by default. { phaseId: [bool,...] }
    phaseId: null, checks: {},
    // extensions not in the mockup, same single-value pill pattern as `al`:
    mapRange: "40", radar: "precip", setSec: "general", drHz: 10,
    // last SimState pushed from native:
    sim: {}, simConnected: false, simWx: null,
    // flight plan: null until a SimBrief OFP is imported (DEMO_ROUTE shown meanwhile)
    ofp: null, ofpStatus: "",         // "", "fetching", "ok", "error"
    briefTab: "diff",                 // "diff" | "full"
    browser: null,
    simbriefId: "",
    // live browser tab count (from window.__xefb.onBrowserTabs)
    browserTabs: 0,
    // wx auto-refresh bookkeeping
    wxFetchedAt: 0
  };

  /* --- units: display transform driven by the "metric" toggle (s3) -- */
  function fmtWeightKg(kg) {
    if (kg == null || !isFinite(kg)) return "—";
    return State.s3 ? Math.round(kg).toLocaleString("en-US") + " kg"
                    : (kg / 453.59237).toFixed(1) + " KLB";
  }
  function fmtWeightBare(kg) {           // number only, unit shown separately
    if (kg == null || !isFinite(kg)) return "—";
    return State.s3 ? Math.round(kg).toLocaleString("en-US") : (kg / 453.59237).toFixed(1);
  }
  function weightUnit() { return State.s3 ? " kg" : " KLB"; }
  function fmtDistNm(nm) {
    if (nm == null || !isFinite(nm)) return "—";
    return State.s3 ? Math.round(nm * 1.852) + " km" : Math.round(nm) + " NM";
  }
  function fmtAltFt(ft) {
    if (ft == null || !isFinite(ft)) return "—";
    if (State.s3) return Math.round(ft * 0.3048).toLocaleString("en-US") + " m";
    return ft >= 18000 ? "FL" + Math.round(ft / 100) : Math.round(ft).toLocaleString("en-US") + " ft";
  }
  function fmtBaroInHg(inhg) {
    if (inhg == null || !isFinite(inhg)) return "—";
    return State.s3 ? Math.round(inhg * 33.8639) + " hPa" : inhg.toFixed(2);
  }

  // The active flight plan, or null. DEMO_ROUTE is only used by mock-states.json
  // / the console for previewing — a fresh session starts with no route and
  // shows each screen's empty state.
  function activeRoute() { return State.ofp; }

  // Passengers aboard: the aircraft's own count when it exposes one, otherwise
  // the OFP's planned pax, otherwise null.
  function paxAboard() {
    var n = toNum(State.sim.paxCount);
    if (isFinite(n) && n >= 0) return n;
    var o = State.ofp;
    if (o && o.weights && o.weights.pax != null) return o.weights.pax;
    return null;
  }

  var tNav = null, tUnlock = null, lastAct = Date.now(), lastScreen = null, lastShowLock = null;

  function cur() { return State.screen || START_SCREEN || "apps"; }

  /* --- navigation / transitions (port of go / unlock / lockNow) ----- */
  function go(s) {
    if (cur() === "apps" && s !== "apps") {
      State.leaving = true;
      render();
      clearTimeout(tNav);
      tNav = setTimeout(function () {
        State.leaving = false; State.screen = s; render();
      }, 190);
    } else {
      State.screen = s; render();
    }
  }
  function unlock() {
    if (State.unlocking) return;
    State.unlocking = true; render();
    clearTimeout(tUnlock);
    tUnlock = setTimeout(function () {
      State.locked = false; State.unlocking = false; render();
    }, 380);
  }
  function lockNow() { State.locked = true; State.unlocking = false; render(); }
  function set(patch) { for (var k in patch) State[k] = patch[k]; render(); }
  function flip(k) { State[k] = !State[k]; render(); }

  /* --- checklists ------------------------------------------------- */
  function aircraft() { return State.sim.aircraft || ""; }
  function checkPhases() {
    return (window.EfbChecklists ? window.EfbChecklists.phases(aircraft()) : []);
  }
  function currentPhaseId() {
    var ph = checkPhases();
    if (!ph.length) return null;
    if (State.phaseId && ph.some(function (p) { return p.id === State.phaseId; })) return State.phaseId;
    return ph[0].id;
  }
  function phaseItems(id) {
    return (window.EfbChecklists ? window.EfbChecklists.items(id, aircraft()) : []);
  }
  function checkArray(id) {
    var items = phaseItems(id);
    if (!State.checks[id] || State.checks[id].length !== items.length) {
      State.checks[id] = items.map(function () { return false; });
    }
    return State.checks[id];
  }
  function toggleCheck(idx) {
    var id = currentPhaseId();
    var arr = checkArray(id);
    if (idx >= 0 && idx < arr.length) arr[idx] = !arr[idx];
    render();
  }
  function resetPhase() {
    var id = currentPhaseId();
    var arr = checkArray(id);
    for (var i = 0; i < arr.length; i++) arr[i] = false;
    render();
  }
  function gotoPhase(id) { State.phaseId = id; go("checks"); }
  function nextPhase() {
    var ph = checkPhases(), i = ph.findIndex(function (p) { return p.id === currentPhaseId(); });
    if (i >= 0 && i < ph.length - 1) gotoPhase(ph[i + 1].id);
  }
  function checkProgress() {
    var id = currentPhaseId();
    if (!id) return { done: 0, total: 0, pct: 0, phaseTitle: "Checklist" };
    var arr = checkArray(id);
    var done = arr.filter(Boolean).length;
    var ph = checkPhases().find(function (p) { return p.id === id; });
    return {
      done: done, total: arr.length,
      pct: arr.length ? Math.round((done / arr.length) * 100) : 0,
      phaseTitle: ph ? ph.title : "Checklist"
    };
  }

  /* --- ground services + pushback (bugfix §7) ------------------- */
  // Zibo 737 ground-service set. All default OFF. `sim` names the
  // dataref/command the plugin toggles (see GroundBridge / docs).
  var GSVC = [
    { id: "gpu",     label: "Ground power (GPU)",   sub: "External AC" },
    { id: "airstart",label: "Air start unit",       sub: "Pneumatic cart" },
    { id: "accart",  label: "Air conditioning cart",sub: "Conditioned air" },
    { id: "chocks",  label: "Wheel chocks",         sub: "Remove before pushback" },
    { id: "gpu2",    label: "Ground handling",      sub: "Marshaller / wing walkers" },
    { id: "stairs",  label: "Stairs",               sub: "Fwd / aft airstairs" },
    { id: "jetway",  label: "Jet bridge",           sub: "Door 1L" },
    { id: "catering",label: "Catering truck",       sub: "Galley service" },
    { id: "cargo",   label: "Cargo / baggage",      sub: "Fwd + aft holds" },
    { id: "lav",     label: "Lavatory service",     sub: "" },
    { id: "water",   label: "Potable water",        sub: "" }
  ];
  function toggleGsvc(id) {
    State.gsvc[id] = !State.gsvc[id];
    nativeInvoke("groundService", { id: id, on: !!State.gsvc[id] });
    render();
  }
  function fuelTruck(on, targetKg) {
    State.gsvc.fueltruck = !!on;
    nativeInvoke("fuelTruck", { on: !!on, targetKg: targetKg || 0 });
    render();
  }
  function pushback(cmd) {
    // BetterPushback: cmd = 'plan' | 'start' | 'stop' | 'connect' | 'disconnect'
    State.pushback.state = cmd === "stop" ? "idle" : cmd;
    nativeInvoke("pushback", { cmd: cmd });
    render();
  }

  /* --- native bridge stub ----------------------------------------- */
  function nativeInvoke(action, payload) {
    if (window.__xefb && typeof window.__xefb.invoke === "function") {
      window.__xefb.invoke(action, payload || null);
    } else {
      // No native channel yet — see the JS<->native bridge sketch in
      // src/render/UltralightHost.cpp ("invoke('loadChart', icao)").
      if (window.console) console.debug("[xefb] nativeInvoke (no bridge yet):", action, payload || "");
    }
  }

  /* --- SimBrief OFP -------------------------------------------- */
  function fetchOfp(quiet) {
    var id = State.simbriefId || "";
    var input = document.getElementById("simbriefId");
    if (input && input.value != null && input.value.trim()) id = input.value.trim();
    State.simbriefId = id;
    if (!id) { State.ofpStatus = "error"; render(); return; }
    if (!window.EfbOfp) { State.ofpStatus = "error"; render(); return; }

    if (!quiet) { State.ofpStatus = "fetching"; render(); }

    // SimBrief's API sends permissive CORS, so we fetch straight from the web
    // view (works in Ultralight and in a plain browser). If it fails and the
    // plugin bridge is present, let the plugin retry server-side (it can also
    // attach a Navigraph token — see docs/navigraph-integration.md).
    window.EfbOfp.fetchDirect(id)
      .then(applyOfp)
      .catch(function (e) {
        if (window.console) console.warn("[xefb] direct OFP fetch failed:", e);
        if (window.EfbOfp.fetchViaNative(id)) return;   // plugin will call onOfp
        if (!quiet) { State.ofpStatus = "error"; render(); }
      });
  }

  function applyOfp(ofp) {
    try {
      if (typeof ofp === "string") ofp = window.EfbOfp.parse(ofp);
      State.ofp = ofp;
      State.ofpStatus = "ok";
      State.wxFetchedAt = Date.now();
      if (ofp && ofp.pilotId && !State.simbriefId) State.simbriefId = ofp.pilotId;
      if (window.EfbMap) window.EfbMap.setRoute(ofp);
      render();
    } catch (e) {
      if (window.console) console.warn("[xefb] OFP parse failed:", e);
      State.ofpStatus = "error"; render();
    }
  }

  function fmtHm(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h + ":" + ("0" + m).slice(-2);
  }
  function klb(kg) { return (kg / 453.59237).toFixed(1); }

  /* --- charts (Navigraph Charts Cloud in the browser window) ---- */
  function openChartsAirport(icaoOpt) {
    var inp = document.getElementById("chartIcao");
    var icao = (icaoOpt || (inp && inp.value) || "").trim().toUpperCase();
    if (!icao && State.ofp) icao = State.ofp.dest.icao;
    if (!/^[A-Z0-9]{3,4}$/.test(icao)) {
      var lbl = document.getElementById("chartViewLabel");
      if (lbl) lbl.textContent = "Enter a valid ICAO code";
      return;
    }
    if (inp) inp.value = icao;
    var lbl = document.getElementById("chartViewLabel");
    if (lbl) lbl.textContent = icao + " charts — opening in the browser";
    openBrowserUrl("https://charts.navigraph.com/airport/" + icao, true);
  }

  /* --- moving map wiring -------------------------------------- */
  var mapReady = false;
  function initMap() {
    if (mapReady || !window.EfbMap) return;
    var host = document.getElementById("mapCanvasHost");
    if (!host) return;
    window.EfbMap.init(host);
    window.EfbMap.setRoute(activeRoute());
    window.EfbMap.setLayer("wx", State.l1);
    window.EfbMap.setLayer("traffic", State.l2);
    window.EfbMap.setLayer("airspace", State.l3);
    window.EfbMap.setLayer("terrain", State.l4);
    mapReady = true;
  }
  function pushOwnshipToMap() {
    if (!mapReady || !window.EfbMap) return;
    var s = State.sim;
    if (s && isFinite(s.latitude) && isFinite(s.longitude) &&
        (s.latitude !== 0 || s.longitude !== 0)) {
      window.EfbMap.setOwnship({
        lat: s.latitude, lon: s.longitude,
        trackDeg: s.headingDeg || 0, gsKts: s.groundSpeedKts || 0
      });
    }
  }

  /* --- handler map (was the `v` object's function entries) --------- */
  var handlers = {
    goApps: function () { go("apps"); },
    goBrowser: function () { go("browser"); },
    goHome: function () { go("home"); },
    goRoute: function () { go("route"); },
    goCharts: function () { go("charts"); },
    goMap: function () { go("map"); },
    goWx: function () { go("wx"); },
    goPerf: function () { go("perf"); },
    goChecks: function () { go("checks"); },
    goAc: function () { go("ac"); },
    goBrief: function () { go("brief"); },
    goSettings: function () { go("settings"); },
    unlock: unlock,
    lockNow: lockNow,
    wxDep: function () { set({ wx: "dep" }); },
    wxArr: function () { set({ wx: "arr" }); },
    toggleInj: function () { flip("inj"); },
    // map layers / ground services / settings prefs
    toggleL1: function () { flip("l1"); if (window.EfbMap) window.EfbMap.setLayer("wx", State.l1); },
    toggleL2: function () { flip("l2"); if (window.EfbMap) window.EfbMap.setLayer("traffic", State.l2); },
    toggleL3: function () { flip("l3"); if (window.EfbMap) window.EfbMap.setLayer("airspace", State.l3); },
    toggleL4: function () { flip("l4"); if (window.EfbMap) window.EfbMap.setLayer("terrain", State.l4); },
    toggleS1: function () { flip("s1"); }, toggleS2: function () { flip("s2"); },
    toggleS3: function () { flip("s3"); },
    // wallpaper / auto-lock / dataref hz
    wp1: function () { set({ wp: 1 }); }, wp2: function () { set({ wp: 2 }); },
    wp3: function () { set({ wp: 3 }); }, wp4: function () { set({ wp: 4 }); },
    wp5: function () { set({ wp: 5 }); },
    al1: function () { set({ al: 1 }); }, al2: function () { set({ al: 2 }); },
    al3: function () { set({ al: 3 }); },
    drHz5: function () { set({ drHz: 5 }); nativeInvoke("setDatarefHz", 5); },
    drHz10: function () { set({ drHz: 10 }); nativeInvoke("setDatarefHz", 10); },
    drHz30: function () { set({ drHz: 30 }); nativeInvoke("setDatarefHz", 30); },
    // checklists
    resetPhase: resetPhase,
    nextPhase: nextPhase,
    // ground / pushback (§7)
    pbPlan: function () { pushback("plan"); },
    pbStart: function () { pushback("start"); },
    pbStop: function () { pushback("stop"); },
    pbConnect: function () { pushback("connect"); },
    fuelTruckApply: function () {
      var inp = document.getElementById("fuelTarget");
      var kg = inp ? parseFloat((inp.value || "").replace(/[, ]/g, "")) : 0;
      // input is in the current display unit; convert to kg
      if (!State.s3 && kg) kg = kg * 453.59237;         // KLB -> kg
      fuelTruck(true, Math.round(kg) || 0);
    },
    fuelTruckStop: function () { fuelTruck(false, 0); },
    // map range / radar mode
    mapRange40: function () { set({ mapRange: "40" }); if (window.EfbMap) window.EfbMap.setRangeNm(40); },
    mapRange80: function () { set({ mapRange: "80" }); if (window.EfbMap) window.EfbMap.setRangeNm(80); },
    mapRangeCtr: function () { set({ mapRange: "ctr" }); if (window.EfbMap) window.EfbMap.setCenterFollow(true); },
    wxRadarPrecip: function () { set({ radar: "precip" }); },
    wxRadarTops: function () { set({ radar: "tops" }); },
    wxRadarWinds: function () { set({ radar: "winds" }); },
    // settings sections
    setSecGeneral: function () { set({ setSec: "general" }); },
    setSecAbout: function () { set({ setSec: "about" }); },
    // native-intent buttons (no-op until UltralightHost exposes invoke)
    uplinkFms: function () { nativeInvoke("uplinkRouteToFms"); },
    reverseRoute: function () { nativeInvoke("reverseRoute"); },
    insertWaypoint: function () { nativeInvoke("insertWaypoint"); },
    directTo: function () { nativeInvoke("directTo"); },
    applyPayload: function () { nativeInvoke("applyPayloadToSim"); },
    sendVspeeds: function () { nativeInvoke("sendVspeedsToFms"); },
    callTug: function () { nativeInvoke("callTug"); },
    stopTug: function () { nativeInvoke("stopTug"); },
    fetchOfp: fetchOfp,
    briefTabDiff: function () { set({ briefTab: "diff" }); },
    briefTabFull: function () { set({ briefTab: "full" }); },
    importAll: function () {
      if (State.ofp) nativeInvoke("importOfp", { route: State.ofp.fullRouteString });
      go("route");
    },
    // bookmarks — open in a new tab in the browser
    bmNavigraph: function () { openBrowserUrl("https://charts.navigraph.com", true); },
    bmSimbrief: function () { openBrowserUrl("https://dispatch.simbrief.com", true); },
    bmChartfox: function () { openBrowserUrl("https://chartfox.org", true); },
    bmVatsim: function () { openBrowserUrl("https://map.vatsim.net", true); },
    bmAwc: function () { openBrowserUrl("https://aviationweather.gov", true); },
    bmSkyvector: function () { openBrowserUrl("https://skyvector.com", true); },
    browserHome: function () { openBrowserUrl(browserHomeUrl(), true); },
    // charts screen: open charts.navigraph.com for the searched/dest airport
    openChartsFor: function () { openChartsAirport(); },
    browserBack: function () {
      if (pluginPresent()) return nativeInvoke("browserBack");
      var f = browserIframe(); if (f) { try { f.contentWindow.history.back(); } catch (e) {} }
    },
    browserForward: function () {
      if (pluginPresent()) return nativeInvoke("browserForward");
      var f = browserIframe(); if (f) { try { f.contentWindow.history.forward(); } catch (e) {} }
    },
    browserReload: function () {
      if (pluginPresent()) return nativeInvoke("browserReload");
      var f = browserIframe(); if (f) f.src = f.src;
    },
    browserGo: function () {
      var inp = document.getElementById("browserUrl");
      if (inp && inp.value.trim()) openBrowserUrl(normalizeUrl(inp.value.trim()), false);
    }
  };

  /* --- browser: native (plugin composites) or local <iframe> fallback --- */
  function pluginPresent() {
    return !!(window.__xefb && typeof window.__xefb.invoke === "function");
  }
  function browserHomeUrl() {
    return pluginPresent() ? "file:///ui/browser-home.html" : "browser-home.html";
  }
  function browserIframe() { return document.querySelector("#browserViewport iframe"); }
  function hostOf(u) {
    if (/browser-home\.html/.test(u)) return "Start page";
    try {
      var h = new URL(u, location.href).hostname || u;
      return h.replace(/^www\./, "");
    } catch (e) { return u; }
  }

  // Local multi-tab model used only when there's no plugin (plain browser dev).
  var LB = { tabs: [], activeId: 0, nextId: 1 };
  function lbSync() {
    State.browser = {
      activeId: LB.activeId,
      tabs: LB.tabs.map(function (t) {
        return { id: t.id, title: t.title, url: t.url, canBack: true, canFwd: true };
      })
    };
    State.browserTabs = LB.tabs.length;
    renderBrowser();
    render();
  }
  function lbOpen(url, newTab) {
    if (newTab || !LB.tabs.length) {
      var id = LB.nextId++;
      LB.tabs.push({ id: id, url: url, title: hostOf(url) });
      LB.activeId = id;
    } else {
      var t = LB.tabs.filter(function (x) { return x.id === LB.activeId; })[0] || LB.tabs[LB.tabs.length - 1];
      t.url = url; t.title = hostOf(url); LB.activeId = t.id;
    }
    lbSync();
  }
  function lbClose(id) {
    LB.tabs = LB.tabs.filter(function (t) { return t.id !== id; });
    if (LB.activeId === id) LB.activeId = LB.tabs.length ? LB.tabs[LB.tabs.length - 1].id : 0;
    lbSync();
  }
  function lbActivate(id) { LB.activeId = id; lbSync(); }

  function browserCloseTab(id) {
    if (pluginPresent()) nativeInvoke("browserCloseTab", { id: id });
    else lbClose(id);
  }
  function browserActivateTab(id) {
    if (pluginPresent()) nativeInvoke("browserActivateTab", { id: id });
    else lbActivate(id);
  }

  // Navigate the browser: reuse the active tab unless newTab is forced or there
  // are no tabs yet.
  function openBrowserUrl(url, newTab) {
    go("browser");
    if (!pluginPresent()) { lbOpen(url, newTab); return; }
    if (newTab || !(State.browser && (State.browser.tabs || []).length)) {
      nativeInvoke("browserNewTab", { url: url });
    } else {
      nativeInvoke("browserNavigate", { url: url });
    }
  }

  /* --- helpers --------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad3(v) { v = Math.round(((v % 360) + 360) % 360); return ("00" + v).slice(-3); }

  function fmtClockLocal(d) { return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
  function fmtClockZulu(d) { return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }); }
  function fmtDateLine(d) { return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }); }
  function hhmmZ(d) { return fmtClockZulu(d) + "Z"; }

  // UTC offset (seconds) for the "LOCAL" clock, best source first:
  //   1. X-Plane's own local−zulu offset (real tz where the aircraft is)
  //   2. the SimBrief OFP's departure-station offset (handles half-hour zones)
  //   3. coordinate-derived round(lon/15) — last resort, wrong for zones like
  //      IST (+5:30) whose civil time isn't its solar time
  function localOffsetSec() {
    var s = State.sim;
    if (s && isFinite(s.tzOffsetSec)) return s.tzOffsetSec;
    var o = State.ofp;
    if (o && o.origTzHours != null && isFinite(o.origTzHours)) return Math.round(o.origTzHours * 3600);
    var lon = ownLon();
    if (lon != null && isFinite(lon)) return Math.round(lon / 15) * 3600;
    return 0;
  }
  function clockFromOffset(nowUtc, offSec) {
    var t = new Date(nowUtc.getTime() + (offSec || 0) * 1000);
    return t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  }
  function tzLabelFromOffset(offSec) {
    var h = (offSec || 0) / 3600;
    var sign = h < 0 ? "-" : "+";
    var ah = Math.abs(h), whole = Math.floor(ah), mins = Math.round((ah - whole) * 60);
    return "UTC" + sign + whole + (mins ? ":" + ("0" + mins).slice(-2) : "");
  }
  function secToClockZ(sec) {
    // seconds-since-midnight-UTC -> "HH:MMZ"
    sec = ((sec % 86400) + 86400) % 86400;
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2) + "Z";
  }

  // where the aircraft appears to be, for "local conditions" defaults
  function ownLon() {
    var s = State.sim;
    if (s && isFinite(s.longitude) && (s.longitude !== 0 || s.latitude !== 0)) return s.longitude;
    if (State.ofp && State.ofp.origin) return State.ofp.origin.lon;
    return null;
  }

  // pull "WIND / DIR" and QNH out of a raw METAR string
  function metarWind(m) {
    var w = /(\d{3})(\d{2,3})(?:G\d{2,3})?KT/.exec(m || "");
    return w ? (w[1] + " / " + String(+w[2])) : "";
  }
  function metarQnh(m) {
    var a = /\bA(\d{4})\b/.exec(m || ""); if (a) return (a[1].slice(0, 2) + "." + a[1].slice(2));
    var q = /\bQ(\d{4})\b/.exec(m || ""); return q ? q[1] : "";
  }
  function metarVis(m) {
    var v = /\b(\d{1,2})SM\b/.exec(m || ""); if (v) return v[1] + " SM";
    var mm = /\b(\d{4})\b/.exec((m || "").replace(/\d{6}Z/, "")); return mm ? mm[1] + " m" : "";
  }

  function derived() {
    var screen = cur();
    var dep = State.wx === "dep";
    var inXefb = ["home", "route", "map", "wx", "perf", "checks", "ac"].indexOf(screen) >= 0;
    var inNav = ["charts", "brief"].indexOf(screen) >= 0;
    var ck = checkProgress();               // {done,total,pct,phaseTitle} — see checklists section
    var o = State.ofp;
    var offSec = localOffsetSec();

    // weather priority: OFP METAR/TAF (dep/arr) > live local METAR from the
    // sim weather push > (only before the sim connects) the built-in demo
    var owx = State.ofp && State.ofp.weather;
    var live = State.simWx;
    var ofpMetar = owx && (dep ? owx.origMetar : owx.destMetar);
    var ofpTaf = owx && (dep ? owx.origTaf : owx.destTaf);
    var metar, taf, wxNoData = false;
    if (ofpMetar) { metar = ofpMetar; taf = ofpTaf || ""; }
    else if (live && live.metar) { metar = live.metar; taf = live.taf || ""; }
    else if (!State.simConnected) { metar = dep ? METAR.dep : METAR.arr; taf = dep ? TAF.dep : TAF.arr; }
    else { metar = ""; taf = ""; wxNoData = true; }

    return {
      screen: screen,
      appTitle: (inNav ? "Navigraph" : screen === "browser" ? "Browser" : screen === "settings" ? "Settings" : "xEFB"),
      phaseTitle: ck.phaseTitle,
      metar: wxNoData ? "No weather data — X-Plane is not in real-weather mode" : metar,
      taf: wxNoData ? "—" : taf,
      wind: wxNoData ? "—" : (metarWind(metar) || "—"),
      vis: wxNoData ? "—" : (metarVis(metar) || "—"),
      qnh: wxNoData ? "—" : (fmtBaroInHg(parseFloat(metarQnh(metar))) !== "NaN" && metarQnh(metar)
                              ? fmtBaroInHg(parseFloat(metarQnh(metar))) : "—"),
      wxNoData: wxNoData,

      // greeting by local hour at the aircraft / origin
      greeting: (function () {
        var h = parseInt(clockFromOffset(State.now, offSec).slice(0, 2), 10);
        var part = h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
        return "Good " + part + ", Captain";
      })(),

      // clocks
      clockLocal: clockFromOffset(State.now, offSec), // local at aircraft / departure station
      clockZulu: fmtClockZulu(State.now),
      clockHost: fmtClockLocal(State.now),           // host machine (still available if wanted)
      dateLine: fmtDateLine(State.now),
      tzLabel: tzLabelFromOffset(offSec),

      // checklists
      checkDone: ck.done, checkTotal: ck.total,
      checkProgress: ck.pct, checkCounter: ck.done + " / " + ck.total,

      // identity / version
      version: XEFB_VERSION,
      osName: OS_NAME,
      addonVersionLine: "xEFB " + XEFB_VERSION,
      simulatorName: State.sim.simulatorName ||
        (State.simConnected ? ("X-Plane " + (State.sim.simVersionStr ||
          (State.sim.xplaneMajor ? State.sim.xplaneMajor + ".x" : "12"))) : "—"),
      simMajorPill: State.simConnected ? ("XP" + (State.sim.xplaneMajor || 12)) : "NO SIM",

      // flight plan
      hasPlan: !!o,
      noPlan: !o,
      cruiseWind: (State.sim.windDirDeg != null && State.sim.windKts != null)
        ? (pad3(State.sim.windDirDeg) + " / " + Math.round(State.sim.windKts) + " kt") : "—",
      cruiseSat: (State.sim.oatC != null)
        ? ((State.sim.oatC > 0 ? "+" : "") + Math.round(State.sim.oatC) + "°C") : "—",
      radarWindsLabel: o && o.cruise && o.cruise.altitude
        ? ("Winds " + (o.cruise.altitude >= 18000 ? "FL" + Math.round(o.cruise.altitude / 100) : Math.round(o.cruise.altitude) + "ft"))
        : "Winds aloft",
      callsign: o ? (o.callsign || o.flightNumber || "—") : "—",
      pilotName: (o && o.pilotName) ? o.pilotName : "",
      originIcao: o ? o.origin.icao : "– – – –",
      destIcao: o ? o.dest.icao : "– – – –",
      originRwy: o && o.origin.rwy ? o.origin.rwy : "",
      destRwy: o && o.dest.rwy ? o.dest.rwy : "",
      originGate: o && o.origin.gate ? ("GATE " + o.origin.gate) : (o && o.origin.rwy ? o.origin.rwy : "—"),
      distEteLine: o ? (fmtDistNm(o.distanceNm) + " · " + fmtHm(o.eteSec)) : "—",
      cruiseLine: o && o.cruise && o.cruise.altitude
        ? (fmtAltFt(o.cruise.altitude) + (o.cruise.mach ? " · M" + String(o.cruise.mach).replace(/^\./, ".") : ""))
        : "—",
      offBlocksZ: o && o.offBlocksSec ? secToClockZ(o.offBlocksSec) : "—",
      blockFuelDisp: o && o.fuel ? fmtWeightBare(o.fuel.rampKg) : "—",
      weightUnit: weightUnit(),
      // Passengers currently aboard (aircraft dataref, else OFP planned count).
      boardingLine: (function () {
        var n = paxAboard();
        return n == null ? "No pax data" : (n + " pax aboard");
      })(),
      ofpAgeLine: (function () {
        if (!o || !o.generatedUnix) return "—";
        var min = Math.round((Date.now() / 1000 - o.generatedUnix) / 60);
        if (min < 0 || min > 1440) return secToClockZ(
          (new Date(o.generatedUnix * 1000)).getUTCHours() * 3600 +
          (new Date(o.generatedUnix * 1000)).getUTCMinutes() * 60);
        return min + " min";
      })(),
      browserTabsLabel: State.browserTabs > 0 ? (State.browserTabs + " tab" + (State.browserTabs > 1 ? "s" : "")) : "",

      inApp: screen !== "apps",
      inXefb: inXefb, inNav: inNav,
      isDep: dep, isArr: !dep,
      showLock: State.locked || State.unlocking,
      wpArt: State.wp < 5, wpSel5: State.wp === 5,
      setGeneral: State.setSec !== "about", setAbout: State.setSec === "about"
    };
  }

  /* --- render --------------------------------------------------- */
  function render() {
    var d = derived();
    var root = document.documentElement;

    root.style.setProperty("--accent", ACCENT);
    root.style.setProperty("--wallpaper", WALLPAPERS[State.wp - 1]);

    // text bindings
    $all("[data-bind]").forEach(function (el) {
      var key = el.getAttribute("data-bind");
      if (d[key] != null) el.textContent = d[key];
    });
    var prog = $("[data-bind-width='checkProgress']");
    if (prog) prog.style.width = d.checkProgress + "%";

    // [data-show] blocks
    $all("[data-show]").forEach(function (el) {
      el.hidden = !d[el.getAttribute("data-show")];
    });

    // screens
    var screen = d.screen;
    $all("section[data-screen]").forEach(function (sec) {
      sec.hidden = sec.getAttribute("data-screen") !== screen;
    });

    // lock overlay animation direction
    var lock = document.getElementById("lockScreen");
    if (lock) lock.classList.toggle("is-leaving", State.unlocking);

    // apps screen leave animation
    var apps = document.getElementById("appsScreen");
    if (apps) apps.classList.toggle("is-leaving", State.leaving && cur() === "apps");

    // active nav tab underline
    $all(".nav-tab[data-tab]").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-tab") === screen);
    });

    // simple boolean toggles (switches) via [data-toggle="stateKey"]
    $all(".toggle-switch[data-toggle]").forEach(function (el) {
      el.classList.toggle("is-on", !!State[el.getAttribute("data-toggle")]);
    });

    // single-select groups
    setSelected(".wp-swatch[data-wp]", "data-wp", String(State.wp));
    setSelected(".pill[data-al]", "data-al", String(State.al));
    setSelected(".pill[data-hz]", "data-hz", String(State.drHz));
    setSelected(".range-btn[data-range]", "data-range", State.mapRange);
    setSelected(".pill[data-radar]", "data-radar", State.radar);
    setSelected(".wx-seg[data-wx]", "data-wx", State.wx);
    setSelected(".settings-nav__item[data-sec]", "data-sec", State.setSec);

    var mt = document.querySelector(".metar-text");
    if (mt) mt.classList.toggle("dim", !!d.wxNoData);

    // sim connection indicator in the header
    var pill = document.getElementById("simPill");
    if (pill) {
      var maj = State.sim.xplaneMajor;
      setText("simPillText", State.simConnected ? ("XP" + (maj || 12)) : "NO SIM");
      pill.classList.toggle("sim-pill--off", !State.simConnected);
    }

    // all data-driven content (route, checklists, ground, perf, …)
    renderData();

    // moving map: create lazily (host has no size while hidden), keep fed
    if (screen === "map") {
      initMap();
      if (window.EfbMap) window.EfbMap.resize();
      pushOwnshipToMap();
    }

    // keep the plugin's composited browser aligned with #browserViewport
    reportBrowserViewport();

    // entrance animation, only on real screen change
    if (screen !== lastScreen) {
      var sec = $("section[data-screen='" + screen + "']");
      if (sec) { sec.classList.remove("is-entering"); void sec.offsetWidth; sec.classList.add("is-entering"); }
      lastScreen = screen;
    }
    if (d.showLock && !lastShowLock && !State.unlocking && lock) {
      lock.style.animation = "none"; void lock.offsetWidth; lock.style.animation = "";
    }
    lastShowLock = d.showLock;

    applySim();
  }

  function setSelected(sel, attr, value) {
    $all(sel).forEach(function (el) {
      el.classList.toggle("is-selected", el.getAttribute(attr) === value);
      el.classList.toggle("is-active", el.getAttribute(attr) === value);
    });
  }

  /* --- render data-driven content ------------------------------ */
  var lastKeys = {};
  function once(name, key, fn) {   // run fn only when `key` changed since last render
    if (lastKeys[name] === key) return;
    lastKeys[name] = key; fn();
  }

  function renderData() {
    var r = activeRoute();                 // OFP or null
    var haveOfp = !!r;
    var connected = State.simConnected;

    // empty-state overlays
    var empties = { route: !haveOfp, airport: !haveOfp, perf: !haveOfp, sim: !connected };
    $all("[data-empty]").forEach(function (e) { e.hidden = !empties[e.getAttribute("data-empty")]; });

    // Simbrief screen status line
    var st = document.getElementById("ofpStatus");
    if (st) {
      st.textContent = ({ fetching: "Fetching OFP…", ok: "OFP imported",
        error: "Fetch failed — check the SimBrief pilot ID" })[State.ofpStatus] ||
        (haveOfp ? "OFP imported" : "No OFP fetched yet");
      st.className = "ofp-status ofp-status--" + (State.ofpStatus || "idle");
    }

    renderOverview(r);
    renderRoute(r);
    renderVertProfile(r);
    renderOfpDiff(r);
    renderChecklists();
    renderGround();
    renderPerf(r);
    renderLauncherWx(r);
    renderBrowser();

    // charts quick-buttons (origin / dest / alternate from the OFP)
    var cq = document.getElementById("chartQuick");
    if (cq) {
      var apts = r ? [r.origin.icao, r.dest.icao, r.alternate].filter(Boolean) : [];
      cq.innerHTML = apts.map(function (a) {
        return '<div class="pill" data-chart-icao="' + a + '">' + esc(a) + '</div>';
      }).join("");
    }
    var ci = document.getElementById("chartIcao");
    if (ci && !ci.value && r) ci.value = r.dest.icao;

    // greeting name: show only if the OFP carries a pilot name
    var greet = document.querySelector(".launcher__name");
    if (greet) {
      var nm = r && r.pilotName;
      greet.textContent = nm || "";
      greet.hidden = !nm;
    }
    // ground fuel-truck input unit label
    setText("fuelUnitLbl", State.s3 ? "kg" : "KLB");
  }

  function metarCat(m) {
    // very rough flight category from a METAR
    if (!m) return { cls: "dim", txt: "—" };
    if (/\bCAVOK\b|\bP6SM\b/.test(m)) return { cls: "ok", txt: "VFR" };
    var vis = /\b(\d{1,2})SM\b/.exec(m), bkn = /\b(BKN|OVC)(\d{3})\b/.exec(m);
    var vm = vis ? +vis[1] : 10, cig = bkn ? +bkn[2] * 100 : 9999;
    if (vm < 1 || cig < 500) return { cls: "danger", txt: "LIFR" };
    if (vm < 3 || cig < 1000) return { cls: "warn", txt: "IFR" };
    if (vm <= 5 || cig <= 3000) return { cls: "warn", txt: "MVFR" };
    return { cls: "ok", txt: "VFR" };
  }
  function renderLauncherWx(r) {
    var host = document.getElementById("launcherWx");
    var note = document.getElementById("launcherWxNote");
    if (!host) return;
    if (!r || !r.weather) {
      host.innerHTML = "";
      if (note) note.textContent = State.simWx && State.simWx.metar
        ? "Local: " + metarCat(State.simWx.metar).txt : "Import a flight plan for route weather";
      return;
    }
    var w = r.weather;
    var oc = metarCat(w.origMetar), dc = metarCat(w.destMetar);
    host.innerHTML =
      '<div class="soft-tile soft-tile--col"><div class="mono">' + esc(r.origin.icao) + '</div>' +
        '<div class="' + oc.cls + '">' + oc.txt + (metarWind(w.origMetar) ? ' · ' + metarWind(w.origMetar).replace(/ \/ /, "") + "KT" : "") + '</div></div>' +
      '<div class="soft-tile soft-tile--col"><div class="mono">' + esc(r.dest.icao) + '</div>' +
        '<div class="' + dc.cls + '">' + dc.txt + (metarWind(w.destMetar) ? ' · ' + metarWind(w.destMetar).replace(/ \/ /, "") + "KT" : "") + '</div></div>' +
      '<div class="soft-tile soft-tile--col"><div class="mono">' +
        (r.cruise && r.cruise.altitude ? (r.cruise.altitude >= 18000 ? "FL" + Math.round(r.cruise.altitude / 100) : Math.round(r.cruise.altitude) + "ft") : "CRZ") +
        '</div><div class="dim">' + (State.sim.windDirDeg != null
          ? pad3(State.sim.windDirDeg) + "/" + Math.round(State.sim.windKts || 0) : "—") + '</div></div>';
    if (note) note.textContent = "Updated " + fmtClockZulu(new Date(State.wxFetchedAt || Date.now())) + "Z";
  }

  function ofpAgeText(o) {
    if (!o || !o.generatedUnix) return "Simbrief";
    var min = Math.round((Date.now() / 1000 - o.generatedUnix) / 60);
    if (min < 0 || min > 1440) return "Simbrief · " + secToClockZ(
      (new Date(o.generatedUnix * 1000)).getUTCHours() * 3600 +
      (new Date(o.generatedUnix * 1000)).getUTCMinutes() * 60);
    return "Simbrief · " + (min < 1 ? "just now" : min + " min ago");
  }

  // Flight overview ("home") screen — fully OFP-driven; the empty state
  // (data-empty="route") covers it when no plan is loaded.
  function renderOverview(r) {
    setText("ovActiveFlight", r
      ? ("ACTIVE FLIGHT · " + (r.callsign || r.flightNumber || "—"))
      : "NO ACTIVE FLIGHT");
    if (!r) {
      ["ovOrigin", "ovDest"].forEach(function (id) { setText(id, "– – – –"); });
      ["ovOriginName", "ovDestName", "ovLeg", "ovCrz", "ovBlockFuel", "ovZfw", "ovPax", "ovCi"]
        .forEach(function (id) { setText(id, "—"); });
      setText("ovBlockFuelU", ""); setText("ovZfwU", "");
      setText("qaOfpAge", "Simbrief"); setText("qaLegs", "Route");
      return;
    }
    setText("ovOrigin", r.origin.icao || "– – – –");
    setText("ovDest", r.dest.icao || "– – – –");
    setText("ovOriginName", r.origin.name || (r.origin.rwy ? "RWY " + r.origin.rwy : ""));
    setText("ovDestName", r.dest.name || (r.dest.rwy ? "RWY " + r.dest.rwy : ""));
    setText("ovLeg", fmtDistNm(r.distanceNm) + " · " + fmtHm(r.eteSec));
    setText("ovCrz", r.cruise && r.cruise.altitude
      ? (fmtAltFt(r.cruise.altitude) + (r.cruise.mach ? " · M" + String(r.cruise.mach).replace(/^\./, ".") : ""))
      : "—");

    var f = r.fuel || {}, w = r.weights || {};
    setText("ovBlockFuel", f.rampKg ? fmtWeightBare(f.rampKg) : "—");
    setText("ovBlockFuelU", f.rampKg ? weightUnit() : "");
    setText("ovZfw", w.zfwKg ? fmtWeightBare(w.zfwKg) : "—");
    setText("ovZfwU", w.zfwKg ? weightUnit() : "");
    var pax = paxAboard();
    setText("ovPax", pax != null ? String(pax) : "—");
    setText("ovCi", r.costIndex != null ? String(r.costIndex) : "—");

    setText("qaOfpAge", ofpAgeText(r));
    setText("qaLegs", r.legs ? (r.legs.length + " legs ready") : "Route");
    setText("qaPb", State.sim.parkBrake === "SET" ? "Park brake set"
      : (State.gsvc.chocks ? "Chocks in place" : "BetterPushback"));
    setText("qaWx", State.simWx && State.simWx.metar ? "Live METAR available"
      : (State.simConnected ? "X-Plane weather" : "XP12 · live METAR"));

    // weather-at-a-glance tiles
    var wx = r.weather || {};
    ovWxTile("ovWxDep", r.origin.icao, wx.origMetar);
    ovWxTile("ovWxArr", r.dest.icao, wx.destMetar);
    ovWxTile("ovWxAltn", r.alternate || "ALTN", wx.altnMetar);

    // route preview — real polyline from the leg lat/lons
    var host = document.getElementById("ovRoutePreview");
    if (host) {
      var key = (r.fullRouteString || "") + "|ovprev";
      once("ovRoutePreview", key, function () {
        var pts = (r.legs || []).filter(function (l) { return isFinite(l.lat) && isFinite(l.lon); });
        if (pts.length < 2) { host.innerHTML = '<div class="hatch__note">Route preview unavailable</div>'; return; }
        var lats = pts.map(function (p) { return p.lat; }), lons = pts.map(function (p) { return p.lon; });
        var minLa = Math.min.apply(null, lats), maxLa = Math.max.apply(null, lats);
        var minLo = Math.min.apply(null, lons), maxLo = Math.max.apply(null, lons);
        var W = 700, H = 260, pad = 22;
        var sx = (maxLo - minLo) || 1, sy = (maxLa - minLa) || 1;
        function X(lo) { return pad + (lo - minLo) / sx * (W - 2 * pad); }
        function Y(la) { return H - pad - (la - minLa) / sy * (H - 2 * pad); }
        var poly = pts.map(function (p) { return X(p.lon).toFixed(1) + "," + Y(p.lat).toFixed(1); }).join(" ");
        var a = pts[0], b = pts[pts.length - 1];
        host.innerHTML =
          '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="fill-abs">' +
          '<polyline points="' + poly + '" fill="none" stroke="#4f9cf5" stroke-width="2.5"></polyline>' +
          '<circle cx="' + X(a.lon).toFixed(1) + '" cy="' + Y(a.lat).toFixed(1) + '" r="7" fill="#4fd196"></circle>' +
          '<circle cx="' + X(b.lon).toFixed(1) + '" cy="' + Y(b.lat).toFixed(1) + '" r="7" fill="#f0b45c"></circle>' +
          '</svg>' +
          '<div class="hatch__note">' + esc(r.origin.icao) + ' → ' + esc(r.dest.icao) + '</div>';
      });
    }
  }
  function ovWxTile(id, icao, metar) {
    var el = document.getElementById(id);
    if (!el) return;
    var cat = metarCat(metar);
    var tagCls = { ok: "tag--ok", warn: "tag--warn", danger: "tag--danger", dim: "dim" }[cat.cls] || "dim";
    el.innerHTML =
      '<div class="row-between"><span class="mono">' + esc(icao || "—") + '</span>' +
      '<span class="tag ' + tagCls + '">' + esc(cat.txt) + '</span></div>' +
      '<div class="mono-sm dim mt8">' + esc(metar ? metar.replace(/^\S+\s+\d{6}Z\s+/, "") : "—") + '</div>';
  }

  function renderRoute(r) {
    var rst = document.getElementById("routeStringText");
    if (rst) {
      if (r) { rst.textContent = r.fullRouteString || r.routeString || ""; rst.classList.remove("dim"); }
      else { rst.textContent = "No route — file a plan in the FMS or import a SimBrief OFP"; rst.classList.add("dim"); }
    }
    setText("routeSummary", r
      ? (fmtDistNm(r.distanceNm) + " · " + fmtHm(r.eteSec) +
         (r.fuel && r.fuel.burnKg ? " · " + fmtWeightKg(r.fuel.burnKg) + " burn" : ""))
      : "");
    setText("wxSegDep", r ? (r.origin.icao + " · DEP") : "LOCAL");
    setText("wxSegArr", r ? (r.dest.icao + " · ARR") : "ALONG ROUTE");

    var body = document.getElementById("wpBody");
    if (!body) return;
    var key = r ? ((r.fullRouteString || "") + "|" + r.legs.length + "|" + State.s3) : "none";
    once("wpTable", key, function () {
      if (!r || !r.legs) { body.innerHTML = ""; return; }
      body.innerHTML = r.legs.map(function (l, i) {
        var last = i === r.legs.length - 1;
        var rwy = i === 0 ? r.origin.rwy : (last ? r.dest.rwy : "");
        var name = l.ident + (l.kind === "airport" && rwy ? " " + rwy : "");
        var identCls = i === 0 ? "accent" : (last ? "warn" : "");
        return '<div class="wp-row' + (i === 0 ? " wp-row--active" : "") + '">' +
          '<div class="' + identCls + '">' + esc(name) + '</div>' +
          '<div class="dim">' + esc(l.via || "—") + '</div>' +
          '<div>' + (l.altFt ? fmtAltFt(l.altFt) : "—") + '</div>' +
          '<div>' + (l.spd ? esc(String(l.spd)) : "—") + '</div>' +
          '<div>' + (l.distNm ? fmtDistNm(l.distNm) : "—") + '</div>' +
          '<div>' + (l.eteSec ? fmtHm(l.eteSec) : "—") + '</div></div>';
      }).join("");
    });
  }

  function renderVertProfile(r) {
    var host = document.getElementById("vertProfile");
    if (!host) return;
    if (!r || !r.legs || r.legs.length < 2) { host.innerHTML = ""; return; }
    var key = (r.fullRouteString || "") + "|vp";
    once("vertProfile", key, function () {
      var legs = r.legs;
      var cum = 0, pts = legs.map(function (l) {
        cum += (l.distNm || 0);
        return { x: cum, y: l.altFt || 0 };
      });
      var totX = cum || 1;
      var maxY = Math.max.apply(null, pts.map(function (p) { return p.y; })) || 1;
      var W = 380, H = 200, padB = 14;
      var poly = pts.map(function (p) {
        return (p.x / totX * (W - 20) + 10).toFixed(1) + "," +
               (H - padB - p.y / maxY * (H - padB - 12)).toFixed(1);
      }).join(" ");
      var crzY = H - padB - (r.cruise && r.cruise.altitude ? r.cruise.altitude : maxY) / maxY * (H - padB - 12);
      host.innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="fill-abs">' +
          '<line x1="0" y1="' + crzY.toFixed(1) + '" x2="' + W + '" y2="' + crzY.toFixed(1) +
            '" stroke="rgba(255,255,255,.12)" stroke-width="1" stroke-dasharray="4 5"></line>' +
          '<polyline points="' + poly + '" fill="none" stroke="#4f9cf5" stroke-width="2.5"></polyline>' +
          pts.map(function (p) {
            return '<circle cx="' + (p.x / totX * (W - 20) + 10).toFixed(1) + '" cy="' +
              (H - padB - p.y / maxY * (H - padB - 12)).toFixed(1) + '" r="2" fill="#8b95a5"></circle>';
          }).join("") +
        '</svg>' +
        '<div class="abs-tl mono-sm dim">' + (r.cruise && r.cruise.altitude ? fmtAltFt(r.cruise.altitude) : "") + ' CRZ</div>' +
        '<div class="abs-br mono-sm faint">' + fmtDistNm(totX) + '</div>';
    });
  }

  function renderOfpDiff(r) {
    // tab switch (diff / full OFP)
    var showFull = State.briefTab === "full";
    var dEl = document.getElementById("ofpDiff"), fEl = document.getElementById("ofpFull");
    if (dEl) dEl.hidden = showFull;
    if (fEl) {
      fEl.hidden = !showFull;
      if (showFull) fEl.innerHTML = r && r.textOfp
        ? r.textOfp
        : '<div class="dim center" style="padding:40px">Fetch an OFP to view the full briefing</div>';
    }
    setText("briefHead", showFull ? "Full OFP" : "Changes to apply");
    var td = document.getElementById("briefTabDiff"), tf = document.getElementById("briefTabFull");
    if (td) td.classList.toggle("is-selected", !showFull);
    if (tf) tf.classList.toggle("is-selected", showFull);

    var diff = document.getElementById("ofpDiff");
    if (!diff) return;
    if (!r || !r.fuel) {
      diff.innerHTML = '<div class="diff-row"><span class="dot dot--blue"></span>' +
        '<span class="grow sm14">Fetch an OFP to see the import diff</span></div>';
      return;
    }
    var rows = [
      ["#4f9cf5", "Route", r.routeString],
      ["#4f9cf5", "Block fuel", fmtWeightKg(r.fuel.rampKg)],
      ["#4f9cf5", "Payload", (r.weights.pax || 0) + " pax · " + fmtWeightKg(r.weights.payloadKg)],
      ["#f0b45c", "Cruise level", r.cruise.altitude ? fmtAltFt(r.cruise.altitude) : "—"],
      ["#4f9cf5", "Alternate", r.alternate || "—"],
      ["#4fd196", "Generated", r.generatedUnix ? secToClockZ(
        (new Date(r.generatedUnix * 1000)).getUTCHours() * 3600 +
        (new Date(r.generatedUnix * 1000)).getUTCMinutes() * 60) : "—"]
    ];
    diff.innerHTML = rows.map(function (x) {
      return '<div class="diff-row"><span class="dot" style="background:' + x[0] + '"></span>' +
        '<span class="grow sm14">' + esc(x[1]) + '</span>' +
        '<span class="mono-sm dim">' + esc(x[2]) + '</span></div>';
    }).join("");
  }

  function renderChecklists() {
    var side = document.getElementById("phaseList");
    var host = document.getElementById("checkList");
    if (!side || !host) return;
    var phases = checkPhases();
    var curId = currentPhaseId();

    side.innerHTML = phases.map(function (p) {
      var arr = checkArray(p.id);
      var done = arr.filter(Boolean).length;
      var cls = done === arr.length && arr.length ? "ok" : (done ? "warn" : "muted");
      return '<div class="phase-row' + (p.id === curId ? " is-active" : "") + '" data-phase-id="' + p.id + '">' +
        '<span class="phase-row__n">' + esc(p.title) + '</span><span class="grow"></span>' +
        '<span class="mono-sm ' + cls + '">' + done + '/' + arr.length + '</span></div>';
    }).join("");

    var items = phaseItems(curId), arr = checkArray(curId);
    host.innerHTML = items.map(function (it, i) {
      return '<div class="check-item" data-check-item="' + i + '">' +
        '<span class="check-box' + (arr[i] ? " is-checked" : "") + '"></span>' +
        '<span class="grow check-item__t">' + esc(it.label) + '</span>' +
        '<span class="mono-sm dim">' + esc(it.callout) + '</span></div>';
    }).join("");
  }

  function renderGround() {
    var host = document.getElementById("gsvcList");
    if (host) {
      host.innerHTML = GSVC.map(function (s) {
        return '<div class="gs-row" data-gsvc="' + s.id + '">' +
          '<div class="grow"><div class="gs-row__t">' + esc(s.label) + '</div>' +
          (s.sub ? '<div class="gs-row__s">' + esc(s.sub) + '</div>' : '') + '</div>' +
          '<span class="toggle-switch' + (State.gsvc[s.id] ? " is-on" : "") + '"><i></i></span></div>';
      }).join("");
    }
    var pb = document.getElementById("pbState");
    if (pb) pb.textContent = ({ idle: "Idle", plan: "Planning route",
      connect: "Tug connecting", start: "Pushing back", disconnect: "Tug disconnecting" })[State.pushback.state] || "Idle";
    var ft = document.getElementById("fuelTruckState");
    if (ft) ft.textContent = State.gsvc.fueltruck ? "Fuelling" : "Idle";
  }

  function renderPerf(r) {
    if (!r || !r.weights) return;
    var w = r.weights, f = r.fuel || {};
    var maxPax = w.pax ? Math.ceil(w.pax / 0.9) : 189;   // rough capacity
    var rows = [
      ["Passengers", (w.pax || 0) + " / " + maxPax, w.pax ? (w.pax / maxPax) : 0, "var(--accent)"],
      ["Cargo", fmtWeightKg(w.cargoKg), w.cargoKg ? Math.min(1, w.cargoKg / 8000) : 0, "#4fd196"],
      ["Fuel", fmtWeightKg(f.rampKg), f.rampKg ? Math.min(1, f.rampKg / 20000) : 0, "#f0b45c"]
    ];
    var host = document.getElementById("perfLoading");
    if (host) host.innerHTML = rows.map(function (x) {
      return '<div class="bar-item"><div class="row-between sm12 dim"><span>' + esc(x[0]) +
        '</span><span class="mono light">' + esc(x[1]) + '</span></div>' +
        '<div class="bar"><div class="bar__fill" style="width:' + Math.round(x[2] * 100) +
        '%;background:' + x[3] + '"></div></div></div>';
    }).join("");

    setText("perfTow", fmtWeightBare(w.towKg));
    setText("perfMtow", "/ " + fmtWeightBare(w.mtowKg) + weightUnit());
    setText("perfZfw", fmtWeightKg(w.zfwKg));
    setText("perfLdw", fmtWeightKg(w.ldwKg));

    // rough takeoff V-speeds from TOW (very approximate; a real calc belongs
    // in the plugin / an AFM table). Flag them as estimates.
    var tow = w.towKg || 70000;
    var vr = Math.round(108 + (tow - 55000) / 1000 * 0.9);
    setText("perfV1", String(vr - 3));
    setText("perfVr", String(vr));
    setText("perfV2", String(vr + 6));
  }

  function setText(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* --- live sim data ------------------------------------------- */
  var SIM_FMT = {
    altitudeFt: function (v) { return Math.round(v).toLocaleString("en-US"); },
    headingDeg: function (v) { return pad3(v) + "°"; },
    groundSpeedKts: function (v) { return String(Math.round(v)); },
    fuelKg: function (v) { return Math.round(v) + " kg"; },
    oatC: function (v) { return (v > 0 ? "+" : "") + Math.round(v) + "°"; },
    latitude: function (v) { return v.toFixed(4) + "°"; },
    longitude: function (v) { return v.toFixed(4) + "°"; },
    battVolts: function (v) { return v.toFixed(1); }
  };
  function simValue(f) {
    var s = State.sim;
    if (f === "wind") {
      if (s.windDirDeg == null && s.windKts == null) return null;
      return pad3(s.windDirDeg || 0) + "/" + Math.round(s.windKts || 0);
    }
    return s[f];
  }
  function applySim() {
    $all("[data-sim]").forEach(function (el) {
      var f = el.getAttribute("data-sim");
      var v = simValue(f);
      if (v == null) return;
      el.textContent = SIM_FMT[f] ? SIM_FMT[f](v) : String(v);
    });
  }

  /* --- scale-to-fit ------------------------------------------- */
  function fitScale() {
    var s = Math.min(window.innerWidth / 1360, window.innerHeight / 850);
    document.documentElement.style.setProperty("--efb-scale", s || 1);
    reportBrowserViewport();   // scale change moves the viewport rect
  }

  /* --- boot -------------------------------------------------- */
  function boot() {
    // backdrop-filter feature detect
    var supports = window.CSS && CSS.supports &&
      (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)"));
    if (!supports) document.documentElement.classList.add("no-backdrop");

    fitScale();
    window.addEventListener("resize", fitScale);

    // delegated click / keyboard activation
    document.addEventListener("click", function (e) {
      // dynamic data-index elements (rebuilt each render)
      var ci = e.target.closest("[data-check-item]");
      if (ci) { toggleCheck(+ci.getAttribute("data-check-item")); return; }
      var pp = e.target.closest("[data-phase-id]");
      if (pp) { gotoPhase(pp.getAttribute("data-phase-id")); return; }
      var gs = e.target.closest("[data-gsvc]");
      if (gs) { toggleGsvc(gs.getAttribute("data-gsvc")); return; }
      var bx = e.target.closest("[data-browser-close]");
      if (bx) { e.stopPropagation(); browserCloseTab(+bx.getAttribute("data-browser-close")); return; }
      var bt = e.target.closest("[data-browser-tab]");
      if (bt) { browserActivateTab(+bt.getAttribute("data-browser-tab")); return; }
      var qi = e.target.closest("[data-chart-icao]");
      if (qi) { openChartsAirport(qi.getAttribute("data-chart-icao")); return; }

      var t = e.target.closest("[data-action]");
      if (!t) return;
      var fn = handlers[t.getAttribute("data-action")];
      if (fn) { e.preventDefault(); fn(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var id = e.target && e.target.id;
        if (id === "browserUrl") { e.preventDefault(); handlers.browserGo(); return; }
        if (id === "simbriefId") { e.preventDefault(); fetchOfp(); return; }
        if (id === "chartIcao") { e.preventDefault(); openChartsAirport(); return; }
        if (id === "fuelTarget") { e.preventDefault(); handlers.fuelTruckApply(); return; }
      }
      if (e.key !== "Enter" && e.key !== " ") return;
      var t = e.target.closest && e.target.closest("[data-action][role='button']");
      if (!t) return;
      var fn = handlers[t.getAttribute("data-action")];
      if (fn) { e.preventDefault(); fn(); }
    });

    // activity tracking for idle auto-lock
    ["pointerdown", "keydown"].forEach(function (ev) {
      window.addEventListener(ev, function () { lastAct = Date.now(); }, true);
    });

    // 1s tick: clock + idle auto-lock + 10-min weather refresh
    setInterval(function () {
      State.now = new Date();
      var mins = [1, 5, 0][State.al - 1];
      if (mins > 0 && !State.locked && Date.now() - lastAct > mins * 60000) {
        State.locked = true; State.unlocking = false;
      }
      if (State.ofp && State.simbriefId && Date.now() - State.wxFetchedAt > 600000) {
        State.wxFetchedAt = Date.now();           // debounce
        fetchOfp(true);                            // quiet re-pull (refreshes METARs)
      }
      render();
    }, 1000);

    render();
  }

  /* --- native entry point ----------------------------------- */
  // onSimState accepts a JSON string OR an object, in either the flat shape
  // the plugin emits (UltralightHost::toJson: latitude/longitude/altitudeFt/
  // headingDeg/groundSpeedKts/fuelKg/windDirDeg/windKts/oatC) or a nested
  // { position:{lat,lon,heading,...}, route:<OFP|null>, weather:<wx|null> }
  // shape (handy for driving the UI from the browser console — see
  // resources/ui/mock-states.json).
  function toNum(v) { var n = parseFloat(v); return isFinite(n) ? n : undefined; }
  function pick() {
    for (var i = 0; i < arguments.length; i++) if (arguments[i] !== undefined) return arguments[i];
    return undefined;
  }

  function ingestSimState(payload) {
    var d = payload;
    if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return; } }
    if (!d || typeof d !== "object") return;

    var p = d.position || {};
    var m = {
      latitude:       pick(toNum(p.lat), toNum(p.latitude), toNum(d.latitude), toNum(d.lat)),
      longitude:      pick(toNum(p.lon), toNum(p.lng), toNum(p.longitude), toNum(d.longitude), toNum(d.lon)),
      altitudeFt:     pick(toNum(p.altitudeFt), toNum(p.altFt), toNum(d.altitudeFt)),
      headingDeg:     pick(toNum(p.heading), toNum(p.headingDeg), toNum(p.track), toNum(d.headingDeg)),
      groundSpeedKts: pick(toNum(p.gsKts), toNum(p.groundSpeedKts), toNum(d.groundSpeedKts)),
      fuelKg:         pick(toNum(d.fuelKg), toNum(d.fuel)),
      xplaneMajor:    pick(toNum(d.xplaneMajor)),
      // real UTC offset (seconds) where the aircraft is — X-Plane local−zulu
      tzOffsetSec:    pick(toNum(d.localOffsetSec), toNum(d.tzOffsetSec)),
      // passengers aboard, straight from the aircraft (−1 / absent = unknown)
      paxCount:       pick(toNum(d.paxCount), toNum(p.paxCount))
    };
    var wx = d.weather;
    if (wx && typeof wx === "object") {
      m.windDirDeg = pick(toNum(wx.windDirDeg), toNum(wx.dir), toNum(d.windDirDeg));
      m.windKts    = pick(toNum(wx.windKts), toNum(wx.speed), toNum(d.windKts));
      m.oatC       = pick(toNum(wx.oatC), toNum(wx.temp), toNum(d.oatC));
      if (wx.metar) State.simWx = wx;   // {metar, taf, station, ...}
    } else {
      m.windDirDeg = pick(toNum(d.windDirDeg));
      m.windKts    = pick(toNum(d.windKts));
      m.oatC       = pick(toNum(d.oatC));
      if (d.weather === null) State.simWx = null;
    }
    for (var k in m) if (m[k] !== undefined) State.sim[k] = m[k];

    // passthrough string/status fields (aircraft, simulator, ground state)
    ["aircraft", "simulatorName", "simVersionStr", "apuState", "doorsState",
     "parkBrake", "battVolts"].forEach(function (f) {
      if (d[f] != null) State.sim[f] = d[f];
    });

    var wasConnected = State.simConnected;
    var prevAircraft = State.simAircraft;
    State.simConnected = true;
    State.simAircraft = State.sim.aircraft;

    // route on a state push: object = apply, null = clear, absent = leave as-is
    if ("route" in d) {
      if (d.route && typeof d.route === "object") {
        try { applyOfp(d.route.legs ? d.route : window.EfbOfp.parse(d.route)); } catch (e) {}
      } else if (d.route === null) {
        State.ofp = null; State.ofpStatus = ""; lastKeys = {};
        if (window.EfbMap) window.EfbMap.setRoute(null);
      }
    }
    return !wasConnected || prevAircraft !== State.simAircraft ||
           ("weather" in d) || ("route" in d);
  }

  window.__xefb = window.__xefb || {};
  window.__xefb.onSimState = function (state) {
    var structural = ingestSimState(state);
    applySim();
    pushOwnshipToMap();
    if (structural) render();
  };
  // Plugin reports the browser window's live tab count.
  window.__xefb.onBrowserTabs = function (n) {
    State.browserTabs = +n || 0; render();
  };
  // Plugin reports full browser state: { activeId, tabs:[{id,title,url,canBack,canFwd}] }
  window.__xefb.onBrowserState = function (s) {
    State.browser = (typeof s === "string") ? JSON.parse(s) : s;
    State.browserTabs = (State.browser.tabs || []).length;
    renderBrowser();
    render();
  };
  function normalizeUrl(u) {
    if (/^https?:\/\//i.test(u)) return u;
    if (/^[\w-]+(\.[\w-]+)+/.test(u)) return "https://" + u;
    return "https://duckduckgo.com/?q=" + encodeURIComponent(u);
  }
  function renderBrowser() {
    var b = State.browser || { tabs: [], activeId: 0 };
    var host = document.getElementById("browserTabs");
    if (host) {
      var sig = b.activeId + "|" + (b.tabs || []).map(function (t) {
        return t.id + ":" + (t.title || t.url || "");
      }).join("~");
      once("browserTabs", sig, function () {
        host.innerHTML = (b.tabs || []).map(function (t) {
          return '<div class="browser__tab' + (t.id === b.activeId ? " is-active" : "") +
            '" data-browser-tab="' + t.id + '"><span class="grow">' +
            esc((t.title || t.url || "New tab").slice(0, 28)) + '</span>' +
            '<span class="browser__tabx" data-browser-close="' + t.id + '">×</span></div>';
        }).join("") + '<div class="browser__tab browser__tab--new" data-action="browserHome">+</div>';
      });
    }
    var active = (b.tabs || []).filter(function (t) { return t.id === b.activeId; })[0];
    var url = document.getElementById("browserUrl");
    if (url && document.activeElement !== url) url.value = active ? active.url : "";
    var back = document.getElementById("browserBackBtn"), fwd = document.getElementById("browserFwdBtn");
    if (back) back.classList.toggle("is-disabled", !active || !active.canBack);
    if (fwd) fwd.classList.toggle("is-disabled", !active || !active.canFwd);

    var empty = document.getElementById("browserHint");
    if (empty) empty.hidden = (b.tabs || []).length > 0;

    // With the plugin, the native browser is composited over #browserViewport.
    // Without it (plain-browser dev), render the page in an <iframe> here.
    if (!pluginPresent()) {
      var vp = document.getElementById("browserViewport");
      var wrap = vp && vp.querySelector(".browser__frame");
      if (!active) { if (wrap) wrap.remove(); }
      else {
        once("browserFrame", active.id + "|" + active.url, function () {
          if (wrap) wrap.remove();
          var w = document.createElement("div");
          w.className = "browser__frame";
          w.innerHTML =
            '<iframe src="' + esc(active.url) + '" referrerpolicy="no-referrer" ' +
            'sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>' +
            '<a class="browser__ext" href="' + esc(active.url) + '" target="_blank" rel="noopener">' +
            'blank? this site blocks embedding — open ↗</a>';
          vp.appendChild(w);
        });
      }
    }
    reportBrowserViewport();
  }

  // Tell the plugin the on-screen rect of #browserViewport, in EFB-view pixels
  // (0..1360 / 0..850, origin top-left), so it can paint the browser there.
  var lastVpKey = "";
  function reportBrowserViewport() {
    var active = cur() === "browser";
    var vp = document.getElementById("browserViewport");
    var efb = document.querySelector(".efb");
    if (!vp || !efb) return;
    var scale = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--efb-scale")) || 1;
    var er = efb.getBoundingClientRect(), vr = vp.getBoundingClientRect();
    var x = Math.round((vr.left - er.left) / scale);
    var y = Math.round((vr.top - er.top) / scale);
    var w = Math.round(vr.width / scale);
    var h = Math.round(vr.height / scale);
    var key = active + "|" + x + "|" + y + "|" + w + "|" + h;
    if (key === lastVpKey) return;
    lastVpKey = key;
    nativeInvoke("browserViewport", { x: x, y: y, w: w, h: h, active: active });
  }
  // Plugin can push the pilot name / SimBrief id once a Navigraph account
  // is linked (see docs/navigraph-integration.md).
  window.__xefb.onAccount = function (acc) {
    if (acc && acc.simbriefId) { State.simbriefId = String(acc.simbriefId);
      var inp = document.getElementById("simbriefId"); if (inp) inp.value = State.simbriefId; }
    render();
  };
  // Plugin delivers a RAW SimBrief payload here (string or object) after a
  // native fetchOfp. Always run it through EfbOfp.parse.
  window.__xefb.onOfp = function (raw) {
    try { applyOfp(window.EfbOfp.parse(raw)); }
    catch (e) {
      if (window.console) console.warn("[xefb] onOfp parse failed:", e);
      State.ofpStatus = "error"; render();
    }
  };
  // Plugin reports a native fetch failure.
  window.__xefb.onOfpError = function (msg) {
    if (window.console) console.warn("[xefb] native OFP fetch error:", msg);
    State.ofpStatus = "error"; render();
  };

  /* --- dev helpers (browser testing without a plugin) --------- */
  window.EfbDev = {
    // window.EfbDev.mock('enroute_route_loaded')
    mock: function (name) {
      return fetch("mock-states.json?_=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (all) {
        var keys = Object.keys(all).filter(function (k) { return k[0] !== "_"; });
        if (!name) { if (window.console) console.log("mock states:", keys); return keys; }
        if (!all[name]) throw new Error("unknown mock '" + name + "' — try " + keys.join(", "));
        window.__xefb.onSimState(all[name]);
        return name;
      });
    },
    // window.EfbDev.reset() — back to a fresh "just loaded" state
    reset: function () {
      State.sim = {}; State.simConnected = false; State.simWx = null;
      State.ofp = null; State.ofpStatus = ""; lastKeys = {};
      if (window.EfbMap) window.EfbMap.setRoute(null);
      render();
    },
    unlock: function () { State.locked = false; State.unlocking = false; render(); },
    demoRoute: function () { applyOfp(DEMO_ROUTE); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
