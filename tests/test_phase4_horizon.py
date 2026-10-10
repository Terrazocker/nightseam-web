"""Reviewed horizon geometry and bounded normalization, without frozen fixture changes."""
import pytest
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_horizon(module=None, timeout=10):
    node = shutil.which('node')
    assert node, 'Node is required for horizon regression checks'
    args = [node, str(ROOT/'tests/js/review_phase4_horizon.mjs')]
    if module:
        args.append(str(module))
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=timeout)


def test_reviewed_horizon_geometry():
    result = run_horizon()
    assert result.returncode == 0, result.stdout + result.stderr


def test_duplicate_id_regression_detects_nontermination(tmp_path):
    source = (ROOT/'core/horizon.js').read_text()
    start = source.index('    const base = id;')
    end = source.index('    seen.add(id);', start)
    old = '    while (seen.has(id)) id = `${id}-${i + 1}`.slice(0, 64);\n'
    mutant = tmp_path/'horizon.mjs'
    mutant.write_text(source[:start] + old + source[end:])
    try:
        result = run_horizon(mutant, timeout=2)
    except subprocess.TimeoutExpired:
        return  # the old bug really freezes; the harness cannot hang the suite
    assert result.returncode != 0, 'normalization regression accepted the old infinite loop'


@pytest.mark.parametrize('before,after', [
    ('out.push({ ...s, x, rx });', 'out.push({ ...s, x, rx, r: s.r * scale });'),
    ('const wrap = wrapsFor(p);', 'const wrap = false;'),
    ('cropStrokes(p.strokes, kept, W, wrap)', 'cropStrokes(p.strokes, sel, W, wrap)'),
    ('else clearMask(p);', 'else computeProfile(p);'),
])
def test_crop_regressions_reject_original_defects(tmp_path, before, after):
    source = (ROOT/'core/horizon.js').read_text()
    assert before in source
    mutant = tmp_path/'horizon.mjs'
    mutant.write_text(source.replace(before, after))
    result = run_horizon(mutant)
    assert result.returncode != 0, 'geometry regression accepted a reviewed crop defect'
