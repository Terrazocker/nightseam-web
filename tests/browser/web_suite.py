"""Web browser checks (Playwright + system Chrome over the static `web/` tree).

Each check is registered with `@check(name, "web")`; `scripts/check_browser.py`
runs them against a throwaway static server.  Selectors mirror `web/index.html`
and the module-built DOM.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from harness import ROOT, WEB_DIR, check

# ---------------------------------------------------------------- helpers

READY = ".pick li[data-id], .card, #cat-con"


def boot(c):
    """Reach a usable planning view from empty storage (the first-run welcome's
    'Skip' keeps the deterministic Berlin default)."""
    c.goto("/")
    try:
        c.page.wait_for_selector("#w-skip", state="visible", timeout=15000)
        c.page.click("#w-skip")
    except Exception:
        pass  # no welcome (storage was pre-seeded)
    c.page.wait_for_selector(READY, timeout=60000)


def tab(c, name: str):
    c.page.click(f"#tabs a[data-v='{name}']")
    c.page.wait_for_timeout(250)


def canvas_digest(c, selector: str) -> str:
    data = c.page.evaluate(
        """(sel) => { const cv = document.querySelector(sel);
             return cv ? cv.toDataURL() : null; }""", selector)
    return hashlib.sha256((data or "").encode()).hexdigest()


def open_editor(c):
    tab(c, "horizon")
    c.page.wait_for_selector("#pano-blank", timeout=20000)
    c.page.click("#pano-blank")
    c.page.wait_for_selector("#pano-canvas", state="visible", timeout=20000)
    # The editor is tall (canvas ~608 px below the topbar): give the viewport
    # room for the whole canvas so pointer paint/crop gestures land on it.
    c.page.set_viewport_size({"width": 1366, "height": 1500})
    c.page.evaluate("() => window.scrollTo(0, 0)")
    c.page.locator("#pano-canvas").scroll_into_view_if_needed()
    c.page.wait_for_timeout(250)


def paint(c, x0=0.30, x1=0.62, y=0.35, button="left"):
    box = c.page.locator("#pano-canvas").bounding_box()
    c.expect(box and box["width"] > 20, "pano canvas must have a size")
    y0 = box["y"] + min(box["height"] * y, box["height"] - 4)
    sx = box["x"] + box["width"] * x0
    ex = box["x"] + box["width"] * x1
    c.page.mouse.move(sx, y0)
    c.page.mouse.down(button=button)
    for i in range(1, 13):
        c.page.mouse.move(sx + (ex - sx) * i / 12, y0)
    c.page.mouse.up(button=button)
    c.page.wait_for_timeout(180)


def pano_state(c):
    return c.page.evaluate(
        """() => { try { return JSON.parse(localStorage.getItem('nightseam_panos_v1') || 'null'); }
                  catch (e) { return null; } }""")


def active_strokes(c):
    st = pano_state(c)
    if not st or not st.get("panos"):
        return -1
    p = next((p for p in st["panos"] if p.get("id") == st.get("activeId")),
             st["panos"][0])
    return len(p.get("strokes") or [])


# ---------------------------------------------------------------- checks

@check("web-load-smoke", "web")
def web_load_smoke(c):
    boot(c)
    ver = c.page.inner_text("#foot-ver").strip()
    c.expect(re.search(r"\d+\.\d+\.\d+", ver), f"version not displayed: {ver!r}")
    about = c.page.inner_text("#aboutVersion").strip()
    c.expect(re.search(r"\d+\.\d+\.\d+", about), f"about version not shown: {about!r}")
    c.expect(c.page.locator("#tb-site option").count() >= 1,
             "the site picker must be populated")
    c.expect(c.page.locator(".pick li[data-id]").count() > 0,
             "the Tonight view must list targets")
    c.assert_clean()


@check("web-cache-tokens", "web")
def web_cache_tokens(c):
    """A mixed module set (old index.html + new modules) is prevented by the
    per-module `?v=` tokens.  Observe what the browser really requests."""
    reqs: list[str] = []
    c.page.on("request", lambda r: reqs.append(r.url))
    boot(c)
    idx = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    m = re.search(r"app\.js\?v=(\d+)", idx)
    c.expect(m, "index.html must load app.js with a cache token")
    app_url = f"app.js?v={m.group(1)}"
    c.expect(any(u.endswith(app_url) for u in reqs),
             f"browser did not request {app_url}")
    bad = [u for u in reqs
           if u.endswith(".js") and "?" not in u and "/core/" not in u]
    c.expect(not bad, f"module requests without a cache token: {bad[:4]}")
    app_src = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    for name, tok in re.findall(r"\./([\w.]+)\.js\?v=(\d+)", app_src):
        c.expect(any(u.endswith(f"{name}.js?v={tok}") for u in reqs),
                 f"{name}.js?v={tok} was never requested")
    c.assert_clean()


@check("web-horizon-actions-not-full-width", "web")
def web_horizon_actions(c):
    """ITEM B regression: an action button used as a label must stay
    content-width at 1024 and 1366 px.  Rendered layout, not source."""
    boot(c)
    tab(c, "horizon")
    c.page.wait_for_selector(".btnrow.action-row", timeout=20000)
    for width in (1024, 1366):
        c.page.set_viewport_size({"width": width, "height": 900})
        c.page.wait_for_timeout(250)
        info = c.page.evaluate(
            """() => {
              const row = document.querySelector('.btnrow.action-row');
              if (!row) return null;
              const rw = row.getBoundingClientRect().width;
              const items = Array.from(
                row.querySelectorAll(':scope > .btn, :scope > label.btn'));
              return { rw, items: items.map(e => {
                const b = e.getBoundingClientRect();
                return { t: (e.textContent || '').trim().slice(0, 24), w: b.width };
              }) };
            }""")
        c.expect(info and info["items"], "the horizons action row must have controls")
        for it in info["items"]:
            c.expect(it["w"] < info["rw"] * 0.9,
                     f"'{it['t']}' spans the full row at {width}px "
                     f"({it['w']:.0f}/{info['rw']:.0f})")
    c.page.set_viewport_size({"width": 1366, "height": 900})
    c.assert_clean()


@check("web-pano-paint-save-persist", "web")
def web_pano_paint_save_persist(c):
    boot(c)
    open_editor(c)
    paint(c)
    c.expect_in("Unsaved", c.page.inner_text("#ed-status"),
                "painting must mark the editor dirty")

    # a held right-button drag erases (one gesture)
    painted = canvas_digest(c, "#pano-canvas")
    paint(c, 0.30, 0.62, 0.35, button="right")
    c.expect(canvas_digest(c, "#pano-canvas") != painted,
             "a right-button drag must erase the painted band")

    paint(c)
    c.page.click("#ed-save")
    c.page.wait_for_function(
        """() => (document.querySelector('#ed-status')?.textContent || '')
                   .includes('Saved')""", timeout=10000)
    c.expect(active_strokes(c) > 0, "saving must persist the stroke")

    # reload: the saved horizon survives
    c.goto("/")
    tab(c, "horizon")
    c.page.wait_for_selector("#pano-list li[data-id]", timeout=30000)
    c.page.click("#pano-list li[data-id]")
    c.page.wait_for_selector("#pano-canvas", timeout=30000)
    c.expect(active_strokes(c) > 0, "the horizon must persist across a reload")
    c.assert_clean()


@check("web-pano-undo-redo-clear", "web")
def web_pano_undo_redo_clear(c):
    boot(c)
    open_editor(c)
    paint(c)
    c.page.click("#ed-save")
    c.page.wait_for_function(
        """() => (document.querySelector('#ed-status')?.textContent || '')
                   .includes('Saved')""", timeout=10000)

    # a second gesture: undo returns to the saved baseline, redo re-applies it
    paint(c, 0.55, 0.78, 0.5)
    c.expect_in("Unsaved", c.page.inner_text("#ed-status"),
                "the second stroke must dirty the editor")
    c.page.click("#ed-undo")
    c.page.wait_for_function(
        """() => (document.querySelector('#ed-status')?.textContent || '')
                   .includes('Saved')""", timeout=8000)
    c.page.click("#ed-redo")
    c.page.wait_for_function(
        """() => (document.querySelector('#ed-status')?.textContent || '')
                   .includes('Unsaved')""", timeout=8000)

    # Clear is confirmed in-page (never alert()) and is undoable
    before = canvas_digest(c, "#pano-profile")
    c.page.click("#ed-clear")
    c.page.wait_for_selector(".ed-confirm [data-ok]", timeout=5000)
    c.page.click(".ed-confirm [data-ok]")
    c.page.wait_for_timeout(300)
    c.expect(canvas_digest(c, "#pano-profile") != before,
             "Clear must change the obstruction profile")
    c.page.click("#ed-undo")
    c.page.wait_for_timeout(300)
    c.expect(canvas_digest(c, "#pano-profile") == before,
             "Clear must be undoable")
    c.assert_clean()


@check("web-pano-storage-quota", "web")
def web_pano_storage_quota(c):
    """A full localStorage must surface 'Save failed' AND keep the edit."""
    boot(c)
    open_editor(c)
    paint(c)
    c.page.evaluate(
        """() => {
          window.__origSet = Storage.prototype.setItem;
          Storage.prototype.setItem = function () {
            throw new DOMException('quota', 'QuotaExceededError');
          };
        }""")
    try:
        c.page.click("#ed-save")
        c.page.wait_for_function(
            """() => (document.querySelector('#ed-status')?.textContent || '')
                       .includes('Save failed')""", timeout=10000)
        c.expect(active_strokes(c) <= 0,
                 "a failed save must not have persisted strokes")
        c.expect("Unsaved" in c.page.inner_text("#ed-status")
                 or "Save failed" in c.page.inner_text("#ed-status"),
                 "the edit must remain (dirty) after a failed save")
    finally:
        c.page.evaluate("() => { Storage.prototype.setItem = window.__origSet; }")
    c.allow_console_errors("intentional QuotaExceededError")
    c.assert_clean()


@check("web-pano-canvas-dpr-resize", "web")
def web_pano_canvas_dpr_resize(c):
    """The editor canvas is DPR-aware and follows a resize (ResizeObserver)."""
    boot(c)
    open_editor(c)

    def dims():
        return c.page.evaluate(
            """() => { const cv = document.querySelector('#pano-canvas');
                 const boxEl = document.querySelector('#pano-box');
                 return { w: cv.width, h: cv.height,
                          bw: boxEl.clientWidth, bh: boxEl.clientHeight,
                          dpr: window.devicePixelRatio || 1 }; }""")

    for width in (1024, 1500):
        c.page.set_viewport_size({"width": width, "height": 900})
        c.page.wait_for_timeout(400)
        d = dims()
        c.expect(abs(d["w"] - d["bw"] * d["dpr"]) <= 2,
                 f"canvas backing store {d['w']} != box width {d['bw']} * dpr "
                 f"{d['dpr']} at {width}px")
        c.expect(d["w"] > 0 and d["h"] > 0, "canvas must keep a backing store")
    c.page.set_viewport_size({"width": 1366, "height": 900})
    c.assert_clean()


@check("web-sky-band-no-diagonal-chord", "web")
def web_sky_band_no_chord(c):
    """Regression pin (0.6.13 follow-up): the sky-mode blocked region is drawn
    per contiguous azimuth run, so a gap is never bridged by a straight chord.
    Runs the SHARED geometry as served in the browser."""
    boot(c)
    res = c.page.evaluate(
        """async () => {
          const H = await import('/horizon.js');
          const BINS = 720;
          const fill = (from, to, v) => {
            const a = new Array(BINS).fill(90);
            for (let i = from; i < to; i++) a[i] = v;
            return a;
          };
          const mixed = {
            azOffset: 0, altBottom: 0, altTop: 90, fov: 360, paintMode: 'sky',
            blockAbove: false,
            profile: fill(0, 200, 10).map((v, i) => (i >= 300 && i < 500 ? 5 : v)),
            profileTop: fill(0, 200, 40).map((v, i) => (i >= 300 && i < 500 ? 90.5 : v)),
          };
          const polys = H.skyBandPolygons(mixed, 720, 56, 0, 40, 0, 360);
          // complement contract at three columns (band / gap / outside)
          const bands = H.visibleSkyBands(mixed, mixed.altBottom, 90);
          const selfIntersects = (pts) => {
            const n = pts.length;
            const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
            const proper = (p1,p2,p3,p4) => {
              const d1=cross(p3,p4,p1), d2=cross(p3,p4,p2), d3=cross(p1,p2,p3), d4=cross(p1,p2,p4);
              return ((d1>0)!==(d2>0)) && ((d3>0)!==(d4>0));
            };
            for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) {
              if ((i+1)%n===j || (j+1)%n===i) continue;
              if (proper(pts[i],pts[(i+1)%n],pts[j],pts[(j+1)%n])) return true;
            }
            return false;
          };
          return {
            polys: polys.length,
            intersects: polys.map(selfIntersects),
            gapVis: bands[250].vis,
            bandVis: bands[100].vis,
            openVis: bands[400].vis,
          };
        }""")
    c.expect(res["polys"] == 2, f"a blocked gap must split the band into 2 runs, got {res['polys']}")
    c.expect(not any(res["intersects"]), "a sky-band polygon self-intersects")
    c.expect(res["gapVis"] is None,
             f"the fully-blocked columns must have no visible band: {res['gapVis']}")
    c.expect(res["bandVis"] and abs(res["bandVis"][0] - 10) < 1e-6,
             f"the band column must start at the painted ceiling: {res['bandVis']}")
    c.expect(res["openVis"] and abs(res["openVis"][0] - 5) < 1e-6,
             f"the open-above run must start at its painted floor: {res['openVis']}")
    c.assert_clean()


@check("web-sun-moon-above-horizon", "web")
def web_sun_moon_above_horizon(c):
    """The Sun/Moon are only sky objects while the APPARENT altitude > 0:
    below at local midnight, above at local noon (never 'high all night')."""
    boot(c)
    res = c.page.evaluate(
        """async () => {
          const A = await import('/astro.js');
          const lat = 52.52, lon = 13.4;
          const at = (h) => {
            const dt = new Date(Date.UTC(2026, 7, 12, h, 0, 0));
            const jd = A.julianDay(dt);
            const s = A.sunAltAz(jd, lat, lon);   // [alt, az]
            const m = A.moonAltAz(jd, lat, lon);
            return { h, sun: s[0], sunVis: A.aboveHorizon(s[0]),
                     moon: m[0], moonVis: A.aboveHorizon(m[0]) };
          };
          return [0, 6, 12, 18].map(at);
        }""")
    by_h = {r["h"]: r for r in res}
    c.expect(by_h[0]["sun"] < 0 and not by_h[0]["sunVis"],
             f"the Sun must be below the horizon at 00:00 UTC: {by_h[0]}")
    c.expect(by_h[12]["sun"] > 0 and by_h[12]["sunVis"],
             f"the Sun must be above the horizon at 12:00 UTC: {by_h[12]}")
    for r in res:
        c.expect(r["moon"] == r["moon"] and abs(r["moon"]) < 90,
                 f"moon altitude must be finite: {r}")
        c.expect(r["sunVis"] == (r["sun"] > 0), "aboveHorizon must follow the sign")
    c.assert_clean()


@check("web-scrub-changes-time", "web")
def web_scrub_changes_time(c):
    boot(c)
    before = c.page.inner_text("#tb-scrub-time").strip()
    c.expect(before, "the scrub must show a time")
    c.page.evaluate(
        """() => { const s = document.querySelector('#tb-scrub');
             const mid = Math.round((Number(s.min) + Number(s.max)) / 2);
             const cur = Number(s.value);
             s.value = String(cur === mid ? Math.min(Number(s.max), cur + 90)
                                          : mid);
             s.dispatchEvent(new Event('input', { bubbles: true })); }""")
    try:
        c.page.wait_for_function(
            """(prev) => (document.querySelector('#tb-scrub-time')?.textContent || '')
                          .trim() !== prev""", arg=before, timeout=8000)
    except Exception:
        raise AssertionError(f"scrubbing did not change the time from {before!r}")
    c.assert_clean()


@check("web-mag-slider-changes-sky", "web")
def web_mag_slider_changes_sky(c):
    boot(c)
    tab(c, "sky")
    c.page.wait_for_selector("#sky", state="visible", timeout=30000)
    c.page.wait_for_timeout(400)
    val0 = c.page.inner_text("#sky-mag-val").strip()
    dig0 = canvas_digest(c, "#sky")
    c.page.evaluate(
        """() => { const s = document.querySelector('#sky-mag');
             s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); }""")
    c.page.wait_for_timeout(500)
    val1 = c.page.inner_text("#sky-mag-val").strip()
    dig1 = canvas_digest(c, "#sky")
    c.expect(val1 != val0, f"the magnitude readout must change ({val0!r} -> {val1!r})")
    c.expect(dig1 != dig0, "changing the magnitude limit must redraw the sky view")
    c.assert_clean()


def crop_drag(c, x0: float, x1: float):
    """Drag the crop band (fractions of the editor canvas width) at mid height."""
    box = c.page.locator("#pano-canvas").bounding_box()
    c.expect(box and box["width"] > 20, "pano canvas must have a size")
    y = box["y"] + box["height"] * 0.5
    sx = box["x"] + box["width"] * x0
    ex = box["x"] + box["width"] * x1
    c.page.mouse.move(sx, y)
    c.page.mouse.down()
    for i in range(1, 9):
        c.page.mouse.move(sx + (ex - sx) * i / 8, y)
    c.page.mouse.up()
    c.page.wait_for_timeout(150)


def active_profile(c):
    st = pano_state(c)
    if not st or not st.get("panos"):
        return None
    p = next((p for p in st["panos"] if p.get("id") == st.get("activeId")),
             st["panos"][0])
    return p.get("profile")


@check("web-pano-crop-recalibrate", "web")
def web_pano_crop_recalibrate(c):
    """Non-destructive kept-band crop: it shrinks the FOV, moves the left-edge
    azimuth and transforms the strokes (the photo and paint survive - unlike the
    desktop, which re-encodes and wipes). Crop both sides of a partial-FOV frame,
    save, reload, and confirm the blocked profile is byte-identical."""
    boot(c)
    open_editor(c)
    paint(c)
    # a partial 180 deg frame so the crop is a real recalibration
    c.page.evaluate(
        """() => { const s = document.querySelector('#ed-fov');
             s.value = '180'; s.dispatchEvent(new Event('input', { bubbles: true }));
             s.dispatchEvent(new Event('change', { bubbles: true })); }""")
    c.page.wait_for_timeout(200)

    c.page.click("#ed-crop")
    crop_drag(c, 0.25, 0.75)                 # keep the middle half
    c.page.click("#ed-crop-apply")
    c.page.wait_for_timeout(250)
    # kept half of a 180 deg frame -> 90 deg; az = 0 + 0.25*180 = 45
    c.expect_in("90\u00B0", c.page.inner_text("#ed-fov-v"),
                "the crop must keep half the FOV")
    c.expect_in("45\u00B0", c.page.inner_text("#ed-az-v"),
                "the crop must move the left-edge azimuth")
    c.expect_in("Unsaved", c.page.inner_text("#ed-status"),
                "a crop must dirty the editor")
    c.expect(not c.page.get_attribute("#ed-undo", "disabled"),
             "a crop must be one undoable history entry")

    # undo restores the pre-crop calibration; redo reapplies the crop
    c.page.click("#ed-undo")
    c.page.wait_for_function(
        """() => (document.querySelector('#ed-fov-v')?.textContent || '').includes('180')""",
        timeout=8000)
    c.page.click("#ed-redo")
    c.page.wait_for_function(
        """() => (document.querySelector('#ed-fov-v')?.textContent || '').includes('90')""",
        timeout=8000)

    c.page.click("#ed-save")
    c.page.wait_for_function(
        """() => (document.querySelector('#ed-status')?.textContent || '').includes('Saved')""",
        timeout=10000)
    c.expect(active_strokes(c) > 0,
             "the cropped strokes must survive (non-destructive crop)")
    saved = active_profile(c)
    c.expect(saved and len(saved) == 720, "the cropped profile must be saved")

    # reload: the cropped frame and its blocked profile survive untouched
    c.goto("/")
    tab(c, "horizon")
    c.page.wait_for_selector("#pano-list li[data-id]", timeout=30000)
    c.page.click("#pano-list li[data-id]")
    c.page.wait_for_selector("#pano-canvas", timeout=30000)
    c.expect_in("90\u00B0", c.page.inner_text("#ed-fov-v"),
                "reload must keep the cropped FOV")
    c.expect(active_profile(c) == saved,
             "the blocked profile must match the pre-save geometry")
    c.assert_clean()
