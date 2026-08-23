"""Tests for the pure-python FITS header reader and value parsers."""

from app import fits

_BLOCK = 2880


def make_fits(records, end=True) -> bytes:
    block = bytearray()
    for k, v in records:
        block += f"{k:<8}= {v}".encode("latin-1").ljust(80)[:80]
    if end:
        block += b"END".ljust(80)
    block += b" " * (-len(block) % _BLOCK)
    return bytes(block)


def test_reads_basic_keywords():
    data = make_fits([
        ("SIMPLE", "T"),
        ("OBJECT", "'M 31                     ' / Andromeda"),
        ("EXPTIME", "300.0"),
        ("DATE-OBS", "'2026-08-22T23:14:05'"),
        ("FILTER", "'L'"),
        ("TELESCOP", "'Seestar S50'"),
        ("NAXIS", "2"),
        ("RA", "0.712"),
    ])
    hdr = fits.read_fits_header(data)
    assert hdr["SIMPLE"] is True
    assert hdr["OBJECT"] == "M 31"
    assert hdr["EXPTIME"] == 300.0
    assert hdr["DATE-OBS"] == "2026-08-22T23:14:05"
    assert hdr["FILTER"] == "L"
    assert hdr["TELESCOP"] == "Seestar S50"
    assert hdr["NAXIS"] == 2
    assert hdr["RA"] == 0.712


def test_escaped_quotes_in_strings():
    data = make_fits([("SIMPLE", "T"), ("OBJECT", "'O''Connell 1'")])
    assert fits.read_fits_header(data)["OBJECT"] == "O'Connell 1"


def test_multiblock_header():
    records = [("SIMPLE", "T")] + [(f"KEY{i}", f"{i}.5") for i in range(40)]
    hdr = fits.read_fits_header(make_fits(records))
    assert hdr["KEY39"] == 39.5


def test_not_fits_returns_empty():
    assert fits.read_fits_header(b"GIF89a not a fits file at all") == {}


def test_header_without_end_still_parses():
    data = make_fits([("SIMPLE", "T"), ("OBJECT", "'M 42'")], end=False)
    assert fits.read_fits_header(data)["OBJECT"] == "M 42"


# ---------------------------------------------------------------- parsers

def test_parse_ra_hours():
    assert fits.parse_ra_hours("00 42 44.3") == 42 / 60 + 44.3 / 3600
    assert fits.parse_ra_hours("5.575") == 5.575
    assert fits.parse_ra_hours("05:34:31.9") == 5 + 34 / 60 + 31.9 / 3600
    assert fits.parse_ra_hours(None) is None
    assert fits.parse_ra_hours("not a ra") is None


def test_parse_dec_deg():
    assert fits.parse_dec_deg("+41 16 09") == 41 + 16 / 60 + 9 / 3600
    assert fits.parse_dec_deg("-27.958") == -27.958
    assert fits.parse_dec_deg("+22 01") == 22 + 1 / 60
    assert fits.parse_dec_deg(None) is None


def test_parse_date_obs():
    assert fits.parse_date_obs("2026-08-22T23:14:05.123") == \
        "2026-08-22T23:14:05"
    assert fits.parse_date_obs("2026-08-22 23:14:05") == \
        "2026-08-22T23:14:05"
    assert fits.parse_date_obs("23/08/2026 22:00:00") == \
        "2026-08-23T22:00:00"          # day > 12 -> DD/MM/YYYY
    assert fits.parse_date_obs("08/22/2026 22:00:00") == \
        "2026-08-22T22:00:00"          # otherwise MM/DD/YYYY
    assert fits.parse_date_obs("nonsense") is None
    assert fits.parse_date_obs(None) is None


def test_date_epoch():
    assert fits.date_epoch("2026-08-22T23:14:05") is not None
    assert fits.date_epoch(None) is None
    assert fits.date_epoch("garbage") is None


# ---------------------------------------------------------------- tokens

def test_extract_object_tokens():
    assert "m31" in fits.extract_object_tokens("M31_300s_L_001.fit")
    assert "ngc7000" in fits.extract_object_tokens("NGC7000_Light_120s.fit")
    assert "ngc7000" in fits.extract_object_tokens("NGC 7000_Ha_120s.fit")
    assert "sh2-244" in fits.extract_object_tokens("SH2-244_60s.fit")
    assert "andromeda" in fits.extract_object_tokens("Andromeda_180s.fit")
    assert "crabnebula" in fits.extract_object_tokens("Crab Nebula_300s.fit")
    # stopwords / junk are not emitted as name candidates
    for bad in ("light", "300s", "fits", "dark", "frame"):
        assert bad not in fits.extract_object_tokens(f"{bad}_M31.fit")