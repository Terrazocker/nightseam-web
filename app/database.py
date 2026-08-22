"""SQLite storage: seeded DSO catalog + user data (sites, rigs, panoramas, settings)."""

from __future__ import annotations

import json
import shutil
import sqlite3
import threading
import time
import uuid
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
    active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


class Database:
    def __init__(self, db_path: Path):
        self.path = db_path
        self.lock = threading.Lock()
        self.conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        try:  # migration for databases created before fov existed
            self.conn.execute("ALTER TABLE panoramas ADD COLUMN fov REAL NOT NULL DEFAULT 360")
        except sqlite3.OperationalError:
            pass
        self.conn.commit()
        self.seed_catalog()
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
        cur = self.conn.execute("SELECT COUNT(*) FROM objects")
        if cur.fetchone()[0] >= len(catalog_data.rows()):
            return
        rows = catalog_data.rows()
        with self.lock:
            self.conn.executemany(
                """INSERT OR IGNORE INTO objects VALUES
                   (:id,:primary_name,:messier,:ngcic,:other,:otype,:ra_hours,:dec_deg,
                    :mag,:size,:constellation,:distance,:wiki,:blurb,:search)""",
                [dict(r, primary_name=r["primary"], otype=r["type"]) for r in rows],
            )
            self.conn.commit()

    def all_objects(self) -> list[dict]:
        builtin = [dict(r) for r in self.conn.execute(
            "SELECT * FROM objects ORDER BY messier IS NULL, "
            "CAST(SUBSTR(messier,2) AS INTEGER), id")]
        custom = [dict(r) for r in self.conn.execute(
            "SELECT * FROM custom_objects ORDER BY primary_name")]
        return custom + builtin

    def get_object(self, oid: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM objects WHERE id=?", (oid,)).fetchone()
        if r:
            return dict(r)
        r = self.conn.execute("SELECT * FROM custom_objects WHERE id=?",
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

    def is_custom(self, cid: str) -> bool:
        r = self.conn.execute(
            "SELECT 1 FROM custom_objects WHERE id=?", (cid,)).fetchone()
        return r is not None

    # ---------------- sites ----------------

    def sites(self) -> list[dict]:
        return [dict(r) for r in self.conn.execute("SELECT * FROM sites ORDER BY id")]

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
        return [dict(r) for r in self.conn.execute("SELECT * FROM rigs ORDER BY id")]

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
        out = []
        for r in self.conn.execute("SELECT * FROM panoramas ORDER BY rowid DESC"):
            d = dict(r)
            d["strokes"] = json.loads(d["strokes"])
            d["profile"] = json.loads(d["profile"])
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
                   "strokes", "profile", "active", "fov"}
        sets, vals = [], []
        for k, v in fields.items():
            if k not in allowed:
                continue
            if k in ("strokes", "profile"):
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
        r = self.conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
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

    def all_settings(self) -> dict:
        out = {}
        for r in self.conn.execute("SELECT key,value FROM settings"):
            try:
                out[r["key"]] = json.loads(r["value"])
            except Exception:
                pass
        return out

    def import_bundle(self, settings: dict, sites: list, rigs: list,
                      panoramas: list) -> None:
        """Replace all user data with an imported bundle (catalog untouched)."""
        with self.lock:
            cur = self.conn.cursor()
            cur.execute("DELETE FROM sites")
            cur.execute("DELETE FROM rigs")
            cur.execute("DELETE FROM panoramas")
            cur.execute("DELETE FROM settings")
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
                    "alt_top,strokes,profile,active,fov) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (p.get("id"), p.get("name"), p.get("file"),
                     p.get("az_offset", 0), p.get("alt_bottom", 0),
                     p.get("alt_top", 45), json.dumps(p.get("strokes", [])),
                     json.dumps(p.get("profile", [])),
                     1 if p.get("active") else 0, p.get("fov", 360)))
            for k, v in settings.items():
                cur.execute(
                    "INSERT INTO settings(key,value) VALUES(?,?)",
                    (k, json.dumps(v)))
            self.conn.commit()


def new_id() -> str:
    return uuid.uuid4().hex[:10] + format(int(time.time()) % 100000, "05d")
