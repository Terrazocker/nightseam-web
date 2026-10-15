"""UI invariants: popularity is a scoring input, never a primary table column.

The catalog retains popularity only as an internal scoring input, while its
primary table follows the compact Direction B columns and never exposes tier
letters or the underlying the popularity source number. These text assertions fail loudly
if either shell reintroduces those fields into the visible UI.

The same file also pins the `hidden` handling, because that broke once: an
author `display` beats the UA's `[hidden] { display:none }`, so a panel hidden
with the ATTRIBUTE shows up unless an author rule restores it.

And it pins the web's content width, because a width CAP there silently killed
the "Free space per side" slider (test_web_content_width_is_edge_driven).
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _read(*parts) -> str:
    """Read a subject file, FAILING when it is missing.

    TR-07 (0.6.32 review): this used to `pytest.skip`, so renaming a subject file
    (e.g. `web/app.js`) silently retired ~25 text invariants - including "the
    popularity score is never rendered" - with a GREEN run. The project rule
    (FIX-9b/TS6) is that a green run must never mean "not checked", so a missing
    subject is a failure that names the file."""
    path = ROOT.joinpath(*parts)
    if not path.is_file():
        pytest.fail(f"{path} is missing - this invariant cannot be checked "
                    f"(a missing subject file is a FAILURE, never a skip)")
    return path.read_text(encoding="utf-8")


def test_web_catalog_hides_popularity_from_the_primary_table():
    """Popularity remains internal; the visible default is Name."""
    js = _read("web", "app.js")
    assert '<th>Designation</th><th>Common name</th>' in js
    assert "th('tier', 'Tier')" not in js
    assert "tier-badge" not in js
    assert "<th>Frame</th>" not in js
    assert "assignPopularityTiers" in js, "tiers must come from core, not a copy"
    assert "sort: 'name'" in js, "the catalog's visible default is Name"
    assert "['tier','Popularity']" not in js, "popularity must not be a visible sort option"
    for forbidden in ("th('popularity'", "<dt>Popularity</dt>",
                      "popularityOf(o).toLocaleString", "popularity-aware",
                      "popular: 'Popular'", "${o.popularity", "${a.popularity",
                      "${b.popularity"):
        assert forbidden not in js, f"web/app.js still shows popularity: {forbidden!r}"


def test_web_sun_moon_use_the_altaz_wrappers():
    """The chart's Sun/Moon positions must come from web/astro.js::sunAltAz /
    moonAltAz, which own the degree composition (sunRaDec/moonRaDec already
    return DEGREES, like app/astro.py). The original map bug was web/app.js
    calling `sunRaDec()` then multiplying by 15 (degrees treated as hours), so
    app.js must not touch the raw RA/Dec helpers at all - else a `* 15` can
    reappear with no test able to see it (the parity harness only exercises
    astro.js)."""
    js = _read("web", "app.js")
    assert "sunAltAz(" in js and "moonAltAz(" in js
    for forbidden in ("sunRaDec(", "moonRaDec("):
        assert forbidden not in js, (
            f"web/app.js uses {forbidden}; use sunAltAz/moonAltAz instead")


def test_web_chip_row_has_no_popular_chip():
    js = _read("web", "app.js")
    assert "popularityOf(o) >= 10000" not in js      # the old chip filter
    # the chip row itself stays, just without a popularity entry
    assert "const CHIP_LABELS = { all: 'All', messier:" in js


def test_web_horizon_editor_switch_flush_and_beforeunload():
    """Switching to another horizon must FLUSH the open editor first, so edits
    stay with the horizon they belong to; the flush is synchronous (no save
    timer). beforeunload only warns while something is unsaved."""
    js = _read("web", "horizon.js")
    assert "if (activeSession && activeSession.dirty()) activeSession.save();" in js
    radio = js[js.index("$('input[type=radio]', li).addEventListener('change'"):]
    assert radio.index("flushHorizonEdits();") < radio.index("setActive(li.dataset.id);"), \
        "switching must flush before activating the other horizon"
    assert "addEventListener('beforeunload'" in js
    assert "ev.returnValue = ''" in js
    assert "saveTimer" not in js          # web flush is synchronous, not a timer


def test_web_horizon_editor_controls_and_no_blocking_dialogs():
    """The horizon editor exposes its whole control set and never uses a
    blocking browser alert/confirm (Clear and Delete use an in-page dialog).
    Horizon photos are retired (2026-10-15): no upload, Align mode or photo
    panel comes back."""
    js = _read("web", "horizon.js")
    for cid in ("hz-mode-draw", "hz-mode-overhang", "ed-undo", "ed-redo", "hz-clear",
                "ed-zoom-in", "ed-zoom-out", "ed-fit", "ed-status", "ed-pos",
                "hz-export", "hz-name", "hz-new-draw", "hz-import-file"):
        assert f'id="{cid}"' in js, f"missing editor control #{cid}"
    for gone in ("hz-photo-file", "hz-mode-align", "hz-photo-panel", "hz-attach-file", "hz-detect"):
        assert gone not in js, f"retired photo control #{gone} is back"
    assert "alert(" not in js and "window.confirm(" not in js and " confirm(" not in js
    assert js.count("await confirmDialog(box,") >= 2, "Clear and Delete ask in-page"
    for fn in ("horizonUnsaved", "flushHorizonEdits", "clampView", "describeHorizon"):
        assert f"export function {fn}" in js, fn


def _js_body(src: str, header: str) -> str:
    """Body of a top-level JS function, up to its first closing brace."""
    start = src.index(header)
    return src[start:src.index("\n}", start)]


def test_attribute_hidden_panels_restore_display_none():
    """Panels hidden with the ATTRIBUTE need an author rule, or they show up.

    0.6.6 bug: `.set-form { display: grid }` beat the UA's `[hidden]` rule, so
    the rig/sites/targets forms were visible before "Add rig" was pressed.
    """
    css = _read("web", "style.css")
    js = _read("web", "app.js")
    for selector in (".set-form[hidden]", "#set-rig-picker[hidden]"):
        assert selector in css, f"web/style.css lost {selector}: the panel will render anyway"
    # ... and those attributes really are the mechanism the app uses
    assert 'class="set-form" id="sf-rig" hidden' in js
    assert '<div id="set-rig-picker" hidden>' in js
    # the picker stays empty until it is opened
    assert "function showRigPicker()" in js


def test_rig_selector_sits_in_the_topbar():
    """The imaging rig belongs next to Site, not buried in the hamburger menu."""
    for tree in ("web",):
        html = _read(tree, "index.html")
        head, sep, menu = html.partition('id="menuPanel"')
        assert sep, f"{tree}/index.html lost its hamburger menu"
        assert 'id="rigSelect"' in head, f"{tree}: the rig selector left the topbar"
        assert 'id="rigSelect"' not in menu, f"{tree}: the rig selector is back in the hamburger menu"


def test_progressive_disclosure_keeps_advanced_controls_in_the_menu():
    """ITEM 4 / CORRECTION 1 (0.6.13): special/advanced controls live in the
    hamburger menu with a safe default; the primary toolbar carries only
    common-case controls. ONLY Setup migrated out of the topbar (menu "Data");
    the min-altitude slider is a COMMON control and stays in the top bar (its
    track is longer, not relocated). The rig also stays:
    test_rig_selector_sits_in_the_topbar pins it (framing is core)."""
    advanced = {
        "web": ("btn-settings",),
    }
    common = {
        "web": ("tb-site", "rigSelect", "tb-date", "tb-minalt", "tb-scrub"),
    }
    for tree in ("web",):
        html = _read(tree, "index.html")
        head, sep, menu = html.partition('id="menuPanel"')
        assert sep, f"{tree}/index.html lost its hamburger menu"
        # View full day: in the menu, OFF by default
        assert 'id="viewFullDay"' in menu, f"{tree}: View full day left the menu"
        assert not re.search(r'id="viewFullDay"[^>]*\bchecked', html), \
            f"{tree}: View full day must default to OFF"
        # the menu is grouped and labelled
        for group in ("Display", "Advanced", "Data"):
            assert f"<h4>{group}</h4>" in menu, f"{tree}: menu lost its {group} group"
        # migrated advanced controls live ONLY in the menu
        for cid in advanced[tree]:
            assert f'id="{cid}"' in menu, f"{tree}: #{cid} is not in the menu"
            assert f'id="{cid}"' not in head, \
                f"{tree}: advanced #{cid} is still in the default primary UI"
        # the primary toolbar keeps the common-case controls (min-alt included)
        for cid in common[tree]:
            assert f'id="{cid}"' in head, f"{tree}: common #{cid} left the primary UI"
        # min-alt is back in the top bar and its track is LONGER than the old
        # 88/110 px (a responsive clamp), not a full-width menu slider
        assert 'id="minUsefulAlt"' not in menu and 'id="tb-minalt"' not in menu, \
            f"{tree}: the min-altitude slider must stay in the top bar"
        css = _read(tree, "style.css")
        m = re.search(
            r'\.minalt input\[type=[\'"]?range[\'"]?\]\s*\{[^}]*width:\s*clamp\((\d+)px',
            css)
        assert m and int(m.group(1)) >= 120, (
            f"{tree}: the min-altitude slider needs a longer responsive track "
            f"(>=120px base clamp), got {m.group(0) if m else None!r}")


def test_web_action_rows_are_not_full_width():
    """ITEM B (0.6.13): an action button used AS a label must not become a
    full-width flex block. `.btnrow label { display:flex }` stretched an
    upload label-button while its siblings stayed content-width. Pin the
    scoped rule, the auto-width action-row, and the horizon create buttons."""
    css = _read("web", "style.css")
    assert ".btnrow label:not(.btn)" in css, \
        "the .btnrow label rule must exclude label-buttons (class=btn)"
    assert re.search(r"\.btnrow label \{", css) is None, \
        "an unscoped .btnrow label rule stretches label-buttons"
    assert ".action-row .btn { flex: 0 0 auto; }" in css, \
        "action-row buttons must be auto-width, not stretched"
    js = _read("web", "horizon.js")
    assert 'class="btn" for="hz-import-file"' in js, \
        "the import control must stay a label-button"
    assert ".hz-new { display: grid;" in css, "the create buttons share one grid column"


def test_web_horizon_canvas_has_no_context_menu_and_sky_chart_has_no_chord():
    """The editor canvas only suppresses the browser menu on right-click (it
    starts no gesture), and the sky chart strokes only the ceiling curve, so
    the az 0 seam never shows a radial chord."""
    js = _read("web", "horizon.js")
    handler = re.search(r"cvs\.addEventListener\('contextmenu',\s*\(ev\)\s*=>\s*([^;]*)\);", js)
    assert handler and handler.group(1).strip() == "ev.preventDefault()", \
        "contextmenu must only suppress the browser menu"
    assert "} else if (ev.button !== 0) {\n      return;" in js, \
        "only the primary button (and middle/Space pan) start gestures"
    app = _read("web", "app.js")
    seam = app[app.index("// stroke ONLY the ceiling curve"):]
    seam = seam[:seam.index("ctx.stroke();")]
    assert "ceilPts.forEach" in seam and "cx + R * Math.sin" not in seam, \
        "the stroke must follow the ceiling only, never the rim polygon"


def test_web_sky_chart_has_one_obstruction_colour_and_scrub_time_is_clamped():
    """The sky chart shades obstructions in ONE colour (no second, yellow
    region), and the selected scrub time is pulled into the window at boot /
    on a site or date change so a daytime load never shows a daylight
    "visible at" instant."""
    app = _read("web", "app.js")
    assert "rgba(255, 209, 102, .12)" not in app, \
        "the sky chart must not paint a second (yellow) blocked colour"
    assert app.count("clampSkyTime();") >= 2, \
        "clamp the scrub time at boot and on refresh"
    assert "clampSkyTime({ repaint: true });" in app, \
        "a direct View full day change must clamp and repaint its active view"
    assert "function clampSkyTime({ repaint = false } = {})" in app, \
        "refresh-driven clamps must synchronize controls without a second render"
    assert "if (!S.site) return null;" in app, \
        "clampSkyTime must guard before the active site is known"


def test_web_night_info_anchors_the_polar_fallback():
    """FIX-6 (review CR1): the night-info chip's fallback window must come from
    the selected night's SITE-noon anchor, never the wall clock."""
    app = _read("web", "app.js")
    assert "E.pickDarkWindow(info, nightAnchor(), siteNoon(nightAnchor()), siteFallback(nightAnchor()))" in app, \
        "renderNightInfo must pass the night anchor + site noon"


def test_batch3_web_hardening_wiring():
    """Batch 3 web items that are not browser-testable here (WB3/WB4/WB6/WB7):
    the reload path is shared, the cross-tab guard exists, an IDB upgrade
    blocked by another tab rejects instead of hanging, and a bundle without a
    horizon section cannot wipe horizons. Behavioural guards are in
    tests/js/horizon_ui.mjs and tests/js/web_backup.mjs."""
    app = _read("web", "app.js")
    assert len(re.findall(r"await reloadRigs\((?:options)?\);", app)) >= 3, \
        "boot, renderSettings and reinitUserData must share reloadRigs()"
    assert "missing horizon section" in app
    hz = _read("web", "horizon.js")
    assert "addEventListener('storage'" in hz, \
        "another tab's horizon/prefs write must trigger a reload (WB4)"
    ws = _read("web", "webstore.js")
    assert "rq.onblocked" in ws, "a blocked IDB upgrade must reject (WB6)"


def test_web_charts_expose_descriptions_and_accessibility_modes():
    app = _read("web", "app.js")
    html = _read("web", "index.html")
    css = _read("web", "style.css")
    assert "aria-describedby" in app and "skyChartSummary" in app and "graphSummary" in app
    assert 'role="img"' in app
    assert 'role="tablist"' in html and "aria-selected" in html
    for rule in ("prefers-reduced-motion", "prefers-contrast: more", "focus-visible"):
        assert rule in css


def test_web_panorama_changes_invalidate_visibility_caches():
    core = _read("core", "plannerstate.js")
    horizon = _read("web", "horizon.js")
    app = _read("web", "app.js")
    assert "export const PLANNER_CHANGE_EVENT" in core and "panoramaRevision" in core
    assert "window.dispatchEvent(new CustomEvent(PLANNER_CHANGE_EVENT" in horizon
    assert "window.addEventListener(PLANNER_CHANGE_EVENT" in app
    assert "panoramaRevision(g.pano)" in app and "obsCache.clear()" in app
    for subject in (horizon, app):
        assert "announcePlannerChange" in subject
    for kind in ("site", "rig", "date", "selection", "preferences"):
        assert f"'{kind}'" in app


def test_web_minimum_visibility_filter_stands_down_during_search():
    app = _read("web", "app.js")
    assert 'id="cat-minvis"' in app and "function minVis()" in app
    assert "v.pct >= mv" in app and "mv > 0 && !q" in app


def test_web_tonight_pool_uses_source_core_and_keeps_unknown_magnitudes():
    visibility = _read("core", "visibility.js")
    body = _js_body(visibility, "export function inTonightPool(")
    assert "vmagKnownAndUnder(vmag, advCap)" in body and "!isAdv" in body
    known = _js_body(visibility, "export function vmagKnownAndUnder(")
    assert "vmag == null" in known and "return true" in known
    assert "ADV_TONIGHT_MAG_CAP = 9" in visibility
    app = _read("web", "app.js")
    assert "inTonightPool(o.vmag, !!o._adv)" in app
    assert "o.vmag != null && (!o._adv" not in app


def test_source_scoring_range_owns_its_denominator():
    scoring = _read("core", "scoring.js")
    assert "const win = Array.isArray(ctx.range) ? ctx.range : null;" in scoring
    assert "const windowDays = windowEnd - windowStart;" in scoring
    assert "windowMinutes: windowDays * 1440" in scoring
    assert "visibleDays) / windowDays" in scoring


def test_web_content_width_follows_free_space_without_a_pixel_cap():
    rule = re.search(r"^main\s*\{(.*?)\}", _read("web", "style.css"), re.M | re.S)
    assert rule
    width = re.search(r"max-width:\s*([^;]+);", rule.group(1))
    assert width and "--edge" in width.group(1)
    literals = re.findall(r"\d+px", re.sub(r"var\([^)]*\)", "VAR", width.group(1)))
    assert literals == ["320px"]


def test_web_horizon_legend_explains_the_obstruction():
    app = _read("web", "app.js")
    for text in ("blocked by horizon", "obstacleStroke", "obstacleFill"):
        assert text in app
    assert "above band: open (assumed)" not in app and "assumedHatch" not in app, \
        "the retired sky-band hatching must not come back half-wired"
    for token in ("--viz-obstacle-fill:", "--viz-obstacle-stroke:"):
        assert token in _read("web", "themes.css")


def test_web_altitude_graph_explains_states_and_clips_moon_tracks():
    app = _read("web", "app.js")
    for text in ('class="chart-legend"', "Target state", "Chart guides", "Minimum altitude", "Moon altitude", "<b>Horizon</b>", "white phase discs"):
        assert text in app
    assert "gCtx.rect(padL, padT, W - padL - padR, H - padT - padB);" in app
    assert "s.mAlt < -10 || s.mAlt > 90" in app
    for text in ("C.guideMoonDash", "drawMoonPhaseMarker", "moonPoints", "p.i % markerStep !== 0"):
        assert text in app
    css = _read("web", "style.css")
    assert ".guide-moon::after" in css and ".guide-obstruction" in css
    for token in ("--viz-moon-line:", "--viz-moon-band:", "--viz-moon-marker:", "--viz-moon-marker-shadow:", "--viz-guide-moon-dash:"):
        assert token in _read("web", "themes.css")


def test_web_hamburger_menu_stays_above_content():
    css = _read("web", "themes.css")
    assert 'html[data-theme="workbench"] .topbar {\n  position: sticky;\n  top: 0;\n  z-index: 55;' in css
    assert 'html[data-theme="workbench"] .tabs { z-index: 50; }' in css


def test_web_catalog_palette_comes_from_core():
    core = _read("core", "catalog.js")
    for color in ("#ffd166", "#7cc4ff", "#9be0ff", "#7bf1a8", "#8fe3d9", "#ff8fa3", "#c9b8ff", "#e0e6ff"):
        assert color in core
    for label in ("Globular cluster", "Planetary nebula", "Supernova remnant"):
        assert label in core
    app = _read("web", "app.js")
    assert "TYPE_LABELS, TYPE_COLORS" in app and "from './core.js" in app
    assert "const TYPE_COLORS = {" not in app and "const TYPE_LABELS = {" not in app


def test_web_detail_delegates_usable_intervals_to_shared_scoring():
    app = _read("web", "app.js")
    detail = app[app.index("  // ---- altitude chart ----"):app.index("function closeDetail")]
    assert "const detailWin = nightWindow();" in detail
    assert "const detailStats = nightStats(o, detailWin.jd0, detailWin.jd1," in detail
    assert "detailWin.step, minAlt, pano, lat, lon);" in detail
    assert "visibleMinutes: detailStats.visibleMinutes" in detail
    assert "E.dateFromJD(detailStats.bestEnd)" in detail
    assert "bestStart / steps" not in detail
    assert "visCount *" not in detail
