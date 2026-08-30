"""Generate landing/changelog.json from git release tags (newest first).

Run from the repo root:  python scripts/build_changelog.py
The download page (landing/download.html) fetches changelog.json and
renders "what's new". Summaries are CURATED user-facing text — big changes
only, plain words — not raw commit messages.

Tags without a curated summary are skipped (versions only get an entry
when there is something worth telling users about).
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "landing" / "changelog.json"

CURATED = {
    "0.5.6": "Horizon photos now survive reloading the page, and the “free space” layout setting works on any screen.",
    "0.5.5": "More stable time slider; changing the minimum altitude no longer flashes the target list.",
    "0.5.4": "Public release: open source (MIT), credits and notices, automatic update checker in the desktop app, download page.",
    "0.5.3": "Target grades (S–D) in the desktop app; weather with a 4-day forecast in both versions; new website.",
    "0.5.2": "Target grades (S–D) for the web; the sky map zoom now opens a wider rectangular view.",
    "0.5.1": "New interface: hamburger menu, Glass theme, desktop-style layout in the browser.",
    "0.5.0": "Web version: sites, rigs, custom targets, observing journal and first-run setup.",
    "0.4.2": "The web version joined the project.",
}


def git(*args):
    return subprocess.run(["git", *args], cwd=str(ROOT),
                          capture_output=True, text=True).stdout.strip()


def main():
    tags = [t for t in git("tag", "--sort=-version:refname").splitlines() if t]
    entries = []
    for t in tags:
        ver = t.lstrip("v")
        summary = CURATED.get(ver)
        if not summary:
            continue
        date = git("log", "-1", "--format=%ad", "--date=short", t)
        entries.append({"version": ver, "date": date, "summary": summary})
    OUT.write_text(json.dumps(entries, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT}: {len(entries)} curated entries")


if __name__ == "__main__":
    main()