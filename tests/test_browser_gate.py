"""The browser release gate is wired, not decorative.

The real checks run under `scripts/check_browser.py` (Playwright, outside
pytest because they need a browser and a server).  This pins the WIRING and the
coverage surface so a refactor cannot silently drop a check class: the runner
imports both suites, the suites register the expected names, and AGENTS.md
documents the command.  Behavioural assertions live in tests/browser/*.py.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

WEB_CHECKS = [
    "web-load-smoke",
    "web-cache-tokens",
    "web-horizon-actions-not-full-width",
    "web-pano-paint-save-persist",
    "web-pano-undo-redo-clear",
    "web-pano-storage-quota",
    "web-pano-canvas-dpr-resize",
    "web-sky-band-no-diagonal-chord",
    "web-sun-moon-above-horizon",
    "web-scrub-changes-time",
    "web-mag-slider-changes-sky",
]
DESKTOP_CHECKS = [
    "desktop-boot",
    "desktop-worker-date-change",
    "desktop-worker-kill-sync-fallback",
    "desktop-pref-rescore",
    "desktop-advanced-mode",
    "desktop-scrub-window",
]


def test_browser_runner_imports_both_suites():
    src = (ROOT / "scripts" / "check_browser.py").read_text(encoding="utf-8")
    assert "import web_suite" in src and "import desktop_suite" in src
    assert "--web" in src and "--desktop" in src and "--prod-url" in src


def test_browser_suites_register_the_review_classes():
    web = (ROOT / "tests" / "browser" / "web_suite.py").read_text(encoding="utf-8")
    desk = (ROOT / "tests" / "browser" / "desktop_suite.py").read_text(encoding="utf-8")
    for name in WEB_CHECKS:
        assert f'"{name}"' in web, f"web check missing: {name}"
    for name in DESKTOP_CHECKS:
        assert f'"{name}"' in desk, f"desktop check missing: {name}"


def test_browser_gate_is_browser_required_not_a_skip():
    harness = (ROOT / "tests" / "browser" / "harness.py").read_text(encoding="utf-8")
    # a launch failure must be a hard failure (exit 2), never a skip
    assert "check_browser FATAL: browser" in harness
    assert "return 2" in harness
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    assert "scripts/check_browser.py --all" in agents
    assert "HARD failure" in agents
