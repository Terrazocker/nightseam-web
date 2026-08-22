"""Shared night-window computation - single source of truth.

Both the bulk night planner and the per-object detail endpoint use this;
previously the twilight search was implemented twice and could drift.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from .astro import altaz, julian_day, sun_ra_dec


def local_utc(y: int, m: int, d: int, tz_min: int, hh: int, mm: int = 0) -> datetime:
    """Naive local wall-clock -> naive UTC."""
    return datetime(y, m, d, hh, mm) - timedelta(minutes=tz_min)


def make_sun_alt_fn(lat: float, lon: float):
    def sun_alt(t: datetime) -> float:
        jd = julian_day(t)
        ra, dec = sun_ra_dec(jd)
        return altaz(ra, dec, jd, lat, lon)[0]
    return sun_alt


def find_twilight(sun_alt_fn, t_start: datetime, t_end: datetime,
                  level: float):
    """Return (dusk, dawn) datetimes where the sun crosses below/above `level`
    between t_start and t_end (10-minute scan + linear refinement)."""
    step = timedelta(minutes=10)
    dusk = dawn = None
    t = t_start
    prev = sun_alt_fn(t) - level
    while t < t_end:
        nxt = min(t + step, t_end)
        cur = sun_alt_fn(nxt) - level
        if prev > 0 >= cur and dusk is None:
            frac = prev / (prev - cur)
            dusk = t + (nxt - t) * frac
            p2, t2 = cur, nxt
            while t2 < t_end:
                n2 = min(t2 + step, t_end)
                c2 = sun_alt_fn(n2) - level
                if p2 <= 0 < c2:
                    f2 = -p2 / (c2 - p2)
                    dawn = t2 + (n2 - t2) * f2
                    break
                p2, t2 = c2, n2
                if c2 > 0:
                    break
            break
        prev, t = cur, nxt
    return dusk, dawn


def night_window(y: int, m: int, d: int, tz_min: int,
                 lat: float, lon: float) -> dict:
    """Twilight times and the sampling window for the given local date."""
    t_start = local_utc(y, m, d, tz_min, 12)
    t_end = t_start + timedelta(hours=30)
    sun_alt = make_sun_alt_fn(lat, lon)

    sunset, sunrise = find_twilight(sun_alt, t_start, t_end, 0.0)

    level = None
    dusk = dawn = None
    for name, lvl in (("astronomical", -18.0),
                      ("nautical", -12.0),
                      ("civil", -6.0)):
        dk, dn = find_twilight(sun_alt, t_start, t_end, lvl)
        if dk and dn:
            level, dusk, dawn = name, dk, dn
            break

    if dusk is None or dawn is None:
        # polar day fallback: fixed evening-to-morning window
        dusk = dusk or local_utc(y, m, d, tz_min, 20)
        dawn = dawn or local_utc(y, m, d, tz_min, 4) + timedelta(days=1)
        level = level or "fallback"

    return {
        "sunset": sunset,
        "sunrise": sunrise,
        "dusk": dusk,
        "dawn": dawn,
        "level": level,
        "t_start": t_start,
        "t_end": t_end,
    }
