"""Capture deterministic Direction B review screenshots from both shells.

Run from the repository root with:
    python -B ui-concepts/direction-b/implementation/capture_screenshots.py

The desktop server is the packed executable in a temporary profile. Its FITS
archive and panorama files stay inside that profile. The web capture uses a
fresh browser context and IndexedDB. No user profile is read or modified.
"""

from __future__ import annotations

import json
import binascii
import struct
import sys
import urllib.request
from datetime import date
from pathlib import Path
import zlib

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "screenshots"
sys.path.insert(0, str(ROOT / "tests" / "browser"))
sys.path.insert(0, str(ROOT / "tests"))

from _util import make_fits  # noqa: E402
from harness import DEFAULT_EXE, DesktopServer, StaticServer, WEB_DIR  # noqa: E402

SIZES = [("wide", 1672, 941), ("compact", 1240, 900), ("narrow", 900, 800)]
WEB_SIZES = SIZES + [("mobile", 640, 900), ("small", 360, 800)]
DESKTOP_VIEWS = ["tonight", "catalog", "sky-view", "horizon",
                 "import-exposures", "library", "sky-map"]
WEB_VIEWS = ["tonight", "catalog", "sky-view", "horizon"]
THEMES = ["workbench"]
LAYOUT_REPORT: dict[str, dict] = {}
RESPONSIVE_REPORT: list[dict] = []


def make_panorama_png() -> bytes:
    """Small synthetic ridge image used only as isolated editor capture data."""
    w, h = 1440, 480
    top, bottom = (22, 37, 49), (130, 103, 88)
    pixels = bytearray(w * h * 3)
    for y in range(h):
        t = y / (h - 1)
        color = tuple(round(a * (1 - t) + b * t) for a, b in zip(top, bottom))
        for x in range(w):
            i = (y * w + x) * 3
            pixels[i:i + 3] = bytes(color)

    def fill_polygon(points: list[tuple[int, int]], color: tuple[int, int, int]) -> None:
        for y in range(max(0, min(p[1] for p in points)), min(h, max(p[1] for p in points) + 1)):
            crosses = []
            for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
                if y1 == y2 or not (min(y1, y2) <= y < max(y1, y2)):
                    continue
                crosses.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
            crosses.sort()
            for left, right in zip(crosses[0::2], crosses[1::2]):
                start, stop = max(0, int(left)), min(w, int(right) + 1)
                for x in range(start, stop):
                    i = (y * w + x) * 3
                    pixels[i:i + 3] = bytes(color)

    fill_polygon([(0, 285), (140, 244), (280, 272), (420, 212),
                  (570, 254), (720, 199), (875, 244), (1030, 213),
                  (1190, 252), (1320, 218), (1440, 245), (1440, 480),
                  (0, 480)], (40, 55, 50))
    fill_polygon([(0, 340), (180, 308), (320, 352), (510, 296),
                  (710, 340), (900, 294), (1100, 330), (1280, 285),
                  (1440, 326), (1440, 480), (0, 480)], (22, 35, 33))
    for x in range(25, w, 92):
        base = 350 + ((x * 17) % 42)
        fill_polygon([(x - 28, base), (x, base - 98 - (x % 27)),
                      (x + 30, base)], (17, 29, 28))
        fill_polygon([(x - 3, base - 4), (x + 3, base - 4),
                      (x + 3, h), (x - 3, h)], (16, 27, 25))

    def chunk(tag: bytes, content: bytes) -> bytes:
        body = tag + content
        return struct.pack(">I", len(content)) + body + struct.pack(">I", binascii.crc32(body) & 0xffffffff)

    scanlines = b"".join(b"\0" + pixels[y * w * 3:(y + 1) * w * 3] for y in range(h))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(scanlines, 6))
            + chunk(b"IEND", b""))


def fits_bytes(date_obs: str, exposure: float, filt: str, *,
               object_name: str = "M 31", imagetyp: str = "LIGHT",
               ra: str = "0.712", dec: str = "41.269") -> bytes:
    return make_fits([
        ("SIMPLE", "T"), ("OBJECT", f"'{object_name}'"),
        ("EXPTIME", str(exposure)), ("DATE-OBS", f"'{date_obs}'"),
        ("IMAGETYP", f"'{imagetyp}'"), ("FILTER", f"'{filt}'"),
        ("TELESCOP", "'Capture fixture'"), ("NAXIS", "2"),
        ("RA", ra), ("DEC", dec),
    ])


def post_multipart(url: str, fields: dict[str, str], files: list[tuple[str, bytes]]) -> dict:
    boundary = "----NightSeamDirectionBCaptureBoundary"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode(), b"\r\n",
        ])
    for filename, content in files:
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            (f'Content-Disposition: form-data; name="files"; '
             f'filename="{filename}"\r\n').encode(),
            b"Content-Type: application/octet-stream\r\n\r\n",
            content, b"\r\n",
        ])
    chunks.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        url, data=b"".join(chunks), method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def set_desktop_theme(page, theme: str) -> None:
    page.wait_for_function("(v) => document.documentElement.dataset.theme === v",
                           arg="workbench")


def set_web_theme(page, theme: str) -> None:
    page.wait_for_function("(v) => document.documentElement.dataset.theme === v",
                           arg="workbench")


def wait_desktop_night(page) -> None:
    page.wait_for_function(
        """() => { const b = document.querySelector('#busy');
             return !b || b.classList.contains('hidden'); }""", timeout=90000)
    page.wait_for_function(
        """() => document.querySelector('#timeLabel')?.textContent.trim()
             && document.querySelector('#targetRows tr[data-id]')""", timeout=90000)


def set_desktop_datetime(page) -> None:
    page.locator("#dateInput").fill("2026-09-26")
    page.locator("#dateInput").dispatch_event("change")
    wait_desktop_night(page)
    page.locator("#timeSlider").evaluate(
        """(el) => { el.value = '106'; el.dispatchEvent(new Event('input', {bubbles:true})); }""")
    page.wait_for_function(
        """() => /(?:22:36|10:36 ?PM)/.test(document.querySelector('#timeLabel')?.textContent || '')""",
        timeout=15000)


def open_desktop_m31(page) -> None:
    page.click("#tabs [data-tab='targets']")
    row = page.locator("#targetRows tr[data-id='ngc224']")
    if row.count() == 0:
        page.locator("#fSearch").fill("NGC 224")
        row.wait_for(state="visible", timeout=15000)
        page.locator("#fSearch").fill("")
        row.wait_for(state="visible", timeout=15000)
    row.focus()
    page.keyboard.press("Enter")
    page.wait_for_selector("#detailModal:not(.hidden)", timeout=15000)


def make_desktop_pano(page, png: bytes) -> None:
    page.click("#tabs [data-tab='horizon']")
    page.locator("#panoFile").set_input_files({
        "name": "Black-Forest-West-Ridge.png", "mimeType": "image/png",
        "buffer": png,
    })
    page.wait_for_function(
        """() => window.Pano?.cur && window.Pano?.img?.complete
             && window.Pano.img.naturalWidth > 0""", timeout=30000)
    page.locator("#toolBrush").click()
    box = page.locator("#panoCanvas").bounding_box()
    if box and box["width"] > 100:
        y0 = box["y"] + box["height"] * 0.58
        page.mouse.move(box["x"] + box["width"] * 0.08, y0)
        page.mouse.down()
        for i in range(1, 16):
            x = box["x"] + box["width"] * (0.08 + 0.84 * i / 15)
            y = y0 - box["height"] * (0.04 if i % 3 else 0.0)
            page.mouse.move(x, y)
        page.mouse.up()
    page.locator("#btnSaveProfile").click()
    page.wait_for_function(
        """() => document.querySelector('#panoSaveStatus')?.textContent
             .toLowerCase().includes('saved')""", timeout=15000)


def desktop_select_view(page, view: str) -> None:
    if view in ("tonight", "catalog", "sky-view", "horizon"):
        key = {"catalog": "targets", "sky-view": "sky"}.get(view, view)
        page.click(f"#tabs [data-tab='{key}']")
        page.wait_for_selector(f"#tab-{key}.active:not([hidden])", timeout=15000)
    else:
        page.click("#tabs [data-tab='image-catalog']")
        page.wait_for_selector("#tab-image-catalog.active:not([hidden])", timeout=15000)
        key = {"import-exposures": "import", "sky-map": "skymap"}.get(view, view)
        page.click(f"#catalogTabs [data-tab='{key}']")
        page.wait_for_selector(f"#tab-{key}.active:not([hidden])", timeout=15000)
    if view == "library":
        page.wait_for_selector("#libraryObjectList .library-object", timeout=30000)
    elif view == "sky-map":
        page.wait_for_selector("#skymapCanvas", timeout=15000)


def capture_desktop(browser, png: bytes) -> int:
    server = DesktopServer(DEFAULT_EXE, seed=True)
    base = server.start()
    try:
        original = server.api("api/state")
        site = server.api("api/sites", "POST", {
            "name": "Black Forest", "lat": 48.0, "lon": 8.2, "elev": 900,
        })
        server.api("api/settings", "POST", {
            "active_site_id": site["id"], "timezone": "Europe/Berlin",
            "min_useful_alt": 25, "bortle": 4, "edge_space": 16,
            "view_full_day": False, "theme": "workbench",
            "wizard_done": True,
            "image_dir": str(server.tmp / "capture-images"),
        })
        for old in original.get("sites", []):
            if old.get("id") != site["id"]:
                server.api(f"api/sites/{old['id']}", "DELETE")
        sessions = [
            ("2026-09-24", [
                ("M31-L-300.fit", fits_bytes("2026-09-24T21:10:00", 300, "L")),
                ("M31-L-300b.fit", fits_bytes("2026-09-24T21:28:00", 300, "L")),
                ("M31-D-300.fit", fits_bytes("2026-09-24T22:00:00", 300, "", imagetyp="DARK")),
                ("M31-F-5.fit", fits_bytes("2026-09-24T20:50:00", 5, "L", imagetyp="FLAT")),
                ("M31-B-1.fit", fits_bytes("2026-09-24T20:55:00", 1, "", imagetyp="BIAS")),
            ]),
            ("2026-09-25", [
                ("M31-L-600.fit", fits_bytes("2026-09-25T21:20:00", 600, "L")),
                ("M31-D-600.fit", fits_bytes("2026-09-25T22:10:00", 600, "", imagetyp="DARK")),
                ("M31-F-5b.fit", fits_bytes("2026-09-25T20:50:00", 5, "L", imagetyp="FLAT")),
                ("M31-B-1b.fit", fits_bytes("2026-09-25T20:55:00", 1, "", imagetyp="BIAS")),
            ]),
            ("2026-09-26", [
                ("M31-R-600.fit", fits_bytes("2026-09-26T21:10:00", 600, "R")),
                ("M31-R-600b.fit", fits_bytes("2026-09-26T21:30:00", 600, "R")),
                ("M31-D-600b.fit", fits_bytes("2026-09-26T22:00:00", 600, "", imagetyp="DARK")),
                ("M31-F-8.fit", fits_bytes("2026-09-26T20:50:00", 8, "R", imagetyp="FLAT")),
                ("M31-B-1c.fit", fits_bytes("2026-09-26T20:55:00", 1, "", imagetyp="BIAS")),
            ]),
        ]
        for _date, frames in sessions:
            result = post_multipart(base + "api/images/ingest", {}, frames)
            if not all(item.get("ok") for item in result.get("results", [])):
                raise RuntimeError(f"synthetic M31 FITS import did not complete for {_date}")
        extras = [
            ("M42-L-180.fit", fits_bytes("2026-09-26T22:20:00", 180, "L",
                object_name="M 42", ra="5.588", dec="-5.391")),
            ("M13-L-240.fit", fits_bytes("2026-09-26T22:40:00", 240, "L",
                object_name="M 13", ra="16.695", dec="36.461")),
        ]
        result = post_multipart(base + "api/images/ingest", {}, extras)
        if not all(item.get("ok") for item in result.get("results", [])):
            raise RuntimeError("synthetic M42/M13 FITS import did not complete")
        library = server.api("api/library")
        objects = library.get("objects", [])
        m31 = next((obj for obj in objects if obj.get("object_id") == "ngc224"), None)
        if len(objects) < 3 or not m31 or len(m31.get("sessions", [])) != 3:
            raise RuntimeError("capture fixture must contain three catalog objects and three M31 sessions")
        m31_name = str(m31.get("name") or "NGC 224")
        frame_types = {str(key).lower() for session in m31["sessions"]
                       for key in session.get("types", {})}
        if not {"light", "dark", "flat", "bias"}.issubset(frame_types):
            raise RuntimeError(f"capture fixture has incomplete M31 frame types: {sorted(frame_types)}")

        context = browser.new_context(
            timezone_id="Europe/Berlin", locale="en-US",
            viewport={"width": 1672, "height": 941}, color_scheme="dark",
            device_scale_factor=1, reduced_motion="reduce")
        page = context.new_page()
        page.clock.install(time="2026-09-26T20:36:00Z")
        page.clock.resume()
        page.goto(base, wait_until="domcontentloaded")
        page.wait_for_selector("#targetRows tr[data-id]", state="attached", timeout=90000)
        wait_desktop_night(page)
        set_desktop_datetime(page)
        open_desktop_m31(page)
        make_desktop_pano(page, png)

        count = 0
        for theme in THEMES:
            set_desktop_theme(page, theme)
            for size_name, width, height in SIZES:
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(250)
                page.evaluate("document.querySelector('#dClose')?.click()")
                if width > 900:
                    open_desktop_m31(page)
                for view in DESKTOP_VIEWS:
                    desktop_select_view(page, view)
                    if view == "sky-view":
                        page.evaluate("document.querySelector('#dClose')?.click()")
                        page.wait_for_function(
                            """() => !!document.querySelector(
                              '#skyVisibleNow [data-sky-target="ngc224"]')""",
                            timeout=15000)
                        page.evaluate("document.querySelector('#skyVisibleNow [data-sky-target=\"ngc224\"]')?.click()")
                    if view == "library":
                        m31_item = page.locator("#libraryObjectList .library-object").filter(
                            has_text=m31_name)
                        if not m31_item.count():
                            raise RuntimeError(f"library screenshot fixture did not expose {m31_name!r}: "
                                               f"{page.locator('#libraryObjectList').inner_text()}")
                        m31_item.first.click()
                        page.wait_for_function(
                            "() => document.querySelectorAll('#librarySessions tr.library-session').length === 3",
                            timeout=15000)
                        page.wait_for_function("""() =>
                          document.querySelectorAll('#libSummary .library-metric').length === 7 &&
                          document.querySelectorAll('#librarySessionActions [data-library-add]').length === 3 &&
                          document.querySelector('#librarySessionActions [data-open-library-folder]')""",
                          timeout=15000)
                        page.evaluate("document.querySelector('#dClose')?.click()")
                    if width <= 900 and view == "catalog":
                        open_desktop_m31(page)
                    page.evaluate("""() => {
                      window.scrollTo(0, 0);
                      document.querySelectorAll('*').forEach((el) => {
                        if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = 0;
                      });
                    }""")
                    overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                    RESPONSIVE_REPORT.append({"shell": "desktop", "view": view,
                        "size": size_name, "width": width, "horizontalOverflow": overflow})
                    if width == 1672 and view in ("tonight", "catalog", "sky-view", "horizon", "library"):
                        LAYOUT_REPORT[f"desktop-{view}"] = measure_layout(page, "desktop", view)
                    page.wait_for_timeout(180)
                    name = f"desktop-{view}-{theme}-{size_name}-{width}x{height}.png"
                    page.screenshot(path=str(OUT / name), animations="disabled")
                    count += 1
                    if width <= 900 and view == "catalog":
                        page.evaluate("document.querySelector('#dClose')?.click()")
            print(f"desktop screenshots captured for {theme}", flush=True)
        context.close()
        return count
    finally:
        server.stop()


def set_web_datetime(page) -> None:
    page.locator("#tb-date").fill("2026-09-26")
    page.locator("#tb-date").dispatch_event("change")
    page.click("#tabs a[data-v='sky']")
    page.wait_for_selector("#sky-time", timeout=20000)
    page.locator("#sky-time").fill("2026-09-26T22:36")
    page.locator("#sky-time").dispatch_event("input")
    page.wait_for_function(
        """() => document.querySelector('#sky-time')?.value === '2026-09-26T22:36'""",
        timeout=15000)


def open_web_detail(page, view: str) -> None:
    if view == "tonight":
        row = page.locator("#tonight-rank-table tbody tr[data-tonight-id='ngc224']")
        if not row.count():
            # The Tonight rank is a live, bounded list. Use its top current
            # target instead of opening M31 elsewhere and routing back, which
            # intentionally closes the inspector on a real tab change.
            row = page.locator("#tonight-rank-table tbody tr[data-tonight-id]").first
        row.first.click(timeout=20000)
    elif view == "catalog":
        row = page.locator("table.cat tbody tr[data-id='ngc224']").first
        if row.count() == 0:
            page.locator("#cat-q").fill("NGC 224")
            row.wait_for(state="visible", timeout=15000)
            page.locator("#cat-q").fill("")
            row.wait_for(state="visible", timeout=15000)
        row.click()
    # At wide widths this is a docked inspector (`role=dialog` without
    # `aria-modal`); at narrow widths it becomes a modal dialog. Wait for the
    # shared visible panel instead of requiring modal-only semantics.
    page.wait_for_selector("#modal:not([hidden]) .modal", state="visible", timeout=15000)


def measure_layout(page, shell: str, view: str) -> dict:
    """Record first-viewport regions and row density for the fidelity report."""
    regions = {
        "desktop": {
            "tonight": {"brief": "#nightBrief", "plot": "#tonightAltitudeOverview",
                        "scrub": "#tonightTimeSlider", "ranked": "#tonightRankTable",
                        "inspector": "#detailModal:not(.hidden) .detail-hero",
                        "inspector_chart": "#detailModal:not(.hidden) #altChart",
                        "inspector_visibility": "#detailModal:not(.hidden) #dVisibilitySummary"},
            "catalog": {"filter_rail": ".catalog-filter-rail", "table": "#targetTable",
                        "pager": "#targetPager:not(.hidden)",
                        "inspector_image": "#detailModal:not(.hidden) #dImage",
                        "inspector_chart": "#detailModal:not(.hidden) #altChart",
                        "inspector_visibility": "#detailModal:not(.hidden) #dVisibilitySummary"},
            "sky-view": {"disc": "#skyCanvas", "time_rail": ".sky-local-scrub",
                          "summary": "#skySelectedTarget", "chart": "#skySelectedAltitude",
                          "visible_list": "#skyVisibleNow"},
            "horizon": {"photo_stage": "#panoStage", "profile": ".pano-profile-panel",
                        "profile_canvas": "#panoProfileCanvas", "summary": "#panoProfileBinSummary",
                        "settings_rail": "#panoSettings"},
            "library": {"object_rail": "#libraryObjectList", "hero_totals": ".library-hero",
                        "sessions": "#librarySessions", "session_rollup": "#librarySessionDetail",
                        "session_actions": "#librarySessionActions", "import_area": ".library-import-dock"},
        },
        "web": {
            "tonight": {"brief": ".night-brief", "plot": "#tonightOverviewChart",
                        "scrub": "#tonight-time-scrub", "ranked": "#tonight-rank-table",
                        "inspector": "#modal.detail-docked .detail-hero",
                        "inspector_chart": "#modal.detail-docked #graph",
                        "inspector_visibility": "#modal.detail-docked #d-obs"},
            "catalog": {"filter_rail": ".cat-filter-rail", "table": ".cat-results table",
            "pager": ".cat-results .pager",
                        "inspector_image": "#modal.detail-docked #objimg-wrap",
                        "inspector_chart": "#modal.detail-docked #graph",
                        "inspector_visibility": "#modal.detail-docked #d-obs"},
            "sky-view": {"disc": "#sky", "time_rail": ".sky-time-rail",
                          "summary": "#sky-selected-target", "chart": "#sky-selected-altitude",
                          "visible_list": "#sky-visible-now"},
            "horizon": {"photo_stage": "#pano-canvas", "profile": ".horizon-profile-panel",
                        "profile_canvas": "#pano-profile", "summary": ".horizon-profile-metrics",
                        "selected_bin": ".horizon-selected-bin",
                        "settings_rail": ".horizon-settings-rail"},
        },
    }
    region_selectors = regions[shell][view]
    row_selector = {
        ("desktop", "tonight"): "#tonightRows tr",
        ("web", "tonight"): "#tonight-rank-table tbody tr",
        ("desktop", "catalog"): "#targetRows tr",
        ("web", "catalog"): ".cat-results .cat tbody tr",
        ("desktop", "sky-view"): "#skyVisibleNow .sky-visible-target",
        ("web", "sky-view"): "#sky-visible-now .sky-visible-target",
        ("desktop", "horizon"): "",
        ("web", "horizon"): "",
        ("desktop", "library"): "#librarySessions tr.library-session",
    }.get((shell, view), "")
    return page.evaluate("""({regions, rowSelector}) => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const n = (v) => Math.round(v * 10) / 10;
        const rendered = !!el.getClientRects().length && !el.closest('[hidden], .hidden');
        return {x:n(r.x), y:n(r.y), width:n(r.width), height:n(r.height),
          top:n(r.top), right:n(r.right), bottom:n(r.bottom), rendered,
          intersectsViewport: rendered && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight,
          fullyInViewport: rendered && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1};
      };
      const measured = Object.fromEntries(Object.entries(regions).map(([name, selector]) =>
        [name, rect(document.querySelector(selector))]));
      const rows = rowSelector ? [...document.querySelectorAll(rowSelector)] : [];
      const rowsFullyVisible = rows.filter((el) => {
        const r = el.getBoundingClientRect();
        return !!el.getClientRects().length && !el.closest('[hidden], .hidden') &&
          r.top >= 0 && r.bottom <= innerHeight && r.right > 0 && r.left < innerWidth;
      }).length;
      const visibleList = regions.visible_list
        ? (document.querySelector(regions.visible_list)?.innerText || '').trim() : '';
      return {viewport:{width:innerWidth,height:innerHeight}, documentWidth:document.documentElement.scrollWidth,
        horizontalOverflow:document.documentElement.scrollWidth > innerWidth + 1,
        regions:measured, rows:{selector:rowSelector || null, total:rows.length, fullyVisible:rowsFullyVisible},
        visibleListText:visibleList};
    }""", {"regions": region_selectors, "rowSelector": row_selector})


def acceptance_markdown(layouts: dict[str, dict]) -> str:
    """Build the required reference/capture/bounds/result summary from CSS pixels."""
    screens = [
        ("Tonight", "../../tonight.png", "tonight",
         ("brief", "plot", "scrub", "ranked", "inspector", "inspector_chart", "inspector_visibility"), 3),
        ("Catalog", "../../catalog.png", "catalog",
         ("filter_rail", "table", "pager", "inspector_image", "inspector_chart", "inspector_visibility"), 20),
        ("Sky View", "../../sky-view.png", "sky-view",
         ("disc", "time_rail", "summary", "chart", "visible_list"), 3),
        ("Horizon", "../../horizon.png", "horizon",
         ("photo_stage", "profile", "summary", "settings_rail"), 0),
        ("Library", "../../image-catalog.png", "library",
         ("object_rail", "hero_totals", "sessions", "session_rollup", "session_actions", "import_area"), 3),
    ]

    def box_text(box: dict | None) -> str:
        if not box:
            return "missing"
        state = "in view" if box.get("fullyInViewport") else "partial/offscreen"
        return (f"{box['x']:.0f},{box['y']:.0f} {box['width']:.0f}×{box['height']:.0f} px "
                f"({state})")

    rows = ["| Screen | Reference → new capture | Measured region bounds and result |",
            "|---|---|---|"]
    for label, ref, slug, required, row_target in screens:
        shell_views = ([f"desktop-{slug}", f"web-{slug}"] if slug != "library" else ["desktop-library"])
        captures = []
        gaps = []
        metrics_text = []
        for key in shell_views:
            data = layouts.get(key, {})
            shell = key.split("-", 1)[0]
            capture = f"{shell}-{slug}-workbench-wide-1672x941.png"
            captures.append(f"[{shell}]({capture})")
            regions = data.get("regions", {})
            present = []
            for region in required:
                box = regions.get(region)
                metrics_text.append(f"{shell} {region}: {box_text(box)}")
                if not box or not box.get("rendered") or not box.get("intersectsViewport"):
                    gaps.append(f"{shell} {region} missing or below viewport")
                else:
                    present.append(region)
            row_info = data.get("rows", {})
            if row_target:
                min_rows = min(row_target, row_info.get("total", 0))
                if row_info.get("fullyVisible", 0) < min_rows:
                    gaps.append(f"{shell} only {row_info.get('fullyVisible', 0)} of {min_rows} requested rows fit")
                metrics_text.append(f"{shell} rows: {row_info.get('fullyVisible', 0)} fully visible of {row_info.get('total', 0)}")
            if slug == "sky-view" and row_info.get("total", 0) == 0 and not data.get("visibleListText"):
                gaps.append(f"{shell} visible-now panel has no rows or explicit empty state")
            if slug == "sky-view":
                disc = regions.get("disc")
                if disc and disc.get("width", 0) < 630:
                    gaps.append(f"{shell} polar disc is {disc['width']:.0f}px wide (requires 630px)")
            if slug == "horizon":
                profile = regions.get("profile")
                if profile and profile.get("height", 0) < 190:
                    gaps.append(f"{shell} profile region is {profile['height']:.0f}px high (requires 190px)")
            if data.get("horizontalOverflow"):
                gaps.append(f"{shell} has horizontal page overflow")
        status = "PASS" if not gaps else "GAPS: " + "; ".join(gaps)
        capture_link = " · ".join(captures)
        details = "<br>".join(metrics_text)
        rows.append(f"| {label} | [{label} reference]({ref}) → {capture_link} | {status}<br>{details} |")
    return "\n".join(rows)


def reset_web_capture_scroll(page, *, check_tonight_chart: bool = False) -> None:
    """Put the page and every app-owned scroll region at its top before capture.

    Opening a detail panel can move focus or the primary view's scroller. Reset
    after the panel opens so the wide Tonight captures include the overview.
    """
    page.evaluate("""() => {
      window.scrollTo(0, 0);
      document.querySelectorAll('*').forEach((el) => {
        if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = 0;
      });
      const detail = document.querySelector('#modal.detail-docked > .modal');
      if (detail) detail.scrollTop = 0;
    }""")
    dock_open = page.evaluate("""() => !!document.querySelector('#modal.detail-docked > .modal')""")
    if dock_open:
        page.wait_for_function("""() => {
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
        page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        header = page.evaluate("""() => {
          const title = document.querySelector('#m-title');
          const close = document.querySelector('#m-close');
          const chrome = ['.topbar', '#tabs'].map((selector) => {
            const el = document.querySelector(selector);
            if (!el || !el.getClientRects().length) return null;
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
              ? r : null;
          }).filter(Boolean);
          const check = (el) => {
            if (!el) return { visible: false, clear: false, hit: false };
            const r = el.getBoundingClientRect();
            const visible = r.width > 0 && r.height > 0 && r.left >= -1 &&
              r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
            const clear = chrome.every((obstruction) => {
              const x = Math.max(0, Math.min(r.right, obstruction.right) - Math.max(r.left, obstruction.left));
              const y = Math.max(0, Math.min(r.bottom, obstruction.bottom) - Math.max(r.top, obstruction.top));
              return x <= 1 || y <= 1;
            });
            const target = visible && document.elementFromPoint(r.left + r.width / 2,
              r.top + r.height / 2);
            return { visible, clear, hit: !!target && el.contains(target),
              top: r.top, bottom: r.bottom };
          };
          return { title: check(title), close: check(close) };
        }""")
        for control in ("title", "close"):
            result = header[control]
            if not (result["visible"] and result["clear"] and result["hit"]):
                raise RuntimeError(f"wide web detail capture has a hidden or obscured {control}: {header}")
    if check_tonight_chart:
        visible = page.evaluate("""() => {
          const title = document.querySelector('#tonightOverviewTitle');
          const chart = document.querySelector('#tonightOverviewChart');
          const inside = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
          };
          return { title: inside(title), chart: inside(chart),
            titleTop: title?.getBoundingClientRect().top,
            chartTop: chart?.getBoundingClientRect().top };
        }""")
        if not visible["title"] or not visible["chart"]:
            raise RuntimeError(f"wide Tonight capture lost its overview after detail open: {visible}")


def make_web_pano(page, png: bytes) -> None:
    page.click("#tabs a[data-v='horizon']")
    page.wait_for_selector("#pano-name", timeout=15000)
    page.locator("#pano-name").fill("Black Forest West Ridge")
    page.locator("#pano-file").set_input_files({
        "name": "Black-Forest-West-Ridge.png", "mimeType": "image/png",
        "buffer": png,
    })
    page.wait_for_selector("#pano-canvas", state="visible", timeout=30000)
    page.wait_for_selector("#ed-save", state="visible", timeout=15000)
    box = page.locator("#pano-canvas").bounding_box()
    if box and box["width"] > 100:
        y0 = box["y"] + box["height"] * 0.58
        page.mouse.move(box["x"] + box["width"] * 0.08, y0)
        page.mouse.down()
        for i in range(1, 16):
            x = box["x"] + box["width"] * (0.08 + 0.84 * i / 15)
            y = y0 - box["height"] * (0.04 if i % 3 else 0.0)
            page.mouse.move(x, y)
        page.mouse.up()
    page.locator("#ed-save").click()
    page.wait_for_function(
        """() => document.querySelector('#ed-status')?.textContent
             .toLowerCase().includes('saved')""", timeout=15000)


def web_select_view(page, view: str) -> None:
    key = {"sky-view": "sky"}.get(view, view)
    page.click(f"#tabs a[data-v='{key}']")
    page.wait_for_function("(v) => location.hash === '#' + v", arg=key,
                           timeout=15000)
    if view == "horizon":
        page.wait_for_selector("#pano-canvas", timeout=15000)


def capture_web(browser, png: bytes) -> int:
    server = StaticServer(WEB_DIR)
    base = server.start()
    try:
        context = browser.new_context(
            timezone_id="Europe/Berlin", locale="en-US",
            viewport={"width": 1672, "height": 941}, color_scheme="dark",
            device_scale_factor=1, reduced_motion="reduce")
        page = context.new_page()
        page.clock.install(time="2026-09-26T20:36:00Z")
        page.clock.resume()
        page.route("https://popularity-source.invalid/", lambda route: route.abort())
        page.goto(base, wait_until="domcontentloaded")
        try:
            page.wait_for_selector("#w-skip", state="visible", timeout=12000)
            page.click("#w-skip")
        except Exception:
            pass
        page.wait_for_selector("#tonight-rank-table tbody tr[data-tonight-id]", timeout=60000)
        page.evaluate("""async () => {
          const WS = await import('./webstore.js');
          const Hor = await import('./horizon.js');
          await WS.saveSiteRec({id:'capture-black-forest', name:'Black Forest',
            lat:48, lon:8.2, elev:900, tz:'Europe/Berlin'});
          Hor.setPrefs({activeSiteId:'capture-black-forest', minAlt:25,
            edge:16, viewFullDay:false});
        }""")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#tonight-rank-table tbody tr[data-tonight-id]", timeout=60000)
        set_web_datetime(page)
        make_web_pano(page, png)

        count = 0
        for theme in THEMES:
            set_web_theme(page, theme)
            for size_name, width, height in WEB_SIZES:
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(220)
                for view in WEB_VIEWS:
                    web_select_view(page, view)
                    reset_web_capture_scroll(page)
                    if view in ("tonight", "catalog"):
                        open_web_detail(page, view)
                        reset_web_capture_scroll(
                            page,
                            check_tonight_chart=(view == "tonight" and width > 900),
                        )
                    elif view == "sky-view":
                        selected = page.locator("#sky-visible-now [data-sky-target='ngc224']")
                        if selected.count():
                            selected.first.scroll_into_view_if_needed()
                            selected.first.click()
                            reset_web_capture_scroll(page)
                    overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                    RESPONSIVE_REPORT.append({"shell": "web", "view": view,
                        "size": size_name, "width": width, "horizontalOverflow": overflow})
                    if width == 1672:
                        LAYOUT_REPORT[f"web-{view}"] = measure_layout(page, "web", view)
                    page.wait_for_timeout(180)
                    name = f"web-{view}-{theme}-{size_name}-{width}x{height}.png"
                    page.screenshot(path=str(OUT / name), animations="disabled")
                    count += 1
                    if view in ("tonight", "catalog"):
                        # At 900px and below the fixed header can overlap the
                        # modal's close control after scroll restoration. Fire
                        # the real button handler directly so the next view
                        # starts with the same closed state at every width.
                        page.locator("#m-close").evaluate("button => button.click()")
                        page.wait_for_timeout(90)
            print(f"web screenshots captured for {theme}", flush=True)
        context.close()
        return count
    finally:
        server.stop()


def main() -> int:
    from playwright.sync_api import sync_playwright

    OUT.mkdir(parents=True, exist_ok=True)
    pano = make_panorama_png()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        try:
            desktop_count = capture_desktop(browser, pano)
            web_count = capture_web(browser, pano)
        finally:
            browser.close()
    if desktop_count != 21 or web_count != 20:
        raise RuntimeError(f"wrong screenshot count: desktop={desktop_count}, web={web_count}")
    readme = f"""# Direction B implementation screenshots

These are viewport captures from the current desktop executable and web shell,
made {date.today().isoformat()} for visual review. They are not pixel-diff fixtures; all
astronomy and catalog values are live app output.

## Capture state

- Site: Black Forest, 48.0° N, 8.2° E, Europe/Berlin (900 m)
- Night: 2026-09-26; selected time: 22:36 local
- Selected target: the current top-ranked object in Tonight and M31 / NGC 224
  in Catalog and Library; Sky View follows its selected visible target
- Minimum altitude: 25°; edge space: 16 px; full-day view: off
- Theme: Workbench
- Desktop library: isolated temporary FITS archive with three M31 sessions,
  light/dark/flat/bias frames, and two additional catalog objects, all imported
  through the normal FITS ingest and session grouping paths
- Horizon editor: isolated synthetic Black Forest ridge image and a saved
  obstruction stroke

## Matrix

- Desktop: Tonight, Catalog, Sky View, Horizon, Import Exposures, Library, Sky
  Map × Workbench × 1672×941, 1240×900, and 900×800 (21 PNGs).
- Web: Tonight, Catalog, Sky View, Horizon × Workbench × 1672×941, 1240×900,
  900×800, 640×900, and 360×800 (20 PNGs).

## Reference and measured first-viewport acceptance

The table compares each concept PNG with the fresh 1672×941 captures. Bounds
are measured in CSS pixels from the viewport origin. A gap is listed when a
required region is missing, outside the first viewport, too small, or lacks
the required row density. Full per-region measurements and responsive overflow
results are in `layout-measurements.json`.

{acceptance_markdown(LAYOUT_REPORT)}

## Visual review

The five largest remaining visual differences are recorded here after opening
and comparing the nine wide captures with the reference PNGs.

1. Pending visual review.
2. Pending visual review.
3. Pending visual review.
4. Pending visual review.
5. Pending visual review.

Responsive screenshot captures also include 1240×900 and 900×800 desktop, plus
640×900 and 360×800 web views. `layout-measurements.json` records page-level
horizontal overflow for every capture width.

Filenames use `shell-view-theme-size-widthxheight.png`. Rerun from the repository
root with `python -B ui-concepts/direction-b/implementation/capture_screenshots.py`.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")
    (OUT / "layout-measurements.json").write_text(json.dumps({
        "captured": date.today().isoformat(),
        "wideViewport": {"width": 1672, "height": 941},
        "regions": LAYOUT_REPORT,
        "responsiveOverflow": RESPONSIVE_REPORT,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Captured {desktop_count} desktop and {web_count} web screenshots in {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
