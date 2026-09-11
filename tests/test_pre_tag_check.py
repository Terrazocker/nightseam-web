"""Pre-tag gate test: the release order must never be violated again.

A release tag must point at a commit that already contains the CURATED entry
for that version, otherwise `check_release.py` blocks staging and the tag would
have to move. `scripts/pre_tag_check.py` is the gate; run it before `git tag`.
"""

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _mod():
    spec = importlib.util.spec_from_file_location(
        "pre_tag_check", ROOT / "scripts" / "pre_tag_check.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_current_release_version_has_curated_entry():
    m = _mod()
    assert m.check("0.6.12") is True
    assert m.check("v0.6.12") is True          # leading v tolerated


def test_unknown_version_fails_the_gate():
    m = _mod()
    assert m.check("9.9.9") is False
    assert m.check("0.6.999") is False
    assert m.check("") is False


def test_main_exit_codes(monkeypatch):
    m = _mod()
    monkeypatch.setattr(sys, "argv", ["pre_tag_check.py", "0.6.12"])
    assert m.main() == 0
    monkeypatch.setattr(sys, "argv", ["pre_tag_check.py", "9.9.9"])
    assert m.main() == 1
    monkeypatch.setattr(sys, "argv", ["pre_tag_check.py"])
    assert m.main() == 2
