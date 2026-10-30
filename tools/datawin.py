#!/usr/bin/env python3
"""Dependency-free reader for GameMaker data.win files (bytecode 17 / GM2022+),
focused on asset extraction (textures, sprites, fonts, sounds, names).

Format knowledge follows UndertaleModTool's open-source models. Version-specific
fields are detected from the data itself (entry sizes, pointer layouts) rather
than from GEN8, which reports 2.0.0.0 for every GMS2 game.

Usage: python -I tools/datawin.py <data.win> <command> [args]   (see --help)
"""
import argparse
import bz2
import json
import os
import re
import struct
import sys
import zlib

__all__ = ["DataWin", "write_png", "read_png", "decode_qoi"]


# ---------------------------------------------------------------- PNG I/O

def write_png(path, width, height, rgba, level=9):
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), level))
    png += chunk(b"IEND", b"")
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)


def png_length(buf, off=0):
    """Byte length of a PNG stream starting at off (up to and including IEND)."""
    p = off + 8
    while True:
        n = struct.unpack_from(">I", buf, p)[0]
        tag = bytes(buf[p + 4:p + 8])
        p += 12 + n
        if tag == b"IEND":
            return p - off


def read_png(data):
    """Decode an 8-bit (or palette) non-interlaced PNG to (w, h, RGBA bytearray)."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    p = 8
    idat = bytearray()
    plte = trns = None
    while p < len(data):
        n = struct.unpack_from(">I", data, p)[0]
        tag = bytes(data[p + 4:p + 8])
        body = data[p + 8:p + 8 + n]
        p += 12 + n
        if tag == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
        elif tag == b"PLTE":
            plte = bytes(body)
        elif tag == b"tRNS":
            trns = bytes(body)
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break
    if interlace or depth != 8:
        raise ValueError("unsupported PNG (interlaced or depth != 8)")
    chans = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(bytes(idat))
    stride = w * chans
    prev = bytearray(stride)
    out = bytearray()
    bpp = chans
    pos = 0
    for _ in range(h):
        ft = raw[pos]
        line = bytearray(raw[pos + 1:pos + 1 + stride])
        pos += 1 + stride
        if ft == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif ft == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif ft == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out += line
        prev = line
    if ctype == 6:
        return w, h, out
    rgba = bytearray(w * h * 4)
    if ctype == 2:
        rgba[0::4], rgba[1::4], rgba[2::4] = out[0::3], out[1::3], out[2::3]
        rgba[3::4] = b"\xff" * (w * h)
    elif ctype == 0:
        rgba[0::4] = rgba[1::4] = rgba[2::4] = out
        rgba[3::4] = b"\xff" * (w * h)
    elif ctype == 4:
        rgba[0::4] = rgba[1::4] = rgba[2::4] = out[0::2]
        rgba[3::4] = out[1::2]
    else:
        for i, idx in enumerate(out):
            rgba[i * 4:i * 4 + 3] = plte[idx * 3:idx * 3 + 3]
            rgba[i * 4 + 3] = trns[idx] if trns and idx < len(trns) else 255
    return w, h, rgba


# ---------------------------------------------------------------- GameMaker QOI

def _s(v, bits):
    return v - (1 << bits) if v & (1 << (bits - 1)) else v


# Delta tables; GameMaker's variant uses two's-complement deltas (no bias).
_D8 = [(_s((b >> 4) & 3, 2), _s((b >> 2) & 3, 2), _s(b & 3, 2)) for b in range(256)]
_D16R = [_s(b & 0x1F, 5) for b in range(256)]
_D16GB = [(_s(b >> 4, 4), _s(b & 15, 4)) for b in range(256)]


def decode_qoi(buf, off=0):
    """Decode a GameMaker 'fioq' image. Returns (w, h, RGBA bytearray, total_len)."""
    if bytes(buf[off:off + 4]) != b"fioq":
        raise ValueError("bad fioq magic")
    w, h, length = struct.unpack_from("<HHI", buf, off + 4)
    data = buf[off + 12:off + 12 + length]
    n = len(data)
    total = w * h
    out = bytearray(total * 4)
    index = [(0, 0, 0, 0)] * 64
    r = g = b = 0
    a = 255
    pos = 0
    px = 0
    d8, d16r, d16gb = _D8, _D16R, _D16GB
    while px < total:
        if pos >= n:
            out[px * 4:] = bytes((r, g, b, a)) * (total - px)
            break
        b1 = data[pos]
        pos += 1
        run = 0
        top = b1 & 0xC0
        if top == 0x00:
            r, g, b, a = index[b1]
        elif top == 0x40:
            if b1 & 0x20 == 0:
                run = b1 & 0x1F
            else:
                run = (((b1 & 0x1F) << 8) | data[pos]) + 32
                pos += 1
        elif top == 0x80:
            dr, dg, db = d8[b1]
            r = (r + dr) & 255
            g = (g + dg) & 255
            b = (b + db) & 255
        elif b1 & 0xE0 == 0xC0:
            b2 = data[pos]
            pos += 1
            dg, db = d16gb[b2]
            r = (r + d16r[b1]) & 255
            g = (g + dg) & 255
            b = (b + db) & 255
        elif b1 & 0xF0 == 0xE0:
            m = (b1 << 16) | (data[pos] << 8) | data[pos + 1]
            pos += 2
            r = (r + _s((m >> 15) & 31, 5)) & 255
            g = (g + _s((m >> 10) & 31, 5)) & 255
            b = (b + _s((m >> 5) & 31, 5)) & 255
            a = (a + _s(m & 31, 5)) & 255
        else:
            if b1 & 8:
                r = data[pos]; pos += 1
            if b1 & 4:
                g = data[pos]; pos += 1
            if b1 & 2:
                b = data[pos]; pos += 1
            if b1 & 1:
                a = data[pos]; pos += 1
        index[(r ^ g ^ b ^ a) & 63] = (r, g, b, a)
        cnt = min(run + 1, total - px)
        if cnt == 1:
            o = px * 4
            out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a
        else:
            out[px * 4:(px + cnt) * 4] = bytes((r, g, b, a)) * cnt
        px += cnt
    return w, h, out, 12 + length


def decode_texture_blob(buf, off, block_size=0):
    """Decode a texture blob (PNG, 2zoq, fioq) at off. Returns (w, h, RGBA, format)."""
    magic = bytes(buf[off:off + 4])
    if magic == b"\x89PNG":
        n = png_length(buf, off)
        w, h, px = read_png(bytes(buf[off:off + n]))
        return w, h, px, "png"
    if magic == b"fioq":
        w, h, px, _ = decode_qoi(buf, off)
        return w, h, px, "fioq"
    if magic == b"2zoq":
        # GM2022.5+ adds a u32 uncompressed length after width/height.
        start = off + 8
        if bytes(buf[start:start + 3]) != b"BZh":
            start = off + 12
        if bytes(buf[start:start + 3]) != b"BZh":
            raise ValueError("2zoq without bzip2 stream")
        end = off + block_size if block_size else len(buf)
        dec = bz2.BZ2Decompressor()
        raw = dec.decompress(bytes(buf[start:end]))
        w, h, px, _ = decode_qoi(raw, 0)
        return w, h, px, "2zoq"
    raise ValueError("unknown texture format %r" % magic)


def crop(src, sw, x, y, w, h):
    stride = sw * 4
    out = bytearray(w * h * 4)
    for row in range(h):
        s = (y + row) * stride + x * 4
        out[row * w * 4:(row + 1) * w * 4] = src[s:s + w * 4]
    return out


def scale_nearest(src, sw, sh, dw, dh):
    if (sw, sh) == (dw, dh):
        return src
    out = bytearray(dw * dh * 4)
    for y in range(dh):
        sy = y * sh // dh
        for x in range(dw):
            sx = x * sw // dw
            o = (y * dw + x) * 4
            s = (sy * sw + sx) * 4
            out[o:o + 4] = src[s:s + 4]
    return out


def blit(dst, dw, dh, src, sw, sh, dx, dy):
    for row in range(sh):
        ty = dy + row
        if ty < 0 or ty >= dh:
            continue
        x0, x1 = max(dx, 0), min(dx + sw, dw)
        if x0 >= x1:
            continue
        s = (row * sw + (x0 - dx)) * 4
        o = (ty * dw + x0) * 4
        dst[o:o + (x1 - x0) * 4] = src[s:s + (x1 - x0) * 4]


# ---------------------------------------------------------------- data.win

class Chunked:
    """A FORM file: chunk table plus little-endian helpers."""

    def __init__(self, path):
        self.path = os.path.abspath(path)
        with open(path, "rb") as f:
            self.d = f.read()
        if self.d[:4] != b"FORM":
            raise ValueError("%s: not a FORM file" % path)
        self.chunks = {}
        self.chunk_order = []
        p = 8
        end = 8 + struct.unpack_from("<I", self.d, 4)[0]
        while p < end:
            name = self.d[p:p + 4].decode("ascii")
            ln = struct.unpack_from("<I", self.d, p + 4)[0]
            self.chunks[name] = (p + 8, ln)
            self.chunk_order.append(name)
            p += 8 + ln

    def u8(self, o): return self.d[o]
    def u16(self, o): return struct.unpack_from("<H", self.d, o)[0]
    def i16(self, o): return struct.unpack_from("<h", self.d, o)[0]
    def u32(self, o): return struct.unpack_from("<I", self.d, o)[0]
    def i32(self, o): return struct.unpack_from("<i", self.d, o)[0]
    def f32(self, o): return struct.unpack_from("<f", self.d, o)[0]

    def ptrlist(self, o):
        c = self.u32(o)
        return list(struct.unpack_from("<%dI" % c, self.d, o + 4))

    def chunk_list(self, name):
        if name not in self.chunks or self.chunks[name][1] < 4:
            return []
        return self.ptrlist(self.chunks[name][0])

    def audo(self):
        """List of (offset, length) for each embedded audio blob."""
        return [(p + 4, self.u32(p)) for p in self.chunk_list("AUDO")]


class DataWin(Chunked):
    def __init__(self, path, cache_dir=None):
        super().__init__(path)
        self.dir = os.path.dirname(self.path)
        self.cache_dir = cache_dir
        self._tex_cache = {}
        self._groups = {}
        g = self.chunks["GEN8"][0]
        self.bytecode = self.d[g + 1]
        self.gen8 = {
            "bytecode": self.bytecode,
            "filename": self.str(self.u32(g + 4)),
            "config": self.str(self.u32(g + 8)),
            "game_id": self.u32(g + 20),
            "name": self.str(self.u32(g + 40)),
            "version": [self.u32(g + 44 + 4 * i) for i in range(4)],
            "window": [self.u32(g + 60), self.u32(g + 64)],
            "display_name": self.str(self.u32(g + 100)),
        }

    def str(self, ptr):
        if ptr == 0:
            return None
        n = self.u32(ptr - 4)
        return self.d[ptr:ptr + n].decode("utf-8", "replace")

    # -- lazily parsed tables
    def __getattr__(self, name):
        loaders = {
            "textures": self._load_txtr, "tpag": self._load_tpag,
            "sprites": self._load_sprt, "backgrounds": self._load_bgnd,
            "fonts": self._load_font, "sounds": self._load_sond,
            "audio_groups": self._load_agrp, "objects": self._load_objt,
            "rooms": lambda: self._names("ROOM"), "scripts": self._load_scpt,
        }
        if name in loaders:
            v = loaders[name]()
            setattr(self, name, v)
            return v
        raise AttributeError(name)

    def _names(self, chunk):
        return [{"index": i, "name": self.str(self.u32(p))}
                for i, p in enumerate(self.chunk_list(chunk))]

    # -- TXTR
    def _load_txtr(self):
        ptrs = self.chunk_list("TXTR")
        out = []
        if not ptrs:
            return out
        start, ln = self.chunks["TXTR"]
        # Entry size tells which optional fields exist (scaled, mips, block size, w, h, index).
        esize = ptrs[1] - ptrs[0] if len(ptrs) > 1 else None
        if esize is None or esize > 28 or esize % 4:
            for cand in (28, 16, 12, 8):
                dp = self.u32(ptrs[0] + cand - 4)
                if start <= dp < start + ln and bytes(self.d[dp:dp + 4]) in (b"2zoq", b"fioq", b"\x89PNG"):
                    esize = cand
                    break
        n = esize // 4
        for i, p in enumerate(ptrs):
            vals = [self.u32(p + 4 * k) for k in range(n)]
            e = {"index": i, "scaled": vals[0], "data_ptr": vals[-1]}
            if n >= 3:
                e["generated_mips"] = vals[1]
            if n >= 4:
                e["block_size"] = vals[2]
            if n >= 7:
                e["width"], e["height"], e["index_in_group"] = vals[3], vals[4], vals[5]
            e["format"] = bytes(self.d[e["data_ptr"]:e["data_ptr"] + 4]).decode("latin-1") if e["data_ptr"] else None
            out.append(e)
        return out

    def texture(self, index):
        """Decoded texture page: (width, height, RGBA bytearray). Cached."""
        if index in self._tex_cache:
            return self._tex_cache[index]
        t = self.textures[index]
        cpath = None
        if self.cache_dir:
            st = os.stat(self.path)
            cpath = os.path.join(self.cache_dir, "%s_%d_%d_tex%d.rgba" % (
                os.path.basename(self.path), st.st_size, int(st.st_mtime), index))
            if os.path.exists(cpath):
                with open(cpath, "rb") as f:
                    w, h = struct.unpack("<II", f.read(8))
                    px = bytearray(f.read())
                self._tex_cache[index] = (w, h, px)
                return self._tex_cache[index]
        if not t["data_ptr"]:
            raise ValueError("texture %d is external (no embedded data)" % index)
        w, h, px, _ = decode_texture_blob(self.d, t["data_ptr"], t.get("block_size", 0))
        self._tex_cache[index] = (w, h, px)
        if cpath:
            os.makedirs(self.cache_dir, exist_ok=True)
            with open(cpath, "wb") as f:
                f.write(struct.pack("<II", w, h) + px)
        return self._tex_cache[index]

    # -- TPAG
    def _load_tpag(self):
        out = {}
        for i, p in enumerate(self.chunk_list("TPAG")):
            v = struct.unpack_from("<10Hh", self.d, p)
            out[p] = {"index": i, "offset": p,
                      "src_x": v[0], "src_y": v[1], "src_w": v[2], "src_h": v[3],
                      "tgt_x": v[4], "tgt_y": v[5], "tgt_w": v[6], "tgt_h": v[7],
                      "bound_w": v[8], "bound_h": v[9], "page": v[10]}
        return out

    def tpag_at(self, ptr):
        return self.tpag.get(ptr) if ptr else None

    def tpag_image(self, t):
        """Source rectangle of a TPAG item, as (w, h, RGBA)."""
        w, h, px = self.texture(t["page"])
        return t["src_w"], t["src_h"], crop(px, w, t["src_x"], t["src_y"], t["src_w"], t["src_h"])

    def tpag_on_canvas(self, t, cw=None, ch=None):
        """TPAG item placed on its bounding (or given) canvas using target offsets."""
        cw = cw or t["bound_w"]
        ch = ch or t["bound_h"]
        sw, sh, img = self.tpag_image(t)
        img = scale_nearest(img, sw, sh, t["tgt_w"], t["tgt_h"])
        canvas = bytearray(cw * ch * 4)
        blit(canvas, cw, ch, img, t["tgt_w"], t["tgt_h"], t["tgt_x"], t["tgt_y"])
        return cw, ch, canvas

    # -- SPRT
    def _load_sprt(self):
        out = []
        for i, p in enumerate(self.chunk_list("SPRT")):
            v = struct.unpack_from("<I2I4i5I2i", self.d, p)
            s = {"index": i, "name": self.str(v[0]), "width": v[1], "height": v[2],
                 "margin_left": v[3], "margin_right": v[4], "margin_bottom": v[5], "margin_top": v[6],
                 "transparent": v[7], "smooth": v[8], "preload": v[9], "bbox_mode": v[10],
                 "sep_masks": v[11], "origin_x": v[12], "origin_y": v[13],
                 "special": False, "version": 0, "type": 0,
                 "playback_speed": None, "playback_speed_type": None}
            q = p + 56
            if self.i32(q) == -1:
                s["special"] = True
                s["version"] = self.u32(q + 4)
                s["type"] = self.u32(q + 8)
                q += 12
                if self.bytecode >= 14:
                    s["playback_speed"] = self.f32(q)
                    s["playback_speed_type"] = self.u32(q + 4)  # 0 = frames/second, 1 = frames/game frame
                    q += 8
                if s["version"] >= 2:
                    s["sequence_offset"] = self.u32(q); q += 4
                if s["version"] >= 3:
                    s["nineslice_offset"] = self.u32(q); q += 4
            frames = []
            if s["type"] == 0:
                frames = self.ptrlist(q)
            s["frame_ptrs"] = frames
            s["frames"] = len(frames)
            out.append(s)
        return out

    def sprite(self, name):
        return self._find(self.sprites, name, "sprite")

    def sprite_frame(self, s, i):
        t = self.tpag_at(s["frame_ptrs"][i])
        if t is None:  # null texture (e.g. console-only assets stripped from this build)
            return s["width"], s["height"], bytearray(s["width"] * s["height"] * 4)
        return self.tpag_on_canvas(t, s["width"], s["height"])

    # -- BGND
    def _load_bgnd(self):
        out = []
        for i, p in enumerate(self.chunk_list("BGND")):
            ptr = self.u32(p + 16)
            out.append({"index": i, "name": self.str(self.u32(p)), "tpag_ptr": ptr,
                        "tpag": self.tpag_at(ptr)})
        return out

    # -- FONT
    _FONT_EXTRA = ["ascender_offset", "ascender", "sdf_spread", "line_height"]

    def _font_extra_count(self, ptrs):
        # Number of u32 header fields after scale_y differs between GM versions;
        # pick the count for which the glyph pointer list is well formed in every font.
        for k in range(0, 7):
            ok, nonempty = True, 0
            for p in ptrs:
                lst = p + 40 + 4 * k
                c = self.u32(lst)
                if c > 0x10000 or (c and self.u32(lst + 4) != lst + 4 + 4 * c):
                    ok = False
                    break
                nonempty += c > 0
            if ok and nonempty * 2 > len(ptrs):
                return k
        raise ValueError("cannot determine FONT header layout")

    def _load_font(self):
        ptrs = self.chunk_list("FONT")
        out = []
        if not ptrs:
            return out
        k = self._font_extra_count(ptrs)
        self.font_header_extra = k
        for i, p in enumerate(ptrs):
            em_raw = self.u32(p + 8)
            em = -struct.unpack("<f", struct.pack("<I", em_raw))[0] if em_raw & 0x80000000 else em_raw
            f = {"index": i, "name": self.str(self.u32(p)), "display_name": self.str(self.u32(p + 4)),
                 "em_size": em, "bold": self.u32(p + 12), "italic": self.u32(p + 16),
                 "range_start": self.u16(p + 20), "charset": self.u8(p + 22),
                 "antialias": self.u8(p + 23), "range_end": self.u32(p + 24),
                 "tpag_ptr": self.u32(p + 28), "scale_x": self.f32(p + 32), "scale_y": self.f32(p + 36)}
            for j in range(k):
                key = self._FONT_EXTRA[j] if j < len(self._FONT_EXTRA) else "extra%d" % j
                f[key] = self.i32(p + 40 + 4 * j)
            f["tpag"] = self.tpag_at(f["tpag_ptr"])
            glyphs = []
            for gp in self.ptrlist(p + 40 + 4 * k):
                c, x, y, w, h, shift, offs = struct.unpack_from("<5H2h", self.d, gp)
                nk = self.u16(gp + 14)
                kern = [list(struct.unpack_from("<2h", self.d, gp + 16 + 4 * j)) for j in range(nk)]
                glyphs.append({"char": c, "x": x, "y": y, "w": w, "h": h,
                               "shift": shift, "offset": offs, "kerning": kern})
            f["glyphs"] = glyphs
            t = f["tpag"]
            f["glyphs_in_atlas"] = bool(t) and all(
                g["x"] + g["w"] <= t["src_w"] and g["y"] + g["h"] <= t["src_h"] for g in glyphs)
            out.append(f)
        return out

    def font(self, name):
        return self._find(self.fonts, name, "font")

    # -- SOND / AGRP / AUDO
    def _load_agrp(self):
        return self._names("AGRP")

    def _load_sond(self):
        out = []
        for i, p in enumerate(self.chunk_list("SOND")):
            v = struct.unpack_from("<IIIII2f2i", self.d, p)
            out.append({"index": i, "name": self.str(v[0]), "flags": v[1],
                        "type": self.str(v[2]), "file": self.str(v[3]), "effects": v[4],
                        "volume": v[5], "pitch": v[6], "group": v[7], "audio_id": v[8]})
        return out

    def group_file(self, group):
        if group == 0:
            return self
        if group not in self._groups:
            path = os.path.join(self.dir, "audiogroup%d.dat" % group)
            self._groups[group] = Chunked(path) if os.path.exists(path) else None
        return self._groups[group]

    def external_candidates(self, fname):
        names = [fname] if os.path.splitext(fname)[1] else [fname + ".ogg", fname + ".wav", fname]
        dirs = [self.dir, os.path.join(os.path.dirname(self.dir), "mus"), os.path.dirname(self.dir)]
        return [os.path.join(d, n) for d in dirs for n in names]

    def sound_location(self, s):
        """('data.win'|'audiogroupN.dat', offset, length) or ('external', path, None) or ('missing', ...)."""
        if s["audio_id"] >= 0:
            src = self.group_file(s["group"])
            if src is None:
                return ("missing", "audiogroup%d.dat" % s["group"], None)
            blobs = src.audo()
            if s["audio_id"] >= len(blobs):
                return ("missing", os.path.basename(src.path), None)
            off, ln = blobs[s["audio_id"]]
            return (os.path.basename(src.path), off, ln)
        for c in self.external_candidates(s["file"] or s["name"]):
            if os.path.isfile(c):
                return ("external", c, None)
        return ("missing", s["file"], None)

    def sound_bytes(self, s):
        loc = self.sound_location(s)
        if loc[0] == "missing":
            raise FileNotFoundError("sound %s: %s not found" % (s["name"], loc[1]))
        if loc[0] == "external":
            with open(loc[1], "rb") as f:
                data = f.read()
        else:
            src = self.group_file(s["group"])
            data = src.d[loc[1]:loc[1] + loc[2]]
        ext = ".ogg" if data[:4] == b"OggS" else ".wav" if data[:4] == b"RIFF" else \
            ".mp3" if data[:3] == b"ID3" or data[:2] == b"\xff\xfb" else ".bin"
        return data, ext

    def sound(self, name):
        return self._find(self.sounds, name, "sound")

    # -- OBJT / SCPT
    def _load_objt(self):
        ptrs = self.chunk_list("OBJT")
        nspr = len(self.chunk_list("SPRT"))
        n = len(ptrs)

        def valid(off_parent):
            # Bool fields between visible and depth (managed?, solid) and persistent must be 0/1.
            bools = [8] + list(range(12, off_parent - 8, 4)) + [off_parent - 4]
            for p in ptrs:
                par, mask = self.i32(p + off_parent), self.i32(p + off_parent + 4)
                if not (par == -100 or 0 <= par < n) or not (-1 <= mask < nspr):
                    return False
                if any(self.u32(p + b) > 1 for b in bools):
                    return False
            return True
        # GM2022.5+ inserts a "managed" bool after "visible"; parent then moves from +24 to +28.
        v28, v24 = valid(28), valid(24)
        if v28 == v24:
            raise ValueError("cannot determine OBJT layout (managed field present: %s/%s)" % (v28, v24))
        managed = v28
        po = 28 if managed else 24
        out = []
        for i, p in enumerate(ptrs):
            out.append({"index": i, "name": self.str(self.u32(p)), "sprite": self.i32(p + 4),
                        "visible": self.u32(p + 8), "depth": self.i32(p + po - 8),
                        "persistent": self.u32(p + po - 4), "parent": self.i32(p + po),
                        "mask": self.i32(p + po + 4)})
        self.objt_managed = managed
        return out

    def _load_scpt(self):
        out = []
        for i, p in enumerate(self.chunk_list("SCPT")):
            code = self.i32(p + 4)
            # High bit flags a constructor; the low 31 bits are still the CODE index.
            ctor = code < -1
            out.append({"index": i, "name": self.str(self.u32(p)),
                        "code": code & 0x7FFFFFFF if ctor else code, "constructor": ctor})
        return out

    # -- helpers
    @staticmethod
    def _find(items, name, kind):
        for it in items:
            if it["name"] == name:
                return it
        for it in items:
            if it["name"] and it["name"].lower() == name.lower():
                return it
        raise KeyError("%s %r not found" % (kind, name))

    def write_catalogs(self, outdir):
        os.makedirs(outdir, exist_ok=True)

        def tsv(fn, header, rows):
            with open(os.path.join(outdir, fn), "w", encoding="utf-8", newline="\n") as f:
                f.write("\t".join(header) + "\n")
                for r in rows:
                    f.write("\t".join("" if c is None else str(c) for c in r) + "\n")
        sp = self.sprites
        name_of = lambda lst, i: lst[i]["name"] if 0 <= i < len(lst) else ""
        tsv("sprites.tsv", ["index", "name", "frames", "width", "height", "origin_x", "origin_y",
                            "playback_speed", "speed_type"],
            [(s["index"], s["name"], s["frames"], s["width"], s["height"], s["origin_x"], s["origin_y"],
              s["playback_speed"], s["playback_speed_type"]) for s in sp])
        rows = []
        for s in self.sounds:
            loc = self.sound_location(s)
            where = loc[0] if loc[0] != "external" else "external:" + os.path.relpath(loc[1], os.path.dirname(self.dir)).replace("\\", "/")
            grp = name_of(self.audio_groups, s["group"])
            rows.append((s["index"], s["name"], s["file"], "%d:%s" % (s["group"], grp), where,
                         s["audio_id"], s["flags"], round(s["volume"], 4), round(s["pitch"], 4)))
        tsv("sounds.tsv", ["index", "name", "file", "group", "location", "audio_id", "flags", "volume", "pitch"], rows)
        ob = self.objects
        tsv("objects.tsv", ["index", "name", "sprite", "parent", "sprite_name", "parent_name"],
            [(o["index"], o["name"], o["sprite"], o["parent"], name_of(sp, o["sprite"]), name_of(ob, o["parent"]))
             for o in ob])
        tsv("fonts.tsv", ["index", "name", "display_name", "em_size", "bold", "italic", "range_start",
                          "range_end", "glyphs", "atlas_w", "atlas_h", "page", "glyphs_in_atlas"],
            [(f["index"], f["name"], f["display_name"], f["em_size"], f["bold"], f["italic"], f["range_start"],
              f["range_end"], len(f["glyphs"]), f["tpag"]["src_w"] if f["tpag"] else "",
              f["tpag"]["src_h"] if f["tpag"] else "", f["tpag"]["page"] if f["tpag"] else "",
              f["glyphs_in_atlas"]) for f in self.fonts])
        tsv("rooms.tsv", ["index", "name"], [(r["index"], r["name"]) for r in self.rooms])
        tsv("backgrounds.tsv", ["index", "name", "width", "height", "page"],
            [(b["index"], b["name"], b["tpag"]["bound_w"] if b["tpag"] else "",
              b["tpag"]["bound_h"] if b["tpag"] else "", b["tpag"]["page"] if b["tpag"] else "")
             for b in self.backgrounds])
        tsv("scripts.tsv", ["index", "name", "code", "constructor"],
            [(s["index"], s["name"], s["code"], int(s["constructor"])) for s in self.scripts])
        root = os.path.dirname(self.dir)
        lines = []
        mus = os.path.join(root, "mus")
        if os.path.isdir(mus):
            lines.append("# %s" % mus.replace("\\", "/"))
            for fn in sorted(os.listdir(mus)):
                if fn.lower().endswith(".ogg"):
                    lines.append("mus/%s\t%d" % (fn, os.path.getsize(os.path.join(mus, fn))))
        lines.append("# %s (loose)" % self.dir.replace("\\", "/"))
        for fn in sorted(os.listdir(self.dir)):
            if fn.lower().endswith(".ogg"):
                lines.append("%s/%s\t%d" % (os.path.basename(self.dir), fn, os.path.getsize(os.path.join(self.dir, fn))))
        with open(os.path.join(outdir, "music.txt"), "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------- CLI

def _filter(items, pattern):
    if not pattern:
        return items
    rx = re.compile(pattern, re.I)
    return [it for it in items if it["name"] and rx.search(it["name"])]


def _jsonable(d):
    return {k: v for k, v in d.items() if k not in ("frame_ptrs",)}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("datawin")
    ap.add_argument("--cache", help="directory for decoded texture page cache")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("info")
    for c in ("list-sprites", "list-sounds", "list-objects", "list-fonts", "list-backgrounds",
              "list-rooms", "list-scripts"):
        sub.add_parser(c).add_argument("regex", nargs="?")
    p = sub.add_parser("dump-sprite"); p.add_argument("name"); p.add_argument("outdir")
    p = sub.add_parser("dump-sound"); p.add_argument("name"); p.add_argument("outpath")
    p = sub.add_parser("dump-font"); p.add_argument("name"); p.add_argument("outdir")
    p = sub.add_parser("dump-background"); p.add_argument("name"); p.add_argument("out")
    p = sub.add_parser("dump-texture"); p.add_argument("index", type=int); p.add_argument("out")
    p = sub.add_parser("catalog"); p.add_argument("outdir")
    a = ap.parse_args(argv)
    dw = DataWin(a.datawin, cache_dir=a.cache)

    if a.cmd == "info":
        print(json.dumps(dw.gen8, indent=1))
        print("chunks:", " ".join("%s(%d)" % (n, dw.chunks[n][1]) for n in dw.chunk_order))
        for k in ("sprites", "backgrounds", "fonts", "sounds", "objects", "rooms", "scripts"):
            print("%-12s %d" % (k, len(getattr(dw, k))))
        print("tpag items   %d" % len(dw.tpag))
        print("audio groups", [g["name"] for g in dw.audio_groups])
        print("audo blobs   %d" % len(dw.audo()))
        for t in dw.textures:
            print("texture %d: %s %sx%s block=%s scaled=%s" % (t["index"], t["format"], t.get("width"),
                  t.get("height"), t.get("block_size"), t["scaled"]))
        print("font header extra u32 fields:", dw._font_extra_count(dw.chunk_list("FONT")))
    elif a.cmd == "list-sprites":
        for s in _filter(dw.sprites, a.regex):
            print("%d\t%s\t%d frames\t%dx%d\torigin %d,%d" % (s["index"], s["name"], s["frames"],
                  s["width"], s["height"], s["origin_x"], s["origin_y"]))
    elif a.cmd == "list-sounds":
        for s in _filter(dw.sounds, a.regex):
            loc = dw.sound_location(s)
            print("%d\t%s\t%s\tgroup %d\t%s" % (s["index"], s["name"], s["file"], s["group"],
                  loc[0] if loc[0] != "external" else loc[1]))
    elif a.cmd == "list-objects":
        for o in _filter(dw.objects, a.regex):
            sp = dw.sprites[o["sprite"]]["name"] if o["sprite"] >= 0 else "-"
            par = dw.objects[o["parent"]]["name"] if o["parent"] >= 0 else "-"
            print("%d\t%s\tsprite=%s\tparent=%s" % (o["index"], o["name"], sp, par))
    elif a.cmd == "list-fonts":
        for f in _filter(dw.fonts, a.regex):
            print("%d\t%s\t%s\tsize %s\t%d glyphs\trange %d-%d" % (f["index"], f["name"], f["display_name"],
                  f["em_size"], len(f["glyphs"]), f["range_start"], f["range_end"]))
    elif a.cmd == "list-backgrounds":
        for b in _filter(dw.backgrounds, a.regex):
            t = b["tpag"]
            print("%d\t%s\t%s" % (b["index"], b["name"], "%dx%d" % (t["bound_w"], t["bound_h"]) if t else "-"))
    elif a.cmd in ("list-rooms", "list-scripts"):
        for r in _filter(dw.rooms if a.cmd == "list-rooms" else dw.scripts, a.regex):
            print("%d\t%s" % (r["index"], r["name"]))
    elif a.cmd == "dump-sprite":
        s = dw.sprite(a.name)
        os.makedirs(a.outdir, exist_ok=True)
        frames = []
        for i in range(s["frames"]):
            w, h, px = dw.sprite_frame(s, i)
            fn = "%s_%d.png" % (s["name"], i)
            write_png(os.path.join(a.outdir, fn), w, h, px)
            frames.append(dict(dw.tpag_at(s["frame_ptrs"][i]) or {"missing_texture": True}, file=fn))
        meta = _jsonable(s)
        meta["bbox"] = {"left": s["margin_left"], "top": s["margin_top"],
                        "right": s["margin_right"], "bottom": s["margin_bottom"]}
        meta["frame_list"] = frames
        with open(os.path.join(a.outdir, s["name"] + ".json"), "w") as f:
            json.dump(meta, f, indent=1)
        print("wrote %d frames of %s (%dx%d) to %s" % (s["frames"], s["name"], s["width"], s["height"], a.outdir))
    elif a.cmd == "dump-sound":
        s = dw.sound(a.name)
        data, ext = dw.sound_bytes(s)
        out = os.path.splitext(a.outpath)[0] + ext
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)
        print("wrote %s (%d bytes, %s)" % (out, len(data), dw.sound_location(s)[0]))
    elif a.cmd == "dump-font":
        f = dw.font(a.name)
        os.makedirs(a.outdir, exist_ok=True)
        w, h, px = dw.tpag_image(f["tpag"])
        write_png(os.path.join(a.outdir, f["name"] + ".png"), w, h, px)
        with open(os.path.join(a.outdir, f["name"] + ".json"), "w") as fp:
            json.dump(f, fp, indent=1)
        print("wrote %s atlas %dx%d, %d glyphs, glyphs_in_atlas=%s" % (f["name"], w, h, len(f["glyphs"]),
              f["glyphs_in_atlas"]))
    elif a.cmd == "dump-background":
        b = dw._find(dw.backgrounds, a.name, "background")
        w, h, px = dw.tpag_on_canvas(b["tpag"])
        write_png(a.out, w, h, px)
        print("wrote %s %dx%d" % (a.out, w, h))
    elif a.cmd == "dump-texture":
        w, h, px = dw.texture(a.index)
        write_png(a.out, w, h, px)
        print("wrote %s %dx%d" % (a.out, w, h))
    elif a.cmd == "catalog":
        dw.write_catalogs(a.outdir)
        print("catalogs written to", a.outdir)


if __name__ == "__main__":
    main()
