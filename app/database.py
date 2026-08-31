"""SQLite storage: seeded DSO catalog + user data (sites, rigs, panoramas, settings)."""

from __future__ import annotations

import json
import shutil
import sqlite3
import threading
import time
import uuid
from datetime import datetime, UTC
from pathlib import Path

from . import catalog_data

SCHEMA = """
CREATE TABLE IF NOT EXISTS objects (
    id TEXT PRIMARY KEY,
    primary_name TEXT,
    messier TEXT, ngcic TEXT, other TEXT,
    otype TEXT,
    ra_hours REAL, dec_deg REAL,
    vmag REAL, size_am TEXT,
    constellation TEXT,
    distance TEXT,
    wiki TEXT,
    blurb TEXT,
    search TEXT
);
CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    elev INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rigs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    focal_mm REAL NOT NULL,
    sensor_w REAL NOT NULL,
    sensor_h REAL NOT NULL,
    fov_w REAL NOT NULL,
    fov_h REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_objects (
    id TEXT PRIMARY KEY,
    primary_name TEXT NOT NULL,
    otype TEXT NOT NULL DEFAULT 'galaxy',
    ra_hours REAL NOT NULL,
    dec_deg REAL NOT NULL,
    vmag REAL,
    size_am TEXT DEFAULT '',
    constellation TEXT DEFAULT '',
    blurb TEXT DEFAULT '',
    search TEXT
);
CREATE TABLE IF NOT EXISTS panoramas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file TEXT NOT NULL,
    az_offset REAL NOT NULL DEFAULT 0,
    alt_bottom REAL NOT NULL DEFAULT 0,
    alt_top REAL NOT NULL DEFAULT 60,
    strokes TEXT NOT NULL DEFAULT '[]',
    profile TEXT NOT NULL DEFAULT '[]',
    profile_top TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    paint_mode TEXT NOT NULL DEFAULT 'obstacle'
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT NOT NULL,
    orig_name TEXT NOT NULL,
    object_id TEXT,
    object_name TEXT NOT NULL,
    otype TEXT,
    ra_hours REAL,
    dec_deg REAL,
    exposure REAL,
    date_obs TEXT,
    filter TEXT,
    telescope TEXT,
    imagetyp TEXT,
    ingested_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_id TEXT NOT NULL,
    date_obs TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    object_id TEXT,
    object_name TEXT NOT NULL,
    slug TEXT NOT NULL,
    session TEXT NOT NULL,
    frame TEXT NOT NULL,
    n_files INTEGER NOT NULL,
    total_exposure REAL NOT NULL DEFAULT 0,
    first_obs TEXT,
    image_dir TEXT NOT NULL,
    run_id TEXT
);
CREATE TABLE IF NOT EXISTS advanced_objects (
    id TEXT PRIMARY KEY,
    primary_name TEXT,
    messier TEXT, ngcic TEXT, other TEXT,
    otype TEXT,
    ra_hours REAL, dec_deg REAL,
    vmag REAL, size_am TEXT,
    constellation TEXT,
    distance TEXT,
    wiki TEXT,
    blurb TEXT,
    search TEXT
);
"""


class Database:
    def __init__(self, db_path: Path):
        self.path = db_path
        # reentrant: read methods wrap their queries too, so the shared
        # sqlite connection is never used from two threads at once
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        # NOTE: databases outlive the code (users carry them between
        # versions), so schema evolution MUST be additive: new tables go
        # into SCHEMA (CREATE TABLE IF NOT EXISTS), new columns use the
        # try/ALTER/except pattern below. Never drop or re-shape existing
        # columns - old user DBs will break. Seed tables are insert-only.
        try:  # migration for databases created before fov existed
            self.conn.execute("ALTER TABLE panoramas ADD COLUMN fov REAL NOT NULL DEFAULT 360")
        except sqlite3.OperationalError:
            pass
        try:  # migration: user-defined type for ingested images
            self.conn.execute("ALTER TABLE images ADD COLUMN otype TEXT")
        except sqlite3.OperationalError:
            pass
        try:  # migration: frame classification (light/bias/dark/flat)
            self.conn.execute("ALTER TABLE images ADD COLUMN imagetyp TEXT")
        except sqlite3.OperationalError:
            pass
        try:  # migration: inverse painting mode ('obstacle' | 'sky')
            self.conn.execute(
                "ALTER TABLE panoramas ADD COLUMN paint_mode "
                "TEXT NOT NULL DEFAULT 'obstacle'")
        except sqlite3.OperationalError:
            pass
        try:  # migration: upper ceiling for sky-mode bands (blocked above)
            self.conn.execute(
                "ALTER TABLE panoramas ADD COLUMN profile_top "
                "TEXT NOT NULL DEFAULT '[]'")
        except sqlite3.OperationalError:
            pass
        try:  # migration: import-run marker for merging chunked uploads
            self.conn.execute("ALTER TABLE import_batches ADD COLUMN run_id TEXT")
        except sqlite3.OperationalError:
            pass
        self.conn.commit()
        self.seed_catalog()
        self.seed_advanced_catalog()
        self.make_backup()

    def make_backup(self) -> None:
        """Keep one rolling backup of the user database next to the original."""
        try:
            if self.path.exists() and self.path.stat().st_size > 0:
                shutil.copyfile(self.path, str(self.path) + ".backup")
        except OSError:
            pass

    # ---------------- catalog ----------------

    def seed_catalog(self):
        with self.lock:
            cur = self.conn.execute("SELECT COUNT(*) FROM objects")
            if cur.fetchone()[0] >= len(catalog_data.rows()):
                return
            rows = catalog_data.rows()
            self.conn.executemany(
                """INSERT OR IGNORE INTO objects VALUES
                   (:id,:primary_name,:messier,:ngcic,:other,:otype,:ra_hours,:dec_deg,
                    :mag,:size,:constellation,:distance,:wiki,:blurb,:search)""",
                [dict(r, primary_name=r["primary"], otype=r["type"]) for r in rows],
            )
            self.conn.commit()

    def all_objects(self, advanced: bool = False) -> list[dict]:
        with self.lock:
            builtin = [dict(r) for r in self.conn.execute(
                "SELECT * FROM objects ORDER BY messier IS NULL, "
                "CAST(SUBSTR(messier,2) AS INTEGER), id")]
            custom = [dict(r) for r in self.conn.execute(
                "SELECT * FROM custom_objects ORDER BY primary_name")]
            out = custom + builtin
            if advanced:
                adv = [dict(r) for r in self.conn.execute(
                    "SELECT * FROM advanced_objects ORDER BY id")]
                for r in adv:
                    r["_adv"] = True
                out.extend(adv)
        return out

    def advanced_count(self) -> int:
        with self.lock:
            r = self.conn.execute(
                "SELECT COUNT(*) FROM advanced_objects").fetchone()
            return r[0]

    def seed_advanced_catalog(self):
        """Bulk-load the bundled OpenNGC-derived catalog (app/data/openned.csv)
        into advanced_objects. Insert-only; safe to run on every start."""
        import csv as csvmod
        from .paths import resource_dir
        csv_path = resource_dir() / "app" / "data" / "openned.csv"
        if not csv_path.exists():
            return
        expected = _csv_adv_count(csv_path)
        if self.advanced_count() >= expected:
            return
        cols = ("id", "primary_name", "messier", "ngcic", "other", "otype",
                "ra_hours", "dec_deg", "vmag", "size_am", "constellation",
                "distance", "wiki", "blurb", "search")
        rows = []
        with open(csv_path, encoding="utf-8") as f:
            for line in f:
                if line.startswith("#"):
                    continue
                vals = line.rstrip("\n").split(";")
                if len(vals) != len(cols):
                    continue
                d = dict(zip(cols, vals))
                try:
                    d["ra_hours"] = float(d["ra_hours"]) if d["ra_hours"] else None
                    d["dec_deg"] = float(d["dec_deg"]) if d["dec_deg"] else None
                    d["vmag"] = float(d["vmag"]) if d["vmag"] else None
                except ValueError:
                    continue          # malformed row - skip, don't crash boot
                rows.append(tuple(d[c] for c in cols))
        with self.lock:
            self.conn.executemany(
                "INSERT OR IGNORE INTO advanced_objects VALUES "
                f"({','.join('?' * len(cols))})", rows)
            self.conn.commit()

    def get_object(self, oid: str) -> dict | None:
        with self.lock:
            r = self.conn.execute("SELECT * FROM objects WHERE id=?",
                                  (oid,)).fetchone()
            if r:
                return dict(r)
            r = self.conn.execute("SELECT * FROM custom_objects WHERE id=?",
                                  (oid,)).fetchone()
            if not r:
                r = self.conn.execute(
                    "SELECT * FROM advanced_objects WHERE id=?",
                    (oid,)).fetchone()
            if not r:
                return None
            d = dict(r)
        # normalize to the shape the rest of the app expects
        for k in ("messier", "ngcic", "other"):
            d.setdefault(k, "")
        for k in ("distance", "wiki"):
            d.setdefault(k, None)
        return d

    # ---------------- custom objects ----------------

    def add_custom(self, d: dict) -> str:
        search = " | ".join(filter(None, [
            d["primary_name"].lower(),
            (d.get("otype") or "").lower(),
            "custom", d.get("id"),
        ]))
        with self.lock:
            self.conn.execute(
                "INSERT OR REPLACE INTO custom_objects"
                "(id,primary_name,otype,ra_hours,dec_deg,vmag,size_am,"
                "constellation,blurb,search) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (d["id"], d["primary_name"], d.get("otype", "galaxy"),
                 d["ra_hours"], d["dec_deg"], d.get("vmag"),
                 d.get("size_am") or "", d.get("constellation") or "",
                 d.get("blurb") or "", search))
            self.conn.commit()
        return d["id"]

    def delete_custom(self, cid: str):
        with self.lock:
            self.conn.execute("DELETE FROM custom_objects WHERE id=?", (cid,))
            self.conn.commit()

    def customs(self) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(
                "SELECT * FROM custom_objects ORDER BY primary_name")]

    def is_custom(self, cid: str) -> bool:
        with self.lock:
            r = self.conn.execute(
                "SELECT 1 FROM custom_objects WHERE id=?", (cid,)).fetchone()
            return r is not None

    # ---------------- sites ----------------

    def sites(self) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(
                "SELECT * FROM sites ORDER BY id")]

    def add_site(self, name: str, lat: float, lon: float, elev: int) -> int:
        with self.lock:
            c = self.conn.execute(
                "INSERT INTO sites(name,lat,lon,elev) VALUES(?,?,?,?)",
                (name, lat, lon, elev))
            self.conn.commit()
            return c.lastrowid

    def delete_site(self, sid: int):
        with self.lock:
            self.conn.execute("DELETE FROM sites WHERE id=?", (sid,))
            self.conn.commit()

    def update_site(self, sid: int, name: str, lat: float, lon: float, elev: int):
        with self.lock:
            self.conn.execute(
                "UPDATE sites SET name=?,lat=?,lon=?,elev=? WHERE id=?",
                (name, lat, lon, elev, sid))
            self.conn.commit()

    # ---------------- rigs ----------------

    def rigs(self) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(
                "SELECT * FROM rigs ORDER BY id")]

    def add_rig(self, name: str, focal_mm: float, sensor_w: float,
                sensor_h: float, fov_w: float, fov_h: float) -> int:
        with self.lock:
            c = self.conn.execute(
                "INSERT INTO rigs(name,focal_mm,sensor_w,sensor_h,fov_w,fov_h) "
                "VALUES(?,?,?,?,?,?)",
                (name, focal_mm, sensor_w, sensor_h, fov_w, fov_h))
            self.conn.commit()
            return c.lastrowid

    def delete_rig(self, rid: int):
        with self.lock:
            self.conn.execute("DELETE FROM rigs WHERE id=?", (rid,))
            if self.setting("active_rig_id") == rid:
                self.set_setting("active_rig_id", None)
            self.conn.commit()

    # ---------------- panoramas ----------------

    def panoramas(self) -> list[dict]:
        with self.lock:
            out = []
            for r in self.conn.execute(
                    "SELECT * FROM panoramas ORDER BY rowid DESC"):
                d = dict(r)
                d["strokes"] = json.loads(d["strokes"])
                d["profile"] = json.loads(d["profile"])
                d["profile_top"] = json.loads(d["profile_top"])
                out.append(d)
            return out

    def active_panorama(self) -> dict | None:
        for p in self.panoramas():
            if p["active"]:
                return p
        return None

    def add_panorama(self, pid: str, name: str, filename: str) -> str:
        with self.lock:
            self.conn.execute(
                "INSERT INTO panoramas(id,name,file) VALUES(?,?,?)",
                (pid, name, filename))
            self.conn.commit()
        return pid

    def update_panorama(self, pid: str, **fields):
        allowed = {"name", "file", "az_offset", "alt_bottom", "alt_top",
                   "strokes", "profile", "profile_top", "active", "fov",
                   "paint_mode"}
        sets, vals = [], []
        for k, v in fields.items():
            if k not in allowed:
                continue
            if k in ("strokes", "profile", "profile_top"):
                v = json.dumps(v)
            if k == "active":
                v = 1 if v else 0
            sets.append(f"{k}=?")
            vals.append(v)
        vals.append(pid)
        with self.lock:
            self.conn.execute(f"UPDATE panoramas SET {', '.join(sets)} WHERE id=?", vals)
            self.conn.commit()

    def get_panorama(self, pid: str) -> dict | None:
        for p in self.panoramas():
            if p["id"] == pid:
                return p
        return None

    def delete_panorama(self, pid: str):
        with self.lock:
            self.conn.execute("DELETE FROM panoramas WHERE id=?", (pid,))
            self.conn.commit()

    # ---------------- settings ----------------

    def setting(self, key: str, default=None):
        with self.lock:
            r = self.conn.execute(
                "SELECT value FROM settings WHERE key=?",
                (key,)).fetchone()
            if not r:
                return default
            try:
                return json.loads(r["value"])
            except Exception:
                return default

    def set_setting(self, key: str, value):
        with self.lock:
            self.conn.execute(
                "INSERT INTO settings(key,value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, json.dumps(value)))
            self.conn.commit()

    def image_dir(self) -> str:
        """User-chosen image archive folder, or the default when unset."""
        from .paths import default_archive_dir
        v = self.setting("image_dir")
        if not v:
            return str(default_archive_dir())
        return str(v)

    # ---------------- ingested images ----------------

    def add_image(self, rec: dict) -> int:
        with self.lock:
            c = self.conn.execute(
                "INSERT INTO images(file,orig_name,object_id,object_name,"
                "ra_hours,dec_deg,exposure,date_obs,filter,telescope,imagetyp,"
                "ingested_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (rec["file"], rec["orig_name"], rec.get("object_id"),
                 rec["object_name"], rec.get("ra_hours"), rec.get("dec_deg"),
                 rec.get("exposure"), rec.get("date_obs"), rec.get("filter"),
                 rec.get("telescope"), rec.get("imagetyp"),
                 rec["ingested_at"]))
            self.conn.commit()
            return c.lastrowid

    def images(self) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(
                "SELECT * FROM images ORDER BY id")]

    def image(self, img_id: int) -> dict | None:
        with self.lock:
            r = self.conn.execute(
                "SELECT * FROM images WHERE id=?", (img_id,)).fetchone()
            return dict(r) if r else None

    def rename_images(self, old_name: str, new_name: str, otype: str | None,
                      new_folder: str):
        """Rename an unresolved object group (name, type and stored paths)."""
        with self.lock:
            cur = self.conn.cursor()
            cur.execute(
                "UPDATE images SET object_name=?, otype=? "
                "WHERE object_id IS NULL AND object_name=?",
                (new_name, otype, old_name))
            for r in cur.execute(
                    "SELECT id, file FROM images "
                    "WHERE object_id IS NULL AND object_name=?",
                    (new_name,)).fetchall():
                parts = r["file"].split("/", 1)
                if len(parts) == 2 and parts[0] != new_folder:
                    cur.execute("UPDATE images SET file=? WHERE id=?",
                                (f"{new_folder}/{parts[1]}", r["id"]))
            self.conn.commit()

    # ---------------- observations (journal) ----------------

    def add_observation(self, object_id: str, date_obs: str | None,
                        notes: str | None) -> int:
        with self.lock:
            c = self.conn.execute(
                "INSERT INTO observations(object_id,date_obs,notes,created_at) "
                "VALUES(?,?,?,?)",
                (object_id, date_obs or None, notes or "",
                 datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S")))
            self.conn.commit()
            return c.lastrowid

    def observations(self) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(
                "SELECT * FROM observations ORDER BY id")]

    def observations_for(self, object_id: str) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(
                "SELECT * FROM observations WHERE object_id=? ORDER BY id",
                (object_id,))]

    def delete_observation(self, obs_id: int) -> None:
        with self.lock:
            self.conn.execute("DELETE FROM observations WHERE id=?", (obs_id,))
            self.conn.commit()

    # ---------------- import history (batches) ----------------

    def add_import_batch(self, rec: dict) -> int:
        with self.lock:
            c = self.conn.execute(
                "INSERT INTO import_batches(created_at,object_id,object_name,"
                "slug,session,frame,n_files,total_exposure,first_obs,image_dir,run_id) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (rec["created_at"], rec.get("object_id"), rec["object_name"],
                 rec["slug"], rec["session"], rec["frame"], rec["n_files"],
                 round(float(rec.get("total_exposure") or 0.0), 1),
                 rec.get("first_obs"), rec["image_dir"], rec.get("run_id")))
            self.conn.commit()
            return c.lastrowid

    def merge_import_batch(self, run_id: str, rec: dict) -> int:
        """Record a batch, merging into the row of the same import run
        (one upload action split into chunks = one history entry)."""
        with self.lock:
            row = self.conn.execute(
                "SELECT id, n_files, total_exposure, first_obs FROM import_batches "
                "WHERE run_id=? AND slug=? AND session=? AND frame=?",
                (run_id, rec["slug"], rec["session"], rec["frame"])).fetchone()
            if row:
                self.conn.execute(
                    "UPDATE import_batches SET n_files=?, total_exposure=?, "
                    "first_obs=? WHERE id=?",
                    (row["n_files"] + rec["n_files"],
                     round(row["total_exposure"] + rec["total_exposure"], 1),
                     row["first_obs"] or rec.get("first_obs"), row["id"]))
                self.conn.commit()
                return row["id"]
            return self.add_import_batch({**rec, "run_id": run_id})

    def import_batches(self, limit: int = 60) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(
                "SELECT * FROM import_batches ORDER BY id DESC LIMIT ?",
                (max(1, limit),))]

    def all_settings(self) -> dict:
        with self.lock:
            out = {}
            for r in self.conn.execute("SELECT key,value FROM settings"):
                try:
                    out[r["key"]] = json.loads(r["value"])
                except Exception:
                    pass
            return out

    def import_bundle(self, settings: dict, sites: list, rigs: list,
                      panoramas: list, customs: list | None = None,
                      images: list | None = None,
                      observations: list | None = None) -> None:
        """Replace all user data with an imported bundle (catalog untouched)."""
        customs = customs or []
        images = images or []
        observations = observations or []
        with self.lock:
            cur = self.conn.cursor()
            cur.execute("DELETE FROM sites")
            cur.execute("DELETE FROM rigs")
            cur.execute("DELETE FROM panoramas")
            cur.execute("DELETE FROM settings")
            cur.execute("DELETE FROM custom_objects")
            cur.execute("DELETE FROM images")
            cur.execute("DELETE FROM observations")
            for s in sites:
                cur.execute(
                    "INSERT INTO sites(id,name,lat,lon,elev) VALUES(?,?,?,?,?)",
                    (s.get("id"), s.get("name"), s.get("lat"),
                     s.get("lon"), s.get("elev", 0)))
            for r in rigs:
                cur.execute(
                    "INSERT INTO rigs(id,name,focal_mm,sensor_w,sensor_h,fov_w,fov_h) "
                    "VALUES(?,?,?,?,?,?,?)",
                    (r.get("id"), r.get("name"), r.get("focal_mm"),
                     r.get("sensor_w"), r.get("sensor_h"),
                     r.get("fov_w"), r.get("fov_h")))
            for p in panoramas:
                cur.execute(
                    "INSERT INTO panoramas(id,name,file,az_offset,alt_bottom,"
                    "alt_top,strokes,profile,profile_top,active,fov,paint_mode) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                    (p.get("id"), p.get("name"), p.get("file"),
                     p.get("az_offset", 0), p.get("alt_bottom", 0),
                     p.get("alt_top", 45), json.dumps(p.get("strokes", [])),
                     json.dumps(p.get("profile", [])),
                     json.dumps(p.get("profile_top", [])),
                     1 if p.get("active") else 0, p.get("fov", 360),
                     p.get("paint_mode", "obstacle")))
            for c in customs:
                cur.execute(
                    "INSERT OR REPLACE INTO custom_objects"
                    "(id,primary_name,otype,ra_hours,dec_deg,vmag,size_am,"
                    "constellation,blurb,search) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (c.get("id"), c.get("primary_name"),
                     c.get("otype", "galaxy"), c.get("ra_hours"),
                     c.get("dec_deg"), c.get("vmag"),
                     c.get("size_am") or "", c.get("constellation") or "",
                     c.get("blurb") or "",
                     " | ".join(filter(None, [
                         str(c.get("primary_name", "")).lower(),
                         str(c.get("otype", "")).lower(), "custom",
                         str(c.get("id", ""))]))))
            for im in images:
                cur.execute(
                    "INSERT OR REPLACE INTO images"
                    "(id,file,orig_name,object_id,object_name,otype,ra_hours,"
                    "dec_deg,exposure,date_obs,filter,telescope,imagetyp,"
                    "ingested_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (im.get("id"), im.get("file"), im.get("orig_name", ""),
                     im.get("object_id"), im.get("object_name", ""),
                     im.get("otype"), im.get("ra_hours"), im.get("dec_deg"),
                     im.get("exposure"), im.get("date_obs"),
                     im.get("filter"), im.get("telescope"),
                     im.get("imagetyp"), im.get("ingested_at", "")))
            for ob in observations:
                cur.execute(
                    "INSERT OR REPLACE INTO observations"
                    "(id,object_id,date_obs,notes,created_at) "
                    "VALUES(?,?,?,?,?)",
                    (ob.get("id"), ob.get("object_id"), ob.get("date_obs"),
                     ob.get("notes") or "", ob.get("created_at", "")))
            for k, v in settings.items():
                cur.execute(
                    "INSERT INTO settings(key,value) VALUES(?,?)",
                    (k, json.dumps(v)))
            self.conn.commit()


def _csv_adv_count(csv_path: Path) -> int:
    n = 0
    with open(csv_path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            n += 1
    return n


def new_id() -> str:
    return uuid.uuid4().hex[:10] + format(int(time.time()) % 100000, "05d")
