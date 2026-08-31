"""Tests for the shared night-window / twilight search (app/planning.py)."""

from datetime import datetime, timedelta

import pytest

from app.planning import find_twilight, local_utc, make_sun_alt_fn, night_window


# ---------------------------------------------------------------- conversions

def test_local_utc_applies_tz():
    # tz_min=120 -> local 14:00 is 12:00 UTC
    assert local_utc(2026, 8, 24, 120, 14) == datetime(2026, 8, 24, 12, 0)
    assert local_utc(2026, 8, 24, -330, 12, 30) == datetime(2026, 8, 24, 18, 0)


def test_local_utc_negative_tz_crosses_day():
    # UTC+13.5: local 00:00 on the 25th is 13:30 UTC the same day
    assert local_utc(2026, 8, 25, -810, 0) == datetime(2026, 8, 25, 13, 30)


# ---------------------------------------------------------------- twilight

def test_find_twilight_detects_crossing():
    # monotonic sun: crosses the level exactly at t+30min
    def fake_sun(t: datetime) -> float:
        return 2.0 - 4.0 * (t - datetime(2026, 1, 1)).total_seconds() / 3600.0

    dusk, dawn = find_twilight(fake_sun,
                               datetime(2026, 1, 1), datetime(2026, 1, 2), 0.0)
    # sun = 0 when (t - start) = 0.5 h -> 00:30
    assert dusk == pytest.approx(datetime(2026, 1, 1, 0, 30), abs=timedelta(minutes=2))
    assert dawn is None  # sun stays below -> no second crossing


def test_find_twilight_both_crossings():
    # parabola: 3 at h=0, 0 at h=1 (dusk), -1 at h=2, 0 at h=3 (dawn)
    def fake_sun(t: datetime) -> float:
        hours = (t - datetime(2026, 1, 1)).total_seconds() / 3600.0
        return 3.0 - 4.0 * hours + hours * hours

    dusk, dawn = find_twilight(fake_sun,
                               datetime(2026, 1, 1), datetime(2026, 1, 2), 0.0)
    assert dusk == pytest.approx(datetime(2026, 1, 1, 1, 0), abs=timedelta(minutes=2))
    assert dawn == pytest.approx(datetime(2026, 1, 1, 3, 0), abs=timedelta(minutes=2))


# ---------------------------------------------------------------- night window

def test_night_window_summer_midlatitudes():
    """Berlin-ish, a normal summer night: astronomical twilight found, and
    the returned dusk/dawn really are the sun crossing -18 deg."""
    w = night_window(2026, 8, 24, 120, 52.5, 13.4)
    assert w["level"] in ("astronomical", "nautical", "civil")
    assert w["sunset"] < w["dusk"] < w["dawn"] < w["sunrise"]
    assert w["t_start"] < w["dusk"]
    if w["level"] == "astronomical":
        sun = make_sun_alt_fn(52.5, 13.4)
        assert sun(w["dusk"]) == pytest.approx(-18.0, abs=0.3)
        assert sun(w["dawn"]) == pytest.approx(-18.0, abs=0.3)
    # window covers at least a few hours of darkness in summer mid-lat
    assert w["dawn"] - w["dusk"] > timedelta(hours=3)


def test_night_window_winter_polar_night_falls_back():
    """85 N in December: the sun never even reaches -18 deg (deep polar
    night) -> fallback window."""
    w = night_window(2026, 12, 21, 0, 85.0, 15.0)
    assert w["dusk"] is not None and w["dawn"] is not None
    assert w["dawn"] > w["dusk"]
    assert w["level"] == "fallback"


def test_night_window_winter_polar_night_still_astronomical():
    """78 N in December: the sun tops out at ~-11 deg, so it still dips
    below -18 -> astronomical twilight exists (not a fallback)."""
    w = night_window(2026, 12, 21, 0, 78.0, 15.0)
    assert w["level"] == "astronomical"
    assert w["dusk"] is not None and w["dawn"] is not None
    assert w["dawn"] > w["dusk"]


def test_night_window_summer_polar_day_falls_back():
    """78 N in June: the sun never sets -> fallback window."""
    w = night_window(2026, 6, 21, 0, 78.0, 15.0)
    assert w["dusk"] is not None and w["dawn"] is not None
    assert w["dawn"] > w["dusk"]
    assert w["level"] == "fallback"


def test_night_window_short_summer_night_is_nautical():
    """London (51.5 N) on the solstice: the sun dips to ~-15 deg, so it
    reaches nautical (-12) but never astronomical (-18) twilight."""
    w = night_window(2026, 6, 21, 60, 51.5, -0.1)
    assert w["level"] == "nautical"
    assert w["dusk"] is not None and w["dawn"] is not None
    assert w["dawn"] > w["dusk"]
    sun = make_sun_alt_fn(51.5, -0.1)
    assert sun(w["dusk"]) == pytest.approx(-12.0, abs=0.3)
    assert sun(w["dawn"]) == pytest.approx(-12.0, abs=0.3)


def test_night_window_far_north_summer_night_is_civil():
    """Edinburgh (57 N) on the solstice: the sun dips to ~-10 deg, so only
    civil (-6) twilight exists."""
    w = night_window(2026, 6, 21, 60, 57.0, -3.2)
    assert w["level"] == "civil"
    assert w["dusk"] is not None and w["dawn"] is not None
    assert w["dawn"] > w["dusk"]
    sun = make_sun_alt_fn(57.0, -3.2)
    assert sun(w["dusk"]) == pytest.approx(-6.0, abs=0.3)
    assert sun(w["dawn"]) == pytest.approx(-6.0, abs=0.3)


def test_night_window_southern_hemisphere():
    """Southern hemisphere in their autumn: still returns a sane window."""
    w = night_window(2026, 3, 21, 0, -33.9, 18.4)   # Cape Town
    assert w["dusk"] is not None and w["dawn"] is not None
    assert w["t_start"] < w["dusk"] < w["dawn"]
    assert w["sunset"] is not None and w["sunrise"] is not None
    assert w["sunset"] < w["dusk"] < w["dawn"] < w["sunrise"]


def test_night_window_reproducible_and_ordered():
    a = night_window(2026, 8, 24, 120, 50.0, 7.8)
    b = night_window(2026, 8, 24, 120, 50.0, 7.8)
    assert a == b