"""Stage the clean tagged web planner into dist/web-release.

Version baking and release gates run before copying. This is a local staging
operation; publishing uses web/ftps_deploy.py and uploads HTML last.
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
from check_release import shipped_files

def main():
    subprocess.run([sys.executable, str(ROOT/'web'/'build_web.py'), 'version'], check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(ROOT/'scripts'/'check_js.py')], check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(ROOT/'scripts'/'check_release.py'), '--no-stage'], check=True, cwd=ROOT)
    if STAGE.exists():
        resolved = STAGE.resolve()
        if resolved.parent != (ROOT/'dist').resolve() or resolved.name != 'web-release':
            raise RuntimeError('Unexpected staging path')
        shutil.rmtree(resolved)
    files = {}
    for source in shipped_files(ROOT):
        rel = source.relative_to(ROOT/'web')
        target = STAGE/rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        files[rel.as_posix()] = hashlib.sha256(target.read_bytes()).hexdigest()
    version = json.loads((ROOT/'web'/'version.json').read_text(encoding='utf-8'))
    (STAGE/'release.manifest.json').write_text(json.dumps({'describe': version['describe'], 'files': files}, indent=2)+'\n', encoding='utf-8')
    return subprocess.run([sys.executable, str(ROOT/'scripts'/'check_release.py')], cwd=ROOT).returncode

if __name__ == '__main__':
    raise SystemExit(main())
