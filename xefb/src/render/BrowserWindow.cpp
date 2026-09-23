#include "BrowserWindow.h"
#include "TabletSurface.h"
#include "UltralightHost.h"

#include "XPLMUtilities.h"

#include <algorithm>
#include <cstring>

using namespace ultralight;

namespace xefb {

namespace {
std::string jesc(const String& s) {
    std::string in = s.utf8().data(), o;
    for (char c : in) {
        if (c == '"' || c == '\\') o += '\\';
        if (c == '\n' || c == '\r') { o += ' '; continue; }
        o += c;
    }
    return o;
}
int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }
} // namespace

BrowserWindow::BrowserWindow(RefPtr<Renderer> renderer, UltralightHost* efb)
    : renderer_(renderer), efb_(efb) {
    surface_ = std::make_unique<TabletSurface>(viewW_, viewH_);
}

BrowserWindow::~BrowserWindow() {
    for (auto& t : tabs_) if (t.view) {
        t.view->set_load_listener(nullptr);
        t.view->set_view_listener(nullptr);
    }
    tabs_.clear();
}

BrowserWindow::Tab* BrowserWindow::activeTab() {
    for (auto& t : tabs_) if (t.id == activeId_) return &t;
    return tabs_.empty() ? nullptr : &tabs_.front();
}
BrowserWindow::Tab* BrowserWindow::findByView(View* v) {
    for (auto& t : tabs_) if (t.view.get() == v) return &t;
    return nullptr;
}

int BrowserWindow::addTab(const std::string& url) {
    ViewConfig vc;
    vc.is_accelerated = false;
    vc.is_transparent = false;
    vc.initial_focus  = true;
    Tab t;
    t.id = nextId_++;
    t.view = renderer_->CreateView((uint32_t)viewW_, (uint32_t)viewH_, vc,
                                   efb_ ? efb_->session() : nullptr);
    t.view->set_load_listener(this);
    t.view->set_view_listener(this);
    if (!url.empty()) t.view->LoadURL(String(url.c_str()));
    tabs_.push_back(std::move(t));
    activeId_ = tabs_.back().id;
    focused_ = true;
    tabs_.back().view->Focus();
    return activeId_;
}

void BrowserWindow::newTab(const std::string& url) {
    addTab(url);
    pushState();
}

void BrowserWindow::closeTab(int id) {
    for (size_t i = 0; i < tabs_.size(); ++i) {
        if (tabs_[i].id != id) continue;
        if (tabs_[i].view) {
            tabs_[i].view->set_load_listener(nullptr);
            tabs_[i].view->set_view_listener(nullptr);
        }
        tabs_.erase(tabs_.begin() + i);
        break;
    }
    if (activeId_ == id) activeId_ = tabs_.empty() ? 0 : tabs_.back().id;
    resizeActiveToViewport();
    pushState();
}

void BrowserWindow::activateTab(int id) {
    activeId_ = id;
    focused_ = true;
    resizeActiveToViewport();
    if (Tab* t = activeTab()) t->view->Focus();
    pushState();
}
void BrowserWindow::navigate(const std::string& url) { if (auto* t = activeTab()) t->view->LoadURL(String(url.c_str())); }
void BrowserWindow::back()    { if (auto* t = activeTab()) if (t->view->CanGoBack())    t->view->GoBack(); }
void BrowserWindow::forward() { if (auto* t = activeTab()) if (t->view->CanGoForward()) t->view->GoForward(); }
void BrowserWindow::reload()  { if (auto* t = activeTab()) t->view->Reload(); }

void BrowserWindow::setViewport(int x, int y, int w, int h, bool activeScreen) {
    vpActive_ = activeScreen;
    if (w > 0 && h > 0) { vpX_ = x; vpY_ = y; vpW_ = w; vpH_ = h; }
    if (!activeScreen) focused_ = false;
    resizeActiveToViewport();
}

void BrowserWindow::resizeActiveToViewport() {
    // Render the web view at (roughly) its on-tablet pixel size, clamped to a
    // sane range so a stray layout value can't allocate something huge.
    int w = clampi(vpW_, 480, 2200);
    int h = clampi(vpH_, 320, 1400);
    if (w == viewW_ && h == viewH_) return;
    viewW_ = w; viewH_ = h;
    surface_->updateSize(w, h);
    for (auto& t : tabs_) if (t.view) t.view->Resize((uint32_t)w, (uint32_t)h);
}

void BrowserWindow::compositeInto(int winL, int winB, int winR, int winT) {
    if (!vpActive_ || tabs_.empty()) return;
    Tab* t = activeTab();
    if (!t || !t->view) return;

    const double sx = (winR - winL) / 1360.0;
    const double sy = (winT - winB) / 850.0;
    subL_ = winL + (int)(vpX_ * sx);
    subR_ = winL + (int)((vpX_ + vpW_) * sx);
    subT_ = winT - (int)(vpY_ * sy);
    subB_ = winT - (int)((vpY_ + vpH_) * sy);

    auto* s = static_cast<BitmapSurface*>(t->view->surface());
    if (s) {
        RefPtr<Bitmap> bmp = s->bitmap();
        if (bmp) {
            surface_->updateSize((int)bmp->width(), (int)bmp->height());
            surface_->uploadRGBA(bmp->LockPixels(), bmp->row_bytes());
            bmp->UnlockPixels();
        }
    }
    surface_->draw(subL_, subB_, subR_, subT_);
}

bool BrowserWindow::pointInView(int x, int y) const {
    return vpActive_ && !tabs_.empty() &&
           x >= subL_ && x <= subR_ && y >= subB_ && y <= subT_;
}

void BrowserWindow::mouseAt(int winX, int winY, XPLMMouseStatus status) {
    Tab* t = activeTab();
    if (!t || !t->view) return;
    const int rw = subR_ - subL_, rh = subT_ - subB_;
    if (rw <= 0 || rh <= 0) return;
    float u = (float)(winX - subL_) / (float)rw;
    float v = (float)(subT_ - winY) / (float)rh;   // X-Plane Y is bottom-up
    MouseEvent e;
    e.x = (int)(u * viewW_);
    e.y = (int)(v * viewH_);
    switch (status) {
        case xplm_MouseDown:
            mouseDown_ = true; focused_ = true;
            e.type = MouseEvent::kType_MouseDown; e.button = MouseEvent::kButton_Left; break;
        case xplm_MouseDrag:
            e.type = MouseEvent::kType_MouseMoved;
            e.button = mouseDown_ ? MouseEvent::kButton_Left : MouseEvent::kButton_None; break;
        default:
            mouseDown_ = false;
            e.type = MouseEvent::kType_MouseUp; e.button = MouseEvent::kButton_Left; break;
    }
    t->view->FireMouseEvent(e);
}

void BrowserWindow::wheel(int /*winX*/, int /*winY*/, int clicks) {
    Tab* t = activeTab();
    if (!t || !t->view) return;
    ScrollEvent se;
    se.type = ScrollEvent::kType_ScrollByPixel;
    se.delta_x = 0;
    se.delta_y = clicks * 60;   // X-Plane gives wheel "clicks"; ~60px each
    t->view->FireScrollEvent(se);
}

void BrowserWindow::keyInput(char asciiKey, XPLMKeyFlags flags, char virtualKey) {
    Tab* t = activeTab();
    if (!t || !t->view) return;
    const bool down = (flags & xplm_DownFlag) != 0;
    KeyEvent ke;
    ke.type = down ? KeyEvent::kType_RawKeyDown : KeyEvent::kType_KeyUp;
    ke.virtual_key_code = (int)(unsigned char)virtualKey;
    ke.native_key_code  = 0;
    ke.modifiers = ((flags & xplm_ShiftFlag)   ? KeyEvent::kMod_ShiftKey : 0) |
                   ((flags & xplm_ControlFlag) ? KeyEvent::kMod_CtrlKey  : 0) |
                   ((flags & xplm_OptionAltFlag) ? KeyEvent::kMod_AltKey : 0);
    GetKeyIdentifierFromVirtualKeyCode(ke.virtual_key_code, ke.key_identifier);
    t->view->FireKeyEvent(ke);

    // printable characters need a matching Char event for text inputs
    if (down && (unsigned char)asciiKey >= 0x20 && (unsigned char)asciiKey < 0x7f) {
        KeyEvent ch;
        ch.type = KeyEvent::kType_Char;
        char buf[2] = { asciiKey, 0 };
        ch.text = String(buf);
        ch.unmodified_text = ch.text;
        t->view->FireKeyEvent(ch);
    }
}

void BrowserWindow::pushState() {
    if (!efb_) return;
    std::string js = "window.__xefb.onBrowserState && window.__xefb.onBrowserState({\"activeId\":" +
        std::to_string(activeId_) + ",\"tabs\":[";
    for (size_t i = 0; i < tabs_.size(); ++i) {
        auto& t = tabs_[i];
        if (i) js += ",";
        js += "{\"id\":" + std::to_string(t.id) +
              ",\"title\":\"" + jesc(t.view->title()) + "\"" +
              ",\"url\":\"" + jesc(t.view->url()) + "\"" +
              ",\"canBack\":" + (t.view->CanGoBack() ? "true" : "false") +
              ",\"canFwd\":" + (t.view->CanGoForward() ? "true" : "false") + "}";
    }
    js += "]})";
    efb_->evaluate(js);
    efb_->evaluate("window.__xefb.onBrowserTabs && window.__xefb.onBrowserTabs(" +
        std::to_string(tabs_.size()) + ")");
}

void BrowserWindow::OnFinishLoading(View* v, uint64_t, bool main, const String&) { if (main && findByView(v)) pushState(); }
void BrowserWindow::OnFailLoading(View* v, uint64_t, bool, const String&, const String&, const String&, int) { if (findByView(v)) pushState(); }
void BrowserWindow::OnUpdateHistory(View* v) { if (findByView(v)) pushState(); }
void BrowserWindow::OnChangeURL(View* v, const String&) { if (findByView(v)) pushState(); }

RefPtr<View> BrowserWindow::OnCreateChildView(View* /*caller*/, const String& /*opener*/,
                                              const String& /*target*/, bool /*is_popup*/,
                                              const IntRect& /*rect*/) {
    // window.open() / target="_blank" — used by "Sign in with Google/Microsoft"
    // OAuth popups. Open it as a normal tab so it shares cookies with the opener.
    addTab("");                       // Ultralight navigates it to target itself
    pushState();
    return tabs_.back().view;
}

void BrowserWindow::OnRequestClose(View* caller) {
    // an OAuth popup calling window.close() once it's done
    if (Tab* t = findByView(caller)) closeTab(t->id);
}

} // namespace xefb
