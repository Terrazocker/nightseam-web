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


def test_web_backup_integrity():
    """web/webstore.js + web/horizon.js backup/restore through a fake
    IndexedDB: photo fields of older backups dropped, profiles derived from skyline points, older
    bundles without their retired panoramas, staged validation before any
    write, and rollback to the pre-restore snapshot when a write fails."""
    out = run_node_harness("web_backup.mjs")
    assert "web backup integrity held" in out


def test_scrub_window_degeneracy_policy():
    """The scrub/detail range must be strictly increasing for every twilight
    geometry, including the Tromso 2026-01-15 grazing polar night where the
    sunset/sunrise pair is degenerate (sunset after the next dawn)."""
    out = run_node_harness("scrub_degenerate.mjs")
    assert "scrub degeneracy policy held" in out


def test_brief_twilight_spells_and_same_level_window():
    """A dark or bright spell shorter than the 10-minute scan step is found
    between samples, and the dark window never mixes twilight levels."""
    out = run_node_harness("twilight_brief.mjs")
    assert "brief twilight policy held" in out


def test_web_horizon_editor_shell():
    """The horizon editor's DOM-free logic (web/horizon.js): loading drops the
    retired panorama storage and malformed records, the view clamp, the text
    summary, the leave-page guard and storage-failure reporting."""
    out = run_node_harness("horizon_ui.mjs")
    assert "horizon ui contract held" in out


def test_capture_camera_scale():
    """The phone capture's calibration routine (web/capture.js guideScale)
    measures the camera scale still, from the turn between marking a feature
    and placing it on a guide line: on a Pixel 7a the scale read from motion
    grew with turning speed."""
    out = run_node_harness("capture_calibration.mjs")
    assert "capture calibration contract held" in out


def test_pairing_transport_contract():
    """Phone pairing (web/pairing.js): ids, keys and the QR address; sealed
    messages refuse a wrong key, another box, the other direction or a
    changed byte; the reply is exactly the horizon's share-link text."""
    out = run_node_harness("pairing.mjs")
    assert "pairing transport contract held" in out
