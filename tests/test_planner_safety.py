import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_timezone_entry_points_and_shared_unknown_horizon_reason():
    node = shutil.which('node')
    assert node, 'Node is required'
    result = subprocess.run([node, str(ROOT / 'tests/js/planner_safety.mjs')],
                            cwd=ROOT, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'planner safety contracts: OK' in result.stdout
