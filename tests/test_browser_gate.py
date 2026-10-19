"""The browser release gate is wired, not decorative.

The real checks run under `scripts/check_browser.py` (Playwright, outside
pytest because they need a browser and a server).  This pins the WIRING and the
coverage surface so a refactor cannot silently drop a check class: the runner
imports both suites, the suites register the expected names, and AGENTS.md
documents the command.  Behavioural assertions live in tests/browser/*.py.
"""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

WEB_CHECKS = [
    "web-interval-view-agreement",
    "web-load-smoke",
    "web-cache-tokens",
    "web-horizon-create-buttons-consistent",
    "web-horizon-draw-save-persist",
    "web-horizon-undo-redo-clear",
    "web-horizon-storage-quota",
    "web-horizon-canvas-dpr-resize",
    "web-horizon-has-no-photo-tools",
    "web-horizon-restore-durable",
    "web-horizon-blocks-planning",
    "web-horizon-share-link",
    "web-horizon-editor-history-rollback",
    "web-horizon-overhang-blocks-sky",
    "web-horizon-phone-capture",
    "web-horizon-capture-compass-restarts",
    "web-horizon-capture-north-waits-for-compass",
    "web-horizon-capture-references-and-loop",
    "web-horizon-capture-shows-what-the-camera-saw",
    "web-horizon-capture-sharper-motion",
    "web-horizon-capture-mobile-layout",
    "web-horizon-capture-compass-prewarm",
    "web-sun-moon-above-horizon",
    "web-scrub-changes-time",
    "web-mag-slider-changes-sky",
    "web-catalog-direction-b-density",
    "web-workbench-only-render",
    "web-accessibility-essentials",
    "web-photos-online-only",
    "web-photos-fresh-and-cached",
    "web-photos-unavailable-retries",
]


def test_phase4_browser_checks_are_registered():
    runner = (ROOT / 'scripts/check_browser.py').read_text(encoding='utf-8')
    suite = (ROOT / 'tests/browser/phase4_checks.py').read_text(encoding='utf-8')
    assert 'import phase4_checks' in runner
    for name in ('popovers-and-setup', 'disclosure-focus', 'first-visit', 'responsive-planner', 'map-labels'):
        assert f'web-phase4-{name}' in suite


def test_browser_runner_imports_only_the_web_suite():
    src = (ROOT / "scripts" / "check_browser.py").read_text(encoding="utf-8")
    assert "import web_suite" in src and "import desktop_suite" not in src
    assert "--web" in src and "--desktop" not in src and "--prod-url" in src


def test_browser_suites_register_the_review_classes():
    web = (ROOT / "tests" / "browser" / "web_suite.py").read_text(encoding="utf-8")
    for name in WEB_CHECKS:
        assert f'"{name}"' in web, f"web check missing: {name}"


def test_browser_gate_is_browser_required_not_a_skip():
    harness = (ROOT / "tests" / "browser" / "harness.py").read_text(encoding="utf-8")
    # a launch failure must be a hard failure (exit 2), never a skip
    assert "check_browser FATAL: browser" in harness
    assert "return 2" in harness
    # Prose rule: compare with whitespace collapsed so rewrapping the
    # paragraph cannot break the check.
    agents = " ".join((ROOT / "AGENTS.md").read_text(encoding="utf-8").split())
    assert "scripts/check_browser.py --web" in agents
    assert "hard" in agents and "infrastructure failures, never skips" in agents


def test_browser_gate_driver_start_failure_is_exit_2(monkeypatch, capsys):
    """TO-02: entering the Playwright DRIVER is infrastructure too.

    `sync_playwright()` is entered outside the handler that converts start-up
    failures into exit 2, so a driver that cannot spawn (restricted token, broken
    install, missing driver bundle) escaped as a traceback and the process reported
    exit 1 - which the documented contract defines as "failed check(s)", the signal
    a release wrapper keys on. The conversion lives in the owner of that contract,
    `check_browser.run_gate()`."""
    import importlib.util
    import sys

    spec = importlib.util.spec_from_file_location(
        "gate_runner", ROOT / "scripts" / "check_browser.py")
    gate = importlib.util.module_from_spec(spec)
    sys.modules["gate_runner"] = gate          # annotations resolve through this
    spec.loader.exec_module(gate)              # imports the suites (self-register)

    def boom(**kwargs):
        raise PermissionError("[WinError 5] Zugriff verweigert")

    monkeypatch.setattr(gate.harness, "run", boom)
    rc = gate.run_gate(targets=("web",), verbose=False)
    out = capsys.readouterr().out
    assert rc == 2, "a driver that cannot start is infrastructure (exit 2)"
    assert "check_browser FATAL" in out and "infrastructure" in out


def test_restrictive_console_preserves_failure_categories(monkeypatch):
    import importlib.util
    import io
    import sys
    spec = importlib.util.spec_from_file_location('encoded_gate', ROOT/'scripts/check_browser.py')
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    stream = io.TextIOWrapper(io.BytesIO(), encoding='cp1252', errors='strict')
    monkeypatch.setattr(sys, 'stdout', stream)

    def failed(**kwargs):
        gate.harness.safe_print('FAIL: selected target → 星')
        return 1

    monkeypatch.setattr(gate.harness, 'run', failed)
    assert gate.run_gate(targets=('web',)) == 1
    stream.flush()
    assert b'FAIL: selected target' in stream.buffer.getvalue()
    assert b'\\u661f' in stream.buffer.getvalue()

    def infrastructure(**kwargs): raise PermissionError('driver → 星')
    monkeypatch.setattr(gate.harness, 'run', infrastructure)
    assert gate.run_gate(targets=('web',)) == 2


def test_local_module_import_burst_can_queue_while_accepting_is_busy():
    import socket
    from concurrent.futures import ThreadPoolExecutor
    import sys
    sys.path.insert(0, str(ROOT/'tests/browser'))
    import harness
    server = harness.BrowserHTTPServer(('127.0.0.1',0),lambda *a: None)
    sockets = []
    try:
        def connect(_):
            return socket.create_connection(server.server_address,timeout=1)
        with ThreadPoolExecutor(max_workers=20) as pool:
            sockets = list(pool.map(connect,range(20)))
        assert len(sockets) == 20
    finally:
        for sock in sockets: sock.close()
        server.server_close()


def test_browser_harness_starts_the_driver_exactly_once():
    """The TO-02 conversion must NOT be implemented by probing the driver.

    A throw-away `sync_playwright().start()` leaves the first instance's asyncio
    task pending, and the real gate then exited 1 after passing every check
    (observed: 12/12 passed, exit 1). One start, in the `with` that uses it."""
    src = (ROOT / "tests" / "browser" / "harness.py").read_text(encoding="utf-8")
    assert src.count("with sync_playwright() as p:") == 1, (
        "harness.py must start the Playwright driver exactly once")
    assert "_driver = sync_playwright().start()" not in src, (
        "the throw-away driver probe is back - it left the gate exiting 1 "
        "after every check passed")


def test_browser_gate_registers_public_pages_and_no_script_history():
    runner = (ROOT / "scripts/check_browser.py").read_text(encoding="utf-8")
    landing = (ROOT / "tests/browser/landing_checks.py").read_text(encoding="utf-8")
    assert "import landing_checks" in runner
    for name in ("web-landing-pages", "web-landing-history-no-js"):
        assert f'@check("{name}", "web")' in landing


def test_browser_gate_registers_the_selection_checks():
    """WEB-REV-003: target-selection continuity lives in its own module so the
    planner contract stays reviewable - and cannot silently disappear from the
    gate (the runner imports it and every check stays registered)."""
    runner = (ROOT / "scripts/check_browser.py").read_text(encoding="utf-8")
    sel = (ROOT / "tests/browser/selection_checks.py").read_text(encoding="utf-8")
    assert "import selection_checks" in runner
    for name in ("web-selection-continuity", "web-selection-origins",
                 "web-selection-close-modes", "web-selection-filter-restore",
                 "web-selection-refresh-keeps-closed",
                 "web-selection-replace-and-delete"):
        assert f'@check("{name}", "web")' in sel, f"selection check missing: {name}"
    app = (ROOT / "web/app.js").read_text(encoding="utf-8")
    # the state contract itself: identity outlives the inspector, and the
    # inspector's visibility is never inferred from the identity
    assert "detailOpen: false," in app
    assert "if (S.detailOpen && view !== S.view) closeDetail();" in app
    assert "S.detailId = null;" in app, "an invalid selection must be clearable"


def test_static_server_never_takes_a_port_chrome_refuses(monkeypatch):
    """An OS-assigned port can be one Chrome will not load (6000 failed a
    check with net::ERR_UNSAFE_PORT on 2026-10-18): the server gives it back
    and takes another."""
    import sys
    sys.path.insert(0, str(ROOT/'tests/browser'))
    import harness
    ports, closed = [6000, 6667, 41234], []

    class FakeServer:
        def __init__(self, address, handler):
            self.server_address = ('127.0.0.1', ports.pop(0))
        def server_close(self):
            closed.append(self.server_address[1])
        def serve_forever(self):
            pass

    monkeypatch.setattr(harness, 'BrowserHTTPServer', FakeServer)
    server = harness.StaticServer(ROOT/'web')
    assert server.port == 41234
    assert closed == [6000, 6667]
    assert 6000 in harness.CHROME_UNSAFE_PORTS and 8080 not in harness.CHROME_UNSAFE_PORTS


def test_browser_checks_import_planner_modules_by_their_live_urls():
    """A browser keys ES modules by URL: a check that imports './horizon.js'
    with a stale cache token, or with none, drives a second copy of the module
    with its own state instead of the planner's (web_suite.py imported
    webstore.js?v=41 and horizon.js?v=68 while the planner was at v=84/v=164).
    Checks take module and catalog URLs from harness.module_url() and
    catalog_url(), never from string literals."""
    import re
    import sys
    sys.path.insert(0, str(ROOT/'tests/browser'))
    import harness
    literal = re.compile(r"""import\(\s*['"][^'"]+\.js(?:\?[^'"]*)?['"]\s*\)"""
                         r"""|fetch\(\s*['"][^'"]*catalog\.json\?v=""")
    for stale in ("import('./webstore.js?v=41')", 'import("/astro.js")',
                  "import('./core.js')", "fetch('catalog.json?v=10')"):
        assert literal.search(stale), stale
    assert not literal.search("import(m.webstore)")
    offenders = [f"{path.name}:{n}: {line.strip()}"
                 for path in sorted((ROOT/'tests/browser').glob('*.py'))
                 for n, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1)
                 if literal.search(line)]
    assert not offenders, "use harness.module_url()/catalog_url():\n" + "\n".join(offenders)
    app = (ROOT/'web/app.js').read_text(encoding='utf-8')
    for name in ('webstore', 'horizon', 'astro', 'core', 'viztheme'):
        assert f"from '{harness.module_url(name)}'" in app, name
    assert harness.catalog_url().startswith('catalog.json?v=')
    with pytest.raises(AssertionError):
        harness.module_url('no-such-module')


def test_test_tooling_is_pinned_exactly():
    """DECISIONS.md 2026-10-19: CI used to install the newest pytest and
    Playwright on every run. Every requirement stays pinned with `==`."""
    import re
    lines = [line.split('#')[0].strip()
             for line in (ROOT/'requirements-dev.txt').read_text(encoding='utf-8').splitlines()]
    reqs = [line for line in lines if line]
    assert {re.split(r'[=<>!~ ]', r)[0].lower() for r in reqs} >= {'pytest', 'playwright'}
    loose = [r for r in reqs if not re.fullmatch(r'[A-Za-z0-9_.-]+==[0-9][\w.]*', r)]
    assert not loose, f"pin these exactly: {loose}"


def test_browser_gate_can_launch_an_explicit_executable():
    """Cloud sessions launch the preinstalled Chromium by path; the gate takes
    it from --executable or NIGHTSEAM_BROWSER_EXECUTABLE and still treats a
    launch failure as infrastructure (exit 2), never a skip."""
    import sys
    sys.path.insert(0, str(ROOT/'scripts'))
    sys.path.insert(0, str(ROOT/'tests/browser'))
    import check_browser as gate
    rc = gate.run_gate(targets=('web',), only='web-load-smoke', verbose=False,
                       executable=str(ROOT/'logs'/'no-such-browser'))
    assert rc == 2
