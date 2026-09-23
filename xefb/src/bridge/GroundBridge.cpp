#include "bridge/GroundBridge.h"

#include "XPLMDataAccess.h"
#include "XPLMUtilities.h"

#include <string>
#include <vector>

namespace xefb {

namespace {

void dbg(const std::string& s) { XPLMDebugString(("xEFB: " + s + "\n").c_str()); }

// Set the first dataref in `names` that resolves. Handles int and float refs.
bool setFirstRef(const std::vector<const char*>& names, double value) {
    for (const char* n : names) {
        XPLMDataRef r = XPLMFindDataRef(n);
        if (!r) continue;
        XPLMDataTypeID t = XPLMGetDataRefTypes(r);
        if (t & xplmType_Int)        XPLMSetDatai(r, (int)value);
        else if (t & xplmType_Float) XPLMSetDataf(r, (float)value);
        else if (t & xplmType_Double)XPLMSetDatad(r, value);
        else continue;
        return true;
    }
    return false;
}

bool runFirstCommand(const std::vector<const char*>& names) {
    for (const char* n : names) {
        XPLMCommandRef c = XPLMFindCommand(n);
        if (c) { XPLMCommandOnce(c); return true; }
    }
    return false;
}

// EFB service id -> candidate datarefs (Zibo first, stock fallback).
std::vector<const char*> refsFor(const std::string& id) {
    if (id == "gpu")      return { "laminar/B738/gpu_switch", "laminar/B738/one/gpu_on", "sim/cockpit2/switches/GPU_on" };
    if (id == "airstart") return { "laminar/B738/air_start", "sim/cockpit2/switches/air_start_on" };
    if (id == "accart")   return { "laminar/B738/air_condition", "laminar/B738/air", "sim/cockpit2/switches/air_conditioning_on" };
    if (id == "chocks")   return { "laminar/B738/fms/chock_status", "laminar/B738/chocks", "sim/flightmodel/controls/parkbrake" };
    if (id == "stairs")   return { "laminar/B738/airstairs_pos", "laminar/B738/stairs" };
    if (id == "jetway")   return { "laminar/B738/jetway", "sim/cockpit2/switches/jetway" };
    if (id == "catering") return { "laminar/B738/catering" };
    if (id == "cargo")    return { "laminar/B738/cargo_doors", "sim/flightmodel2/misc/cargo_door_open_ratio" };
    if (id == "lav")      return { "laminar/B738/lavatory_service" };
    if (id == "water")    return { "laminar/B738/water_service" };
    if (id == "gpu2")     return { "laminar/B738/ground_crew" };
    return {};
}

// EFB service id -> command fallback (Zibo toggle commands / stock ground ops).
std::vector<const char*> cmdsFor(const std::string& id, bool on) {
    if (id == "jetway")  return { on ? "sim/ground_ops/jetway" : "sim/ground_ops/jetway" };
    if (id == "gpu")     return { "laminar/B738/toggle_switch/gpu" };
    return {};
}

} // namespace

GroundBridge::GroundBridge() {}

void GroundBridge::setService(const std::string& id, bool on) {
    if (setFirstRef(refsFor(id), on ? 1.0 : 0.0)) {
        dbg("ground service '" + id + "' -> " + (on ? "on" : "off"));
        return;
    }
    if (runFirstCommand(cmdsFor(id, on))) { dbg("ground service '" + id + "' toggled (command)"); return; }
    dbg("no ground-service dataref/command for '" + id + "' on this aircraft");
}

void GroundBridge::fuelTruck(bool on, double targetKg) {
    // Zibo: request a fuel load. Stock: set total fuel target.
    if (on && targetKg > 0) {
        if (setFirstRef({ "laminar/B738/fuel/request_kgs", "sim/flightmodel/weight/m_fuel_total" }, targetKg)) {
            dbg("fuel truck: target " + std::to_string((long)targetKg) + " kg");
            return;
        }
    }
    setFirstRef({ "laminar/B738/fuel/fueling", "laminar/B738/fuel_truck" }, on ? 1.0 : 0.0);
    dbg(std::string("fuel truck ") + (on ? "start" : "stop"));
}

void GroundBridge::pushback(const std::string& cmd) {
    bool ok = false;
    if (cmd == "plan")            ok = runFirstCommand({ "BetterPushback/start_planner" });
    else if (cmd == "start")      ok = runFirstCommand({ "BetterPushback/start" });
    else if (cmd == "stop")       ok = runFirstCommand({ "BetterPushback/stop" });
    else if (cmd == "connect")    ok = runFirstCommand({ "BetterPushback/connect_first", "BetterPushback/connect" });
    else if (cmd == "disconnect") ok = runFirstCommand({ "BetterPushback/disconnect" });

    dbg(ok ? ("pushback: " + cmd)
           : ("pushback: BetterPushback not found (cmd " + cmd + ")"));
}

} // namespace xefb
