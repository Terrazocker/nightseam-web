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
