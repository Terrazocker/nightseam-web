"""Scratch lifecycle must survive crashes without touching live/evidence data."""
import os
import stat
import subprocess
import sys

import pytest
from scripts import scratchspace as scratch


def test_live_run_survives_another_run_and_exception_cleanup(tmp_path):
    base = tmp_path / 'managed'
    with scratch.scratch_dir('first', base) as first:
        (first / 'active.txt').write_text('live', encoding='utf-8')
        with pytest.raises(RuntimeError, match='probe'):
            with scratch.scratch_dir('second', base) as second:
                assert first.exists()
                raise RuntimeError('probe')
        assert first.exists() and not second.exists()
    assert not first.exists()
    assert [p.name for p in base.iterdir()] == ['.manager-lock']


def test_crashed_child_recovered_but_unmarked_evidence_retained(tmp_path):
    base = tmp_path / 'managed'
    child = '''import os, sys
from scripts.scratchspace import scratch_dir
with scratch_dir('crash', sys.argv[1]) as run:
    (run / 'payload').write_bytes(b'x' * 10000)
    os._exit(0)
'''
    subprocess.run([sys.executable, '-c', child, str(base)], cwd=scratch.ROOT,
                   env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, check=True)
    abandoned = list(base.glob('crash-*'))
    assert len(abandoned) == 1
    evidence = base / 'evidence-12345678'
    evidence.mkdir()
    (evidence / scratch.MARKER).write_bytes(b'not owned scratch')
    with scratch.scratch_dir('next', base):
        assert not abandoned[0].exists()
        assert evidence.exists()


def test_readonly_payload_is_removed(tmp_path):
    base = tmp_path / 'managed'
    with scratch.scratch_dir('readonly', base) as run:
        nested = run / 'nested'
        nested.mkdir()
        file = nested / 'payload'
        file.write_bytes(b'disposable')
        file.chmod(stat.S_IREAD)
    assert not run.exists()


def test_failed_orphan_cleanup_blocks_new_allocation_and_can_retry(tmp_path, monkeypatch):
    base = tmp_path / 'managed'
    orphan = base / 'orphan-12345678'
    (orphan / 'locked').mkdir(parents=True)
    (orphan / scratch.MARKER).write_bytes(scratch.MAGIC)

    def denied(*args, **kwargs):
        raise PermissionError('simulated persistent lock')

    with monkeypatch.context() as patch:
        patch.setattr(scratch.shutil, 'rmtree', denied)
        with pytest.raises(OSError, match='Scratch cleanup failed'):
            with scratch.scratch_dir('next', base):
                pytest.fail('Must not allocate while abandoned scratch cannot be removed')
    assert list(base.glob('next-*')) == []
    assert (orphan / scratch.MARKER).read_bytes() == scratch.MAGIC
    with scratch.scratch_dir('retry', base):
        assert not orphan.exists()


def test_removal_and_creation_refuse_outside_or_parent_targets(tmp_path):
    with pytest.raises(ValueError, match='logs'):
        with scratch.scratch_dir('probe', scratch.ROOT / 'core'):
            pytest.fail('Must not create scratch in source')
    with pytest.raises(ValueError, match='Unsafe'):
        scratch.remove_tree(tmp_path, tmp_path)
    assert tmp_path.exists()
