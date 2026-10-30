"""Stamps a new version on every module URL so browsers never mix cached files from an old
deploy with new ones (GitHub Pages lets browsers cache each file for 10 minutes).

Run before each publish: python -I tools/stamp_version.py
- every relative .js import in src/ gets ?v=<version>
- index.html loads src/main.js?v=<version> and knows its version
- version.json holds the version, which the page checks to reload itself when stale
Assets are fetched with the same ?v= (see src/runtime/assets.js).
"""
import datetime, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")

IMPORT = re.compile(r"""((?:from|import)\s*\(?\s*')(\.{1,2}/[^'?]+\.js)(\?v=[^']*)?(')""")


def stamp_js(path):
    with open(path, encoding="utf-8") as f:
        src = f.read()
    out = IMPORT.sub(lambda m: m.group(1) + m.group(2) + "?v=" + VERSION + m.group(4), src)
    if out != src:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(out)
        return True
    return False


def main():
    changed = 0
    for d, _, files in os.walk(os.path.join(ROOT, "src")):
        for fn in files:
            if fn.endswith(".js") and stamp_js(os.path.join(d, fn)):
                changed += 1
    index = os.path.join(ROOT, "index.html")
    with open(index, encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r'src="src/main\.js(\?v=[^"]*)?"', 'src="src/main.js?v=%s"' % VERSION, html)
    html = re.sub(r"window\.APP_VERSION = '[^']*'", "window.APP_VERSION = '%s'" % VERSION, html)
    with open(index, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    with open(os.path.join(ROOT, "version.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({"v": VERSION}, f)
        f.write("\n")
    print("version", VERSION, "- stamped", changed, "modules")


if __name__ == "__main__":
    main()
