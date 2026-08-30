"""FastAPI application: REST API for catalog, night planning, panoramas, sites."""

from __future__ import annotations

import json
import logging
import math
import os
import re
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .backup import apply_import_zip, build_export_zip
from .database import Database, new_id
from .ingest import ingest_one, obj_slug, reindex_library, rename_archive_folder
from .nightcalc import PROFILE_BINS, compute_night, object_detail
from .paths import data_dir, static_dir
from .version import app_version

APP_VERSION = app_version()

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
    edge_space: Optional[int] = None
    adv_mode: Optional[bool] = None
    bortle: Optional[int] = None
    timezone: Optional[str] = None
    theme: Optional[str] = None
    weather_auto: Optional[bool] = None


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


class PanoramaUpdate(BaseModel):
    name: Optional[str] = None
    az_offset: Optional[float] = None
    alt_bottom: Optional[float] = None
    alt_top: Optional[float] = None
    fov: Optional[float] = None
    strokes: Optional[list] = None
    profile: Optional[list] = None
    profile_top: Optional[list] = None
    active: Optional[bool] = None
    paint_mode: Optional[str] = None


class LibraryEditIn(BaseModel):
    name: str                       # current object_name of an unresolved group
    new_name: Optional[str] = None
    otype: Optional[str] = None


class ObservationIn(BaseModel):
    date_obs: Optional[str] = None
    notes: Optional[str] = None


class FolderOpenIn(BaseModel):
    rel: str                      # relative path inside the archive folder


# ------------------------------------------------------------------ coord parsing

def parse_ra_hours(text) -> Optional[float]:
    """Decimal hours (dot or comma), or 'HH MM[.m][ SS]' with h/m/s or colons."""
    s = str(text).strip().lower().replace(",", ".").replace("h", " ").replace("m", " ").replace("s", " ")
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
    s = str(text).strip().replace(",", ".").replace("\u00b0", " ").replace("d", " ")
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


def fov_arcmin(focal_mm: float, sensor_mm: float) -> float:
    """Field of view in arcminutes for a given focal length and sensor dimension."""
    return round(2 * math.degrees(math.atan(sensor_mm / 2 / focal_mm)) * 60, 1)


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

def create_app(db: Database, *, prefetch: bool = True) -> FastAPI:
    app = FastAPI(title="AstroPilot", version=APP_VERSION, docs_url=None,
                  redoc_url=None, openapi_url=None)

    # DNS-rebinding guard: the local API must only ever answer requests whose
    # Host header names this machine (loopback). A malicious website could
    # otherwise rebind a domain to 127.0.0.1 and have the visitor's browser
    # issue requests against the local server - and with no CORS enabled the
    # responses stay unreadable, which makes this the one real vector.
    # Explicitly binding --host to something else + ASTROPILOT_ALLOW_HOST
    # extends the allowed set for power users.
    _ALLOWED_HOSTS = {"127.0.0.1", "localhost", "::1", "testserver"}
    _extra_host = os.environ.get("ASTROPILOT_ALLOW_HOST", "").strip().lower()
    if _extra_host:
        _ALLOWED_HOSTS.add(_extra_host)

    @app.middleware("http")
    async def guard_host(request, call_next):
        host = (request.headers.get("host") or "").strip()
        hostname = host.rsplit(":", 1)[0].strip("[]").lower() if ":" in host else host.lower()
        if hostname not in _ALLOWED_HOSTS:
            return JSONResponse({"detail": "forbidden host"}, status_code=403)
        return await call_next(request)

    @app.middleware("http")
    async def touch(request, call_next):
        _state["last_request"] = time.time()
        resp = await call_next(request)
        # the UI ships as plain files served from the exe/source bundle; a
        # stale cached index.html next to fresh ES modules breaks the app
        # (missing DOM ids). Never cache the UI shell or its assets.
        if request.url.path in ("/", "/index.html", "/style.css",
                                "/favicon.ico") or \
                request.url.path.startswith("/js/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    # ---------------- state / settings ----------------

    @app.get("/api/state")
    def api_state():
        panos = db.panoramas()
        bortle = db.setting("bortle", 4)
        mua = db.setting("min_useful_alt")
        if mua is None:
            mua = 17.0 + 2.0 * bortle      # darker skies -> lower default
        return {
            "version": APP_VERSION,
            "sites": db.sites(),
            "active_site_id": db.setting("active_site_id"),
            "panoramas": [{"id": p["id"], "name": p["name"], "active": bool(p["active"]),
                           "az_offset": p["az_offset"], "alt_bottom": p["alt_bottom"],
                           "alt_top": p["alt_top"], "fov": p.get("fov", 360.0),
                           "paint_mode": p.get("paint_mode") or "obstacle"} for p in panos],
            "active_pano_id": db.setting("active_pano_id"),
            "min_useful_alt": mua,
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
            "edge_space": db.setting("edge_space", 200),
            "adv_mode": bool(db.setting("adv_mode", False)),
            "bortle": db.setting("bortle", 4),
            "timezone": db.setting("timezone") or "",
            "theme": db.setting("theme", "") or "",
            "weather_auto": bool(db.setting("weather_auto", False)),
            "observed": db.observations(),
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
        if body.edge_space is not None:
            db.set_setting("edge_space",
                           max(0, min(1000, int(body.edge_space))))
        if body.adv_mode is not None:
            db.set_setting("adv_mode", bool(body.adv_mode))
        if body.bortle is not None:
            db.set_setting("bortle", max(1, min(9, int(body.bortle))))
        if body.timezone is not None:
            db.set_setting("timezone", body.timezone.strip()[:64])
        if body.theme is not None:
            db.set_setting("theme", body.theme.strip()[:32])
        if body.weather_auto is not None:
            db.set_setting("weather_auto", bool(body.weather_auto))
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
    def api_catalog(adv: bool = False):
        return [{k: v for k, v in o.items() if k != "_adv"}
                for o in db.all_objects(advanced=adv)]

    @app.get("/api/night")
    def api_night(date: str, tz_offset_min: int, site: Optional[int] = None,
                  pano: Optional[str] = None, adv: bool = False):
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
        profile_top = pano_row.get("profile_top") or [] if pano_row else []

        try:
            result = compute_night(db, site_row["lat"], site_row["lon"],
                                   site_row["elev"], date, tz_offset_min,
                                   profile, profile_top=profile_top,
                                   advanced=adv)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(500, f"Computation failed: {exc}") from exc
        return JSONResponse(result)

    @app.get("/api/object/{oid}")
    def api_object_detail(oid: str, date: str, tz_offset_min: int,
                          site: Optional[int] = None, pano: Optional[str] = None,
                          minalt: Optional[float] = None):
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
        profile_top = pano_row.get("profile_top") or [] if pano_row else []
        minalt_eff = float(minalt if minalt is not None
                           else db.setting("min_useful_alt", 25.0))

        result = object_detail(db, oid, date, tz_offset_min,
                               site_row["lat"], site_row["lon"],
                               profile, minalt_eff,
                               profile_top=profile_top)
        if result is None:
            raise HTTPException(404, "Object not found")
        return JSONResponse(result)

    @app.get("/api/object/{oid}/image")
    def api_object_image(oid: str, thumb: bool = False):
        from .images import fetch_image, fetch_image_cached
        obj = db.get_object(oid)
        if obj is None:
            raise HTTPException(404)
        # thumbnails (targets table) only use the on-disk cache so a page of
        # 250 rows never triggers a Wikipedia/DSS lookup each; the detail
        # view (thumb=0) still runs the full fetch chain.
        data, ctype = fetch_image_cached(obj) if thumb else fetch_image(obj)
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
        if body.paint_mode is not None and \
                body.paint_mode not in ("obstacle", "sky"):
            raise HTTPException(400, "paint_mode must be 'obstacle' or 'sky'")
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
        stamp = datetime.now().strftime("%Y%m%d-%H%M")
        return Response(
            content=build_export_zip(db),
            media_type="application/zip",
            headers={"Content-Disposition":
                     f'attachment; filename="astropilot-setup-{stamp}.zip"'})

    @app.post("/api/import")
    async def api_import(file: UploadFile = File(...)):
        blob = await file.read()
        try:
            summary = apply_import_zip(db, blob)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None
        return summary

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

    @app.post("/api/library/reindex")
    def api_library_reindex():
        """Scan the archive folder and record files not yet in the DB."""
        return reindex_library(db, Path(db.image_dir()))

    _SESSION_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$")
    _RUN_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")

    @app.post("/api/images/ingest")
    async def api_ingest_images(files: list[UploadFile] = File(...),
                                frame: str = Form(""),
                                session: str = Form(""),
                                run_id: str = Form("")):
        archive = Path(db.image_dir())
        try:
            archive.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise HTTPException(
                500, f"Cannot create archive folder {archive}: {exc}")
        catalog = db.all_objects(advanced=True)
        sess = session.strip()
        if not _SESSION_NAME_RE.match(sess):
            sess = None                  # not a sane folder name -> auto session
        results = [await ingest_one(db, catalog, archive, f, frame, sess)
                   for f in files]

        # record one history entry per (object, session, frame) group
        now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S")
        groups: dict[tuple, dict] = {}
        for r in results:
            if not r.get("ok"):
                continue
            parts = str(r.get("stored") or "").replace("\\", "/").split("/")
            if len(parts) < 3:
                continue
            key = (parts[0], parts[1], r.get("imagetyp") or "light")
            g = groups.setdefault(key, {
                "created_at": now, "slug": parts[0], "session": parts[1],
                "frame": key[2],
                "object_id": (r.get("object") or {}).get("id"),
                "object_name": (r.get("object") or {}).get("name") or parts[0],
                "n_files": 0, "total_exposure": 0.0, "first_obs": None})
            g["n_files"] += 1
            g["total_exposure"] += float(r.get("exposure") or 0.0)
            if r.get("date_obs") and (g["first_obs"] is None
                                      or r["date_obs"] < g["first_obs"]):
                g["first_obs"] = r["date_obs"]
        for g in groups.values():
            rec = {**g, "image_dir": str(archive)}
            run = run_id.strip()
            if run and _RUN_ID_RE.match(run):
                db.merge_import_batch(run, rec)
            else:
                db.add_import_batch(rec)
        return {"results": results}

    @app.get("/api/library/imports")
    def api_library_imports():
        return db.import_batches()

    @app.post("/api/library/open_folder")
    def api_library_open_folder(body: FolderOpenIn):
        rel = body.rel.strip().replace("\\", "/").strip("/")
        if not rel or ".." in rel.split("/") or rel.split("/")[0] == "":
            raise HTTPException(400, "bad folder path")
        folder = Path(db.image_dir()) / rel
        if not folder.is_dir():
            raise HTTPException(404, "folder not found on disk")
        import os
        try:
            os.startfile(folder)         # Windows file explorer
        except OSError as exc:
            raise HTTPException(500, f"cannot open folder: {exc}")
        return {"ok": True}

    @app.get("/api/library")
    def api_library():
        from . import imglib
        imgs = db.images()
        objs = imglib.group_library(imgs, db.all_objects(advanced=True))
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
        rename_archive_folder(Path(db.image_dir()), name, new_name)
        db.rename_images(name, new_name, otype, obj_slug(new_name))
        return {"ok": True, "name": new_name, "otype": otype}

    @app.get("/api/library/export")
    def api_library_export(format: str = "json"):
        from . import imglib
        imgs = db.images()
        if format == "csv":
            import csv as csvmod
            import io
            buf = io.StringIO()
            w = csvmod.writer(buf)
            w.writerow(["id", "file", "orig_name", "object_id", "object_name",
                        "otype", "ra_hours", "dec_deg", "exposure", "date_obs",
                        "filter", "telescope", "imagetyp", "ingested_at"])
            for i in imgs:
                w.writerow([i.get("id"), i.get("file"), i.get("orig_name"),
                            i.get("object_id"), i.get("object_name"),
                            i.get("otype"), i.get("ra_hours"),
                            i.get("dec_deg"), i.get("exposure"),
                            i.get("date_obs"), i.get("filter"),
                            i.get("telescope"), i.get("imagetyp"),
                            i.get("ingested_at")])
            return Response(
                content=buf.getvalue().encode("utf-8-sig"),
                media_type="text/csv",
                headers={"Content-Disposition":
                         'attachment; filename="astropilot-library.csv"'})
        if format == "json":
            objs = imglib.group_library(imgs, db.all_objects(advanced=True))
            return Response(
                content=json.dumps({
                    "image_dir": db.image_dir(),
                    "total_images": len(imgs),
                    "total_exposure": round(sum(
                        float(i.get("exposure") or 0.0) for i in imgs), 1),
                    "objects": objs,
                }, indent=1).encode("utf-8"),
                media_type="application/json",
                headers={"Content-Disposition":
                         'attachment; filename="astropilot-library.json"'})
        raise HTTPException(400, "format must be csv or json")

    @app.get("/api/images/{img_id}/preview")
    def api_image_preview(img_id: int):
        from . import fits as fitsio
        row = db.image(img_id)
        if row is None:
            raise HTTPException(404, "image not found")
        p = Path(db.image_dir()) / row["file"]
        if not p.is_file():
            raise HTTPException(404, "file missing on disk")
        try:
            with open(p, "rb") as f:
                png = fitsio.preview_png_file(f)
        except OSError:
            raise HTTPException(500, "cannot read archive file")
        if png is None:
            raise HTTPException(404, "not an image HDU")
        return Response(content=png, media_type="image/png",
                        headers={"Cache-Control":
                                 "public, max-age=604800, immutable"})

    # ---------------- observations (session journal) ----------------

    @app.post("/api/object/{oid}/observed")
    def api_add_observation(oid: str, body: ObservationIn):
        if db.get_object(oid) is None:
            raise HTTPException(404, "Object not found")
        db.add_observation(oid, body.date_obs, body.notes)
        return {"ok": True}

    @app.get("/api/object/{oid}/observed")
    def api_observations(oid: str):
        return db.observations_for(oid)

    @app.delete("/api/object/{oid}/observed/{obs_id}")
    def api_delete_observation(oid: str, obs_id: int):
        db.delete_observation(obs_id)
        return {"ok": True}

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

    if prefetch:
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