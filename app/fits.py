"""Minimal pure-Python FITS reader - primary-HDU header keywords only.

Enough to ingest astrophotography captures: OBJECT, EXPTIME, DATE-OBS,
FILTER, OBJCTRA/OBJCTDEC (plus RA/DEC), TELESCOP/INSTRUME. FITS headers are
ASCII 80-character records inside 2880-byte blocks, so no astropy/numpy is
needed; the image data itself is never touched.
"""

from __future__ import annotations

import re
from datetime import datetime

_BLOCK = 2880
_REC = 80
_MAX_BLOCKS = 512          # safety cap (~1.5 MB of header, far beyond normal)

_KEYWORD_RE = re.compile(r"^\s*([A-Z0-9_-]{1,8})\s*=\s*(.*)$")
_STRING_RE = re.compile(r"^'((?:[^']|'')*)'\s*")

_DATE_ISO_RE = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?")
_DATE_SLASH_RE = re.compile(
    r"^(\d{2})/(\d{2})/(\d{4})[T\s](\d{2}):(\d{2})(?::(\d{2}))?")

# designation-like tokens: "M31", "NGC 7000", "ngc7000", "Sh2-244", "Mel 22"
_DESIG_RE = re.compile(
    r"(?<![a-z0-9])([a-z]{1,6})[ _.-]*(\d{1,5}(?:[ _.-]+\d{1,5})?)(?![a-z0-9])")
# plain words that might be a common name ("andromeda", "crabnebula")
_WORD_RE = re.compile(r"[a-z]{4,}")

_STOPWORDS = {
    "light", "dark", "bias", "flat", "frames", "frame", "stack", "master",
    "final", "image", "images", "capture", "camera", "astro", "pilot", "fits",
    "fit", "data", "test", "trial", "good", "bad", "bin", "bin1", "bin2",
    "raw", "lrgb", "luminance", "luminancefilter", "filter", "mosaic",
}


def read_fits_header(data: bytes) -> dict:
    """Parse the primary HDU header of FITS bytes into a keyword dict.

    Returns {} when the data does not start with the SIMPLE record (i.e. not
    a FITS file). Duplicate keywords keep their first occurrence.
    """
    if not data.startswith(b"SIMPLE"):
        return {}
    records: list[str] = []
    for blk in range(_MAX_BLOCKS):
        block = data[blk * _BLOCK: (blk + 1) * _BLOCK]
        if len(block) < _REC:
            break
        for i in range(0, _BLOCK, _REC):
            rec = block[i:i + _REC].decode("latin-1", "replace")
            if rec.startswith("END"):
                return _parse_records(records)
            records.append(rec)
    return _parse_records(records)


def _parse_records(records: list[str]) -> dict:
    out: dict = {}
    for rec in records:
        if rec.startswith(("COMMENT", "HISTORY")) or not rec.strip():
            continue
        m = _KEYWORD_RE.match(rec)
        if not m:
            continue
        key, raw = m.group(1), m.group(2)
        out.setdefault(key, _parse_value(raw))
    return out


def _parse_value(raw: str):
    v = raw.strip()
    if not v:
        return None
    if v.startswith("'"):
        m = _STRING_RE.match(v)
        if m:
            return m.group(1).replace("''", "'").rstrip()
        return v[1:].rstrip()
    if "/" in v:
        v = v.split("/", 1)[0].strip()
    if v in ("T", "F"):
        return v == "T"
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        return v or None


# ---------------------------------------------------------------- parsers

def parse_ra_hours(value) -> float | None:
    """Decimal hours, or sexagesimal 'HH MM SS.s' / '05 34 31.9' -> hours."""
    if value is None:
        return None
    s = str(value).strip()
    try:
        return float(s)
    except ValueError:
        pass
    parts = [p for p in re.split(r"[\s:]+",
                                 s.replace("h", " ").replace("m", " ")
                                  .replace("s", " ")) if p]
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        return None
    if not vals:
        return None
    if len(vals) == 1:
        return vals[0]
    if len(vals) == 2:
        return vals[0] + vals[1] / 60.0
    return vals[0] + vals[1] / 60.0 + vals[2] / 3600.0


def parse_dec_deg(value) -> float | None:
    """Decimal degrees, or sexagesimal '+DD MM SS' / '+22 01 00' -> degrees."""
    if value is None:
        return None
    s = str(value).strip()
    try:
        return float(s)
    except ValueError:
        pass
    sign = -1.0 if s.startswith("-") else 1.0
    s = s.lstrip("+-").replace("\u00b0", " ").replace("d", " ") \
                      .replace("'", " ").replace('"', " ")
    parts = [p for p in re.split(r"[\s:]+", s) if p]
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        return None
    if not vals:
        return None
    v = abs(vals[0])
    if len(vals) >= 2:
        v += vals[1] / 60.0
    if len(vals) >= 3:
        v += vals[2] / 3600.0
    return sign * v


def parse_date_obs(value) -> str | None:
    """DATE-OBS -> ISO 'YYYY-MM-DDTHH:MM:SS' or None (unparseable)."""
    if value is None:
        return None
    s = str(value).strip().split(".")[0]      # drop fractional seconds
    m = _DATE_ISO_RE.match(s)
    if m:
        return _fmt_iso(m.groups())
    m = _DATE_SLASH_RE.match(s)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        # ambiguous US/EU slashed dates: day>12 forces DD/MM, else MM/DD
        if a > 12:
            y, mo, d = m.group(3), b, a
        else:
            y, mo, d = m.group(3), a, b
        return _fmt_iso((y, mo, d, m.group(4), m.group(5), m.group(6)))
    return None


def _fmt_iso(groups) -> str:
    y, mo, d, hh, mm, ss = groups[0], groups[1], groups[2], \
        groups[3], groups[4], groups[5] or "00"
    return (f"{y}-{str(mo).zfill(2)}-{str(d).zfill(2)}"
            f"T{hh}:{mm}:{ss}")


def date_epoch(iso: str | None) -> float | None:
    """ISO string -> unix epoch (float), or None when missing/invalid."""
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def extract_object_tokens(text: str) -> list[str]:
    """Normalized (lowercase, no-space) candidate tokens from a file name or
    OBJECT header: 'M31' -> 'm31', 'NGC 7000' -> 'ngc7000', 'Andromeda' ->
    'andromeda'."""
    t = str(text or "").lower()
    out: list[str] = []
    for m in _DESIG_RE.finditer(t):
        tok = re.sub(r"\s+", "", m.group(1) + m.group(2))
        if tok not in out:
            out.append(tok)
    for m in _WORD_RE.finditer(t):
        tok = m.group(0)
        if tok in _STOPWORDS or tok in out:
            continue
        out.append(tok)
    # multi-word common names: join up to 3 consecutive words
    words = [w for w in out if re.fullmatch(r"[a-z]{4,}", w)]
    for span in (2, 3):
        for i in range(len(words) - span + 1):
            joined = "".join(words[i:i + span])
            if joined not in out:
                out.append(joined)
    return out