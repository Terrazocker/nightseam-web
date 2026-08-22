"""Tests for horizon-profile helpers and derived-window logic."""

from app.server import ceil_lookup, longest_run, NO_BLOCK


def test_ceil_lookup_maps_azimuth_bins():
    # synthetic profile: 20 deg obstacle over az 0..90, clear elsewhere
    prof = [20 if i * 0.5 < 90 else NO_BLOCK for i in range(720)]
    f = ceil_lookup(prof)
    assert f(0) == 20
    assert f(45) == 20
    assert f(89.9) == 20
    assert f(90.1) == NO_BLOCK
    assert f(180) == NO_BLOCK
    assert f(-30) == NO_BLOCK        # -30 deg == 330 deg -> clear region
    assert f(-300) == 20             # -300 deg == 60 deg -> blocked region
    assert f(359) == NO_BLOCK


def test_ceil_lookup_empty_profile_never_blocks():
    f = ceil_lookup([])
    for az in [0, 90, 179.9, 270, 359]:
        assert f(az) == NO_BLOCK


def test_longest_run_basic():
    assert longest_run([True, True, False, True]) == (0, 2)
    assert longest_run([False, True, True, True, False]) == (1, 4)
    assert longest_run([False, False]) is None
    assert longest_run([]) is None
    assert longest_run([True]) == (0, 1)


def test_longest_run_prefers_longest():
    flags = [True, False] + [True] * 5 + [False, True]
    assert longest_run(flags) == (2, 7)
