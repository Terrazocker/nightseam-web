"""Local simulation of the documented static compression/cache policy.

This is preview tooling, not proof that Apache/nginx serves those headers live.
"""
from http.server import SimpleHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs
from pathlib import Path
import gzip
import hashlib
import io
import re
import threading


def cache_control(url):
    parsed = urlsplit(url)
    name = Path(parsed.path).name
    if name in ('version.json', 'catalog.manifest.json', 'catalog-provenance.manifest.json') or not Path(name).suffix or name.endswith('.html'):
        return 'public, max-age=0, must-revalidate'
    version = parse_qs(parsed.query).get('v', [''])[0]
    asset = re.search(r'\.(?:js|css|json|svg|png|jpe?g|ico|woff2?)$', name)
    baked = re.search(r'/(?:astro/)?core/[0-9a-f]{16}/[^/]+\.js$', parsed.path)
    if asset and (version.isdecimal() or baked):
        return 'public, max-age=31536000, immutable'
    return 'public, max-age=0, must-revalidate'


class DeliveryHandler(SimpleHTTPRequestHandler):
    _compressed = {}
    _lock = threading.Lock()

    def end_headers(self):
        self.send_header('Cache-Control', cache_control(self.path))
        self.send_header('Vary', 'Accept-Encoding')
        super().end_headers()

    def send_head(self):
        path = Path(self.translate_path(self.path))
        encodings = self.headers.get('Accept-Encoding', '').split(',')
        accepts = any(e.strip().split(';')[0] == 'gzip' and not re.search(r';\s*q=0(?:\.0*)?(?:\s|$)', e) for e in encodings)
        if not accepts or path.suffix.lower() not in ('.html','.js','.css','.json','.svg','.txt') or not path.is_file():
            return super().send_head()
        stat = path.stat()
        key = (str(path),stat.st_mtime_ns,stat.st_size)
        with self._lock:
            cached = self._compressed.get(key)
            if cached is None:
                data = gzip.compress(path.read_bytes(),compresslevel=6,mtime=0)
                cached = (data,'"'+hashlib.sha256(data).hexdigest()+'"')
                # Preview writes should not accumulate stale large JSON copies.
                for stale in [k for k in self._compressed if k[0] == str(path)]:
                    del self._compressed[stale]
                self._compressed[key] = cached
        data,etag = cached
        if self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag',etag)
            self.end_headers()
            return None
        self.send_response(200)
        self.send_header('Content-type',self.guess_type(str(path)))
        self.send_header('Content-Encoding','gzip')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Last-Modified',self.date_time_string(stat.st_mtime))
        self.send_header('ETag',etag)
        self.end_headers()
        return io.BytesIO(data)

    def log_message(self,*args):
        pass
