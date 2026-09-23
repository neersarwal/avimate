#pragma once
#include <cstdint>

namespace xefb {

// Owns a GL texture matching an Ultralight view's bitmap and paints it as a
// textured quad in an X-Plane 2D window. A dumb blitter — no knowledge of
// Ultralight; callers hand it raw BGRA pixels and read back view coordinates
// for input mapping.
class TabletSurface {
public:
    TabletSurface(int width, int height);
    ~TabletSurface();

    // Copy BGRA8 pixels into the GL texture. Call with a current GL context
    // (i.e. from a window draw callback). rowBytes may be > width*4.
    void uploadRGBA(const void* bgraPixels, std::uint32_t rowBytes);

    // Change the expected pixel size. If it differs, the GL texture is dropped
    // and recreated at the new size on the next uploadRGBA(). Cheap no-op when
    // the size is unchanged. Safe to call outside a GL context (the actual
    // GL work is deferred to uploadRGBA/draw).
    void updateSize(int width, int height);

    // Draw the texture into the given rect, in X-Plane window/screen boxel
    // coords (left<right, bottom<top). Also records the rect for viewCoords().
    void draw(int left, int bottom, int right, int top);

    // Map a click in the same coords passed to draw() to view pixels
    // (0..width, 0..height, origin top-left).
    void viewCoords(int winX, int winY, float& outPx, float& outPy) const;

    int width() const { return width_; }
    int height() const { return height_; }

private:
    void ensureTexture();

    int width_;
    int height_;
    int texW_ = 0, texH_ = 0;          // size the live GL texture was created at
    std::uint32_t glTextureId_ = 0;
    int rectL_ = 0, rectB_ = 0, rectR_ = 0, rectT_ = 0;
};

} // namespace xefb
