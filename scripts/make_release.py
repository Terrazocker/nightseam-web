"""Stage the clean tagged web planner into dist/web-release.

Version baking and release gates run before copying. This is a local staging
operation; publishing uses web/ftps_deploy.py publish with verified immutable
assets and atomic public entry-point renames.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT/'dist'/'web-release'
sys.path.insert(0, str(ROOT/'scripts'))
from publication_assets import immutable_payload, hashes

def main():
    subprocess.run([sys.executable, str(ROOT/'web'/'build_web.py'), 'version'], check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(ROOT/'scripts'/'check_js.py')], check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(ROOT/'scripts'/'check_release.py'), '--no-stage'], check=True, cwd=ROOT)
    payload, metadata = immutable_payload(ROOT, ('web',))
    if STAGE.exists():
        resolved = STAGE.resolve()
        if resolved.parent != (ROOT/'dist').resolve() or resolved.name != 'web-release':
            raise RuntimeError('Unexpected staging path')
        shutil.rmtree(resolved)
    files = hashes({n.removeprefix('web/'): data for n, data in payload.items()})
    for name, data in payload.items():
        target = STAGE/name.removeprefix('web/')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    version = json.loads((ROOT/'web'/'version.json').read_text(encoding='utf-8'))
    (STAGE/'release.manifest.json').write_text(json.dumps({'describe': version['describe'], 'files': files, 'publication': metadata}, indent=2)+'\n', encoding='utf-8')
    return subprocess.run([sys.executable, str(ROOT/'scripts'/'check_release.py')], cwd=ROOT).returncode

if __name__ == '__main__':
    raise SystemExit(main())
