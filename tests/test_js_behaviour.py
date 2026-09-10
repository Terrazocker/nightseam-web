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
                              capture_output=True, text=True, timeout=180,
                              cwd=str(ROOT))
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
