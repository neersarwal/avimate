// PluginMain.cpp
// X-Plane 11.50+ / X-Plane 12 entry points. Owns the Ultralight host + a
// TabletSurface, and drives the EFB as a 2D floating window (works on the GL,
// Vulkan and Metal backends). See TabletSurface.cpp for why the 3D cockpit
// tablet mesh is a separate, still-open piece.

#include "XPLMDisplay.h"
#include "XPLMPlugin.h"
#include "XPLMProcessing.h"
#include "XPLMGraphics.h"
#include "XPLMMenus.h"
#include "XPLMUtilities.h"

#include "render/TabletSurface.h"
#include "render/UltralightHost.h"
#include "render/BrowserWindow.h"
#include "bridge/DatarefBridge.h"
#include "bridge/WeatherBridge.h"
#include "bridge/GroundBridge.h"
#include "net/HttpClient.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>

namespace {

constexpr int kEfbW = 1360;
constexpr int kEfbH = 850;

std::unique_ptr<xefb::TabletSurface>  gSurface;
std::unique_ptr<xefb::UltralightHost> gWebHost;
std::unique_ptr<xefb::BrowserWindow>  gBrowser;
std::unique_ptr<xefb::DatarefBridge>  gDatarefs;
std::unique_ptr<xefb::WeatherBridge>  gWeather;
std::unique_ptr<xefb::GroundBridge>   gGround;

XPLMWindowID gWindow = nullptr;
int  gMenuItem = -1;
bool gMouseDown = false;

void DrawWindow(XPLMWindowID inWindowID, void* /*refcon*/) {
    if (!gWebHost || !gSurface) return;
    int l, t, r, b;
    XPLMGetWindowGeometry(inWindowID, &l, &t, &r, &b);
    if (const void* px = gWebHost->lockBitmap()) {
        gSurface->uploadRGBA(px, gWebHost->rowBytes());
        gWebHost->unlockBitmap();
    }
    gSurface->draw(l, b, r, t);
    // Composite the web browser on top, inside the "Browser" screen's content
    // rect (reported by the EFB page via invoke("browserViewport", ...)).
    if (gBrowser) gBrowser->compositeInto(l, b, r, t);
}

int HandleMouseClick(XPLMWindowID /*inWindowID*/, int x, int y,
                     XPLMMouseStatus inMouse, void* /*refcon*/) {
    if (!gWebHost || !gSurface) return 1;

    // If the click lands inside the composited browser, route it there.
    if (gBrowser && gBrowser->pointInView(x, y)) {
        if (inMouse == xplm_MouseDown) XPLMTakeKeyboardFocus(gWindow);
        gBrowser->mouseAt(x, y, inMouse);
        return 1;
    }
    if (gBrowser && inMouse == xplm_MouseDown) gBrowser->setFocused(false);

    float px, py;
    gSurface->viewCoords(x, y, px, py);
    switch (inMouse) {
        case xplm_MouseDown: gMouseDown = true;  XPLMTakeKeyboardFocus(gWindow);
                             gWebHost->dispatchMouseEvent(px, py, true);  break;
        case xplm_MouseDrag: gWebHost->dispatchMouseMove(px, py); break;
        case xplm_MouseUp:   gMouseDown = false; gWebHost->dispatchMouseEvent(px, py, false); break;
    }
    return 1; // consume
}

XPLMCursorStatus HandleCursor(XPLMWindowID /*w*/, int x, int y, void* /*refcon*/) {
    if (gWebHost && gSurface && !gMouseDown) {
        if (gBrowser && gBrowser->pointInView(x, y)) {
            gBrowser->mouseAt(x, y, xplm_MouseDrag);   // hover
        } else {
            float px, py;
            gSurface->viewCoords(x, y, px, py);
            gWebHost->dispatchMouseMove(px, py);
        }
    }
    return xplm_CursorDefault;
}

int HandleMouseWheel(XPLMWindowID /*w*/, int x, int y, int /*wheel*/, int clicks, void* /*refcon*/) {
    if (gBrowser && gBrowser->pointInView(x, y)) { gBrowser->wheel(x, y, clicks); return 1; }
    if (gWebHost) gWebHost->dispatchScroll(0, 0, clicks);
    return 1;
}

void HandleKey(XPLMWindowID /*w*/, char key, XPLMKeyFlags flags, char vkey,
               void* /*refcon*/, int losingFocus) {
    if (losingFocus) { if (gBrowser) gBrowser->setFocused(false); return; }
    if (gBrowser && gBrowser->active() && gBrowser->focused())
        gBrowser->keyInput(key, flags, vkey);
    else if (gWebHost)
        gWebHost->dispatchKey(key, (unsigned char)flags, vkey);
}

float FrameLoopCallback(float elapsed, float, int, void*) {
    xefb::HttpClient::poll();   // deliver any finished HTTP responses on this thread
    if (!gWebHost) return -1.0f;

    gWebHost->pumpMessages();   // always — keeps JS timers / the clock alive

    const bool visible = gWindow && XPLMGetWindowIsVisible(gWindow);
    if (visible) {
        // Cap the web render to ~30 Hz and the sim-state push to ~10 Hz — an
        // EFB doesn't need per-frame updates and Ultralight's CPU raster isn't
        // free (the handoff calls this out too).
        static float renderAcc = 0.f, stateAcc = 0.f;
        renderAcc += elapsed;
        stateAcc  += elapsed;

        if (renderAcc >= 1.f / 30.f) {
            renderAcc = 0.f;
            gWebHost->renderFrame();
        }

        if (gDatarefs && stateAcc >= 0.1f) {
            stateAcc = 0.f;
            xefb::SimState s = gDatarefs->snapshot();
            // Prefer the XP12 weather API for wind/OAT when it's present.
            if (gWeather && gWeather->hasXP12WeatherApi()) {
                double dir, spd, oat;
                if (gWeather->windAt(s.latitude, s.longitude, s.altitudeFt / 3.28084,
                                     dir, spd, oat)) {
                    s.windDirDeg = dir;
                    s.windKts    = spd;
                    s.oatC       = oat;
                }
            }
            gWebHost->postStateUpdate(s);
        }
    }
    return -1.0f; // every frame
}

void ToggleWindow() {
    if (!gWindow) return;
    int vis = XPLMGetWindowIsVisible(gWindow);
    XPLMSetWindowIsVisible(gWindow, !vis);
}

void MenuHandler(void* /*menuRef*/, void* itemRef) {
    if (itemRef == (void*)"toggle") ToggleWindow();
}

void MakeEfbWindow() {
    int sl, st, sr, sb;
    XPLMGetScreenBoundsGlobal(&sl, &st, &sr, &sb);

    // Start centred at a comfortable size that keeps the 1360:850 aspect.
    const int w = 1088, h = 680;
    const int cx = (sl + sr) / 2, cy = (sb + st) / 2;

    XPLMCreateWindow_t p;
    std::memset(&p, 0, sizeof p);
    p.structSize = sizeof p;
    p.left   = cx - w / 2;
    p.right  = cx + w / 2;
    p.top    = cy + h / 2;
    p.bottom = cy - h / 2;
    p.visible = 1;
    p.drawWindowFunc       = DrawWindow;
    p.handleMouseClickFunc = HandleMouseClick;
    p.handleRightClickFunc = nullptr;
    p.handleKeyFunc        = HandleKey;
    p.handleCursorFunc     = HandleCursor;
    p.handleMouseWheelFunc = HandleMouseWheel;
    p.refcon               = nullptr;
    p.decorateAsFloatingWindow = xplm_WindowDecorationRoundRectangle;
    p.layer                = xplm_WindowLayerFloatingWindows;

    gWindow = XPLMCreateWindowEx(&p);
    XPLMSetWindowTitle(gWindow, "xEFB");
    XPLMSetWindowPositioningMode(gWindow, xplm_WindowPositionFree, -1);
    XPLMSetWindowResizingLimits(gWindow, 544, 340, 2720, 1700);
    XPLMSetWindowGravity(gWindow, 0.5f, 0.5f, 0.5f, 0.5f);
}

} // namespace

// <plugin.xpl> lives at .../plugins/xEFB/<platform>/xEFB.xpl — strip the last
// two components to get the plugin root, then append /resources.
std::string ResourceDir() {
    char path[1024] = {0};
    XPLMGetPluginInfo(XPLMGetMyID(), nullptr, path, nullptr, nullptr);
    std::string p(path);
    for (auto& c : p) if (c == '\\') c = '/';
    for (int i = 0; i < 2; ++i) {
        auto slash = p.find_last_of('/');
        if (slash == std::string::npos) break;
        p.erase(slash);
    }
    return p + "/resources";
}

PLUGIN_API int XPluginStart(char* outName, char* outSig, char* outDesc) {
    std::strcpy(outName, "xEFB");
    std::strcpy(outSig, "com.example.xefb");
    std::strcpy(outDesc, "Modern, Fluent-styled electronic flight bag for X-Plane 11.50+ / 12");

    XPLMEnableFeature("XPLM_USE_NATIVE_PATHS", 1);

    gDatarefs = std::make_unique<xefb::DatarefBridge>();
    gWeather  = std::make_unique<xefb::WeatherBridge>();
    gGround   = std::make_unique<xefb::GroundBridge>();

    {
        char msg[128];
        std::snprintf(msg, sizeof msg,
                      "xEFB: X-Plane major %d, XP12 weather API %s\n",
                      gDatarefs->simMajor(),
                      gWeather->hasXP12WeatherApi() ? "yes" : "no");
        XPLMDebugString(msg);
    }

    gWebHost = std::make_unique<xefb::UltralightHost>(
        kEfbW, kEfbH, "file:///ui/index.html", ResourceDir());
    gSurface = std::make_unique<xefb::TabletSurface>(kEfbW, kEfbH);
    gBrowser = std::make_unique<xefb::BrowserWindow>(gWebHost->renderer(), gWebHost.get());

    // Inbound from the UI: resources/ui/app.js -> window.__xefb.invoke(...).
    gWebHost->setInvokeHandler([](const std::string& action, const std::string& payload) {
        // Extract a top-level string field from the tiny JSON payload without a
        // full parser (payloads are flat, e.g. {"url":"https://..."}).
        auto field = [&](const char* key) -> std::string {
            std::string k = std::string("\"") + key + "\":\"";
            auto p = payload.find(k);
            if (p == std::string::npos) return {};
            p += k.size();
            auto e = payload.find('"', p);
            return e == std::string::npos ? std::string() : payload.substr(p, e - p);
        };
        auto numField = [&](const char* key) -> double {
            std::string k = std::string("\"") + key + "\":";
            auto p = payload.find(k);
            if (p == std::string::npos) return 0.0;
            return std::atof(payload.c_str() + p + k.size());
        };

        if (action == "openBrowser" || action == "browserNewTab") {
            std::string url = field("url");
            if (gBrowser) gBrowser->newTab(url.empty() ? "file:///ui/browser-home.html" : url);
        }
        else if (action == "browserCloseTab")    { if (gBrowser) gBrowser->closeTab((int)numField("id")); }
        else if (action == "browserActivateTab") { if (gBrowser) gBrowser->activateTab((int)numField("id")); }
        else if (action == "browserNavigate")    { if (gBrowser) gBrowser->navigate(field("url")); }
        else if (action == "browserBack")        { if (gBrowser) gBrowser->back(); }
        else if (action == "browserForward")     { if (gBrowser) gBrowser->forward(); }
        else if (action == "browserReload")      { if (gBrowser) gBrowser->reload(); }
        else if (action == "browserViewport") {
            if (gBrowser) gBrowser->setViewport(
                (int)numField("x"), (int)numField("y"),
                (int)numField("w"), (int)numField("h"),
                payload.find("\"active\":true") != std::string::npos);
        }
        else if (action == "groundService") {
            if (gGround) gGround->setService(field("id"),
                payload.find("\"on\":true") != std::string::npos);
        }
        else if (action == "fuelTruck") {
            if (gGround) gGround->fuelTruck(payload.find("\"on\":true") != std::string::npos,
                numField("targetKg"));
        }
        else if (action == "pushback") {
            if (gGround) gGround->pushback(field("cmd"));
        }
        else if (action == "fetchOfp") {
            std::string idField = field("userid");
            std::string param = idField.empty()
                ? ("username=" + field("username")) : ("userid=" + idField);
            std::string url = "https://www.simbrief.com/api/xml.fetcher.php?" + param + "&json=1";
            // No auth needed for a public pilot id. To use a Navigraph-linked
            // account, resolve the SimBrief id first — see
            // docs/navigraph-integration.md and src/net/NavigraphClient.
            xefb::HttpClient::get(url, "", [](const xefb::HttpClient::Response& r) {
                if (!gWebHost) return;
                if (r.ok() && !r.body.empty()) {
                    gWebHost->evaluate("window.__xefb.onOfp(" + r.body + ")");
                } else {
                    std::string e = r.error.empty()
                        ? ("SimBrief returned " + std::to_string(r.status)) : r.error;
                    gWebHost->evaluate("window.__xefb.onOfpError(" +
                        std::string("\"") + e + "\")");
                }
            });
        }
        else {
            char msg[256];
            std::snprintf(msg, sizeof msg, "xEFB: UI invoke '%s' payload=%s\n",
                          action.c_str(), payload.c_str());
            XPLMDebugString(msg);
            // TODO: uplinkRouteToFms / callTug / fetchOfp (SimBrief HTTP) /
            //       weather inject (XPLMSetWeatherAtLocation) as those land.
        }
    });

    MakeEfbWindow();

    int menu = XPLMAppendMenuItem(XPLMFindPluginsMenu(), "xEFB", nullptr, 0);
    XPLMMenuID sub = XPLMCreateMenu("xEFB", XPLMFindPluginsMenu(), menu, MenuHandler, nullptr);
    gMenuItem = XPLMAppendMenuItem(sub, "Show / hide EFB", (void*)"toggle", 0);

    XPLMRegisterFlightLoopCallback(FrameLoopCallback, -1.0f, nullptr);
    return 1;
}

PLUGIN_API void XPluginStop(void) {
    XPLMUnregisterFlightLoopCallback(FrameLoopCallback, nullptr);
    xefb::HttpClient::shutdown();
    if (gWindow) { XPLMDestroyWindow(gWindow); gWindow = nullptr; }
    gBrowser.reset();     // destroys its own window + view before the renderer goes
    gSurface.reset();
    gWebHost.reset();
    gGround.reset();
    gWeather.reset();
    gDatarefs.reset();
}

PLUGIN_API void XPluginDisable(void) {}
PLUGIN_API int  XPluginEnable(void) { return 1; }
PLUGIN_API void XPluginReceiveMessage(XPLMPluginID, int, void*) {}
