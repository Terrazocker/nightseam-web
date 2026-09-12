"""Correctness authority: independent published-value anchors (Phase C).

Phase C deleted the Python astronomy layer and with it the reference suites that
had pinned it against the outside world: `tests/test_precession_reference.py`
(Capitaine/IAU 2006, forward + inverse) and the published anchors of
`tests/test_astro.py` (Meeus ch.7/12/21 examples, the 2026-08-12/28 moon phases,
the ERFA lunar position, illumination/age identities).

`tests/fixtures/core_fixtures.json` is a REGRESSION/MAINTENANCE golden: it was
generated from the same implementation lineage (the Python oracle), so it can
catch drift but not a shared misreading of a formula - which is exactly how the
old X-axis precession bug survived three engines at once. `reference_anchors.mjs`
is the correctness authority: it asserts the shared core against PUBLISHED
models and values (an IAU 2006 transcription, Meeus textbook numbers, published
moon phases, an astropy/ERFA position), never against the core's own output.

Every anchor group below has a mutation proof: one load-bearing coefficient or
sign in a COPY of core/astro.js is perturbed and the named reference check must
fail. The real core passes all of them.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "tests" / "js" / "reference_anchors.mjs"
ANCHOR_COUNT = 19


def _run(core_dir=None):
    node = shutil.which("node")
    if not node:
        pytest.fail("node is not installed - reference anchors cannot run")
    argv = [node, str(HARNESS)]
    if core_dir is not None:
        argv.append(str(core_dir))
    try:
        return subprocess.run(argv, capture_output=True, text=True,
                              encoding="utf-8", timeout=300, cwd=str(ROOT))
    except OSError as exc:          # sandboxed environments deny pipe creation
        pytest.fail(f"cannot spawn node here: {exc}")


def _failed(core_dir=None) -> set[str]:
    proc = _run(core_dir)
    assert proc.stdout, (f"the harness printed nothing (rc={proc.returncode}): "
                         f"{proc.stderr[-800:]}")
    data = json.loads(proc.stdout)
    return {c["id"] for c in data["checks"] if not c["ok"]}


def test_all_reference_anchors_pass():
    """The published IAU 2006/Meeus/moon/ERFA anchors must all hold."""
    proc = _run()
    assert proc.returncode == 0, proc.stderr[-1500:]
    data = json.loads(proc.stdout)
    failed = [c for c in data["checks"] if not c["ok"]]
    assert not failed, failed
    assert len(data["checks"]) == ANCHOR_COUNT, \
        f"anchor count changed: {len(data['checks'])} != {ANCHOR_COUNT}"
    assert data["failed"] == 0


def test_missing_node_fails_instead_of_skipping(monkeypatch):
    """FIX-9b (review TS6): without node the reference anchors cannot run, so
    a missing node must FAIL the suite - a green run must never mean 'the
    astronomy checks were skipped'. Mutation: turn the helper's pytest.fail()
    back into pytest.skip() and this test fails with 'got Skipped'."""
    import shutil as _shutil
    monkeypatch.setattr(_shutil, "which", lambda name: None)
    try:
        _run()
    except pytest.fail.Exception:
        return                      # the required outcome
    except BaseException as exc:    # a Skipped outcome is the regression
        pytest.fail(f"missing node must FAIL the check, got {type(exc).__name__}")
    pytest.fail("missing node must fail the check")


def _mutated_core(tmp_path, old, new):
    dest = tmp_path / "core"
    shutil.copytree(ROOT / "core", dest)
    target = dest / "astro.js"
    text = target.read_text(encoding="utf-8")
    assert old in text, f"mutation anchor moved in core/astro.js: {old!r}"
    target.write_text(text.replace(old, new, 1), encoding="utf-8")
    return dest


def _mutated_core_nth(tmp_path, old, new, nth):
    """Replace the nth (1-based) occurrence - the forward and inverse
    precession functions share their first line verbatim."""
    dest = tmp_path / "core"
    shutil.copytree(ROOT / "core", dest)
    target = dest / "astro.js"
    text = target.read_text(encoding="utf-8")
    parts = text.split(old)
    assert len(parts) > nth, f"mutation anchor {old!r} has no occurrence {nth}"
    target.write_text(old.join(parts[:nth]) + new + old.join(parts[nth:]),
                      encoding="utf-8")
    return dest


def _assert_mutation_fails(tmp_path, old, new, expected_id):
    failed = _failed(_mutated_core(tmp_path, old, new))
    assert expected_id in failed, \
        f"{old!r} -> {new!r} must fail {expected_id!r}; failed={sorted(failed)}"


def test_precession_coefficient_mutation_fails_the_iau2006_anchor(tmp_path):
    """The 0.6.9 bug class: perturb the Meeus precession coefficient. The
    independent IAU 2006/Meeus transcription must catch it (the frozen fixtures
    would catch it too, but they cannot tell WHICH model is right)."""
    failed = _failed(_mutated_core(tmp_path, "2306.2181 * t", "2316.2181 * t"))
    assert "meeus_precession_transcription" in failed, sorted(failed)
    assert "iau2006_forward" in failed, sorted(failed)


def test_gmst_mutation_fails_the_time_anchor(tmp_path):
    _assert_mutation_fails(tmp_path, "280.46061837 +", "280.56061837 +",
                           "gmst_j2000")


def test_sun_model_mutation_fails_the_solar_anchor(tmp_path):
    _assert_mutation_fails(tmp_path, "1.915 * Math.sin(g)",
                           "3.915 * Math.sin(g)", "sun_position_august_2026")


def test_moon_position_mutation_fails_the_erfa_anchor(tmp_path):
    _assert_mutation_fails(tmp_path, "218.316 + 481267.8813",
                           "228.316 + 481267.8813", "moon_erfa_position")


def test_moon_phase_mutation_fails_the_published_phase_anchor(tmp_path):
    _assert_mutation_fails(tmp_path, "const k = (1 - Math.cos(psi)) / 2;",
                           "const k = (1 + Math.cos(psi)) / 2;",
                           "moon_published_phases")


def test_refraction_mutation_fails_the_refraction_anchor(tmp_path):
    _assert_mutation_fails(tmp_path, "1.02 / Math.tan(", "1.50 / Math.tan(",
                           "refraction_magnitude")


def test_inverse_precession_mutation_fails_the_iau2006_anchor(tmp_path):
    """TS5 (review): the previous mutation replaced the FIRST `2306.2181 * t`,
    i.e. only the forward function - the inverse check
    (`precessDateToJ2000`) had no bite proof. The shared coefficient appears
    twice per function (zeta and z), so the inverse zeta is occurrence 3;
    mutate it and require the inverse anchor to fail."""
    core = _mutated_core_nth(tmp_path, "2306.2181 * t", "2316.2181 * t", 3)
    failed = _failed(core)
    assert "iau2006_inverse" in failed, sorted(failed)


def test_julian_day_mutation_fails_the_time_anchor(tmp_path):
    """TS5 (review): the JD examples had no mutation proof either."""
    _assert_mutation_fails(tmp_path, "- 1524.5;", "- 1524.0;",
                           "meeus_jd_examples")
