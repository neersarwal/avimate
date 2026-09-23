#pragma once
#include <memory>
#include <string>
#include <vector>

#include <Ultralight/Ultralight.h>

#include "XPLMDisplay.h"   // XPLMMouseStatus, XPLMKeyFlags

namespace xefb {

class TabletSurface;
class UltralightHost;

// Multi-tab web engine composited *inside* the EFB's own window — it does not
// own an X-Plane window of its own. The EFB "Browser" screen (HTML) draws the
// tab strip / address bar / bookmarks and reports the pixel rect of its content
// area via invoke("browserViewport", {...}); PluginMain then asks this class to
// paint the active tab into that rect on top of the EFB bitmap and routes any
// mouse / keyboard that lands inside it here instead of to the EFB view.
//
// Tab state is pushed back to the EFB via
// UltralightHost::evaluate("window.__xefb.onBrowserState({...})").
class BrowserWindow : public ultralight::LoadListener,
                      public ultralight::ViewListener {
public:
    BrowserWindow(ultralight::RefPtr<ultralight::Renderer> renderer, UltralightHost* efb);
    ~BrowserWindow() override;

    // --- tab / navigation control (driven by invoke handlers) ---
    void newTab(const std::string& url);
    void closeTab(int id);
    void activateTab(int id);
    void navigate(const std::string& url);   // active tab
    void back();
    void forward();
    void reload();

    // --- compositing into the EFB window ---
    // rect is in EFB-view pixels (0..1360 / 0..850, origin top-left); active =
    // the Browser screen is the one on show.
    void setViewport(int x, int y, int w, int h, bool active);
    bool active()  const { return vpActive_; }
    bool hasTabs() const { return !tabs_.empty(); }

    // Called from the EFB window's draw callback, AFTER the EFB bitmap is drawn.
    // winL/B/R/T is the EFB window geometry in X-Plane box pixels.
    void compositeInto(int winL, int winB, int winR, int winT);

    // Is (winX,winY) inside the last-composited browser rect?
    bool pointInView(int winX, int winY) const;
    void mouseAt(int winX, int winY, XPLMMouseStatus status);
    void wheel(int winX, int winY, int clicks);
    void keyInput(char asciiKey, XPLMKeyFlags flags, char virtualKey);
    bool focused() const { return focused_; }
    void setFocused(bool f) { focused_ = f; }

    // ultralight::LoadListener
    void OnFinishLoading(ultralight::View* caller, uint64_t, bool is_main_frame, const ultralight::String&) override;
    void OnFailLoading(ultralight::View* caller, uint64_t, bool, const ultralight::String&,
                       const ultralight::String&, const ultralight::String&, int) override;
    void OnUpdateHistory(ultralight::View* caller) override;

    // ultralight::ViewListener — keep OAuth "sign in with…" popups & window.open
    // inside the tabbed browser (same session) instead of silently dropping them.
    void OnChangeURL(ultralight::View* caller, const ultralight::String& url) override;
    ultralight::RefPtr<ultralight::View> OnCreateChildView(
        ultralight::View* caller, const ultralight::String& opener_url,
        const ultralight::String& target_url, bool is_popup,
        const ultralight::IntRect& popup_rect) override;
    void OnRequestClose(ultralight::View* caller) override;

private:
    struct Tab {
        int id = 0;
        ultralight::RefPtr<ultralight::View> view;
    };
    Tab* activeTab();
    Tab* findByView(ultralight::View* v);
    void pushState();
    void resizeActiveToViewport();
    int  addTab(const std::string& url);   // create+activate a View on the shared session

    ultralight::RefPtr<ultralight::Renderer> renderer_;
    UltralightHost* efb_ = nullptr;
    std::vector<Tab> tabs_;
    int activeId_ = 0;
    int nextId_ = 1;
    std::unique_ptr<TabletSurface> surface_;

    // viewport rect in EFB-view px, plus the view resolution we render at
    int vpX_ = 0, vpY_ = 0, vpW_ = 1280, vpH_ = 640;
    bool vpActive_ = false;
    int viewW_ = 1280, viewH_ = 640;

    // last on-screen rect we composited into (X-Plane box px) — for hit-testing
    int subL_ = 0, subB_ = 0, subR_ = 0, subT_ = 0;
    bool mouseDown_ = false;
    bool focused_ = false;
};

} // namespace xefb
