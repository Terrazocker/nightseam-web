"""Probe: does the public web planner issue the popularity source request at boot?

Serves web/ from a scratch HTTP server on a random loopback port, drives the real
system Chrome through Playwright, and ABORTS every non-loopback request before it
leaves the machine - the request attempt is the evidence, nothing is fetched.
"""
import functools
import http.server
import socketserver
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

WEB = Path(__file__).resolve().parents[4] / "web"


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(WEB)))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
print("serving", WEB, "on", port)

external = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()

    def route(r):
        url = r.request.url
        if "127.0.0.1" in url:
            r.continue_()
        else:
            external.append((r.request.method, url, r.request.resource_type))
            r.abort()

    page.route("**/*", route)
    page.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
    page.wait_for_timeout(6000)
    print("page title:", page.title())
    browser.close()

srv.shutdown()
print(f"non-loopback request attempts: {len(external)}")
for m, u, t in external:
    print(f"  {m} {u}  [{t}]")
