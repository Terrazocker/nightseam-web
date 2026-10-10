"""Boot and navigate the actual immutable publication payload in Chromium."""
from http.server import SimpleHTTPRequestHandler
from urllib.parse import urlsplit
import sys
from harness import ROOT, StaticServer, check
from web_suite import boot, tab
sys.path.insert(0, str(ROOT))
from scripts.prepare_publication import prepare, verify


class CandidateHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urlsplit(path)
        pathname = parsed.path
        routed = '/web/' + pathname[len('/astro/'): ] if pathname.startswith('/astro/') else '/landing/' + pathname.lstrip('/')
        return super().translate_path(routed)
    def log_message(self, *args): pass


@check('web-immutable-publication', 'web')
def immutable_publication(c):
    candidate = prepare(ROOT, 'local-browser-review')
    verify(ROOT)
    server = StaticServer(candidate, CandidateHandler)
    original = c.base
    requests = []
    listener = lambda request: requests.append(request.url)
    c.page.on('request', listener)
    try:
        public_base = server.start()
        c.base = public_base.rstrip('/') + '/astro/'
        boot(c)
        c.expect("dev build" not in c.page.locator("#foot-ver").inner_text(), "staged version loads successfully")
        tab(c, 'catalog')
        c.page.wait_for_selector('.cat tbody tr[data-id]', timeout=60000)
        with c.page.expect_download() as exported:
            c.page.locator('#cat-export-provenance').evaluate('el => el.click()')
        c.expect(exported.value.suggested_filename == 'nightseam-catalog-provenance.json', 'pinned provenance exports normally')
        tab(c, 'sky')
        c.page.wait_for_selector('#sky', timeout=30000)
        resources = [url for url in requests if url.startswith(public_base) and
                     urlsplit(url).path.endswith(('.js', '.css', '.json', '.png', '.svg'))]
        c.expect(resources, 'staged planner must request assets')
        c.expect(all('/releases/' in url for url in resources), 'every planner asset/data request must use its immutable namespace')
        c.expect(any('catalog.json' in url for url in resources), 'catalog must load from the release namespace')
        c.expect(any('catalog-provenance.json' in url for url in resources), 'provenance must load from the release namespace')
        c.expect(any('version.json' in url for url in resources), 'version must load from the release namespace')
        c.base = public_base
        c.goto('/about.html')
        c.page.wait_for_load_state('load')
        c.expect(c.page.locator('link[href*="/astro/releases/"][href*="themes.css"]').count() == 1,
                 'landing shares the pinned planner stylesheet')
        c.expect(c.page.locator('a[href="/astro/"]').count() > 0, 'planner navigation remains canonical')
        c.goto('/astro/image-credits.html')
        c.page.wait_for_load_state('load')
        c.expect(c.page.locator('link[href*="/astro/releases/"][href*="themes.css"]').count() == 1,
                 'secondary HTML entry points use the immutable graph')
        c.assert_clean()
    finally:
        c.page.remove_listener('request', listener)
        c.base = original
        server.stop()
