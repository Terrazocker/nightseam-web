import sys
from pathlib import Path

import pytest

# make the project root importable when running `pytest` from anywhere
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[1]


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
