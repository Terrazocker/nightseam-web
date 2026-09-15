"""L1 probe: FITS header edge cases (app/fits.py) and frame classification.

Run from the repo root:
    python reviews/0.6.32-full/evidence/python/probe_fits_edges.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from app import fits                                # noqa: E402
from app.ingest import classify_frame, obj_slug, session_folder_name  # noqa: E402


def block(cards: list[str], pad_to_blocks: int = 1) -> bytes:
    """240 cards per 2880-byte block; short cards are space-padded."""
    text = "".join(c.ljust(80)[:80] for c in cards)
    total = 2880 * pad_to_blocks
    return text.encode("latin-1").ljust(total, b" ")[:total]


def card(key: str, value: str) -> str:
    return f"{key:<8}= {value}"


print("== END-prefixed keyword truncates the header ==")
hdr = fits.read_fits_header(block([
    "SIMPLE  =                    T",
    card("OBJECT", "'Target A'"),
    card("ENDTIME", "12345"),                 # not a real FITS card
    card("EXPTIME", "300.0"),
    "END",
]))
print(f"    parsed keys: {sorted(hdr)}")
print(f"    OBJECT={hdr.get('OBJECT')!r} EXPTIME={hdr.get('EXPTIME')!r}")

print("== normal header, 80-byte boundary, blank + non-ASCII cards ==")
hdr = fits.read_fits_header(block([
    "SIMPLE  =                    T",
    card("OBJECT", "'M\u00e5ne'"),            # non-ASCII value (latin-1)
    " " * 80,                                 # blank card
    "'lonely string card'",                   # value-only line
    card("OBJCTRA", "'20 58 00'"),
    card("DATE-OBS", "'2026-08-22T20:00:00'"),
    "END",
]))
print(f"    parsed keys: {sorted(hdr)}")
print(f"    OBJECT={hdr.get('OBJECT')!r} OBJCTRA={hdr.get('OBJCTRA')!r}")
print(f"    parse_ra_hours(OBJCTRA)={fits.parse_ra_hours(hdr.get('OBJCTRA'))}")
print(f"    parse_date_obs(DATE-OBS)={fits.parse_date_obs(hdr.get('DATE-OBS'))}")

print("== truncated header (no END, short file) ==")
raw = ("SIMPLE  =                    T" + card("OBJECT", "'Trunc'")).encode()
print(f"    read_fits_header -> {fits.read_fits_header(raw)}")
print(f"    header_size(raw)  -> {fits.header_size(raw)}")

print("== SIMPLE not at byte 0 ==")
print(f"    {fits.read_fits_header(b'X' + block(['SIMPLE  =                    T', 'END']))}")

print("== missing DATE-OBS / unparseable ==")
for value in (None, "", "2026-08-22", "22/08/2026 20:00", "20260822",
              "2026-08-22T20:00:00.123", "2026-13-45T99:99:99"):
    print(f"    parse_date_obs({value!r}) -> {fits.parse_date_obs(value)!r}"
          f"  date_epoch -> {fits.date_epoch(fits.parse_date_obs(value))!r}")

print("== numeric card values ==")
for raw_card in (card("EXPTIME", "300.0"), card("EXPTIME", "1e400"),
                 card("EXPTIME", "nan"), card("EXPTIME", "Infinity"),
                 card("EXPTIME", "-5 / comment"), card("BITPIX", "-32"),
                 card("NAXIS1", "0")):
    print(f"    {raw_card.strip()!r:<28} -> "
          f"{fits.read_fits_header(block(['SIMPLE  =                    T', raw_card, 'END'])).get(raw_card.split('=')[0].strip())!r}")

print("== coordinate parsers ==")
for value in ("20 58 00", "20h58m00s", "20:58:00", "20,5", "inf", "nan",
              "1e400", "", "abc", "5 34 30.5"):
    print(f"    parse_ra_hours({value!r}) -> {fits.parse_ra_hours(value)!r}"
          f"   parse_dec_deg({value!r}) -> {fits.parse_dec_deg(value)!r}")

print("== IMAGETYP classification fallback ==")
for value in (None, "", "Light Frame", "LIGHT", "Science", "Dark Frame",
              "Zero", "Flat Field", "SkyFlat", "BIAS", "dark", "FLAT",
              "unknown", 7, {}, "Master Dark"):
    print(f"    classify_frame({value!r}) -> {classify_frame(value)!r}")

print("== session folder naming ==")
print(f"    session_folder_name(None) -> {session_folder_name(None)!r}")

print("== obj_slug on hostile names ==")
for name in ("M31", "..\\..\\evil", "/etc/passwd", "NUL", "...", "   ",
             "CON", "a" * 200, "NGC 7000 / LDN 935", "x."):
    print(f"    obj_slug({name!r}) -> {obj_slug(name)!r}")
