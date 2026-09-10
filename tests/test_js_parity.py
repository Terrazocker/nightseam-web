"""Cross-engine parity: app/astro.py vs static/js/astro.js vs web/astro.js.

Three implementations of the same astronomy exist (the desktop synthesises
advanced-mode tracks in the browser, the web app recomputes everything
client-side). This module feeds one grid of coordinates/times through all of
them via Node and compares the numbers.

It is a PARITY test, not a correctness test: correctness is pinned
independently against the published Meeus equations in tests/test_astro.py.
Parity without those reference values is exactly how a wrong precession matrix
survived in all three engines at once.
"""

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app import astro
from app.nightcalc import longest_run

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / "tests" / "js" / "astro_parity.mjs"

# J2000, the 2026 planning epoch, 2100 and 1950 (both precession directions)
_JDS = [
    2451545.0,
    astro.julian_day(datetime(2026, 8, 22, 22, 0)),
    astro.julian_day(datetime(2100, 1, 1, 0, 0)),
    astro.julian_day(datetime(1950, 6, 15, 3, 0)),
]
# equatorial, a Messier field, far south, near the pole, negative-RA wraparound
_POINTS = [
    (0.0, 0.0), (83.63, 22.01), (250.42, 36.46), (210.80, -45.50),
    (15.0, 89.0), (359.5, -70.0),
]
_SITES = [(52.52, 13.40), (-33.87, 151.21)]


def _cases() -> list[dict]:
    out = []
    for jd in _JDS:
        for ra, dec in _POINTS:
            lat, lon = _SITES[len(out) % len(_SITES)]
            out.append({"jd": jd, "ra": ra, "dec": dec, "lat": lat, "lon": lon})
    return out


def _run_node(engine: str, cases):
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed - JS parity cannot be checked here")
    try:
        proc = subprocess.run(
            [node, str(HARNESS), engine],
            input=json.dumps(cases), capture_output=True, text=True,
            timeout=120, cwd=str(ROOT),
            # a fixed zone keeps the harness deterministic (the web builds its
            # scan window from local-midnight getters)
            env={**os.environ, "TZ": "UTC"})
    except OSError as exc:          # sandboxed environments deny pipe creation
        pytest.skip(f"cannot spawn node here: {exc}")
    assert proc.returncode == 0, f"harness failed: {proc.stderr[-2000:]}"
    return json.loads(proc.stdout)


@pytest.mark.parametrize("engine", ["desktop", "web"])
def test_precession_parity_with_python(engine):
    cases = _cases()
    got = _run_node(engine, cases)
    assert len(got) == len(cases)
    for case, res in zip(cases, got):
        ra, dec = astro._precess_j2000_to_date(case["ra"], case["dec"], case["jd"])
        assert res["ra"] == pytest.approx(ra, abs=1e-9), case
        assert res["dec"] == pytest.approx(dec, abs=1e-9), case


def test_web_inverse_precession_parity_with_python():
    cases = _cases()
    got = _run_node("web", cases)
    for case, res in zip(cases, got):
        ra, dec = astro._precess_j2000_to_date_inverse(
            case["ra"], case["dec"], case["jd"])
        assert res["inv_ra"] == pytest.approx(ra, abs=1e-9), case
        assert res["inv_dec"] == pytest.approx(dec, abs=1e-9), case


@pytest.mark.parametrize("engine", ["desktop", "web"])
def test_altaz_parity_with_python(engine):
    cases = _cases()
    got = _run_node(engine, cases)
    for case, res in zip(cases, got):
        alt, az = astro.altaz(case["ra"], case["dec"], case["jd"],
                              case["lat"], case["lon"])
        assert res["alt"] == pytest.approx(alt, abs=1e-9), case
        assert res["az"] == pytest.approx(az, abs=1e-9), case


def test_gmst_parity_with_python():
    cases = _cases()
    for case, res in zip(cases, _run_node("web", cases)):
        assert res["gmst"] == pytest.approx(astro.gmst_deg(case["jd"]), abs=1e-9)


def test_web_sun_and_moon_parity_with_python():
    """The web app computes sunrise/sunset itself, so its solar/lunar series
    must match the server's - including the date->J2000 conversion, which is
    what makes the precession error cancel for the sun and moon."""
    cases = _cases()
    for case, res in zip(cases, _run_node("web", cases)):
        sra, sdec = astro.sun_ra_dec(case["jd"])
        assert res["sun_ra"] == pytest.approx(sra, abs=1e-9), case
        assert res["sun_dec"] == pytest.approx(sdec, abs=1e-9), case
        mra, mdec = astro.moon_ra_dec(case["jd"])
        assert res["moon_ra"] == pytest.approx(mra, abs=1e-9), case
        assert res["moon_dec"] == pytest.approx(mdec, abs=1e-9), case


# ------------------------------------------------------- clear-window contract
# The client derives its own best window from the 6-min night grid; the detail
# modal uses the server's 4-min grid. Both must follow the same half-open
# contract as app/nightcalc.py's longest_run(), and the end boundary must
# always resolve to a REAL timestamp (the "--:--" / "NaNh NaNm" regression).

_STEP = 6


def _times(n: int) -> list[str]:
    """A 6-minute UTC grid starting at 18:00, long enough for `n` samples."""
    return [f"2026-09-10T{(18 * 60 + i * _STEP) // 60:02d}:"
            f"{(18 * 60 + i * _STEP) % 60:02d}:00" for i in range(n)]


_WINDOW_FLAGS = {
    "all_blocked": [False] * 12,
    "all_clear": [True] * 12,
    "single_at_start": [True] + [False] * 11,
    "single_in_middle": [False, False, True] + [False] * 9,
    "single_at_end": [False] * 11 + [True],
    "ends_at_last_sample": [False, True, True, True] + [False] * 8,
    "reaches_both_ends": [True, True] + [False] * 8 + [True, True],
    "competing_tie_first_wins": [True, True, False, True, True],
    "longest_wins": [True, False] + [True] * 5 + [False, True],
    "empty": [],
}

_WINDOW_CASES = [{"flags": f, "times": _times(len(f)), "step": _STEP}
                 for f in _WINDOW_FLAGS.values()]


def test_js_window_parity_with_python():
    got = _run_node("window", _WINDOW_CASES)
    for (name, flags), case, res in zip(_WINDOW_FLAGS.items(),
                                        _WINDOW_CASES, got):
        want = longest_run(flags)
        if want is None:
            assert res["best"] is None, name
            assert res["endISO"] is None, name
            continue
        assert res["best"] == list(want), name
        # the end boundary is a real time in both implementations, including a
        # run that reaches the last sample (end == n)
        assert res["endISO"] is not None, name
        if want[1] < len(case["times"]):
            assert res["endISO"] == case["times"][want[1]], name
        else:
            assert res["endISO"] > case["times"][-1], name


def test_js_window_end_is_never_undefined_for_a_full_grid_run():
    """The exact regression: a run ending at the last sample made the clients
    index times_iso[n] (undefined) and render "--:--"/"NaNh NaNm"."""
    res = _run_node("window", [{"flags": [True] * 12, "times": _times(12),
                                "step": _STEP}])[0]
    assert res["best"] == [0, 12]
    assert res["endISO"] == "2026-09-10T19:12:00"   # 18:00 + 12 * 6 min


# ------------------------------------------------- twilight-window selection
# The web used to score over the CIVIL window while the desktop prefers the
# astronomical one, so "% of night" and the ranking disagreed between the two
# apps for the same site and date. Both now follow app/planning.py's cascade:
# astronomical -> nautical -> civil -> sunset/sunrise.

def test_web_twilight_choice_rule():
    """Deterministic unit test of the cascade + polar fallback."""
    cases = [
        ({"astro": True, "naut": True, "civil": True, "sun": True}, "astronomical"),
        ({"naut": True, "civil": True, "sun": True}, "nautical"),
        ({"civil": True, "sun": True}, "civil"),
        ({"sun": True}, "fallback"),
        ({}, "fallback"),
        # a missing dawn still fills the pair from the same fallback rule
        ({"civil": True, "sun": True, "astro": False, "naut": False}, "civil"),
    ]
    got = _run_node("pick", [c[0] for c in cases])
    for (flags, want), res in zip(cases, got):
        assert res["level"] == want, flags
    # polar day: no crossing at all -> 20:00 -> 04:00 next day, like planning.py
    polar = got[4]
    assert polar["level"] == "fallback", polar
    assert polar["dusk"].endswith("T20:00:00.000Z"), polar
    assert polar["dawn"].endswith("T04:00:00.000Z"), polar


def test_python_twilight_choice_rule():
    """The same cascade in app/planning.py, on a real high-latitude case:
    Berlin never reaches -18 deg around the June solstice, so the night window
    must fall back to the nautical twilight."""
    from app.planning import night_window
    midsummer = night_window(2026, 6, 21, 120, 52.52, 13.40)
    assert midsummer["level"] == "nautical"
    # ... and a normal autumn night uses the astronomical one
    autumn = night_window(2026, 9, 10, 120, 52.52, 13.40)
    assert autumn["level"] == "astronomical"


@pytest.mark.parametrize("zone,case", [
    ("UTC", {"date": "2026-09-10", "lat": 51.48, "lon": 0.0}),
    ("UTC", {"date": "2026-06-21", "lat": 51.48, "lon": 0.0}),
    ("Australia/Sydney", {"date": "2026-12-21", "lat": -33.87, "lon": 151.21}),
])
def test_web_and_python_agree_on_the_real_dark_window(zone, case):
    """Cross-engine check on real sun geometry.

    The site is placed in the harness's own zone (TZ), which is also the zone
    the web anchors its calendar date in, so app/planning.py is given the same
    offset and both sides must resolve the same night."""
    from app.planning import night_window
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed - JS parity cannot be checked here")
    try:
        proc = subprocess.run(
            [node, str(HARNESS), "darkwindow"],
            input=json.dumps([case]), capture_output=True, text=True,
            timeout=120, cwd=str(ROOT), env={**os.environ, "TZ": zone})
    except OSError as exc:
        pytest.skip(f"cannot spawn node here: {exc}")
    assert proc.returncode == 0, proc.stderr[-1500:]
    res = json.loads(proc.stdout)["windows"][0]

    y, m, d = (int(x) for x in case["date"].split("-"))
    tz_min_east = -res["zoneOffsetMin"]        # getTimezoneOffset is minutes west
    py = night_window(y, m, d, tz_min_east, case["lat"], case["lon"])
    assert res["level"] == py["level"], (zone, case, res, py)
    for key in ("dusk", "dawn"):
        got = datetime.fromisoformat(res[key].replace("Z", "+00:00"))
        want = py[key].replace(tzinfo=timezone.utc)
        # the two scans use different resolutions (10-min scan + refinement vs
        # the web's own step), so allow a couple of minutes
        assert abs((got - want).total_seconds()) < 180, (zone, case, key, got, want)


# ------------------------------------------------------ scoring-model parity
# The web used to score with a civil twilight window, tonight's live moon
# illumination, a dead filter branch and a 10-minute grid, so the same night
# ranked differently in the two apps. The curves themselves now live in ONE
# place per app and this test compares them number by number.

def test_desktop_and_web_scoring_model_are_identical():
    res = _run_node("scoring", [])

    for otype, (desk, web) in res["MOON_TYPE_FACTOR"].items():
        assert desk == web, f"MOON_TYPE_FACTOR[{otype}]"
    for name, desk, web in res["sensitivity"]:
        assert desk == web, f"moonSensitivity({name})"
    for f, age, desk, web in res["minDist"]:
        assert desk == pytest.approx(web, abs=1e-12), (f, age)
    for f, age, illum, sep, desk, web in res["glow"]:
        assert desk == pytest.approx(web, abs=1e-12), (f, age, illum, sep)
    for g, t, b, desk, web in res["penalty"]:
        assert desk == pytest.approx(web, abs=1e-12), (g, t, b)
    for bortle, desk, web in res["bortle"]:
        assert desk == pytest.approx(web, abs=1e-12), bortle

    # sanity: the curves behave as documented (largest threshold at full moon,
    # continuous Bortle junction)
    dist = {(f, a): web for f, a, _desk, web in res["minDist"]}
    for f in ("narrowband", "oiii", "lrgb"):
        assert dist[(f, 14.76)] > dist[(f, 0)], f
    b = {x[0]: x[1] for x in res["bortle"]}
    assert abs(b[4] - b[3]) < 0.13 and b[9] == pytest.approx(1.12, abs=1e-9)

    # ... and the values themselves are anchored against the DOCUMENTED model
    _assert_scoring_anchors(res)


# ------------------------------------------- ABSOLUTE scoring-model anchors
# The parity loops above only prove the two copies agree. They cannot see a
# COORDINATED edit (the same constant changed in static/js/derive.js AND
# web/astro.js), and nothing in them says which numbers are the right ones.
# The values below are derived BY HAND from the model as documented in both
# files - not read out of either implementation - so one changed constant
# breaks them even when both copies are changed together.
#
#   moonMinDist(f, age) = BASE / (1 + ((0.5 - age/29.53)/0.333)^2), BASE 60/90/120
#     age 0 (new):   (0.5/0.333)^2 = 1.501502^2 = 2.254507 -> BASE / 3.254507,
#                    i.e. the "smallest at new = BASE/3.25" the source comment
#                    states:  60 -> 18.4360   90 -> 27.6540   120 -> 36.8719
#     age 14.76 (full): frac 14.76/29.53 = 0.49983068, so (0.00016932/0.333)^2
#                    = 2.585e-7 -> BASE / 1.00000026, i.e. 60 / 90 / 120
#   effectiveMoonGlow(illum, sep, f, age) = illum * max(0, 1 - max(0, sep-minDist)/180)
#     lrgb at full moon (minDist 120), sep 179.9, illum 1:
#                    1 - (179.9-120)/180 = 1 - 0.3327778 = 0.6672222
#     narrowband at new moon (minDist 18.4360), sep 45, illum 1:
#                    1 - (45-18.4360)/180 = 1 - 0.1475778 = 0.8524222
#     oiii at new moon, sep 0 (inside the threshold) -> distDeg 0 -> glow = illum
#   moonPenalty(glow, typeF, bortleF) = max(0.05, 1 - 0.95*glow*typeF*bortleF)
#     (1, 1.6, 1.12): 0.95*1.792 = 1.7024 -> 1-1.7024 < 0 -> the 0.05 FLOOR
#     (0.3, 0.5, 0.3): 0.95*0.045 = 0.04275 -> 0.95725
#     (1, 1, 0.64):   0.95*0.64 = 0.608    -> 0.392
#   bortleMoonFactor: 1..3 = 0.25 + 0.05*bortle, then 4..9 = 0.40 + 0.12*(b-3)
#     -> 0.30 0.35 0.40 | 0.52 0.64 0.76 0.88 1.00 1.12   (junctions: 1->2 and
#        the CONTINUOUS 3/4 step 0.40 -> 0.52)
_ANCHOR_MIN_DIST = {
    ("narrowband", 0): 18.4360, ("oiii", 0): 27.6540, ("lrgb", 0): 36.8719,
    ("narrowband", 14.76): 60.0, ("oiii", 14.76): 90.0, ("lrgb", 14.76): 120.0,
}
_ANCHOR_GLOW = {
    ("lrgb", 14.76, 1.0, 179.9): 0.6672222,
    ("narrowband", 0, 1.0, 45.0): 0.8524222,
    ("oiii", 0, 0.62, 0.0): 0.62,
}
_ANCHOR_PENALTY = {
    (1.0, 1.6, 1.12): 0.05,          # the documented floor
    (0.3, 0.5, 0.3): 0.95725,
    (1.0, 1.0, 0.64): 0.392,
}
_ANCHOR_BORTLE = {1: 0.30, 2: 0.35, 3: 0.40, 4: 0.52, 5: 0.64,
                  6: 0.76, 7: 0.88, 8: 1.00, 9: 1.12}
_ANCHOR_TYPE_FACTOR = {
    "nebula": 1.6, "supernova_remnant": 1.6, "planetary": 1.3,
    "star_cloud": 1.1, "galaxy": 0.8, "open_cluster": 0.55,
    "globular": 0.5, "asterism": 0.55,
}


def _assert_scoring_anchors(res: dict) -> None:
    """Assert the harness output against the hand-derived values above, for
    BOTH engines (a coordinated change breaks either side)."""
    min_dist = {(r[0], r[1]): (r[2], r[3]) for r in res["minDist"]}
    glow = {(r[0], r[1], r[2], r[3]): (r[4], r[5]) for r in res["glow"]}
    penalty = {(r[0], r[1], r[2]): (r[3], r[4]) for r in res["penalty"]}
    bortle = {r[0]: (r[1], r[2]) for r in res["bortle"]}

    for (f, age), want in _ANCHOR_MIN_DIST.items():
        for got, side in zip(min_dist[(f, age)], ("desktop", "web")):
            assert got == pytest.approx(want, abs=1e-3), \
                f"{side} moonMinDist({f}, {age}) = {got}, model says {want}"
    for (f, age, illum, sep), want in _ANCHOR_GLOW.items():
        for got, side in zip(glow[(f, age, illum, sep)], ("desktop", "web")):
            assert got == pytest.approx(want, abs=1e-6), \
                f"{side} effectiveMoonGlow({illum}, {sep}, {f}, {age}) = {got}"
    for (g, t, b), want in _ANCHOR_PENALTY.items():
        for got, side in zip(penalty[(g, t, b)], ("desktop", "web")):
            assert got == pytest.approx(want, abs=1e-9), \
                f"{side} moonPenalty({g}, {t}, {b}) = {got}"
    for bortle_n, want in _ANCHOR_BORTLE.items():
        for got, side in zip(bortle[bortle_n], ("desktop", "web")):
            assert got == pytest.approx(want, abs=1e-12), \
                f"{side} bortleMoonFactor({bortle_n}) = {got}"
    # the floor is reached by a real (glow, type, bortle) combination, not only
    # asserted at the arithmetic boundary
    assert min(min(v) for v in penalty.values()) == pytest.approx(0.05, abs=1e-12)
    for otype, want in _ANCHOR_TYPE_FACTOR.items():
        for got, side in zip(res["MOON_TYPE_FACTOR"][otype], ("desktop", "web")):
            assert got == pytest.approx(want, abs=1e-12), \
                f"{side} MOON_TYPE_FACTOR[{otype}] = {got}"
    # an unknown type falls back to 1.0 in both engines
    unknown = {r[0]: r[1:] for r in res["sensitivity"]}["unknown"]
    assert list(unknown) == [1.0, 1.0]


# ------------------------------------------------------ cross-timezone planning
# The open question from the audit: the web anchored its 48 h scan at
# BROWSER-local midnight while the site lived in another zone. Measured below
# (see test_web_cross_timezone_anchoring_is_site_based): the old anchor
# produced a >24 h "night" with the site either EAST or WEST of the browser.
# The open question from the audit: the web anchored its 48 h scan at
# BROWSER-local midnight while the site lived in another zone. Derived
# condition: the window, expressed in site-local time, is
#     [D 00:00 - d, D+2 00:00 - d]   with d = siteOffset - browserOffset,
# so once d exceeds ~+7.7 h (site far EAST of the browser) the previous
# evening's dusk is inside the window and sunCrossings' "first descending /
# last ascending" rule returns [dusk(D-1), dawn(D+1)] - a ~39 h "night".
# Measuring it settles the sign disagreement in the earlier review.

def _crosszone(case, browser_zone):
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed - JS parity cannot be checked here")
    try:
        proc = subprocess.run(
            [node, str(HARNESS), "crosszone"],
            input=json.dumps([case]), capture_output=True, text=True,
            timeout=120, cwd=str(ROOT), env={**os.environ, "TZ": browser_zone})
    except OSError as exc:
        pytest.skip(f"cannot spawn node here: {exc}")
    assert proc.returncode == 0, proc.stderr[-1500:]
    return json.loads(proc.stdout)[0]


def test_web_cross_timezone_site_resolves_its_own_night():
    """Site far EAST of the browser (Honolulu browser, Berlin site)."""
    from app.planning import night_window
    case = {"date": "2026-12-05", "lat": 52.52, "lon": 13.40,
            "tz": "Europe/Berlin"}
    res = _crosszone(case, "Pacific/Honolulu")

    # the site-anchored scan (what app.js passes now) must equal the desktop's
    py = night_window(2026, 12, 5, 60, case["lat"], case["lon"])
    assert res["site"]["level"] == py["level"] == "astronomical"
    for key in ("dusk", "dawn"):
        got = datetime.fromisoformat(res["site"][key].replace("Z", "+00:00"))
        want = py[key].replace(tzinfo=timezone.utc)
        assert abs((got - want).total_seconds()) < 180, (key, got, want)
    assert res["site"]["spanH"] < 20, res["site"]

    # ... and the old browser-anchored scan is demonstrably broken here: it
    # spans a day and a half, which is what the audit reported
    assert res["browserAnchored"]["spanH"] > 24, res["browserAnchored"]


@pytest.mark.parametrize("browser_zone,case", [
    # site EAST of the browser
    ("Pacific/Honolulu", {"date": "2026-12-05", "lat": 52.52, "lon": 13.40,
                          "tz": "Europe/Berlin"}),
    # site WEST of the browser
    ("Europe/Berlin", {"date": "2026-12-05", "lat": 40.71, "lon": -74.01,
                       "tz": "America/New_York"}),
])
def test_web_cross_timezone_anchoring_is_site_based(browser_zone, case):
    """Cross-zone planning must resolve the SITE's night in both directions.

    Measured outcome (resolving the reviewers' disagreement about the sign):
    the old browser-anchored scan produced a >24 h "night" for a site EAST of
    the browser AND for a site WEST of it - the direction only changes *how
    far* the window edge misses, because the 48 h window starts at
    browser-midnight, which in site-local time lands somewhere inside the
    neighbouring night. Only the site-anchored scan (siteLocalNoon) is stable.
    """
    from app.planning import night_window
    res = _crosszone(case, browser_zone)
    y, m, d = (int(x) for x in case["date"].split("-"))

    py = night_window(y, m, d, res["siteOffsetMin"], case["lat"], case["lon"])
    assert res["site"]["level"] == py["level"], (case, res["site"], py)
    for key in ("dusk", "dawn"):
        got = datetime.fromisoformat(res["site"][key].replace("Z", "+00:00"))
        want = py[key].replace(tzinfo=timezone.utc)
        assert abs((got - want).total_seconds()) < 180, (case, key, got, want)
    assert res["site"]["spanH"] < 20, (case, res["site"])
    # the superseded browser-anchored behaviour, kept in the harness as the
    # documented counter-example
    assert res["browserAnchored"]["spanH"] > 24, (case, res["browserAnchored"])


# --------------------------------------------------- web sinks stay escaped
# TEXT-LEVEL on purpose: both sinks below build HTML from template literals in
# a browser-only view, and there is no browser test harness for web/ (headless
# Chrome cannot start under this environment - see AGENTS.md). The project
# already pins this class of invariant textually in tests/test_ui_invariants.py;
# the point is that an object type or a panorama id can arrive from an imported
# setup ZIP and is therefore untrusted, so the esc() wrapper must not be
# dropped or bypassed by a NEW interpolation.

def _template_interpolations(js: str, needle: str) -> list[str]:
    """Bodies of `${...}` interpolations whose body matches `needle` (the
    templates here carry no nested braces inside those bodies)."""
    return [m.group(1).strip() for m in
            re.finditer(r"\$\{([^{}]*" + needle + r"[^{}]*)\}", js)]


def test_web_type_and_panorama_id_sinks_stay_escaped():
    _assert_web_sinks_escaped(
        (ROOT / "web" / "app.js").read_text(encoding="utf-8"),
        (ROOT / "web" / "horizon.js").read_text(encoding="utf-8"))


def _assert_web_sinks_escaped(app_js: str, hz: str) -> None:
    otype = _template_interpolations(app_js, r"TYPE_LABELS\[[^{}]*\.otype\]")
    escaped = [e for e in otype if e.startswith("esc(")]
    # targets-table type cell, detail-dialog type row, custom-target tag
    assert len(escaped) >= 3, otype
    # the one interpolation without an inline esc() is the sky-map tooltip,
    # which escapes its whole composed string at the sink
    assert [e for e in otype if not e.startswith("esc(")] == \
        ["TYPE_LABELS[best.o.otype] || best.o.otype"], otype
    assert "tip.innerHTML = `<b>${esc(extra)}</b>" in app_js

    pano_ids = _template_interpolations(hz, r"p\.id")
    # `${p.id === active ? ...}` only decides `checked`; it emits no id
    emitted = [e for e in pano_ids if not e.startswith("p.id ===")]
    assert emitted, "the panorama-id render path vanished - update this pin"
    assert all(e == "esc(p.id)" for e in emitted), emitted
    # ... and both id-bearing attributes are still the escaped form
    assert 'data-id="${esc(p.id)}"' in hz
    assert 'data-del="${esc(p.id)}"' in hz

_SIZE_CASES = [
    [size, unit]
    for unit in ("arcmin", "arcsec", "deg")
    for size in (None, "", "330", "110", "50", "1.4", "9.3", "0.05",
                 "645x550", "120x80.0", "6x4", "1000", "0.5")
]


def test_web_size_column_matches_desktop():
    """Catalog sizes are arcminutes shown in ONE unit - single-axis too.

    The web used to reformat only "NxM" strings and echo everything else
    verbatim, so the 961 single-axis entries (Hyades 330, Pleiades 110, Ring
    Nebula 1.4, IC planetaries ...) lost their unit AND ignored the
    arcmin/arcsec/deg setting, while the desktop showed "330'"; the same
    strict regex also left the Frame % column empty for those objects.
    web/format.js is the web twin of static/js/util.js::fmtSize.
    """
    got = _run_node("size", _SIZE_CASES)
    assert len(got) == len(_SIZE_CASES)
    bad = [c for c in got if not c["ok"]]
    assert not bad, bad[:6]
