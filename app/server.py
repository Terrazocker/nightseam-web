"""FastAPI application: REST API for catalog, night planning, panoramas, sites."""

from __future__ import annotations

import json
import logging
import math
import re
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import astro
from .astro import altaz, julian_day, moon_illumination, moon_ra_dec, sun_ra_dec
from .planning import night_window
from .database import Database, new_id
from .paths import data_dir, static_dir
from .version import app_version

APP_VERSION = app_version()
PROFILE_BINS = 720          # 0.5-degree azimuth bins
BIN_DEG = 360.0 / PROFILE_BINS
NO_BLOCK = -90.0

_state = {"last_request": time.time()}


# ------------------------------------------------------------------ models

class SiteIn(BaseModel):
    name: str
    lat: float
    lon: float
    elev: int = 0


class SettingsIn(BaseModel):
    active_site_id: Optional[int] = None
    active_pano_id: Optional[str] = None
    min_useful_alt: Optional[float] = None
    moon_aware: Optional[bool] = None
    filters: Optional[dict] = None
    size_unit: Optional[str] = None
    active_rig_id: Optional[int] = None
    favorites: Optional[list] = None
    wizard_done: Optional[bool] = None
    image_dir: Optional[str] = None


class RigIn(BaseModel):
    name: str
    focal_mm: float
    sensor_w: float
    sensor_h: float


class CustomIn(BaseModel):
    name: str
    ra: str                      # decimal hours or "5h 34.5m" / "5 34 30"
    dec: str                     # decimal degrees or "+22 01"
    otype: str = "galaxy"
    vmag: Optional[float] = None
    size_am: Optional[str] = ""
    constellation: Optional[str] = ""
    blurb: Optional[str] = ""


# ------------------------------------------------------------------ coord parsing

def parse_ra_hours(text) -> Optional[float]:
    """Decimal hours, or 'HH MM[.m][ SS]' with h/m/s or colon separators."""
    s = str(text).strip().lower().replace("h", " ").replace("m", " ").replace("s", " ")
    parts = [p for p in re.split(r"[\s:]+", s) if p]
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        return None
    if not vals:
        return None
    if len(vals) == 1:
        return vals[0]
    if len(vals) == 2:
        return vals[0] + vals[1] / 60.0
    return vals[0] + vals[1] / 60.0 + vals[2] / 3600.0


def parse_dec_deg(text) -> Optional[float]:
    s = str(text).strip().replace("\u00b0", " ").replace("d", " ")
    sign = -1.0 if s.startswith("-") else 1.0
    s = s.lstrip("+-").replace("'", " ").replace('"', " ")
    parts = [p for p in re.split(r"[\s:]+", s) if p]
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        return None
    if not vals:
        return None
    v = abs(vals[0])
    if len(vals) >= 2:
        v += vals[1] / 60.0
    if len(vals) >= 3:
        v += vals[2] / 3600.0
    return sign * v


class PanoramaUpdate(BaseModel):
    name: Optional[str] = None
    az_offset: Optional[float] = None
    alt_bottom: Optional[float] = None
    alt_top: Optional[float] = None
    fov: Optional[float] = None
    strokes: Optional[list] = None
    profile: Optional[list] = None
    active: Optional[bool] = None


# ------------------------------------------------------------------ helpers

def _iso(dt_utc: datetime) -> str:
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%S")


def fov_arcmin(focal_mm: float, sensor_mm: float) -> float:
    """Field of view in arcminutes for a given focal length and sensor dimension."""
    return round(2 * math.degrees(math.atan(sensor_mm / 2 / focal_mm)) * 60, 1)


def ceil_lookup(profile: list[float]):
    """Return a function az_deg -> obstacle top elevation."""
    if not profile or len(profile) != PROFILE_BINS:
        return lambda az: NO_BLOCK
    prof = profile  # local ref

    def lookup(az_deg: float) -> float:
        i = int((az_deg % 360.0) / BIN_DEG)
        if i >= PROFILE_BINS:
            i = PROFILE_BINS - 1
        v = prof[i]
        return NO_BLOCK if v is None else v

    return lookup


def compute_night(db: Database, lat: float, lon: float, elev_m: int,
                  date_local: str, tz_off_min: int,
                  profile: list[float]) -> dict:
    y, m, d = map(int, date_local.split("-")[:3])
    win = night_window(y, m, d, tz_off_min, lat, lon)
    dusk, dawn = win["dusk"], win["dawn"]
    t_start, t_end = win["t_start"], win["t_end"]

    win_start = max(dusk - timedelta(hours=1), t_start)
    win_end = min(dawn + timedelta(hours=1), t_end)
    step = timedelta(minutes=6)
    times: list[datetime] = []
    t = win_start
    while t <= win_end:
        times.append(t)
        t += step

    jds = [julian_day(x) for x in times]

    # sun & moon tracks on the same grid
    sun_track, sun_az_track, moon_track, moon_az_track = [], [], [], []
    for i, jd in enumerate(jds):
        ra_s, dec_s = sun_ra_dec(jd)
        s_alt, s_az = altaz(ra_s, dec_s, jd, lat, lon)
        sun_track.append(round(s_alt, 1))
        sun_az_track.append(round(s_az, 1))
        ra_m, dec_m = moon_ra_dec(jd)
        m_alt, m_az = altaz(ra_m, dec_m, jd, lat, lon)
        moon_track.append(round(m_alt, 1))
        moon_az_track.append(round(m_az, 1))

    midnight_jd = jds[len(jds) // 2]
    illum = round(moon_illumination(midnight_jd), 2)

    ceil_fn = ceil_lookup(profile)

    objs = db.all_objects()
    out_objects = []
    for o in objs:
        ra = o["ra_hours"] * 15.0
        dec = o["dec_deg"]
        alts, azs, ceils = [], [], []
        for i, jd in enumerate(jds):
            a, z = altaz(ra, dec, jd, lat, lon)
            alts.append(a)
            azs.append(z)
            ceils.append(ceil_fn(z))

        max_i = max(range(len(alts)), key=lambda i: alts[i])
        # visibility flags / best windows / scores are derived CLIENT-side so
        # that changing the min-altitude preference is instant (no refetch)

        rec = {
            "id": o["id"],
            "alt": [round(a, 1) for a in alts],
            "az": [round(z, 1) for z in azs],
            "ceil": [round(c, 1) for c in ceils],
            "max_alt": round(alts[max_i], 1),
            "max_i": max_i,
        }
        out_objects.append(rec)

    timeline = {
        "t0": _iso(times[0]),
        "step_min": 6,
        "n": len(times),
        "times_iso": [_iso(x) for x in times],
    }

    return {
        "site": {"lat": lat, "lon": lon, "elev": elev_m},
        "date_local": date_local,
        "tz_offset_min": tz_off_min,
        "twilight_level": win["level"],
        "sunset": _iso(win["sunset"]) if win["sunset"] else None,
        "sunrise": _iso(win["sunrise"]) if win["sunrise"] else None,
        "dusk": _iso(dusk) if dusk else None,
        "dawn": _iso(dawn) if dawn else None,
        "moon_illum": illum,
        "timeline": timeline,
        "sun_alt": sun_track,
        "sun_az": sun_az_track,
        "moon_alt": moon_track,
        "moon_az": moon_az_track,
        "objects": out_objects,
    }


def longest_run(flags: list[bool]):
    best = None
    start = None
    for i, f in enumerate(list(flags) + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            span = i - start
            if best is None or span > (best[1] - best[0]):
                best = (start, i)
            start = None
    return best


# ---------------------------------------------------------------- image archive

def _ingest_one(db: Database, catalog: list[dict], archive: Path,
                name: str, data: bytes) -> dict:
    """Parse one uploaded .fit/.fits, resolve its object, copy it into the
    archive and record it. Returns a per-file result dict."""
    from . import fits as fitsio
    from . import imglib
    if not name.lower().endswith((".fit", ".fits")):
        return {"file": name, "ok": False,
                "error": "not a .fit/.fits file"}
    try:
        hdr = fitsio.read_fits_header(data)
    except Exception as exc:  # noqa: BLE001
        return {"file": name, "ok": False,
                "error": f"header parse failed: {exc}"}
    if not hdr:
        return {"file": name, "ok": False,
                "error": "not a FITS file (SIMPLE keyword missing)"}

    stem = Path(name).stem
    hint = str(hdr.get("OBJECT") or "").strip() or stem
    ra_h = fitsio.parse_ra_hours(hdr.get("OBJCTRA") or hdr.get("RA"))
    dec_d = fitsio.parse_dec_deg(hdr.get("OBJCTDEC") or hdr.get("DEC"))
    row = imglib.resolve_object(catalog, hint, ra_h, dec_d)

    if row:
        object_id = row["id"]
        object_name = str(row.get("primary_name") or hint)[:120]
        ra_h, dec_d = row["ra_hours"], row["dec_deg"]
    else:
        object_id = None
        object_name = (str(hdr.get("OBJECT") or "").strip() or stem)[:120]

    exposure = None
    for k in ("EXPTIME", "EXPOSURE", "EXPTIM", "ELAPTIME"):
        v = hdr.get(k)
        if isinstance(v, (int, float)) and v >= 0:
            exposure = float(v)
            break
    date_obs = fitsio.parse_date_obs(hdr.get("DATE-OBS") or hdr.get("DATE"))
    filt = str(hdr.get("FILTER") or "").strip() or None
    tel = str(hdr.get("TELESCOP") or hdr.get("INSTRUME") or "").strip() or None

    stored = _store_archive(archive, name, object_name, data)
    if stored is None:
        return {"file": name, "ok": False,
                "error": f"cannot write to archive folder {archive}"}

    db.add_image({
        "file": stored, "orig_name": name, "object_id": object_id,
        "object_name": object_name, "ra_hours": ra_h, "dec_deg": dec_d,
        "exposure": exposure, "date_obs": date_obs, "filter": filt,
        "telescope": tel,
        "ingested_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S"),
    })
    return {
        "file": name, "ok": True,
        "object": {"id": object_id, "name": object_name,
                   "designation": imglib.designation_of(
                       row, {"object_name": object_name})},
        "exposure": exposure, "date_obs": date_obs, "filter": filt,
        "telescope": tel, "stored": stored,
    }


def _store_archive(archive: Path, name: str, object_name: str,
                   data: bytes) -> str | None:
    """Copy bytes into <archive>/<object>/lights/<name>, uniquifying
    collisions. Returns the stored path relative to the archive, or None."""
    slug = _obj_slug(object_name)
    suffix = Path(name).suffix or ".fit"
    stem = (Path(name).stem or "image")[:80]
    try:
        sub = archive / slug / "lights"
        sub.mkdir(parents=True, exist_ok=True)
        target = sub / f"{stem}{suffix}"
        n = 2
        while target.exists():
            target = sub / f"{stem}_{n}{suffix}"
            n += 1
        target.write_bytes(data)
    except OSError:
        return None
    return str(target.relative_to(archive))


def _obj_slug(object_name: str) -> str:
    return re.sub(r"[^A-Za-z0-9 _-]+", "", object_name).strip() or "misc"


def _rename_archive_folder(archive: Path, old_name: str, new_name: str) -> None:
    """Move <archive>/<old slug> to <archive>/<new slug>, merging if the new
    folder already exists. Failures are silent - the DB rename still works."""
    old = archive / _obj_slug(old_name)
    new = archive / _obj_slug(new_name)
    if old == new or not old.is_dir():
        return
    try:
        if new.exists():
            for f in old.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(old)
                    dest = new / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    f.replace(dest)
            for d in sorted([p for p in old.rglob("*") if p.is_dir()],
                            key=lambda p: len(p.parts), reverse=True):
                d.rmdir()
            old.rmdir()
        else:
            old.rename(new)
    except OSError:
        pass


class LibraryEditIn(BaseModel):
    name: str                       # current object_name of an unresolved group
    new_name: Optional[str] = None
    otype: Optional[str] = None


# ------------------------------------------------------------------ image prefetch

_prefetch_started = False


def start_image_prefetch(db: Database) -> None:
    """Warm the local image cache for the whole catalog in the background so
    object thumbnails appear instantly later on."""
    global _prefetch_started
    if _prefetch_started:
        return
    _prefetch_started = True

    def cached_on_disk(o) -> bool:
        from . import images
        slug = images._slug(o["id"], o.get("wiki") or "", o.get("messier") or "")
        return (images.CACHE_DIR / f"{slug}.bin").exists()

    def worker():
        from . import images
        from .images import fetch_image
        log = logging.getLogger("astropilot")
        time.sleep(5)                      # let the UI settle first
        objs = db.all_objects()
        done = 0
        for o in objs:                     # pass 1
            if images.is_offline():
                time.sleep(20)             # network outage -> pause quietly
                continue
            try:
                fetch_image(o)
            except Exception:              # noqa: BLE001 - offline etc.
                pass
            done += 1
            if done % 25 == 0:
                log.info("image cache warm-up: %d/%d", done, len(objs))
            time.sleep(0.7)                # stay polite to the remote APIs
        log.info("image cache warm-up finished (%d objects)", done)

        time.sleep(60)                     # cooldown, then one retry round
        retry = [o for o in objs if not cached_on_disk(o)]
        if retry:
            log.info("image cache retry round for %d objects", len(retry))
            got = 0
            for o in retry:
                if images.is_offline():
                    time.sleep(20)
                    continue
                try:
                    blob, _ct = fetch_image(o, ignore_negative=True)
                    got += 1 if blob else 0
                except Exception:          # noqa: BLE001
                    pass
                time.sleep(1.2)
            log.info("image cache retry finished (+%d)", got)

    threading.Thread(target=worker, daemon=True, name="img-prefetch").start()


# ------------------------------------------------------------------ factory

def create_app(db: Database) -> FastAPI:
    app = FastAPI(title="AstroPilot", version=APP_VERSION, docs_url=None,
                  redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def touch(request, call_next):
        _state["last_request"] = time.time()
        return await call_next(request)

    # ---------------- state / settings ----------------

    @app.get("/api/state")
    def api_state():
        panos = db.panoramas()
        return {
            "version": APP_VERSION,
            "sites": db.sites(),
            "active_site_id": db.setting("active_site_id"),
            "panoramas": [{"id": p["id"], "name": p["name"], "active": bool(p["active"]),
                           "az_offset": p["az_offset"], "alt_bottom": p["alt_bottom"],
                           "alt_top": p["alt_top"], "fov": p.get("fov", 360.0)} for p in panos],
            "active_pano_id": db.setting("active_pano_id"),
            "min_useful_alt": db.setting("min_useful_alt", 25.0),
            "moon_aware": bool(db.setting("moon_aware", False)),
            "filters": db.setting("filters", {"broadband": True,
                                              "narrowband_ha": False,
                                              "narrowband_oiii": False}),
            "size_unit": db.setting("size_unit", "arcmin"),
            "rigs": db.rigs(),
            "active_rig_id": db.setting("active_rig_id"),
            "favorites": db.setting("favorites", []),
            "wizard_done": bool(db.setting("wizard_done", False)),
            "profile_len": PROFILE_BINS,
            "image_dir": db.image_dir(),
        }

    @app.post("/api/settings")
    def api_set_settings(body: SettingsIn):
        if body.active_site_id is not None:
            db.set_setting("active_site_id", body.active_site_id)
        if body.active_pano_id is not None:
            for p in db.panoramas():
                if p["active"] and p["id"] != body.active_pano_id:
                    db.update_panorama(p["id"], active=False)
            db.set_setting("active_pano_id", body.active_pano_id)
            db.update_panorama(body.active_pano_id, active=True)
        if body.min_useful_alt is not None:
            db.set_setting("min_useful_alt", body.min_useful_alt)
        if body.moon_aware is not None:
            db.set_setting("moon_aware", bool(body.moon_aware))
        if body.filters is not None:
            clean = {k: bool(v) for k, v in body.filters.items()
                     if k in ("broadband", "narrowband_ha", "narrowband_oiii")}
            db.set_setting("filters", clean)
        if body.size_unit is not None:
            if body.size_unit not in ("arcmin", "arcsec", "deg"):
                raise HTTPException(400, "size_unit must be arcmin, arcsec or deg")
            db.set_setting("size_unit", body.size_unit)
        if body.active_rig_id is not None:
            db.set_setting("active_rig_id", body.active_rig_id or None)
        if body.favorites is not None:
            db.set_setting("favorites", [str(x) for x in body.favorites])
        if body.wizard_done is not None:
            db.set_setting("wizard_done", bool(body.wizard_done))
        if body.image_dir is not None:
            db.set_setting("image_dir", body.image_dir.strip() or "")
        return {"ok": True}

    # ---------------- sites ----------------

    @app.get("/api/sites")
    def api_sites():
        return db.sites()

    @app.post("/api/sites")
    def api_add_site(body: SiteIn):
        sid = db.add_site(body.name.strip(), body.lat, body.lon, body.elev)
        if db.setting("active_site_id") is None:
            db.set_setting("active_site_id", sid)
        return {"id": sid}

    @app.put("/api/sites/{sid}")
    def api_update_site(sid: int, body: SiteIn):
        db.update_site(sid, body.name.strip(), body.lat, body.lon, body.elev)
        return {"ok": True}

    @app.delete("/api/sites/{sid}")
    def api_delete_site(sid: int):
        db.delete_site(sid)
        return {"ok": True}

    # ---------------- rigs ----------------

    @app.get("/api/rigs")
    def api_rigs():
        return db.rigs()

    @app.post("/api/rigs")
    def api_add_rig(body: RigIn):
        if body.focal_mm <= 0 or body.sensor_w <= 0 or body.sensor_h <= 0:
            raise HTTPException(400, "Focal length and sensor size must be positive")
        fov_w = fov_arcmin(body.focal_mm, body.sensor_w)
        fov_h = fov_arcmin(body.focal_mm, body.sensor_h)
        rid = db.add_rig(body.name.strip(), body.focal_mm, body.sensor_w,
                         body.sensor_h, fov_w, fov_h)
        if db.setting("active_rig_id") is None:
            db.set_setting("active_rig_id", rid)
        return {"id": rid, "fov_w": fov_w, "fov_h": fov_h}

    @app.delete("/api/rigs/{rid}")
    def api_delete_rig(rid: int):
        db.delete_rig(rid)
        return {"ok": True}

    # ---------------- catalog + night ----------------

    @app.get("/api/catalog")
    def api_catalog():
        return db.all_objects()

    @app.get("/api/night")
    def api_night(date: str, tz_offset_min: int, site: Optional[int] = None,
                  pano: Optional[str] = None):
        site_row = None
        if site is not None:
            site_row = next((s for s in db.sites() if s["id"] == site), None)
        if site_row is None:
            aid = db.setting("active_site_id")
            site_row = next((s for s in db.sites() if s["id"] == aid), None)
        if site_row is None:
            raise HTTPException(400, "No observing location configured")

        pano_row = None
        if pano:
            pano_row = db.get_panorama(pano)
        else:
            pano_row = db.active_panorama()
        profile = pano_row["profile"] if pano_row else []

        try:
            result = compute_night(db, site_row["lat"], site_row["lon"],
                                   site_row["elev"], date, tz_offset_min,
                                   profile)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(500, f"Computation failed: {exc}") from exc
        return JSONResponse(result)

    @app.get("/api/object/{oid}")
    def api_object_detail(oid: str, date: str, tz_offset_min: int,
                          site: Optional[int] = None, pano: Optional[str] = None,
                          minalt: Optional[float] = None):
        obj = db.get_object(oid)
        if obj is None:
            raise HTTPException(404, "Object not found")

        site_row = None
        all_sites = db.sites()
        if site is not None:
            site_row = next((s for s in all_sites if s["id"] == site), None)
        if site_row is None:
            aid = db.setting("active_site_id")
            site_row = next((s for s in all_sites if s["id"] == aid), None)
        if site_row is None:
            raise HTTPException(400, "No observing location configured")

        pano_row = db.get_panorama(pano) if pano else db.active_panorama()
        profile = pano_row["profile"] if pano_row else []
        minalt_eff = float(minalt if minalt is not None else db.setting("min_useful_alt", 25.0))

        lat, lon = site_row["lat"], site_row["lon"]
        y, m, d = map(int, date.split("-")[:3])
        win = night_window(y, m, d, tz_offset_min, lat, lon)
        dusk, dawn = win["dusk"], win["dawn"]
        t_start, t_end = win["t_start"], win["t_end"]

        w0 = max(dusk - timedelta(minutes=75), t_start)
        w1 = min(dawn + timedelta(minutes=45), t_end)
        step = timedelta(minutes=4)
        times = []
        t = w0
        while t <= w1:
            times.append(t)
            t += step

        ceil_fn = ceil_lookup(profile)
        ra = obj["ra_hours"] * 15.0
        dec = obj["dec_deg"]
        alts, azs, ceils, vis = [], [], [], []
        for tt in times:
            jd = julian_day(tt)
            a, z = altaz(ra, dec, jd, lat, lon)
            alts.append(round(a, 2))
            azs.append(round(z, 1))
            c = ceil_fn(z)
            ceils.append(round(c, 2))
            vis.append(a >= minalt_eff and a > c)

        max_i = max(range(len(alts)), key=lambda i: alts[i])
        best = longest_run(vis)

        meta = {k: obj[k] for k in
                ("id", "primary_name", "messier", "ngcic", "other", "otype",
                 "ra_hours", "dec_deg", "vmag", "size_am", "constellation",
                 "distance", "wiki", "blurb")}
        meta["ra_hms"] = format_ra(obj["ra_hours"])
        meta["dec_dms"] = format_dec(obj["dec_deg"])

        return {
            "meta": meta,
        "twilight_level": win["level"],
            "dusk": _iso(dusk), "dawn": _iso(dawn),
            "times_iso": [_iso(x) for x in times],
            "alt": alts, "az": azs, "ceil": ceils, "vis": vis,
            "max_alt": alts[max_i], "max_time": _iso(times[max_i]),
            "best": list(best) if best else None,
            "min_useful_alt": minalt_eff,
        }

    @app.get("/api/object/{oid}/image")
    def api_object_image(oid: str):
        from .images import fetch_image
        obj = db.get_object(oid)
        if obj is None:
            raise HTTPException(404)
        data, ctype = fetch_image(obj)
        if data is not None:
            return Response(content=data, media_type=ctype,
                            headers={"Cache-Control":
                                     "public, max-age=604800, immutable"})
        # graceful offline/missing fallback: generated type-colored placeholder
        svg = placeholder_svg(obj)
        return Response(content=svg, media_type="image/svg+xml",
                        headers={"Cache-Control": "public, max-age=600"})

    # ---------------- panoramas ----------------

    @app.post("/api/panorama")
    async def api_upload_pano(file: UploadFile = File(...)):
        ext = Path(file.filename or "").suffix.lower().lstrip(".")
        if ext not in ("jpg", "jpeg", "png", "webp"):
            raise HTTPException(400, "Use JPG, PNG or WebP")
        blob = await file.read()
        if len(blob) > 60 * 1024 * 1024:
            raise HTTPException(400, "Image too large (max 60 MB)")
        pid = new_id()
        fname = f"{pid}.{ext}"
        out = data_dir() / "panos" / fname
        out.write_bytes(blob)
        name = Path(file.filename).stem or "Panorama"
        db.add_panorama(pid, name, fname)
        db.update_panorama(pid, active=False)
        return {"id": pid}

    @app.get("/api/panoramas")
    def api_panoramas():
        return db.panoramas()

    @app.get("/api/panorama/{pid}/image")
    def api_pano_image(pid: str):
        row = db.get_panorama(pid)
        if row is None:
            raise HTTPException(404)
        f = data_dir() / "panos" / row["file"]
        if not f.exists():
            # self-heal: db may point at a renamed/deleted variant
            candidates = sorted((data_dir() / "panos").glob(f"{pid}.*"))
            if candidates:
                f = candidates[0]
                db.update_panorama(pid, file=f.name)
            else:
                raise HTTPException(404)
        return FileResponse(f)

    @app.post("/api/panorama/{pid}/image")
    async def api_pano_replace_image(pid: str, file: UploadFile = File(...),
                                     az_offset: Optional[float] = Form(None),
                                     fov: Optional[float] = Form(None)):
        """Replace the stored panorama image (used by the crop tool).
        Optionally applies the recalibrated az_offset / fov in one step."""
        row = db.get_panorama(pid)
        if row is None:
            raise HTTPException(404)
        ext = Path(file.filename or "").suffix.lower().lstrip(".")
        if ext not in ("jpg", "jpeg", "png", "webp"):
            raise HTTPException(400, "Use JPG, PNG or WebP")
        blob = await file.read()
        if not blob or len(blob) > 60 * 1024 * 1024:
            raise HTTPException(400, "Image missing or too large (max 60 MB)")
        fname = f"{pid}.{ext}"
        old = data_dir() / "panos" / row["file"]
        out = data_dir() / "panos" / fname
        out.write_bytes(blob)
        if old.exists() and old.name != fname:
            old.unlink(missing_ok=True)
        fields: dict = {"file": fname, "strokes": [], "profile": []}
        if az_offset is not None:
            fields["az_offset"] = float(az_offset)
        if fov is not None:
            fields["fov"] = float(fov)
        db.update_panorama(pid, **fields)
        return {"ok": True}

    @app.put("/api/panorama/{pid}")
    def api_update_pano(pid: str, body: PanoramaUpdate):
        row = db.get_panorama(pid)
        if row is None:
            raise HTTPException(404)
        fields = {k: v for k, v in body.model_dump().items() if v is not None}
        if fields:
            db.update_panorama(pid, **fields)
        if body.active:
            db.set_setting("active_pano_id", pid)
        return {"ok": True}

    @app.delete("/api/panorama/{pid}")
    def api_delete_pano(pid: str):
        row = db.get_panorama(pid)
        if row:
            f = data_dir() / "panos" / row["file"]
            if f.exists():
                f.unlink(missing_ok=True)
        db.delete_panorama(pid)
        return {"ok": True}

    # ---------------- setup export / import ----------------

    @app.get("/api/export")
    def api_export():
        import io
        import zipfile
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            setup = {
                "app": "AstroPilot",
                "version": APP_VERSION,
                "exported_at": datetime.utcnow().isoformat(),
                "settings": db.all_settings(),
                "sites": db.sites(),
                "rigs": db.rigs(),
                "panoramas": db.panoramas(),
            }
            z.writestr("setup.json", json.dumps(setup, indent=1))
            for p in setup["panoramas"]:
                f = data_dir() / "panos" / p["file"]
                if f.exists():
                    z.write(f, f"panos/{p['file']}")
        stamp = datetime.now().strftime("%Y%m%d-%H%M")
        return Response(
            content=buf.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition":
                     f'attachment; filename="astropilot-setup-{stamp}.zip"'})

    @app.post("/api/import")
    async def api_import(file: UploadFile = File(...)):
        import io
        import zipfile
        blob = await file.read()
        try:
            zf = zipfile.ZipFile(io.BytesIO(blob))
            setup = json.loads(zf.read("setup.json").decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(400, f"Not a valid AstroPilot export: {exc}") from None
        if setup.get("app") != "AstroPilot":
            raise HTTPException(400, "This zip is not an AstroPilot setup export")

        sites = setup.get("sites", [])
        rigs = setup.get("rigs", [])
        panos = setup.get("panoramas", [])
        settings = setup.get("settings", {})

        restored_files = 0
        for p in panos:
            name = p.get("file")
            if not name:
                continue
            try:
                data = zf.read(f"panos/{name}")
            except KeyError:
                continue
            (data_dir() / "panos" / name).write_bytes(data)
            restored_files += 1

        db.import_bundle(settings, sites, rigs, panos)
        return {"ok": True, "sites": len(sites), "rigs": len(rigs),
                "panoramas": len(panos), "pano_images": restored_files}

    # ---------------- custom targets ----------------

    @app.post("/api/catalog/custom")
    def api_add_custom(body: CustomIn):
        ra = parse_ra_hours(body.ra)
        dec = parse_dec_deg(body.dec)
        if ra is None or not (0 <= ra < 24):
            raise HTTPException(400, "RA must be 0-24 h (decimal or '5h 34.5m')")
        if dec is None or not (-90 <= dec <= 90):
            raise HTTPException(400, "Dec must be -90..+90 (decimal or '+22 01')")
        oid = "u_" + new_id()
        db.add_custom({
            "id": oid,
            "primary_name": body.name.strip() or "Unnamed target",
            "otype": body.otype if body.otype in (
                "galaxy", "globular", "open_cluster", "nebula", "planetary",
                "supernova_remnant", "star_cloud", "asterism") else "galaxy",
            "ra_hours": round(ra, 5),
            "dec_deg": round(dec, 5),
            "vmag": body.vmag,
            "size_am": body.size_am,
            "constellation": body.constellation.upper()[:3],
            "blurb": body.blurb,
        })
        return {"id": oid}

    @app.delete("/api/catalog/custom/{cid}")
    def api_delete_custom(cid: str):
        if not cid.startswith("u_") or not db.is_custom(cid):
            raise HTTPException(400, "Only custom targets can be deleted")
        db.delete_custom(cid)
        return {"ok": True}

    # ---------------- image archive ----------------

    @app.post("/api/images/ingest")
    async def api_ingest_images(files: list[UploadFile] = File(...)):
        from . import fits as fitsio
        archive = Path(db.image_dir())
        try:
            archive.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise HTTPException(
                500, f"Cannot create archive folder {archive}: {exc}")
        catalog = db.all_objects()
        results = []
        for f in files:
            name = Path(f.filename or "image.fit").name
            results.append(_ingest_one(db, catalog, archive, name,
                                       await f.read()))
        return {"results": results}

    @app.get("/api/library")
    def api_library():
        from . import imglib
        imgs = db.images()
        objs = imglib.group_library(imgs, db.all_objects())
        return {
            "image_dir": db.image_dir(),
            "total_images": len(imgs),
            "total_exposure": round(
                sum(float(i.get("exposure") or 0.0) for i in imgs), 1),
            "objects": objs,
        }

    @app.post("/api/library/edit")
    def api_library_edit(body: LibraryEditIn):
        """Rename/retype an unresolved library object (object_id IS NULL)."""
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "name required")
        new_name = (body.new_name or "").strip() or name
        otype = body.otype or None
        if otype is not None and otype not in (
                "galaxy", "globular", "open_cluster", "nebula", "planetary",
                "supernova_remnant", "star_cloud", "asterism"):
            raise HTTPException(400, f"unknown type: {otype}")
        rows = [i for i in db.images()
                if not i["object_id"] and i["object_name"] == name]
        if not rows:
            raise HTTPException(404, "Object not found in library")
        _rename_archive_folder(Path(db.image_dir()), name, new_name)
        db.rename_images(name, new_name, otype, _obj_slug(new_name))
        return {"ok": True, "name": new_name, "otype": otype}

    @app.get("/api/shutdown")
    @app.post("/api/shutdown")
    def api_shutdown():
        import os
        os._exit(0)

    # ---------------- static files ----------------

    sd = static_dir()

    @app.get("/")
    def index():
        return FileResponse(sd / "index.html")

    app.mount("/", StaticFiles(directory=str(sd)), name="static")

    start_image_prefetch(db)

    return app


# ------------------------------------------------------------------ formatting

TYPE_COLORS = {
    "galaxy": "#ff9e64", "globular": "#ffd166", "open_cluster": "#7ee787",
    "nebula": "#ff7b72", "planetary": "#79c0ff",
    "supernova_remnant": "#d2a8ff", "star_cloud": "#e3b341",
    "asterism": "#9ca5b5",
}


def placeholder_svg(obj: dict) -> bytes:
    """Deterministic offline placeholder: starfield-ish gradient + designation."""
    color = TYPE_COLORS.get(obj.get("otype"), "#79c0ff")
    name = obj.get("messier") or obj.get("ngcic") or obj.get("primary_name") or "?"
    import html as _html
    name = _html.escape(str(name).split("/")[0])
    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'>
<defs><radialGradient id='g' cx='35%' cy='30%' r='90%'>
<stop offset='0%' stop-color='#1c2740'/><stop offset='100%' stop-color='#0a0d16'/>
</radialGradient></defs>
<rect width='400' height='400' fill='url(#g)'/>
<g fill='#ffffff'>
<circle cx='60' cy='70' r='1.3' opacity='.5'/><circle cx='330' cy='50' r='1.1' opacity='.4'/>
<circle cx='120' cy='320' r='1.2' opacity='.45'/><circle cx='300' cy='280' r='1.5' opacity='.55'/>
<circle cx='210' cy='90' r='1.0' opacity='.35'/><circle cx='80' cy='200' r='1.0' opacity='.4'/>
<circle cx='350' cy='190' r='1.2' opacity='.4'/><circle cx='180' cy='360' r='1.1' opacity='.35'/>
</g>
<circle cx='200' cy='185' r='46' fill='none' stroke='{color}' stroke-width='2.5' stroke-dasharray='6 5' opacity='.85'/>
<circle cx='200' cy='185' r='10' fill='{color}' opacity='.9'/>
<text x='200' y='268' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='26'
 font-weight='600' fill='#d7dce8'>{name}</text>
<text x='200' y='294' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='13'
 fill='#8b93a8'>image unavailable offline</text></svg>"""
    return svg.encode("utf-8")


def format_ra(ra_hours: float) -> str:
    h = ra_hours % 24.0
    hh = int(h)
    mm_f = (h - hh) * 60
    mm = int(mm_f)
    ss = (mm_f - mm) * 60
    return f"{hh:02d}h {mm:02d}m {ss:04.1f}s"


def format_dec(dec_deg: float) -> str:
    sign = "-" if dec_deg < 0 else "+"
    a = abs(dec_deg)
    dd = int(a)
    mm_f = (a - dd) * 60
    mm = int(mm_f)
    ss = (mm_f - mm) * 60
    return f"{sign}{dd:02d}deg {mm:02d}' {ss:04.1f}\""
