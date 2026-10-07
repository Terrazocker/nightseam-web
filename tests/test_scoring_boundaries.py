"""Independent physical interval regressions; no frozen fixture is rewritten."""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _run(core_dir=None):
    node = shutil.which("node")
    if not node:
        pytest.fail("node is required for the scoring boundary regression")
    args = [node, str(ROOT / "tests/js/scoring_boundaries.mjs")]
    if core_dir is not None:
        args.append(str(core_dir))
    return subprocess.run(
        args,
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=60,
    )


def test_scored_intervals_respect_exact_night_boundaries():
    proc = _run()
    assert proc.returncode == 0, f"{proc.stdout}\n{proc.stderr}"
    assert "bounded half-open scoring contract held" in proc.stdout


def test_reintroducing_terminal_cell_overcount_is_detected(tmp_path):
    core = tmp_path / "core"
    shutil.copytree(ROOT / "core", core)
    target = core / "scoring.js"
    text = target.read_text(encoding="utf-8")
    old = "const gridEnd = Number.isFinite(tracks.jd1) ? tracks.jd1 : jd0 + count * step;"
    assert old in text
    target.write_bytes(text.replace(old, "const gridEnd = jd0 + count * step;").encode("utf-8"))
    proc = _run(core)
    assert proc.returncode != 0, "discarding the exact dawn must break boundary regression"
    assert "authoritative dawn" in proc.stderr
