"""L1 probe: untrusted paths + HTTP contract of the local API.

Every write goes to logs/review-py-lane/. `os.startfile` is replaced by a
recorder, so the folder-open guard can be exercised without launching Explorer.

Run from the repo root:
    python reviews/0.6.32-full/evidence/python/probe_http_contract.py
"""
from __future__ import annotations

import io
import json
import os
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient          # noqa: E402

import app.server as server                        # noqa: E402
from app.backup import apply_import_zip            # noqa: E402
from app.database import Database                  # noqa: E402

SCRATCH = ROOT / "logs" / "review-py-lane" / "http"
shutil.rmtree(SCRATCH, ignore_errors=True)
SCRATCH.mkdir(parents=True, exist_ok=True)

SECRET = SCRATCH / "outside-secret.txt"
SECRET.write_text("TOPSECRET")

db = Database(SCRATCH / "nightseam.db")
ARCHIVE = SCRATCH / "archive"
ARCHIVE.mkdir(parents=True, exist_ok=True)
db.set_setting("image_dir", str(ARCHIVE))
client = TestClient(server.create_app(db, prefetch=False),
                    raise_server_exceptions=False)


def show(label, r):
    body = r.text[:100].replace("\n", " ")
    print(f"{label:<58} -> {r.status_code} {body}")


print("== deleted planning routes and unknown routes ==")
for path in ("/api/night", "/api/object/ngc1976", "/api/nope"):
    show(f"GET {path}", client.get(path))

print("== static mount traversal (must not serve app/ or data/) ==")
for path in ("/../AGENTS.md", "/%2e%2e/AGENTS.md", "/..%2fAGENTS.md",
             "/js/../../AGENTS.md", "/%2e%2e%2fAGENTS.md",
             "/....//AGENTS.md", "/subdir/../../AGENTS.md"):
    show(f"GET {path}", client.get(path))

print("== site validation ==")
for payload in ({"name": "x", "lat": 999, "lon": 0, "elev": 0},
                {"name": "x", "lat": 51.0, "lon": 0, "elev": 0},
                {"name": "x", "lat": "abc", "lon": 0, "elev": 0},
                {"name": "x", "lat": None, "lon": 0, "elev": 0}):
    show(f"POST /api/sites {payload}", client.post("/api/sites", json=payload))

sid = db.sites()[0]["id"]
show("PUT /api/sites/<id> lat=1e400",
     client.put(f"/api/sites/{sid}",
                content='{"name":"x","lat":1e400,"lon":0,"elev":0}',
                headers={"Content-Type": "application/json"}))

print("== custom target with a non-finite magnitude (raw JSON) ==")
show("POST /api/catalog/custom vmag=inf",
     client.post("/api/catalog/custom",
                 content=json.dumps({"name": "x", "ra": "5", "dec": "20",
                                     "vmag": 1e400}),
                 headers={"Content-Type": "application/json"}))
show("POST /api/catalog/custom ra=99",
     client.post("/api/catalog/custom", json={"name": "x", "ra": "99", "dec": "20"}))
show("DELETE /api/catalog/custom/ngc1976", client.delete("/api/catalog/custom/ngc1976"))

print("== panorama ids that could act as a path ==")
for pid in ("..%5Cevil", "..%2Fevil", "a%00b", "..", "x."):
    show(f"DELETE /api/panorama/{pid}", client.delete(f"/api/panorama/{pid}"))
    show(f"GET /api/panorama/{pid}/image", client.get(f"/api/panorama/{pid}/image"))

print("== thumb=1 must never touch the network ==")
called = {"network": 0}
import app.images as images                        # noqa: E402
real_urlopen = images.urllib.request.urlopen


def no_network(*a, **k):
    called["network"] += 1
    raise AssertionError("thumb=1 reached the network")


images.urllib.request.urlopen = no_network
try:
    r = client.get("/api/object/ngc1976/image?thumb=1")
    show("GET /api/object/ngc1976/image?thumb=1", r)
finally:
    images.urllib.request.urlopen = real_urlopen
print(f"    network calls during thumb=1: {called['network']}")

print("== image preview / library ==")
show("GET /api/images/0/preview", client.get("/api/images/0/preview"))
show("GET /api/images/-1/preview", client.get("/api/images/-1/preview"))
show("GET /api/images/999999999999999999999/preview",
     client.get("/api/images/999999999999999999999/preview"))
show("GET /api/library/export?format=xml", client.get("/api/library/export?format=xml"))
show("POST /api/library/edit empty name", client.post("/api/library/edit",
                                                      json={"name": "  "}))

print("== folder-open guard (os.startfile recorded, never launched) ==")
opened: list = []
real_startfile = os.startfile
os.startfile = lambda p: opened.append(str(p))
try:
    for rel in (".", "..", "../..", str(SECRET.parent), "C:/Windows",
                "C:/Windows/System32", "//server/share", "NUL",
                "archive", "sub/dir"):
        r = client.post("/api/library/open_folder", json={"rel": rel})
        print(f"    rel={rel!r:<22} -> {r.status_code} {r.text[:60]}")
finally:
    os.startfile = real_startfile
print(f"    os.startfile called with: {opened}")

print("== a hostile bundle: absolute / traversal / duplicate paths ==")


def bundle(panos, images_rows, members):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("setup.json", json.dumps({
            "app": "NightSeam",
            "settings": {"image_dir": str(SECRET.parent)},
            "sites": [], "rigs": [], "panoramas": panos, "customs": [],
            "images": images_rows}))
        for name, payload in members:
            zf.writestr(name, payload)
    return out.getvalue()


def pano(pid, fname):
    return {"id": pid, "name": pid, "file": fname, "strokes": [],
            "profile": [], "profile_top": []}


CASES = [
    ("absolute posix path", [pano("p1", "/etc/passwd")], [], []),
    ("drive-absolute path", [pano("p1", "C:/Windows/win.ini")], [], []),
    ("traversal path", [pano("p1", "../../outside-secret.txt")], [], []),
    ("windows traversal", [pano("p1", "..\\..\\outside-secret.txt")], [], []),
    ("device name", [pano("p1", "NUL")], [], []),
    ("trailing-dot segment", [pano("p1", "evil./x.jpg")], [], []),
    ("non-token pano id", [pano("../evil", "ok.jpg")], [],
     [("panos/ok.jpg", b"x")]),
    ("duplicate normalized paths",
     [pano("p1", "a/./b.jpg"), pano("p2", "a//b.jpg")], [], []),
    ("custom id with a path", [], [], []),
]
for label, panos, imgs, members in CASES:
    case = SCRATCH / ("bundle-" + label.replace(" ", "-"))
    case.mkdir(parents=True, exist_ok=True)
    d2 = Database(case / "nightseam.db")
    d2.set_setting("image_dir", str(case / "archive"))
    blob = bundle(panos, imgs, members)
    if label == "custom id with a path":
        blob = None
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("setup.json", json.dumps({
                "app": "NightSeam",
                "settings": {"image_dir": str(case / "archive")},
                "sites": [], "rigs": [], "panoramas": [],
                "customs": [{"id": "u_../../evil", "primary_name": "evil",
                             "ra_hours": 1.0, "dec_deg": 2.0}],
                "images": []}))
        blob = out.getvalue()
    try:
        summary = apply_import_zip(d2, blob)
        result = f"summary {summary}"
    except ValueError as exc:
        result = f"ValueError: {exc}"
    stored = [p["file"] for p in d2.panoramas()]
    customs = [c["id"] for c in d2.customs()]
    print(f"    {label:<28} -> {result[:110]}")
    if stored or customs:
        print(f"        stored panos={stored} customs={customs}")
    d2.conn.close()

outside_files = [p.name for p in SCRATCH.iterdir() if p.is_file()]
print(f"    files written next to the scratch db: {outside_files}")
print(f"    SECRET intact: {SECRET.read_text() == 'TOPSECRET'}")
db.conn.close()
