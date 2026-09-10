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
            encoding="utf-8", timeout=120, cwd=str(ROOT),
            # a fixed zone keeps the harness deterministic (the web builds its
            # scan window from local-noon getters)
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
    # E1: even when sunset/sunrise EXIST but no twilight level is reached
    # (polar-twilight season), the fallback is the FIXED 20:00-04:00 window -
    # never sunset..sunrise, which is what the web used to return here (a
    # different "fallback" window than app/planning.py for the same night)
    twilight = got[3]
    assert twilight["level"] == "fallback", twilight
    assert twilight["dusk"].endswith("T20:00:00.000Z"), twilight
    assert twilight["dawn"].endswith("T04:00:00.000Z"), twilight
    # E2: the level the planner picks must be the level the "Dark time" card
    # reports - a civil/nautical night is never shown as an astronomical one
    assert got[2]["level"] == "civil" and got[2]["dusk"].endswith("T20:00:00.000Z")
    assert got[1]["level"] == "nautical" and got[1]["dusk"].endswith("T21:00:00.000Z")


def test_python_polar_twilight_uses_the_fixed_window():
    """E1 python side: in the polar-twilight band the sun SETS but never
    reaches -6 deg (Tromso mid-May: sunset 23:36 local) - planning.py still
    uses the fixed 20:00-04:00 window, never sunset..sunrise."""
    from app.planning import night_window
    win = night_window(2026, 5, 15, 120, 69.65, 18.96)
    assert win["level"] == "fallback"
    assert win["sunset"] is not None, "the sun does set - the fallback must win"
    assert (win["dusk"].hour, win["dusk"].minute) == (18, 0)   # 20:00 at UTC+2
    assert (win["dawn"].hour, win["dawn"].minute) == (2, 0)    # 04:00 next day
    assert win["dusk"].day == 15 and win["dawn"].day == 16
    assert win["dusk"].month == 5


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
            encoding="utf-8", timeout=120, cwd=str(ROOT),
            env={**os.environ, "TZ": zone})
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
            encoding="utf-8", timeout=120, cwd=str(ROOT),
            env={**os.environ, "TZ": browser_zone})
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

    # ... and the old browser-anchored scan is demonstrably broken here: its
    # crossings belong to the NEIGHBOURING night (dawn before dusk - the
    # noon-anchored 30 h scan never spans > 24 h, but a browser noon 12 h off
    # still resolves the wrong night's pair)
    assert res["browserAnchored"]["dawn"] < res["browserAnchored"]["dusk"], \
        res["browserAnchored"]


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
    far* the window edge misses, because the 48 h window started at
    browser-midnight, which in site-local time lands somewhere inside the
    neighbouring night. The scan is now anchored at the SITE's local noon
    (+ 30 h, exactly like planning.py), so the counter-example only survives
    in the east direction (browser noon ~12 h off the site's -> the
    neighbouring night's dawn-before-dusk pair); a site WEST of the browser
    (noon offset < ~2 h) accidentally resolves correctly, which is why the
    site-anchored anchor is the only stable rule.
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
    # documented counter-example: still wrong for a site EAST of the browser
    if "Honolulu" in browser_zone:
        assert res["browserAnchored"]["dawn"] < res["browserAnchored"]["dusk"], \
            (case, res["browserAnchored"])


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


# ================================================== E1/E2 remediation pins
# E1: the polar fallback must be the FIXED 20:00-04:00 window (in the site's
# zone), never sunset..sunrise - the web used to return the latter whenever the
# sun still crossed the horizon in the polar-twilight season, producing a
# different "fallback" window than app/planning.py for the same night.
# E2: the level the planner picks (astronomical/nautical/civil/fallback) is the
# window the web "Dark time" card must display - at nautical/civil latitudes
# the astronomical pair is empty, and the card used to say "no full dark night"
# while scoring ran on the nautical/civil window.

_POLAR_CASES = [
    # (date, tz_min_east, lat, lon, browser_zone, site_tz or None, level)
    ("2026-05-15", 120, 69.65, 18.96, "Europe/Oslo", None, "fallback"),
    ("2026-07-30", 120, 69.65, 18.96, "Europe/Oslo", None, "fallback"),
    ("2026-05-25", -480, 64.80, -147.70, "Europe/Oslo", "America/Anchorage",
     "fallback"),   # polar twilight, site EAST of the browser zone
    ("2026-06-21", 120, 78.22, 15.63, "Europe/Oslo", None, "fallback"),
    ("2026-06-21", 120, 59.50, 5.30, "Europe/Oslo", None, "civil"),
    ("2026-06-21", 120, 52.52, 13.40, "Europe/Oslo", None, "nautical"),
    ("2026-09-10", 120, 52.52, 13.40, "Europe/Oslo", None, "astronomical"),
    ("2026-12-21", 660, -33.87, 151.21, "Australia/Sydney", None,
     "astronomical"),
]


def _darkwindow(case, browser_zone):
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed - JS parity cannot be checked here")
    try:
        proc = subprocess.run(
            [node, str(HARNESS), "darkwindow"],
            input=json.dumps([case]), capture_output=True, text=True,
            encoding="utf-8", timeout=120, cwd=str(ROOT),
            env={**os.environ, "TZ": browser_zone})
    except OSError as exc:
        pytest.skip(f"cannot spawn node here: {exc}")
    assert proc.returncode == 0, proc.stderr[-1500:]
    return json.loads(proc.stdout)["windows"][0]


@pytest.mark.parametrize("date,tz,lat,lon,bzone,site_tz,level", _POLAR_CASES)
def test_web_dark_window_matches_planning_across_levels(
        date, tz, lat, lon, bzone, site_tz, level):
    """E1+E2: for polar day, polar twilight, civil/nautical/astronomical nights
    the web resolves the SAME window and level as app/planning.py. The
    fallback cases are asserted nearly exactly (both sides construct the fixed
    20:00-04:00 window); the crossing cases within the usual < 3 min scan
    tolerance. The window the planner scores on is the window the "Dark time"
    card must display, so the level is asserted too."""
    from app.planning import night_window
    case = {"date": date, "lat": lat, "lon": lon}
    if site_tz:
        case["tz"] = site_tz
    res = _darkwindow(case, bzone)
    y, m, d = (int(x) for x in date.split("-"))
    py = night_window(y, m, d, tz, lat, lon)

    assert res["level"] == level == py["level"], (date, res, py)
    tol = 60 if level == "fallback" else 180
    for key in ("dusk", "dawn"):
        got = datetime.fromisoformat(res[key].replace("Z", "+00:00"))
        want = py[key].replace(tzinfo=timezone.utc)
        assert abs((got - want).total_seconds()) < tol, \
            (date, key, got, want, res["level"])


# ================================================== E3 frame coverage
# "Frame coverage" means: how much of the frame the OBJECT spans (object/field,
# like the desktop tooltip "object spans X% of the frame"). The web used to
# invert the ratio (field/object, clamped 0-100), so M42 in a Seestar rig read
# 85% there and 139% on the desktop - same boolean, opposite number meaning.

_FRAME_WEB_CASES = [
    {"side": "web", "sizeAm": 90, "fovArcmin": 76.8},    # larger than frame
    {"side": "web", "sizeAm": 30, "fovArcmin": 76.8},    # smaller than frame
    {"side": "web", "sizeAm": 76.8, "fovArcmin": 76.8},  # exactly equal
    {"side": "web", "sizeAm": 0, "fovArcmin": 76.8},     # invalid size
    {"side": "web", "sizeAm": 90, "fovArcmin": 0},       # invalid fov
]
_FRAME_DESK_CASES = [
    {"side": "desktop", "sizeAm": "90x60", "fovW": 76.6, "fovH": 43.0},
    {"side": "desktop", "sizeAm": "30", "fovW": 76.6, "fovH": 43.0},
    {"side": "desktop", "sizeAm": "645x550", "fovW": 76.6, "fovH": 43.0},
    {"side": "desktop", "sizeAm": "76.6x43", "fovW": 76.6, "fovH": 43.0},
    {"side": "desktop", "sizeAm": "0", "fovW": 76.6, "fovH": 43.0},
]


def test_web_frame_coverage_is_object_over_field():
    """Absolute values, not just desktop/web equality: object span as % of the
    frame width, values above 100 = does not fit, null for invalid inputs."""
    res = _run_node("frame", _FRAME_WEB_CASES)
    assert [r["pct"] for r in res] == [117, 39, 100, None, None]


def test_desktop_frame_coverage_absolute():
    """Same definition, worse of BOTH axes: max(ow/fw, oh/fh) in arcminutes."""
    res = _run_node("frame", _FRAME_DESK_CASES)
    got = [(r["pct"], r["fits"]) for r in res]
    assert got == [(140, False), (70, True), (1279, False), (100, True),
                   (0, True)], got


# ================================================== E4 statusOf vs vis[]
def test_desktop_status_of_matches_visibility_predicate():
    """statusOf must say "Blocked" wherever the vis[] predicate blocks - the
    sky-mode ceil_top ceiling included. The old statusOf ignored ceil_top, so a
    balcony/overhang object showed "Observable" in the targets table while the
    very same sample was counted blocked."""
    cases = [
        {"alt": 40, "ceil": -90, "ceilTop": None, "minAlt": 25},   # clear
        {"alt": 50, "ceil": -90, "ceilTop": 30, "minAlt": 25},     # above ceiling
        {"alt": 30, "ceil": -90, "ceilTop": 30, "minAlt": 25},     # exactly at
        {"alt": 30.1, "ceil": -90, "ceilTop": 30, "minAlt": 25},   # just above
        {"alt": 29.9, "ceil": -90, "ceilTop": 30, "minAlt": 25},   # just below
        {"alt": 10, "ceil": 15, "ceilTop": None, "minAlt": 25},    # horizon obs
        {"alt": -5, "ceil": -90, "ceilTop": None, "minAlt": 25},   # below horizon
        {"alt": 20, "ceil": -90, "ceilTop": None, "minAlt": 25},   # too low
        {"alt": 25, "ceil": -90, "ceilTop": None, "minAlt": 25},   # at min alt
    ]
    codes = [r["code"] for r in _run_node("status", cases)]
    assert codes == ["vis", "blk", "blk", "blk", "vis",
                     "blk", "hor", "low", "vis"], codes


# ================================================== E5 min-altitude rule
def test_min_alt_rule_identical_desktop_web():
    """The authoritative threshold: explicit min_useful_alt wins, else
    17 + 2*bortle. Desktop derive.js::effectiveMinAlt and web
    horizon.js::effectiveMinAlt must agree on every state (the desktop used to
    freeze the boot value, the web re-derived live)."""
    cases = [
        {"bortle": 1, "explicit": False}, {"bortle": 4, "explicit": False},
        {"bortle": 7, "explicit": False}, {"bortle": 9, "explicit": False},
        {"bortle": 1, "explicit": True, "value": 20},
        {"bortle": 7, "explicit": True, "value": 30},
        {"bortle": 7, "explicit": True, "value": 5},   # boundary clamp case
    ]
    res = _run_node("minalt", cases)
    for c, r in zip(cases, res):
        assert r["desk"] == r["web"], (c, r)
    assert [r["desk"] for r in res] == [19, 25, 31, 35, 20, 30, 5]


# ================================================== E7 filter advice model
def test_filter_advice_model_identical():
    """Emission objects need narrowband (Ha OR OIII); a broadband-only object
    only warns when the user owns narrowband but no broadband. The web used a
    different type map and only ever showed an ownership badge - the model must
    agree with the desktop's filterAdvice."""
    cases = [
        {"otype": "nebula", "bb": True, "ha": False, "oiii": True},
        {"otype": "nebula", "bb": False, "ha": False, "oiii": False},
        {"otype": "planetary", "bb": False, "ha": True, "oiii": False},
        {"otype": "supernova_remnant", "bb": False, "ha": False, "oiii": False},
        {"otype": "galaxy", "bb": False, "ha": True, "oiii": False},
        {"otype": "galaxy", "bb": True, "ha": True, "oiii": False},
        {"otype": "galaxy", "bb": False, "ha": False, "oiii": False},
        {"otype": "open_cluster", "bb": True, "ha": False, "oiii": False},
        {"otype": "star_cloud", "bb": False, "ha": False, "oiii": False},
        {"otype": "asterism", "bb": False, "ha": False, "oiii": False},
        {"otype": "unknown", "bb": False, "ha": False, "oiii": False},
    ]
    res = _run_node("advice", cases)
    for c, r in zip(cases, res):
        assert r["desk"] == r["web"], (c, r)
    # absolute sanity on the shared model
    assert res[0]["web"] == {"ok": True, "text": "narrowband \u2713"}
    assert res[1]["web"] == {"ok": False, "text": "narrowband"}
    assert res[4]["web"] == {"ok": False, "text": "broadband \u2717"}
    assert res[5]["web"] is None and res[6]["web"] is None


# ================================================== E8 keyboard scrub steps
def test_scrub_step_constants_identical():
    """Plain arrow = 6 min (one night-grid sample), Shift = 60 min - the web
    had 60/10, the desktop 6/60, and the web comment claimed desktop parity."""
    res = _run_node("shortcut", [{}])
    assert res["desk"] == [6, 60], res
    assert res["web"] == [6, 60], res


# ================================================== 11.2 shared web scoring loop
_NIGHTSTATS_CASES = [
    # circumpolar object: clear every 6-min sample of the 2 h grid
    {"obj": {"ra_hours": 0, "dec_deg": 89}, "jd0": 2461294.315972222,
     "jd1": 2461294.3993055554, "step": 6 / 1440, "minAlt": 25,
     "lat": 52.5, "lon": 13.4},
    # never rises at this latitude
    {"obj": {"ra_hours": 0, "dec_deg": -89}, "jd0": 2461294.315972222,
     "jd1": 2461294.3993055554, "step": 6 / 1440, "minAlt": 25,
     "lat": 52.5, "lon": 13.4},
    # rises but never reaches the min altitude: above-horizon samples are
    # "blocked" but not "visible"
    {"obj": {"ra_hours": 0, "dec_deg": -30}, "jd0": 2461294.315972222,
     "jd1": 2461294.3993055554, "step": 6 / 1440, "minAlt": 25,
     "lat": 52.5, "lon": 13.4},
    # moon-aware: full moon, broadband base -> every visible sample penalized
    # by bortleMoonFactor(5) = 0.64 (moon at alt 30 az 180 keeps the separation
    # inside the 120' threshold for this geometry, so the penalty is exactly
    # 1 - 0.95*0.64 = 0.392 on every sample)
    {"obj": {"ra_hours": 0, "dec_deg": 89}, "jd0": 2461294.315972222,
     "jd1": 2461294.3993055554, "step": 6 / 1440, "minAlt": 25,
     "lat": 52.5, "lon": 13.4,
     "ctx": {"moonAware": True, "illum": 1, "moonAgeDays": 14.76,
             "filterType": "lrgb", "typeF": 1, "bortleF": 0.64,
             "moonAlt": [30] * 21, "moonAz": [180] * 21}},
    # a 60 deg obstruction profile blocks the whole circumpolar track
    {"obj": {"ra_hours": 0, "dec_deg": 89}, "jd0": 2461294.315972222,
     "jd1": 2461294.3993055554, "step": 6 / 1440, "minAlt": 25,
     "lat": 52.5, "lon": 13.4,
     "pano": {"paintMode": "obstacle", "fov": 360, "azOffset": 0,
              "profile": [60] * 720}},
]


def test_web_night_stats_absolute_values():
    """The ONE shared scoring loop (web/nightrank.js) behind Tonight, the
    catalog % column and the detail modal. Absolute values pin the loop; the
    E6 gate depends on visN - a target never clear during the night has
    visN == 0 and must not rank in "Best targets tonight"."""
    res = _run_node("nightstats", _NIGHTSTATS_CASES)
    c = res[0]
    assert (c["visN"], c["pct"], c["bestRun"], c["blocked"]) == (21, 100, 21, 0)
    assert c["bestStart"] == _NIGHTSTATS_CASES[0]["jd0"]
    never = res[1]
    assert (never["visN"], never["pct"], never["bestRun"]) == (0, 0, 0)
    low = res[2]
    assert (low["visN"], low["blocked"], low["blockedPct"]) == (0, 7, 33)
    moon = res[3]
    assert moon["visN"] == 21 and moon["pct"] == 100
    assert moon["sMoon"] == pytest.approx(0.392 * moon["sClassic"], abs=0.01)
    assert moon["sClassic"] > 0
    blocked = res[4]
    assert (blocked["visN"], blocked["blocked"], blocked["blockedPct"]) == \
        (0, 21, 100)


# ================================================== 11.1 moon illum/age/JD
def test_web_moon_illumination_age_julian_day_parity_with_python():
    """moonIllumination/moonAge/julianDay were never parity-pinned (the
    harness shipped only sun/moon ra/dec). The PYTHON side is now anchored
    absolutely (tests/test_astro.py: published 2026-08-12/28 phase instants +
    elongation derived from the ERFA-pinned positions), so this loop proves the
    web engine matches the reference rather than merely agreeing with a twin."""
    cases = _cases()
    got = _run_node("web", cases)
    for case, res in zip(cases, got):
        assert res["illum"] == pytest.approx(
            astro.moon_illumination(case["jd"]), abs=1e-9), case
        assert res["age"] == pytest.approx(
            astro.moon_age(case["jd"]), abs=1e-9), case
        # julianDay(dateFromJD(jd)) round-trips to the same instant
        assert res["jd_rt"] == pytest.approx(case["jd"], abs=1e-7), case


def test_web_detail_visibility_predicate_cannot_drift():
    """The web detail modal keeps its own sample loop (its 120-sample grid over
    sunset-1h..sunrise+1h is deliberately different from the 6-min dusk..dawn
    grid), but its per-sample visibility rule must stay the ONE shared
    predicate - nightrank.js::sampleVisible(), i.e.
    alt >= minAlt && alt > ceil && alt < (ceilTop ?? 90.5) - which nightStats
    (Tonight + catalog) already uses. This is a text-level pin on purpose:
    a silently edited inline copy (e.g. dropping the ceilTop ceiling) must fail
    here, while switching the detail loop to call sampleVisible() keeps it
    green."""
    app_js = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    shared = (ROOT / "web" / "nightrank.js").read_text(encoding="utf-8")
    inline = "alt >= minAlt && alt > ceil.ceil && alt < (ceil.ceilTop ?? 90.5)"
    assert inline in app_js or "sampleVisible(" in app_js, \
        "the detail loop's visibility predicate changed - it must stay " \
        "identical to nightrank.js::sampleVisible()"
    assert "alt >= minAlt && alt > ceil && alt < (ceilTop ?? 90.5)" in shared, \
        "nightrank.js::sampleVisible() changed - re-check the detail loop"
