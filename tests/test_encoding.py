"""Shipped text must stay UTF-8 - the 0.6.9 mojibake accident, pinned.

web/app.js and web/horizon.js were committed after a tool had read them as
cp1252 and written them back as UTF-8: every em dash, degree sign and emoji in
them turned into its multi-character mojibake cluster and the live web app
showed garble until the follow-up commit. scripts/check_encoding.py is the
guard; this test keeps it in the suite (and in the release path).
"""

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load():
    path = ROOT / "scripts" / "check_encoding.py"
    spec = importlib.util.spec_from_file_location("check_encoding", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_no_non_utf8_or_double_encoded_text():
    problems = _load().scan()
    assert problems == [], "\n".join("%s: %s" % (p.as_posix(), r) for p, r in problems)
