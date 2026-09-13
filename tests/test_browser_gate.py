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
    "web-pano-crop-recalibrate",
]
DESKTOP_CHECKS = [
    "desktop-boot",
    "desktop-worker-date-change",
    "desktop-worker-kill-sync-fallback",
    "desktop-pref-rescore",
    "desktop-advanced-mode",
    "desktop-scrub-window",
    "desktop-pano-crop-fov",
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


def test_browser_gate_driver_start_failure_is_exit_2(monkeypatch, capsys):
    """TO-02: entering the Playwright DRIVER is infrastructure too.

    `sync_playwright()` used to be entered OUTSIDE the handler that converts
    start-up failures into exit 2, so a driver that cannot spawn (restricted
    token, broken install, missing driver bundle) escaped as a traceback and the
    process reported exit 1 - which the documented contract defines as "failed
    check(s)", the signal a release wrapper keys on. Drive the harness with a
    driver that raises and assert the contract."""
    import sys
    import types

    # import the gate the way scripts/check_browser.py does: tests/browser on the
    # path, then the suites, which self-register their checks
    monkeypatch.syspath_prepend(str(ROOT / "tests" / "browser"))
    import harness as gate_harness
    import web_suite  # noqa: F401 - registers the web checks

    class _Boom:
        def start(self):
            raise PermissionError("[WinError 5] Zugriff verweigert")

    # stub the import target itself, so the pin needs no playwright install
    pkg = types.ModuleType("playwright")
    pkg.__path__ = []
    sub = types.ModuleType("playwright.sync_api")
    sub.sync_playwright = lambda: _Boom()
    monkeypatch.setitem(sys.modules, "playwright", pkg)
    monkeypatch.setitem(sys.modules, "playwright.sync_api", sub)

    rc = gate_harness.run(targets=("web",), verbose=False)
    out = capsys.readouterr().out
    assert rc == 2, "a driver that cannot start is infrastructure (exit 2)"
    assert "check_browser FATAL" in out and "driver" in out
