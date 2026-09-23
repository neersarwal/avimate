#pragma once
#include <string>

namespace xefb {

// Ground services + pushback control, driven from the EFB's Ground screen
// (window.__xefb.invoke 'groundService' / 'fuelTruck' / 'pushback').
//
// Ground services: each EFB service id maps to a candidate list of datarefs
// (Zibo 737 names first, stock X-Plane 12 fallback). Whichever resolves for
// the loaded aircraft is toggled; if none resolve it is logged and no-ops.
//
// Pushback: BetterPushback commands (needs that plugin installed).
class GroundBridge {
public:
    GroundBridge();

    void setService(const std::string& id, bool on);   // 'gpu','chocks','jetway',...
    void fuelTruck(bool on, double targetKg);
    void pushback(const std::string& cmd);             // 'plan','start','stop','connect','disconnect'
};

} // namespace xefb
