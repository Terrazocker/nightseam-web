"""Mutation proofs for the two JS guards that had none (TO-05, 0.6.24 review).

`check_js_imports.py` and `check_dom_ids.py` were pinned only by "the real tree is
clean", which cannot distinguish a working guard from one that no longer detects
anything. Each test stages the failure shape in a scratch tree and requires the
guard to report it.

(The encoding guard's mutation proof lives in
tests/test_encoding.py::test_the_review_workspace_is_not_policed; the browser
gate's behavioural pin is
tests/test_browser_gate.py::test_browser_gate_driver_start_failure_is_exit_2.)
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_a_broken_import_is_detected(monkeypatch, capsys, tmp_path):
    """Both halves: a specifier that resolves to no file AND a named import the
    target does not export."""
    mod = _load("check_js_imports")
    (tmp_path / "entry.js").write_text(
        "import { gone } from './lib.js';\n"
        "import { x } from './missing-file.js';\n"
        "export const x = 1;\n", encoding="utf-8")
    (tmp_path / "lib.js").write_text("export const present = 1;\n", encoding="utf-8")
    monkeypatch.setattr(mod, "REPO", tmp_path)
    monkeypatch.setattr(mod, "iter_js_files", lambda: sorted(tmp_path.glob("*.js")))

    assert mod.main() == 1
    out = capsys.readouterr().out
    assert "BROKEN" in out
    assert "missing-file.js" in out
    assert "'gone' is not exported" in out


def test_a_missing_dom_id_is_detected(tmp_path):
    """A JS `$('#id')` with no matching element id in that app's HTML must fail."""
    mod = _load("check_dom_ids")
    html = tmp_path / "index.html"
    js = tmp_path / "mod.js"
    js.write_text("const a = $('#present');\nconst b = $('#absent');\n",
                  encoding="utf-8")

    html.write_text('<div id="present"></div>', encoding="utf-8")
    assert mod.check("scratch", html, [js]) == 1

    html.write_text('<div id="present"></div><div id="absent"></div>',
                    encoding="utf-8")
    assert mod.check("scratch", html, [js]) == 0
