"""Cross-check: every $('#id') / getElementById referenced in JS must exist
in index.html, and vice-versa for interactive controls."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "static"

JS_ID_RE = re.compile(r"""\$\(\s*["'#]#?([\w-]+)["']?\s*\)""")
HTML_ID_RE = re.compile(r"""\bid=["']([\w-]+)["']""")


def main() -> int:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html_ids = set(HTML_ID_RE.findall(html))

    js_ids = {}
    dynamic_ids = set()
    for f in sorted((ROOT / "js").glob("*.js")):
        text = f.read_text(encoding="utf-8")
        for m in JS_ID_RE.finditer(text):
            ident = m.group(1)
            js_ids.setdefault(ident, []).append(f.name)
        # ids generated at runtime inside template literals
        for m in re.finditer(r"""id=["']([\w-]+)["']""", text):
            dynamic_ids.add(m.group(1))

    missing = {i: fs for i, fs in js_ids.items()
               if i not in html_ids and i not in dynamic_ids}
    if missing:
        print("JS references ids MISSING from index.html:")
        for i, fs in sorted(missing.items()):
            print(f"  #{i}  <- {', '.join(sorted(set(fs)))}")
    else:
        print("all JS-referenced element ids exist in index.html")

    # reverse check for well-known interactive controls (sample)
    important = ["timeSlider", "timeLabel", "siteSelect", "dateInput",
                 "btnSites", "btnPrefs", "prefsPanel", "minUsefulAlt",
                 "muaVal", "moonAware", "fltBb", "fltHa", "fltOiii",
                 "sizeUnit", "rigSelect", "nightInfo", "busy"]
    gone = [i for i in important if i not in html_ids]
    if gone:
        print("important ids missing:", gone)
        return 1
    print(f"({len(html_ids)} ids in html, {len(js_ids)} referenced from js)")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
