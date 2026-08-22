"""Golden-value tests for the pure-python astronomy engine."""

from datetime import datetime, timedelta

import pytest

from app import astro


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
    ra, dec = 16.695 * 15, 36.467
    best_alt, best_az = -99, None
    t = datetime(2026, 8, 22, 0, 0)
    while t < datetime(2026, 8, 23, 0, 0):
        jd = astro.julian_day(t)
        a, az = astro.altaz(ra, dec, jd, lat, lon)
        if a > best_alt:
            best_alt, best_az = a, az
        t += timedelta(minutes=5)
    theory = 90 - abs(lat - dec)
    assert best_alt == pytest.approx(theory, abs=0.3)
    assert best_az == pytest.approx(180, abs=1.5)


def test_sun_position_august_2026():
    jd = astro.julian_day(datetime(2026, 8, 22, 12, 0))
    ra, dec = astro.sun_ra_dec(jd)
    ra_hours = ra / 15
    assert ra_hours == pytest.approx(10.1, abs=0.05)
    assert dec == pytest.approx(11.6, abs=0.15)


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


def test_moon_position_sanity():
    """Moon vs astropy/ERFA reference for 2026-08-22 23:00 UT (truncated ELP
    series are documented to ~0.3-0.4 deg)."""
    jd = astro.julian_day(datetime(2026, 8, 22, 23, 0))
    ra, dec = astro.moon_ra_dec(jd)
    assert ra / 15 == pytest.approx(18.047, abs=0.05)   # = 0.75 deg
    assert dec == pytest.approx(-27.958, abs=0.6)
