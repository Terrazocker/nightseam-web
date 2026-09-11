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
    assert "export function popularityFactor" in _read("static", "js", "derive.js")


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
