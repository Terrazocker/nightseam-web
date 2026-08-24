"""
Pure-python astronomy engine.

Algorithms from Meeus, "Astronomical Algorithms" (2nd ed.):
- Solar coordinates (ch. 25, low precision, ~0.01 deg)
- Lunar coordinates (ch. 47, truncated series, ~0.3 deg)
- Sidereal time (ch. 12), precession (ch. 21)
Accuracy is far better than needed for horizon/obstruction planning.
"""

from __future__ import annotations

import math
from datetime import datetime

D2R = math.pi / 180.0
R2D = 180.0 / math.pi
ASEC2DEG = 1.0 / 3600.0

J2000 = 2451545.0


# ---------------------------------------------------------------- time

def julian_day(dt_utc: datetime) -> float:
    """Julian Day from a naive UTC datetime."""
    y, m = dt_utc.year, dt_utc.month
    d = dt_utc.day + (dt_utc.hour + dt_utc.minute / 60.0 + dt_utc.second / 3600.0) / 24.0
    if m <= 2:
        y -= 1
        m += 12
    a = y // 100
    b = 2 - a + a // 4
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + d + b - 1524.5


# ---------------------------------------------------------------- coordinate helpers

def _precess_j2000_to_date(ra_deg: float, dec_deg: float, jd: float) -> tuple[float, float]:
    """Precess ICRS/J2000 coords to mean equinox of date (Meeus ch. 21)."""
    t = (jd - J2000) / 36525.0
    xi = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * ASEC2DEG
    ze = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * ASEC2DEG
    th = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * ASEC2DEG

    a = D2R * ra_deg
    d = D2R * dec_deg
    xia, zea, tha = D2R * xi, D2R * ze, D2R * th

    # rotation matrix applied to unit vector
    cosd, sind = math.cos(d), math.sin(d)
    cosa, sina = math.cos(a), math.sin(a)
    x = cosd * cosa
    y = cosd * sina
    z = sind

    cx, sx = math.cos(xia), math.sin(xia)
    cz, sz = math.cos(zea), math.sin(zea)
    ct, st = math.cos(tha), math.sin(tha)

    x2 = cx * x - sx * y
    y2 = sx * x + cx * y
    x3 = x2
    y3 = ct * y2 - st * z
    z3 = st * y2 + ct * z
    xf = cz * x3 + sz * y3
    yf = -sz * x3 + cz * y3
    zf = z3

    ra_new = math.atan2(yf, xf) * R2D % 360.0
    dec_new = math.asin(max(-1.0, min(1.0, zf))) * R2D
    return ra_new, dec_new


def gmst_deg(jd: float) -> float:
    """Greenwich mean sidereal time in degrees."""
    d = jd - J2000
    t = d / 36525.0
    g = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t ** 3) / 38710000.0
    return g % 360.0


def altaz(ra_deg: float, dec_deg: float, jd: float,
          lat_deg: float, lon_deg: float, refract: bool = True) -> tuple[float, float]:
    """Topocentric altitude/azimuth (North=0, East=90). RA/Dec assumed J2000."""
    ra, dec = _precess_j2000_to_date(ra_deg, dec_deg, jd)
    ha = (gmst_deg(jd) + lon_deg - ra) % 360.0
    if ha > 180.0:
        ha -= 360.0
    h = D2R * ha
    d = D2R * dec
    p = D2R * lat_deg

    sin_alt = math.sin(d) * math.sin(p) + math.cos(d) * math.cos(p) * math.cos(h)
    alt = math.asin(max(-1.0, min(1.0, sin_alt)))

    east = -math.cos(d) * math.sin(h)
    north = math.sin(d) * math.cos(p) - math.cos(d) * math.sin(p) * math.cos(h)
    az = math.atan2(east, north) * R2D % 360.0

    if refract:
        alt_app = alt * R2D + refraction_deg(alt * R2D)
        return alt_app, az
    return alt * R2D, az


def refraction_deg(true_alt_deg: float) -> float:
    """Saemundsson/Bennett refraction (degrees), valid near and above horizon."""
    h = max(-1.5, true_alt_deg)
    r = 1.02 / math.tan(D2R * (h + 10.3 / (h + 5.11))) / 60.0
    if true_alt_deg < -1.5:
        r = 0.0
    return r


# ---------------------------------------------------------------- sun

def sun_ra_dec(jd: float) -> tuple[float, float]:
    """Geometric solar position, mean ecliptic & equinox of date (~0.01 deg),
    then converted to J2000-equivalent RA/Dec via inverse precession-free approach:
    we instead return coords of date and let callers use them directly with jd."""
    n = jd - J2000
    l = (280.460 + 0.9856474 * n) % 360.0
    g = D2R * ((357.528 + 0.9856003 * n) % 360.0)
    lam = D2R * ((l + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g)) % 360.0)
    eps = D2R * (23.439 - 0.0000004 * n)

    x = math.cos(lam)
    y = math.cos(eps) * math.sin(lam)
    z = math.sin(eps) * math.sin(lam)

    ra = math.atan2(y, x) * R2D % 360.0
    dec = math.asin(z) * R2D

    # convert equinox-of-date to J2000 so that altaz()'s precession is consistent
    ra_j2000, dec_j2000 = _precess_j2000_to_date_inverse(ra, dec, jd)
    return ra_j2000, dec_j2000


def _precess_j2000_to_date_inverse(ra_deg: float, dec_deg: float, jd: float) -> tuple[float, float]:
    """Precess equinox-of-date back to J2000 (inverse of _precess_j2000_to_date)."""
    t = (jd - J2000) / 36525.0
    xi = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * ASEC2DEG
    ze = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * ASEC2DEG
    th = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * ASEC2DEG

    a = D2R * ra_deg
    d = D2R * dec_deg
    xia, zea, tha = D2R * xi, D2R * ze, D2R * th

    cosd, sind = math.cos(d), math.sin(d)
    cosa, sina = math.cos(a), math.sin(a)
    x = cosd * cosa
    y = cosd * sina
    z = sind

    cz, sz = math.cos(zea), math.sin(zea)
    ct, st = math.cos(tha), math.sin(tha)

    x2 = cz * x - sz * y
    y2 = sz * x + cz * y
    y3 = ct * y2 + st * z
    z3 = -st * y2 + ct * z
    x4 = x2
    cx, sx = math.cos(xia), math.sin(xia)
    xf = cx * x4 + sx * y3
    yf = -sx * x4 + cx * y3

    ra_new = math.atan2(yf, xf) * R2D % 360.0
    dec_new = math.asin(max(-1.0, min(1.0, z3))) * R2D
    return ra_new, dec_new


# ---------------------------------------------------------------- moon

def moon_ra_dec(jd: float) -> tuple[float, float]:
    """Lunar RA/Dec (J2000-ish), truncated ELP/Meeus ch.47 (~0.3 deg)."""
    t = (jd - J2000) / 36525.0

    lp = D2R * ((218.316 + 481267.8813 * t) % 360.0)      # mean longitude
    d = D2R * ((297.8502 + 445267.1115 * t) % 360.0)      # mean elongation
    m = D2R * ((357.5291 + 35999.0503 * t) % 360.0)       # sun anomaly
    mp = D2R * ((134.9634 + 477198.8676 * t) % 360.0)     # moon anomaly
    f = D2R * ((93.2721 + 483202.0175 * t) % 360.0)       # argument of latitude

    lon = lp + D2R * (
        + 6.289 * math.sin(mp)
        + 1.274 * math.sin(2 * d - mp)
        + 0.658 * math.sin(2 * d)
        + 0.214 * math.sin(2 * mp)
        - 0.186 * math.sin(m)
        - 0.114 * math.sin(2 * f)
        + 0.059 * math.sin(2 * d - 2 * mp)
        + 0.057 * math.sin(2 * d - m - mp)
        + 0.053 * math.sin(2 * d + mp)
        - 0.046 * math.sin(2 * d - m)
        - 0.041 * math.sin(m - mp)
        - 0.035 * math.sin(d)
        - 0.031 * math.sin(m + mp)
    )
    lat = D2R * (
        + 5.128 * math.sin(f)
        + 0.281 * math.sin(mp + f)
        - 0.278 * math.sin(mp - f)
        + 0.173 * math.sin(2 * d - f)
        + 0.055 * math.sin(2 * d - mp + f)
        - 0.046 * math.sin(2 * d - mp - f)
        + 0.033 * math.sin(2 * d + f)
    )

    eps = D2R * (23.4393 - 0.0130 * t)
    sl, cl = math.sin(lon), math.cos(lon)
    sb, cb = math.sin(lat), math.cos(lat)
    x = cb * cl
    y = cb * sl * math.cos(eps) - sb * math.sin(eps)
    z = cb * sl * math.sin(eps) + sb * math.cos(eps)

    ra = math.atan2(y, x) * R2D % 360.0
    dec = math.asin(max(-1.0, min(1.0, z))) * R2D
    # series gives equinox-of-date; convert to J2000 for consistency with altaz()
    ra_j2000, dec_j2000 = _precess_j2000_to_date_inverse(ra, dec, jd)
    return ra_j2000, dec_j2000


def moon_illumination(jd: float) -> float:
    """Fractional illuminated disc (0..1)."""
    ra_s, dec_s = sun_ra_dec(jd)
    ra_m, dec_m = moon_ra_dec(jd)
    ras, decs = D2R * ra_s, D2R * dec_s
    ram, decm = D2R * ra_m, D2R * dec_m
    cos_elong = (math.sin(decs) * math.sin(decm)
                 + math.cos(decs) * math.cos(decm) * math.cos(ras - ram))
    psi = math.acos(max(-1.0, min(1.0, cos_elong)))
    k = (1.0 - math.cos(psi)) / 2.0
    return max(0.0, min(1.0, k))
