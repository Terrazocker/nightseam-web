"""JavaScript behaviour tests that do not fit the Python mirrors.

These drive the real browser modules through Node with a stub DOM/fetch, which
is the smallest practical harness for async UI invariants. They skip cleanly
when Node is unavailable or cannot be spawned (restricted sandboxes deny the
pipe that captures its output).
"""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def run_node_harness(script: str):
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed - JS behaviour cannot be checked here")
    try:
        proc = subprocess.run([node, str(ROOT / "tests" / "js" / script)],
                              capture_output=True, text=True, encoding="utf-8",
                              timeout=180, cwd=str(ROOT))
    except OSError as exc:          # sandboxed environments deny pipe creation
        pytest.skip(f"cannot spawn node here: {exc}")
    assert proc.returncode == 0, (
        f"{script} failed:\n{proc.stdout[-1500:]}\n{proc.stderr[-1500:]}")
    return proc.stdout


def test_night_load_supersession_invariant():
    """A superseded night load must not commit its payload or clear busy."""
    out = run_node_harness("night_race.mjs")
    assert "supersession invariant held" in out


def test_desktop_window_contract():
    """The clear window / % of night / score are measured inside dusk..dawn.

    Regression: the derivation counted the payload's twilight margins, so the
    targets table advertised clear windows that included daylight (measured on
    a real payload: 164/197 objects, worst 690 min for a 590-min night)."""
    out = run_node_harness("derive_window.mjs")
    assert "derive window contract held" in out


def test_desktop_preference_and_scrub_handlers():
    """E5/E8: the real header.js Bortle/min-alt handlers re-derive the Bortle
    default live and let an explicit value win, and the real main.js keydown
    handler scrubs by one 6-min sample (Shift = 60 min), clamped. Driven
    through a stub DOM because headless browsers cannot run in this sandbox;
    the pure helpers are pinned separately in tests/test_js_parity.py."""
    out = run_node_harness("dom_handlers.mjs")
    assert "E5 handler: bortle re-derives min-alt held" in out
    assert "E5 handler: explicit min-alt survives bortle held" in out
    assert "E8 handler: 6/60-min steps + clamp held" in out


def test_web_panorama_geometry():
    """The web panorama editor's coordinate system (web/horizon.js): the
    row<->altitude and azimuth->x transforms used by the guides are the SAME
    ones the calibration grid, ceilFor and the profile use; obstacle/sky profile
    derivation, the sky-mode open-above sentinel and the 360 deg seam wrap match
    the desktop's semantics; a save/load round trip preserves them."""
    out = run_node_harness("pano_geom.mjs")
    assert "pano geometry contract held" in out
