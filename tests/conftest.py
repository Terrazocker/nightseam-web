import sys
import uuid
from pathlib import Path

import pytest

# make the project root importable when running `pytest` from anywhere
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[1]
from scripts.scratchspace import remove_tree, scratch_dir


@pytest.fixture(scope='session')
def scratch_run():
    with scratch_dir('pytest') as run:
        yield run


@pytest.fixture
def tmp_path(scratch_run):
    """Per-test scratch inside a locked, recoverable repo-local session."""
    d = scratch_run / uuid.uuid4().hex[:12]
    d.mkdir()
    try:
        yield d
    finally:
        remove_tree(d, scratch_run)
