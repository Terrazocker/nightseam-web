"""Preview the public deployment layout: landing at /, browser planner at /astro/."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse
try:
    from .static_delivery import DeliveryHandler
except ImportError:  # direct script execution
    from static_delivery import DeliveryHandler

ROOT = Path(__file__).resolve().parents[1]


class PublicSiteHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        url_path = urlsplit(path).path
        previous = self.directory
        try:
            if url_path == '/astro' or url_path.startswith('/astro/'):
                self.directory = str(ROOT / 'web')
                path = url_path[len('/astro'):] or '/'
            else:
                self.directory = str(ROOT / 'landing')
            # The standard handler normalizes path segments within this directory.
            return super().translate_path(path)
        finally:
            self.directory = previous

    def log_message(self, *args):
        pass


class PerformanceSiteHandler(PublicSiteHandler, DeliveryHandler):
    send_head = DeliveryHandler.send_head
    end_headers = DeliveryHandler.end_headers


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--performance', action='store_true', help='simulate proposed gzip/cache delivery locally')
    args = parser.parse_args()
    ThreadingHTTPServer.request_queue_size = 64
    handler = PerformanceSiteHandler if args.performance else PublicSiteHandler
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(handler, directory=str(ROOT / 'landing')))
    print(f'NightSeam public preview: http://127.0.0.1:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
