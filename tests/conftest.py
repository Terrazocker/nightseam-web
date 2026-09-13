import shutil
import sys
import uuid
from pathlib import Path

import pytest

# make the project root importable when running `pytest` from anywhere
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def tmp_path(request):
    """A temp dir this sandbox can CREATE and DELETE (overrides pytest's own).

    `pytest.ini` sets `--basetemp=.pytest-tmp`, and that directory can acquire an
    owner-SID-only DACL in this environment: every `tmp_path` test then ERRORS at
    fixture cleanup with WinError 5 (an environment artifact, not a test
    failure), and the repository's own scratch dir cannot be removed. Keeping the
    per-test dirs under the gitignored `logs/` - which the sandbox token owns -
    makes the suite run cleanly with no extra plugin or command-line flag.
    """
    base = ROOT / "logs" / ".pytest-tmp"
    base.mkdir(parents=True, exist_ok=True)
    d = base / uuid.uuid4().hex[:12]
    d.mkdir()
    try:
        yield d
    finally:
        shutil.rmtree(d, ignore_errors=True)


@pytest.fixture(autouse=True)
def _never_touch_the_user_profile(monkeypatch):
    """Keep the DEFAULT archive folder inside the repo for every test.

    `Database.image_dir()` falls back to `paths.default_archive_dir()`
    (``~/Documents/NightSeam Images``) whenever a test's database has no
    `image_dir` setting, and a restore then WRITES there - a test that forgot to
    set the setting silently polluted the developer's real Documents folder
    (found during review: m31.fit / x.fit / sub/pwn.bat had landed there).
    Tests that want a specific archive still set `image_dir` themselves; this
    only guarantees the fallback can never reach the user's profile.

    The path is under `logs/` (gitignored, writable) and is NOT created here:
    the writer creates it on demand, so this fixture can never fail a run in a
    sandbox that cannot mkdir inside the pytest temp tree.
    """
    monkeypatch.setattr("app.paths.default_archive_dir",
                        lambda: ROOT / "logs" / ".pytest-default-archive")
