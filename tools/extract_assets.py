"""Extract the assets the Jevil simulator needs from a DELTARUNE install into assets/.

Usage: python -I tools/extract_assets.py --game "D:/Steam/steamapps/common/DELTARUNE" --out assets
"""
import argparse, json, os, re, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from datawin import DataWin, write_png, blit  # noqa: E402

SPRITE_PATTERNS = [
    r"^spr_joker", r"^spr_jokerscythe", r"^jokerscythebig_mask$",
    r"^spr_(krisb|susieb|ralseib)_", r"^spr_head(kris|susie|ralsei)$", r"^spr_bname(kris|susie|ralsei)$",
    r"^spr_bt(fight|act|tech|item|spare|defend)$",
    r"^spr_(heart|dodgeheart|heartoutline|heartoutline2|heartbreak|heartshards|heartsmall|heart_centered)$",
    r"^spr_(grazeappear|grazemask|healsparkle|hypnoring|pirouette_fx|shine|sparestar|sparestar_anim|tiredmark)$",
    r"^spr_(spadebullet|spadebullet_chunk|clubsbullet|clubsbullet_dark|clubsball_[abc]|heartbullet|diamondbullet.*|suitsbomb|bomb_.*|carousel|carouselbg|smallbullet)$",
    r"^spr_(rudebuster_beam.*|susie_rudebuster|lightfairy)$",
    r"^spr_(tensionbar|tensionmarker|tplogo|hpname|hpslash|chartarget|morearrow|battlemsg|numbersfontbig|numbersfontsmall)$",
    r"^spr_(battleblcon.*|textbox_(top|left|topleft)|battletarget_triangle|tallpx|pxwhite|battlebg_0)$",
    r"^spr_(attack_mash[12]|attack_slap1|attackspot|pressfront|pressfront_b|pressspot|uselessbird|defeatsweat)$",
    r"^spr_(krisr_dark|susier_dark|ralseir)$",
]
FONTS = ["fnt_main", "fnt_mainbig", "fnt_small", "fnt_dotumche", "fnt_tinynoelle"]
SOUND_PATTERNS = [
    r"^snd_joker_[a-z0-9]+$",
    r"^snd_(applause|awkward|badexplosion|bomb|bombfall|boost|break1|break2|bump|carhonk|criticalswing|damage|defeatrun"
    r"|graze|hurt1|hypnosis|impact|laz_c|menumove|phone|pirouette|power|rudebuster_hit|rudebuster_swing|rumble"
    r"|screenshake|scytheburst|select|spare|spearappear|swing|text|toilet|txtjok|txtral|txtsus|weirdeffect"
    r"|heal_c|spellcast|boost|item|great_shine|cancel|equip|won|levelup|dtrans_lw|wing|noise)$",
]
MUSIC = ["joker.ogg", "AUDIO_DEFEAT.ogg", "prejoker.ogg"]
TEXT_KEY_PATTERNS = [r"^obj_joker", r"^obj_battlecontroller", r"^scr_", r"^obj_spell", r"^obj_heal", r"^obj_pacify",
                     r"^obj_gameover", r"^obj_jokerbattleevent"]


def load_extra_lists():
    """tools/extra_assets_*.txt: one 'spr:<regex>', 'snd:<regex>', 'font:<name>' or 'text:<regex>' per line."""
    here = os.path.dirname(os.path.abspath(__file__))
    for fn in sorted(os.listdir(here)):
        if not (fn.startswith("extra_assets_") and fn.endswith(".txt")):
            continue
        with open(os.path.join(here, fn), encoding="utf-8") as f:
            for line in f:
                line = line.split("#", 1)[0].strip()
                if not line or ":" not in line:
                    continue
                kind, val = line.split(":", 1)
                val = val.strip()
                if kind == "spr":
                    SPRITE_PATTERNS.append(val if val.startswith("^") else "^%s$" % val)
                elif kind == "snd":
                    SOUND_PATTERNS.append(val if val.startswith("^") else "^%s$" % val)
                elif kind == "font" and val not in FONTS:
                    FONTS.append(val)
                elif kind == "text":
                    TEXT_KEY_PATTERNS.append(val)


def strip_png(dw, s):
    w, h, n = s["width"], s["height"], max(1, s["frames"])
    out = bytearray(w * n * h * 4)
    for i in range(s["frames"]):
        fw, fh, px = dw.sprite_frame(s, i)
        blit(out, w * n, h, px, fw, fh, i * w, 0)
    return w * n, h, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    load_extra_lists()
    ch1 = os.path.join(a.game, "chapter1_windows")
    dw = DataWin(os.path.join(ch1, "data.win"))
    for sub in ("sprites", "fonts", "sounds", "music", "text"):
        os.makedirs(os.path.join(a.out, sub), exist_ok=True)

    sprites = {}
    for s in dw.sprites:
        if not any(re.search(p, s["name"]) for p in SPRITE_PATTERNS):
            continue
        w, h, px = strip_png(dw, s)
        write_png(os.path.join(a.out, "sprites", s["name"] + ".png"), w, h, px)
        sprites[s["name"]] = {
            "w": s["width"], "h": s["height"], "ox": s["origin_x"], "oy": s["origin_y"], "n": s["frames"],
            "bbox": [s["margin_left"], s["margin_top"], s["margin_right"], s["margin_bottom"]],
            "bboxMode": s["bbox_mode"], "sepMasks": s["sep_masks"],
        }
    with open(os.path.join(a.out, "sprites.json"), "w") as f:
        json.dump(sprites, f, separators=(",", ":"), sort_keys=True)

    fonts = {}
    for name in FONTS:
        fo = dw.font(name)
        w, h, px = dw.tpag_image(fo["tpag"])
        write_png(os.path.join(a.out, "fonts", name + ".png"), w, h, px)
        fonts[name] = {"size": fo["em_size"], "scale": [fo["scale_x"], fo["scale_y"]],
                       "glyphs": {str(g["char"]): [g["x"], g["y"], g["w"], g["h"], g["shift"], g["offset"]]
                                  for g in fo["glyphs"]}}
    with open(os.path.join(a.out, "fonts.json"), "w") as f:
        json.dump(fonts, f, separators=(",", ":"))

    sounds = {}
    for s in dw.sounds:
        if not any(re.search(p, s["name"]) for p in SOUND_PATTERNS):
            continue
        data, ext = dw.sound_bytes(s)
        fn = s["name"] + ext
        with open(os.path.join(a.out, "sounds", fn), "wb") as f:
            f.write(data)
        sounds[s["name"]] = {"file": fn, "volume": s["volume"]}
    with open(os.path.join(a.out, "sounds.json"), "w") as f:
        json.dump(sounds, f, separators=(",", ":"), sort_keys=True)

    for m in MUSIC:
        shutil.copyfile(os.path.join(a.game, "mus", m), os.path.join(a.out, "music", m))

    with open(os.path.join(ch1, "lang", "lang_en.json"), encoding="utf-8") as f:
        lang = json.load(f)
    text = {k: v for k, v in lang.items() if any(re.search(p, k) for p in TEXT_KEY_PATTERNS)}
    with open(os.path.join(a.out, "text", "en.json"), "w", encoding="utf-8") as f:
        json.dump(text, f, ensure_ascii=False, indent=0, sort_keys=True)

    print("sprites %d, fonts %d, sounds %d, music %d, text keys %d"
          % (len(sprites), len(fonts), len(sounds), len(MUSIC), len(text)))


if __name__ == "__main__":
    main()
