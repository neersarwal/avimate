/* ===================================================================
   xEFB — normal checklists.

   Zibo 737-800 (default) + a generic set used when a different aircraft
   is loaded. app.js owns the ticked/unticked state; this file is just
   the authored content. All items start unticked; the counter is
   checked / total, updated as items are checked.

   window.EfbChecklists:
     phases(aircraft?) -> [{ id, title }]
     items(phaseId, aircraft?) -> [{ label, callout }]
   =================================================================== */
(function () {
  "use strict";

  // --- Zibo / Boeing 737-800 normal checklists (condensed FCOM) --------
  var ZIBO = {
    preflight: {
      title: "Preflight", items: [
        ["Oxygen", "TESTED, 100%"],
        ["Yaw damper", "ON"],
        ["Navigation transfer & display switches", "NORMAL, AUTO"],
        ["Window heat", "ON"],
        ["Pressurization mode selector", "AUTO"],
        ["Flight instruments", "HEADING ___, ALTIMETER ___"],
        ["Parking brake", "SET"],
        ["Engine start levers", "CUTOFF"]
      ]
    },
    beforeStart: {
      title: "Before start", items: [
        ["Flight deck door", "CLOSED & LOCKED"],
        ["Fuel pumps", "ON"],
        ["Anti-collision light", "ON"],
        ["MCP", "V2 ___, HDG ___, ALT ___"],
        ["Takeoff speeds", "V1 ___  VR ___  V2 ___"],
        ["CDU preflight", "COMPLETED"],
        ["Rudder & aileron trim", "FREE & 0"],
        ["Taxi & takeoff briefing", "COMPLETED"]
      ]
    },
    beforeTaxi: {
      title: "Before taxi", items: [
        ["Generators", "ON"],
        ["Probe heat", "ON"],
        ["Anti-ice", "AS REQUIRED"],
        ["Isolation valve", "AUTO"],
        ["Engine start switches", "CONT"],
        ["Recall", "CHECKED"],
        ["Autobrake", "RTO"],
        ["Engine start levers", "IDLE DETENT"],
        ["Flight controls", "CHECKED"],
        ["Ground equipment", "CLEAR"]
      ]
    },
    beforeTakeoff: {
      title: "Before takeoff", items: [
        ["Flaps", "___ GREEN LIGHT"],
        ["Stabilizer trim", "___ UNITS"],
        ["Cabin", "SECURE"]
      ]
    },
    afterTakeoff: {
      title: "After takeoff", items: [
        ["Engine bleeds", "ON"],
        ["Packs", "AUTO"],
        ["Landing gear", "UP & OFF"],
        ["Flaps", "UP, NO LIGHTS"],
        ["Altimeters", "SET"]
      ]
    },
    descent: {
      title: "Descent", items: [
        ["Pressurization", "LDG ALT ___"],
        ["Recall", "CHECKED"],
        ["Autobrake", "___"],
        ["Landing data", "VREF ___, MINIMUMS ___"],
        ["Approach briefing", "COMPLETED"]
      ]
    },
    approachLanding: {
      title: "Approach & landing", items: [
        ["Altimeters", "SET & CROSS-CHECKED"],
        ["Approach", "ARMED / SET"],
        ["Landing gear", "DOWN, 3 GREEN"],
        ["Flaps", "___ GREEN LIGHT"],
        ["Speedbrake", "ARMED"]
      ]
    },
    shutdown: {
      title: "Shutdown", items: [
        ["Fuel pumps", "OFF"],
        ["Probe heat", "AUTO / OFF"],
        ["Hydraulic panel", "SET"],
        ["Flaps", "UP"],
        ["Parking brake", "SET / AS REQUIRED"],
        ["Engine start levers", "CUTOFF"],
        ["Weather radar / TCAS", "OFF / STBY"]
      ]
    }
  };

  var GENERIC = {
    preflight: {
      title: "Preflight", items: [
        ["Documents & weights", "ON BOARD"],
        ["Flight controls", "FREE & CORRECT"],
        ["Instruments & avionics", "SET"],
        ["Fuel quantity", "CHECKED"],
        ["Altimeters", "SET"],
        ["Parking brake", "SET"]
      ]
    },
    beforeStart: {
      title: "Before start", items: [
        ["Doors", "CLOSED"],
        ["Beacon", "ON"],
        ["Area", "CLEAR"],
        ["Fuel pumps / selectors", "SET"],
        ["Transponder", "STBY"]
      ]
    },
    beforeTaxi: {
      title: "Before taxi", items: [
        ["Ground equipment", "REMOVED"],
        ["Flight instruments", "CHECKED"],
        ["Taxi clearance", "OBTAINED"],
        ["Brakes", "CHECKED"]
      ]
    },
    beforeTakeoff: {
      title: "Before takeoff", items: [
        ["Flaps / trim", "SET FOR TAKEOFF"],
        ["Controls", "FREE"],
        ["Transponder", "ON / TA-RA"],
        ["Lights", "AS REQUIRED"],
        ["Takeoff clearance", "OBTAINED"]
      ]
    },
    cruise: {
      title: "Cruise", items: [
        ["Cruise altitude", "SET"],
        ["Fuel", "CHECKED / BALANCED"],
        ["Systems", "NORMAL"]
      ]
    },
    approachLanding: {
      title: "Approach & landing", items: [
        ["Approach briefing", "COMPLETE"],
        ["Altimeters", "SET"],
        ["Gear", "DOWN"],
        ["Flaps", "SET FOR LANDING"],
        ["Landing clearance", "OBTAINED"]
      ]
    },
    shutdown: {
      title: "Shutdown", items: [
        ["Parking brake", "SET"],
        ["Fuel / mixture", "CUTOFF"],
        ["Electrical", "OFF"],
        ["Controls", "SECURED"]
      ]
    }
  };

  function set(aircraft) {
    return (aircraft && /b?73|zibo/i.test(aircraft)) ? ZIBO : GENERIC;
  }

  window.EfbChecklists = {
    phases: function (aircraft) {
      var s = set(aircraft);
      return Object.keys(s).map(function (id) { return { id: id, title: s[id].title }; });
    },
    items: function (phaseId, aircraft) {
      var s = set(aircraft);
      var p = s[phaseId] || Object.values(s)[0];
      return p.items.map(function (it) { return { label: it[0], callout: it[1] }; });
    }
  };
})();
