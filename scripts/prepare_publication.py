"""Create/verify a local publication candidate; never connect, upload or tag.

Dirty candidates stay explicitly development snapshots. Clean release creation
continues through make_release.py at an independently reviewed new tag.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
try:
    from .check_release import shipped_files, SHIPPING_EXCLUDED
except ImportError:
    from check_release import shipped_files, SHIPPING_EXCLUDED

ROOT=Path(__file__).resolve().parents[1]


def retired_paths(root):
    """Durable reviewed cleanup inventory, independent of uncommitted deletions."""
    paths=json.loads((Path(root)/'scripts/publication_cleanup.json').read_text(encoding='utf-8'))
    if (not isinstance(paths,list) or not all(isinstance(p,str) and
            re.fullmatch(r'/astro/(?:img/[a-z0-9]+\.jpg|image-attributions\.json)',p) for p in paths)
            or len(set(paths))!=len(paths)):
        raise ValueError('Unexpected retired production file inventory')
    return paths


def source_files(root):
    files=shipped_files(root)
    files.extend(p for p in (root/'landing').rglob('*') if p.is_file()
                 and not any(part in SHIPPING_EXCLUDED for part in p.relative_to(root/'landing').parts)
                 and p.suffix not in ('.pyc','.env'))
    return files


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(root,describe,cleanup=()):
    root=Path(root).resolve()
    destination=root/'dist/publication-preview'
    if destination.resolve().parent != (root/'dist').resolve() or destination.is_symlink():
        raise ValueError('Unexpected publication candidate directory')
    if destination.exists(): shutil.rmtree(destination)
    destination.mkdir(parents=True)
    manifest={'describe':describe,'status':'local-review-candidate',
              'created_utc':datetime.now(timezone.utc).isoformat(), 'files':{},
              'cleanup_after_authorized_acceptance':list(cleanup),
              'preserve_remote_core_hash_directories':True}
    for source in source_files(root):
        rel=source.relative_to(root).as_posix()
        target=destination/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)
        manifest['files'][rel]=digest(target)
    (destination/'publication.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    verify(root)
    return destination


def verify(root):
    root=Path(root)
    destination=root/'dist/publication-preview'
    manifest=json.loads((destination/'publication.manifest.json').read_text(encoding='utf-8'))
    expected={p.relative_to(root).as_posix():digest(p) for p in source_files(root)}
    actual={p.relative_to(destination).as_posix():digest(p) for p in destination.rglob('*')
            if p.is_file() and p.name!='publication.manifest.json'}
    if manifest.get('status')!='local-review-candidate' or manifest.get('files')!=expected or actual!=expected:
        raise ValueError('Publication candidate differs from reviewed source or manifest')
    return len(actual)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args()
    if args.verify:
        print(f'Publication candidate verified: {verify(ROOT)} files')
        return 0
    describe=subprocess.check_output(['git','describe','--tags','--always','--dirty'],cwd=ROOT,text=True).strip()
    cleanup=retired_paths(ROOT)
    destination=prepare(ROOT,describe,cleanup)
    print(f'Prepared {describe} local candidate ({verify(ROOT)} files): {destination}')
    return 0


if __name__=='__main__':
    raise SystemExit(main())
