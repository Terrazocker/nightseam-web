"""Catalog coordinate parsing: right ascension stays in [0, 24) hours."""
import math

import pytest

from catalog_data.parsers import parse_ra_hours


@pytest.mark.parametrize('value, hours', [
    ('12 30 00', 12.5), ('00:42:44.3', 0 + 42 / 60 + 44.3 / 3600), ('5,5', 5.5), ('0', 0.0), ('23.99', 23.99)])
def test_right_ascension_formats(value, hours):
    assert parse_ra_hours(value) == pytest.approx(hours)


@pytest.mark.parametrize('value', ['-5 30', '-0.5', '24', '25 00 00', 'nan', 'inf', '', None, 'abc'])
def test_out_of_range_or_unparseable_right_ascension_is_rejected(value):
    """A signed sexagesimal RA used to be misread (-5 30 -> -4.5 h)."""
    result = parse_ra_hours(value)
    assert result is None, (value, result)
    assert result is None or math.isfinite(result)
