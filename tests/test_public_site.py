"""Public deployment paths and accessible static-page structure stay valid."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import struct

ROOT = Path(__file__).resolve().parents[1]
PAGES = ('index.html', 'features.html', 'catalog.html', 'about.html', 'download.html',
         'privacy.html', 'impressum.html')


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []
        self.ids = set()
        self.headings = 0
        self.canonical = []
        self.script_count = 0
        self.inline_styles = 0

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        if tag == 'h1':
            self.headings += 1
        if tag == 'script':
            self.script_count += 1
        if 'style' in attrs or tag == 'style':
            self.inline_styles += 1
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical.append(attrs['href'])
        for attribute in ('src', 'href'):
            if attribute in attrs:
                self.references.append(attrs[attribute])
        if tag == 'meta' and attrs.get('property') == 'og:image':
            self.references.append(attrs['content'])


def deployed_file(path):
    path = unquote(path)
    if path == '/astro' or path.startswith('/astro/'):
        base = ROOT / 'web'
        relative = path[len('/astro'):].lstrip('/')
    else:
        base = ROOT / 'landing'
        relative = path.lstrip('/')
    target = base / relative
    return target / 'index.html' if target.is_dir() else target


def test_public_links_assets_and_canonical_routes_are_deployable():
    for name in PAGES:
        page = Page()
        page.feed((ROOT / 'landing' / name).read_text(encoding='utf-8'))
        address = 'https://nightseam.de/' + ('' if name == 'index.html' else name)
        assert page.headings == 1
        assert page.canonical == [address]
        assert 'content' in page.ids
        assert page.script_count == 0, 'public navigation and disclosure must be native'
        assert page.inline_styles == 0, 'the page CSP blocks inline style attributes'
        for reference in page.references:
            resolved = urlsplit(urljoin(address, reference))
            if resolved.scheme != 'https' or resolved.netloc != 'nightseam.de':
                continue
            target = deployed_file(resolved.path)
            assert target.is_file(), f'{name}: broken local reference {reference}'
            if resolved.fragment and target == ROOT / 'landing' / name:
                assert resolved.fragment in page.ids


def test_real_home_share_preview_has_expected_dimensions():
    data = (ROOT / 'landing' / 'social-preview.png').read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II', data[16:24]) == (1200, 630)


def test_preview_mounts_site_and_planner_without_exposing_repository_files():
    from scripts.preview_site import PublicSiteHandler
    handler = PublicSiteHandler.__new__(PublicSiteHandler)
    handler.directory = str(ROOT / 'landing')
    assert Path(handler.translate_path('/features.html')) == ROOT / 'landing/features.html'
    assert Path(handler.translate_path('/astro/themes.css?v=16')) == ROOT / 'web/themes.css'
    for request in ('/../../../AGENTS.md', '/astro/../../../AGENTS.md'):
        path = Path(handler.translate_path(request)).resolve()
        assert path.is_relative_to(ROOT / 'landing') or path.is_relative_to(ROOT / 'web')
        assert path != ROOT / 'AGENTS.md'
