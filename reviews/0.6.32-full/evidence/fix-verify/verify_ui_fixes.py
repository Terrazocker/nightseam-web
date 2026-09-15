"""Prove the UI-01 fix: measure the classic theme's page width after the CSS change.

Before the fix (0.6.32 review): classic forced docW=548 at viewports 320/360/400/480
(the page could not shrink below its nowrap night-info pill, so the weather chip,
the hamburger and the 4th tab sat off-screen). Also checks the other UI fixes that
are measurable: the 320px dome overflow (UI-03) and the two truncated labels (UI-08).
"""

from __future__ import annotations

import http.server
import json
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_a):
        pass


def measure(page):
    return page.evaluate("""() => {
      const rect = (s) => { const e = document.querySelector(s); if (!e) return null;
        const r = e.getBoundingClientRect(); return {l:Math.round(r.left), r:Math.round(r.right), w:Math.round(r.width)}; };
      const clipped = (s) => { const e = document.querySelector(s); if (!e) return null;
        return e.scrollWidth > e.clientWidth + 1; };
      return {
        docW: document.documentElement.scrollWidth, vw: innerWidth,
        topbarRight: rect('.topbar-right'),
        menu: rect('#btnMenu'), weather: rect('#btnWeather'),
        tab4: rect("#tabs a[data-v='horizon']"),
        rigClipped: clipped('#rigSelect'),
        weatherText: (document.querySelector('#wxChip') || {}).textContent || null,
        worst: Array.from(document.querySelectorAll('*'))
          .map(e => { const r = e.getBoundingClientRect(); return {sel: (e.id ? '#'+e.id
              : (e.className ? '.'+String(e.className).trim().split(/\\s+/)[0] : e.tagName)),
              l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width)}; })
          .filter(x => x.w > 1 && (x.r > innerWidth + 1 || x.l < -1))
          .slice(0, 8),
      };
    }""")


handler = partial(Quiet, directory=str(WEB))
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
base = f"http://127.0.0.1:{server.server_address[1]}/"
threading.Thread(target=server.serve_forever, daemon=True).start()

out = {"base": base, "themes": {}, "verdict": {}}
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        for theme in ("classic", "dome"):
            ctx = browser.new_context(viewport={"width": 1366, "height": 900}, timezone_id="UTC",
                                      locale="en-US", color_scheme="dark",
                                      reduced_motion="reduce")
            ctx.add_init_script(f"localStorage.setItem('nightseam_theme','{theme}');")
            ctx.route("https://popularity-source.invalid/", lambda route: route.abort())
            page = ctx.new_page()
            page.goto(base + "index.html", wait_until="domcontentloaded")
            try:
                page.locator("#w-skip").click(timeout=15000)
            except Exception:
                pass
            page.locator(".pick li[data-id], .card, #cat-con").first.wait_for(timeout=90000)
            rows = {}
            for w in (320, 360, 400, 480, 640, 768):
                page.set_viewport_size({"width": w, "height": 900})
                page.wait_for_timeout(200)
                rows[w] = measure(page)
            out["themes"][theme] = rows
            ctx.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()

classic = out["themes"]["classic"]
out["verdict"] = {
    "classic_page_fits_at": [w for w, m in classic.items() if m["docW"] <= m["vw"]],
    "classic_still_overflows_at": [w for w, m in classic.items() if m["docW"] > m["vw"]],
    "classic_320_docW": classic[320]["docW"],
    "classic_360_docW": classic[360]["docW"],
    "classic_320_menu_onscreen": (classic[320]["menu"] or {}).get("r", 999) <= 320,
    "classic_320_tab4_onscreen": (classic[320]["tab4"] or {}).get("r", 999) <= 320,
    "dome_320_docW": out["themes"]["dome"][320]["docW"],
    "rig_label_clipped": {t: out["themes"][t][768]["rigClipped"] for t in out["themes"]},
    "weather_label": {t: out["themes"][t][768]["weatherText"] for t in out["themes"]},
}
print(json.dumps(out, indent=1))
