"""UI lane evidence for the 0.6.32 full review - all measurements, no images.

The review's model cannot view images, so every UI claim in 50-ui-ux.md is
backed by a number from here (or by a CSS/source citation) rather than by a
screenshot.  Screenshots still exist under evidence/ui/ from the earlier
browser pass; they are referenced, not interpreted.

Phases
  1. horizontal-overflow scan over width x theme (the media-query boundaries)
  2. WCAG contrast of real rendered text over its composited background
  3. touch-target sizes at 360 px
  4. keyboard focus-ring audit (computed outline after real Tab presses)
  5. "progress never moves the layout" - geometry sampled during a long warm
  6. the landing/ pages at 360 / 768 / 1366

Writes evidence/ui/ui_measurements2.json and prints a compact digest.
"""

from __future__ import annotations

import http.server
import json
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "ui"
OUT.mkdir(exist_ok=True)

WIDTHS = [320, 360, 400, 480, 600, 640, 641, 720, 760, 768, 860, 900, 1024, 1280, 1440, 1920]
LANDING = ["index.html", "features.html", "download.html", "about.html", "privacy.html", "impressum.html"]

OVERFLOW_JS = """() => {
  const out = [];
  for (const e of document.querySelectorAll('*')) {
    const r = e.getBoundingClientRect();
    if (r.width > 1 && (r.right > innerWidth + 1 || r.left < -1)) {
      const path = (n) => {
        const bits = [];
        for (let x = n; x && x.nodeType === 1 && bits.length < 3; x = x.parentElement) {
          bits.unshift(x.id ? '#' + x.id : (x.className ? '.' + String(x.className).trim().split(/\\s+/)[0] : x.tagName.toLowerCase()));
        }
        return bits.join('>');
      };
      out.push({sel: path(e), left: Math.round(r.left), right: Math.round(r.right),
                w: Math.round(r.width), text: (e.innerText || '').trim().slice(0, 40)});
    }
  }
  return {viewport: innerWidth, docW: document.documentElement.scrollWidth,
          bodyW: document.body.scrollWidth, n: out.length, worst: out.slice(0, 6)};
}"""

# real rendered text: [label, selector]
CONTRAST_TARGETS = [
    ["body text", "main p"],
    ["tagline", ".tagline"],
    ["brand h1", ".brand h1"],
    ["topbar label", ".planner-controls label"],
    ["nightinfo", "#nightInfo"],
    ["tab (inactive)", "#tabs a:not(.active)"],
    ["tab (active)", "#tabs a.active"],
    ["footer", ".foot p"],
    ["hint (menu)", ".menu-panel .hint"],
    ["weather chip", "#btnWeather"],
    ["muted count", ".cat-count"],
]

CONTRAST_JS = """(targets) => {
  const lum = (rgb) => {
    const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const [r, g, b] = rgb;
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = (s) => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return {rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1};
  };
  const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
  const bgOf = (el) => {
    let acc = null;
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { acc = acc ? over({rgb: acc, a: 1}, c.rgb) : over(c, [6, 11, 20]); if (c.a === 1) return acc; }
    }
    return acc || [6, 11, 20];
  };
  const res = [];
  for (const [label, sel] of targets) {
    const el = document.querySelector(sel);
    if (!el) { res.push({label, sel, missing: true}); continue; }
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = bgOf(el);
    const f = over(fg, bg);
    const L1 = lum(f), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    res.push({label, sel, color: cs.color, bg: 'rgb(' + bg.map(Math.round).join(',') + ')',
              fontPx: parseFloat(cs.fontSize), weight: cs.fontWeight,
              ratio: Math.round(ratio * 100) / 100,
              large: parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight, 10) >= 700),
              passAA: ratio >= (parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight, 10) >= 700) ? 3 : 4.5)});
  }
  return res;
}"""

TARGETS_JS = """() => {
  const sel = 'button, a, select, input, [role="button"], .theme-btn, label.btn';
  const out = [];
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (getComputedStyle(e).visibility === 'hidden') continue;
    out.push({tag: e.tagName, id: e.id, cls: String(e.className || '').slice(0, 40),
              text: (e.innerText || e.value || '').trim().slice(0, 26),
              w: Math.round(r.width), h: Math.round(r.height),
              small: r.width < 24 || r.height < 24});
  }
  return out;
}"""

FOCUS_JS = """() => {
  const e = document.activeElement;
  if (!e || e === document.body) return {tag: 'BODY'};
  const cs = getComputedStyle(e);
  return {tag: e.tagName, id: e.id, cls: String(e.className || '').slice(0, 40),
          text: (e.innerText || e.value || '').trim().slice(0, 26),
          outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth,
          outlineColor: cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 40)};
}"""

GEOM_JS = """() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect(); return {top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width)}; };
  const heads = Array.from(document.querySelectorAll('main table thead th')).map((th) => Math.round(th.getBoundingClientRect().width));
  return {ok: !!document.querySelector('main table'), topbar: r('.topbar'), tabs: r('#tabs'),
          stats: r('.cat-stats'), table: r('main table'),
          busy: !!document.querySelector('#busy:not(.hidden)'), heads};
}"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_a):
        pass


def boot(page, base):
    page.goto(base + "web/", wait_until="domcontentloaded")
    try:
        page.locator("#w-skip").click(timeout=15000)
    except Exception:
        pass
    page.locator(".pick li[data-id], .card, #cat-con").first.wait_for(timeout=90000)


def main() -> None:
    handler = partial(Quiet, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    base = f"http://127.0.0.1:{server.server_address[1]}/"
    threading.Thread(target=server.serve_forever, daemon=True).start()

    ev = {"base": base, "overflow": {}, "contrast": {}, "targets": {},
          "focus": {}, "shift": {}, "landing": {}, "errors": {}}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True)
            for theme in ("dome", "classic"):
                ctx = browser.new_context(viewport={"width": 1366, "height": 900}, timezone_id="UTC",
                                          locale="en-US", color_scheme="dark", device_scale_factor=1,
                                          reduced_motion="reduce")
                ctx.add_init_script(f"localStorage.setItem('nightseam_theme', '{theme}');")
                ctx.route("https://popularity-source.invalid/",
                          lambda route: route.fulfill(status=200, content_type="application/json", body="{}"))
                page = ctx.new_page()
                page.on("pageerror", lambda e, t=theme: ev["errors"].setdefault(t, []).append(str(e)[:200]))
                boot(page, base)

                rows = {}
                for w in WIDTHS:
                    page.set_viewport_size({"width": w, "height": 900})
                    page.wait_for_timeout(160)
                    rows[w] = page.evaluate(OVERFLOW_JS)
                ev["overflow"][theme] = rows

                page.set_viewport_size({"width": 1366, "height": 900})
                page.wait_for_timeout(120)
                ev["contrast"][theme] = page.evaluate(CONTRAST_JS, CONTRAST_TARGETS)

                # menu-panel text only exists while open
                page.locator("#btnMenu").click()
                page.wait_for_timeout(250)
                extra = page.evaluate(CONTRAST_JS, [["hint (menu open)", ".menu-panel .hint"],
                                                    ["menu heading", ".menu-panel h4"]])
                page.locator("#btnMenu").click()
                page.wait_for_timeout(150)
                ev["contrast"][theme] += extra

                page.set_viewport_size({"width": 360, "height": 900})
                page.wait_for_timeout(200)
                tg = page.evaluate(TARGETS_JS)
                ev["targets"][theme] = {"total": len(tg), "small": [t for t in tg if t["small"]][:20],
                                        "n_small": sum(1 for t in tg if t["small"])}

                page.set_viewport_size({"width": 1366, "height": 900})
                page.wait_for_timeout(150)
                stops = []
                for _ in range(14):
                    page.keyboard.press("Tab")
                    page.wait_for_timeout(60)
                    stops.append(page.evaluate(FOCUS_JS))
                ev["focus"][theme] = stops

                # 5. layout stability during a long visibility warm
                try:
                    page.locator("#tabs a[data-v='catalog']").click()
                    page.locator("main table").first.wait_for(timeout=30000)
                    page.wait_for_timeout(300)
                    page.evaluate("""() => { window.__g = []; window.__t = setInterval(() => {
                        const r = (s) => { const e = document.querySelector(s); if (!e) return null;
                          const b = e.getBoundingClientRect(); return {top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width)}; };
                        window.__g.push({ms: Math.round(performance.now()),
                          topbar: r('.topbar'), tabs: r('#tabs'), stats: r('.cat-stats'),
                          table: r('main table'), busy: !!document.querySelector('#busy:not(.hidden)'),
                          heads: Array.from(document.querySelectorAll('main table thead th')).map(th => Math.round(th.getBoundingClientRect().width))});
                      }, 40); }""")
                    page.evaluate("""() => { const s = document.querySelector('#cat-minvis');
                        if (!s) return; s.value = 100; s.dispatchEvent(new Event('input', {bubbles: true})); }""")
                    page.wait_for_timeout(1800)
                    page.evaluate("""() => { const s = document.querySelector('#cat-minvis');
                        if (!s) return; s.value = 0; s.dispatchEvent(new Event('input', {bubbles: true})); }""")
                    page.wait_for_timeout(900)
                    samples = page.evaluate("() => { clearInterval(window.__t); return window.__g; }")
                    ev["shift"][theme] = samples
                except Exception as exc:
                    ev["errors"].setdefault("shift_" + theme, []).append(f"{type(exc).__name__}: {exc}"[:200])
                ctx.close()

            # 6. landing pages
            ctx = browser.new_context(viewport={"width": 1366, "height": 900}, timezone_id="UTC")
            page = ctx.new_page()
            for name in LANDING:
                try:
                    page.goto(base + "landing/" + name, wait_until="domcontentloaded")
                    page.wait_for_timeout(200)
                    per = {}
                    for w in (360, 768, 1366):
                        page.set_viewport_size({"width": w, "height": 900})
                        page.wait_for_timeout(150)
                        per[w] = page.evaluate(OVERFLOW_JS)
                    ev["landing"][name] = per
                except Exception as exc:
                    ev["errors"].setdefault("landing_" + name, []).append(f"{type(exc).__name__}: {exc}"[:200])
            ctx.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    (OUT / "ui_measurements2.json").write_text(json.dumps(ev, indent=1), encoding="utf-8")

    digest = {"overflow": {}, "contrast_fail": {}, "targets": {}, "landing": {}}
    for theme, rows in ev["overflow"].items():
        digest["overflow"][theme] = {str(w): {"docW": d["docW"], "n": d["n"],
                                              "worst": (d["worst"][0]["sel"] if d["worst"] else None)}
                                     for w, d in rows.items() if d["docW"] > d["viewport"]}
    for theme, rows in ev["contrast"].items():
        digest["contrast_fail"][theme] = [{r["label"]: r["ratio"], "px": r.get("fontPx")}
                                          for r in rows if not r.get("missing") and not r["passAA"]]
    for theme, t in ev["targets"].items():
        digest["targets"][theme] = {"total": t["total"], "n_small": t["n_small"],
                                    "examples": [(x["tag"], x["id"] or x["cls"], x["w"], x["h"]) for x in t["small"][:6]]}
    for name, per in ev["landing"].items():
        digest["landing"][name] = {str(w): d["docW"] for w, d in per.items() if d["docW"] > d["viewport"]}
    focus = {}
    for theme, stops in ev["focus"].items():
        focus[theme] = {"n": len(stops), "no_outline": sum(
            1 for s in stops if s.get("outlineStyle") in (None, "none") or s.get("outlineWidth") == "0px")}
    digest["focus"] = focus
    sh = {}
    for theme, s in ev["shift"].items():
        def span(key, sub=None):
            vals = [x[key][sub] for x in s if x.get(key)] if sub else [x[key] for x in s if x.get(key)]
            return [min(vals), max(vals)] if vals else None
        sh[theme] = {"samples": len(s), "busy_seen": any(x["busy"] for x in s),
                     "topbar_h": span("topbar", "h"), "tabs_top": span("tabs", "top"),
                     "stats_h": span("stats", "h"), "table_top": span("table", "top"),
                     "heads": [sorted({tuple(x["heads"]) for x in s if x.get("heads")})][0][:3] if s else None}
    digest["shift"] = sh
    digest["errors"] = ev["errors"]
    print(json.dumps(digest, indent=1, default=str))


if __name__ == "__main__":
    main()
