import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_guided_calibration_evidence_and_geometry():
    node = shutil.which('node')
    assert node, 'Node is required'
    result = subprocess.run([node, str(ROOT / 'tests/js/horizon_phase3.mjs')],
                            cwd=ROOT, capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stdout + result.stderr
