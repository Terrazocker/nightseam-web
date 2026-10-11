import subprocess
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_crop_sources_continuous_paint_and_calibration():
    node = shutil.which('node')
    assert node, 'Node is required'
    result = subprocess.run([node, str(ROOT/'tests/js/horizon_phases12.mjs')],
                            cwd=ROOT, capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stdout + result.stderr
