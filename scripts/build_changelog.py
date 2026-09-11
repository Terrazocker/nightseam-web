"""Generate landing/changelog.json from git release tags (newest first).

Run from the repo root:  python scripts/build_changelog.py
                         python scripts/build_changelog.py --check
The download page (landing/download.html) fetches changelog.json and
renders "what's new". Summaries are CURATED user-facing text — big changes
only, plain words — not raw commit messages.

Tags without a curated summary are skipped (versions only get an entry
when there is something worth telling users about) — but they are no longer
silently skipped: the run reports them in two classes and `--check` FAILS
(exit 1) when a tag NEWER than the newest curated entry has no summary. That
is the class that makes the download page go stale; the pre-0.4.2 backlog is
historical noise and is only counted.

`--check` writes nothing, so it is safe as a pre-flight gate.
scripts/check_release.py reads the SAME CURATED table (by importing this
file) and fails the release when the tag being released has no summary.
Curate the entry BEFORE tagging: editing this file after the tag makes every
published version string '-dirty'.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "landing" / "changelog.json"

CURATED = {
    # 0.6.11 is a correctness + chart-tools release: Sun/Moon visibility, the
    # web magnitude slider, desktop zoom parity and the web panorama editor.
    "0.6.11": "Bug-fix and chart-tools release. On the all-sky chart the Sun and Moon could appear in the sky while they were really below the horizon - both apps now draw them only while they are actually up at the selected time. The web chart gains the desktop's magnitude slider (hide objects fainter than a chosen limit), the desktop chart's wheel-zoom now opens the same full rectangular window as the web, and the web panorama editor gains alignment guides (azimuth, altitude and horizon lines), joins a 360-degree panorama seamlessly at the edges, and fixes sky-mask \"open above\" handling and the compass labels on partial panoramas. Web cache tokens were bumped so the updated files reach returning visitors.",
    # 0.6.10 is a desktop+web consistency release: the eight confirmed
    # desktop/web parity differences from the 0.6.9 audit are fixed.
    "0.6.10": "Consistency release: the desktop app and the web planner now agree everywhere. The night window is identical in both apps at every latitude - including polar twilight, where the web could pick the wrong night - the Dark time card shows the twilight level actually used for scoring, the minimum altitude follows the Bortle class immediately, and \"Best targets tonight\" only lists targets that really clear the sky during the night. Frame coverage and filter advice now read the same in both apps, and the arrow-key time step is 6/60 minutes in both.",
    # 0.6.9 is the first desktop release since the rename: it carries every
    # 0.6.1-0.6.8 web change AND the accuracy/security/consistency work.
    "0.6.9": "Accuracy, safety and consistency release. Object positions were off by up to half a degree (a precession bug, fixed in all sky-calculation engines), importing a setup file can no longer read or write files outside your own archive, and the clear-window times no longer include twilight. The web planner now resolves the same night, moon and filter scores as the desktop in any time zone. This build also brings the desktop app up to date with every web change since 0.6.0.",
    # 0.6.1-0.6.8 were WEB-only releases (no new desktop build was published),
    # so each entry says so - a desktop user reading the download page should
    # not expect these in their 0.6.0 exe.
    "0.6.8": "Web: internal stylesheet version bump so the 0.6.7 layout reaches visitors who still had the old file cached.",
    "0.6.7": "The imaging-rig (framing) selector moved out of the menu and into the top bar, right next to the site selector - in both the desktop app and the web version. Web release; the desktop change arrives with 0.6.9.",
    "0.6.6": "Web: the Sites, Rigs and Targets forms no longer render before you open them.",
    "0.6.5": "Web: the last visible traces of the popularity score are gone (the \"Popular\" filter chip). The desktop's popularity sort option was removed in the same step and ships with 0.6.9.",
    "0.6.4": "Telescope presets are now a picker instead of automatic entries: a fresh setup starts empty and \"Add rig\" offers the Seestar / DWARF models or a custom rig. Web release; the desktop version arrives with 0.6.9.",
    "0.6.3": "Web: the community-popularity number is no longer displayed anywhere - it still breaks ties in the ranking, silently.",
    "0.6.2": "Web: fixed an update-order problem that could briefly serve the app's page before its scripts, leaving visitors with a broken view until they reloaded.",
    "0.6.1": "Web: sample telescope presets (ZWO Seestar, DwarfLab) with their field of view, plus layout fixes. They were added automatically at the time; 0.6.4 turned them into a picker.",
    "0.6.0": "AstroPilot is now NightSeam: new name, and the website has moved to nightseam.de. Planning and the image library work exactly as before. If you replace an older installation in place, rename data/astropilot.db to data/nightseam.db to keep your sites and captures.",
    "0.5.12": "Reliability release: a failed backup import can no longer wipe your data, planning now resolves the correct night at every location (timezone fix), safer panorama handling, and many small fixes in both apps.",
    "0.5.11": "Targets are ranked with community popularity as a silent tiebreaker, and moon-aware scoring now accounts for the Moon's phase, your filters and your sky brightness (Bortle class).",
    "0.5.10": "The web setup wizard is centred correctly, more controls carry proper accessibility labels, and the library and panorama handling got small fixes.",
    "0.5.9": "Better keyboard and screen-reader support (dialog roles, focus traps, labelled search), smoother handling of very large imports, and internal cleanups.",
    "0.5.8": "Safer backup import (a safety copy is written before anything is replaced), streamed uploads that no longer need the whole session in memory, and small web fixes.",
    "0.5.7": "The session journal was removed from both versions — planning and the image library are unchanged, but observed marks and journal notes are gone.",
    "0.5.6": "Horizon photos now survive reloading the page, and the “free space” layout setting works on any screen.",
    "0.5.5": "More stable time slider; changing the minimum altitude no longer flashes the target list.",
    "0.5.4": "Public release: open source (MIT), credits and notices, automatic update checker in the desktop app, download page.",
    "0.5.3": "Target grades (S–D) in the desktop app; weather with a 4-day forecast in both versions; new website.",
    "0.5.2": "Target grades (S–D) for the web; the sky map zoom now opens a wider rectangular view.",
    "0.5.1": "New interface: hamburger menu, Glass theme, desktop-style layout in the browser.",
    "0.5.0": "Web version: sites, rigs, custom targets and first-run setup.",
    "0.4.2": "The web version joined the project.",
}


def git(*args):
    """stdout of git, captured WITHOUT pipes.

    The DSH sandbox denies pipe creation to spawned processes, so
    capture_output=True dies with PermissionError [WinError 5]. The fallback
    redirects stdout into a file inside the repo (the platform temp dir is not
    writable there) - the same helper as scripts/check_release.py:git().
    """
    argv = ["git", *args]
    try:
        return subprocess.run(argv, cwd=str(ROOT), capture_output=True,
                              text=True).stdout.strip()
    except OSError:
        pass
    tmp_dir = ROOT / "logs" if (ROOT / "logs").is_dir() else ROOT
    tmp = tmp_dir / f".git-capture-{os.getpid()}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            subprocess.run(argv, cwd=str(ROOT), stdout=fh,
                           stderr=subprocess.DEVNULL)
        return tmp.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return ""
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass


def split_uncurated(tags, curated):
    """Split uncurated tags into (since the newest curated entry, older).

    `tags` is newest-first (git tag --sort=-version:refname). Only the first
    list matters for release integrity: those are the releases that happened
    AFTER the newest entry the public changelog knows about. Everything older
    is the historical backlog (pre-0.4.2 tags) and is never curated.
    """
    versions = [t.lstrip("v") for t in tags]
    newest = next((i for i, v in enumerate(versions) if v in curated), None)
    if newest is None:
        return list(versions), []
    return ([v for v in versions[:newest] if v not in curated],
            [v for v in versions[newest + 1:] if v not in curated])


def build_entries(tags, dates, curated=None):
    """Curated entries, newest first, with each tag's date."""
    curated = CURATED if curated is None else curated
    entries = []
    for t in tags:
        ver = t.lstrip("v")
        summary = curated.get(ver)
        if summary:
            entries.append({"version": ver, "date": dates(t), "summary": summary})
    return entries


def report(backlog, older, newest_curated):
    """Print the curation status; returns the number of blocking tags."""
    if backlog:
        shown = ", ".join(backlog[:8]) + (" ..." if len(backlog) > 8 else "")
        print(f"WARNING: {len(backlog)} release tag(s) SINCE the newest curated "
              f"entry ({newest_curated}) have no summary, so the download "
              f"page's \"What's new\" is stale: {shown}")
        print("         Add a plain-words entry to CURATED above - commit it "
              "BEFORE tagging, or the published version string turns '-dirty'. "
              "A tag that was web-only (no new desktop build) still deserves an "
              "entry saying so.")
    if older:
        shown = ", ".join(older[:8]) + (" ..." if len(older) > 8 else "")
        print(f"note: {len(older)} further uncurated tag(s) predate the newest "
              f"curated entry (historical backlog, never curated): {shown}")
    return len(backlog)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Generate landing/changelog.json from the curated summaries, "
                    "or --check that no release since the newest curated entry "
                    "is missing one.")
    parser.add_argument("--check", action="store_true",
                        help="write nothing and exit non-zero when a release tag "
                             "newer than the newest curated entry has no summary")
    args = parser.parse_args(argv)

    tags = [t for t in git("tag", "--sort=-version:refname").splitlines() if t]
    if not tags:
        print("no git tags found - run from the repo root of a tagged checkout.")
        return 1 if args.check else 0

    backlog, older = split_uncurated(tags, CURATED)
    newest_curated = next((t.lstrip("v") for t in tags if t.lstrip("v") in CURATED),
                          "none")

    if not args.check:
        def date_of(tag):
            return git("log", "-1", "--format=%ad", "--date=short", tag)

        entries = build_entries(tags, date_of)
        OUT.write_text(json.dumps(entries, indent=1) + "\n", encoding="utf-8")
        print(f"{OUT}: {len(entries)} curated entries")

    blocking = report(backlog, older, newest_curated)
    if args.check:
        if blocking:
            print(f"curation check: FAILED - {blocking} release(s) after "
                  f"{newest_curated} are missing from the public changelog.")
            return 1
        print(f"curation check: OK - every release after {newest_curated} has a "
              "curated summary.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
