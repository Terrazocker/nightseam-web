"""Finite coordinate parsing for catalog builds."""
import math
import re

def _finite_float(value) -> float | None:
    """The float value, or None when it is not a finite float.

    Catalog source values are untrusted input, so `nan`/`inf`/`1e400` must
    never leave a parser as a float: a non-finite coordinate would reach the
    planner's trigonometry. Treat a non-finite number exactly like an
    unparseable one (None).

    Used by `parse_ra_hours` / `parse_dec_deg`; `_parse_value` keeps its own
    inline test because there a failed float() must fall back to the raw card
    text rather than to None."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def parse_ra_hours(value) -> float | None:
    """Decimal hours (dot or comma), or sexagesimal 'HH MM SS.s' -> hours.

    Right ascension lies in [0, 24); anything else (including a signed
    sexagesimal value) is rejected as None rather than reinterpreted."""
    hours = _parse_ra_unchecked(value)
    return hours if hours is not None and 0 <= hours < 24 else None


def _parse_ra_unchecked(value) -> float | None:
    if value is None:
        return None
    s = str(value).strip().replace(",", ".")
    f = _finite_float(s)                 # PY-04: inf/nan -> None (not a number)
    if f is not None:
        return f
    parts = [p for p in re.split(r"[\s:]+",
                                 s.replace("h", " ").replace("m", " ")
                                  .replace("s", " ")) if p]
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        return None
    if not vals or not all(math.isfinite(v) for v in vals):
        return None
    if len(vals) == 1:
        return vals[0]
    if len(vals) == 2:
        return vals[0] + vals[1] / 60.0
    return vals[0] + vals[1] / 60.0 + vals[2] / 3600.0


def parse_dec_deg(value) -> float | None:
    """Decimal degrees (dot or comma), or sexagesimal '+DD MM SS' -> degrees."""
    if value is None:
        return None
    s = str(value).strip().replace(",", ".")
    f = _finite_float(s)                 # PY-04: inf/nan -> None (not a number)
    if f is not None:
        return f
    sign = -1.0 if s.startswith("-") else 1.0
    s = s.lstrip("+-").replace("\u00b0", " ").replace("d", " ") \
                      .replace("'", " ").replace('"', " ")
    parts = [p for p in re.split(r"[\s:]+", s) if p]
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        return None
    if not vals or not all(math.isfinite(v) for v in vals):
        return None
    v = abs(vals[0])
    if len(vals) >= 2:
        v += vals[1] / 60.0
    if len(vals) >= 3:
        v += vals[2] / 3600.0
    return sign * v
