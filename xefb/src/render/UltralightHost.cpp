#include "UltralightHost.h"
#include "bridge/DatarefBridge.h"

#include <AppCore/AppCore.h>   // GetPlatformFontLoader / GetPlatformFileSystem
#include <AppCore/JSHelpers.h>

#include "XPLMUtilities.h"     // XPLMDebugString

#include <cstdio>
#include <filesystem>
#include <string>

using namespace ultralight;

namespace xefb {

namespace {
// One Renderer per process. Ultralight's Platform singleton + Renderer must be
// set up exactly once and outlive every View.
bool gPlatformReady = false;

void ensurePlatform(const std::string& resourceDir) {
    if (gPlatformReady) return;

    Config config;
    // CPU raster is simplest: we read the bitmap back and upload it into our
    // own GL texture (TabletSurface). No GPUDriver needed.

    // Persist cookies / localStorage / network cache to <plugin>/cache so web
    // logins (Navigraph, VATSIM Connect, …) actually work and survive restarts.
    // Without a cache_path + persistent Session, cookies are dropped and OAuth
    // fails with "cookies are disabled".
    {
        std::string base = resourceDir;
        for (auto& c : base) if (c == '\\') c = '/';
        auto pos = base.rfind("/resources");
        std::string cacheDir = (pos != std::string::npos ? base.substr(0, pos) : base) + "/cache";
        std::error_code ec;
        std::filesystem::create_directories(cacheDir, ec);
        config.cache_path = String(cacheDir.c_str());
    }

    Platform::instance().set_config(config);
    Platform::instance().set_font_loader(GetPlatformFontLoader());
    // file:///ui/* resolves against <plugin>/resources/ (absolute path from
    // XPLMGetPluginInfo, passed in by PluginMain).
    Platform::instance().set_file_system(GetPlatformFileSystem(String(resourceDir.c_str())));
    gPlatformReady = true;
}
} // namespace

UltralightHost::UltralightHost(int width, int height, const std::string& entryUrl,
                               const std::string& resourceDir)
    : width_(width), height_(height), entryUrl_(entryUrl) {
    ensurePlatform(resourceDir);
    Platform::instance().set_logger(this);

    renderer_ = Renderer::Create();
    session_  = renderer_->CreateSession(/*is_persistent*/ true, "xefb");

    ViewConfig vc;
    vc.is_accelerated = false;   // CPU raster -> BitmapSurface
    vc.is_transparent = true;    // let the cockpit / window show through if the page has alpha
    vc.initial_device_scale = 1.0;

    view_ = renderer_->CreateView((uint32_t)width_, (uint32_t)height_, vc, session_);
    view_->set_load_listener(this);
    view_->LoadURL(String(entryUrl_.c_str()));
}

UltralightHost::~UltralightHost() {
    view_ = nullptr;
    session_ = nullptr;
    renderer_ = nullptr;
}

void UltralightHost::pumpMessages() {
    if (renderer_) renderer_->Update();
}

void UltralightHost::renderFrame() {
    if (!renderer_) return;
    renderer_->RefreshDisplay(0);
    renderer_->Render();
}

const void* UltralightHost::lockBitmap() {
    if (!view_) return nullptr;
    auto* surface = static_cast<BitmapSurface*>(view_->surface());
    if (!surface) return nullptr;
    lockedBitmap_ = surface->bitmap();
    if (!lockedBitmap_) return nullptr;
    rowBytes_ = lockedBitmap_->row_bytes();
    bitmapLocked_ = true;
    return lockedBitmap_->LockPixels();
}

void UltralightHost::unlockBitmap() {
    if (bitmapLocked_ && lockedBitmap_) {
        lockedBitmap_->UnlockPixels();
        bitmapLocked_ = false;
    }
    lockedBitmap_ = nullptr;
}

void UltralightHost::dispatchMouseMove(float px, float py) {
    if (!view_) return;
    MouseEvent e;
    e.type = MouseEvent::kType_MouseMoved;
    e.x = (int)px;
    e.y = (int)py;
    e.button = MouseEvent::kButton_None;
    view_->FireMouseEvent(e);
}

void UltralightHost::dispatchMouseEvent(float px, float py, bool down) {
    if (!view_) return;
    MouseEvent e;
    e.type = down ? MouseEvent::kType_MouseDown : MouseEvent::kType_MouseUp;
    e.x = (int)px;
    e.y = (int)py;
    e.button = MouseEvent::kButton_Left;
    view_->FireMouseEvent(e);
}

void UltralightHost::dispatchScroll(float /*px*/, float /*py*/, int wheelClicks) {
    if (!view_) return;
    ScrollEvent se;
    se.type = ScrollEvent::kType_ScrollByPixel;
    se.delta_x = 0;
    se.delta_y = wheelClicks * 60;
    view_->FireScrollEvent(se);
}

void UltralightHost::dispatchKey(char asciiKey, unsigned char xplmFlags, char virtualKey) {
    if (!view_) return;
    const bool down = (xplmFlags & 8u) != 0;   // xplm_DownFlag
    KeyEvent ke;
    ke.type = down ? KeyEvent::kType_RawKeyDown : KeyEvent::kType_KeyUp;
    ke.virtual_key_code = (int)(unsigned char)virtualKey;
    ke.native_key_code  = 0;
    ke.modifiers = ((xplmFlags & 1u) ? KeyEvent::kMod_ShiftKey : 0) |   // xplm_ShiftFlag
                   ((xplmFlags & 2u) ? KeyEvent::kMod_AltKey   : 0) |   // xplm_OptionAltFlag
                   ((xplmFlags & 4u) ? KeyEvent::kMod_CtrlKey  : 0);    // xplm_ControlFlag
    GetKeyIdentifierFromVirtualKeyCode(ke.virtual_key_code, ke.key_identifier);
    view_->FireKeyEvent(ke);
    if (down && (unsigned char)asciiKey >= 0x20 && (unsigned char)asciiKey < 0x7f) {
        KeyEvent ch;
        ch.type = KeyEvent::kType_Char;
        char buf[2] = { asciiKey, 0 };
        ch.text = String(buf);
        ch.unmodified_text = ch.text;
        view_->FireKeyEvent(ch);
    }
}

namespace {
std::string jstr(const std::string& in) {
    std::string o = "\"";
    for (char c : in) {
        if (c == '"' || c == '\\') { o += '\\'; o += c; }
        else if (c == '\n' || c == '\r' || c == '\t') o += ' ';
        else o += c;
    }
    o += '"';
    return o;
}
} // namespace

std::string UltralightHost::toJson(const SimState& s) {
    // Keys match resources/ui/app.js — nested { position, weather } plus the
    // flat legacy fields, plus identity / ground-state strings.
    char nums[400];
    std::snprintf(nums, sizeof nums,
        "\"latitude\":%.6f,\"longitude\":%.6f,\"altitudeFt\":%.1f,"
        "\"headingDeg\":%.1f,\"groundSpeedKts\":%.1f,\"fuelKg\":%.1f,"
        "\"windDirDeg\":%.1f,\"windKts\":%.1f,\"oatC\":%.1f,"
        "\"battVolts\":%.1f,\"localOffsetSec\":%.0f,\"xplaneMajor\":%d",
        s.latitude, s.longitude, s.altitudeFt,
        s.headingDeg, s.groundSpeedKts, s.fuelKg,
        s.windDirDeg, s.windKts, s.oatC, s.battVolts, s.localOffsetSec, s.xplaneMajor);

    std::string j = "{";
    j += nums;
    j += ",\"aircraft\":" + jstr(s.aircraft);
    j += ",\"simulatorName\":" + jstr(s.simulatorName);
    j += ",\"parkBrake\":" + jstr(s.parkBrake);
    j += ",\"apuState\":" + jstr(s.apuState);
    j += ",\"doorsState\":" + jstr(s.doorsState);
    j += ",\"paxCount\":" + std::to_string(s.paxCount);
    j += "}";
    return j;
}

void UltralightHost::evalScript(const std::string& js) {
    if (view_) view_->EvaluateScript(String(js.c_str()));
}

void UltralightHost::evaluate(const std::string& js) {
    if (view_ && domReady_) view_->EvaluateScript(String(js.c_str()));
}

void UltralightHost::postStateUpdate(const SimState& state) {
    if (!view_ || !domReady_) return;
    evalScript("window.__xefb && window.__xefb.onSimState(" + toJson(state) + ")");
}

// window.__xefb.invoke(action, payload) lands here. app.js passes payload
// already JSON.stringify'd (string) or the literal "null".
JSValue UltralightHost::jsInvoke(const JSObject& /*thisObj*/, const JSArgs& args) {
    std::string action = (args.size() > 0 && args[0].IsString())
                             ? std::string(String(args[0]).utf8().data()) : "";
    std::string payload = (args.size() > 1 && args[1].IsString())
                              ? std::string(String(args[1]).utf8().data()) : "null";
    if (onInvoke_ && !action.empty()) onInvoke_(action, payload);
    return JSValue();
}

void UltralightHost::OnDOMReady(View* caller, uint64_t /*frame_id*/,
                                bool is_main_frame, const String& /*url*/) {
    if (!is_main_frame) return;

    RefPtr<JSContext> ctx = caller->LockJSContext();
    SetJSContext(ctx->ctx());
    JSObject global = JSGlobalObject();

    // Install the outbound channel. app.js already does `window.__xefb =
    // window.__xefb || {}` and only calls invoke() when it's a function.
    global["__xefb_native_invoke"] = BindJSCallbackWithRetval(&UltralightHost::jsInvoke);
    caller->EvaluateScript(
        "window.__xefb = window.__xefb || {};"
        "window.__xefb.invoke = function(a,p){"
        "  __xefb_native_invoke(String(a), p == null ? 'null' : JSON.stringify(p));"
        "};");

    domReady_ = true;
}

void UltralightHost::OnFailLoading(View* /*caller*/, uint64_t /*frame_id*/, bool is_main_frame,
                                   const String& url, const String& description,
                                   const String& /*error_domain*/, int error_code) {
    if (!is_main_frame) return;
    char msg[512];
    std::snprintf(msg, sizeof msg, "xEFB: failed to load %s (%d): %s\n",
                  url.utf8().data(), error_code, description.utf8().data());
    XPLMDebugString(msg);
}

void UltralightHost::LogMessage(LogLevel /*level*/, const String& message) {
    XPLMDebugString("xEFB[UL]: ");
    XPLMDebugString(message.utf8().data());
    XPLMDebugString("\n");
}

} // namespace xefb
