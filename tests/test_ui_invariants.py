"""UI invariants: popularity is a scoring input, and its SCORE is never visible.

The owner rule (0.6.30): the catalog may expose an ORDERING - the "Tier" column
(A-F, from rank bands in `core/catalog.js`) is the default sort - but the
The popularity source NUMBER itself may never be rendered, in any view: no score cell, no
score in a tooltip, no detail row, no filter chip. These are text assertions on
the two UIs: cheap, and they fail loudly when a future edit leaks the stat.

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


def test_web_catalog_shows_a_tier_and_never_the_popularity_score():
    """The Tier column is allowed (owner decision, 0.6.30) - the SCORE is not.

    `th('tier'` must be the sortable column, the letters must come from the
    shared core helper, and nothing may interpolate the raw number into the DOM.
    `${o.popularity` is the leak shape that matters: `o.popularity` itself is
    fine (it is a ranking input), rendering it is not.
    """
    js = _read("web", "app.js")
    assert "th('tier', 'Tier')" in js, "the catalog must offer the Tier column"
    assert "assignPopularityTiers" in js, "tiers must come from core, not a copy"
    assert "tier-badge" in js, "the tier cell must render the letter"
    assert "sort: 'tier'" in js, "the tier sort is the default (owner decision)"
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
    # DE-04 changed this contract on purpose: select() now FLUSHES the captured
    # payload instead of cancelling the timer (the cancel silently dropped a
    # gesture whose 900 ms window had not elapsed). The ownership test below pins
    # the flush and the unload guard; the cancel itself must be gone.
    assert "await flushSave();" in pano
    assert "if (Pano.saveTimer) { clearTimeout(Pano.saveTimer); Pano.saveTimer = null; }" not in pano
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
    select_body = _js_body(pano, "async function select(rec) {")
    assert "invalidateMask();" in select_body, (
        "DE-02: select() must drop the previous panorama's mask cache")
    assert "await flushSave();" in select_body, (
        "DE-04: a panorama switch must FLUSH the pending auto-save, not drop it")
    assert "clearTimeout(Pano.saveTimer)" not in select_body, (
        "DE-04: the cancel-only path is what silently lost the edit")
    flush_body = _js_body(pano, "async function flushSave() {")
    assert "S.panos[idx] = upd;" in flush_body, (
        "DE-05: refresh ONLY the record that was saved, never the whole array")
    assert "if (Pano.cur === job.rec)" in flush_body, (
        "DE-05: never rebind a record the user has already left")
    assert 'addEventListener("pagehide"' in pano and "keepalive: true" in pano, (
        "DE-04: the unload guard must survive the window close")
    util = _read("static", "js", "util.js")
    toast_body = _js_body(util, "export function toast(msg")
    assert "stopPropagation()" in toast_body, (
        "DE-08: the toast's dismiss button must not bubble to the toast body")
    wiz = _read("static", "js", "wizard.js")
    assert "_formState = {};" in _js_body(wiz, "export function openWizard() {"), (
        "DE-07: a wizard replay must not reuse the first run's coordinates")


def test_sky_view_outline_is_obstacle_mode_only_in_both_apps():
    """WE-01: in sky mode a fully blocked column sits at 90 deg, which the radius
    mapping sends to the zenith CENTRE - so stroking the silhouette alternated
    between the painted band edge and the centre (a spurious inner ring with
    radial connectors). AGENTS.md requires the outline to be obstacle-mode only in
    BOTH apps; the desktop gates it, and the web Sky View did not."""
    assert "if (pano.paintMode !== 'sky') {" in _read("web", "app.js"), (
        "WE-01: the web Sky View must not stroke the silhouette in sky mode")
    assert 'if (activePaintMode() !== "sky") {' in _read("static", "js", "skyview.js"), (
        "WE-01: the desktop gate this parity relies on")


def test_desktop_weather_drops_a_superseded_response():
    """DE-06: the weather panel is labelled with the CURRENT site, so a response
    that lands after the user changed the site must be dropped. It used to be
    written unconditionally - one site's name over another site's numbers - and a
    late failure nulled a newer success."""
    body = _js_body(_read("static", "js", "weather.js"),
                    "async function loadWeather() {")
    assert "const gen = ++_wxGen;" in body
    assert body.count("if (gen !== _wxGen) return;") >= 2, (
        "DE-06: the success AND the failure path must drop a stale response")
    assert "if (gen === _wxGen) WX_STATE.loading = false;" in body, (
        "DE-06: a superseded request must not clear the newer one's spinner")


def test_desktop_pref_handlers_survive_a_failed_settings_post():
    """DE-09: `api()` toasts and RETHROWS. A preference handler that mutates
    `S.cfg` and then awaits the POST without catching skipped its own re-render,
    so the visible ranking/list kept the OLD preference while the control showed
    the new one. Every await preceded by an `S.cfg.` write must be guarded."""
    for parts in (("static", "js", "header.js"), ("static", "js", "setup.js")):
        lines = _read(*parts).splitlines()
        for i, line in enumerate(lines):
            if 'await api("/api/settings"' not in line:
                continue
            mutates = any(prev.strip().startswith("S.cfg.")
                          for prev in lines[max(0, i - 10):i])
            if not mutates:
                continue
            window = "\n".join(lines[i:i + 8])
            assert "catch" in window, (
                f"DE-09: {parts[-1]}:{i + 1} mutates S.cfg then awaits "
                "/api/settings with no catch - a failed save would skip the "
                "re-render")


def test_desktop_loupe_and_chart_hover_invariants():
    """DE-10 / DE-11 / DE-12: three "looks right, is wrong" one-liners.

    The loupe mapped the cursor into the magnifier by the sample SCALE instead of
    its DESTINATION size (so the marker never marked the sampled pixel); both
    charts compared the hover by OBJECT identity against a freshly rebuilt point
    array, which is always true (a full repaint - and a canvas reallocation - per
    mousemove); and each legend's chips were rendered once, so a type toggled in
    the other chart's legend was never reflected."""
    pano = _read("static", "js", "pano.js")
    loupe = _js_body(pano, "function updateLoupe() {")
    assert "lcv.width / sw" in loupe and "lcv.height / sw" in loupe, (
        "DE-10: the loupe marker must map by the destination size")
    assert "/ Z;" not in loupe, "DE-10: the old sample-scale mapping is back"
    sky = _read("static", "js", "skyview.js")
    skymap = _read("static", "js", "skymap.js")
    assert "if (key !== prev) { SKY_HOVER = best; renderSky(); }" in sky, (
        "DE-11: the sky hover guard must compare by value, not object identity")
    assert "if (key !== prev) { SM_HOVER = best; renderSkyMap(); }" in skymap, (
        "DE-11: the sky-map hover guard must compare by value")
    assert "syncTypeLegend();" in _js_body(sky, "export function renderSky() {"), (
        "DE-12: the Sky View legend must resync on render")
    assert "syncTypeLegend();" in _js_body(skymap, "export function renderSkyMap() {"), (
        "DE-12: the Sky Map legend must resync on render")


def test_desktop_dialog_and_worker_invariants():
    """DE-13 / DE-14 / DE-15.

    The library-edit dialog was the only modal with no Escape path; the detail
    modal's "closed while fetching" guard compared against an identity no close
    path ever cleared (so a full-size blob stayed decoded for the session); and
    the worker allocated and filled a flat `ceil` buffer that was never posted or
    transferred (~23 MB per advanced-mode build)."""
    arch = _read("static", "js", "archive.js")
    bind = _js_body(arch, "function bindArchive() {")
    assert 'addEventListener("keydown"' in bind and "Escape" in bind, (
        "DE-13: the library-edit dialog must close on Escape like every other one")
    detail = _read("static", "js", "detail.js")
    assert "S.currentId = null;" in _js_body(detail, "function closeDetail() {"), (
        "DE-14: closing must DROP the identity so an in-flight fetch sees it")
    assert detail.count("closeDetail();") >= 3, (
        "DE-14: every close path must go through closeDetail()")
    worker = _read("static", "js", "planning_worker.js")
    assert "const ceil = new Float64Array" not in worker, (
        "DE-15: the dead flat ceiling buffer is back")
    assert "ceil[base + i]" not in worker
    assert "ceil: ceils" in worker, (
        "DE-15: the per-object ceilings (prefs rescore) must stay")


def test_desktop_shows_a_tier_and_never_the_popularity_score():
    """The desktop gets the SAME method as the web (0.6.30): a Tier column and a
    tier sort that is the default, built from the shared core helpers - while the
    The popularity source NUMBER stays unrendered, exactly like the web."""
    html = _read("static", "index.html")
    js = _read("static", "js", "targets.js")
    assert 'value="tier"' in html, "the desktop must offer the tier sort"
    assert html.index('value="tier"') < html.index('value="score"'), (
        "the tier sort must be the FIRST option, i.e. the default")
    assert "<th>Tier</th>" in html, "the desktop must offer the Tier column"
    assert "assignPopularityTiers" in js, "tiers must come from core, not a copy"
    assert "tierbadge" in js, "the tier cell must render the letter"
    assert 'value="popularity"' not in html
    assert "popularity:" not in js                   # no score comparator key
    for forbidden in ("${m.popularity", "${o.popularity", "<dt>Popularity</dt>"):
        assert forbidden not in js, f"targets.js still shows popularity: {forbidden!r}"


def test_desktop_frame_cell_is_green_until_it_needs_a_mosaic():
    """0.6.30: the desktop's Frame pill is GREEN while the object fits in one
    frame and AMBER once it needs a mosaic - the web's rule. The old ramp went red
    above 100% (flagging a mosaic as an error) and amber above 85%."""
    derive = _read("static", "js", "derive.js")
    assert 'cov.pct > 100 ? "st-low" : "st-vis"' in derive
    assert "cov.pct > 85" not in derive, "the 85% warning band is gone"


def test_min_visibility_slider_gates_both_target_lists():
    """0.6.30: the Min-visibility threshold is the USER's gate, in the
    targets/catalog toolbar of BOTH apps, default 1% (drop what is never visible)
    and 0 = off. It gates the LIST only: the desktop keeps it out of
    `passesFilters` because the sky chart feeds off that, and the web stands it
    down while a search is active (the catalog is also a lookup tool)."""
    web = _read("web", "app.js")
    assert 'id="cat-minvis"' in web and "function minVis()" in web
    assert "v.pct >= mv" in web, "the web gate must compare against the threshold"
    assert "mv > 0 && !q" in web, "the web gate must stand down while searching"
    desk_js = _read("static", "js", "targets.js")
    desk_html = _read("static", "index.html")
    assert 'id="fMinVis"' in desk_html and 'id="fMinVisVal"' in desk_html
    assert "function minVisPct()" in desk_js and "function minVisHides(o)" in desk_js
    assert "o.obs_pct < mv" in desk_js
    pf = _js_body(desk_js, "export function passesFilters(m, o) {")
    assert "minVisHides" not in pf, (
        "the desktop gate must NOT live in passesFilters: skyview.js uses it")


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
