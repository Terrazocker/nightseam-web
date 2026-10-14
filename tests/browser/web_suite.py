"""Web browser checks (Playwright + system Chrome over the static `web/` tree).

Each check is registered with `@check(name, "web")`; `scripts/check_browser.py`
runs them against a throwaway static server.  Selectors mirror `web/index.html`
and the module-built DOM.
"""

from __future__ import annotations

import hashlib
import re
import struct
import time
import zlib
from pathlib import Path

from harness import ROOT, WEB_DIR, check

# ---------------------------------------------------------------- helpers

# The Direction B shell renders Tonight as a ranked table rather than the old
# `.pick`/`.card` list. Wait for an actual populated target row so callers do
# not continue against the static shell before the first planning render.
READY = "#tonight-rank-table tbody tr[data-tonight-id]"


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


def scrub_sky_to_wall(c, wall_iso):
    """Choose a site-local minute through the real range control."""
    c.page.wait_for_selector('#sky-slider', state='visible')
    source = (ROOT / 'web/app.js').read_text(encoding='utf-8')
    ws = re.search(r'\./webstore\.js\?v=\d+', source).group(0)
    c.page.evaluate("""async ({ws,wall}) => {
      const W=await import(ws), r=window.__ns_scrub_range();
      const minutes=Math.ceil((W.wallToUtc(new Date(wall)).getTime()-r.start)/60000);
      const slider=document.querySelector('#sky-slider');
      if (minutes<Number(slider.min)||minutes>Number(slider.max))
        throw new Error('Requested test time is outside the planned night');
      slider.value=String(minutes);
      slider.dispatchEvent(new Event('input',{bubbles:true}));
    }""", {'ws':ws,'wall':wall_iso})
    c.page.wait_for_function("""clock =>
      document.querySelector('#sky-sout')?.textContent===clock &&
      document.querySelector('#skyChartSummary')?.textContent.includes(clock)
    """, arg=wall_iso[11:16], timeout=15000)


def click_sky_target(c, target):
    """Click the target's actual map position, using shared astronomy for the
    isolated test site/time. Test the canvas hit path rather than a removed list."""
    c.page.locator('#sky').scroll_into_view_if_needed()
    source = (ROOT / 'web/app.js').read_text(encoding='utf-8')
    ws = re.search(r'\./webstore\.js\?v=\d+', source).group(0)
    point = c.page.evaluate('''async ({target,ws}) => {
      const E=await import('./core.js'); const W=await import(ws);
      const sites=await W.getSites();
      const site=sites.find(s=>s.id===document.querySelector('#tb-site').value);
      const jd=E.julianDay(new Date(window.__ns_scrub_sel()));
      const [alt,az]=E.altaz(target.ra_hours*15,target.dec_deg,jd,site.lat,site.lon);
      const cv=document.querySelector('#sky'); const width=cv.clientWidth;
      const r=(width/2-22)*(1-alt/90), a=az*Math.PI/180;
      return {alt,x:width/2+r*Math.sin(a),y:width/2-r*Math.cos(a)};
    }''', {'target':target,'ws':ws})
    c.expect(point['alt'] > 0, 'test target is above the horizon for map picking')
    c.page.locator('#sky').click(position={'x':point['x'],'y':point['y']})


def rgb_png(width: int, height: int, pixel) -> bytes:
    """An RGB PNG whose pixel colour is `pixel(x, y)`."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            rows.extend(pixel(x, y))

    def chunk(tag: bytes, payload: bytes) -> bytes:
        body = tag + payload
        return (struct.pack(">I", len(payload)) + body
                + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows, 6))
            + chunk(b"IEND", b""))


def horizon_test_png(width: int, height: int) -> bytes:
    """Tiny RGB panorama with edge colors to catch side-cropping in the editor."""
    return rgb_png(width, height, lambda x, _y: (220, 70, 75) if x < width * 0.12 else (
        (80, 125, 230) if x >= width * 0.88 else (65, 145, 110)))


def skyline_test_png(width: int, height: int, ground: float) -> bytes:
    """Daylight sky over dark ground; the ground starts `ground` (0-1) down."""
    return rgb_png(width, height, lambda _x, y: (120, 170, 235) if y < height * ground else (40, 60, 30))


def search_catalog_row(c, object_id: str, search: str):
    """Wait for the debounced search render, not a stale pre-filtered row."""
    old_input = c.page.locator("#cat-q").element_handle()
    c.page.fill("#cat-q", search)
    c.page.dispatch_event("#cat-q", "input")
    c.page.wait_for_function("(input) => !input.isConnected", arg=old_input,
                             timeout=15000)
    row = c.page.locator(f".cat tbody tr[data-id='{object_id}']")
    row.wait_for(state="visible", timeout=30000)
    return row


def open_catalog_photo(c, object_id: str, search: str):
    """Open a known object without depending on its current visibility/rank."""
    tab(c, "catalog")
    search_catalog_row(c, object_id, search).click()
    c.page.wait_for_selector("#d-img", state="attached")


def decoded_photo(c, width: int | None = None, height: int | None = None):
    """A loaded response alone does not prove CSP permitted an image to decode."""
    c.page.wait_for_function(
        """() => { const img = document.querySelector('#d-img');
             return img && img.complete && img.naturalWidth > 0
               && img.naturalHeight > 0 && getComputedStyle(img).display !== 'none'; }""",
        timeout=15000)
    image = c.page.evaluate(
        """async () => { const img = document.querySelector('#d-img');
             await img.decode();
             return {width: img.naturalWidth, height: img.naturalHeight, src: img.src,
               placeholder: getComputedStyle(document.querySelector('#d-imgph')).display}; }""")
    c.expect_eq(image["placeholder"], "none", "a decoded image must replace its placeholder")
    if width is not None:
        c.expect_eq(image["width"], width, "wrong decoded thumbnail width")
    if height is not None:
        c.expect_eq(image["height"], height, "wrong decoded thumbnail height")
    return image


def photo_credit_text(c):
    """Read the full credit through the inspector's source disclosure."""
    disclosure = c.page.locator("details.catalog-details")
    if not disclosure.evaluate("element => element.open"):
        disclosure.locator(":scope > summary").click()
    credit = c.page.locator("#d-imagecredit")
    credit.wait_for(state="visible")
    return credit.inner_text()


def photo_routes(c, transient=False):
    """Exercise the real policy and loader using local deterministic responses.

    Photos load directly from Wikipedia, without local image probes.
    Both shipped policy carriers protect this document, so a missing allowlist
    in either one fails the fresh/cached decode checks.
    """
    text = (WEB_DIR / ".htaccess").read_text(encoding="utf-8")
    policy = re.search(
        r'^\s*Header\s+\S+\s+set\s+Content-Security-Policy\s+"([^"]+)"',
        text, re.M).group(1)

    def document(route):
        response = route.fetch()
        headers = dict(response.headers)
        headers["content-security-policy"] = policy
        route.fulfill(response=response, headers=headers)

    c.page.route(c.url("/"), document)
    state = {"transient": transient, "deny_external": False, "wiki": 0, "image": 0, "credit": 0}
    expected_errors = []
    wiki_prefix = "https://en.wikipedia.org/api/rest_v1/page/summary/"
    thumbnail = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Nightseam-test.png/330px-Nightseam-test.png"

    def console(msg):
        # Only the explicitly induced 503 responses are expected; never blanket
        # ignore console/page errors, CSP violations or broken local resources.
        if (msg.type == "error" and msg.location.get("url", "").startswith(wiki_prefix)
                and "503" in msg.text and state["transient"]):
            expected_errors.append(msg.text[:300])

    c.page.on("console", console)

    def wiki(route):
        state["wiki"] += 1
        if state["deny_external"]:
            route.abort()
        elif state["transient"]:
            route.fulfill(status=503, headers={"Access-Control-Allow-Origin": "*"},
                          content_type="application/json", body='{"error":"offline fixture"}')
        else:
            route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"},
                          json={"type": "standard", "title": "Pinwheel Galaxy",
                                "thumbnail": {"source": thumbnail}})

    def image(route):
        state["image"] += 1
        if state["deny_external"]:
            route.abort()
        else:
            route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"},
                          content_type="image/png", body=horizon_test_png(24, 12))

    def credit(route):
        state["credit"] += 1
        if state["deny_external"]:
            route.abort()
        else:
            route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"}, json={
                "query": {"pages": {"1": {"imageinfo": [{"extmetadata": {
                    "Artist": {"value": '<a href="https://example.org">Fixture author</a>'},
                    "LicenseShortName": {"value": "CC BY 4.0"},
                    "LicenseUrl": {"value": "https://creativecommons.org/licenses/by/4.0/"}}}]}}}})

    c.page.route(wiki_prefix + "**", wiki)
    c.page.route(thumbnail, image)
    c.page.route("https://en.wikipedia.org/w/api.php?**", credit)
    return state, expected_errors


def stored_photo(c, object_id: str):
    return c.page.evaluate(
        """(id) => new Promise((resolve, reject) => {
             const rq = indexedDB.open('nightseam-images', 1);
             rq.onerror = () => reject(rq.error);
             rq.onsuccess = () => {
               const db = rq.result;
               const get = db.transaction('thumbs').objectStore('thumbs').get('w:' + id);
               get.onerror = () => { db.close(); reject(get.error); };
               get.onsuccess = () => { const value = get.result; db.close();
                 resolve(value ? {blob: value.blob instanceof Blob,
                   size: value.blob?.size || 0, missing: !!value.missing,
                   credit: value.credit || null} : null); };
             };
           })""", object_id)


def open_editor(c):
    """A new hand-drawn horizon in a viewport tall enough for the whole grid."""
    tab(c, "horizon")
    c.page.wait_for_selector("#hz-new-draw", timeout=20000)
    c.page.click("#hz-new-draw")
    c.page.wait_for_selector("#hz-canvas", state="visible", timeout=20000)
    c.page.set_viewport_size({"width": 1366, "height": 1100})
    c.page.evaluate("() => window.scrollTo(0, 0)")
    c.page.locator("#hz-canvas").scroll_into_view_if_needed()
    c.page.wait_for_timeout(250)


def canvas_point(c, fx: float, fy: float):
    box = c.page.locator("#hz-canvas").bounding_box()
    c.expect(box and box["width"] > 20, "the horizon canvas must have a size")
    return box["x"] + box["width"] * fx, box["y"] + box["height"] * fy


def sketch(c, x0=0.30, x1=0.62, y0=0.45, y1=0.35):
    """Drag across empty grid: a sketched skyline stretch."""
    c.page.locator("#hz-canvas").scroll_into_view_if_needed()
    sx, sy = canvas_point(c, x0, y0)
    ex, ey = canvas_point(c, x1, y1)
    c.page.mouse.move(sx, sy)
    c.page.mouse.down()
    for i in range(1, 13):
        c.page.mouse.move(sx + (ex - sx) * i / 12, sy + (ey - sy) * i / 12)
    c.page.mouse.up()
    c.page.wait_for_timeout(180)


def click_grid(c, fx: float, fy: float):
    x, y = canvas_point(c, fx, fy)
    c.page.mouse.click(x, y)
    c.page.wait_for_timeout(150)


def horizon_state(c):
    return c.page.evaluate(
        """() => { try { return JSON.parse(localStorage.getItem('nightseam_horizons_v2') || 'null'); }
                  catch (e) { return null; } }""")


def active_horizon(c):
    st = horizon_state(c)
    if not st or not st.get("horizons"):
        return None
    return next((h for h in st["horizons"] if h.get("id") == st.get("activeId")), st["horizons"][0])


def active_points(c):
    h = active_horizon(c)
    return -1 if h is None else len(h.get("points") or [])


def wait_status(c, text_value: str, timeout: int = 8000):
    try:
        c.page.wait_for_function(
            """(want) => (document.querySelector('#ed-status')?.textContent || '').includes(want)""",
            arg=text_value, timeout=timeout)
    except Exception as exc:
        raise AssertionError(
            f"editor status did not reach {text_value!r}: {c.page.inner_text('#ed-status')!r}; "
            f"undo-disabled={c.page.is_disabled('#ed-undo')}, "
            f"redo-disabled={c.page.is_disabled('#ed-redo')}") from exc


def upload_photo(c, name: str, data: bytes, selector: str = "#hz-photo-file"):
    c.page.locator(selector).set_input_files({"name": name, "mimeType": "image/png", "buffer": data})
    # Each photo opens a new horizon named after the file; wait for that one, or
    # a second upload would read the previous photo's still-visible fields.
    c.page.wait_for_function("(n) => document.querySelector('#hz-name')?.value === n",
                             arg=name.rsplit(".", 1)[0], timeout=15000)
    c.page.wait_for_selector("#hz-ph-width", state="visible", timeout=15000)
    c.page.wait_for_function("() => !document.querySelector('#hz-mode-align').disabled", timeout=15000)


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
    c.expect(c.page.locator(READY).count() > 0,
             "the Tonight ranking must render at least one target row")
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


@check("web-horizon-create-buttons-consistent", "web")
def web_horizon_create_buttons(c):
    """ITEM B regression, current form: the three ways to start a horizon (two
    label-buttons and a button) render at one shared width, so a label used as
    a button can never stretch while its siblings do not. Rendered layout."""
    boot(c)
    tab(c, "horizon")
    c.page.wait_for_selector(".hz-new", timeout=20000)
    for width in (1024, 1366, 390):
        c.page.set_viewport_size({"width": width, "height": 900})
        c.page.wait_for_timeout(250)
        widths = c.page.evaluate(
            """() => [...document.querySelectorAll('.hz-new > .btn')]
                 .map(e => Math.round(e.getBoundingClientRect().width))""")
        c.expect(len(widths) == 3, f"three create controls expected, got {widths}")
        c.expect(max(widths) - min(widths) <= 2, f"create controls differ in width at {width}px: {widths}")
    c.page.set_viewport_size({"width": 1366, "height": 900})
    c.assert_clean()


@check("web-horizon-draw-save-persist", "web")
def web_horizon_draw_save_persist(c):
    """A sketch and a click become skyline points, save automatically and
    survive a reload."""
    boot(c)
    open_editor(c)
    sketch(c)
    c.expect(active_points(c) >= 2, "a sketched stretch must store skyline points")
    wait_status(c, "Saved")
    before = active_points(c)
    click_grid(c, 0.85, 0.40)
    c.expect_eq(active_points(c), before + 1, "a click on empty grid adds one point")
    c.expect("skyline point" in c.page.inner_text("#hz-summary"),
             "the text summary describes the skyline")
    saved = active_horizon(c)["points"]
    c.goto("/")
    tab(c, "horizon")
    c.page.wait_for_selector("#hz-canvas", timeout=30000)
    c.expect_eq(active_horizon(c)["points"], saved, "the skyline must persist across a reload")
    c.assert_clean()


@check("web-horizon-undo-redo-clear", "web")
def web_horizon_undo_redo_clear(c):
    boot(c)
    open_editor(c)
    sketch(c)
    first = active_points(c)
    click_grid(c, 0.85, 0.40)
    c.expect_eq(active_points(c), first + 1, "the click adds a point")
    c.page.click("#ed-undo")
    c.page.wait_for_timeout(200)
    c.expect_eq(active_points(c), first, "undo removes the added point and saves")
    c.page.click("#ed-redo")
    c.page.wait_for_timeout(200)
    c.expect_eq(active_points(c), first + 1, "redo brings it back")
    wait_status(c, "Saved")
    # Clear is confirmed in-page (never alert()) and is undoable
    c.page.click("#hz-clear")
    c.page.wait_for_selector(".ed-confirm [data-ok]", timeout=5000)
    c.page.click(".ed-confirm [data-ok]")
    c.page.wait_for_timeout(300)
    c.expect_eq(active_points(c), 0, "Clear removes every point")
    c.page.click("#ed-undo")
    c.page.wait_for_timeout(300)
    c.expect_eq(active_points(c), first + 1, "Clear must be undoable")
    c.assert_clean()


@check("web-horizon-storage-quota", "web")
def web_horizon_storage_quota(c):
    """A full localStorage must surface 'Save failed', keep the edit on screen
    and arm the leave-page warning; the next successful save catches up."""
    boot(c)
    open_editor(c)
    c.page.evaluate(
        """() => {
          window.__origSet = Storage.prototype.setItem;
          Storage.prototype.setItem = function () {
            throw new DOMException('quota', 'QuotaExceededError');
          };
        }""")
    try:
        sketch(c)
        wait_status(c, "Save failed", timeout=10000)
        c.expect(active_points(c) <= 0, "a failed save must not have stored points")
        c.expect("skyline point" in c.page.inner_text("#hz-summary"), "the edit stays on screen")
        source = (ROOT / 'web/app.js').read_text(encoding='utf-8')
        horizon = re.search(r'\./horizon\.js\?v=\d+', source).group(0)
        c.expect(c.page.evaluate("async m => (await import(m)).horizonUnsaved()", horizon),
                 "the leave-page warning must be armed after a failed save")
    finally:
        c.page.evaluate("() => { Storage.prototype.setItem = window.__origSet; }")
    click_grid(c, 0.85, 0.40)
    wait_status(c, "Saved")
    c.expect(active_points(c) >= 3, "the next save stores everything, including the earlier sketch")
    c.allow_console_errors("intentional QuotaExceededError")
    c.assert_clean()


@check("web-horizon-canvas-dpr-resize", "web")
def web_horizon_canvas_dpr_resize(c):
    """The editor canvas is DPR-aware and follows a resize (ResizeObserver)."""
    boot(c)
    open_editor(c)

    def dims():
        return c.page.evaluate(
            """() => { const cv = document.querySelector('#hz-canvas');
                 return { w: cv.width, h: cv.height,
                          bw: cv.getBoundingClientRect().width,
                          dpr: Math.min(3, window.devicePixelRatio || 1) }; }""")

    for width in (1024, 1500, 390):
        c.page.set_viewport_size({"width": width, "height": 900})
        c.page.wait_for_timeout(400)
        d = dims()
        c.expect(abs(d["w"] - d["bw"] * d["dpr"]) <= 2,
                 f"canvas backing store {d['w']} != box width {d['bw']} * dpr {d['dpr']} at {width}px")
        c.expect(d["w"] > 0 and d["h"] > 0, "canvas must keep a backing store")
    c.page.set_viewport_size({"width": 1366, "height": 900})
    c.assert_clean()


@check("web-horizon-photo-placement", "web")
def web_horizon_photo_placement(c):
    """A 2:1 photo is a full panorama laid around the whole grid; any other
    shape is a 60 deg partial photo; the photo is drawn where it belongs."""
    boot(c)
    tab(c, "horizon")
    upload_photo(c, "full.png", horizon_test_png(144, 72))
    c.expect_eq(c.page.locator("#hz-ph-width").input_value(), "360", "a 2:1 photo is a full panorama")
    c.expect(c.page.locator("#hz-ph-roll").is_disabled(), "a full panorama is not rolled")
    c.page.locator('#hz-guide [data-guide="close"]').click()
    colours = c.page.evaluate("""() => {
      const cv = document.querySelector('#hz-canvas'), ctx = cv.getContext('2d');
      const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
      // grid margins 40/8 px, altitude -10..80 at zoom 1; sample 5 deg altitude
      const x = (az) => (40 + az / 360 * (r.width - 48)) * dpr;
      const y = (24 + (80 - 5) / 90 * (r.height - 32)) * dpr;
      const at = (az) => [...ctx.getImageData(Math.round(x(az)), Math.round(y), 1, 1).data];
      return { west: at(20), mid: at(180), east: at(340) };
    }""")
    c.expect(colours["west"][0] > colours["west"][2], f"the photo's left edge sits just east of north: {colours}")
    c.expect(colours["east"][2] > colours["east"][0], f"the photo's right edge sits just west of north: {colours}")
    c.expect(colours["mid"][1] > colours["mid"][0], f"the photo centre faces south: {colours}")
    upload_photo(c, "partial.png", horizon_test_png(96, 72))
    c.expect_eq(c.page.locator("#hz-ph-width").input_value(), "60", "an ordinary photo starts 60 deg wide")
    c.expect(c.page.locator("#hz-ph-roll").is_enabled(), "a partial photo can be levelled")
    c.expect("photo" in c.page.inner_text("#hz-list"), "the list marks horizons with a photo")
    c.assert_clean()


@check("web-horizon-detect-skyline", "web")
def web_horizon_detect_skyline(c):
    """Detect skyline turns a daylight photo into points at the right height:
    ground from 40% down a 2:1 panorama is 18 deg above the level horizon."""
    boot(c)
    tab(c, "horizon")
    upload_photo(c, "garden.png", skyline_test_png(360, 180, 0.40))
    c.page.locator("#hz-detect").click()
    c.page.wait_for_function("() => /Detected \\d+ skyline points/.test(document.querySelector('#hz-note').textContent)",
                             timeout=10000)
    pts = active_horizon(c)["points"]
    c.expect(len(pts) >= 2, f"detection must store points: {pts}")
    c.expect(all(abs(p["alt"] - 18) <= 1.5 for p in pts), f"detected skyline must sit at 18 deg: {pts[:6]}")
    c.expect(min(p["az"] for p in pts) <= 5 and max(p["az"] for p in pts) >= 355,
             "a full panorama is detected all the way round")
    c.page.click("#ed-undo")
    c.page.wait_for_timeout(200)
    c.expect_eq(active_points(c), 0, "detection is one undoable step")
    c.assert_clean()


@check("web-horizon-align-moves-skyline", "web")
def web_horizon_align_moves_skyline(c):
    """Turning the photo moves the traced skyline with it, as one undo step;
    Align mode drags the photo."""
    boot(c)
    tab(c, "horizon")
    upload_photo(c, "partial.png", horizon_test_png(96, 72))
    c.page.locator('#hz-guide [data-guide="close"]').click()
    sketch(c, 0.35, 0.65, 0.5, 0.45)
    before = active_horizon(c)
    heading = c.page.locator("#hz-ph-heading")
    heading.fill(str(before["photo"]["heading"] + 10))
    heading.dispatch_event("change")
    c.page.wait_for_timeout(200)
    after = active_horizon(c)
    c.expect_eq(after["photo"]["heading"], before["photo"]["heading"] + 10, "the typed north direction applies")
    c.expect_eq([round(p["az"] - 10, 2) for p in after["points"]], [p["az"] for p in before["points"]],
                "every skyline point turns with the photo")
    c.page.click("#ed-undo")
    c.page.wait_for_timeout(200)
    c.expect_eq(active_horizon(c)["points"], before["points"], "the turn is one undo step")
    c.page.click("#hz-mode-align")
    c.expect_eq(c.page.get_attribute("#hz-mode-align", "aria-pressed"), "true", "Align mode is announced")
    sx, sy = canvas_point(c, 0.5, 0.5)
    c.page.mouse.move(sx, sy)
    c.page.mouse.down()
    c.page.mouse.move(sx + 40, sy, steps=6)
    c.page.mouse.up()
    c.page.wait_for_timeout(200)
    c.expect(active_horizon(c)["photo"]["heading"] > before["photo"]["heading"],
             "dragging the photo to the right turns it east")
    c.assert_clean()


@check("web-horizon-blocks-planning", "web")
def web_horizon_blocks_planning(c):
    """An imported horizon file becomes the active horizon and planning uses
    it: a wall up to the zenith all round leaves Tonight with no usable target."""
    boot(c)
    c.expect(c.page.locator(READY).count() > 0, "without a horizon Tonight has targets")
    tab(c, "horizon")
    c.page.locator("#hz-import-file").set_input_files({
        "name": "wall.hrz", "mimeType": "text/plain",
        "buffer": b"# N.I.N.A. horizon\n0 90\n120 90\n240 90\n"})
    c.page.wait_for_function("() => /Imported 3 points/.test(document.querySelector('#hz-note').textContent)",
                             timeout=10000)
    c.expect_eq(active_horizon(c)["name"], "wall", "the file name names the horizon")
    tab(c, "tonight")
    c.page.wait_for_timeout(600)
    c.expect_eq(c.page.locator(READY).count(), 0, "a horizon up to the zenith must leave nothing usable")
    c.expect("Horizon: wall" in c.page.inner_text("main"), "Tonight names the active horizon")
    c.assert_clean()


@check("web-horizon-overhang-blocks-sky", "web")
def web_horizon_overhang_blocks_sky(c):
    """Overhang mode draws an edge with the sky above it blocked; an overhang
    all round at 1 deg leaves nothing usable; it is one undoable edit and the
    keyboard reaches its points."""
    boot(c)
    c.expect(c.page.locator(READY).count() > 0, "without a horizon Tonight has targets")
    open_editor(c)
    c.page.click("#hz-mode-overhang")
    c.expect_eq(c.page.get_attribute("#hz-mode-overhang", "aria-pressed"), "true", "Overhang mode is announced")
    sketch(c, 0.40, 0.55, 0.30, 0.25)
    edges = active_horizon(c)["overhangs"]
    c.expect(len(edges) == 1 and len(edges[0]) >= 2, f"the drag stores one overhang edge: {edges}")
    c.expect("overhang" in c.page.inner_text("#hz-summary"), "the summary names the overhang")
    c.page.locator("#hz-canvas").focus()
    c.page.keyboard.press("ArrowRight")
    c.expect("overhang 1, point 1" in c.page.inner_text("#ed-pos"), "arrow keys walk overhang points")
    c.page.locator("#hz-points-panel summary").click()
    c.page.fill("#hz-oh-from", "0")
    c.page.fill("#hz-oh-to", "0")
    c.page.fill("#hz-oh-alt", "1")
    c.page.click("#hz-oh-add")
    c.page.wait_for_function("() => /Overhang added/.test(document.querySelector('#hz-note').textContent)")
    tab(c, "tonight")
    c.page.wait_for_timeout(600)
    c.expect_eq(c.page.locator(READY).count(), 0, "an overhang edge at 1 deg all the way round leaves nothing usable")
    tab(c, "horizon")
    c.page.wait_for_selector("#hz-canvas", timeout=10000)
    c.page.click("#ed-undo")
    c.page.wait_for_timeout(200)
    c.expect_eq(len(active_horizon(c)["overhangs"]), 1, "adding the overhang is one undo step")
    c.assert_clean()


@check("web-horizon-phone-compass", "web")
def web_horizon_phone_compass(c):
    """The phone compass turns device orientation into skyline points: a
    landmark correction, a single point and a traced sweep (Chrome's
    orientation override stands in for the sensor)."""
    boot(c)
    open_editor(c)
    cdp = c.page.context.new_cdp_session(c.page)
    orient = lambda a, b: cdp.send("DeviceOrientation.setDeviceOrientationOverride",
                                   {"alpha": a, "beta": b, "gamma": 0})
    orient(0, 90)
    c.page.locator("#hz-compass-panel summary").click()
    c.page.click("#hz-cmp-start")
    try:
        c.page.wait_for_function("() => /Pointing 0/.test(document.querySelector('#hz-cmp-read').textContent)",
                                 timeout=10000)
    except Exception as exc:
        raise AssertionError(f"no compass reading: {c.page.inner_text('#hz-cmp-read')!r} / "
                             f"{c.page.inner_text('#hz-cmp-status')!r}") from exc
    c.page.fill("#hz-cmp-true", "10")
    c.page.click("#hz-cmp-correct")
    c.expect("+10" in c.page.inner_text("#hz-cmp-status"), "the landmark sets a +10 deg correction")
    c.page.wait_for_function("() => /Pointing 10/.test(document.querySelector('#hz-cmp-read').textContent)",
                             timeout=10000)
    c.page.click("#hz-cmp-add")
    pts = active_horizon(c)["points"]
    c.expect(len(pts) == 1 and abs(pts[0]["az"] - 10) < 0.6 and abs(pts[0]["alt"]) < 0.6,
             f"an upright phone facing the landmark adds a level point at 10 deg: {pts}")
    c.page.click("#hz-cmp-trace")
    for alpha, beta in ((350, 95), (340, 100), (330, 98), (320, 92)):
        orient(alpha, beta)
        c.page.wait_for_timeout(150)
    c.page.click("#hz-cmp-trace")
    pts = active_horizon(c)["points"]
    c.expect(any(abs(p["az"] - 30) < 1 and abs(p["alt"] - 10) < 1 for p in pts),
             f"the sweep stores the 10 deg high point at 30 deg (alpha 340 + correction): {pts}")
    c.expect(max(p["az"] for p in pts) >= 39, f"the trace reaches the end of the sweep: {pts}")
    c.page.click("#hz-cmp-start")
    c.expect("Not measuring" in c.page.inner_text("#hz-cmp-read"), "Stop ends measuring")
    c.assert_clean()


@check("web-horizon-sun-sets-north", "web")
def web_horizon_sun_sets_north(c):
    """Marking the Sun in a photo and its capture time sets north and tilt from
    the Sun's computed position at the observing site."""
    boot(c)
    tab(c, "horizon")
    upload_photo(c, "sunny.png", horizon_test_png(144, 72))
    c.page.locator('#hz-guide [data-guide="close"]').click()
    c.page.click("#hz-sun")
    # Mark the grid point az 200, alt 20 of the default placement (heading
    # 180, tilt 0): 20 deg right of and 20 deg above the photo centre.
    box = c.page.locator("#hz-canvas").bounding_box()
    c.page.mouse.click(box["x"] + 40 + 200 / 360 * (box["width"] - 48),
                       box["y"] + 24 + (80 - 20) / 90 * (box["height"] - 32))
    c.page.wait_for_selector("#hz-sun-form:not([hidden])", timeout=5000)
    c.page.fill("#hz-sun-time", "2026-06-21T15:00")
    c.page.click("#hz-sun-apply")
    c.page.wait_for_function("() => /north and tilt are set/.test(document.querySelector('#hz-note').textContent)",
                             timeout=5000)
    source = (ROOT / "web/app.js").read_text(encoding="utf-8")
    ws = re.search(r"\./webstore\.js\?v=\d+", source).group(0)
    sun = c.page.evaluate("""async (ws) => {
      const W = await import(ws), C = await import('./core.js');
      const sites = await W.getSites();
      const site = sites.find((s) => s.id === document.querySelector('#tb-site').value) || { lat: 52.52, lon: 13.4 };
      return C.sunDirection(C.julianDay(W.wallFieldsToUtc(2026, 5, 21, 15, 0, 0)), site.lat, site.lon);
    }""", ws)
    photo = active_horizon(c)["photo"]
    c.expect(abs(((photo["heading"] + 20 - sun["az"] + 180) % 360) - 180) < 1.0,
             f"the marked pixel faces the Sun's azimuth: photo {photo}, sun {sun}")
    c.expect(abs(photo["tilt"] + 20 - sun["alt"]) < 1.0,
             f"the marked pixel sits at the Sun's altitude: photo {photo}, sun {sun}")
    c.page.click("#hz-sun")
    c.page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    c.page.fill("#hz-sun-time", "2026-06-21T23:30")
    c.page.click("#hz-sun-apply")
    c.expect("below the horizon" in c.page.inner_text("#hz-note"), "a night-time capture is refused")
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
    slider = c.page.get_by_role("slider", name="Selected observing time", exact=True)
    c.expect_eq(slider.count(), 1, "the top time slider needs an accessible name")
    before = c.page.inner_text("#tb-scrub-time").strip()
    c.expect(before, "the scrub must show a time")
    c.expect_in(before, slider.get_attribute("aria-valuetext"),
                "assistive technology must receive the displayed clock time and Sun phase")
    key = slider.evaluate("el => Number(el.value) < Number(el.max) ? 'ArrowRight' : 'ArrowLeft'")
    slider.focus()
    slider.press(key)
    try:
        c.page.wait_for_function(
            """(prev) => (document.querySelector('#tb-scrub-time')?.textContent || '')
                          .trim() !== prev""", arg=before, timeout=8000)
    except Exception:
        raise AssertionError(f"scrubbing did not change the time from {before!r}")
    c.expect_in(c.page.inner_text("#tb-scrub-time").strip(),
                slider.get_attribute("aria-valuetext"),
                "keyboard scrubbing must update the accessible clock time")
    c.assert_clean()


@check("web-tonight-render-marker-converges", "web")
def web_tonight_render_marker_converges(c):
    """BUG-005: a check must be able to WAIT for the Tonight paint.

    The application debounces a scrub by 120 ms and then defers the ranking by
    another tick, so a check that sleeps a nominal 120 ms samples the PREVIOUS
    selection about as often as the new one (measured 25/26 full-sequence
    failures, passing in isolation, with stale rows in the artifact). The view
    now publishes `#view[data-ns-gen]`/`[data-ns-sel]`, and the wait demands the
    instant the REQUESTED scrub position names (not merely "a newer paint") - the
    boot sequence can leave a stale marker behind, and accepting any generation
    bump sampled that instead."""
    boot(c)
    range0 = c.page.evaluate("() => window.__ns_scrub_range()")
    c.expect(range0 and range0["end"] > range0["start"],
             f"the scrub range is empty: {range0}")
    first = c.wait_tonight_render()
    c.expect_eq(first["sel"], c.page.evaluate("() => window.__ns_scrub_sel()"),
                "the first Tonight paint did not name the selected instant")
    # move the slider a third of the way in and wait for THAT selection
    pos = c.page.eval_on_selector(
        "#tb-scrub", "el => Math.round((Number(el.min) + Number(el.max)) / 3)")
    want = c.page.evaluate("(v) => window.__ns_scrub_at(v)", pos)
    c.expect(want != first["sel"], "the scrub position did not move")
    c.page.eval_on_selector(
        "#tb-scrub", """(el, v) => { el.value = String(v);
            el.dispatchEvent(new Event('input', { bubbles: true })); }""", pos)
    later = c.wait_tonight_after(first["gen"], sel=want)
    c.expect(later["gen"] > first["gen"],
             f"the render marker did not advance: {first} -> {later}")
    c.expect_eq(later["sel"], want,
                "the marker converged on a different instant than the scrub "
                "position names (a stale paint satisfied the wait)")
    c.expect_eq(c.page.evaluate("() => window.__ns_scrub_sel()"), want,
                "the app's marker and its scrubber disagree about the selected "
                "instant")
    rows = c.page.eval_on_selector_all(
        "#tonight-rank-table tbody tr[data-tonight-id]",
        "els => els.map((e) => e.dataset.tonightId)")
    c.expect(rows, "the painted selection rendered no rows at all")
    c.assert_clean()


@check("web-workbench-only-render", "web")
def web_workbench_only_render(c):
    """Exercise the sole Workbench design and ensure retired theme controls stay absent."""
    boot(c)
    c.expect_eq(c.page.locator("html").get_attribute("data-theme"), "workbench",
                "the web planner must boot in Workbench")
    c.expect_eq(c.page.locator("#themeRow .theme-btn").count(), 0,
                "the retired theme picker must stay absent")
    for view in ("sky", "tonight"):
        c.page.click(f"#tabs a[data-v='{view}']")
        c.page.wait_for_timeout(250)
        accent = c.page.evaluate(
            """() => getComputedStyle(document.documentElement)
                       .getPropertyValue('--accent').trim()""")
        c.expect(accent, "Workbench must expose an accent token")
        if view == "sky":
            c.expect(c.page.locator("#sky").bounding_box(), "Sky View canvas missing")
        else:
            c.expect(c.page.locator("#tonight-rank-table").bounding_box(), "Tonight ranking missing")
            c.expect_eq(c.page.locator("#tonightOverviewChart").count(), 0, "Removed overview must stay absent")
    c.assert_clean()


@check("web-photos-online-only", "web")
def web_photos_online_only(c):
    state, _expected = photo_routes(c)
    local_requests = []
    c.page.on("request", lambda request: local_requests.append(request.url)
              if "/img/" in request.url or "image-attributions.json" in request.url else None)
    boot(c)
    # This target previously had a bundled DSS image. It now takes the same
    # direct Wikipedia path as every other target, with no failed local probe.
    open_catalog_photo(c, "ngc281", "NGC 281")
    image = decoded_photo(c, 24, 12)
    c.expect(image["src"].startswith("blob:"), "online thumbnail must decode")
    c.expect_eq(state["wiki"], 1)
    c.expect_eq(state["image"], 1)
    c.expect_eq(local_requests, [], "legacy image files and manifest must never be requested")
    c.page.wait_for_function("() => document.querySelector('#d-imagecredit')?.textContent.includes('Fixture author · CC BY 4.0')")
    c.assert_clean()


@check("web-photos-fresh-and-cached", "web")
def web_photos_fresh_and_cached(c):
    state, _expected = photo_routes(c)
    boot(c)
    open_catalog_photo(c, "ngc5457", "M101")
    image = decoded_photo(c, 24, 12)
    c.expect(image["src"].startswith("blob:"), "fresh Wikimedia bytes must display through a blob URL")
    c.expect_eq(state["wiki"], 1, "fresh thumbnail must fetch Wikipedia once")
    c.expect_eq(state["image"], 1, "fresh thumbnail must fetch Wikimedia once")
    cached = stored_photo(c, "ngc5457")
    c.expect(cached and cached["blob"] and cached["size"] > 0 and not cached["missing"],
             f"successful thumbnail must persist as a Blob: {cached}")
    c.page.wait_for_function("() => document.querySelector('#d-imagecredit')?.textContent.includes('Fixture author · CC BY 4.0')")
    c.expect_eq(c.page.locator("#d-imagecredit a").get_attribute("href"),
                "https://commons.wikimedia.org/wiki/File:Nightseam-test.png",
                "credit must identify the exact downloaded file, not a generic object search")
    c.assert_clean()

    # Reload discards in-memory URLs. The image must decode from IndexedDB even
    # when every external photo request is denied, rather than refetching it.
    state["deny_external"] = True
    c.page.reload(wait_until="domcontentloaded")
    c.page.wait_for_selector("#cat-q", timeout=60000)
    open_catalog_photo(c, "ngc5457", "M101")
    image = decoded_photo(c, 24, 12)
    c.expect(image["src"].startswith("blob:"), "persisted thumbnail must decode through a new blob URL")
    c.expect_eq(state["wiki"], 1, "cached thumbnail must not refetch Wikipedia")
    c.expect_eq(state["image"], 1, "cached thumbnail must not refetch Wikimedia")
    c.expect_eq(state["credit"], 1, "cached thumbnail must retain attribution without refetching metadata")
    c.expect("Fixture author · CC BY 4.0" in photo_credit_text(c),
             "author and license must survive offline cache reuse")
    # Pre-attribution cache entries remain usable offline, but must never acquire
    # a guessed author/license from a different or newly selected photograph.
    c.page.evaluate("""() => new Promise((resolve, reject) => {
      const rq = indexedDB.open('nightseam-images', 1);
      rq.onerror = () => reject(rq.error);
      rq.onsuccess = () => { const db = rq.result;
        const tx = db.transaction('thumbs', 'readwrite'); const store = tx.objectStore('thumbs');
        const get = store.get('w:ngc5457'); get.onsuccess = () => {
          const record = get.result; delete record.credit; store.put(record, 'w:ngc5457'); };
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    })""")
    c.page.click("#m-close")
    open_catalog_photo(c, "ngc5457", "M101")
    decoded_photo(c, 24, 12)
    c.expect_eq(photo_credit_text(c), "Photo attribution unavailable",
                "old cached bytes must report absent attribution explicitly")
    c.expect_eq(state["wiki"], 1, "old cached bytes must not refetch an unrelated image")
    c.expect_eq(state["credit"], 1, "unknown cached source cannot safely be assigned new metadata")
    c.assert_clean()


PHOTO_CACHE_ROWS = """async () => {
  const db = await new Promise((resolve, reject) => {
    const rq = indexedDB.open('nightseam-images', 1);
    rq.onsuccess = () => resolve(rq.result); rq.onerror = () => reject(rq.error); });
  const rows = await new Promise((resolve, reject) => {
    const out = {}, tx = db.transaction('thumbs');
    tx.objectStore('thumbs').openCursor().onsuccess = (ev) => {
      const cur = ev.target.result; if (!cur) return;
      const v = cur.value;
      out[cur.key] = v && v.blob instanceof Blob ? v.blob.size : (v && v.missing ? 'missing' : 'other');
      cur.continue(); };
    tx.oncomplete = () => resolve(out); tx.onerror = () => reject(tx.error); });
  db.close();
  return rows;
}"""


def photo_cache_rows(c, until):
    """Cache contents once `until(rows)` holds (pruning runs after display)."""
    for _ in range(50):
        rows = c.page.evaluate(PHOTO_CACHE_ROWS)
        if until(rows):
            return rows
        c.page.wait_for_timeout(200)
    return rows


@check("web-photo-cache-budget", "web")
def web_photo_cache_budget(c):
    """Cached photos stay under 25 MiB, least recently viewed first out; expired
    "no photo" answers and unreadable rows go; a full disk is retried once."""
    MIB = 1024 * 1024
    state, _expected = photo_routes(c)
    boot(c)
    c.page.evaluate("""(mib) => new Promise((resolve, reject) => {
      const rq = indexedDB.open('nightseam-images', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('thumbs'); };
      rq.onerror = () => reject(rq.error);
      rq.onsuccess = () => { const db = rq.result, now = Date.now();
        const tx = db.transaction('thumbs', 'readwrite'), store = tx.objectStore('thumbs');
        const bytes = new Uint8Array(mib);
        for (let i = 0; i < 30; i++) {
          const used = i === 0 ? now - 1000 : 1000 + i; // seed00 was viewed just now
          store.put({ blob: new Blob([bytes], { type: 'image/png' }), page: 'Seed', ts: 1000 + i, used },
                    'w:seed' + String(i).padStart(2, '0'));
        }
        store.put({ missing: true, ts: now - 31 * 86400000 }, 'w:negold');
        store.put({ missing: true, ts: now }, 'w:negnew');
        store.put({ junk: true }, 'w:junk');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    })""", MIB)
    open_catalog_photo(c, "ngc5457", "M101")
    decoded_photo(c, 24, 12)
    rows = photo_cache_rows(c, lambda r: "w:ngc5457" in r and "w:seed01" not in r)
    photos = {k: v for k, v in rows.items() if isinstance(v, int)}
    total = sum(photos.values())
    c.expect(total <= 20 * MIB + 64 * 1024, f"photo cache trimmed to 80% of 25 MiB: {total} bytes")
    c.expect(all(f"w:seed{i:02d}" not in rows for i in range(1, 12)),
             f"the least recently viewed photos are removed first: {sorted(rows)}")
    c.expect(all(f"w:seed{i:02d}" in rows for i in range(12, 30)), f"newer photos stay: {sorted(rows)}")
    c.expect("w:seed00" in rows, "a photo viewed recently stays although it was stored first")
    c.expect("w:ngc5457" in rows, "the photo just opened stays")
    c.expect_eq(rows.get("w:negnew"), "missing", "a current 'no photo' answer stays")
    c.expect("w:negold" not in rows and "w:junk" not in rows,
             f"expired 'no photo' answers and unreadable rows are removed: {sorted(rows)}")
    c.assert_clean()

    # A full disk aborts the first photo write: the cache is cut to a quarter
    # of its budget and the write retried once, so the photo is still kept.
    c.page.click("#m-close")
    c.page.evaluate("""() => new Promise((resolve, reject) => {
      const rq = indexedDB.open('nightseam-images', 1);
      rq.onerror = () => reject(rq.error);
      rq.onsuccess = () => { const db = rq.result, tx = db.transaction('thumbs', 'readwrite');
        tx.objectStore('thumbs').delete('w:ngc5457');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    })""")
    c.page.evaluate("""() => {
      const put = IDBObjectStore.prototype.put;
      window.__quotaThrown = false;
      IDBObjectStore.prototype.put = function (value, key) {
        if (!window.__quotaThrown && value && value.blob && key === 'w:ngc5457') {
          window.__quotaThrown = true;
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return put.call(this, value, key);
      };
    }""")
    open_catalog_photo(c, "ngc5457", "M101")
    decoded_photo(c, 24, 12)
    rows = photo_cache_rows(c, lambda r: "w:ngc5457" in r)
    c.expect(c.page.evaluate("window.__quotaThrown"), "the simulated full disk was hit")
    c.expect("w:ngc5457" in rows, f"the photo is stored after the retry: {sorted(rows)}")
    total = sum(v for v in rows.values() if isinstance(v, int))
    c.expect(total <= 5 * MIB + 64 * 1024, f"a full disk cuts the cache to a fifth of the budget: {total} bytes")
    c.expect_eq(state["image"], 2, "the deleted photo was downloaded again")
    c.assert_clean()


@check("web-photos-unavailable-retries", "web")
def web_photos_unavailable_retries(c):
    state, expected_errors = photo_routes(c, transient=True)
    boot(c)
    open_catalog_photo(c, "ngc5457", "M101")
    c.page.wait_for_function(
        """() => document.querySelector('#d-imgph')?.textContent
             .includes('photo unavailable right now')""", timeout=15000)
    c.expect(c.page.locator("#d-imgph").is_visible(), "network failure must leave a readable placeholder")
    c.expect(not c.page.locator("#d-img").is_visible(), "network failure must not show a broken image")
    c.expect_eq(stored_photo(c, "ngc5457"), None, "transient failures must not cache a missing-photo answer")
    c.expect(state["wiki"] > 0 and state["image"] == 0,
             "the controlled unavailable provider must fail before thumbnail download")
    c.expect_eq(len(expected_errors), state["wiki"], "every induced provider 503 must be accounted for")
    for message in expected_errors:
        c.expect(message in c.console_errors, "expected 503 must have been captured by the gate")
        c.console_errors.remove(message)
    c.assert_clean()

    state["transient"] = False
    c.page.click("#m-close")
    open_catalog_photo(c, "ngc5457", "M101")
    decoded_photo(c, 24, 12)
    c.expect_eq(state["image"], 1, "reopening after provider recovery must retry and show the thumbnail")
    c.assert_clean()


@check("web-accessibility-essentials", "web")
def web_accessibility_essentials(c):
    """The real web DOM must expose tab semantics and text alternatives for
    the canvas charts after the dynamic views are rendered."""
    c.page.set_viewport_size({"width": 1366, "height": 900})
    boot(c)
    tabs = c.page.locator("#tabs a[role='tab']")
    c.expect_eq(tabs.count(), 4, "the planner tablist must expose four tabs")
    labels = [s.strip() for s in tabs.all_text_contents()]
    c.expect_eq(labels, ["Tonight", "Catalog", "Sky View", "Horizon"],
                "the web planner must use the four Direction B labels")
    c.expect_eq(c.page.locator("#tabs a[aria-selected='true']").count(), 1,
                "exactly one web planner tab must be selected")

    tab(c, "sky")
    c.page.wait_for_selector("#sky[role='img'][aria-describedby='skyChartSummary']")
    c.expect_eq(c.page.locator("#sky").get_attribute("tabindex"), "0",
                "the Sky View canvas must be keyboard focusable")
    c.expect(c.page.inner_text("#skyChartSummary"),
             "the web sky chart needs a non-empty screen-reader summary")

    tab(c, "catalog")
    c.page.wait_for_selector(".cat tbody tr[data-id]")
    c.page.locator("#cat-more summary").click()
    c.expect_eq(c.page.locator("#cat-sort").input_value(), "name")
    options = c.page.locator("#cat-sort option").all_text_contents()
    c.expect(not any("popularity" in text.lower() for text in options),
             "the catalog must not expose Popularity sorting")
    c.expect_eq(c.page.locator('#cat-sort option[value="tier"]').count(), 0)
    c.page.locator("#cat-sort").select_option("mag")
    c.page.click("#cat-clear-filters")
    c.expect_eq(c.page.locator("#cat-sort").input_value(), "name",
                "clearing filters must restore the visible Name default")
    c.expect(c.page.locator(".cat .common-cell").evaluate_all("""cells => {
      const names = cells.map(cell => cell.title);
      return names.length > 1 && names.every((name, i) => !i || names[i-1].localeCompare(name) <= 0);
    }"""), "the Name default must actually sort the displayed catalog rows")
    c.page.wait_for_selector("#cat-export-provenance")
    provenance = c.page.evaluate(
        """async () => { const r = await fetch('catalog-provenance.json?v=1');
             const j = await r.json();
             return { schema: j.schema_version,
                      source: j.objects?.ngc1976?.source,
                      aliases: j.objects?.ngc1976?.aliases?.length || 0 }; }""")
    c.expect(provenance["schema"] == 1 and provenance["source"] == "OpenNGC"
             and provenance["aliases"] > 0,
             f"the web provenance sidecar was not loaded: {provenance}")
    # The shared no-thumbnail stub keeps accessibility independent of photos.
    # Fresh/cached/retry photo behavior has separate strict decoded-image checks.
    row = search_catalog_row(c, "ngc281", "NGC 281")
    c.expect_eq(row.get_attribute("role"), None,
                "catalog rows retain native table semantics")
    row.locator('.target-open').focus()
    c.page.keyboard.press("Enter")
    c.page.wait_for_selector("#graph[role='img'][aria-describedby='graphSummary']")
    c.page.locator("#modal .catalog-details > summary").click()
    c.page.wait_for_function("() => document.querySelector('#d-catalog-source')?.textContent.includes('Designation history')")
    c.expect("Catalog source" in c.page.inner_text("#modal")
             and "Designation history" in c.page.inner_text("#modal"),
             "the web detail must show catalog provenance")
    c.expect(c.page.inner_text("#graphSummary"),
             "the web altitude chart needs a non-empty screen-reader summary")
    c.expect_eq(c.page.locator("#modal .modal").get_attribute("role"), "complementary",
                "the wide target inspector must be exposed as a non-modal complementary panel")
    c.expect(c.page.locator("#modal .modal").get_attribute("aria-modal") is None,
             "the wide target inspector must not claim to be modal")
    from phase4_checks import actual_stops
    stops = actual_stops(c)
    c.page.locator('#' + stops[-1]).focus()
    c.expect_eq(c.page.evaluate('() => document.activeElement.id'), stops[-1],
                'the Tab check must start at its last reachable stop')
    c.page.keyboard.press("Tab")
    c.expect(not c.page.evaluate("() => document.querySelector('#modal .modal')?.contains(document.activeElement)"),
             "Tab must continue out of the wide, docked inspector")
    c.page.keyboard.press("Escape")
    c.expect(c.page.evaluate("() => document.activeElement?.matches('.cat tbody tr[data-id] .target-open')"),
             "closing the web detail dialog must restore focus to its catalog target button")

    c.page.set_viewport_size({"width": 900, "height": 900})
    c.page.wait_for_timeout(180)
    row.locator('.target-open').focus()
    c.page.keyboard.press("Enter")
    c.page.wait_for_selector("#modal:not([hidden]) .modal[role='dialog'][aria-modal='true']")
    from phase4_checks import actual_stops
    stops = actual_stops(c)
    c.page.locator('#' + stops[-1]).focus()
    c.expect_eq(c.page.evaluate('() => document.activeElement.id'), stops[-1],
                'the Tab check must start at its last reachable stop')
    c.page.keyboard.press("Tab")
    c.expect_eq(c.page.evaluate('() => document.activeElement.id'), stops[0],
                "Tab must wrap to the first reachable compact-modal control")
    c.page.keyboard.press("Escape")
    c.expect(c.page.evaluate("() => document.activeElement?.matches('.cat tbody tr[data-id] .target-open')"),
             "closing the compact inspector must restore focus to its source button")

    tab(c, "tonight")
    target_row = c.page.locator(READY).first
    target_row.locator('.target-open').focus()
    target_row_id = target_row.get_attribute("data-tonight-id")
    c.page.keyboard.press("Enter")
    c.page.wait_for_selector("#modal:not([hidden]) .modal")
    c.page.keyboard.press("Escape")
    c.expect(c.page.evaluate("(id) => document.activeElement?.matches(`#tonight-rank-table tbody tr[data-tonight-id=\"${id}\"] .target-open`)", target_row_id),
             "closing a Tonight detail must restore focus to its ranked target button")

    tab(c, "horizon")
    c.page.wait_for_selector("#hz-new-draw")
    c.page.click("#hz-new-draw")
    c.page.wait_for_selector("#hz-canvas[aria-describedby='hz-summary hz-keys']")
    c.expect(c.page.inner_text("#hz-summary"), "the web horizon editor needs a text alternative")
    # keyboard-only editing: add a point by numbers, then select and move it
    c.page.locator("#hz-points-panel summary").click()
    c.page.fill("#hz-add-az", "180")
    c.page.fill("#hz-add-alt", "12")
    c.page.click("#hz-add")
    c.page.locator("#hz-canvas").focus()
    c.page.keyboard.press("ArrowRight")
    c.expect("point 1 of 1" in c.page.inner_text("#ed-pos"), "arrow keys select points and say which")
    c.page.keyboard.press("ArrowUp")
    c.expect_eq(c.page.locator("#hz-sel-alt").input_value(), "12.5", "Up raises the selected point")
    c.page.keyboard.press("Delete")
    c.expect("nothing is blocked" in c.page.inner_text("#hz-summary"), "Delete removes the selected point")
    c.assert_clean()


@check("web-saved-targets-persist-and-prune", "web")
def web_saved_targets_persist_and_prune(c):
    """Saved catalog targets persist in local prefs and are pruned after the
    actual catalog is loaded; the saved-only filter uses those same IDs."""
    c.page.set_viewport_size({"width": 1366, "height": 900})
    boot(c)
    tab(c, "catalog")
    row = c.page.locator(".cat tbody tr[data-id='ngc224']").first
    row.wait_for(state="visible", timeout=30000)
    row.locator("[data-save-target]").click()
    c.page.wait_for_function(
        """() => document.querySelector('.cat tbody [data-save-target="ngc224"]')
             ?.classList.contains('on')""")
    stored = c.page.evaluate("""async () => {
      const Hor = await import('./horizon.js');
      return Hor.getPrefs().savedTargetIds;
    }""")
    c.expect(stored == ["ngc224"], f"the selected catalog ID was not saved: {stored!r}")

    c.page.locator("#cat-more summary").click()
    c.page.locator("#cat-saved").check()
    c.page.wait_for_function(
        "() => document.querySelectorAll('.cat tbody tr[data-id]').length === 1")
    c.expect_eq(c.page.locator(".cat tbody tr[data-id]").get_attribute("data-id"),
                "ngc224", "saved-only filtering must use the persisted catalog ID")

    c.page.evaluate("""async () => {
      const Hor = await import('./horizon.js');
      Hor.setPrefs({ savedTargetIds: ['ngc224', 'deleted-target'] });
    }""")
    c.page.reload(wait_until="domcontentloaded")
    boot(c)
    cleaned = c.page.evaluate("""async () => {
      const Hor = await import('./horizon.js');
      return Hor.getPrefs().savedTargetIds;
    }""")
    c.expect(cleaned == ["ngc224"],
             f"an ID absent from the loaded catalog should be pruned: {cleaned!r}")
    c.assert_clean()


@check("web-docked-inspector-fit-and-tonight-key", "web")
def web_docked_inspector_fit_and_tonight_key(c):
    """The docked target details use a vertical, scrollable rail at both wide
    planner widths and all supported themes; Tonight exposes the chart states
    and guides as a wrapping, theme-token-backed key."""
    boot(c)
    c.allow_console_errors("optional online target photos may be unavailable")
    c.allow_failed_responses("optional online target photos may be unavailable")
    # Use the same deterministic site and session as the visual matrix so M31
    # appears as a real Tonight pick rather than relying on the gate's August
    # clock and generic Berlin seed.
    c.page.evaluate("""async () => {
      const WS = await import('./webstore.js?v=41');
      const Hor = await import('./horizon.js?v=68');
      await WS.saveSiteRec({ id: 'browser-direction-b-black-forest',
        name: 'Black Forest', lat: 48, lon: 8.2, elev: 900, tz: 'Europe/Berlin' });
      Hor.setPrefs({ activeSiteId: 'browser-direction-b-black-forest',
        minAlt: 25, viewFullDay: false });
    }""")
    c.page.reload(wait_until="domcontentloaded")
    c.page.wait_for_selector(READY, timeout=60000)
    c.page.locator("#tb-date").fill("2026-09-26")
    c.page.locator("#tb-date").dispatch_event("change")
    tab(c, "sky")
    scrub_sky_to_wall(c, "2026-09-26T22:36")
    tab(c, "tonight")
    c.wait_tonight_render()

    def choose_theme(theme):
        c.expect_eq(theme, "workbench", "only Workbench is supported")
        c.expect_eq(c.page.locator("html").get_attribute("data-theme"), "workbench",
                    "the retired theme system must remain absent")

    def assert_dock_header_visible(context, *, check_tab_offset=False):
        state = c.page.evaluate("""() => {
          const title = document.querySelector('#m-title');
          const close = document.querySelector('#m-close');
          const visibleChrome = ['.topbar', '#tabs'].map((selector) => {
            const el = document.querySelector(selector);
            if (!el || !el.getClientRects().length) return null;
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
              ? r : null;
          }).filter(Boolean);
          const inspect = (el) => {
            if (!el) return { visible: false, clear: false, hit: false, rect: null };
            const r = el.getBoundingClientRect();
            const visible = r.width > 0 && r.height > 0 && r.left >= -1 &&
              r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
            const clear = visibleChrome.every((chrome) => {
              const x = Math.max(0, Math.min(r.right, chrome.right) - Math.max(r.left, chrome.left));
              const y = Math.max(0, Math.min(r.bottom, chrome.bottom) - Math.max(r.top, chrome.top));
              return x <= 1 || y <= 1;
            });
            const hit = visible && (() => {
              const target = document.elementFromPoint(r.left + r.width / 2,
                r.top + r.height / 2);
              return !!target && el.contains(target);
            })();
            return { visible, clear, hit, rect: { top: r.top, bottom: r.bottom,
              left: r.left, right: r.right } };
          };
          const tabs = document.querySelector('#tabs');
          const tabsRect = tabs?.getBoundingClientRect();
          const dockTop = parseFloat(getComputedStyle(document.documentElement)
            .getPropertyValue('--detail-top'));
          const expectedTop = Math.ceil(Math.max(0, ...visibleChrome.map((r) => r.bottom)));
          return { title: inspect(title), close: inspect(close), dockTop, expectedTop,
            tabsBottom: tabsRect?.bottom,
            tabOffsetMatches: Number.isFinite(dockTop) &&
              Math.abs(dockTop - expectedTop) <= 1 && Math.abs(dockTop - tabsRect.bottom) <= 1 };
        }""")
        for name in ("title", "close"):
            c.expect(state[name]["visible"] and state[name]["clear"] and state[name]["hit"],
                     f"{context}: docked detail {name} must be visible, unobscured by chrome, and hit-testable: {state}")
        if check_tab_offset:
            c.expect(state["tabOffsetMatches"],
                     f"{context}: dock top must track the visible tab bottom within 1px: {state}")

    def exercise_deep_tonight_detail(theme, width):
        c.page.evaluate("""() => {
          const target = document.querySelector("#tonight-rank-table tbody tr[data-tonight-id='ngc224']");
          if (!target) throw new Error('Tonight is missing the M31 target row');
          target.scrollIntoView({ block: 'center' });
        }""")
        c.page.wait_for_function("""() => {
          const tabs = document.querySelector('#tabs');
          return tabs && tabs.getBoundingClientRect().bottom <= 0;
        }""", timeout=10000)
        tabs_bottom = c.page.evaluate("() => document.querySelector('#tabs').getBoundingClientRect().bottom")
        c.expect(tabs_bottom <= 0,
                 f"{theme} {width}px: the Tonight M31 regression must begin with tabs above the viewport, got {tabs_bottom}")
        c.page.locator("#tonight-rank-table tbody tr[data-tonight-id='ngc224']:visible").first.click()
        c.page.wait_for_selector("#modal.detail-docked > .modal", state="visible")
        c.page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        assert_dock_header_visible(f"{theme} {width}px deep Tonight row")

        c.page.evaluate("window.scrollTo(0, 0)")
        c.page.wait_for_function("""() => {
          const chrome = ['.topbar', '#tabs'].map((selector) => {
            const el = document.querySelector(selector);
            if (!el || !el.getClientRects().length) return 0;
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight ? r.bottom : 0;
          });
          const expected = Math.ceil(Math.max(0, ...chrome));
          const actual = parseFloat(getComputedStyle(document.documentElement)
            .getPropertyValue('--detail-top'));
          return Number.isFinite(actual) && Math.abs(actual - expected) <= 1;
        }""", timeout=10000)
        c.page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        assert_dock_header_visible(f"{theme} {width}px after returning to page top",
                                  check_tab_offset=True)
        c.page.locator("#m-close").click()
        c.page.wait_for_function("() => document.querySelector('#modal')?.hidden")

    def assert_night_structure(theme, width):
        state = c.page.evaluate("""() => {
          const brief = document.querySelector('.night-brief');
          const plot = document.querySelector('#tonightOverviewChart');
          const scrub = document.querySelector('.tonight-local-scrub');
          const table = document.querySelector('#tonight-rank-table');
          const rect = el => el?.getBoundingClientRect();
          const b = rect(brief), p = rect(plot), t = rect(table);
          const region = table?.closest('.tablewrap');
          const clip = rect(region);
          const containedScroll = !!clip && clip.left >= -1 && clip.right <= innerWidth + 1 &&
            ['auto', 'scroll'].includes(getComputedStyle(region).overflowX) &&
            region.getAttribute('role') === 'region' && region.tabIndex === 0;
          const rows = [...(table?.querySelectorAll('tbody tr[data-tonight-id]') || [])];
          const fullRows = rows.filter(row => {
            const r = row.getBoundingClientRect();
            return r.width > 0 && r.height > 0 &&
              ((r.right <= innerWidth + 1 && r.left >= -1) ||
                (containedScroll && r.left < clip.right && r.right > clip.left));
          }).length;
          return { brief: !!b && b.width > 0, plotRemoved: !p,
            scrubRemoved: !scrub, table: !!t && t.width > 0,
            tableScroll: region?.scrollWidth - region?.clientWidth,
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
            overflows: [...document.querySelectorAll('body *')].map(el => {
              const r = el.getBoundingClientRect();
              return { id: el.id, cls: typeof el.className === 'string' ? el.className : '',
                tag: el.tagName, left: Math.round(r.left), right: Math.round(r.right),
                width: Math.round(r.width), scroll: el.scrollWidth, client: el.clientWidth };
            }).filter(x => x.right > innerWidth + 1 || x.left < -1 || x.scroll > x.client + 1)
              .sort((a,b) => (b.right-innerWidth) - (a.right-innerWidth)).slice(0,12),
            rows: rows.length, fullRows };
        }""")
        c.expect(state["brief"] and state["plotRemoved"] and state["scrubRemoved"] and
                 state["table"] and state["rows"] >= 3 and state["fullRows"] >= 3,
                 f"{theme} {width}px: Tonight brief and three ranked rows without the duplicate slider or overview must render: {state}")
        c.expect(state["tableScroll"] >= 0 and state["pageOverflow"] <= 1,
                 f"{theme} {width}px: Tonight ranking may scroll internally but must not widen the page: {state}")

    def assert_fit(context, *, docked, inline=False):
        state = c.page.evaluate("""() => {
        const outer = document.querySelector('#modal');
        const panel = outer.querySelector('.modal');
        const hero = panel.querySelector('.detail-hero');
        const image = panel.querySelector('#objimg-wrap');
        const chart = panel.querySelector('#graph');
        const title = panel.querySelector('#m-title');
        const close = panel.querySelector('#m-close');
        const visibility = panel.querySelector('#d-obs');
        const details = panel.querySelector('details.catalog-details');
        const collapsedByDefault = !details.open;
        details.open = true;
        const disclosure = details.querySelector('summary');
        const metaValue = details.querySelector('.meta dd');
        const legend = panel.querySelector('.chart-legend');
        const action = panel.querySelector('#m-save-target');
        const favorite = panel.querySelector('#m-session-fav');
        const panelRect = panel.getBoundingClientRect();
        const inline = outer.classList.contains('detail-inline');
        const scrollOwner = inline ? document.scrollingElement : outer.classList.contains('detail-docked') ? panel : outer;
        const dpr = window.devicePixelRatio || 1;
        const rects = [title, close, favorite, hero, image, visibility, chart,
          disclosure, metaValue, legend, action].map(el => el?.getBoundingClientRect());
        const horizontalBounds = rects.every(r => r && r.width > 0 &&
          r.left >= panelRect.left - 1 && r.right <= panelRect.right + 1 &&
          r.left >= -1 && r.right <= innerWidth + 1);
        const inPanelViewport = el => {
          const r = el.getBoundingClientRect();
          const currentPanel = panel.getBoundingClientRect();
          const top = Math.max(currentPanel.top, 0);
          const bottom = Math.min(currentPanel.bottom, innerHeight);
          return r.top >= top - 1 && r.bottom <= bottom + 1;
        };
        const isTopmost = el => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2,
            r.top + r.height / 2);
          return !!hit && el.contains(hit);
        };
        const reach = el => {
          if (inline) { el.scrollIntoView({block:'center'}); return inPanelViewport(el); }
          const r = el.getBoundingClientRect();
          const ownerRect = scrollOwner.getBoundingClientRect();
          if (r.top < ownerRect.top) scrollOwner.scrollTop += r.top - ownerRect.top;
          else if (r.bottom > ownerRect.bottom) scrollOwner.scrollTop += r.bottom - ownerRect.bottom;
          return inPanelViewport(el);
        };
        scrollOwner.scrollTop = 0;
        if (inline) title.scrollIntoView({block:'center'});
        const closeInitiallyVisible = inPanelViewport(close) && isTopmost(close);
        const dialogHeaderVisible = isTopmost(title);
        const reachability = Object.fromEntries([
          ['title', title], ['close', close], ['favorite', favorite], ['hero', hero],
          ['image', image], ['visibility', visibility], ['chart', chart],
          ['details', disclosure], ['metadata', metaValue], ['legend', legend], ['action', action],
        ].map(([name, el]) => [name, reach(el)]));
        const contentReachable = Object.values(reachability).every(Boolean);
        const imageHeight = image.getBoundingClientRect().height;
        scrollOwner.scrollTop = 0;
        return {
          docked: outer.classList.contains('detail-docked'), inline,
          role: panel.getAttribute('role'), modal: panel.getAttribute('aria-modal'),
          panelWidth: panel.clientWidth, panelOverflow: panel.scrollWidth - panel.clientWidth,
          contentWidth: panel.scrollWidth, contentOverflow: panel.scrollWidth - panel.clientWidth,
          heroWidth: hero.getBoundingClientRect().width,
          chartWidth: chart.getBoundingClientRect().width,
          heroBeforeChart: hero.getBoundingClientRect().top < chart.getBoundingClientRect().top,
          chartBeforeMetadata: chart.getBoundingClientRect().top < details.getBoundingClientRect().top,
          collapsedByDefault, imageHeight, horizontalBounds, closeInitiallyVisible,
          dialogHeaderVisible, contentReachable, reachability,
          canvasWidth: chart.width, expectedCanvasWidth: Math.round(chart.clientWidth * dpr),
          pageOverflow: document.documentElement.scrollWidth - innerWidth
          };
        }""")
        c.expect_eq(state["docked"], docked, f"{context}: inspector presentation changed unexpectedly")
        c.expect_eq(state["inline"], inline, f"{context}: inline presentation")
        if docked or inline:
            c.expect_eq(state["role"], "complementary",
                        f"{context}: docked detail must remain a complementary region")
            c.expect(state["modal"] is None,
                     f"{context}: docked detail must not claim aria-modal")
        else:
            c.expect_eq(state["role"], "dialog",
                        f"{context}: compact detail must remain a dialog")
            c.expect_eq(state["modal"], "true",
                        f"{context}: compact detail must keep modal semantics")
        c.expect(state["panelWidth"] > 0 and state["panelOverflow"] <= 1 and
                 state["contentOverflow"] <= 1 and state["pageOverflow"] <= 1,
                 f"{context}: detail must not create horizontal overflow: {state}")
        c.expect(state["heroBeforeChart"] and state["chartBeforeMetadata"] and
                 state["collapsedByDefault"] and state["heroWidth"] > 0 and
                 state["chartWidth"] > 0 and state["contentReachable"],
                 f"{context}: target facts, chart, and collapsed metadata must follow the required order and remain reachable: {state['reachability']}")
        c.expect(state["horizontalBounds"] and state["closeInitiallyVisible"] and
                 state["dialogHeaderVisible"],
                 f"{context}: detail content must stay inside its panel with a reachable title and close control: {state}")
        if docked:
            c.expect(state["imageHeight"] <= 150,
                     f"{context}: docked target image should stay compact: {state}")
        c.expect_eq(state["canvasWidth"], state["expectedCanvasWidth"],
                    f"{context}: detail graph must be drawn at its current width")

    def open_detail_in_view(view):
        if view == "tonight":
            target = c.page.locator("#tonight-rank-table tbody tr[data-tonight-id]:visible").first
            target.wait_for(state="visible", timeout=20000)
            target.click()
        elif view == "catalog":
            row = c.page.locator("table.cat tbody tr[data-id]").first
            row.wait_for(state="visible", timeout=20000)
            row.click()
        else:
            c.page.wait_for_selector("#sky[tabindex='0']", state="visible")
            # The selected target from the preceding view remains available
            # through the reopen action after the visible-now list is removed.
            target = c.page.locator('#sky-selected-detail')
            target.wait_for(state='visible', timeout=15000)
            target.click()
        try:
            c.page.wait_for_selector("#modal:not([hidden]) .modal", state="visible", timeout=20000)
        except Exception as exc:
            raise AssertionError(f"could not open target detail from the {view} view: {exc}") from exc

    for theme in ("workbench",):
        choose_theme(theme)
        for width, height in ((1672, 941), (1240, 900)):
            c.page.set_viewport_size({"width": width, "height": height})
            tab(c, "tonight")
            assert_night_structure(theme, width)
            exercise_deep_tonight_detail(theme, width)
            for view in ("tonight", "catalog", "sky"):
                tab(c, view)
                if view == "tonight":
                    assert_night_structure(theme, width)
                open_detail_in_view(view)
                presentation = 'detail-inline' if view == 'sky' else 'detail-docked'
                c.page.wait_for_selector(f"#modal.{presentation} > .modal", state="visible")
                assert_fit(f"{theme} {width}px {view}", docked=view != 'sky', inline=view == 'sky')
                if view == "catalog":
                    bounds = c.page.evaluate("""() => {
                      const rail = document.querySelector('.cat-filter-rail').getBoundingClientRect();
                      const search = document.querySelector('#cat-q').getBoundingClientRect();
                      const table = document.querySelector('.catwrap');
                      return { railLeft: rail.left, railRight: rail.right,
                        searchLeft: search.left, searchRight: search.right,
                        tableWidth: table.clientWidth, tableContentWidth: table.scrollWidth,
                        pageOverflow: document.documentElement.scrollWidth - innerWidth };
                    }""")
                    c.expect(bounds["searchLeft"] >= bounds["railLeft"] - 1 and
                             bounds["searchRight"] <= bounds["railRight"] + 1 and
                             bounds["tableContentWidth"] >= bounds["tableWidth"] and
                             bounds["pageOverflow"] <= 1,
                             f"{theme} {width}px: Catalog search must fit the rail and table must scroll independently: {bounds}")
                c.page.locator("#m-close").click()
                c.page.wait_for_function("() => document.querySelector('#modal')?.hidden")

        c.page.set_viewport_size({"width": 900, "height": 900})
        tab(c, "tonight")
        assert_night_structure(theme, 900)
        open_detail_in_view("tonight")
        c.page.wait_for_selector("#modal:not([hidden]) .modal[role='dialog'][aria-modal='true']",
                                 state="visible")
        assert_fit(f"{theme} 900px compact detail", docked=False)
        c.page.locator("#m-close").click()
        c.page.wait_for_function("() => document.querySelector('#modal')?.hidden")

    for width, height in ((640, 900), (360, 800)):
        c.page.set_viewport_size({"width": width, "height": height})
        tab(c, "tonight")
        c.wait_tonight_render()
        assert_night_structure("workbench", width)
    c.assert_clean()


@check("web-sky-canvas-container-resize", "web")
def web_sky_canvas_container_resize(c):
    """The Sky View's resize observer follows its chart container even when
    the browser viewport itself stays the same size."""
    c.page.set_viewport_size({"width": 1366, "height": 900})
    boot(c)
    tab(c, "sky")
    c.page.wait_for_selector("#sky[tabindex='0']")
    before = c.page.evaluate("""() => {
      const cv = document.querySelector('#sky');
      return { width: cv.clientWidth, backing: cv.width,
        dpr: window.devicePixelRatio || 1 };
    }""")
    c.page.evaluate("""() => {
      const box = document.querySelector('.sky-canvas-box');
      const cv = document.querySelector('#sky');
      box.style.setProperty('width', `${Math.max(160, cv.clientWidth - 100)}px`, 'important');
      box.style.setProperty('justify-self', 'start', 'important');
    }""")
    c.page.wait_for_function("""(old) => {
      const cv = document.querySelector('#sky');
      return cv.clientWidth < old &&
        cv.width === Math.round(cv.clientWidth * (window.devicePixelRatio || 1));
    }""", arg=before["width"], timeout=10000)
    after = c.page.evaluate("""() => ({
      width: document.querySelector('#sky').clientWidth,
      backing: document.querySelector('#sky').width,
      dpr: window.devicePixelRatio || 1 })""")
    c.expect(after["backing"] == round(after["width"] * after["dpr"]),
             f"the chart backing store must track its resized container: {after}")
    c.page.evaluate("""() => {
      const box = document.querySelector('.sky-canvas-box');
      box.style.removeProperty('width'); box.style.removeProperty('justify-self');
    }""")
    c.page.wait_for_timeout(200)
    c.assert_clean()


@check("web-sky-time-single-notification", "web")
def web_sky_time_single_notification(c):
    """A range change syncs every scrubber and repaints Tonight once.

    `clampSkyTime()` must announce even when the selected instant is already
    valid, because the range can still have changed. This check makes that
    notification count explicit while retaining the BUG-005 marker proof for
    the one repaint it schedules.
    """
    boot(c)
    first = c.wait_tonight_render()
    before = c.page.evaluate("() => window.__ns_scrub_range()")
    c.expect(not c.page.is_checked("#viewFullDay"),
             "fresh web storage must start with View full day disabled")
    c.page.evaluate(
        """() => {
            window.__ns_sky_time_events = 0;
            window.addEventListener('sky:time', () => {
              window.__ns_sky_time_events += 1;
            });
        }""")
    c.page.eval_on_selector(
        "#viewFullDay", """(el) => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }""")
    after = c.page.evaluate("() => window.__ns_scrub_range()")
    c.expect(after["start"] <= before["start"] and after["end"] >= before["end"],
             f"full-day range did not contain the former night range: {before} -> {after}")
    scrub = c.page.eval_on_selector(
        "#tb-scrub", """(el) => ({ min: Number(el.min), max: Number(el.max),
            value: Number(el.value) })""")
    expected_max = max(1, round((after["end"] - after["start"]) / 60000))
    c.expect_eq(scrub["min"], 0, "the topbar scrub did not reset its lower bound")
    c.expect_eq(scrub["max"], expected_max,
                "the topbar scrub did not adopt the full-day range")
    c.expect(0 <= scrub["value"] <= scrub["max"],
             f"the selected scrub value escaped its new range: {scrub}")
    want = c.page.evaluate("() => window.__ns_scrub_sel()")
    later = c.wait_tonight_after(first["gen"], sel=want)
    c.expect_eq(later["sel"], want,
                "the one full-day notification did not repaint Tonight for its selection")
    c.expect_eq(c.page.evaluate("() => window.__ns_sky_time_events"), 1,
                "a single full-day change emitted more than one sky:time notification")
    c.assert_clean()


@check("web-mag-slider-changes-sky", "web")
def web_mag_slider_changes_sky(c):
    boot(c)
    tab(c, "sky")
    c.page.wait_for_selector("#sky", state="visible", timeout=30000)
    c.page.locator(".sky-controls-tray summary").click()
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


@check("web-pref-change-keeps-horizon-history", "web")
def web_pref_change_keeps_horizon_history(c):
    """WE-05 (0.6.32 review), current form: a preference change while the
    editor is open re-renders it, and must keep the SAME undo history - a fresh
    history would silently drop the user's undo steps."""
    boot(c)
    open_editor(c)
    sketch(c)
    points = active_points(c)
    c.expect(points >= 2, "the sketch stored points")
    # trigger 1: the min-alt slider re-renders on 'change'
    c.page.evaluate("""() => { const s = document.querySelector('#tb-minalt');
        s.value = String(Number(s.value) + 3);
        s.dispatchEvent(new Event('change', { bubbles: true })); }""")
    c.page.wait_for_timeout(700)
    # trigger 2: a DATE change - a different refreshView path
    c.page.evaluate("""() => { const d = document.querySelector('#tb-date');
        const dt = new Date(d.value + 'T12:00:00Z');
        dt.setUTCDate(dt.getUTCDate() + 1);
        d.value = dt.toISOString().slice(0, 10);
        d.dispatchEvent(new Event('change', { bubbles: true })); }""")
    c.page.wait_for_timeout(800)
    c.expect(not c.page.is_disabled("#ed-undo"), "undo must survive a re-render (WE-05)")
    c.page.click("#ed-undo")
    c.page.wait_for_timeout(200)
    c.expect_eq(active_points(c), 0, "undo after a re-render still reaches the sketch")
    c.assert_clean()


@check("web-search-indexes-the-designation-blob", "web")
def web_search_indexes_the_designation_blob(c):
    """CD-02 (0.6.32 review): the web search must index the catalogue's own
    designation blob (`search`), not only ids/names/type/constellation.

    25 rows carry a common name ONLY in that column - `tarantula` (ngc2070),
    `coathanger` (cl399), `silver coin` (ngc253) - so they were findable on the
    desktop and invisible in the web search. The column now ships in the payload
    (`web/build_web.py::COLS`) and is indexed by `core/catalog.js::searchBlob`;
    before that change the web returned [] for these three terms."""
    boot(c)
    tab(c, "catalog")
    c.page.wait_for_selector("#cat-q", timeout=30000)
    for term, oid in (("tarantula", "ngc2070"),
                      ("coathanger", "cl399"),
                      ("silver coin", "ngc253")):
        c.page.fill("#cat-q", term)
        c.page.dispatch_event("#cat-q", "input")
        c.page.wait_for_timeout(400)
        found = c.page.eval_on_selector_all(
            "main table tbody tr[data-id]", "els => els.map((e) => e.dataset.id)")
        c.expect(oid in found,
                 f"searching {term!r} must find {oid} through the designation "
                 f"blob (got {found[:6]})")
    c.page.fill("#cat-q", "")
    c.page.dispatch_event("#cat-q", "input")
    c.assert_clean()


@check("web-tonight-pool-includes-unmagnituded-standard-rows", "web")
def web_tonight_pool_includes_unmagnituded_standard_rows(c):
    """The Tonight candidate pool is core/visibility.js::inTonightPool.

    Unknown-magnitude standard objects must qualify for the shared pool. The
    Direction B ranked table deliberately shows only its top 16 rows, so the
    UI portion scans the night and verifies at least one such row is rendered;
    the core predicate is checked directly for all four representative IDs."""
    boot(c)
    bounds = c.page.eval_on_selector(
        "#tb-scrub", "el => ({ lo: Number(el.min), hi: Number(el.max) })")
    total = bounds["hi"] - bounds["lo"]
    c.expect(total > 0, f"the scrub range is empty: {bounds}")
    step = 180 / max(1.0, total / 180)          # minutes per sample, >= 3 h
    ids = set()
    pos = bounds["lo"]
    for _ in range(30):
        gen = c.tonight_gen()
        # the instant the app will select for THIS slider value, computed by the
        # app itself (its snapping), so the wait can demand that exact paint
        want = c.page.evaluate("(v) => window.__ns_scrub_at(v)", round(pos))
        c.page.eval_on_selector(
            "#tb-scrub", """(el, v) => { el.value = String(v);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true })); }""",
            round(pos))
        # BUG-005: wait for the app to have PAINTED this selection. A fixed sleep
        # here raced the app's own 120 ms debounce (plus its deferred ranking) and
        # sampled stale/partial rows - 25/26 full-sequence failures while the
        # check passed in isolation.
        marker = c.wait_tonight_after(gen, sel=want)
        c.expect_eq(marker["sel"], want,
                    "the Tonight view painted a different instant than the "
                    "scrub position names")
        ids |= set(c.page.eval_on_selector_all(
            "#tonight-rank-table tbody tr[data-tonight-id]",
            "els => els.map((e) => e.dataset.tonightId)"))
        pos += step
        if pos > bounds["hi"]:
            break
    c.expect(ids, "the Tonight lists rendered nothing at all")
    eligible = c.page.evaluate("""async () => {
      const Core = await import('./core.js?v=44');
      const catalog = await (await fetch('catalog.json?v=10')).json();
      return ['ic1396', 'ngc1977', 'c14', 'pipe'].map(id => {
        const row = catalog.find(item => item.id === id);
        return { id, standard: !!row && !row._adv, magnitude: row?.vmag,
          included: !!row && Core.inTonightPool(row.vmag, !!row._adv, Core.ADV_TONIGHT_MAG_CAP) };
      });
    }""")
    c.expect(eligible and all(item["standard"] and item["magnitude"] is None and item["included"]
                              for item in eligible),
             f"unmagnituded standard targets must qualify for Tonight's shared pool: {eligible}")
    # The ranking cap may hide some eligible candidates at every sampled time.
    found = [oid for oid in ("ic1396", "ngc1977", "c14", "pipe") if oid in ids]
    c.expect(found,
             f"the rendered ranking should include an unmagnituded candidate somewhere in the night: {found}")
    c.assert_clean()


@check("web-catalog-advanced-minvis", "web")
def web_catalog_advanced_minvis(c):
    """ADVANCED mode + the Min-visibility gate: the whole 12k list has to warm
    through core's nightStatsBatch and then filter, while the nine-column table
    stays inside its results viewport at a narrow width."""
    c.goto("/")
    c.page.evaluate(
        """() => { const raw = JSON.parse(localStorage.getItem('nightseam_prefs_v1') || '{}');
             raw.advMode = true;
             localStorage.setItem('nightseam_prefs_v1', JSON.stringify(raw)); }""")
    boot(c)
    t0 = time.time()          # includes the click + first render, so this is an
    tab(c, "catalog")         # UPPER bound on the 12k warm (the honest number)
    head = c.page.inner_text("#view .cat-count:not(#pct-status)")
    c.expect(re.search(r"of 12,\d{3} objects", head),
             f"advanced mode must list the full catalogue: {head!r}")

    # Some Tonight summaries are already cached, so the exclusion count can
    # appear while Catalog is still warming. Require the completion state too.
    c.page.wait_for_function(
        """() => /below 1%/.test(document.querySelector('.cat-count')?.textContent || '') &&
          !document.querySelector('#pct-status')?.textContent &&
          document.querySelector('#busy')?.classList.contains('hidden')""",
        timeout=300000)
    warm = time.time() - t0
    print(f"        advanced-mode visibility warm: {warm:.1f}s")
    c.expect(warm < 90, f"the 12k warm took {warm:.1f}s - too slow to be the default")

    pcts = c.page.eval_on_selector_all(
        "#view table.cat td.pct",
        "els => els.map(e => parseInt(e.textContent, 10)).filter(v => Number.isFinite(v))")
    c.expect(pcts and min(pcts) >= 1,
             f"a never-visible row survived in advanced mode: {sorted(pcts)[:5]}")

    c.page.set_viewport_size({"width": 360, "height": 900})
    c.page.wait_for_timeout(400)
    box = c.page.evaluate(
        """() => { const t = document.querySelector('#view table.cat');
                   const card = t && t.closest('.card');
                   return { table: t ? t.scrollWidth : 0,
                            card: card ? card.clientWidth : 0,
                            doc: document.documentElement.scrollWidth,
                            win: window.innerWidth }; }""")
    print(f"        narrow viewport: table {box['table']}px in a {box['card']}px card, "
          f"page {box['doc']}px vs {box['win']}px")
    c.expect(box["doc"] <= box["win"] + 2,
             f"the catalog table widens the PAGE: {box['doc']}px vs {box['win']}px - "
             f"it must scroll inside its card instead")

    # ---- layout stability: progress/status must not move anything -----------
    c.page.set_viewport_size({"width": 1280, "height": 900})
    c.page.wait_for_timeout(300)

    def set_minvis(v):
        # 'input' updates the preference (the render reads it), 'change' re-renders
        c.page.eval_on_selector("#cat-minvis", """(el, val) => { el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true })); }""", v)

    def geometry():
        return c.page.evaluate(
            """() => { const t = document.querySelector('#view table.cat');
                 const ths = Array.from(t.querySelectorAll('thead th'))
                              .map(th => Math.round(th.getBoundingClientRect().width));
                 const s = document.querySelector('#pct-status');
                 return { cols: ths,
                          top: Math.round(t.getBoundingClientRect().top),
                          statusW: Math.round(s.getBoundingClientRect().width),
                          statsH: Math.round(s.parentElement.getBoundingClientRect().height) }; }""")

    base = geometry()
    c.expect(base["statusW"] >= 100,
             f"the status slot must be reserved before it has text: {base['statusW']}px")
    c.page.evaluate("""() => { document.querySelector('#pct-status').textContent =
        'computing visibility… 100%'; }""")
    c.page.wait_for_timeout(150)
    with_status = geometry()
    c.page.evaluate("() => { document.querySelector('#pct-status').textContent = ''; }")
    c.page.wait_for_timeout(150)
    cleared = geometry()
    for label, g in (("status shown", with_status), ("status cleared", cleared)):
        c.expect(g["top"] == base["top"],
                 f"{label}: the status line moved the table ({base['top']} -> {g['top']})")
        c.expect(g["cols"] == base["cols"],
                 f"{label}: the columns resized ({base['cols']} -> {g['cols']})")
        c.expect(g["statsH"] == base["statsH"],
                 f"{label}: the stats row changed height ({base['statsH']} -> {g['statsH']})")

    # moving a slider re-renders the whole view: the geometry must not change
    set_minvis(60)
    c.page.wait_for_timeout(300)
    after = geometry()
    c.expect(after["cols"] == base["cols"],
             f"re-rendering resized the columns ({base['cols']} -> {after['cols']})")
    c.expect(after["top"] == base["top"],
             f"re-rendering moved the table ({base['top']} -> {after['top']})")

    # ... and neither may the busy chip: the topbar wraps, so an empty slot is a
    # zero-height row and the whole app slides down when it fills
    c.page.evaluate(
        """() => { const b = document.querySelector('#busy');
             b.classList.remove('hidden');
             document.querySelector('#busy .busy-txt').textContent =
               'computing visibility… 100%'; }""")
    c.page.wait_for_timeout(200)
    busy = geometry()
    c.page.evaluate(
        """() => { const b = document.querySelector('#busy');
             b.classList.add('hidden');
             document.querySelector('#busy .busy-txt').textContent = ''; }""")
    c.page.wait_for_timeout(200)
    idle = geometry()
    c.expect(busy["top"] == base["top"] == idle["top"],
             f"the busy chip moved the table: {base['top']} -> {busy['top']} -> {idle['top']}")
    c.assert_clean()
@check("web-catalog-direction-b-density", "web")
def web_catalog_direction_b_density(c):
    """Keep the primary Catalog table aligned with the Direction B contract:
    50 dense rows, separate designation/common-name columns, selected-time and
    best-window headers, and no popularity/frame columns in the results table."""
    c.page.set_viewport_size({"width": 1672, "height": 941})
    boot(c)
    tab(c, "catalog")
    c.page.wait_for_selector(".cat-results table.cat tbody tr[data-id]")
    state = c.page.evaluate("""() => {
      const wrap = document.querySelector('.catwrap');
      const table = wrap?.querySelector('table.cat');
      const headers = [...(table?.querySelectorAll('thead th') || [])].map(el => el.textContent.trim());
      const rows = [...(table?.querySelectorAll('tbody tr[data-id]') || [])];
      const pager = document.querySelector('.cat-results .pager');
      const box = el => { const r = el?.getBoundingClientRect(); return r &&
        {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
      return {headers, rows: rows.length, firstRow: box(rows[0]), lastRow: box(rows.at(-1)),
        wrap: box(wrap), pager: box(pager), tableWidth: box(table)?.width,
        tableScrollWidth: table?.scrollWidth, wrapWidth: wrap?.clientWidth,
        pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        advancedOpen: document.querySelector('#cat-more')?.open};
    }""")
    expected = ["#", "Designation", "Common name", "Type", "Mag", "Alt now", "Night %", "Best window", "At " + c.page.inner_text('#tb-scrub-time').strip()]
    c.expect_eq(state["headers"], expected,
                f"Catalog must expose the compact Direction B column order: {state}")
    c.expect(state["rows"] == 50,
             f"Catalog must show a 50-row page when enough results exist: {state}")
    c.expect(state["pager"] and state["pager"]["height"] > 0 and state["pager"]["top"] < 941,
             f"the first-page pager must remain in the reference viewport: {state}")
    c.expect(state["tableWidth"] <= state["wrapWidth"] + 1 and state["tableScrollWidth"] <= state["wrapWidth"] + 1,
             f"the requested columns must fit without horizontal table scrolling: {state}")
    c.expect(state["pageWidth"] <= state["viewport"] + 1 and not state["advancedOpen"],
             f"the result page must stay in the viewport and advanced filters start collapsed: {state}")
    c.assert_clean()


@check("web-interval-view-agreement", "web")
def web_interval_view_agreement(c):
    from interval_checks import interval_view_agreement
    interval_view_agreement(c)


# Photo restore must use the shipped CSP and real IndexedDB commit semantics.
def horizon_module_url():
    return re.search(r"from '(\./horizon\.js\?v=\d+)'",
                     (ROOT / 'web/app.js').read_text(encoding='utf-8')).group(1)


HORIZON_PHOTO_FIXTURE = """async ({url, color}) => {
  const H = await import(url);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 4;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 4, 4);
  const image = canvas.toDataURL('image/png');
  const snapshot = {activeId:'restore-photo',horizons:[{
    id:'restore-photo',name:'Photo restore',points:[{az:90,alt:10}],
    photo:{width:360,heading:180,tilt:0,roll:0},hasPhoto:true,image
  }]};
  return {image,snapshot};
}"""


def restored_image(c, url):
    return c.page.evaluate("""async url => {
      const H=await import(url);const backup=await H.exportHorizonsWithPhotos();
      return {image:backup.horizons[0]?.image,hasPhoto:backup.horizons[0]?.hasPhoto};
    }""", url)


@check('web-horizon-photo-restore-durable', 'web')
def horizon_photo_restore_durable(c):
    boot(c)
    url = horizon_module_url()
    for color in ['#ff0000', '#0000ff']:
        fixture = c.page.evaluate(HORIZON_PHOTO_FIXTURE, {'url': url, 'color': color})
        committed = c.page.evaluate("""async ({url,snapshot}) =>
          (await import(url)).applyHorizonsSnapshot(snapshot)""",
          {'url': url, 'snapshot': fixture['snapshot']})
        c.expect(committed, 'photo restore must wait for successful persistence')
        c.expect_eq(restored_image(c, url)['image'], fixture['image'],
                    'incoming photo bytes must win over an older photo with the same ID')
        c.page.reload()
        c.page.wait_for_selector(READY)
        c.expect_eq(restored_image(c, url)['image'], fixture['image'],
                    'the restored photo must survive reload under the shipped CSP')
    c.assert_clean()


@check('web-horizon-photo-restore-transaction-abort', 'web')
def horizon_photo_restore_abort(c):
    boot(c)
    url = horizon_module_url()
    fixture = c.page.evaluate(HORIZON_PHOTO_FIXTURE, {'url': url, 'color': '#ff0000'})
    c.expect(c.page.evaluate("""async ({url,snapshot}) =>
      (await import(url)).applyHorizonsSnapshot(snapshot)""",
      {'url': url, 'snapshot': fixture['snapshot']}), 'initial photo must persist')
    incoming = c.page.evaluate(HORIZON_PHOTO_FIXTURE, {'url': url, 'color': '#0000ff'})
    result = c.page.evaluate("""async ({url,snapshot}) => {
      const H=await import(url),before=localStorage.getItem('nightseam_horizons_v2');
      const original=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(...args){
        const request=original.apply(this,args);
        if(this.name==='photos')request.addEventListener('success',()=>this.transaction.abort(),{once:true});
        return request;
      };
      let committed;
      try {committed=await H.applyHorizonsSnapshot(snapshot);}
      finally {IDBObjectStore.prototype.put=original;}
      return {committed,unchanged:before===localStorage.getItem('nightseam_horizons_v2'),
        memoryImage:(await H.exportHorizonsWithPhotos()).horizons[0]?.image};
    }""", {'url': url, 'snapshot': incoming['snapshot']})
    c.expect_eq(result['committed'], False, 'request success followed by abort must fail restore')
    c.expect(result['unchanged'], 'a photo transaction abort must restore the horizon records')
    c.expect_eq(result['memoryImage'], fixture['image'], 'an aborted restore must preserve live photos')
    failed_records = c.page.evaluate("""async ({url,snapshot}) => {
      const H=await import(url),before=localStorage.getItem('nightseam_horizons_v2');
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==='nightseam_horizons_v2')throw new DOMException('Injected quota failure','QuotaExceededError');
        return original.call(this,key,value);
      };
      let committed;
      try {committed=await H.applyHorizonsSnapshot(snapshot);}
      finally {Storage.prototype.setItem=original;}
      return {committed,unchanged:before===localStorage.getItem('nightseam_horizons_v2')};
    }""", {'url': url, 'snapshot': incoming['snapshot']})
    c.expect_eq(failed_records['committed'], False, 'a horizon record quota failure must abort restore')
    c.expect(failed_records['unchanged'], 'a failed record write must leave horizon records intact')
    c.page.reload()
    c.page.wait_for_selector(READY)
    c.expect_eq(restored_image(c, url)['image'], fixture['image'],
                'an aborted restore must preserve the original cached photograph')
    c.assert_clean()


@check('web-horizon-backup-unreadable-photo', 'web')
def horizon_backup_unreadable_photo(c):
    boot(c)
    url = horizon_module_url()
    fixture = c.page.evaluate(HORIZON_PHOTO_FIXTURE, {'url': url, 'color': '#ff0000'})
    c.expect(c.page.evaluate("""async ({url,snapshot}) =>
      (await import(url)).applyHorizonsSnapshot(snapshot)""",
      {'url': url, 'snapshot': fixture['snapshot']}), 'initial photo must persist')
    c.page.reload()
    c.page.wait_for_selector(READY)
    result = c.page.evaluate("""async url => {
      const H=await import(url),original=IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get=function(...args){
        const request=original.apply(this,args);
        if(this.name==='photos')request.addEventListener('success',()=>this.transaction.abort(),{once:true});
        return request;
      };
      let readRejected=false;
      try {await H.exportHorizonsWithPhotos();}catch {readRejected=true;}
      finally {IDBObjectStore.prototype.get=original;}
      await new Promise((resolve,reject)=>{
        const request=indexedDB.open('nightseam-horizon-photos',1);
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{const db=request.result,tx=db.transaction('photos','readwrite');
          tx.objectStore('photos').clear();tx.oncomplete=()=>{db.close();resolve();};
          tx.onabort=()=>{db.close();reject(tx.error);};};
      });
      let missingRejected=false;
      try {await H.exportHorizonsWithPhotos();}catch {missingRejected=true;}
      return {readRejected,missingRejected};
    }""", url)
    c.expect(result['readRejected'], 'backup must reject an aborted photo read after request success')
    c.expect(result['missingRejected'], 'backup must reject missing photo bytes instead of omitting them')
    c.assert_clean()


@check('web-preferences-replacement-persistence', 'web')
def preferences_replacement_persistence(c):
    boot(c)
    url = horizon_module_url()
    result = c.page.evaluate("""async url => {
      const H=await import(url);
      H.setPrefs({moonAware:true,fltOiii:true,savedTargetIds:['ngc224'],reviewOldKey:'old'});
      const replaced=H.replacePrefs({bortle:5});
      const replacement={...H.getPrefs()};
      H.setPrefs({moonAware:true});
      const before=JSON.stringify(H.getPrefs()),stored=localStorage.getItem('nightseam_prefs_v1');
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==='nightseam_prefs_v1')throw new DOMException('Injected quota failure','QuotaExceededError');
        return original.call(this,key,value);
      };
      let patchFailed,replaceFailed;
      try {patchFailed=H.setPrefs({bortle:8})===false;replaceFailed=H.replacePrefs({bortle:7})===false;}
      finally {Storage.prototype.setItem=original;}
      return {replaced,replacement,patchFailed,replaceFailed,
        unchanged:JSON.stringify(H.getPrefs())===before&&localStorage.getItem('nightseam_prefs_v1')===stored,
        patchPreservedBortle:H.getPrefs().bortle===5};
    }""", url)
    c.expect(result['replaced'], 'preference replacement must report persistence success')
    c.expect_eq(result['replacement']['moonAware'], False, 'absent flags must restore defaults')
    c.expect_eq(result['replacement']['fltOiii'], False, 'absent equipment flags must restore defaults')
    c.expect_eq(result['replacement']['savedTargetIds'], [], 'absent saved targets must not be inherited')
    c.expect('reviewOldKey' not in result['replacement'], 'replacement must remove absent old preference keys')
    c.expect(result['patchPreservedBortle'], 'ordinary UI patches must retain other preferences')
    c.expect(result['patchFailed'] and result['replaceFailed'] and result['unchanged'],
             'failed preference writes must report failure and preserve live/stored settings')
    c.assert_clean()


@check("web-horizon-editor-history-rollback", "web")
def horizon_editor_history_rollback(c):
    """A failed whole-app restore rolls the horizons back AND reattaches the
    editor's undo history, so the user's undo steps survive the failure."""
    boot(c)
    open_editor(c)
    sketch(c)
    sketched = active_points(c)
    url = horizon_module_url()
    result = c.page.evaluate("""async url => {
      const H=await import(url),checkpoint=H.captureEditorHistory();
      const safety=await H.exportHorizonsWithPhotos();
      if(!await H.applyHorizonsSnapshot({horizons:[],activeId:null}))throw new Error('forward snapshot failed');
      if(!await H.applyHorizonsSnapshot(H.normalizeHorizons(safety)))throw new Error('rollback snapshot failed');
      const restored=H.restoreEditorHistory(checkpoint);
      H.renderHorizon(document.querySelector('#view'),()=>{});
      return {restored,canUndo:!document.querySelector('#ed-undo').disabled};
    }""", url)
    c.expect(result['restored'] and result['canUndo'],
             'failed restore rollback must preserve the undo history')
    c.expect_eq(active_points(c), sketched, 'the rollback restores the sketched skyline')
    c.page.click('#ed-undo')
    c.page.wait_for_timeout(200)
    c.expect_eq(active_points(c), 0, 'Undo after rollback reaches the state before the sketch')
    c.page.click('#ed-redo')
    c.page.wait_for_timeout(200)
    c.expect_eq(active_points(c), sketched, 'Redo after rollback restores the sketch')
    c.assert_clean()
