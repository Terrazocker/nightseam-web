"""Night computation: full-night payloads and per-object detail tracks.

Both /api/night and /api/object/{oid} share the same time grids, sun/moon
tracks, ceil_lookup() and rounding rules. This module is the computation
layer; server.py handles routing, site/pano resolution and error codes.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from .astro import altaz, julian_day, moon_illumination, moon_age, moon_ra_dec, sun_ra_dec
from .database import Database
from .planning import night_window

PROFILE_BINS = 720          # 0.5-degree azimuth bins
BIN_DEG = 360.0 / PROFILE_BINS
NO_BLOCK = -90.0


def _iso(dt_utc: datetime) -> str:
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%S")


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
                  profile: list[float],
                  profile_top: list[float] | None = None,
                  advanced: bool = False) -> dict:
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
    m_age = round(moon_age(midnight_jd), 2)

    ceil_fn = ceil_lookup(profile)
    # sky-mode bands carry an upper ceiling: everything above the painted
    # sky is blocked too (e.g. a balcony out of frame). Empty -> open above.
    top_fn = ceil_lookup(profile_top) if profile_top else (lambda az: 90.0)

    objs = db.all_objects(advanced=advanced)
    out_objects = []
    for o in objs:
        if advanced and o.get("_adv"):
            # metadata only - the client synthesizes the tracks locally to
            # keep the payload small for ~12k objects
            out_objects.append({
                "id": o["id"], "adv": True,
                "ra_hours": o["ra_hours"], "dec_deg": o["dec_deg"],
                "vmag": o.get("vmag"), "otype": o.get("otype"),
                "popularity": o.get("popularity") or 0,
            })
            continue
        ra = o["ra_hours"] * 15.0
        dec = o["dec_deg"]
        alts, azs, ceils = [], [], []
        ceils_top = [] if profile_top else None
        for i, jd in enumerate(jds):
            a, z = altaz(ra, dec, jd, lat, lon)
            alts.append(a)
            azs.append(z)
            ceils.append(ceil_fn(z))
            if ceils_top is not None:
                ceils_top.append(round(top_fn(z), 1))

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
        if ceils_top is not None:
            rec["ceil_top"] = ceils_top
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
        "moon_age_days": m_age,
        "timeline": timeline,
        "sun_alt": sun_track,
        "sun_az": sun_az_track,
        "moon_alt": moon_track,
        "moon_az": moon_az_track,
        "objects": out_objects,
    }


def object_detail(db: Database, oid: str, date_local: str, tz_off_min: int,
                  lat: float, lon: float, profile: list[float],
                  min_alt: float,
                  profile_top: list[float] | None = None) -> dict | None:
    """Per-object 4-min-grid track + meta. Returns None for unknown ids."""
    obj = db.get_object(oid)
    if obj is None:
        return None

    y, m, d = map(int, date_local.split("-")[:3])
    win = night_window(y, m, d, tz_off_min, lat, lon)
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
    top_fn = ceil_lookup(profile_top) if profile_top else (lambda az: 90.0)
    ra = obj["ra_hours"] * 15.0
    dec = obj["dec_deg"]
    alts, azs, ceils, vis = [], [], [], []
    ceils_top = [] if profile_top else None
    for tt in times:
        jd = julian_day(tt)
        a, z = altaz(ra, dec, jd, lat, lon)
        alts.append(round(a, 2))
        azs.append(round(z, 1))
        c = ceil_fn(z)
        ceils.append(round(c, 2))
        if ceils_top is not None:
            ceils_top.append(round(top_fn(z), 1))
        vis.append(a >= min_alt and a > c and
                   (ceils_top is None or a < ceils_top[-1]))

    max_i = max(range(len(alts)), key=lambda i: alts[i])
    best = longest_run(vis)

    meta = {k: obj[k] for k in
            ("id", "primary_name", "messier", "ngcic", "other", "otype",
             "ra_hours", "dec_deg", "vmag", "size_am", "constellation",
             "distance", "wiki", "blurb")}
    meta["ra_hms"] = format_ra(obj["ra_hours"])
    meta["dec_dms"] = format_dec(obj["dec_deg"])

    out = {
        "meta": meta,
        "twilight_level": win["level"],
        "dusk": _iso(dusk), "dawn": _iso(dawn),
        "times_iso": [_iso(x) for x in times],
        "alt": alts, "az": azs, "ceil": ceils, "vis": vis,
        "max_alt": alts[max_i], "max_time": _iso(times[max_i]),
        "best": list(best) if best else None,
        "min_useful_alt": min_alt,
    }
    if ceils_top is not None:
        out["ceil_top"] = ceils_top
    return out


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