"""Builds og.png (link preview, 1200x630) and favicon.png from the extracted sprites.

Usage: python -I tools/make_og.py
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from datawin import read_png, write_png, crop, scale_nearest  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPR = json.load(open(os.path.join(ROOT, "assets", "sprites.json")))


PAGES = {}


def frame(name, i=0):
    s = SPR[name]
    if s["p"] not in PAGES:
        with open(os.path.join(ROOT, "assets", "atlas%d.png" % s["p"]), "rb") as f:
            PAGES[s["p"]] = read_png(f.read())
    w, h, px = PAGES[s["p"]]
    return s["w"], s["h"], crop(px, w, s["x"] + i * s["w"], s["y"], s["w"], s["h"])


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

def text_image(s, font="fnt_mainbig"):
    meta = json.load(open(os.path.join(ROOT, "assets", "fonts.json")))[font]
    with open(os.path.join(ROOT, "assets", "fonts", font + ".png"), "rb") as f:
        aw, ah, atlas = read_png(f.read())
    glyphs = [meta["glyphs"][str(ord(c))] for c in s]
    tw = sum(g[4] for g in glyphs)
    th = max(g[3] for g in glyphs)
    out = bytearray(tw * th * 4)
    cx = 0
    for gx, gy, gw, gh, shift, offset in glyphs:
        if gw:
            paste(out, tw, th, crop(atlas, aw, gx, gy, gw, gh), gw, gh, cx + offset, 0)
        cx += shift
    return tw, th, out


tw, th, title = text_image("JEVIL FIGHT SIMULATOR")
k = 3
paste(img, W, H, scale_nearest(title, tw, th, tw * k, th * k), tw * k, th * k, (W - tw * k) // 2, 60)
jw, jh, jevil = scaled("spr_joker_dance", 8, 0)
paste(img, W, H, jevil, jw, jh, (W - jw) // 2, 200)
hw, hh, heart = scaled("spr_heart", 3)
paste(img, W, H, heart, hw, hh, 200, 420)
paste(img, W, H, heart, hw, hh, W - 200 - hw, 420)
write_png(os.path.join(ROOT, "og.png"), W, H, img)

fw, fh, fav = scaled("spr_heart", 2)
write_png(os.path.join(ROOT, "favicon.png"), fw, fh, fav)
print("og.png and favicon.png written")
