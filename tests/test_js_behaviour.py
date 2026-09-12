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


def test_night_load_supersession_invariant():
    """A superseded night load must not commit its payload or clear busy."""
    out = run_node_harness("night_race.mjs")
    assert "supersession invariant held" in out


def test_worker_lifecycle_prefs_during_build():
    """FIX-1: a preference change during an in-flight worker build must not
    cancel the build; the finished plan carries the new preference and the busy
    chip clears (real planning_worker.js under Node via worker_bridge.mjs)."""
    out = run_node_harness("worker_lifecycle.mjs")
    assert "worker lifecycle contract held" in out


def test_catalog_identity_across_worker_boundary():
    """FIX-2: a changed catalog must invalidate the worker + client caches, and
    a worker response whose ids do not match the current catalog must never be
    bound by position (real planning_worker.js under Node)."""
    out = run_node_harness("catalog_identity.mjs")
    assert "catalog identity contract held" in out


def test_polar_fallback_never_reads_the_wall_clock():
    """FIX-6: the polar-day fallback window needs the site's local noon (or an
    explicit day anchor); with neither it must refuse, not use `new Date()`."""
    out = run_node_harness("noon_fallback.mjs")
    assert "noon fallback contract held" in out


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
    assert "E9 handler: scrub window (sunset..sunrise) + scoring window held" in out


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
