"""Review-only probe (L8): local HTTP API reachability, guards, error leaks.

Runs create_app(db, prefetch=False) against a SCRATCH db under logs/ - never the
user's data/. Writes nothing outside the scratch dir. Uses a real uvicorn server
on an ephemeral port and raw http.client requests, so the Host/Origin/Sec-Fetch
guards see exactly what a browser would send.
"""
from __future__ import annotations

import http.client
import json
import socket
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

import uvicorn                                                   # noqa: E402
from app.database import Database                                # noqa: E402
from app.server import create_app                                # noqa: E402

SCRATCH = ROOT / "logs" / "review-l8-http"
SCRATCH.mkdir(parents=True, exist_ok=True)
db = Database(SCRATCH / "nightseam.db")
app = create_app(db, prefetch=False)

sock = socket.socket()
sock.bind(("127.0.0.1", 0))
port = sock.getsockname()[1]
sock.close()

config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error",
                        access_log=False, lifespan="off", ws="none",
                        log_config=None)
server = uvicorn.Server(config)
threading.Thread(target=server.run, daemon=True).start()
for _ in range(100):
    try:
        with socket.create_connection(("127.0.0.1", port), 0.2):
            break
    except OSError:
        time.sleep(0.05)


def req(method: str, path: str, headers: dict | None = None, body: bytes | None = None,
        host: str | None = None):
    h = dict(headers or {})
    if host is not None:
        h["Host"] = host
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    c.request(method, path, body=body, headers=h)
    r = c.getresponse()
    data = r.read()
    out = {"status": r.status, "len": len(data),
           "cors": r.getheader("access-control-allow-origin"),
           "body": data[:220].decode("utf-8", "replace")}
    c.close()
    return out


results = {}

# 1. plain loopback client (no browser headers at all) - the normal case
results["plain_get_state"] = req("GET", "/api/state")

# 2. a random web page the user visits: cross-site simple GET (img/script tag)
results["crosssite_get_shutdown"] = req(
    "GET", "/api/shutdown",
    {"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"})

# 3. same probe with a forged same-origin pair (should be allowed -> proves the
#    guard is the ONLY thing standing between a cross-site page and shutdown)
results["fake_sameorigin_get_shutdown"] = req(
    "GET", "/api/shutdown",
    {"Sec-Fetch-Site": "same-origin", "Origin": f"http://127.0.0.1:{port}"})

# 4. DNS rebinding: Host header that is not loopback
results["rebind_host"] = req("GET", "/api/state", host="evil.example")

# 5. cross-site form POST (a SIMPLE request - no CORS preflight)
results["crosssite_form_post_settings"] = req(
    "POST", "/api/settings", {"Content-Type": "application/x-www-form-urlencoded",
                              "Sec-Fetch-Site": "cross-site",
                              "Origin": "https://evil.example"},
    body=b"bortle=9")

# 6. cross-site multipart POST /api/import (multipart/form-data is ALSO simple)
results["crosssite_multipart_import"] = req(
    "POST", "/api/import",
    {"Content-Type": "multipart/form-data; boundary=x",
     "Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"},
    body=b"--x--\r\n")

# 7. nothing at all (no Sec-Fetch-Site, no Origin) - an old browser or a
#    non-browser client: does a state-changing GET still work?
results["no_headers_get_shutdown"] = req("GET", "/api/shutdown")

# 8. deleted planning routes must 404
results["deleted_night"] = req("GET", "/api/night?lat=51&lon=7")
results["deleted_object"] = req("GET", "/api/object/ngc1976")

# 9. does an error body leak the filesystem layout?
results["export_error_path_leak"] = req("GET", "/api/export")
results["state_leaks_image_dir"] = req("GET", "/api/state")

# 10. API surface without auth: the whole setup ZIP
results["plain_get_export"] = req("GET", "/api/export")

print(json.dumps(results, indent=1))

# a readable summary of the interesting bits
summary = {k: {"status": v["status"], "len": v["len"], "cors": v["cors"]}
           for k, v in results.items()}
print(json.dumps(summary, indent=1))
try:
    state = json.loads(results["state_leaks_image_dir"]["body"].decode()[:0] or "{}")
except Exception:
    state = {}
server.should_exit = True
time.sleep(0.4)
