"""Shared plumbing for the real-browser release gate (tests/browser/*).

Two targets, both driven by Playwright against a REAL browser engine (a
browser that cannot launch is a HARD failure, exactly like a missing node in
`tests/js/*` - never a silent skip):

  web      a static HTTP server over `web/`, opened in system Chrome
  desktop  the PACKED `dist/NightSeam.exe`, copied into a throwaway temp dir
           so its `data/` never touches the user's install, then driven over
           the local FastAPI server it starts (`--no-browser`)

Every check gets a fresh, deterministic context: UTC timezone, en-US locale,
dark scheme, fixed viewport, a pinned fake clock, and empty storage.  Checks
assert something a user can see; implementation details are only used to reach
a state.

This is NOT a pytest suite (pytest only collects `test_*.py` / `*_test.py`;
the modules here are named `*_suite.py` and take a `ctx`, not fixtures), so
`python -m pytest tests/` never touches it.  `scripts/check_browser.py` is the
runner.  Only stdlib + playwright are imported.
"""

from __future__ import annotations

import hashlib
import http.server
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = ROOT / "web"
DEFAULT_EXE = ROOT / "dist" / "NightSeam.exe"
ARTIFACTS = ROOT / "tests" / "browser" / "artifacts"

# Pinned wall clock: a real, non-degenerate late-summer night.  Passed as an
# ISO string on purpose - Playwright's numeric `clock.install(time=...)` is
# interpreted as SECONDS in the Python binding (a 1000x skew), the string is not.
PINNED_ISO = "2026-08-12T22:00:00Z"
PINNED_DATE = "2026-08-12"
TZ = "UTC"
VIEWPORT = (1366, 900)

_CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


# ---------------------------------------------------------------- registry

_TESTS: list[tuple[str, str, object]] = []


def check(name: str, target: str):
    """Register a browser check under `name` for `target` ("web"/"desktop")."""
    if target not in ("web", "desktop"):
        raise ValueError(target)

    def deco(fn):
        _TESTS.append((name, target, fn))
        return fn

    return deco


def all_checks():
    return list(_TESTS)


# ---------------------------------------------------------------- helpers


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _http(url: str, method: str = "GET", body: dict | None = None,
          timeout: float = 10.0):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


class StaticServer:
    """Threading HTTP server over a directory (no cache-busting rewritten)."""

    def __init__(self, directory: Path):
        handler = partial(_QuietHandler, directory=str(directory))
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.port = self.httpd.server_address[1]
        self._thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    def start(self) -> str:
        self._thread.start()
        return f"http://127.0.0.1:{self.port}/"

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # keep the gate output readable
        pass


class DesktopServer:
    """The packed exe, isolated in a temp dir (never the user's data)."""

    def __init__(self, exe: Path = DEFAULT_EXE, seed: bool = True):
        self.exe = Path(exe)
        self.seed = seed
        self.tmp: Path | None = None
        self.proc: subprocess.Popen | None = None
        self.port = 0
        self.base = ""

    def start(self, timeout: float = 45.0) -> str:
        if not self.exe.is_file():
            raise RuntimeError(f"packed exe not found: {self.exe}")
        self.tmp = Path(tempfile.mkdtemp(prefix="ns-browser-"))
        exe = self.tmp / "NightSeam.exe"
        shutil.copy2(self.exe, exe)
        self.port = free_port()
        self.proc = subprocess.Popen(
            [str(exe), "--no-browser", "--port", str(self.port),
             "--idle-exit-hours", "0"],
            cwd=str(self.tmp), stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, creationflags=_CREATE_NO_WINDOW)
        self.base = f"http://127.0.0.1:{self.port}/"
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"packed exe exited early (code {self.proc.returncode})")
            try:
                _http(self.base + "api/state", timeout=2.0)
                break
            except Exception:
                time.sleep(0.3)
        else:
            raise RuntimeError("packed exe never answered /api/state")
        if self.seed:
            _http(self.base + "api/sites", "POST",
                  {"name": "Gate Site", "lat": 52.52, "lon": 13.4, "elev": 34})
            _http(self.base + "api/settings", "POST", {"wizard_done": True})
        return self.base

    def api(self, path: str, method: str = "GET", body: dict | None = None):
        return _http(self.base + path.lstrip("/"), method, body)

    def stop(self):
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        if self.tmp is not None:
            shutil.rmtree(self.tmp, ignore_errors=True)


# ---------------------------------------------------------------- context

class Ctx:
    """Per-check browser context + the assertions a check may make."""

    def __init__(self, page, base: str, target: str, artifacts: Path):
        self.page = page
        self.base = base
        self.target = target
        self.artifacts = artifacts
        self.console_errors: list[str] = []
        self.page_errors: list[str] = []
        self.bad_responses: list[str] = []
        self.external_images: list[tuple[int, str]] = []
        self._allow_console = False
        self._allow_responses = False

    # same-origin URL used to decide which responses belong to the app under
    # test (external CDNs/images are not the gate's business).
    @property
    def origin(self) -> str:
        return "/".join(self.base.split("/")[:3])

    def goto(self, path: str = "/"):
        self.page.goto(self.base.rstrip("/") + path,
                       wait_until="domcontentloaded")

    def url(self, path: str = "/") -> str:
        return self.base.rstrip("/") + path

    def expect(self, cond, msg: str):
        if not cond:
            raise AssertionError(msg)

    def expect_eq(self, got, want, msg: str = ""):
        if got != want:
            raise AssertionError(f"{msg}: got {got!r}, want {want!r}")

    def expect_in(self, needle, haystack, msg: str = ""):
        if needle not in (haystack or ""):
            raise AssertionError(
                f"{msg}: {needle!r} not in {(haystack or '')[:300]!r}")

    def allow_console_errors(self, reason: str):
        self._allow_console = True

    def allow_failed_responses(self, reason: str):
        self._allow_responses = True

    def assert_clean(self):
        """Every check that does not deliberately break something ends here:
        no console errors, no uncaught exceptions, no same-origin 4xx/5xx - and
        no request to a third party (the popularity source tripwire)."""
        attempts = getattr(self.page, "_ns_external_attempts", None) or []
        if attempts:
            raise AssertionError(
                "NightSeam must not contact the popularity source (or any third party) at "
                "boot; the popularity snapshot ships in the catalog. Attempted: "
                + "; ".join(attempts[:3]))
        if self.page_errors and not self._allow_console:
            raise AssertionError("uncaught page errors: " + "; ".join(self.page_errors[:5]))
        if self.console_errors and not self._allow_console:
            raise AssertionError("console errors: " + "; ".join(self.console_errors[:5]))
        if self.bad_responses and not self._allow_responses:
            raise AssertionError("failed same-origin responses: "
                                 + "; ".join(self.bad_responses[:5]))

    # -- waiting helpers

    def wait_hidden(self, selector: str, timeout: float = 45000.0):
        self.page.wait_for_function(
            """(sel) => { const e = document.querySelector(sel);
                 return !e || e.classList.contains('hidden')
                        || getComputedStyle(e).display === 'none'
                        || getComputedStyle(e).visibility === 'hidden'; }""",
            arg=selector, timeout=timeout)

    def wait_visible(self, selector: str, timeout: float = 45000.0):
        self.page.wait_for_selector(selector, state="visible", timeout=timeout)

    def wait_app(self, ready_selector: str, timeout: float = 60000.0):
        self.page.wait_for_selector("#view", timeout=timeout)
        self.page.wait_for_selector(ready_selector, timeout=timeout)
        try:
            self.wait_hidden("#busy", timeout=20000)
        except Exception:
            pass


# ---------------------------------------------------------------- runner

@dataclass
class Result:
    name: str
    target: str
    ok: bool
    error: str = ""
    duration: float = 0.0


def _install_stubs(page):
    """The gate is offline + deterministic, and NightSeam must not contact a
    third party at boot: the popularity source popularity snapshot is BAKED into the
    catalog payload (`web/app.js::popularityOf` reads `o.popularity`), and the
    web app has no live fetch left. This route is therefore a TRIPWIRE, not a
    stub - any request to it is aborted and recorded, and `Ctx.assert_clean()`
    fails the check that made it, on both shells. `tests/test_no_popularity_
    fetch.py` pins the same rule statically."""
    attempts: list[str] = []
    page._ns_external_attempts = attempts

    def handler(route):
        try:
            attempts.append(route.request.url)
        except Exception:
            pass
        try:
            route.abort()
        except Exception:
            pass

    page.route("https://popularity-source.invalid/", handler)


def _new_context(browser, dpr: int = 1):
    ctx = browser.new_context(
        timezone_id=TZ, locale="en-US",
        viewport={"width": VIEWPORT[0], "height": VIEWPORT[1]},
        color_scheme="dark", device_scale_factor=dpr,
        reduced_motion="reduce",
    )
    page = ctx.new_page()
    try:
        page.clock.install(time=PINNED_ISO)
        page.clock.resume()
    except Exception:
        pass  # clock API unavailable: tests set dates explicitly anyway
    _install_stubs(page)
    return ctx, page


def _attach(ctx: Ctx):
    def on_console(msg):
        if msg.type == "error":
            ctx.console_errors.append(msg.text[:300])
    def on_pageerror(err):
        ctx.page_errors.append(str(err)[:300])
    def on_response(resp):
        try:
            if resp.status >= 400 and resp.url.startswith(ctx.origin):
                if resp.url.endswith("favicon.ico"):
                    return
                ctx.bad_responses.append(f"{resp.status} {resp.url}")
            # the allowlisted third-party image hosts: recorded so the production
            # smoke can prove the shipped CSP does not block them
            if "upload.wikimedia.org" in resp.url or "commons.wikimedia.org" in resp.url:
                ctx.external_images.append((resp.status, resp.url))
        except Exception:
            pass
    ctx.page.on("console", on_console)
    ctx.page.on("pageerror", on_pageerror)
    ctx.page.on("response", on_response)


def run(channel: str = "chrome", targets=("web", "desktop"),
        exe: Path = DEFAULT_EXE, only: str | None = None,
        headed: bool = False, prod_url: str | None = None,
        artifacts: Path = ARTIFACTS, verbose: bool = True) -> int:
    """Run the registered checks. Returns 0 (pass), 1 (failures) or 2 (the
    infrastructure could not start - browser, server or packed exe)."""
    from playwright.sync_api import sync_playwright

    selected = [(n, t, f) for (n, t, f) in all_checks()
                if t in targets and (not only or only in n)]
    if not selected and not prod_url:
        print("check_browser: no checks selected")
        return 0

    artifacts.mkdir(parents=True, exist_ok=True)
    web_srv = desktop_srv = None
    bases: dict[str, str] = {}
    try:
        if "web" in targets:
            web_srv = StaticServer(WEB_DIR)
            bases["web"] = web_srv.start()
        if "desktop" in targets:
            desktop_srv = DesktopServer(exe)
            bases["desktop"] = desktop_srv.start()
    except Exception as exc:
        print(f"check_browser FATAL: could not start a target: {exc}")
        if web_srv:
            web_srv.stop()
        if desktop_srv:
            desktop_srv.stop()
        return 2

    results: list[Result] = []
    # TO-02: entering the Playwright DRIVER (the `with` below) can fail before any
    # browser exists. That is infrastructure, and `check_browser.run_gate()` maps it
    # to the documented exit 2. It must NOT be probed here with a throw-away
    # `sync_playwright().start()`: the first instance's teardown leaves a pending
    # asyncio task, and the gate then exited 1 even when every check passed
    # (observed on the real gate: 12/12 passed, exit 1).
    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(channel=channel, headless=not headed)
            except Exception as exc:
                print(f"check_browser FATAL: browser '{channel}' could not "
                      f"launch ({exc}). Install it or pass --channel.")
                return 2
            for name, target, fn in selected:
                ctx_b, page = _new_context(browser)
                c = Ctx(page, bases[target], target, artifacts)
                _attach(c)
                t0 = time.time()
                ok, err = True, ""
                try:
                    fn(c)
                except Exception as exc:
                    ok, err = False, f"{type(exc).__name__}: {exc}"
                try:
                    c.assert_clean()
                except Exception as exc:
                    ok = False
                    err = (err + " | " if err else "") + str(exc)
                if not ok:
                    _dump_failure(c, name, err)
                try:
                    ctx_b.close()
                except Exception:
                    pass
                dt = time.time() - t0
                results.append(Result(name, target, ok, err, dt))
                if verbose:
                    mark = "PASS" if ok else "FAIL"
                    print(f"  [{mark}] {target:7s} {name} ({dt:.1f}s)")
                    if not ok:
                        print(f"         {err[:400]}")
            if prod_url:
                results.append(_prod_smoke(browser, prod_url, artifacts, verbose))
            browser.close()
    finally:
        if web_srv:
            web_srv.stop()
        if desktop_srv:
            desktop_srv.stop()

    failed = [r for r in results if not r.ok]
    print(f"check_browser: {len(results) - len(failed)}/{len(results)} passed")
    return 1 if failed else 0


def _inline_script_hashes() -> list[str]:
    """`sha256-...` for every inline `<script>` in web/index.html - the hashes a
    correct CSP must carry."""
    import base64
    import hashlib
    out = []
    try:
        html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    except OSError:
        return out
    for body in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>",
                           html, re.S | re.I):
        digest = hashlib.sha256(body.encode("utf-8")).digest()
        out.append("sha256-" + base64.b64encode(digest).decode("ascii"))
    return out


def _csp_problems(policy: str | None) -> list[str]:
    """Why a deployed /astro Content-Security-Policy is unusable ([] = fine).

    The web shell is the PUBLIC origin and loads third-party images while
    holding the user's sites/rigs/targets/panoramas in IndexedDB and
    localStorage, so a missing or over-permissive policy is a real finding -
    not a nicety. The check is read-only and only runs for `--prod-url`.
    """
    if not policy:
        return ["no Content-Security-Policy header is served (web/.htaccess "
                "carries one; the host must apply it)"]
    low = policy.lower()
    bad = []
    if "script-src" not in low:
        bad.append("no script-src directive (default-src alone is weaker than "
                   "the desktop shell, which pins script-src)")
    elif "unsafe-inline" in low.split("script-src", 1)[1].split(";", 1)[0]:
        bad.append("script-src allows 'unsafe-inline' (the web shell has NO "
                   "inline handler; only the theme bootstrap needs a hash)")
    elif "unsafe-eval" in low:
        bad.append("script-src allows 'unsafe-eval'")
    for wanted in _inline_script_hashes():
        if wanted.lower() not in low:
            bad.append(f"the inline theme bootstrap hash {wanted} is missing - "
                       f"the saved theme would not be applied before paint")
    if "connect-src" not in low:
        bad.append("no connect-src (the Wikipedia photo fetch and version.json "
                   "are unrestricted)")
    return bad


def _prod_smoke(browser, prod_url: str, artifacts: Path, verbose: bool) -> Result:
    """Read-only production smoke (/astro): the page loads, shows a version,
    serves a usable CSP, has no console errors - and its own policy does not
    break the third-party photos it allows. Never mutates anything."""
    ctx_b, page = _new_context(browser)
    c = Ctx(page, prod_url, "web-prod", artifacts)
    _attach(c)
    t0 = time.time()
    ok, err = True, ""
    try:
        resp = page.goto(prod_url, wait_until="domcontentloaded")
        c.expect(resp is not None, "the production page did not respond")
        problems = _csp_problems(resp.headers.get("content-security-policy"))
        c.expect(not problems, "production CSP: " + "; ".join(problems))
        page.wait_for_selector("#foot-ver", timeout=45000)
        # First-run welcome (throwaway profile, empty storage): "Skip" keeps the
        # default site so boot proceeds.  This writes only to the ephemeral
        # browser profile - the server and any real user data are untouched.
        try:
            page.wait_for_selector("#w-skip", state="visible", timeout=10000)
            page.click("#w-skip")
        except Exception:
            pass
        page.wait_for_function(
            """() => { const v = document.querySelector('#foot-ver');
                 const t = (v && v.textContent || '').trim();
                 return t && t !== '\\u2026'; }""", timeout=45000)
        shown = (page.evaluate(
            """() => (document.querySelector('#foot-ver')?.textContent || '').trim()""") or "")
        # The policy must not block what the app legitimately loads: the whole
        # point of the img-src allowlist. `web-prod` used to verify the CSP text
        # only, which cannot tell a correct policy from one that breaks photos.
        failed = [f"{st} {url}" for st, url in c.external_images if st >= 400]
        c.expect(not failed,
                 "an allowlisted third-party image failed under the policy: "
                 + "; ".join(failed[:3]))
        deployed = page.evaluate(
            """async () => { const r = await fetch('version.json'); return r.ok
                 ? (await r.json()).version : null; }""")
        c.expect(deployed, "the deployed version.json must be readable")
        c.expect(deployed in shown,
                 f"page shows {shown!r} but version.json says {deployed!r}")
        c.assert_clean()
    except Exception as exc:
        ok, err = False, f"{type(exc).__name__}: {exc}"
        _dump_failure(c, "web-prod-smoke", err)
    finally:
        try:
            ctx_b.close()
        except Exception:
            pass
    dt = time.time() - t0
    if verbose:
        print(f"  [{'PASS' if ok else 'FAIL'}] web-prod production smoke ({dt:.1f}s)")
        if not ok:
            print(f"         {err[:400]}")
    return Result("production-smoke", "web-prod", ok, err, dt)


def _dump_failure(c: Ctx, name: str, err: str):
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in name)
    try:
        c.page.screenshot(path=str(c.artifacts / f"{safe}.png"), full_page=True)
    except Exception:
        pass
    try:
        (c.artifacts / f"{safe}.json").write_text(json.dumps({
            "name": name, "target": c.target, "url": c.page.url,
            "error": err, "console_errors": c.console_errors,
            "page_errors": c.page_errors, "bad_responses": c.bad_responses,
            "dom": (c.page.content() or "")[:4000],
        }, indent=1), encoding="utf-8")
    except Exception:
        pass
