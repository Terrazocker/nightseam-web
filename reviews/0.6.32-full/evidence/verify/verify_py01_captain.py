"""Captain's INDEPENDENT reproduction of PY-01 (review blocker claim).

Does NOT reuse the python lane's probe. Drives only the public HTTP API and
manufactures the collision the finding describes:

  1. ingest an unresolved object            -> folder "Unk B/"
  2. rename it to "NGC 7000"                -> folder "NGC 7000/" now EXISTS
  3. ingest a second unresolved object with the SAME file name and the same
     capture night                          -> folder "Unk C/.../Light_001.fit"
  4. rename "Unk C" to "NGC 7000"           -> old != new, new already exists

Step 4 is exactly the `new.exists()` merge branch (app/ingest.py:215-221).
The frames are distinguished by EXPTIME, so the surviving bytes identify which
file won.

Expected if the finding is real:
  * the destination frame's bytes are gone (its 60 s replaced by the 120 s one),
  * the file count drops by one,
  * two library rows now point at the SAME path.

Anything else and the claim must be refuted.

Scratch lives under logs/ (gitignored, sandbox-owned); never data/.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Database  # noqa: E402
from app.server import create_app  # noqa: E402

SCRATCH = ROOT / "logs" / "review-py01-verify"
BLOCK = 2880


def fits(object_name: str, exptime: float, date_obs: str) -> bytes:
    recs = [
        ("SIMPLE", "T"),
        ("OBJECT", f"'{object_name:<26}'"),
        ("EXPTIME", str(exptime)),
        ("DATE-OBS", f"'{date_obs}'"),
        ("IMAGETYP", "'Light Frame'"),
    ]
    block = bytearray()
    for k, v in recs:
        block += f"{k:<8}= {v}".encode("latin-1").ljust(80)[:80]
    block += b"END".ljust(80)
    block += b" " * (-len(block) % BLOCK)
    return bytes(block)


def read_exptime(path: Path) -> str | None:
    raw = path.read_bytes()[:BLOCK]
    for i in range(0, len(raw) - 80, 80):
        card = raw[i:i + 80].decode("latin-1")
        if card.startswith("EXPTIME"):
            return card.split("=", 1)[1].split("/")[0].strip()
    return None


def main() -> int:
    shutil.rmtree(SCRATCH, ignore_errors=True)
    SCRATCH.mkdir(parents=True)
    archive = SCRATCH / "archive"
    archive.mkdir()

    db = Database(SCRATCH / "nightseam.db")
    db.set_setting("image_dir", str(archive))

    date_obs = "2026-08-22T23:14:05"
    out: dict = {"archive": str(archive), "steps": []}

    def files() -> list[str]:
        return sorted(str(p.relative_to(archive)).replace("\\", "/")
                      for p in archive.rglob("*") if p.is_file())

    def ingest(name: str, exptime: float):
        return TestClient(create_app(db, prefetch=False)).__enter__() if False else None

    with TestClient(create_app(db, prefetch=False)) as c:
        def upload(obj: str, exptime: float):
            return c.post("/api/images/ingest", files=[
                ("files", ("Light_001.fit", fits(obj, exptime, date_obs),
                           "application/octet-stream"))])

        # 1 + 2: create the destination folder "NGC 7000" via a legitimate rename
        r1 = upload("Unk B", 60.0)
        r2 = c.post("/api/library/edit",
                    json={"name": "Unk B", "new_name": "NGC 7000"})
        out["steps"].append({"ingest_B": r1.status_code, "rename_B": r2.status_code,
                             "body_B": r2.json()})

        # 3: the second unresolved object, same file name, same night
        r3 = upload("Unk C", 120.0)
        out["steps"].append({"ingest_C": r3.status_code})

        dest = None
        for rel in files():
            if rel.startswith("NGC 7000/"):
                dest = rel
        out["destination_before"] = dest
        out["destination_exptime_before"] = read_exptime(archive / dest) if dest else None
        out["files_before_edit"] = files()

        # 4: the merge branch
        r4 = c.post("/api/library/edit",
                    json={"name": "Unk C", "new_name": "NGC 7000"})
        out["steps"].append({"merge_edit": r4.status_code, "body": r4.json()})

        after = files()
        out["files_after_edit"] = after
        out["files_after_detail"] = [
            {"rel": rel, "exptime": read_exptime(archive / rel)} for rel in after]

        rows = db.images()
        out["rows_after"] = [
            {"object_name": i["object_name"], "object_id": i.get("object_id"),
             "file": i["file"], "exposure": i.get("exposure")} for i in rows]
        paths = [i["file"] for i in rows]
        out["aliased_files"] = sorted({p for p in paths if paths.count(p) > 1})

        lib = c.get("/api/library").json()
        out["groups_after"] = [
            {"name": g["name"], "object_id": g.get("object_id"),
             "n_frames": g.get("n_frames")} for g in lib["objects"]]

    before, after = out["files_before_edit"], out["files_after_edit"]
    surviving = [f for f in out["files_after_detail"] if f["rel"].startswith("NGC 7000/")]
    out["VERDICT"] = {
        "merge_branch_taken": out["steps"][2].get("merge_edit") == 200,
        "files_before": len(before),
        "files_after": len(after),
        "files_destroyed": len(before) - len(after),
        "destination_exptime_before": out["destination_exptime_before"],
        "destination_exptime_after": surviving[0]["exptime"] if surviving else None,
        "aliased_file_count": len(out["aliased_files"]),
        "blocker_reproduced": bool(len(before) - len(after) > 0 and out["aliased_files"]),
    }
    print(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
