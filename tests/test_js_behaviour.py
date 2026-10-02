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
        pytest.fail("node is not installed - JS behaviour cannot be checked here")
    try:
        proc = subprocess.run([node, str(ROOT / "tests" / "js" / script)],
                              capture_output=True, text=True, encoding="utf-8",
                              timeout=180, cwd=str(ROOT))
    except OSError as exc:          # sandboxed environments deny pipe creation
        pytest.fail(f"cannot spawn node here: {exc}")
    assert proc.returncode == 0, (
        f"{script} failed:\n{proc.stdout[-1500:]}\n{proc.stderr[-1500:]}")
    return proc.stdout




def test_shared_planner_state_revision_contract():
    """The panorama invalidation event and content revision are one pure core
    contract, so desktop and web cannot silently invent different cache keys."""
    out = run_node_harness("plannerstate.mjs")
    assert "planner state contract held" in out


def test_horizon_metadata_normalization_and_comparison():
    """Horizon annotations use one bounded shape in both shells and profile
    comparison reports a reproducible world-bin difference."""
    out = run_node_harness("horizon_metadata.mjs")
    assert "horizon metadata contract held" in out


def test_visibility_explainability_and_culmination_contract():
    """Core target results expose stable reason codes, usable boundaries and
    culmination/rise/set facts for both shells to format."""
    out = run_node_harness("visibility_explain.mjs")
    assert "visibility explainability contract held" in out


def test_core_exports_that_no_other_test_named():
    """TO-09 (carry-over TS4): eight exported core functions were referenced
    nowhere under tests/; this drives each through a contract property."""
    out = run_node_harness("core_exports.mjs")
    assert "core exports contract held" in out






def test_polar_fallback_never_reads_the_wall_clock():
    """FIX-6: the polar-day fallback window needs the site's local noon (or an
    explicit day anchor); with neither it must refuse, not use `new Date()`."""
    out = run_node_harness("noon_fallback.mjs")
    assert "noon fallback contract held" in out








def test_web_panorama_geometry():
    """The web panorama editor's coordinate system (web/horizon.js): the
    row<->altitude and azimuth->x transforms used by the guides are the SAME
    ones the calibration grid, ceilFor and the profile use; obstacle/sky profile
    derivation, the sky-mode open-above sentinel and the 360 deg seam wrap match
    the desktop's semantics; a save/load round trip preserves them."""
    out = run_node_harness("pano_geom.mjs")
    assert "pano geometry contract held" in out


def test_web_backup_integrity():
    """web/webstore.js + web/horizon.js backup/restore through a fake
    IndexedDB: truthful hasImage, the profile/strokes invariant, staged
    validation before any write, and rollback to the pre-restore snapshot when
    a write fails."""
    out = run_node_harness("web_backup.mjs")
    assert "web backup integrity held" in out


def test_scrub_window_degeneracy_policy():
    """The scrub/detail range must be strictly increasing for every twilight
    geometry, including the Tromso 2026-01-15 grazing polar night where the
    sunset/sunrise pair is degenerate (sunset after the next dawn)."""
    out = run_node_harness("scrub_degenerate.mjs")
    assert "scrub degeneracy policy held" in out


def test_web_panorama_editor_history_and_view():
    """The panorama editor's pure UI logic (web/horizon.js): undo/redo history
    with a bounded stack and redo invalidation, the dirty/saved baseline, and
    the presentation-only zoom transform (uniform scale, screen<->base
    round-trip, focus clamping, DPR-independent geometry)."""
    out = run_node_harness("pano_ui.mjs")
    assert "pano ui contract held" in out




def test_web_sky_band_complement_geometry():
    """ITEM C (0.6.13): the visible-sky band is the exact complement of the
    blocked band - open-above (90.5) extends to the zenith, unpainted columns
    are fully blocked, the preview covers the full width, splits at the blocked
    gaps and never self-intersects; and the shared edge geometry yields
    identical vertices on web + desktop."""
    out = run_node_harness("sky_band.mjs")
    assert "sky-band contract held" in out


def test_pano_mode_semantics_ruling_c():
    """DE-03/WE-02 under ruling C: a DELIBERATE paint-mode switch re-derives the
    canonical blank for a stroke-less record in BOTH shells and is ONE undoable
    step that restores the previous mode AND the authoritative profile;
    open/load/save never blank it, and the mask-derived (stroke-y) path is left
    to the strokes."""
    out = run_node_harness("pano_mode_semantics.mjs")
    assert "pano mode semantics contract held" in out


def test_horizon_entry_points_degrade_on_malformed_records():
    """CR2 (carried over, closed in 0.6.35): every `core/horizon.js` entry point
    must return its EMPTY answer for a missing or malformed record instead of
    throwing mid-render. `visibleSkyBands` was fixed earlier (CO-04); this pins
    the whole family, including the element-level case (`ceilFor` returning
    `NaN`: `alt > NaN` is false, so every object would read as blocked).
    Mutation-proven for both guards this pass added."""
    out = run_node_harness("horizon_degrade.mjs")
    assert "CR2 horizon degrade contract held" in out
