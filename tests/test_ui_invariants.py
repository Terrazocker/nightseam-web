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


def test_web_panorama_editor_switch_flush_and_beforeunload():
    """Switch-to-another-panorama must FLUSH the open editor's edits (they belong
    to the original id) and never write them into the new selection; the web has
    no pending save timer (the flush is synchronous). beforeunload is
    warn-only/best-effort - it must not persist, so a hard close can be lossy
    (the in-app navigation flush and the warning are the protection)."""
    js = _read("web", "horizon.js")
    assert "if (activeSession && activeSession.dirty()) activeSession.save();" in js
    assert "flushHorizonEdits();          // never lose edits when switching" in js
    assert "addEventListener('beforeunload'" in js
    assert "ev.returnValue = ''" in js
    assert "saveTimer" not in js          # web flush is synchronous, not a timer


def test_web_panorama_editor_controls_and_no_blocking_dialogs():
    """The redesigned web panorama editor exposes the full control set and never
    uses a blocking browser alert/confirm (Clear uses an in-page dialog)."""
    js = _read("web", "horizon.js")
    for cid in ("ed-undo", "ed-redo", "ed-revert", "ed-clear", "ed-save",
                "ed-zoom-in", "ed-zoom-out", "ed-fit", "ed-status", "ed-pos"):
        assert f'id="{cid}"' in js, f"missing editor control #{cid}"
    assert "alert(" not in js and "window.confirm(" not in js
    for fn in ("snapshotPano", "historyUndo", "historyRedo", "editorClampZoom",
               "editorScreenToBase", "horizonUnsaved", "flushHorizonEdits"):
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
    full-width flex block. `.btnrow label { display:flex }` stretched the
    "Upload photo" label-button across the whole horizons panel while
    "Blank sky" stayed content-width. Pin the scoped rule, the auto-width
    action-row, and the horizons row using it."""
    css = _read("web", "style.css")
    assert ".btnrow label:not(.btn)" in css, \
        "the .btnrow label rule must exclude label-buttons (class=btn)"
    assert re.search(r"\.btnrow label \{", css) is None, \
        "an unscoped .btnrow label rule stretches label-buttons"
    assert ".action-row .btn { flex: 0 0 auto; }" in css, \
        "action-row buttons must be auto-width, not stretched"
    js = _read("web", "horizon.js")
    assert 'class="btnrow action-row"' in js, \
        "the horizons create row must use the auto-width action-row"
    assert 'class="btn primary" for="pano-file"' in js, \
        "the upload control must stay a label-button (auto-width)"


def test_web_hold_right_click_erases_and_sky_chart_has_no_chord():
    """0.6.13 follow-up: a held right-button drag must erase for the WHOLE
    gesture (one history entry), not a single contextmenu dab; and the sky
    chart must draw the sky-mode blocked-above region per contiguous overhang
    run so a gap is never bridged by a straight chord."""
    js = _read("web", "horizon.js")
    assert "ev.button === 2" in js, "the right-button paint gesture is gone"
    assert "gestureErase = ev.button === 2" in js, "right-button erase owns the whole gesture"
    assert "gestureErase" in js and "strokeAt(x, y, gestureErase)" in js, \
        "pointermove must continue the right-button erase gesture"
    assert "![0, 1, 2].includes(ev.button)" in js, "unsupported pointer buttons must be ignored"
    # TR-11 (0.6.32 review): this used to assert the COMMENT text "already
    # erased", which only a prose edit could break while the behaviour it names
    # could come back green. Pin the HANDLER shape instead: the contextmenu
    # listener must only suppress the browser menu - a re-added one-shot erase
    # would call strokeAt() there.
    handler = re.search(
        r"cvs\.addEventListener\('contextmenu',\s*\(ev\)\s*=>\s*\{(.*?)\}\)",
        js, re.S)
    assert handler, "the contextmenu handler is gone"
    assert "preventDefault" in handler.group(1), \
        "contextmenu must suppress the browser menu"
    assert "strokeAt" not in handler.group(1), \
        "contextmenu must not perform a separate one-shot erase"
    assert "export function overhangRuns" in _read("core", "horizon.js"), \
        "overhangRuns helper missing from core"
    app = _read("web", "app.js")
    assert "Hor.overhangRuns(pano, 2)" in app, \
        "the sky chart must draw blocked-above per contiguous overhang run"
    assert "topPts" not in app, \
        "the old single top polygon (chord across gaps) must be gone"
















def test_web_sky_mode_is_one_obstruction_colour_and_scrub_time_is_clamped():
    """0.6.13 follow-up: sky-band shading must be ONE obstruction colour (the
    sky view = the obstruction view inverted; no unexplained second/yellow
    region), and the selected scrub time must be pulled into the window at
    boot / on a site or date change so a daytime load never shows a daylight
    "visible at" instant."""
    app = _read("web", "app.js")
    assert "rgba(255, 209, 102, .12)" not in app, \
        "sky mode must not paint a second (yellow) blocked colour"
    assert "Hor.overhangRuns(pano, 2)" in app
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
    pano section cannot wipe horizons. Behavioural guards for WB5 are in
    tests/js/pano_ui.mjs."""
    app = _read("web", "app.js")
    assert len(re.findall(r"await reloadRigs\((?:options)?\);", app)) >= 3, \
        "boot, renderSettings and reinitUserData must share reloadRigs()"
    assert "missing panorama section" in app
    hz = _read("web", "horizon.js")
    assert 'addEventListener("storage"' in hz, \
        "another tab's pano/prefs write must trigger a reload (WB4)"
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


def test_web_horizon_legend_and_hatching_explain_the_obstruction():
    app = _read("web", "app.js")
    for text in ("blocked by horizon", "above band: open (assumed)", "obstacleStroke", "obstacleFill", "assumedHatch"):
        assert text in app
    assert "rgba(210, 225, 255, .55)" in _read("web", "style.css")
    assert "assumedOpenHatchPolys(p, W, H, lo, hi)" in _read("web", "horizon.js")
    for token in ("--viz-obstacle-fill:", "--viz-obstacle-stroke:", "--viz-assumed-hatch:"):
        assert token in _read("web", "themes.css")


def test_web_altitude_graph_explains_states_and_clips_moon_tracks():
    app = _read("web", "app.js")
    for text in ('class="chart-legend"', "Target state", "Chart guides", "Minimum altitude", "Moon altitude", "Obstruction ceiling", "white phase discs"):
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
