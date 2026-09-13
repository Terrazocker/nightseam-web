"""UI invariants: popularity is a scoring input, never something you can see.

The popularity source scores still rank results (a silent TIEBREAKER: visibility score
decides, popularity only separates equal scores), but no view may render the
number or offer it as a criterion - no catalog column, no detail row, no filter
chip, no sort mode. These are text assertions on the two UIs: cheap, and they
fail loudly when a future edit re-surfaces the stat.

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
    path = ROOT.joinpath(*parts)
    if not path.is_file():
        pytest.skip(f"{path} is not present")
    return path.read_text(encoding="utf-8")


def test_web_catalog_never_renders_popularity():
    js = _read("web", "app.js")
    for forbidden in ("th('popularity'", "<dt>Popularity</dt>",
                      "popularityOf(o).toLocaleString", "popularity-aware",
                      "popular: 'Popular'"):
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


def test_desktop_robustness_invariants():
    """Zero-site recovery and pano-save safety are one-line-critical: a
    substring assertion is enough to catch a revert.

    - main.js must reopen the wizard whenever there are no sites (the old
      `&& !wizard_done` guard left a permanent 0-site dead-end).
    - pano.js select() must cancel a pending auto-save (it belongs to the
      previous panorama) and must not blank a stored profile for a stroke-less
      record.
    - detail.js must escape the constellation and distance sinks."""
    mainjs = _read("static", "js", "main.js")
    assert "if (!S.cfg.sites.length) {" in mainjs
    assert "!S.cfg.wizard_done" not in mainjs
    pano = _read("static", "js", "pano.js")
    assert "if (Pano.saveTimer) { clearTimeout(Pano.saveTimer); Pano.saveTimer = null; }" in pano
    # recomputeProfile must keep a stroke-less record's stored profile. Since
    # PY-03 the test is the shared strokeList() guard, so a NON-ARRAY stored
    # `strokes` also counts as stroke-less instead of crashing the editor - and
    # both iteration sites must go through it.
    assert "function strokeList(rec)" in pano
    assert "if (strokeList(Pano.cur).length === 0) {" in pano
    assert pano.count("for (const s of strokeList(Pano.cur)) {") == 2
    detail = _read("static", "js", "detail.js")
    assert "esc(constName(m.constellation))" in detail
    assert "esc(m.distance)" in detail


def _js_body(src: str, header: str) -> str:
    """Body of a top-level JS function, up to its first closing brace."""
    start = src.index(header)
    return src[start:src.index("\n}", start)]


def test_desktop_ownership_invariants():
    """DE-02 / DE-07 / DE-08: three ownership contracts, each a single statement.

    A handler or a cache belonged to the WRONG owner: the mask cache survived a
    panorama switch, the dismiss button bubbled into the notice's own action, and
    the wizard's typed values survived the run that should have replaced them.
    The pin slices the function BODY (a whole-file grep would pass on an
    unrelated copy elsewhere)."""
    pano = _read("static", "js", "pano.js")
    assert "invalidateMask();" in _js_body(pano, "async function select(rec) {"), (
        "DE-02: select() must drop the previous panorama's mask cache")
    util = _read("static", "js", "util.js")
    toast_body = _js_body(util, "export function toast(msg")
    assert "stopPropagation()" in toast_body, (
        "DE-08: the toast's dismiss button must not bubble to the toast body")
    wiz = _read("static", "js", "wizard.js")
    assert "_formState = {};" in _js_body(wiz, "export function openWizard() {"), (
        "DE-07: a wizard replay must not reuse the first run's coordinates")


def test_desktop_has_no_popularity_sort_mode():
    html = _read("static", "index.html")
    js = _read("static", "js", "targets.js")
    assert 'value="popularity"' not in html
    assert "popularity:" not in js                   # comparator key is gone


def test_popularity_still_breaks_ties():
    """Removing the display must not remove the scoring."""
    web = _read("web", "app.js")
    desk = _read("static", "js", "targets.js")
    assert "(b.score - a.score) || (b.pop - a.pop)" in web
    assert "d !== 0 ? d : popularityFactor(b.m) - popularityFactor(a.m)" in desk
    assert "function popularityFactor(o)" in web                 # web/app.js is the app entry, no exports
    assert "corePopularityFactor(popularityOf(o))" in web        # ...delegating to the shared core curve
    derive = _read("static", "js", "derive.js")
    assert "export function popularityFactor(m)" in derive       # desktop keeps the meta-object signature
    assert "corePopularityFactor(m && m.popularity)" in derive   # ...and delegates to core


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


def test_desktop_keeps_the_hidden_class_authoritative():
    """The desktop hides things with the `.hidden` CLASS - it must keep winning."""
    assert ".hidden { display: none !important; }" in _read("static", "style.css")
    html = _read("static", "index.html")
    assert 'id="rigPicker" class="hidden"' in html
    assert 'id="rigForm" class="formrow hidden"' in html


def test_rig_selector_sits_in_the_topbar():
    """The imaging rig belongs next to Site, not buried in the hamburger menu."""
    for tree in ("web", "static"):
        html = _read(tree, "index.html")
        head, sep, menu = html.partition('id="menuPanel"')
        assert sep, f"{tree}/index.html lost its hamburger menu"
        assert 'id="rigSelect"' in head, f"{tree}: the rig selector left the topbar"
        assert 'id="rigSelect"' not in menu, f"{tree}: the rig selector is back in the hamburger menu"

def test_web_content_width_is_edge_driven():
    """The main max-width must never cap the "Free space per side" slider.

    The shape is min(100%, max(320px, 100% - 2*var(--edge))) - the ONLY px
    literal allowed is the 320px usable floor. 0.6.9 carried a 1500px "maximum
    reading width" inside that min(), and it silently WON over the edge term on
    any viewport wider than 1500 + 2*edge: the slider was inert below edge 210
    on a 1920px screen and had NO effect at all from ~2100px up - which is how
    a 2560px owner met it ("free space per side does nothing"). The desktop has
    no such cap (static/style.css .tabpane is 100vw - 2*edge-space).
    """
    rule = re.search(r"^main\s*\{(.*?)\}", _read("web", "style.css"), re.M | re.S)
    assert rule, "web/style.css lost its main rule"
    width = re.search(r"max-width:\s*([^;]+);", rule.group(1))
    assert width, "web/style.css main has no max-width"
    expr = width.group(1)
    assert "--edge" in expr, "the web content width no longer follows --edge: " + expr
    # ignore var()'s own fallback (var(--edge, 14px)) - only real caps count
    literals = re.findall(r"\d+px", re.sub(r"var\([^)]*\)", "VAR", expr))
    assert literals == ["320px"], (
        "a px cap in main's max-width defeats the edge slider on wide screens: " + expr)

    desktop = _read("static", "style.css")
    assert re.search(r"max-width:\s*calc\(100vw\s*-\s*2\s*\*\s*var\(--edge-space", desktop), (
        "desktop parity: static/style.css content width is 100vw - 2*edge-space")


def test_progressive_disclosure_keeps_advanced_controls_in_the_menu():
    """ITEM 4 / CORRECTION 1 (0.6.13): special/advanced controls live in the
    hamburger menu with a safe default; the primary toolbar carries only
    common-case controls. ONLY Setup migrated out of the topbar (menu "Data");
    the min-altitude slider is a COMMON control and stays in the top bar (its
    track is longer, not relocated). The rig also stays:
    test_rig_selector_sits_in_the_topbar pins it (framing is core)."""
    advanced = {
        "web": ("btn-settings",),
        "static": ("btnSites",),
    }
    common = {
        "web": ("tb-site", "rigSelect", "tb-date", "tb-minalt", "tb-scrub"),
        "static": ("siteSelect", "rigSelect", "dateInput", "minUsefulAlt", "timeSlider"),
    }
    for tree in ("web", "static"):
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
    assert "strokeAt(x, y, true)" in js, "the right-button gesture must erase"
    assert "gestureErase" in js and "strokeAt(x, y, gestureErase)" in js, \
        "pointermove must continue the right-button erase gesture"
    assert "if (ev.button !== 0) return;" in js
    assert "already erased" in js, \
        "contextmenu must not perform a separate one-shot erase"
    assert "export function overhangRuns" in _read("core", "horizon.js"), \
        "overhangRuns helper missing from core"
    app = _read("web", "app.js")
    assert "Hor.overhangRuns(pano, 2)" in app, \
        "the sky chart must draw blocked-above per contiguous overhang run"
    assert "topPts" not in app, \
        "the old single top polygon (chord across gaps) must be gone"


def test_sky_band_defaults_to_open_above_with_an_opt_in():
    """0.6.13 follow-up: in sky mode everything ABOVE the painted band is free
    sky by DEFAULT (open above). The band top caps visibility only with the
    explicit "block above band" opt-in; the assumed-open area is hatched (not
    shaded as a second colour), and the desktop exposes the same opt-in."""
    js = _read("web", "horizon.js")
    assert "blockAbove" in js
    core = _read("core", "horizon.js")
    assert "export function overhangRuns" in core
    assert "export function assumedOpenRuns" in core
    assert "if (!p || p.paintMode !== 'sky' || !p.blockAbove) return [];" in core, \
        "overhang runs must be empty unless block-above is on"
    assert "p.blockAbove = !!ev.target.checked;" in js, \
        "the editor toggle must set p.blockAbove"
    app = _read("web", "app.js")
    assert "Hor.assumedOpenRuns(pano, 2)" in app, \
        "the assumed-open area must be hatched on the sky chart"
    assert "hatchSector" in app
    assert "above band: open (assumed)" in app, \
        "the legend must explain the hatch"
    assert "rgba(255, 209, 102, .12)" not in app, \
        "no unexplained second (yellow) colour"
    desktop = _read("static", "index.html")
    assert 'id="chkBlockAbove"' in desktop, "desktop needs the same opt-in"
    assert "block_above" in _read("app", "database.py")
    assert "block_above" in _read("app", "server.py")


def test_desktop_sky_view_respects_block_above_and_hatches_open_above():
    """Desktop parity for the sky band: the sky view must treat the band top as
    a ceiling only with block_above, and hatch (never shade) the assumed-open
    area above the band by default."""
    derive = _read("static", "js", "derive.js")
    assert "act.block_above && act.profile_top" in derive, \
        "activeTopProfile must require block_above"
    assert "export function activeBandTop" in derive, "raw band top helper missing"
    sky = _read("static", "js", "skyview.js")
    assert "activeBandTop" in sky, "sky view must read the raw band top"
    assert "hatchPoly" in sky, "the assumed-open area must be hatched on the desktop"
    assert "open above" in sky
    assert "activePaintMode() !== \"sky\"" in sky, \
        "sky mode must not stroke the fully-blocked 89-deg ring"
    assert "skyPanoLegend" in sky and "blocked by horizon" in sky
    assert "above band: open (assumed)" in sky
    assert 'id="skyPanoLegend"' in _read("static", "index.html")


def test_horizon_legend_and_outline_are_identical_across_apps():
    """Convergence pass: the Sky View horizon legend uses the SAME wording,
    colour and hatch stripes in both apps, sky mode never strokes the outline,
    and both editors' assumed-open areas are hatched."""
    for src, tree in ((_read("web", "app.js"), "web"),
                      (_read("static", "js", "skyview.js"), "static")):
        assert "blocked by horizon" in src, tree
        assert "above band: open (assumed)" in src, tree
        assert "#ff6b6b" in src, tree
    assert "rgba(210, 225, 255, .55)" in _read("web", "style.css")
    assert "rgba(210, 225, 255, .55)" in _read("static", "style.css")
    assert "activePaintMode() !== \"sky\"" in _read("static", "js", "skyview.js")
    assert "assumedOpenHatchPolys(p, W, H, lo, hi)" in _read("web", "horizon.js"), \
        "the web editor preview must hatch the assumed-open band in bin space"
    # the chart shading is the legend's red in BOTH apps (no third red)
    sky = _read("static", "js", "skyview.js")
    assert "rgba(255,107,107,.18)" in sky and "rgba(255,107,107,.75)" in sky
    assert "255,93,93" not in sky, "desktop sky view kept the old red"
    app = _read("web", "app.js")
    assert "rgba(255, 107, 107, .15)" in app and "rgba(255, 107, 107, .85)" in app
    assert "255, 80, 80" not in app, "web sky view kept the old red"


def test_catalog_type_palette_is_shared_and_web_canonical():
    """Owner decision (0.6.17): the WEB type labels/colors are canonical and
    shared through core/; the desktop shell adopts them. Pinned so an edit to
    one app's palette fails here instead of silently drifting."""
    core = _read("core", "catalog.js")
    for color in ("#ffd166", "#7cc4ff", "#9be0ff", "#7bf1a8", "#8fe3d9",
                  "#ff8fa3", "#c9b8ff", "#e0e6ff"):
        assert color in core, f"core palette lost {color}"
    for label in ("Globular cluster", "Planetary nebula", "Supernova remnant"):
        assert label in core, f"core labels lost {label}"
    util = _read("static", "js", "util.js")
    assert "TYPE_LABELS as TYPE_LABEL" in util and 'from "./core.js"' in util
    app = _read("web", "app.js")
    assert "TYPE_LABELS, TYPE_COLORS" in app and "from './core.js" in app
    assert "const TYPE_COLORS = {" not in app, "web kept a private palette copy"
    assert "const TYPE_LABELS = {" not in app, "web kept a private label copy"


def test_scrub_and_chart_ranges_use_the_shared_degeneracy_policy():
    """Phase 2 (Patch 2): every sunset->sunrise-derived range goes through
    core/planning.js::scrubWindowMs - sunset..sunrise only when that pair is
    coherent, else dusk..dawn, else the site-zoned fallback. Both shells must
    delegate; the old direct pair selections are gone."""
    core = _read("core", "planning.js")
    assert "export function scrubWindowMs" in core
    app = _read("web", "app.js")
    assert "E.scrubWindowMs(" in app
    assert "info.sunset || WS.wallToUtc" not in app, \
        "the detail chart kept its old pair selection"
    derive = _read("static", "js", "derive.js")
    assert "scrubWindowMs(" in derive
    assert "S.night.sunset || S.night.dusk" not in derive, \
        "the desktop scrub kept its old pair selection"


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
    assert app.count("clampSkyTime();") >= 3, \
        "clamp the scrub time at boot, on refresh AND on the viewFullDay toggle"
    assert "if (!S.site) return null;" in app, \
        "clampSkyTime must guard before the active site is known"


def test_desktop_planning_is_core_only():
    """Phase C: the desktop builds /api/night AND /api/object/{id} locally from
    the shared core. The old planning_client_compute flag and the server
    fallback are gone - neither consumer may reach for a server compute route,
    and the server may not carry the retired setting."""
    pc = _read("static", "js", "planning_client.js")
    assert "computeNightTracks" in pc
    assert "from \"./core.js\"" in pc
    night = _read("static", "js", "night.js")
    assert "buildClientNight" in night
    assert "planning_client_compute" not in night
    assert "/api/night" not in night, "the server planning route is gone"
    assert "falling back to the " not in night, "no server fallback may return"
    assert "requestAnimationFrame" in night, \
        "the busy chip must paint before the synchronous compute"
    detail = _read("static", "js", "detail.js")
    assert "buildClientDetail" in detail
    assert "planning_client_compute" not in detail
    assert not re.search(r"/api/object/\$\{id\}\?", detail), \
        "detail.js must not call the server planning route"
    assert "/api/object/${id}/image" in detail, \
        "the image route is IO and stays"
    server = _read("app", "server.py")
    assert "planning_client_compute" not in server, \
        "the retired flag must not survive in the API"


def test_catalog_edits_invalidate_the_planning_caches():
    """FIX-2 (review DS2): a custom-target add/delete must drop the planning
    caches - the metadata list + built payload in planning_client.js AND the
    worker's retained catalog - or a same-length change can bind tracks to the
    wrong object. setup.js::refreshCatalogMeta is the one edit path."""
    setup = _read("static", "js", "setup.js")
    assert "resetPlanningCaches()" in setup, \
        "refreshCatalogMeta must invalidate the planning caches"
    pc = _read("static", "js", "planning_client.js")
    assert "export function resetPlanningCaches" in pc
    assert "catalog ids mismatch" in pc, \
        "the worker response must be id-validated before binding"


def test_web_night_info_anchors_the_polar_fallback():
    """FIX-6 (review CR1): the night-info chip's fallback window must come from
    the selected night's SITE-noon anchor, never the wall clock."""
    app = _read("web", "app.js")
    assert "E.pickDarkWindow(info, nightAnchor(), siteNoon(nightAnchor()))" in app, \
        "renderNightInfo must pass the night anchor + site noon"


def test_batch3_web_hardening_wiring():
    """Batch 3 web items that are not browser-testable here (WB3/WB4/WB6/WB7):
    the reload path is shared, the cross-tab guard exists, an IDB upgrade
    blocked by another tab rejects instead of hanging, and a bundle without a
    pano section cannot wipe horizons. Behavioural guards for WB5 are in
    tests/js/pano_ui.mjs."""
    app = _read("web", "app.js")
    assert app.count("await reloadRigs();") >= 3, \
        "boot, renderSettings and reinitUserData must share reloadRigs()"
    assert "missing panorama section" in app
    hz = _read("web", "horizon.js")
    assert 'addEventListener("storage"' in hz, \
        "another tab's pano/prefs write must trigger a reload (WB4)"
    ws = _read("web", "webstore.js")
    assert "rq.onblocked" in ws, "a blocked IDB upgrade must reject (WB6)"


def test_desktop_crop_uses_the_shared_kept_band_helper():
    """The desktop crop must consume the shared core helper (kept band), not the
    retired fovOld*(1-w/W) removed-fraction formula, and the 45 deg floor lives
    once in core. The web side of the same contract is pinned by
    tests/js/pano_geom.mjs (formula cases) and tests/js/pano_ui.mjs (history)."""
    core = _read("core", "horizon.js")
    assert "export const CROP_MIN_FOV = 45" in core, "the 45 deg floor must live in core"
    assert "export function cropKeptBand(" in core
    pano = _read("static", "js", "pano.js")
    assert "cropKeptBand(" in pano, "the desktop crop must use the shared helper"
    assert "fovOld * (1 - c.w / W)" not in pano, \
        "the removed-fraction crop formula must be gone from the desktop"
    assert "keep everything outside" not in pano, "the stale crop comment must be gone"
    assert "Math.max(45, fovNew)" not in pano, "the 45 floor must not be inline"
    web = _read("web", "horizon.js")
    assert "cropPano(p," in web and "cropKeptBand" in web, \
        "the web editor must crop through the shared core helpers"
