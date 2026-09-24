/* ===================================================================
   xEFB — SimBrief OFP (flight plan) fetch + parse.

   The actual HTTPS request goes through the plugin
   (window.__xefb.invoke('fetchOfp', {userid|username})), because the
   sandboxed web view can't reach simbrief.com cross-origin. The plugin
   calls back window.__xefb.onOfp(rawJsonString). For dev in a plain
   browser, fetchDirect() is also offered (works only if CORS allows).

   EfbOfp.parse(raw) -> normalized plan object consumed by app.js:
     { callsign, flightNumber, origin, dest, alternate, routeString,
       fullRouteString, cruise, costIndex, distanceNm, eteSec,
       legs:[{ident,name,kind,lat,lon,via,altFt,distNm,eteSec,spd,stage}],
       fuel:{...kg}, weights:{...kg}, weather:{...}, generatedUnix }
   =================================================================== */
(function () {
  "use strict";

  var LB_TO_KG = 0.45359237;

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function str(v) { return v == null ? "" : String(v); }
  function firstIcao(v) {
    if (!v) return "";
    if (Array.isArray(v)) return v.length ? str(v[0].icao_code || v[0]) : "";
    return str(v.icao_code || v);
  }

  function apt(o) {
    o = o || {};
    return {
      icao: str(o.icao_code), name: str(o.name), rwy: str(o.plan_rwy),
      gate: str(o.gate || o.gate_out || o.gate_in || ""),
      lat: num(o.pos_lat), lon: num(o.pos_long), elev: num(o.elevation)
    };
  }
  // SimBrief times are unix seconds; convert to seconds-since-UTC-midnight.
  function secOfDay(unix) {
    var n = num(unix); if (!n) return 0;
    return ((n % 86400) + 86400) % 86400;
  }

  function legKind(type) {
    switch (str(type).toLowerCase()) {
      case "apt": return "airport";
      case "vor": return "vor";
      case "ndb": return "ndb";
      case "wpt": default: return "wpt";
    }
  }

  function parse(raw) {
    var d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!d || !d.general) throw new Error("not a SimBrief OFP payload");

    var g = d.general, p = d.params || {};
    var toKg = str(p.units).toLowerCase().indexOf("kg") === 0 ? 1 : LB_TO_KG;
    var w = d.weights || {}, f = d.fuel || {}, wx = d.weather || {};

    var fixes = (d.navlog && d.navlog.fix) || [];
    if (!Array.isArray(fixes)) fixes = [fixes];
    var legs = fixes
      .filter(function (x) { return x && x.pos_lat != null; })
      .map(function (x) {
        return {
          ident: str(x.ident), name: str(x.name), kind: legKind(x.type),
          lat: num(x.pos_lat), lon: num(x.pos_long),
          via: str(x.via_airway) === "DCT" ? "" : str(x.via_airway),
          altFt: num(x.altitude_feet), distNm: num(x.distance),
          eteSec: num(x.time_leg), spd: str(x.groundspeed || x.mach),
          stage: str(x.stage)
        };
      });

    var origin = apt(d.origin), dest = apt(d.destination);
    // ensure the polyline starts/ends at the airports
    if (legs.length && legs[0].ident !== origin.icao && origin.lat) {
      legs.unshift({ ident: origin.icao, name: origin.name, kind: "airport",
        lat: origin.lat, lon: origin.lon, via: "", altFt: origin.elev,
        distNm: 0, eteSec: 0, spd: "", stage: "" });
    }
    if (legs.length && legs[legs.length - 1].ident !== dest.icao && dest.lat) {
      legs.push({ ident: dest.icao, name: dest.name, kind: "airport",
        lat: dest.lat, lon: dest.lon, via: "", altFt: dest.elev,
        distNm: 0, eteSec: 0, spd: "", stage: "" });
    }

    var routeString = str(g.route);
    var times = d.times || {};

    // Enroute time: SimBrief exposes this as times.est_time_enroute (seconds),
    // NOT general.ete (which doesn't exist — that was the "block time 0:00" bug).
    var eteSec = num(times.est_time_enroute) || num(times.sched_time_enroute) ||
                 num(g.ete) || num(g.time_enroute);
    // Block time = taxi out + enroute + taxi in (gate to gate).
    var blockSec = eteSec + num(times.taxi_out) + num(times.taxi_in);

    // Departure/arrival station UTC offsets, in hours (may be fractional, e.g.
    // 5.5 for IST). SimBrief provides these directly — coordinate-derived
    // offsets can't represent half-hour zones.
    var origTz = parseFloat(times.orig_timezone);
    var destTz = parseFloat(times.dest_timezone);

    return {
      callsign: str((d.atc && d.atc.callsign) || (g.icao_airline + g.flight_number)),
      flightNumber: str(g.flight_number),
      airline: str(g.icao_airline || g.iata_airline),
      // SimBrief OFP carries no real pilot name; leave empty (greeting hides it)
      pilotName: "",
      pilotId: str((d.fetch && d.fetch.userid) || (d.params && d.params.user_id) || ""),
      offBlocksSec: secOfDay(times.est_out || times.sched_out),
      onBlocksSec: secOfDay(times.est_in || times.sched_in),
      origin: origin, dest: dest, alternate: firstIcao(d.alternate),
      origTzHours: isFinite(origTz) ? origTz : null,
      destTzHours: isFinite(destTz) ? destTz : null,
      routeString: routeString,
      fullRouteString: (origin.icao + (origin.rwy ? "/" + origin.rwy : "") + " " +
        routeString + " " + dest.icao + (dest.rwy ? "/" + dest.rwy : "")).trim(),
      cruise: { altitude: num(g.initial_altitude), mach: str(g.cruise_mach) },
      costIndex: num(g.costindex),
      distanceNm: num(g.route_distance || g.air_distance),
      eteSec: eteSec,
      blockSec: blockSec,
      legs: legs,
      fuel: {
        rampKg: num(f.plan_ramp) * toKg,
        takeoffKg: num(f.plan_takeoff) * toKg,
        burnKg: num(f.enroute_burn) * toKg,
        reserveKg: num(f.reserve) * toKg,
        landingKg: num(f.plan_landing) * toKg
      },
      weights: {
        zfwKg: num(w.est_zfw) * toKg,
        towKg: num(w.est_tow) * toKg,
        ldwKg: num(w.est_ldw) * toKg,
        mtowKg: num(w.max_tow) * toKg,
        pax: num(w.pax_count),
        payloadKg: num(w.payload) * toKg,
        cargoKg: num(w.cargo) * toKg
      },
      weather: {
        origMetar: str(wx.orig_metar), destMetar: str(wx.dest_metar),
        altnMetar: str(wx.altn_metar), origTaf: str(wx.orig_taf),
        destTaf: str(wx.dest_taf)
      },
      // full formatted OFP for the "View full OFP" panel
      textOfp: str(d.text && (d.text.plan_html || d.text.plan_text)),
      generatedUnix: num(p.time_generated)
    };
  }

  function fetchViaNative(id) {
    if (window.__xefb && typeof window.__xefb.invoke === "function") {
      var payload = /^\d+$/.test(String(id)) ? { userid: String(id) } : { username: String(id) };
      window.__xefb.invoke("fetchOfp", payload);
      return true;
    }
    return false;
  }

  // SimBrief's xml.fetcher.php sends permissive CORS, so this works straight
  // from the web view. A 400 means the id is unknown or the user has never
  // generated an OFP.
  function fetchDirect(id) {
    var q = /^\d+$/.test(String(id)) ? "userid=" + id : "username=" + encodeURIComponent(id);
    return fetch("https://www.simbrief.com/api/xml.fetcher.php?" + q + "&json=1")
      .then(function (r) {
        if (r.status === 400 || r.status === 404) throw new Error("unknown SimBrief id or no OFP on file");
        if (!r.ok) throw new Error("SimBrief returned " + r.status);
        return r.json();
      })
      .then(parse);
  }

  window.EfbOfp = { parse: parse, fetchViaNative: fetchViaNative, fetchDirect: fetchDirect };
})();
