#include "DatarefBridge.h"
#include "XPLMUtilities.h"   // XPLMGetVersions, XPLMHostApplicationID

#include <cmath>
#include <cstring>
#include <initializer_list>

namespace xefb {

namespace {

int detectSimMajor(int* fullVersion) {
    int xplaneVersion = 0, xplmVersion = 0;
    XPLMHostApplicationID host{};
    XPLMGetVersions(&xplaneVersion, &xplmVersion, &host);
    if (fullVersion) *fullVersion = xplaneVersion;
    if (xplaneVersion >= 12000 && xplaneVersion < 13000) return 12;
    if (xplaneVersion >= 11000 && xplaneVersion < 12000) return 11;
    return xplaneVersion / 1000;
}

// XPLMGetVersions reports e.g. 121400 for 12.14.0 or 12140 for 12.14 — the
// scheme changed over time. Format best-effort as "X-Plane <maj>.<min>.<pt>".
std::string formatSimName(int v) {
    if (v <= 0) return "X-Plane 12";
    int maj, min, pt;
    if (v >= 100000) { maj = v / 10000; min = (v / 100) % 100; pt = v % 100; }
    else             { maj = v / 1000;  min = (v / 10) % 100;  pt = v % 10;  }
    char buf[48];
    std::snprintf(buf, sizeof buf, "X-Plane %d.%d.%d", maj, min, pt);
    return buf;
}

XPLMDataRef firstOf(const char* a, const char* b) {
    XPLMDataRef r = XPLMFindDataRef(a);
    return r ? r : XPLMFindDataRef(b);
}

XPLMDataRef firstOf(std::initializer_list<const char*> names) {
    for (const char* n : names) if (XPLMDataRef r = XPLMFindDataRef(n)) return r;
    return nullptr;
}

// Read a dataref that might be int / float / double as a rounded integer.
int readCount(XPLMDataRef r) {
    if (!r) return -1;
    XPLMDataTypeID t = XPLMGetDataRefTypes(r);
    if (t & xplmType_Int)    return XPLMGetDatai(r);
    if (t & xplmType_Float)  return (int)std::lround(XPLMGetDataf(r));
    if (t & xplmType_Double) return (int)std::llround(XPLMGetDatad(r));
    return -1;
}

double getd(XPLMDataRef r) { return r ? XPLMGetDatad(r) : 0.0; }
double getf(XPLMDataRef r) { return r ? (double)XPLMGetDataf(r) : 0.0; }
int    geti(XPLMDataRef r) { return r ? XPLMGetDatai(r) : 0; }

std::string getStr(XPLMDataRef r) {
    if (!r) return {};
    char buf[512] = {0};
    int n = XPLMGetDatab(r, buf, 0, (int)sizeof buf - 1);
    if (n <= 0) return {};
    buf[n < (int)sizeof buf ? n : (int)sizeof buf - 1] = '\0';
    return buf;
}

} // namespace

DatarefBridge::DatarefBridge() {
    int full = 0;
    simMajor_ = detectSimMajor(&full);
    simName_ = formatSimName(full);

    latRef_  = XPLMFindDataRef("sim/flightmodel/position/latitude");
    lonRef_  = XPLMFindDataRef("sim/flightmodel/position/longitude");
    elevRef_ = XPLMFindDataRef("sim/flightmodel/position/elevation");
    hdgRef_  = XPLMFindDataRef("sim/flightmodel/position/psi");
    gsRef_   = XPLMFindDataRef("sim/flightmodel/position/groundspeed");
    fuelRef_ = XPLMFindDataRef("sim/flightmodel/weight/m_fuel_total");

    windDirRef_ = firstOf("sim/weather/aircraft/wind_now_direction_degt",
                          "sim/weather/wind_direction_degt");
    windSpdRef_ = firstOf("sim/weather/aircraft/wind_now_speed_msc",
                          "sim/weather/wind_speed_msc");
    oatRef_     = firstOf("sim/weather/aircraft/temperature_ambient_deg_c",
                          "sim/weather/temperature_ambient_c");

    localTimeRef_ = XPLMFindDataRef("sim/time/local_time_sec");
    zuluTimeRef_  = XPLMFindDataRef("sim/time/zulu_time_sec");

    acfNameRef_   = firstOf("sim/aircraft/view/acf_ui_name", "sim/aircraft/view/acf_descrip");
    parkBrakeRef_ = XPLMFindDataRef("sim/cockpit2/controls/parking_brake_ratio");
    apuRef_       = firstOf("sim/cockpit2/electrical/APU_running", "sim/cockpit/engine/APU_running");
    doorsRef_     = XPLMFindDataRef("sim/flightmodel2/misc/door_open_ratio");
    battVoltsRef_ = XPLMFindDataRef("sim/cockpit2/electrical/battery_voltage_actual_volts");

    // Passenger count is aircraft-specific — X-Plane has no stock "pax aboard"
    // dataref. Try the Zibo 737 first, then a few common study-level addons.
    // Verify/extend against whatever aircraft is actually loaded (same story as
    // the ground-service datarefs).
    paxRef_ = firstOf({
        "laminar/B738/actual_passengers_number",  // Zibo 737-800
        "laminar/B738/passengers/number",
        "AirbusFBW/NoPax",                        // ToLiss A319/A320/A321
        "AirbusFBW/NumberOfPassengers",
        "1-sim/boarding/passengersOnBoard"        // FlightFactor
    });
}

SimState DatarefBridge::snapshot() const {
    SimState s;
    s.xplaneMajor    = simMajor_;
    s.simulatorName  = simName_;
    s.latitude       = getd(latRef_);
    s.longitude      = getd(lonRef_);
    s.altitudeFt     = getd(elevRef_) * 3.28084;
    s.headingDeg     = getf(hdgRef_);
    s.groundSpeedKts = getf(gsRef_) * 1.94384;
    s.fuelKg         = getf(fuelRef_);
    s.windDirDeg     = getf(windDirRef_);
    s.windKts        = getf(windSpdRef_) * 1.94384;
    s.oatC           = getf(oatRef_);

    if (localTimeRef_ && zuluTimeRef_) {
        double off = getf(localTimeRef_) - getf(zuluTimeRef_);
        while (off >  43200.0) off -= 86400.0;   // wrap to (-12h, +12h]
        while (off <= -43200.0) off += 86400.0;
        s.localOffsetSec = off;
    }

    s.aircraft  = getStr(acfNameRef_);
    s.parkBrake = parkBrakeRef_ ? (getf(parkBrakeRef_) > 0.5 ? "SET" : "RELEASED") : "";
    s.apuState  = apuRef_ ? (geti(apuRef_) ? "RUN" : "OFF") : "";

    if (doorsRef_) {
        float ratios[24] = {0};
        int n = XPLMGetDatavf(doorsRef_, ratios, 0, 24);
        int open = 0;
        for (int i = 0; i < n; ++i) if (ratios[i] > 0.05f) ++open;
        s.doorsState = open ? (std::to_string(open) + " OPEN") : "CLOSED";
    }
    if (battVoltsRef_) {
        float v[8] = {0};
        int n = XPLMGetDatavf(battVoltsRef_, v, 0, 8);
        s.battVolts = n > 0 ? v[0] : 0.0;
    }
    s.paxCount = readCount(paxRef_);
    return s;
}

} // namespace xefb
