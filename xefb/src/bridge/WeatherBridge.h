#pragma once

#include <string>

namespace xefb {

// Result of a weather lookup. `valid` is false when neither the XP12 weather
// API nor the dataref fallback could produce anything.
struct AirportWeather {
    std::string icao;
    std::string metar;      // raw METAR text; empty when unavailable
    bool        valid = false;
};

// Two ways xEFB can obtain weather, behind one interface:
//
//   * X-Plane 12's XPLMWeather.h API (XPLMGetMETARForAirport /
//     XPLMGetWeatherAtLocation) when the *running* sim exposes it, and
//   * plain sim/weather/* dataref reads as the X-Plane 11 / early-XP12
//     fallback.
//
// Which path is live is decided once, at construction, via XPLMFindSymbol —
// never by the compile-time XPLM feature level. That is what lets a single
// xEFB.xpl keep loading on X-Plane 11.50+ as well as X-Plane 12.
//
// Only WeatherBridge.cpp is compiled with the XPLM400+ defines (see
// CMakeLists.txt / XEFB_ENABLE_XP12_APIS); this header stays baseline-clean.
class WeatherBridge {
public:
    WeatherBridge();

    // True when the XP12 weather API resolved at runtime.
    bool hasXP12WeatherApi() const { return xp12Api_; }

    // Best-effort METAR for an ICAO. Requires the XP12 API; returns
    // AirportWeather{valid=false} on X-Plane 11.
    // Per the SDK docs this is a pre-flight-loop call, not per-frame.
    AirportWeather metarForAirport(const std::string& icao) const;

    // Current wind + OAT at a location, via XPLMGetWeatherAtLocation (XP12).
    // Returns false (and leaves outputs untouched) when the API is absent —
    // callers should fall back to DatarefBridge in that case.
    bool windAt(double latitude, double longitude, double altitudeM,
                double& outDirDegTrue, double& outSpeedKts, double& outOatC) const;

private:
    bool  xp12Api_ = false;
    void* fnGetMetar_ = nullptr;             // XPLMGetMETARForAirport
    void* fnGetWeatherAtLocation_ = nullptr; // XPLMGetWeatherAtLocation
};

} // namespace xefb
