"""Discover the same recursive cache graph for live files and Git snapshots."""
from pathlib import PurePosixPath
import posixpath
import re
from urllib.parse import urlsplit, parse_qs

ATTR = re.compile(r'\b(?:src|href)\s*=\s*([\"\'])(.*?)\1', re.I | re.S)
LEX = re.compile(r'//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]', re.S)


def references(name, text):
    if name.endswith('.html'):
        return [(m.start(2), m.end(2), m.group(2)) for m in ATTR.finditer(text)]
    if not name.endswith('.js'):
        return []
    tokens = [m for m in LEX.finditer(text) if not m.group().startswith(('//', '/*'))]
    refs = []
    for i, m in enumerate(tokens):
        value = m.group()
        if value[:1] not in ('"', "'", '`') or '${' in value:
            continue
        before = tokens[i-1].group() if i else ''
        before2 = tokens[i-2].group() if i > 1 else ''
        if before in ('from', 'import') or (before == '(' and before2 == 'import'):
            refs.append((m.start()+1, m.end()-1, value[1:-1]))
    return refs


def target_of(source, url):
    parts = urlsplit(url)
    if parts.scheme or parts.netloc or not parts.path:
        return None
    if parts.path.startswith('/astro/'):
        target = 'web/' + parts.path[len('/astro/'):]
    elif parts.path.startswith('/'):
        target = 'landing/' + parts.path.lstrip('/')
    else:
        target = posixpath.join(posixpath.dirname(source), parts.path)
    target = posixpath.normpath(target)
    if not target.startswith(('web/', 'landing/')):
        return None
    return target


def module_name(path):
    return path[4:] if path.startswith('web/') else '../' + path


class Graph:
    def __init__(self, roots, read):
        self.texts, self.refs, self.tokens, self.problems = {}, {}, {}, []
        pending = list(roots)
        seen = set()
        while pending:
            name = pending.pop()
            if name in seen:
                continue
            seen.add(name)
            data = read(name)
            if data is None:
                self.problems.append(f'{name} is referenced but does not exist')
                continue
            text = data.decode('utf-8')
            self.texts[name] = text
            refs = []
            for start, end, url in references(name, text):
                target = target_of(name, url)
                if target is None or PurePosixPath(target).suffix not in ('.js', '.css'):
                    continue
                values = parse_qs(urlsplit(url).query).get('v', [])
                immutable = bool(re.fullmatch(r'web/core/[0-9a-f]{16}/.+\.js', target))
                if not values and immutable:
                    pending.append(target)
                    continue
                if len(values) != 1 or not values[0].isdigit():
                    self.problems.append(f'{name}: {url} needs one numeric cache token')
                else:
                    token = values[0]
                    key = module_name(target)
                    prior = self.tokens.get(key)
                    if prior is not None and prior != token:
                        self.problems.append(f'{target} has conflicting cache tokens {prior} and {token}')
                    else:
                        self.tokens[key] = token
                    refs.append((start, end, target, url))
                pending.append(target)
            self.refs[name] = refs
        self.contents = {key: read(posixpath.normpath('web/' + key)) for key in self.tokens
                         if read(posixpath.normpath('web/' + key)) is not None}


def live_graph(root):
    root = root.resolve()
    roots = [p.relative_to(root).as_posix() for folder in ('web', 'landing')
             for p in (root/folder).rglob('*.html')
             if not any(part in ('dev', 'node_modules') for part in p.parts)]
    def read(name):
        path = root/name
        return path.read_bytes() if path.is_file() else None
    return Graph(roots, read)
