"""Probe: every backticked path-like token in the current docs vs the tree.

Historical documents are excluded on purpose. A token is only reported when it
looks like a repo path (contains a slash or has a known source/data suffix) and
resolves to nothing in the tree.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DOCS = ["AGENTS.md", "CATALOG.md", "DECISIONS.md", "DESIGN.md", "README.md",
        "ENVIRONMENT.md", "RELEASES.md", "NOTICE"]
SUFFIX = (".py", ".js", ".mjs", ".md", ".csv", ".json", ".html", ".css", ".ps1",
          ".exe", ".zip", ".txt", ".mjs", ".db")
TOKEN = re.compile(r"`([^`\n]+)`")
SKIP = ("http", " ", "?", "=", "*", "<", ">", "$", "|", "(", ")", "\\")


def looks_like_path(t: str) -> bool:
    t = t.strip()
    if not t or any(s in t for s in SKIP):
        return False
    if t.startswith(("-", "python", "git", "powershell", "pip")):
        return False
    if t.endswith(SUFFIX):
        return True
    return "/" in t and not t.endswith("/")


for doc in DOCS:
    text = (ROOT / doc).read_text(encoding="utf-8")
    missing = []
    for i, line in enumerate(text.splitlines(), 1):
        for tok in TOKEN.findall(line):
            for cand in [c.strip().rstrip(".,;:") for c in tok.split("+")]:
                if not looks_like_path(cand):
                    continue
                p = cand.split(" ")[0]
                if (ROOT / p).exists():
                    continue
                # also try dropping a leading ./ or a trailing argument
                if (ROOT / p.lstrip("./")).exists():
                    continue
                missing.append((i, p, line.strip()[:100]))
    if missing:
        print(f"--- {doc} ---")
        for i, p, line in missing:
            print(f"  L{i}: {p!r}  |  {line}")
