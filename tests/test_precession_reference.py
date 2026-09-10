"""Independent precession reference test (IAU 2006 / Capitaine et al.).

WHY THIS FILE EXISTS SEPARATELY FROM tests/test_astro.py
-------------------------------------------------------
The engine (`app/astro.py::_precess`) implements Meeus "Astronomical
Algorithms" ch. 21 eq. 21.4, and `tests/test_astro.py` compares it against a
transcription of *the same equations*. That catches typos, but not a shared
misreading of the source formula - which is exactly how the original bug (a
middle rotation about X instead of Y, with a flipped node sign) survived in all
three engines at once.

This module therefore uses a DIFFERENT published model: the IAU 2006 precession
angles of Capitaine, Wallace & Chapront (2003), as tabulated in USNO Circular
179 / the SOFA `iauPmat06` documentation:

    zeta_A  = ( 2.650545 + 2306.083227 T + 0.2988499 T^2 + 0.01801828 T^3
                - 5.971e-6 T^4 - 3.173e-7 T^5 ) arcsec
    z_A     = (-2.650545 + 2306.077181 T + 1.0927348 T^2 + 0.01826837 T^3
                - 2.8596e-5 T^4 - 2.904e-7 T^5 ) arcsec
    theta_A = (           2004.191903 T - 0.4294934 T^2 - 0.04182264 T^3
                - 7.089e-6 T^4 - 1.274e-7 T^5 ) arcsec

with T in Julian centuries of TDB since J2000.0, applied through the same
equatorial composition (`A = cos d sin(a+zeta_A)`, `B = cos theta cos d
cos(a+zeta_A) - sin theta sin d`, `C = sin theta cos d cos(a+zeta_A) + cos theta
sin d`, `a' = atan2(A, B) + z_A`, `d' = asin C`).

The two models differ only by the precession-model update between IAU 1976
(Meeus ch. 21) and IAU 2006 - a few 0.1 arcsec over the epochs tested - so
agreement at the 1e-4 deg level is meaningful, while the old bug (0.4 deg at
2026) is three orders of magnitude larger.
"""

import math
from datetime import datetime

import pytest

from app import astro


def _iau2006_angles(jd: float) -> tuple[float, float, float]:
    """(zeta_A, z_A, theta_A) of IAU 2006 in DEGREES for the given JD."""
    t = (jd - astro.J2000) / 36525.0
    zeta = (2.650545 + 2306.083227 * t + 0.2988499 * t ** 2
            + 0.01801828 * t ** 3 - 5.971e-6 * t ** 4 - 3.173e-7 * t ** 5) / 3600.0
    z = (-2.650545 + 2306.077181 * t + 1.0927348 * t ** 2
         + 0.01826837 * t ** 3 - 2.8596e-5 * t ** 4 - 2.904e-7 * t ** 5) / 3600.0
    theta = (2004.191903 * t - 0.4294934 * t ** 2 - 0.04182264 * t ** 3
             - 7.089e-6 * t ** 4 - 1.274e-7 * t ** 5) / 3600.0
    return zeta, z, theta


def _iau2006_precess(ra_deg: float, dec_deg: float, jd: float,
                     reverse: bool = False) -> tuple[float, float]:
    """IAU 2006 precession, J2000 <-> mean equinox of date."""
    zeta, z, theta = _iau2006_angles(jd)
    if reverse:                       # same rule the engine uses: negate/swap
        zeta, z, theta = -z, -zeta, -theta
    a0, d0 = math.radians(ra_deg), math.radians(dec_deg)
    zr, zr2, tr = math.radians(zeta), math.radians(z), math.radians(theta)
    ca = math.cos(d0) * math.sin(a0 + zr)
    cb = math.cos(tr) * math.cos(d0) * math.cos(a0 + zr) - math.sin(tr) * math.sin(d0)
    cc = math.sin(tr) * math.cos(d0) * math.cos(a0 + zr) + math.cos(tr) * math.sin(d0)
    return math.degrees(math.atan2(ca, cb) + zr2) % 360.0, math.degrees(math.asin(cc))


def _sep_deg(ra1, dec1, ra2, dec2) -> float:
    a1, a2 = math.radians(dec1), math.radians(dec2)
    return math.degrees(math.acos(max(-1.0, min(1.0,
        math.sin(a1) * math.sin(a2)
        + math.cos(a1) * math.cos(a2) * math.cos(math.radians(ra1 - ra2))))))


_EPOCHS = [1900, 1950, 2000, 2026, 2100]
_POINTS = [
    (0.0, 0.0),             # the vernal equinox: the cleanest regression probe
    (41.049942, 49.228467),  # theta Persei, Meeus' own worked example
    (250.42, 36.46),        # M13
    (210.80, -45.50),       # far south
    (15.0, 89.0),           # near the pole (Polaris' neighbourhood)
    (359.5, -70.0),         # RA wraparound
]

# IAU 1976 (Meeus) vs IAU 2006 differ by < 0.5 arcsec over 1900-2100; the old
# X-axis bug was ~1440 arcsec. 2 arcsec cleanly separates the two regimes.
_TOL_DEG = 2.0 / 3600.0


@pytest.mark.parametrize("year", _EPOCHS)
@pytest.mark.parametrize("ra,dec", _POINTS)
def test_engine_matches_iau2006_reference(year, ra, dec):
    jd = astro.julian_day(datetime(year, 1, 1, 12, 0))
    got_ra, got_dec = astro._precess_j2000_to_date(ra, dec, jd)
    want_ra, want_dec = _iau2006_precess(ra, dec, jd)
    sep = _sep_deg(got_ra, got_dec, want_ra, want_dec)
    assert sep < _TOL_DEG, (
        f"{year} ({ra}, {dec}): {sep * 3600:.2f} arcsec from the IAU 2006 "
        f"reference (limit {_TOL_DEG * 3600:.1f} arcsec)")


@pytest.mark.parametrize("year", _EPOCHS)
def test_engine_inverse_matches_iau2006_reference(year):
    """The date->J2000 direction must also follow the independent model."""
    jd = astro.julian_day(datetime(year, 6, 15, 3, 0))
    for ra, dec in _POINTS:
        of_date_ra, of_date_dec = _iau2006_precess(ra, dec, jd)
        got_ra, got_dec = astro._precess_j2000_to_date_inverse(
            of_date_ra, of_date_dec, jd)
        sep = _sep_deg(got_ra, got_dec, ra, dec)
        assert sep < _TOL_DEG, (year, ra, dec, sep * 3600)


def test_iau2006_reference_is_not_the_meeus_formula():
    """Guard: the two models must actually differ (so the comparison is
    meaningful in the small terms), yet agree far inside the old bug's size."""
    jd = astro.julian_day(datetime(2026, 1, 1, 12, 0))
    iau = _iau2006_precess(0.0, 0.0, jd)
    meeus = astro._precess_j2000_to_date(0.0, 0.0, jd)
    sep_arcsec = _sep_deg(iau[0], iau[1], meeus[0], meeus[1]) * 3600
    assert 0.0 < sep_arcsec < 2.0, sep_arcsec      # a different, newer model
    # ... and the equinox still moves at the published general-precession rate
    # m = 3.07496 s/yr of RA (Meeus ch. 21), evaluated for THIS epoch
    t_years = (jd - astro.J2000) / 365.25
    want_ra = (3.07496 / 3600.0 / 24.0 * 360.0) * t_years
    assert iau[0] == pytest.approx(want_ra, abs=0.002)
    assert iau[1] == pytest.approx((20.0431 / 3600.0) * t_years, abs=0.002)


def test_old_x_axis_bug_would_fail_this_reference():
    """A reproduction of the pre-fix rotation, to prove the tolerance bites.

    The engine used to rotate about X in the middle and flip the node sign;
    reimplemented here so the test documents the size of the regression it
    guards against (it must be far outside `_TOL_DEG`)."""
    def buggy(ra_deg, dec_deg, jd):
        t = (jd - astro.J2000) / 36525.0
        xi = (2306.2181 * t + 0.30188 * t ** 2 + 0.017998 * t ** 3) / 3600.0
        ze = (2306.2181 * t + 1.09468 * t ** 2 + 0.018203 * t ** 3) / 3600.0
        th = (2004.3109 * t - 0.42665 * t ** 2 - 0.041833 * t ** 3) / 3600.0
        a, d = math.radians(ra_deg), math.radians(dec_deg)
        x, y, z = math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)
        cx, sx = math.cos(math.radians(xi)), math.sin(math.radians(xi))
        cz, sz = math.cos(math.radians(ze)), math.sin(math.radians(ze))
        ct, st = math.cos(math.radians(th)), math.sin(math.radians(th))
        x2, y2 = cx * x - sx * y, sx * x + cx * y
        y3, z3 = ct * y2 - st * z, st * y2 + ct * z
        xf, yf = cz * x2 + sz * y3, -sz * x2 + cz * y3
        return (math.degrees(math.atan2(yf, xf)) % 360.0,
                math.degrees(math.asin(max(-1.0, min(1.0, z3)))))

    jd = astro.julian_day(datetime(2026, 1, 1, 12, 0))
    buggy_ra, buggy_dec = buggy(83.63, 22.01, jd)
    want_ra, want_dec = _iau2006_precess(83.63, 22.01, jd)
    sep = _sep_deg(buggy_ra, buggy_dec, want_ra, want_dec)
    assert sep > 100 * _TOL_DEG, f"the old bug was only {sep * 3600:.1f} arcsec"
