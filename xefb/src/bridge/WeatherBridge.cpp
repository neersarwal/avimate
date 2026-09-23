#include "bridge/WeatherBridge.h"

#include "XPLMUtilities.h"   // XPLMFindSymbol, XPLMDebugString
#include "XPLMDefs.h"        // XPLMFixedString150_t

// This translation unit is the ONE place compiled with the X-Plane 12 SDK
// defines (CMakeLists.txt gives only this file XPLM400/410/420 +
// XEFB_XP12_APIS). Seeing the header is still not proof the *running* sim has
// the functions, so every XP12 entry point is reached through XPLMFindSymbol
// rather than linked directly — that keeps the plugin loadable on X-Plane 11.
#if defined(XEFB_XP12_APIS)
  #include "XPLMWeather.h"
#endif

namespace xefb {

namespace {
#if defined(XEFB_XP12_APIS)
using GetMetarFn   = void (*)(const char*, XPLMFixedString150_t*);
using GetWxAtLocFn = int  (*)(double, double, double, XPLMWeatherInfo_t*);
#endif
} // namespace

WeatherBridge::WeatherBridge() {
    fnGetMetar_             = XPLMFindSymbol("XPLMGetMETARForAirport");
    fnGetWeatherAtLocation_ = XPLMFindSymbol("XPLMGetWeatherAtLocation");
    xp12Api_ = (fnGetMetar_ != nullptr && fnGetWeatherAtLocation_ != nullptr);

    XPLMDebugString(xp12Api_
        ? "xEFB: X-Plane 12 weather API present\n"
        : "xEFB: X-Plane 12 weather API absent - using dataref fallback\n");
}

AirportWeather WeatherBridge::metarForAirport(const std::string& icao) const {
    AirportWeather out;
    out.icao = icao;

#if defined(XEFB_XP12_APIS)
    if (fnGetMetar_) {
        auto fn = reinterpret_cast<GetMetarFn>(fnGetMetar_);
        XPLMFixedString150_t buf{};
        fn(icao.c_str(), &buf);
        buf.buffer[sizeof(buf.buffer) - 1] = '\0';
        out.metar = buf.buffer;
        out.valid = !out.metar.empty();
    }
#endif
    return out;   // valid == false on X-Plane 11
}

bool WeatherBridge::windAt(double latitude, double longitude, double altitudeM,
                           double& outDirDegTrue, double& outSpeedKts, double& outOatC) const {
#if defined(XEFB_XP12_APIS)
    if (fnGetWeatherAtLocation_) {
        auto fn = reinterpret_cast<GetWxAtLocFn>(fnGetWeatherAtLocation_);
        XPLMWeatherInfo_t info{};
        info.structSize = (int)sizeof(XPLMWeatherInfo_t);
        fn(latitude, longitude, altitudeM, &info);
        outDirDegTrue = info.wind_dir_alt;
        outSpeedKts   = info.wind_spd_alt * 1.94384;   // m/s -> kt
        outOatC       = info.temperature_alt;
        return true;
    }
#else
    (void)latitude; (void)longitude; (void)altitudeM;
    (void)outDirDegTrue; (void)outSpeedKts; (void)outOatC;
#endif
    return false;
}

} // namespace xefb
