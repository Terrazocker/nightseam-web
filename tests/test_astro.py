"""Golden-value tests for the pure-python astronomy engine."""

import math
from datetime import datetime, timedelta

import pytest

from app import astro


def _meeus_precess(ra_deg, dec_deg, jd):
    """Independent transcription of Meeus ch. 21, eq. 21.4 (the reference).

    Deliberately written from the book formula (A/B/C + atan2(A, B) + z) rather
    than shared with app/astro.py, so a wrong axis or sign in the engine cannot
    hide behind an identical helper."""
    t = (jd - 2451545.0) / 36525.0
    zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) / 3600.0
    z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) / 3600.0
    theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) / 3600.0
    a0, d0 = math.radians(ra_deg), math.radians(dec_deg)
    zr, zr2, tr = math.radians(zeta), math.radians(z), math.radians(theta)
    A = math.cos(d0) * math.sin(a0 + zr)
    B = math.cos(tr) * math.cos(d0) * math.cos(a0 + zr) - math.sin(tr) * math.sin(d0)
    C = math.sin(tr) * math.cos(d0) * math.cos(a0 + zr) + math.cos(tr) * math.sin(d0)
    return math.degrees(math.atan2(A, B) + zr2) % 360.0, math.degrees(math.asin(C))


# ---------------------------------------------------------------- time

def test_julian_day_meeus_examples():
    # Meeus, "Astronomical Algorithms", chapter 7 examples
    assert astro.julian_day(datetime(2000, 1, 1, 12, 0)) == pytest.approx(2451545.0)
    assert astro.julian_day(datetime(1987, 1, 27, 0, 0)) == pytest.approx(2446822.5)
    assert astro.julian_day(datetime(2025, 1, 1, 0, 0)) == pytest.approx(2460676.5)


def test_gmst_at_j2000():
    # Meeus ch. 12: GMST at J2000.0 (2000-01-01 12h UT) = 280.46061837 deg
    jd = astro.julian_day(datetime(2000, 1, 1, 12, 0))
    assert astro.gmst_deg(jd) % 360 == pytest.approx(280.46061837, abs=1e-4)


# ---------------------------------------------------------------- coordinates

def test_precession_round_trip_exact():
    jd = astro.julian_day(datetime(2026, 8, 22, 22, 0))
    for ra, dec in [(83.6, 22.0), (210.8, 54.35), (359.9, -45.5), (10.1, 11.6)]:
        r2, d2 = astro._precess_j2000_to_date(ra, dec, jd)
        r3, d3 = astro._precess_j2000_to_date_inverse(r2, d2, jd)
        dra = ((r3 - ra + 180) % 360) - 180
        assert abs(dra) < 1e-6
        assert d3 == pytest.approx(dec, abs=1e-6)


@pytest.mark.parametrize("year", [1900, 1950, 2000, 2026, 2100, 2200])
@pytest.mark.parametrize("ra,dec", [
    (0.0, 0.0), (41.049942, 49.228467), (83.63, 22.01), (250.42, 36.46),
    (210.80, -45.50), (15.0, 89.0), (359.5, -70.0), (120.0, 0.0),
])
def test_precession_matches_meeus_reference(year, ra, dec):
    """The engine must reproduce published Meeus ch. 21 values at many epochs.

    Regression: the original implementation rotated about the X axis (instead
    of Y) and flipped the node sign, so it moved the vernal equinox by
    ~0.0004 deg over 27 years instead of ~0.34 deg - every catalog altitude
    was off by up to 0.5 deg. A round-trip test could not catch it, because the
    inverse was built from the same wrong matrix."""
    jd = astro.julian_day(datetime(year, 1, 1, 12, 0))
    got_ra, got_dec = astro._precess_j2000_to_date(ra, dec, jd)
    want_ra, want_dec = _meeus_precess(ra, dec, jd)
    # 1e-5 deg = 0.036 arcsec: the two implementations are the same equations
    # evaluated in a different order, so only rounding separates them (the bug
    # this guards against was ~0.4 deg, five orders of magnitude larger)
    sep = _sep_deg(got_ra, got_dec, want_ra, want_dec)
    assert sep < 1e-5, f"{year}: {sep} deg off the ch. 21 reference"


def test_precession_moves_the_vernal_equinox_at_the_published_rate():
    """Independent of any implementation: over T centuries the equinox moves
    m = 3.07496 s/yr in RA and n = 20.0431"/yr in Dec (Meeus ch. 21)."""
    jd = astro.julian_day(datetime(2026, 8, 22, 22, 0))
    t_years = (jd - astro.J2000) / 365.25
    ra, dec = astro._precess_j2000_to_date(0.0, 0.0, jd)
    want_ra = (3.07496 / 3600.0 / 24.0 * 360.0) * t_years
    want_dec = (20.0431 / 3600.0) * t_years
    assert ra == pytest.approx(want_ra, abs=0.002)
    assert dec == pytest.approx(want_dec, abs=0.002)
    # and it must actually move (the old code returned ~0.0004 deg here)
    assert ra > 0.3 and dec > 0.1


def test_transit_altitude_uses_the_precessed_declination():
    """M13 culminates at 90 - |lat - dec_of_date|. Using the J2000 dec as if it
    were of date is the exact symptom of the precession bug (M13's dec drifts
    ~-0.05 deg by 2026 - small, but larger than this test's tolerance).

    The window is a full day: in late August M13 transits in the afternoon at
    this longitude, so a night-only window would measure a lower altitude."""
    lat, lon = 52.52, 13.40
    ra, dec_j2000 = 16.695 * 15, 36.467
    _, dec_of_date = _meeus_precess(ra, dec_j2000,
                                    astro.julian_day(datetime(2026, 8, 22, 22, 0)))
    best = -99.0
    t = datetime(2026, 8, 22, 0, 0)
    while t < datetime(2026, 8, 23, 0, 0):
        alt, _az = astro.altaz(ra, dec_j2000, astro.julian_day(t), lat, lon)
        best = max(best, alt)
        t += timedelta(minutes=2)
    assert best == pytest.approx(90 - abs(lat - dec_of_date), abs=0.05)


def _sep_deg(ra1, dec1, ra2, dec2) -> float:
    a1, a2 = math.radians(dec1), math.radians(dec2)
    return math.degrees(math.acos(max(-1.0, min(1.0,
        math.sin(a1) * math.sin(a2)
        + math.cos(a1) * math.cos(a2) * math.cos(math.radians(ra1 - ra2))))))


@pytest.mark.parametrize("hour_utc", [0, 6, 12, 18])
def test_polaris_tracks_latitude(hour_utc):
    lat, lon = 52.52, 13.40          # Berlin
    jd = astro.julian_day(datetime(2026, 8, 22, hour_utc, 0))
    alt, _az = astro.altaz(2.530 * 15, 89.264, jd, lat, lon)
    # Polaris is ~0.7 deg from the pole -> oscillates around the latitude
    assert alt == pytest.approx(lat, abs=0.8)


def test_m13_transit_berlin():
    """M13 culminates at 90 - |lat - dec| due south."""
    lat, lon = 52.52, 13.40
    ra, dec_j2000 = 16.695 * 15, 36.467
    # the catalog ships J2000 coords, but the transit altitude is set by the
    # declination OF DATE - using the J2000 value here would hide a broken
    # precession behind the old, loose tolerance
    _, dec = _meeus_precess(ra, dec_j2000,
                            astro.julian_day(datetime(2026, 8, 22, 22, 0)))
    best_alt, best_az = -99, None
    t = datetime(2026, 8, 22, 0, 0)
    while t < datetime(2026, 8, 23, 0, 0):
        jd = astro.julian_day(t)
        a, az = astro.altaz(ra, dec_j2000, jd, lat, lon)
        if a > best_alt:
            best_alt, best_az = a, az
        t += timedelta(minutes=5)
    theory = 90 - abs(lat - dec)
    assert best_alt == pytest.approx(theory, abs=0.1)
    assert best_az == pytest.approx(180, abs=1.5)


def test_sun_position_august_2026():
    jd = astro.julian_day(datetime(2026, 8, 22, 12, 0))
    ra, dec = astro.sun_ra_dec(jd)
    # Contract: the pair is in the J2000 frame, which is what altaz() expects
    # (it precesses it to the equinox of date itself). Before the precession
    # fix this function returned values that only *looked* like of-date
    # coordinates, because the inverse it used was the inverse of a wrong
    # matrix - so both frames are pinned here.
    ra_of_date, dec_of_date = _meeus_precess(ra, dec, jd)
    assert ra / 15 == pytest.approx(10.1, abs=0.05)          # J2000 frame
    assert dec == pytest.approx(11.80, abs=0.15)             # J2000 frame
    assert ra_of_date / 15 == pytest.approx(10.1, abs=0.05)  # of date
    assert dec_of_date == pytest.approx(11.60, abs=0.15)     # of date


def test_sun_noon_altitude_berlin():
    """Solar noon altitude in late August from Berlin ~ 90 - lat + dec."""
    lat, lon = 52.52, 13.40
    jd = astro.julian_day(datetime(2026, 8, 22, 10, 30))   # near solar noon UTC
    ra, dec = astro.sun_ra_dec(jd)
    alt = astro.altaz(ra, dec, jd, lat, lon)[0]
    assert alt == pytest.approx(90 - lat + dec, abs=1.0)


def test_refraction_magnitude():
    for h in [5, 10, 20, 45]:
        r = astro.refraction_deg(h)
        expected = 1.02 / __import__("math").tan(
            __import__("math").radians(h + 10.3 / (h + 5.11))) / 60
        assert r == pytest.approx(expected, rel=0.01)
        assert 0 < r < 0.6


def test_moon_illumination_bounds():
    for day in range(1, 29):
        jd = astro.julian_day(datetime(2026, 8, day, 23, 0))
        k = astro.moon_illumination(jd)
        assert 0.0 <= k <= 1.0


def test_moon_illumination_and_age_at_published_phases():
    """Independent anchors from published 2026 moon phases (moongiant, lunaf,
    starwalk and space.com agree: new moon 2026-08-12 17:37 UT, full moon
    2026-08-28 04:18 UT). The truncated ELP series is accurate to ~0.3-0.4 deg,
    so at the phases - where cos(elongation) is flat - the illumination anchor
    is tight, while the age (0.082 d per degree of elongation) tolerates the
    series error. This pins moon_illumination/moon_age ABSOLUTELY, so the
    desktop/web parity test cannot pass while both share a wrong phase formula."""
    jd_new = astro.julian_day(datetime(2026, 8, 12, 17, 37))
    assert astro.moon_illumination(jd_new) == pytest.approx(0.0, abs=0.002)
    # the truncated ELP series leaves the elongation ~1.4 deg off at this
    # instant (0.113 d measured against 0 expected) - age tolerates it
    assert astro.moon_age(jd_new) == pytest.approx(0.0, abs=0.15)
    jd_full = astro.julian_day(datetime(2026, 8, 28, 4, 18))
    assert astro.moon_illumination(jd_full) == pytest.approx(1.0, abs=0.002)
    # same ~1 deg elongation tolerance as the new-moon anchor (measured 0.07 d)
    assert astro.moon_age(jd_full) == pytest.approx(astro.SYNODIC_MONTH / 2,
                                                    abs=0.15)


def test_moon_illumination_matches_elongation_from_pinned_positions():
    """Illumination and age are (1-cos psi)/2 and SYNODIC*psi/2pi with psi the
    sun-moon elongation - computed here from the ERFA-pinned 2026-08-22 23:00
    positions (test_moon_position_sanity), so a wrong phase formula or synodic
    constant cannot hide behind a wrong but shared position series."""
    jd = astro.julian_day(datetime(2026, 8, 22, 23, 0))
    ra_s, dec_s = astro.sun_ra_dec(jd)
    ra_m, dec_m = astro.moon_ra_dec(jd)
    psi = _sep_deg(ra_s, dec_s, ra_m, dec_m)
    assert astro.moon_illumination(jd) == pytest.approx(
        (1 - math.cos(math.radians(psi))) / 2, abs=1e-9)
    assert astro.moon_age(jd) == pytest.approx(
        astro.SYNODIC_MONTH * psi / 360.0, abs=1e-9)


def test_moon_position_sanity():
    """Moon vs astropy/ERFA reference for 2026-08-22 23:00 UT (truncated ELP
    series are documented to ~0.3-0.4 deg)."""
    jd = astro.julian_day(datetime(2026, 8, 22, 23, 0))
    ra, dec = astro.moon_ra_dec(jd)
    assert ra / 15 == pytest.approx(18.047, abs=0.05)   # = 0.75 deg
    assert dec == pytest.approx(-27.958, abs=0.6)
