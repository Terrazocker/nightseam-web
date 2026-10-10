"""Validate a web planner release independently of NightSeam Catalog.

Run with --allow-dirty --no-stage for a development source check. A public
release requires a clean vX.Y.Z tag, matching web/version.json, curated
changelog and all cache/core/source guards. No executable version is involved.
"""
from __future__ import annotations
import argparse
from dataclasses import dataclass
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ERROR = 'ERROR'
WARNING = 'WARNING'
sys.path.insert(0, str(ROOT))
from scripts.publication_assets import EXCLUDED as SHIPPING_EXCLUDED, inventory, require_tracked, immutable_payload, hashes


def shipped_files(root=ROOT):
    return inventory(root, ('web',))

@dataclass
class Finding:
    level: str
    check: str
    message: str

@dataclass
class State:
    root: Path
    describe: str
    web: dict | None
    web_problem: str | None

def git(args, root=ROOT):
    p = subprocess.run(['git', *args], cwd=root, capture_output=True,
                       text=True, encoding='utf-8', errors='replace')
    return p.returncode, p.stdout.strip()

def collect(root=ROOT):
    root = Path(root)
    rc, describe = git(['describe', '--tags', '--always', '--dirty'], root)
    payload, problem = None, None
    try:
        payload = json.loads((root/'web'/'version.json').read_text(encoding='utf-8'))
        if not isinstance(payload, dict):
            raise ValueError('version.json must be an object')
    except (OSError, ValueError) as exc:
        problem = str(exc)
    return State(root, describe if rc == 0 else '', payload, problem)

def evaluate(state, allow_dirty=False, include_stage=True):
    findings = []
    development = allow_dirty and not re.fullmatch(r'v\d+\.\d+\.\d+', state.describe)
    level = WARNING if development else ERROR
    if not state.describe:
        findings.append(Finding(ERROR, 'git', 'git describe failed; refusing a guessed version'))
    elif not re.fullmatch(r'v\d+\.\d+\.\d+', state.describe):
        findings.append(Finding(level, 'git', f'HEAD is not a clean release tag: {state.describe}'))
    if state.web_problem:
        findings.append(Finding(level, 'web-version', state.web_problem))
    elif (state.web.get('describe') != state.describe
          or state.web.get('version') != state.describe.removeprefix('v')):
        findings.append(Finding(level, 'web-version', 'web/version.json does not match git describe'))
    if include_stage:
        stage = state.root/'dist'/'web-release'
        try:
            if stage.is_symlink() or any(p.is_symlink() for p in stage.rglob('*')):
                raise ValueError('staged publication symlinks are forbidden')
            manifest = json.loads((stage/'release.manifest.json').read_text(encoding='utf-8'))
            if manifest.get('describe') != state.describe:
                raise ValueError('staged version does not match source')
            files = manifest.get('files')
            if not isinstance(files, dict) or not files:
                raise ValueError('staged file manifest is missing or empty')
            actual = {p.relative_to(stage).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                      for p in stage.rglob('*') if p.is_file() and p != stage/'release.manifest.json'}
            if files != actual:
                raise ValueError('staged bytes differ from release manifest')
            payload, metadata = immutable_payload(state.root, ('web',))
            if files != hashes({n.removeprefix('web/'): data for n, data in payload.items()}):
                raise ValueError('staged files or bytes differ from complete immutable web source')
            if manifest.get('publication') != metadata:
                raise ValueError('staged publication metadata differs from source')
        except (OSError, ValueError) as exc:
            findings.append(Finding(ERROR, 'web-stage', str(exc)))
    return findings

def _guard(name, root):
    spec = importlib.util.spec_from_file_location(name, root/'scripts'/f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def source_findings(root=ROOT):
    root = Path(root)
    findings = []
    for name in ('check_core', 'check_catalog_token', 'check_catalog_provenance', 'check_js_tokens'):
        try:
            problems = _guard(name, root).scan()
        except Exception as exc:
            problems = [f'guard failed to run: {exc}']
        findings.extend(Finding(ERROR, name, str(p)) for p in problems)
    try:
        require_tracked(root)
    except Exception as exc:
        findings.append(Finding(ERROR, 'publication-artifacts', str(exc)))
    try:
        rc, tracked = git(['ls-files', '--', 'web', 'core', 'catalog_data'], root)
        if rc:
            raise ValueError('cannot read tracked source modules')
        names = set(tracked.splitlines())
        for directory in ('web', 'core', 'catalog_data'):
            for path in (root/directory).rglob('*'):
                suffixes = ('.js', '.py', '.csv', '.json') if directory == 'catalog_data' else ('.js', '.py')
                if not path.is_file() or path.suffix not in suffixes or '__pycache__' in path.parts:
                    continue
                rel = path.relative_to(root).as_posix()
                if rel not in names:
                    findings.append(Finding(ERROR, 'source-modules', f'{rel} is not tracked by Git'))
    except Exception as exc:
        findings.append(Finding(ERROR, 'source-modules', str(exc)))
    return findings

def run(allow_dirty=False, include_stage=True, root=ROOT, stream=sys.stdout):
    state = collect(root)
    findings = evaluate(state, allow_dirty, include_stage) + source_findings(root)
    if re.fullmatch(r'v\d+\.\d+\.\d+', state.describe):
        if not _guard('pre_tag_check', Path(root)).check(state.describe):
            findings.append(Finding(ERROR, 'changelog', 'clean release tag has no curated changelog entry'))
    for f in findings:
        print(f'{f.level} {f.check}: {f.message}', file=stream)
    errors = sum(f.level == ERROR for f in findings)
    print(f'Web release check: {errors} error(s)', file=stream)
    return 1 if errors else 0

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--allow-dirty', action='store_true')
    ap.add_argument('--no-stage', action='store_true')
    args = ap.parse_args()
    return run(args.allow_dirty, not args.no_stage)

if __name__ == '__main__':
    raise SystemExit(main())
