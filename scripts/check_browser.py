"""Real-browser gate for the independent NightSeam web planner.

    python scripts/check_browser.py --all [--prod-url https://nightseam.de/astro/]
    python scripts/check_browser.py --list

Runs web checks against a private static server. Browser/driver failures are
HARD infrastructure failures (exit 2); failed checks exit 1. No desktop build
or user library is required.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests" / "browser"))

import harness  # noqa: E402
import web_suite  # noqa: E402,F401  (import registers the checks)
import landing_checks  # noqa: E402,F401
import selection_checks  # noqa: E402,F401  (WEB-REV-003 selection continuity)
import phase4_checks  # noqa: E402,F401  (planner controls, focus and responsive layout)
import remaining_checks  # noqa: E402,F401  (lazy source failure/retry and startup acceptance)
import storage_checks  # noqa: E402,F401  (atomic records and strict backup reads)
import phase2_publication_checks  # noqa: E402,F401  (immutable staged graph)
import phase3_astronomy_checks  # noqa: E402,F401  (site calendar and lunar warning regressions)
import planner_safety_checks  # noqa: E402,F401  (timezones, recovery copy, provider times)
import detail_night_checks  # noqa: E402,F401  (detail card describes the coming night)
import phase1_app_checks  # noqa: E402,F401  (save/delete failures and complete restore recovery)
import review_phase567_checks  # noqa: E402,F401  (remaining Catalog, weather and accessibility findings)
import pairing_checks  # noqa: E402,F401  (phone pairing through a stubbed relay)


def run_gate(**kwargs) -> int:
    """Run the harness, converting an INFRASTRUCTURE failure into exit 2.

    TO-02 (0.6.24 review): the Playwright DRIVER can fail to start before any
    browser exists (restricted token, broken install, missing driver bundle).
    The contract documented at the top of this file defines that as exit 2
    ("infrastructure could not start"), NOT exit 1 ("failed check(s)") - an
    escaping traceback used to report the latter, which is the signal a release
    wrapper keys on. Handled here, at the owner of the exit-code contract."""
    try:
        return harness.run(**kwargs)
    except Exception as exc:                       # noqa: BLE001
        harness.safe_print(f"check_browser FATAL: browser infrastructure could not start "
              f"({type(exc).__name__}: {exc}).")
        return 2


def main() -> int:
    ap = argparse.ArgumentParser(description="NightSeam real-browser gate")
    ap.add_argument("--web", action="store_true", help="only the web shell")
    ap.add_argument("--all", action="store_true",
                    help="all web checks (default)")
    ap.add_argument("--channel", default="chrome",
                    help="Playwright browser channel (default: chrome; 'chromium' "
                         "uses the bundled engine)")
    ap.add_argument("--executable", default=os.environ.get("NIGHTSEAM_BROWSER_EXECUTABLE") or None,
                    help="launch this Chromium binary instead of --channel (default: "
                         "$NIGHTSEAM_BROWSER_EXECUTABLE; cloud sessions set it to the "
                         "preinstalled Chromium)")
    ap.add_argument("--only", default=None,
                    help="run only checks whose name contains this substring")
    ap.add_argument("--headed", action="store_true", help="show the browser")
    ap.add_argument("--prod-url", default=None,
                    help="also run a read-only smoke against this deployed URL "
                         "(e.g. https://nightseam.de/astro/)")
    ap.add_argument("--list", action="store_true", help="list checks and exit")
    args = ap.parse_args()

    if args.list:
        for name, target, _fn in harness.all_checks():
            harness.safe_print(f"{target:7s} {name}")
        return 0

    targets = ("web",)

    return run_gate(
        channel=args.channel, targets=targets,
        only=args.only, headed=args.headed, prod_url=args.prod_url,
        executable=args.executable,
    )


if __name__ == "__main__":
    raise SystemExit(main())
