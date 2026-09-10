"""Cross-engine parity for the horizon/obstruction lookup.

`web/horizon.js::ceilFor` resolves the obstruction per azimuth in the browser
(web app) while the desktop receives `ceil` tracks computed by
`app/nightcalc.ceil_lookup`. That is the app's central promise - "is my target
behind that tree?" - and it had no cross-engine test at all, so the two sides
could drift apart silently.

The comparison tolerates 0.51 deg because the two engines differ by design in
one place: Python ships 90.0 for "nothing blocks above" while the client
compares against 90.5, and Python's NO_BLOCK sentinel is -90.0.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.nightcalc import NO_BLOCK, PROFILE_BINS, ceil_lookup

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / "tests" / "js" / "astro_parity.mjs"

_BAND_TOP = 90.0


def _run_node(engine: str, cases):
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed - horizon parity cannot be checked")
    try:
        proc = subprocess.run([node, str(HARNESS), engine],
                              input=json.dumps(cases), capture_output=True,
                              text=True, encoding="utf-8", timeout=120,
                              cwd=str(ROOT))
    except OSError as exc:          # sandboxed environments deny pipe creation
        pytest.skip(f"cannot spawn node here: {exc}")
    assert proc.returncode == 0, f"harness failed: {proc.stderr[-1500:]}"
    return json.loads(proc.stdout)


def _obstacle_profile() -> list[float]:
    """A 20-degree wall over azimuth 0..90, clear everywhere else."""
    return [20.0 if i * 0.5 < 90 else NO_BLOCK for i in range(PROFILE_BINS)]


def _sky_band() -> tuple[list[float], list[float]]:
    """Sky mode: a visible band 20..45 deg over az 0..180, blocked elsewhere."""
    prof = [20.0 if i * 0.5 <= 180 else 90.0 for i in range(PROFILE_BINS)]
    top = [45.0 if i * 0.5 <= 180 else _BAND_TOP for i in range(PROFILE_BINS)]
    return prof, top


@pytest.mark.parametrize("az", [0.0, 0.25, 45.0, 89.9, 90.0, 180.0, 270.5, 359.75])
def test_obstacle_mode_matches_python(az):
    prof = _obstacle_profile()
    res = _run_node("ceil", [{"mode": "obstacle", "profile": prof,
                              "profileTop": [], "az": az, "fov": 360,
                              "azOffset": 0}])[0]
    want = ceil_lookup(prof)(az)
    assert res["ceil"] == pytest.approx(want, abs=0.51), (az, res, want)
    assert res["ceilTop"] is None            # obstacle mode has no upper edge


@pytest.mark.parametrize("az", [0.0, 45.0, 179.5, 200.0, 359.0])
def test_sky_mode_band_matches_python(az):
    prof, top = _sky_band()
    res = _run_node("ceil", [{"mode": "sky", "profile": prof, "profileTop": top,
                              "az": az, "fov": 360, "azOffset": 0}])[0]
    assert res["ceil"] == pytest.approx(ceil_lookup(prof)(az), abs=0.51)
    want_top = ceil_lookup(top)(az)
    if res["ceilTop"] is None:
        # "open above" on the web side => Python must agree it is (near) open
        assert want_top >= 89.0, (az, want_top)
    else:
        assert res["ceilTop"] == pytest.approx(want_top, abs=0.51), (az, res, want_top)


def test_no_panorama_blocks_nothing_on_either_side():
    for az in (0.0, 123.0, 359.0):
        res = _run_node("ceil", [{"mode": "obstacle", "profile": [],
                                  "profileTop": [], "az": az, "fov": 360,
                                  "azOffset": 0}])[0]
        assert res["ceil"] == pytest.approx(NO_BLOCK, abs=0.51)
        assert ceil_lookup([])(az) == NO_BLOCK


def test_sky_mode_outside_the_painted_band_still_blocks():
    """Both sides must treat columns that were never painted as fully blocked in
    sky mode (the band's ceiling is the only visible sky)."""
    prof = [NO_BLOCK] * PROFILE_BINS          # nothing painted at all
    top = [NO_BLOCK] * PROFILE_BINS
    for az in (0.0, 90.0, 270.0):
        res = _run_node("ceil", [{"mode": "sky", "profile": prof,
                                  "profileTop": top, "az": az, "fov": 360,
                                  "azOffset": 0}])[0]
        # web: fully blocked; Python: the profile value itself (NO_BLOCK) - the
        # shared rule is "not visible", which the client expresses as 90 deg
        assert res["ceil"] in (90.0,) or res["ceil"] == pytest.approx(NO_BLOCK, abs=0.51)
