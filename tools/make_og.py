"""Builds og.png (link preview, 1200x630) and favicon.png from the extracted sprites.

Usage: python -I tools/make_og.py
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from datawin import read_png, write_png, crop, scale_nearest  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPR = json.load(open(os.path.join(ROOT, "assets", "sprites.json")))


def frame(name, i=0):
    s = SPR[name]
    with open(os.path.join(ROOT, "assets", "sprites", name + ".png"), "rb") as f:
        w, h, px = read_png(f.read())
    return s["w"], s["h"], crop(px, w, i * s["w"], 0, s["w"], s["h"])


def paste(dst, dw, dh, src, sw, sh, x, y):
    # Alpha-over blit (the datawin blit copies pixels without blending).
    for j in range(sh):
        for i in range(sw):
            a = src[(j * sw + i) * 4 + 3]
            if not a or not (0 <= x + i < dw and 0 <= y + j < dh):
                continue
            d = ((y + j) * dw + x + i) * 4
            s = (j * sw + i) * 4
            for c in range(3):
                dst[d + c] = (src[s + c] * a + dst[d + c] * (255 - a)) // 255
            dst[d + 3] = 255


def scaled(name, k, i=0):
    w, h, px = frame(name, i)
    return w * k, h * k, scale_nearest(px, w, h, w * k, h * k)


W, H = 1200, 630
img = bytearray(W * H * 4)
for y in range(H):
    t = y / H
    r, g, b = int(10 + 20 * t), int(8 + 6 * t), int(40 + 50 * t)
    for x in range(W):
        img[(y * W + x) * 4:(y * W + x) * 4 + 4] = bytes((r, g, b, 255))

lw, lh, logo = scaled("IMAGE_LOGO", 4)
paste(img, W, H, logo, lw, lh, (W - lw) // 2, 40)
jw, jh, jevil = scaled("spr_joker_dance", 8, 0)
paste(img, W, H, jevil, jw, jh, (W - jw) // 2, 200)
hw, hh, heart = scaled("spr_heart", 3)
paste(img, W, H, heart, hw, hh, 200, 420)
paste(img, W, H, heart, hw, hh, W - 200 - hw, 420)
write_png(os.path.join(ROOT, "og.png"), W, H, img)

fw, fh, fav = scaled("spr_heart", 2)
write_png(os.path.join(ROOT, "favicon.png"), fw, fh, fav)
print("og.png and favicon.png written")
