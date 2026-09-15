"""Review-only browser evidence: responsive screenshots and request tracing.

Uses a local static server and aborts no user-visible process.  The popularity source
request is fulfilled locally so the review does not contact that third party;
the request event still proves whether the app attempted it.
"""

from __future__ import annotations

import http.server
import json
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "web"
OUT = Path(__file__).resolve().parent / "ui"
OUT.mkdir(exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def boot(page, base):
    page.goto(base, wait_until="domcontentloaded")
    try:
        page.locator("#w-skip").click(timeout=15000)
    except Exception:
        pass
    page.locator(".pick li[data-id], .card, #cat-con").first.wait_for(timeout=60000)


def geometry(page):
    return page.evaluate("""() => {
      const rect = (s) => { const e = document.querySelector(s); if (!e) return null;
        const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; };
      return {viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth, topbar: rect('#topbar'), tabs: rect('#tabs'),
        main: rect('main'), focusVisible: !!document.querySelector(':focus-visible')};
    }""")


def overflow_elements(page):
    return page.evaluate("""() => Array.from(document.querySelectorAll('*'))
      .map(e => { const r=e.getBoundingClientRect(); return {tag:e.tagName, id:e.id,
        cls:String(e.className || '').slice(0,120), left:Math.round(r.left),
        right:Math.round(r.right), width:Math.round(r.width), text:(e.innerText || '').trim().slice(0,80)}; })
      .filter(x => x.width > 1 && (x.right > innerWidth + 1 || x.left < -1))
      .slice(0, 24)""")


handler = partial(QuietHandler, directory=str(WEB))
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
base = f"http://127.0.0.1:{server.server_address[1]}/"
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()

evidence = {"base": base, "themes": {}, "popularity_requests": [], "keyboard": {}}
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        for theme in ("dome", "classic"):
            context = browser.new_context(
                viewport={"width": 1366, "height": 900}, timezone_id="UTC",
                locale="en-US", color_scheme="dark", device_scale_factor=1,
                reduced_motion="reduce",
            )
            context.add_init_script(
                f"localStorage.setItem('nightseam_theme', '{theme}');")
            page = context.new_page()
            requested = []
            page.on("request", lambda r, reqs=requested: reqs.append(r.url))
            page.route("https://popularity-source.invalid/",
                       lambda route: route.fulfill(status=200, content_type="application/json", body="{}"))
            boot(page, base)
            measures = []
            for width in (320, 360, 768, 900, 1280, 1366, 1920):
                page.set_viewport_size({"width": width, "height": 900})
                page.wait_for_timeout(180)
                page.screenshot(path=str(OUT / f"web-{theme}-tonight-{width}.png"), full_page=True)
                m = geometry(page)
                m["overflow"] = overflow_elements(page)
                measures.append(m)

            # A visual horizon/editor state at a wide and compact size.
            page.locator("#tabs a[data-v='horizon']").click()
            page.locator("#pano-blank").click(timeout=20000)
            page.locator("#pano-canvas").wait_for(timeout=30000)
            for width in (360, 1366):
                page.set_viewport_size({"width": width, "height": 1100})
                page.wait_for_timeout(180)
                page.screenshot(path=str(OUT / f"web-{theme}-horizon-{width}.png"), full_page=True)

            # Keyboard scrub is a real event on the Sky view, not a source-only check.
            page.set_viewport_size({"width": 1366, "height": 900})
            page.locator("#tabs a[data-v='sky']").click()
            page.locator("#sky-time").wait_for(timeout=30000)
            before = page.locator("#sky-time").input_value()
            page.locator("body").press("ArrowRight")
            page.wait_for_timeout(120)
            after_fine = page.locator("#sky-time").input_value()
            page.locator("body").press("Shift+ArrowRight")
            page.wait_for_timeout(120)
            after_coarse = page.locator("#sky-time").input_value()
            evidence["keyboard"][theme] = {
                "before": before, "after_fine": after_fine, "after_coarse": after_coarse,
            }
            evidence["themes"][theme] = measures
            evidence["popularity_requests"].extend(
                u for u in requested if "popularity-source.invalid" in u)
            context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()

(OUT / "ui_measurements.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
print(json.dumps({"screenshots": len(list(OUT.glob("*.png"))),
                  "popularity_requests": len(evidence["popularity_requests"]),
                  "overflowing_measurements": sum(
                      1 for theme in evidence["themes"].values() for m in theme
                      if m["scrollWidth"] > m["viewport"]),
                  "keyboard": evidence["keyboard"]}, indent=2))
