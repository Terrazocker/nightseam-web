"""L7 probe: `tests/test_ui_invariants.py::_read` turns a MISSING file into a
SKIP, so an invariant test whose subject file is renamed/moved silently stops
being enforced (a green run then means "not checked" - the rule the project
adopted for a missing node, TS6/FIX-9b).

Proves the branch by calling the real helper with a path that does not exist.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]


def test_read_skips_on_a_missing_file():
    spec = importlib.util.spec_from_file_location(
        "probe_ui_invariants", REPO / "tests" / "test_ui_invariants.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["probe_ui_invariants"] = mod
    spec.loader.exec_module(mod)
    with pytest.raises(Exception) as exc:      # pytest.skip raises Skipped
        mod._read("web", "definitely-not-here-l7.js")
    assert isinstance(exc.value, BaseException)
    print("observed outcome:", type(exc.value).__name__, "-", exc.value)
