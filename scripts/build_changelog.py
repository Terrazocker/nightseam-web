"""Generate landing/changelog.json from git release tags (newest first).

Run from the repo root:  python scripts/build_changelog.py
The download page (landing/download.html) fetches changelog.json and
renders the version history. Committed so the site stays static.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "landing" / "changelog.json"


def git(*args):
    return subprocess.run(["git", *args], cwd=str(ROOT),
                          capture_output=True, text=True).stdout.strip()


def main():
    tags = [t for t in git("tag", "--sort=-version:refname").splitlines() if t]
    entries = []
    for t in tags:
        date = git("log", "-1", "--format=%ad", "--date=short", t)
        msg = git("log", "-1", "--pretty=%s", t)
        # keep only the summary after any "AstroPilot X.Y.Z:" prefix
        summary = msg
        for sep in (": ", " — "):
            if sep in msg:
                summary = msg.split(sep, 1)[1]
                break
        entries.append({"version": t.lstrip("v"), "date": date, "summary": summary})
    OUT.write_text(json.dumps(entries, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT}: {len(entries)} releases")


if __name__ == "__main__":
    main()