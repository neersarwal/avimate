#pragma once

#include "XPLMDataAccess.h"
#include <string>

namespace xefb {

// Plain snapshot handed to the web UI once per frame (or throttled — most
// EFB widgets don't need 60Hz updates; consider decimating position/attitude
// to ~10-15Hz and only pushing FMS/route data on change).
struct SimState {
    double latitude = 0.0;
    double longitude = 0.0;
    double altitudeFt = 0.0;
    double headingDeg = 0.0;
    double groundSpeedKts = 0.0;
    double fuelKg = 0.0;
    double windDirDeg = 0.0;   // direction wind is coming from, degrees true
    double windKts = 0.0;
    double oatC = 0.0;         // outside air / static air temperature, Celsius
    double localOffsetSec = 0.0; // civil UTC offset where the aircraft is
                                 // (sim local_time − zulu_time); handles the
                                 // half-hour zones coordinate math can't
    int    xplaneMajor = 0;    // 11 or 12, from XPLMGetVersions()

    // identity / about panel
    std::string aircraft;       // acf_ui_name
    std::string simulatorName;  // "X-Plane 12.1.4"

    // ground / aircraft state (Ground screen)
    std::string parkBrake;      // "SET" / "RELEASED"
    std::string apuState;       // "RUN" / "OFF"
    std::string doorsState;     // "CLOSED" / "n OPEN"
    double      battVolts = 0.0;
    int         paxCount = -1;   // passengers aboard; -1 = aircraft exposes none
    // ... still to add: FMS route + next-waypoint ETE (grep TODO(sim) in resources/ui).
};

// Wraps the XPLMDataRef lookups/reads AviTab already does (aircraft
// position, fuel, electrical) so the plugin core stays free of raw
// XPLMGetDataf/XPLMGetDatad calls scattered everywhere.
class DatarefBridge {
public:
    DatarefBridge();
    SimState snapshot() const;

    // 11 or 12. Detected once in the ctor via XPLMGetVersions(); used to pick
    // XP11 vs XP12 dataref names (weather especially) here and in
    // WeatherBridge's fallback path.
    int simMajor() const { return simMajor_; }

private:
    int simMajor_ = 0;
    std::string simName_;
    XPLMDataRef latRef_ = nullptr;
    XPLMDataRef lonRef_ = nullptr;
    XPLMDataRef elevRef_ = nullptr;     // metres MSL
    XPLMDataRef hdgRef_ = nullptr;      // psi, true heading
    XPLMDataRef gsRef_ = nullptr;       // m/s
    XPLMDataRef fuelRef_ = nullptr;     // kg
    XPLMDataRef windDirRef_ = nullptr;  // deg true
    XPLMDataRef windSpdRef_ = nullptr;  // m/s
    XPLMDataRef oatRef_ = nullptr;      // deg C
    XPLMDataRef localTimeRef_ = nullptr; // sim/time/local_time_sec
    XPLMDataRef zuluTimeRef_ = nullptr;  // sim/time/zulu_time_sec
    XPLMDataRef acfNameRef_ = nullptr;  // acf_ui_name (byte array)
    XPLMDataRef parkBrakeRef_ = nullptr;
    XPLMDataRef apuRef_ = nullptr;
    XPLMDataRef doorsRef_ = nullptr;    // door_open_ratio[] (float array)
    XPLMDataRef battVoltsRef_ = nullptr;
    XPLMDataRef paxRef_ = nullptr;      // passenger count (aircraft-specific)
};

} // namespace xefb
