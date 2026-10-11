import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_projection_and_multiple_reference_acceptance():
    node = shutil.which('node')
    assert node, 'Node is required'
    result = subprocess.run([node, str(ROOT / 'tests/js/horizon_def.mjs')],
                            cwd=ROOT, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
