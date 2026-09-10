"""UI invariants: popularity is a scoring input, never something you can see.

The popularity source scores still rank results (a silent TIEBREAKER: visibility score
decides, popularity only separates equal scores), but no view may render the
number or offer it as a criterion - no catalog column, no detail row, no filter
chip, no sort mode. These are text assertions on the two UIs: cheap, and they
fail loudly when a future edit re-surfaces the stat.
"""

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
