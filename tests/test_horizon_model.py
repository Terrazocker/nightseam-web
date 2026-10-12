"""The skyline horizon model (core/horizon.js) and editor history
(core/horizonhistory.js), run through Node."""

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_horizon_model_contracts():
    node = shutil.which("node")
    assert node, "Node is required"
    result = subprocess.run([node, str(ROOT / "tests/js/horizon_model.mjs")],
                            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "horizon model contracts held" in result.stdout
