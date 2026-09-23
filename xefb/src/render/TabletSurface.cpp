#include "TabletSurface.h"

#include "XPLMGraphics.h"   // XPLMSetGraphicsState, XPLMBindTexture2d, XPLMGenerateTextureNumbers

#if defined(IBM)
  #include <windows.h>
#endif
#if defined(__APPLE__)
  #include <OpenGL/gl.h>
#else
  #include <GL/gl.h>
#endif

// GL_BGRA / GL_RGBA8 aren't in the Windows GL 1.1 <GL/gl.h>, but X-Plane's
// GL context supports them at runtime (GL 2.1+).
#ifndef GL_BGRA
  #define GL_BGRA 0x80E1
#endif
#ifndef GL_RGBA8
  #define GL_RGBA8 0x8058
#endif
#ifndef GL_CLAMP_TO_EDGE
  #define GL_CLAMP_TO_EDGE 0x812F
#endif
#ifndef GL_UNPACK_ROW_LENGTH
  #define GL_UNPACK_ROW_LENGTH 0x0CF2
#endif

// ---------------------------------------------------------------------------
// 3D cockpit tablet mesh: NOT done here. 3D drawing-phase callbacks
// (xplm_Phase_Objects / _Gauges) do not fire under Vulkan/Metal, so the
// texture has to reach the mesh another way — replace the OBJ8 material's
// texture at load, or drive a cockpit-device screen. For now this class only
// serves the 2D popup windows in PluginMain + BrowserWindow.
// ---------------------------------------------------------------------------

namespace xefb {

TabletSurface::TabletSurface(int width, int height)
    : width_(width), height_(height) {}

TabletSurface::~TabletSurface() {
    if (glTextureId_) {
        GLuint t = glTextureId_;
        glDeleteTextures(1, &t);
        glTextureId_ = 0;
    }
}

void TabletSurface::updateSize(int width, int height) {
    if (width > 0)  width_  = width;
    if (height > 0) height_ = height;
    // texture itself is (re)created lazily in ensureTexture() when it's stale
}

void TabletSurface::ensureTexture() {
    if (glTextureId_ && texW_ == width_ && texH_ == height_) return;
    if (glTextureId_) {
        GLuint old = glTextureId_;
        glDeleteTextures(1, &old);
        glTextureId_ = 0;
    }
    int tex = 0;
    XPLMGenerateTextureNumbers(&tex, 1);   // play nice with X-Plane's texture manager
    glTextureId_ = (std::uint32_t)tex;
    texW_ = width_; texH_ = height_;

    XPLMBindTexture2d(tex, 0);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width_, height_, 0,
                 GL_BGRA, GL_UNSIGNED_BYTE, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
}

void TabletSurface::uploadRGBA(const void* pixels, std::uint32_t rowBytes) {
    if (!pixels) return;
    ensureTexture();
    XPLMBindTexture2d((int)glTextureId_, 0);

    const int rowPixels = rowBytes ? (int)(rowBytes / 4) : width_;
    glPixelStorei(GL_UNPACK_ROW_LENGTH, rowPixels);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, width_, height_,
                    GL_BGRA, GL_UNSIGNED_BYTE, pixels);
    glPixelStorei(GL_UNPACK_ROW_LENGTH, 0);
}

void TabletSurface::draw(int left, int bottom, int right, int top) {
    rectL_ = left; rectB_ = bottom; rectR_ = right; rectT_ = top;
    if (!glTextureId_) return;

    XPLMSetGraphicsState(/*fog*/0, /*numTexUnits*/1, /*lighting*/0,
                         /*alphaTest*/0, /*alphaBlend*/1,
                         /*depthTest*/0, /*depthWrite*/0);
    XPLMBindTexture2d((int)glTextureId_, 0);

    glColor4f(1.f, 1.f, 1.f, 1.f);
    // Ultralight's bitmap is top-left origin; flip V so it isn't upside down.
    glBegin(GL_QUADS);
        glTexCoord2f(0.f, 1.f); glVertex2i(left,  bottom);
        glTexCoord2f(1.f, 1.f); glVertex2i(right, bottom);
        glTexCoord2f(1.f, 0.f); glVertex2i(right, top);
        glTexCoord2f(0.f, 0.f); glVertex2i(left,  top);
    glEnd();
}

void TabletSurface::viewCoords(int winX, int winY, float& outPx, float& outPy) const {
    const int rw = (rectR_ - rectL_);
    const int rh = (rectT_ - rectB_);
    const float u = rw > 0 ? (float)(winX - rectL_) / (float)rw : 0.f;
    const float v = rh > 0 ? (float)(rectT_ - winY) / (float)rh : 0.f; // window Y is bottom-up
    outPx = u * width_;
    outPy = v * height_;
}

} // namespace xefb
