/* ===================================================================
   xEFB moving map — self-contained canvas nav display.

   Works with no network (route + own-ship + graticule + range rings).
   When a raster tile source is reachable it draws a slippy-map basemap
   underneath as positioned <img> elements (no canvas readback, so no
   CORS / tainted-canvas issues).

   Public API (window.EfbMap):
     init(container)                 - mount into a DOM element
     setRoute(route)                 - {legs:[{ident,lat,lon,kind}], ...}
     setOwnship({lat,lon,trackDeg,gsKts})
     setRangeNm(nm) | setCenterFollow(bool) | setOrientation('north'|'track')
     setLayer(name, on)              - 'wx' | 'traffic' | 'airspace' | 'terrain'
     resize()
   =================================================================== */
(function () {
  "use strict";

  // Optional raster basemap. Swap for your own aviation tile source + key;
  // OSM is fine for light dev use (respect its tile-usage policy). The map is
  // fully usable with NO basemap — route + own-ship + graticule are drawn on
  // the canvas regardless. A dark CSS filter recolours the light OSM tiles to
  // fit the cockpit theme.
  var TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  var TILE_FILTER = "invert(1) hue-rotate(180deg) brightness(.85) contrast(.9) saturate(.6)";
  var TILE_SIZE = 256;

  var el = null, canvas = null, ctx = null, tileLayer = null;
  var W = 0, H = 0, dpr = 1;

  var route = null;             // {legs:[{ident,lat,lon,kind}]}
  var own = { lat: 37.6189, lon: -122.375, trackDeg: 0, gsKts: 0, valid: false };
  var trail = [];               // recent own-ship positions
  var rangeNm = 40;
  var follow = true;
  var orientation = "track";    // 'north' | 'track'
  // 'terrain' toggles the raster basemap. wx/traffic/airspace are overlays.
  var layers = { wx: true, traffic: true, airspace: false, terrain: true };
  var tilesOk = true;           // flips false after tiles repeatedly fail
  var tileFails = 0;
  var center = { lat: 37.6189, lon: -122.375 };
  var dragging = false, dragLast = null;

  /* --- web-mercator helpers (world pixels at fractional zoom) -------- */
  function lonToWorldX(lon, z) { return (lon + 180) / 360 * TILE_SIZE * Math.pow(2, z); }
  function latToWorldY(lat, z) {
    var s = Math.sin(lat * Math.PI / 180);
    s = Math.max(-0.9999, Math.min(0.9999, s));
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE_SIZE * Math.pow(2, z);
  }
  function worldXToLon(x, z) { return x / (TILE_SIZE * Math.pow(2, z)) * 360 - 180; }
  function worldYToLat(y, z) {
    var n = Math.PI - 2 * Math.PI * y / (TILE_SIZE * Math.pow(2, z));
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  // Zoom so that `rangeNm` maps to roughly half the smaller screen dimension.
  function zoomForRange() {
    var latRad = center.lat * Math.PI / 180;
    var metresPerNm = 1852;
    var half = Math.min(W, H) / 2;
    // metres per world-pixel at zoom z ≈ 156543.03 * cos(lat) / 2^z
    var target = rangeNm * metresPerNm / half;                 // metres per screen px wanted
    var z = Math.log2(156543.03392 * Math.cos(latRad) / target);
    return Math.max(2, Math.min(15, z));
  }

  function viewState() {
    var z = zoomForRange();
    var cx = lonToWorldX(center.lon, z), cy = latToWorldY(center.lat, z);
    var rot = orientation === "track" && own.valid ? -own.trackDeg * Math.PI / 180 : 0;
    return { z: z, cx: cx, cy: cy, rot: rot };
  }

  function project(lat, lon, vs) {
    var wx = lonToWorldX(lon, vs.z) - vs.cx;
    var wy = latToWorldY(lat, vs.z) - vs.cy;
    var c = Math.cos(vs.rot), s = Math.sin(vs.rot);
    return { x: W / 2 + (wx * c - wy * s), y: H / 2 + (wx * s + wy * c) };
  }

  /* --- tiles (positioned <img>, no canvas draw) -------------------- */
  function fmtTile(url, z, x, y) {
    return url.replace("{z}", z).replace("{x}", x).replace("{y}", y);
  }
  function refreshTiles(vs, visible) {
    if (!tileLayer) return;
    var show = visible && tilesOk;
    tileLayer.style.display = show ? "block" : "none";
    if (!show) { tileLayer.innerHTML = ""; return; }

    var z = Math.max(2, Math.min(18, Math.round(vs.z)));
    var scale = Math.pow(2, vs.z - z);        // screen px per zoom-z world px
    var n = Math.pow(2, z);
    var tile = TILE_SIZE * scale;
    // map centre in *zoom-z* world pixels (tile indices are zoom-z too)
    var cxZ = lonToWorldX(center.lon, z);
    var cyZ = latToWorldY(center.lat, z);
    // The layer div is 2x the viewport, centred on it, so rotation never
    // exposes a corner. Tiles are positioned relative to the div centre.
    var cx0 = W, cy0 = H;                      // div centre in div-local px
    // cover the viewport with a margin (a hard rotation may clip corners a
    // little — acceptable; keeps the request count sane for public tiles)
    var half = Math.max(W, H) * 0.62 + TILE_SIZE;
    var tx0 = Math.floor((cxZ - half / scale) / TILE_SIZE);
    var ty0 = Math.floor((cyZ - half / scale) / TILE_SIZE);
    var tx1 = Math.ceil((cxZ + half / scale) / TILE_SIZE);
    var ty1 = Math.ceil((cyZ + half / scale) / TILE_SIZE);

    var want = {};
    for (var tx = tx0; tx <= tx1; tx++) {
      for (var ty = ty0; ty <= ty1; ty++) {
        if (ty < 0 || ty >= n) continue;
        var wxx = ((tx % n) + n) % n;
        var key = z + "/" + wxx + "/" + ty;
        want[key] = true;
        var img = tileLayer.querySelector('img[data-k="' + key + '"]');
        if (!img) {
          img = document.createElement("img");
          img.dataset.k = key;
          img.decoding = "async";
          img.onerror = onTileError;
          img.onload = function () { tileFails = 0; };
          img.src = fmtTile(TILE_URL, z, wxx, ty);
          img.style.position = "absolute";
          tileLayer.appendChild(img);
        }
        img.style.width = img.style.height = Math.ceil(tile + 1) + "px";
        img.style.left = (cx0 + (tx * TILE_SIZE - cxZ) * scale) + "px";
        img.style.top = (cy0 + (ty * TILE_SIZE - cyZ) * scale) + "px";
      }
    }
    tileLayer.style.transform = "rotate(" + (vs.rot * 180 / Math.PI) + "deg)";
    Array.prototype.forEach.call(tileLayer.querySelectorAll("img"), function (im) {
      if (!want[im.dataset.k]) im.remove();
    });
  }
  function onTileError() {
    this.remove();
    if (++tileFails >= 6) tilesOk = false;   // give up after a run of failures
  }

  /* --- canvas overlay -------------------------------------------- */
  function clear() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // paint an opaque ground unless a live basemap is showing under the canvas
    if (!(layers.terrain && tilesOk)) {
      ctx.fillStyle = "#0e1216";
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = "rgba(10,14,18,.25)";   // slight darken over tiles
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawGraticule(vs) {
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.fillStyle = "rgba(200,209,220,.35)";
    ctx.lineWidth = 1;
    ctx.font = "10px ui-monospace, Menlo, monospace";
    var step = rangeNm > 120 ? 5 : rangeNm > 40 ? 2 : 1;   // degrees
    var latMin = worldYToLat(vs.cy + H, vs.z), latMax = worldYToLat(vs.cy - H, vs.z);
    var lonMin = worldXToLon(vs.cx - W, vs.z), lonMax = worldXToLon(vs.cx + W, vs.z);
    for (var la = Math.floor(latMin / step) * step; la <= latMax; la += step) {
      var a = project(la, lonMin, vs), b = project(la, lonMax, vs);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (var lo = Math.floor(lonMin / step) * step; lo <= lonMax; lo += step) {
      var c = project(latMin, lo, vs), d = project(latMax, lo, vs);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
  }

  function drawRangeRings() {
    var cx = W / 2, cy = H / 2;
    var pxPerNm = (Math.min(W, H) / 2) / rangeNm;
    ctx.strokeStyle = "rgba(79,156,245,.28)";
    ctx.setLineDash([2, 4]);
    [0.5, 1].forEach(function (f) {
      ctx.beginPath();
      ctx.arc(cx, cy, rangeNm * f * pxPerNm, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(200,209,220,.55)";
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.fillText((rangeNm / 2) + " NM", cx + 4, cy - rangeNm * 0.5 * pxPerNm - 4);
  }

  function drawAirspace(vs) {
    if (!layers.airspace) return;
    // demo TMA rings around the route endpoints until a real airspace feed lands
    var pts = [];
    if (route && route.legs && route.legs.length) {
      pts.push(route.legs[0], route.legs[route.legs.length - 1]);
    }
    ctx.strokeStyle = "rgba(185,144,245,.5)";
    ctx.lineWidth = 1.25;
    pts.forEach(function (p) {
      if (!p) return;
      var s = project(p.lat, p.lon, vs);
      var pxPerNm = (Math.min(W, H) / 2) / rangeNm;
      [15, 30].forEach(function (r) {
        ctx.beginPath(); ctx.arc(s.x, s.y, r * pxPerNm, 0, Math.PI * 2); ctx.stroke();
      });
    });
  }

  function drawRoute(vs) {
    if (!route || !route.legs || route.legs.length < 2) return;
    var legs = route.legs;

    ctx.strokeStyle = "#4f9cf5";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    legs.forEach(function (l, i) {
      var s = project(l.lat, l.lon, vs);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();

    legs.forEach(function (l, i) {
      var s = project(l.lat, l.lon, vs);
      var endpoint = i === 0 || i === legs.length - 1;
      if (endpoint) {
        ctx.fillStyle = i === 0 ? "#4fd196" : "#f0b45c";
        ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = "#8b95a5";
        ctx.fillStyle = "#0e1014";
        ctx.lineWidth = 2;
        ctx.save();
        ctx.translate(s.x, s.y); ctx.rotate(Math.PI / 4);
        ctx.fillRect(-5, -5, 10, 10); ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
      }
      if (l.ident) {
        ctx.fillStyle = "rgba(238,241,245,.85)";
        ctx.font = "11px ui-monospace, Menlo, monospace";
        ctx.fillText(l.ident, s.x + 9, s.y - 7);
      }
    });
  }

  function drawTrail(vs) {
    if (trail.length < 2) return;
    ctx.strokeStyle = "rgba(79,209,150,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    trail.forEach(function (p, i) {
      var s = project(p.lat, p.lon, vs);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
  }

  function drawOwnship(vs) {
    if (!own.valid) return;
    var s = project(own.lat, own.lon, vs);
    var rot = (orientation === "track" ? 0 : own.trackDeg) * Math.PI / 180;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(rot + vs.rot);
    ctx.fillStyle = "#eef1f5";
    ctx.strokeStyle = "#0b0c0e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawCompass() {
    var hdg = orientation === "track" && own.valid ? own.trackDeg : 0;
    ctx.fillStyle = "rgba(11,12,14,.55)";
    ctx.fillRect(W / 2 - 34, 8, 68, 22);
    ctx.fillStyle = "#eef1f5";
    ctx.font = "600 13px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(hdg)).padStart(3, "0") + "°  " +
      (orientation === "track" ? "TRK↑" : "N↑"), W / 2, 24);
    ctx.textAlign = "left";
  }

  function render() {
    if (!ctx) return;
    var vs = viewState();
    refreshTiles(vs, layers.terrain);

    clear();
    drawGraticule(vs);
    drawAirspace(vs);
    drawRoute(vs);
    drawTrail(vs);
    drawRangeRings();
    drawOwnship(vs);
    drawCompass();
  }

  /* --- input --------------------------------------------------- */
  function screenToLatLon(px, py) {
    var vs = viewState();
    var dx = px - W / 2, dy = py - H / 2;
    var c = Math.cos(-vs.rot), s = Math.sin(-vs.rot);
    var wx = vs.cx + (dx * c - dy * s);
    var wy = vs.cy + (dx * s + dy * c);
    return { lat: worldYToLat(wy, vs.z), lon: worldXToLon(wx, vs.z) };
  }

  function bindInput() {
    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; follow = false;
      dragLast = { x: e.offsetX, y: e.offsetY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var vs = viewState();
      var before = screenToLatLon(dragLast.x, dragLast.y);
      var after = screenToLatLon(e.offsetX, e.offsetY);
      center.lat += before.lat - after.lat;
      center.lon += before.lon - after.lon;
      dragLast = { x: e.offsetX, y: e.offsetY };
      render();
    });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      rangeNm = Math.max(2, Math.min(400, rangeNm * (e.deltaY > 0 ? 1.2 : 1 / 1.2)));
      render();
    }, { passive: false });
  }

  /* --- public API --------------------------------------------- */
  var EfbMap = {
    init: function (container) {
      el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;
      el.innerHTML =
        '<div class="efbmap__tiles" data-l="base"></div>' +
        '<canvas class="efbmap__canvas"></canvas>';
      tileLayer = el.querySelector('[data-l="base"]');
      tileLayer.style.filter = TILE_FILTER;
      canvas = el.querySelector("canvas");
      ctx = canvas.getContext("2d");
      bindInput();
      this.resize();
      this._raf = setInterval(render, 500);   // cheap redraw loop; render() is idempotent
    },
    resize: function () {
      if (!el) return;
      dpr = window.devicePixelRatio || 1;
      W = el.clientWidth; H = el.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      render();
    },
    setRoute: function (r) { route = r; if (follow && r && r.legs && r.legs.length && !own.valid) {
      center = { lat: r.legs[0].lat, lon: r.legs[0].lon }; } render(); },
    setOwnship: function (o) {
      if (o && isFinite(o.lat) && isFinite(o.lon)) {
        own.lat = o.lat; own.lon = o.lon;
        own.trackDeg = o.trackDeg || 0; own.gsKts = o.gsKts || 0;
        own.valid = true;
        var last = trail[trail.length - 1];
        if (!last || Math.hypot(o.lat - last.lat, o.lon - last.lon) > 0.002) {
          trail.push({ lat: o.lat, lon: o.lon });
          if (trail.length > 400) trail.shift();
        }
        if (follow) center = { lat: o.lat, lon: o.lon };
      }
      render();
    },
    setRangeNm: function (nm) { rangeNm = nm; render(); },
    setCenterFollow: function (b) { follow = b; if (b && own.valid) center = { lat: own.lat, lon: own.lon }; render(); },
    setOrientation: function (o) { orientation = o; render(); },
    setLayer: function (name, on) { if (name in layers) layers[name] = !!on; render(); },
    isFollowing: function () { return follow; },
    retryTiles: function () { tilesOk = true; tileFails = 0; render(); },
    // point at your own raster tile source, e.g.
    //   EfbMap.setTileSource('https://tiles.example/{z}/{x}/{y}.png', 'none')
    setTileSource: function (urlTemplate, cssFilter) {
      TILE_URL = urlTemplate || TILE_URL;
      if (cssFilter != null) { TILE_FILTER = cssFilter; if (tileLayer) tileLayer.style.filter = cssFilter; }
      if (tileLayer) tileLayer.innerHTML = "";
      tilesOk = true; tileFails = 0; render();
    }
  };

  window.EfbMap = EfbMap;
  window.addEventListener("resize", function () { EfbMap.resize(); });
})();
