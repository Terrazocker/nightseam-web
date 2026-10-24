"""Tracked source inventory and deterministic immutable publication payloads."""
from pathlib import Path
import hashlib
import re
import subprocess
from urllib.parse import urlsplit, urlunsplit
try:
    from .web_asset_graph import ATTR, target_of
except ImportError:
    from web_asset_graph import ATTR, target_of

EXCLUDED = {'.gitignore', 'build_web.py', 'ftps_deploy.py', 'whale', 'dev',
            'node_modules', '__pycache__', '.git', '.env'}
GENERATED = {'web/version.json'}
# Non-HTML files that are also published at their tree root, beside the pages.
ROOT_ENTRIES = ('web/version.json', 'web/sw.js')
FORMAT = 'nightseam-immutable-v1'
# The one server script (docs/horizon/HORIZON_PAIRING_PLAN.md): the pairing
# relay keeps a stable path, /astro/relay.php, so every release talks to the
# same relay. It is never copied into a release namespace, and no other PHP
# file is published.
SERVER_SCRIPTS = {'web/relay.php'}
META_ASSET = re.compile(r'(<meta\b[^>]*\bcontent\s*=\s*)([\"\'])(https://(?:www\.)?nightseam\.de/[^\"\']+)\2', re.I)


def inventory(root, trees=('web', 'landing')):
    root = Path(root).resolve()
    result = []
    for tree in trees:
        base = root/tree
        if base.is_symlink():
            raise ValueError(f'{tree}: publication symlinks are forbidden')
        for path in sorted(base.rglob('*')):
            rel = path.relative_to(base)
            if any(part in EXCLUDED for part in rel.parts) or path.suffix in ('.pyc', '.env'):
                continue
            if path.is_symlink():
                raise ValueError(f'{tree}/{rel}: publication symlinks are forbidden')
            if path.is_file():
                result.append(path)
    return result


def require_tracked(root, trees=('web', 'landing')):
    root = Path(root).resolve()
    files = inventory(root, trees)
    git = subprocess.run(['git', 'ls-files', '-z', '--', *trees], cwd=root,
                         capture_output=True)
    if git.returncode:
        raise ValueError('Cannot read Git tracking for publication artifacts')
    tracked = set(git.stdout.decode('utf-8').split('\0'))
    missing = [p.relative_to(root).as_posix() for p in files
               if p.relative_to(root).as_posix() not in tracked | GENERATED]
    if missing:
        raise ValueError('Publication artifacts are not tracked by Git: ' + ', '.join(missing))
    return files


def digest(data):
    return hashlib.sha256(data).hexdigest()


def hashes(payload):
    return {name: digest(data) for name, data in sorted(payload.items())}


def refuse_unknown_scripts(names):
    scripts = sorted(n for n in names if n.lower().endswith(('.php', '.phtml', '.phar')) and n not in SERVER_SCRIPTS)
    if scripts:
        raise ValueError('Only web/relay.php may be a server script: ' + ', '.join(scripts))


def source_payload(root, trees=('web', 'landing')):
    files = require_tracked(root, trees)
    payload = {p.relative_to(root).as_posix(): p.read_bytes() for p in files}
    refuse_unknown_scripts(payload)
    return payload


def namespace(payload, dependency=''):
    h = hashlib.sha256((FORMAT + dependency).encode())
    for name, data in sorted(payload.items()):
        h.update(name.encode()+b'\0'+len(data).to_bytes(8, 'big')+data)
    return h.hexdigest()


def immutable_payload(root, trees=('web', 'landing')):
    source = source_payload(root, trees)
    web_id = namespace({n: b for n, b in source.items() if n.startswith('web/')})
    landing_id = namespace({n: b for n, b in source.items() if n.startswith('landing/')}, web_id)
    prefixes = {'web': f'/astro/releases/{web_id}/', 'landing': f'/releases/{landing_id}/'}
    result = {}
    for name, data in source.items():
        tree, rel = name.split('/', 1)
        # Server policy belongs at the tree root; descendants inherit it.
        if rel == '.htaccess' or name in SERVER_SCRIPTS:
            result[name] = data
            continue
        result[f'{tree}/releases/{web_id if tree == "web" else landing_id}/{rel}'] = data
        if rel.endswith('.html'):
            text = data.decode('utf-8')
            def rewrite(m):
                url = m.group(2)
                target = target_of(name, url)
                if target is None or target.endswith('.html'):
                    return m.group()
                if target not in source:
                    if Path(target).suffix in ('.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.ico', '.woff', '.woff2'):
                        raise ValueError(f'{name}: referenced publication asset is missing: {url}')
                    return m.group()
                target_tree, target_rel = target.split('/', 1)
                parts = urlsplit(url)
                new = urlunsplit(('', '', prefixes[target_tree]+target_rel, parts.query, parts.fragment))
                return m.group()[:m.start(2)-m.start()] + new + m.group()[m.end(2)-m.start():]
            text = ATTR.sub(rewrite, text)
            def rewrite_meta(m):
                parts = urlsplit(m.group(3))
                target = target_of(name, parts.path)
                if target not in source or Path(target).suffix not in ('.png', '.jpg', '.jpeg', '.svg'):
                    return m.group()
                target_tree, target_rel = target.split('/', 1)
                url = urlunsplit((parts.scheme, parts.netloc, prefixes[target_tree]+target_rel, parts.query, parts.fragment))
                return m.group(1)+m.group(2)+url+m.group(2)
            result[name] = META_ASSET.sub(rewrite_meta, text).encode('utf-8')
            result[f'{tree}/releases/{web_id if tree == "web" else landing_id}/{rel}'] = result[name]
        elif name in ROOT_ENTRIES:
            # version.json: public status endpoint; the application fetches its
            # pinned snapshot. sw.js: a service worker controls only pages at or
            # below its own folder, so it must sit beside the /astro/ entry page.
            result[name] = data
    return result, {'format': FORMAT, 'web_namespace': web_id,
                    'landing_namespace': landing_id, 'source_files': hashes(source)}
