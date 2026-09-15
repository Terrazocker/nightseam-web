"""Review-only probe (L8): untrusted setup ZIP against a SCRATCH db + roots.

Nothing here touches the user's data/: `backup.data_dir` is patched to a
scratch folder and the scratch db's image_dir setting points into it too.
Run: python reviews/0.6.32-full/evidence/security/zip_hostile_probe.py
"""
from __future__ import annotations

import io
import json
import os
import shutil
import sys
import time
import tracemalloc
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

import app.backup as backup                                    # noqa: E402
from app.backup import _read_member, apply_import_zip          # noqa: E402
from app.database import Database                              # noqa: E402

SCRATCH = ROOT / "logs" / "review-l8-zip"
if SCRATCH.exists():
    shutil.rmtree(SCRATCH, ignore_errors=True)
(SCRATCH / "data" / "panos").mkdir(parents=True)
(SCRATCH / "archive").mkdir(parents=True)
OUTSIDE = SCRATCH / "OUTSIDE"
OUTSIDE.mkdir()


def make_db(name: str) -> Database:
    db = Database(SCRATCH / name)
    db.add_site("Original", 50.0, 8.0, 20.0)
    db.set_setting("image_dir", str(SCRATCH / "archive"))
    return db


def bundle(setup: dict, members: dict | None = None) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("setup.json", json.dumps(setup))
        for name, data in (members or {}).items():
            zf.writestr(name, data)
    return out.getvalue()


def base_setup(**kw) -> dict:
    s = {"app": "NightSeam", "settings": {}, "sites": [], "rigs": [],
         "panoramas": [], "customs": [], "images": []}
    s.update(kw)
    return s


def run(db: Database, blob: bytes):
    with patch.object(backup, "data_dir", lambda: SCRATCH / "data"):
        try:
            return {"ok": apply_import_zip(db, blob)}
        except Exception as exc:                                # noqa: BLE001
            return {"error": f"{type(exc).__name__}: {exc}"}


def escaped_files(root: Path) -> list[str]:
    """Every path under OUTSIDE (nothing should ever land here)."""
    return [str(p.relative_to(OUTSIDE)) for p in OUTSIDE.rglob("*") if p.is_file()]


results: dict = {}

# ---- 1. path traversal through panoramas[].file and images[].file ----------
HOSTILE = [
    "../../evil.jpg", "..\\..\\evil.jpg", "..%2f..%2fevil.jpg",
    "C:/evil.jpg", "C:x/evil.jpg", "//server/share/evil.jpg",
    "\\\\?\\C:\\evil.jpg", "/evil.jpg", "a/../../../evil.jpg",
    "sub/./../evil.jpg", "con", "nul.jpg", "a. ", "...", "..", ".",
    "", "a\x00b.jpg",
]
traversal = []
for i, rel in enumerate(HOSTILE):
    db = make_db(f"t{i}.db")
    s = base_setup(panoramas=[{"id": "p1", "name": "P", "file": rel}],
                   images=[{"id": 1, "file": rel}])
    r = run(db, bundle(s, {"panos/" + rel: b"x", "library/" + rel: b"x"}))
    kept = [p["file"] for p in db.panoramas()]
    traversal.append({"file": rel, "kept": kept, "result": r})
results["traversal"] = traversal

# ---- 2. hostile MEMBER names (zip-slip) with no matching record -----------
db = make_db("m.db")
members = {
    "../../evil1.jpg": b"x", "/evil2.jpg": b"x", "C:/evil3.jpg": b"x",
    "panos/../../evil4.jpg": b"x", "\\evil5.jpg": b"x",
}
r = run(db, bundle(base_setup(), members))
results["zip_member_slip"] = {"result": r, "escaped": escaped_files(OUTSIDE)}

# ---- 3. hostile panorama id, valid file: is the payload still written? ----
db = make_db("id.db")
s = base_setup(panoramas=[
    {"id": "..\\evil", "name": "evil", "file": "planted.jpg"},
    {"id": "ok1", "name": "ok", "file": "good.jpg"}])
r = run(db, bundle(s, {"panos/planted.jpg": b"planted",
                       "panos/good.jpg": b"good"}))
results["bad_id_valid_file"] = {
    "result": r,
    "rows": [p["file"] for p in db.panoramas()],
    "files_on_disk": sorted(p.name for p in (SCRATCH / "data" / "panos").glob("*")),
}

# ---- 4. Windows case-insensitive alias that safe_rel does NOT merge -------
db = make_db("alias.db")
s = base_setup(panoramas=[
    {"id": "a1", "name": "one", "file": "sub/A.jpg"},
    {"id": "a2", "name": "two", "file": "SUB/a.jpg"}])
r = run(db, bundle(s, {"panos/sub/A.jpg": b"FIRST", "panos/SUB/a.jpg": b"SECOND"}))
sub = SCRATCH / "data" / "panos" / "sub"
results["case_alias"] = {
    "result": r,
    "rows": [p["file"] for p in db.panoramas()],
    "files_on_disk": sorted(p.name for p in sub.glob("*")) if sub.is_dir() else [],
    "bytes": (sub / "A.jpg").read_bytes().decode("latin1") if (sub / "A.jpg").is_file() else None,
}

# ---- 5. control characters in a stored file name -------------------------
ctrl = []
for rel in ("a\x01b.jpg", "a\nb.jpg", "a\x1bb.jpg", "a\x7fb.jpg", "a\tb.jpg"):
    db = make_db("c.db")
    r = run(db, bundle(base_setup(panoramas=[{"id": "p", "name": "n", "file": rel}]),
                       {"panos/" + rel: b"x"}))
    rows = [p["file"] for p in db.panoramas()]
    ctrl.append({"file": repr(rel), "kept": rows, "error": r.get("error")})
results["control_chars"] = ctrl

# ---- 6. amplification: aggregate restored bytes vs zip bytes -------------
N, CHUNK = 10, 4 << 20
db = make_db("amp.db")
panos, members = [], {}
for i in range(N):
    name = f"p{i}.jpg"
    panos.append({"id": f"id{i}", "name": f"n{i}", "file": name})
    members["panos/" + name] = b"\0" * CHUNK
blob = bundle(base_setup(panoramas=panos), members)
t0 = time.time()
r = run(db, blob)
results["amplification"] = {
    "records": N, "zip_bytes": len(blob),
    "restored_bytes": r.get("ok", {}).get("pano_images", 0) * CHUNK,
    "seconds": round(time.time() - t0, 2),
    "summary": r.get("ok"),
    "ratio": round(N * CHUNK / len(blob), 1) if len(blob) else None,
}

# ---- 7. _read_member: peak RAM for the default 1 GiB limit ---------------
ram = {}
for label, limit, payload in (("within_limit", 8 << 20, b"\0" * (8 << 20)),
                              ("over_limit", 8 << 20, b"\0" * (24 << 20))):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("m.bin", payload)
    zf = zipfile.ZipFile(io.BytesIO(buf.getvalue()))
    tracemalloc.start()
    try:
        _read_member(zf, "m.bin", limit)
        err = None
    except ValueError as exc:
        err = str(exc)
    _cur, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    ram[label] = {"member_bytes": len(payload), "limit": limit,
                  "zip_bytes": len(buf.getvalue()),
                  "peak_ram_mb": round(peak / 1048576, 1), "error": err}
results["read_member_ram"] = ram
results["read_member_default_limit_bytes"] = backup.MAX_MEMBER_BYTES

# ---- 8. partial restore + recovery copy ---------------------------------
db = make_db("partial.db")
db.add_site("Keep me", 1.0, 2.0, 3.0)
s = base_setup(sites=[{"id": 1, "name": "Imported", "lat": 51.0, "lon": 7.0, "elev": 1}],
               panoramas=[{"id": "p1", "name": "P", "file": "fail.jpg"}])
original_write = Path.write_bytes


def fail_target(path: Path, data: bytes) -> int:
    if path.name == "fail.jpg":
        raise OSError("forced payload write failure")
    return original_write(path, data)


with patch.object(backup, "data_dir", lambda: SCRATCH / "data"), \
     patch.object(Path, "write_bytes", fail_target):
    try:
        apply_import_zip(db, bundle(s, {"panos/fail.jpg": b"payload"}))
        err = "NO ERROR"
    except Exception as exc:                                    # noqa: BLE001
        err = f"{type(exc).__name__}: {exc}"
results["partial_restore"] = {
    "error": err,
    "sites_after": [x["name"] for x in db.sites()],
    "panorama_rows_after": [p["file"] for p in db.panoramas()],
    "safety_copy": db.path.with_suffix(".backup-auto.zip").is_file(),
    "safety_copy_bytes": (db.path.with_suffix(".backup-auto.zip").stat().st_size
                          if db.path.with_suffix(".backup-auto.zip").is_file() else None),
    "original_file_recoverable": "Keep me" in json.dumps(
        json.loads(zipfile.ZipFile(db.path.with_suffix(".backup-auto.zip"))
                   .read("setup.json").decode())) if db.path.with_suffix(
                       ".backup-auto.zip").is_file() else False,
}

# ---- 9. bundle image_dir is ignored -------------------------------------
db = make_db("idir.db")
s = base_setup(settings={"image_dir": str(OUTSIDE / "redirect")})
r = run(db, bundle(s))
results["image_dir_ignored"] = {
    "summary": r.get("ok"), "db_image_dir": db.image_dir(),
    "outside_written": escaped_files(OUTSIDE),
}

# ---- 10. malformed element types: does the DB survive at all? ------------
survive = []
for label, setup in (
        ("panoramas_not_dict", base_setup(panoramas=["x"])),
        ("panoramas_null", base_setup(panoramas=[None])),
        ("sites_not_dict", base_setup(sites=["x"])),
        ("settings_list", base_setup(settings=[]))):
    db = make_db("s.db")
    db.add_site("Original", 50.0, 8.0, 20.0)
    r = run(db, bundle(setup))
    survive.append({"case": label, "error": r.get("error"),
                    "sites_after": [x["name"] for x in db.sites()]})
results["malformed_elements"] = survive

print(json.dumps(results, indent=1, ensure_ascii=True, default=str))
