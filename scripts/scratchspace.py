"""Owned, locked repo-local scratch; abandoned runs recover on the next use."""
from contextlib import contextmanager
import errno
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'logs' / '.scratch'
MARKER = '.owner-lock'
MAGIC = b'NightSeam disposable scratch v1\n'
RUN_NAME = re.compile(r'[a-z][a-z0-9-]*-[a-z0-9_]{8}\Z')


def _lock(file, blocking=False):
    file.seek(0)
    if os.name == 'nt':
        import msvcrt
        msvcrt.locking(file.fileno(), msvcrt.LK_LOCK if blocking else msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(file.fileno(), fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))


def _base(path):
    path = Path(path).absolute()
    logs = ROOT.resolve() / 'logs'
    if logs.is_symlink() or logs.is_junction() or path.resolve() != path:
        raise ValueError('Scratch parents cannot redirect through links')
    if not path.resolve().is_relative_to(logs):
        raise ValueError('Scratch must stay inside repository logs/')
    if path.is_symlink() or path.is_junction():
        raise ValueError('Scratch base cannot be a link')
    path.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def remove_tree(path, parent):
    """Retry transient locks; fail visibly instead of accumulating silent leaks."""
    path, parent = Path(path), Path(parent).resolve()
    if path.parent.resolve() != parent or path.is_symlink() or path.is_junction():
        raise ValueError('Unsafe scratch removal target')
    if not parent.is_relative_to(ROOT.resolve() / 'logs'):
        raise ValueError('Scratch removal must stay inside repository logs/')

    def readonly_retry(func, name, exc):
        target = Path(name)
        if not isinstance(exc, PermissionError) or not target.resolve().is_relative_to(path.resolve()):
            raise exc
        if target.is_symlink() or target.is_junction():
            raise exc
        target.chmod(target.stat().st_mode | stat.S_IWRITE)
        func(name)

    for attempt in range(3):
        try:
            shutil.rmtree(path, onexc=readonly_retry)
            return
        except FileNotFoundError:
            if not path.exists():
                return
            raise
        except OSError as exc:
            if attempt == 2:
                raise OSError(f'Scratch cleanup failed at {path}; fix the lock/permissions before retrying') from exc
            time.sleep(0.1 * (attempt + 1))


def _clean_run(path, lock):
    """Keep ownership evidence intact if a child cannot be removed."""
    try:
        for child in path.iterdir():
            if child.name == MARKER:
                continue
            if child.is_symlink() or child.is_junction():
                # Unlink the entry itself; never traverse its target.
                if child.is_junction():
                    child.rmdir()
                else:
                    child.unlink()
            elif child.is_dir():
                remove_tree(child, path)
            else:
                child.chmod(child.stat().st_mode | stat.S_IWRITE)
                child.unlink()
    finally:
        lock.close()
    (path / MARKER).unlink()
    path.rmdir()


def _reap(base):
    for run in sorted(base.iterdir()):
        if not RUN_NAME.fullmatch(run.name) or not run.is_dir() or run.is_symlink() or run.is_junction():
            continue
        marker = run / MARKER
        if not marker.is_file() or marker.is_symlink():
            continue  # Unmarked/unknown material is never disposable by inference.
        lock = marker.open('r+b')
        try:
            _lock(lock)
        except OSError as exc:
            lock.close()
            if exc.errno in (errno.EACCES, errno.EAGAIN):
                continue  # A live run owns this directory.
            raise
        lock.seek(0)
        if lock.read(len(MAGIC) + 1) != MAGIC:
            lock.close()
            continue
        _clean_run(run, lock)


@contextmanager
def scratch_dir(owner, base=None):
    """Clean inactive owned runs before allocating; preserve concurrent live runs."""
    if not re.fullmatch(r'[a-z][a-z0-9-]*', owner):
        raise ValueError('Invalid scratch owner')
    base = _base(BASE if base is None else base)
    # Serialize creation/reaping: a newly created marker cannot be mistaken for
    # an abandoned run between its write and acquisition of the per-run lock.
    with (base / '.manager-lock').open('a+b') as manager:
        if manager.seek(0, 2) == 0:
            manager.write(b'0')
            manager.flush()
        _lock(manager, blocking=True)
        _reap(base)
        run = Path(tempfile.mkdtemp(prefix=owner + '-', dir=base))
        lock = (run / MARKER).open('x+b')
        lock.write(MAGIC)
        lock.flush()
        _lock(lock)
    try:
        yield run
    finally:
        with (base / '.manager-lock').open('r+b') as manager:
            _lock(manager, blocking=True)
            _clean_run(run, lock)
