#pragma once
#include <string>
#include <cstdint>
#include <functional>

#include <Ultralight/Ultralight.h>
#include <Ultralight/Listener.h>
#include <AppCore/JSHelpers.h>

namespace xefb {

struct SimState; // defined in bridge/DatarefBridge.h — aircraft position, fuel, FMS, etc.

// Wraps an Ultralight Renderer + View rendering the EFB's HTML/CSS/JS UI
// off-screen (CPU raster), and exposes the resulting BGRA bitmap for
// TabletSurface to upload into a GL texture each frame.
//
// Also owns the JS bridge in both directions:
//   native -> JS : postStateUpdate() calls window.__xefb.onSimState(json)
//   JS -> native : window.__xefb.invoke(action, payload) -> InvokeHandler
class UltralightHost : public ultralight::LoadListener,
                       public ultralight::Logger {
public:
    // resourceDir: absolute path that file:/// URLs resolve against. The EFB
    // page is expected at <resourceDir>/ui/index.html and Ultralight's own
    // runtime files (cacert.pem, icudt*.dat) alongside it.
    UltralightHost(int width, int height, const std::string& entryUrl,
                   const std::string& resourceDir);
    ~UltralightHost() override;

    void pumpMessages();   // Renderer::Update() — drives ALL views (EFB + browser)
    void renderFrame();    // Renderer::Render() — rasterizes all dirty views
    bool isReady() const { return domReady_; }

    // The process-wide renderer. BrowserWindow borrows this to make its own
    // View rather than spinning up a second Renderer.
    ultralight::RefPtr<ultralight::Renderer> renderer() const { return renderer_; }

    // The shared *persistent* browsing session (cookies, localStorage, cache).
    // All browser tabs use this so a Navigraph / VATSIM login in one tab is
    // seen by the others and survives a sim restart.
    ultralight::RefPtr<ultralight::Session> session() const { return session_; }

    // Raw BGRA8 pixels of the last rendered frame, valid until unlockBitmap().
    const void* lockBitmap();
    std::uint32_t rowBytes() const { return rowBytes_; }
    void unlockBitmap();

    int width() const { return width_; }
    int height() const { return height_; }

    // px,py in device pixels (0..width, 0..height), origin top-left.
    void dispatchMouseEvent(float px, float py, bool down);
    void dispatchMouseMove(float px, float py);
    void dispatchScroll(float px, float py, int wheelClicks);
    // asciiKey/xplmFlags/virtualKey straight from an X-Plane key callback.
    void dispatchKey(char asciiKey, unsigned char xplmFlags, char virtualKey);

    // Pushes fresh sim data into window.__xefb.onSimState(json).
    void postStateUpdate(const SimState& state);

    // Run arbitrary JS in the page (no-op until the DOM is ready). Used by the
    // plugin to deliver e.g. window.__xefb.onOfp(<raw simbrief json>).
    void evaluate(const std::string& js);

    using InvokeHandler = std::function<void(const std::string& action,
                                             const std::string& jsonPayload)>;
    void setInvokeHandler(InvokeHandler handler) { onInvoke_ = std::move(handler); }

    // --- ultralight::LoadListener ---
    void OnDOMReady(ultralight::View* caller, uint64_t frame_id,
                    bool is_main_frame, const ultralight::String& url) override;
    void OnFailLoading(ultralight::View* caller, uint64_t frame_id, bool is_main_frame,
                       const ultralight::String& url, const ultralight::String& description,
                       const ultralight::String& error_domain, int error_code) override;

    // --- ultralight::Logger ---
    void LogMessage(ultralight::LogLevel level, const ultralight::String& message) override;

private:
    static std::string toJson(const SimState& state);
    void evalScript(const std::string& js);
    ultralight::JSValue jsInvoke(const ultralight::JSObject& thisObj,
                                 const ultralight::JSArgs& args);

    int width_;
    int height_;
    std::string entryUrl_;
    bool domReady_ = false;
    std::uint32_t rowBytes_ = 0;
    bool bitmapLocked_ = false;

    InvokeHandler onInvoke_;

    ultralight::RefPtr<ultralight::Renderer> renderer_;
    ultralight::RefPtr<ultralight::Session> session_;
    ultralight::RefPtr<ultralight::View> view_;
    ultralight::RefPtr<ultralight::Bitmap> lockedBitmap_;
};

} // namespace xefb
