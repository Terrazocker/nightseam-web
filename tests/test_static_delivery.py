"""Real transfer negotiation and token-aware cache behavior of local simulation."""
import gzip
import threading
import urllib.request
import urllib.error
from functools import partial
from http.server import ThreadingHTTPServer
import pytest
from scripts.static_delivery import DeliveryHandler, cache_control


@pytest.mark.parametrize('url,immutable', [
    ('/astro/app.js?v=157',True),('/style.css?v=4',True),('/astro/catalog.json?v=1',True),
    ('/astro/core/0123456789abcdef/index.js',True),('/astro/',False),('/index.html?v=7',False),
    ('/astro/version.json?v=9',False),('/astro/catalog.manifest.json?v=9',False),
    ('/astro/catalog-provenance.manifest.json?v=9',False),('/app.js',False),('/app.js?v=no',False),
])
def test_entry_and_manifest_freshness(url,immutable):
    assert ('immutable' in cache_control(url)) == immutable
    assert 'no-store' not in cache_control(url)


def test_gzip_decoded_bytes_etag_and_identity(tmp_path,monkeypatch):
    data=b'catalog source data '*2000
    (tmp_path/'catalog.json').write_bytes(data)
    calls=[]
    original=gzip.compress
    def compress(*args,**kwargs):
        calls.append(1)
        return original(*args,**kwargs)
    monkeypatch.setattr(gzip,'compress',compress)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(DeliveryHandler,directory=str(tmp_path)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/catalog.json?v=1'
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'Accept-Encoding':'gzip'})) as r:
            compressed=r.read()
            assert r.headers['Content-Encoding']=='gzip'
            assert r.headers['Vary']=='Accept-Encoding'
            assert 'immutable' in r.headers['Cache-Control']
            etag=r.headers['ETag']
        assert len(compressed)<len(data)//4 and gzip.decompress(compressed)==data
        with pytest.raises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(urllib.request.Request(url,headers={'Accept-Encoding':'gzip','If-None-Match':etag}))
        assert err.value.code==304
        assert len(calls)==1, 'distinct request handlers reuse compressed bytes'
        with urllib.request.urlopen(urllib.request.Request(url,headers={'Accept-Encoding':'gzip;q=0'})) as r:
            assert r.read()==data
            assert r.headers.get('Content-Encoding') is None
        (tmp_path/'catalog.json').write_bytes(data+b'updated')
        with urllib.request.urlopen(urllib.request.Request(url,headers={'Accept-Encoding':'gzip'})) as r:
            assert gzip.decompress(r.read())==data+b'updated'
        assert len(calls)==2, 'file changes invalidate only that compressed representation'
    finally:
        server.shutdown();server.server_close()
