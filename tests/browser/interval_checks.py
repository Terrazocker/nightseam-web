"""The reviewed dawn overrun, exercised through every planning view."""

from __future__ import annotations

import json
import re

from harness import WEB_DIR


def interval_view_agreement(c):
    """Use three real catalog rows in an isolated context, never user storage.

    The small pool ensures all three reviewed targets are reachable in the
    ranked table and Sky View map. Astronomy, planning and rendering remain
    the application's real implementations. Photo loading has separate checks.
    """
    ids = ("ngc281", "ngc225", "ngc457")
    from web_suite import click_sky_target, scrub_sky_to_wall
    catalog = json.loads((WEB_DIR / "catalog.json").read_text(encoding="utf-8"))
    rows = [row for row in catalog if row["id"] in ids]
    c.expect_eq(len(rows), 3, "the regression's actual catalog targets exist")
    c.page.route("**/catalog.json?*", lambda route: route.fulfill(
        status=200, content_type="application/json", body=json.dumps(rows)))
    source = (WEB_DIR / "app.js").read_text(encoding="utf-8")
    modules = {
        name: re.search(r"\./" + re.escape(name) + r"\.js\?v=\d+", source).group(0)
        for name in ("core", "webstore", "horizon")
    }
    c.goto("/")
    c.page.wait_for_selector("#w-skip", state="visible", timeout=15000)
    c.page.click("#w-skip")
    c.page.wait_for_selector("#tonight-rank-table tbody tr[data-tonight-id]", timeout=60000)
    c.page.wait_for_function("() => typeof window.__ns_scrub_range === 'function'")
    c.page.evaluate("""async (modules) => {
      const WS = await import(modules.webstore);
      const Hor = await import(modules.horizon);
      await WS.saveSiteRec({id: 'interval-regression-berlin', name: 'Interval check Berlin',
        lat: 52.52, lon: 13.40, elev: 0, tz: 'Europe/Berlin'});
      Hor.setPrefs({activeSiteId: 'interval-regression-berlin', minAlt: 25,
        viewFullDay: false, moonAware: false, autoWeather: false});
    }""", modules)
    c.page.reload(wait_until="domcontentloaded")
    c.page.wait_for_selector("#tonight-rank-table tbody tr[data-tonight-id]", timeout=60000)
    # A small fixture can render its rows before boot binds the top-bar
    # listeners. Wait for the hook installed after the date listener, then
    # require the requested date in the actual rendered night brief.
    c.page.wait_for_function("() => typeof window.__ns_scrub_range === 'function'")
    generation = c.tonight_gen()
    c.page.locator("#tb-date").fill("2026-10-05")
    c.page.locator("#tb-date").dispatch_event("change")
    c.wait_tonight_after(generation)
    c.page.wait_for_function("""() =>
      document.querySelector('.night-brief-title')?.textContent.includes('2026-10-05')
    """)

    expected = c.page.evaluate("""async ({modules, rows}) => {
      const C = await import(modules.core);
      const WS = await import(modules.webstore);
      const day = new Date(2026, 9, 5);
      const noon = WS.wallToUtc(new Date(2026, 9, 5, 12));
      const info = C.nightInfo(day, 52.52, 13.40, noon);
      const window = C.pickDarkWindow(info, day, noon);
      const lo = C.julianDay(window.dusk), hi = C.julianDay(window.dawn);
      const clock = jd => {
        const d = WS.utcToWall(C.dateFromJD(jd));
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      };
      const duration = minutes => {
        const m = Math.max(0, Math.round(minutes));
        return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
      };
      const stats = C.nightStatsBatch(rows, lo, hi, 6 / 1440, 25, null, 52.52, 13.40);
      return {lo, hi, dark: clock(lo) + '–' + clock(hi), rows: stats.map((s, i) => ({
        id: rows[i].id, start: s.bestStart, end: s.bestEnd,
        best: clock(s.bestStart) + '–' + clock(s.bestEnd),
        duration: duration((s.bestEnd - s.bestStart) * 1440),
        visible: 'visible for ' + duration(s.visibleMinutes),
      }))};
    }""", {"modules": modules, "rows": rows})
    c.expect_eq(expected["dark"], "20:28–05:21",
                "Berlin Oct 5 retains its reviewed astronomical dark bounds")
    c.expect_in(expected["dark"], c.page.inner_text(".night-brief-facts"),
                "Tonight header shows the authoritative dark window")
    for row in expected["rows"]:
        c.expect(row["start"] >= expected["lo"] and row["end"] <= expected["hi"],
                 f"{row['id']} usable boundaries remain inside darkness: {row}")
        c.expect_eq(row["best"], expected["dark"],
                    f"the full-clear reviewed target {row['id']} reaches exactly dawn")
        text = c.page.inner_text(f"tr[data-tonight-id='{row['id']}']")
        c.expect_in(row["best"] + " · " + row["duration"], text,
                    f"Tonight {row['id']} uses bounded endpoints and duration")

    def tab(name):
        c.page.click(f"#tabs a[data-v='{name}']")

    tab("catalog")
    c.page.wait_for_selector("table.cat tbody tr[data-id]")
    for row in expected["rows"]:
        target = c.page.locator(f"table.cat tr[data-id='{row['id']}']")
        c.expect_in(row["best"], target.inner_text(),
                    f"Catalog {row['id']} agrees with Tonight")
        target.click()
        c.page.wait_for_selector("#m-hero-window", state="visible")
        c.expect_eq(c.page.inner_text("#m-hero-window"), row["best"],
                    f"detail {row['id']} shares Tonight's interval")
        c.expect_eq(c.page.inner_text("#m-hero-visibility"), row["visible"],
                    f"detail {row['id']} shares bounded usable minutes")
        c.expect_in(row["best"], c.page.inner_text("#d-obs"),
                    f"detail summary {row['id']} uses the shared interval")
        c.expect_in(row["visible"], c.page.inner_text("#d-obs"),
                    f"detail summary {row['id']} uses the shared duration")
        c.page.click("#m-close")

    tab("sky")
    scrub_sky_to_wall(c, "2026-10-05T23:00")
    c.page.eval_on_selector("#sky-mag", """el => {
      el.value = el.max;
      el.dispatchEvent(new Event('input', {bubbles:true}));
    }""")
    for row in expected["rows"]:
        click_sky_target(c, next(target for target in rows if target['id'] == row['id']))
        c.page.wait_for_selector('#m-hero-window', state='visible')
        c.expect_in(row["best"], c.page.inner_text("#m-hero-window"),
                    f"Sky View {row['id']} agrees with Tonight and Catalog")
        c.expect_in(row["visible"], c.page.inner_text("#d-obs"),
                    f"Sky View {row['id']} reports bounded duration")
    c.assert_clean()
