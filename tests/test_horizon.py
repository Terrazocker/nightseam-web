"""Tests for horizon-profile helpers and derived-window logic."""

from app.nightcalc import ceil_lookup, longest_run, NO_BLOCK


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


# ---------------------------------------------------------------- window edges
# CONTRACT: [start, end) is half-open - `end` is the first sample AFTER the run
# and may equal len(flags). It is a boundary, not an index: `times_iso[end]`
# does not exist in that case (the regression behind the "--:--" / "NaNh NaNm"
# rendering). These cases pin every edge the consumers rely on.

def test_longest_run_ends_at_index_zero():
    # a single visible sample at the very start -> run [0, 1)
    assert longest_run([True, False, False]) == (0, 1)


def test_longest_run_run_of_length_one():
    assert longest_run([False, False, True, False]) == (2, 3)


def test_longest_run_reaching_the_last_sample_returns_the_grid_length():
    flags = [False, True, True, True]
    assert longest_run(flags) == (1, 4)          # end == len(flags)
    assert longest_run(flags)[1] == len(flags)   # a boundary, not an index


def test_longest_run_entire_grid_clear():
    flags = [True] * 12
    start, end = longest_run(flags)
    assert (start, end) == (0, 12)
    assert end - start == 12                     # every sample counted once


def test_longest_run_entire_grid_blocked():
    assert longest_run([False] * 9) is None


def test_longest_run_beginning_at_zero_and_multi_run_tie_prefers_the_first():
    assert longest_run([True, True, False, False]) == (0, 2)
    assert longest_run([True, True, False, True, True]) == (0, 2)

