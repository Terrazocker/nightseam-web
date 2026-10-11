import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_physical_orientation_and_geographic_acceptance():
    node = shutil.which('node')
    assert node, 'Node is required'
    result = subprocess.run([node, str(ROOT / 'tests/js/horizon_geographic.mjs')],
                            cwd=ROOT, capture_output=True, text=True, timeout=45)
    assert result.returncode == 0, result.stdout + result.stderr
