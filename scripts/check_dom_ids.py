"""Cross-check: every $('#id') referenced in JS must exist in that app's HTML.

Covers both JS graphs: the desktop UI (static/js/*.js against static/index.html)
and the web app (web/*.js against web/index.html).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

APPS = [
    # (label, html file, js files)
    ("desktop", REPO / "static" / "index.html",
     sorted((REPO / "static" / "js").glob("*.js"))),
    ("web", REPO / "web" / "index.html",
     sorted((REPO / "web").glob("*.js"))),
]

# ids that only exist at runtime (created by JS template literals) or that are
# looked up defensively with `if (el)`; keep the exceptions explicit here
IGNORED = {
    "err-banner", "splash-text", "toasts",
}

JS_ID_RE = re.compile(r"""\$\(\s*["'#]#?([\w-]+)["']?\s*\)""")
HTML_ID_RE = re.compile(r"""\bid=["']([\w-]+)["']""")


def check(label: str, html_path: Path, js_files: list[Path]) -> int:
    if not html_path.is_file():
        print(f"{label}: no {html_path.name} - skipped")
        return 0
    html_ids = set(HTML_ID_RE.findall(html_path.read_text(encoding="utf-8")))

    js_ids: dict[str, list[str]] = {}
    dynamic_ids: set[str] = set()
    for f in js_files:
        text = f.read_text(encoding="utf-8")
        for m in JS_ID_RE.finditer(text):
            js_ids.setdefault(m.group(1), []).append(f.name)
        for m in re.finditer(r"""id=["']([\w-]+)["']""", text):
            dynamic_ids.add(m.group(1))

    missing = {i: fs for i, fs in js_ids.items()
               if i not in html_ids and i not in dynamic_ids and i not in IGNORED}
    if missing:
        print(f"{label}: JS references ids MISSING from {html_path.name}:")
        for i, fs in sorted(missing.items()):
            print(f"  #{i}  <- {', '.join(sorted(set(fs)))}")
    else:
        print(f"{label}: all JS-referenced element ids exist in {html_path.name}")
    print(f"  ({len(html_ids)} ids in html, {len(js_ids)} referenced from js)")
    return 1 if missing else 0


def main() -> int:
    errors = 0
    for label, html_path, js_files in APPS:
        errors += check(label, html_path, js_files)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
