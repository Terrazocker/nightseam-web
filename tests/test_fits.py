"""Tests for the pure-python FITS header reader and value parsers."""

import struct

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


def make_fits_with_data(records, data: bytes) -> bytes:
    block = bytearray()
    for k, v in records:
        block += f"{k:<8}= {v}".encode("latin-1").ljust(80)[:80]
    block += b"END".ljust(80)
    block += b" " * (-len(block) % _BLOCK)
    return bytes(block) + data


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
    assert fits.parse_ra_hours("5,575") == 5.575   # comma decimal (locale)
    assert fits.parse_ra_hours("05:34:31.9") == 5 + 34 / 60 + 31.9 / 3600
    assert fits.parse_ra_hours(None) is None
    assert fits.parse_ra_hours("not a ra") is None


def test_parse_dec_deg():
    assert fits.parse_dec_deg("+41 16 09") == 41 + 16 / 60 + 9 / 3600
    assert fits.parse_dec_deg("-27.958") == -27.958
    assert fits.parse_dec_deg("-27,958") == -27.958   # comma decimal (locale)
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


# ---------------------------------------------------------------- previews

def test_header_size_and_geometry():
    hdr = make_fits([("SIMPLE", "T"), ("BITPIX", "16"), ("NAXIS", "2"),
                     ("NAXIS1", "4"), ("NAXIS2", "4")])
    assert fits.header_size(hdr) == _BLOCK
    geo = fits.image_geometry(fits.read_fits_header(hdr))
    assert geo == {"bitpix": 16, "naxis1": 4, "naxis2": 4, "bps": 2}
    assert fits.image_geometry({}) is None
    assert fits.image_geometry({"NAXIS": 1, "NAXIS1": 100}) is None
    assert fits.image_geometry({"NAXIS": 2, "NAXIS1": 0, "NAXIS2": 0}) is None


def test_preview_png_16bit():
    data = struct.pack(">16h", 100, 200, 300, 400, 500, 600, 700, 800,
                       900, 1000, 1100, 1200, 1300, 1400, 1500, 1600)
    fits_bytes = make_fits_with_data([
        ("SIMPLE", "T"), ("BITPIX", "16"), ("NAXIS", "2"),
        ("NAXIS1", "4"), ("NAXIS2", "4")], data)
    png = fits.preview_png(fits_bytes)
    assert png and png.startswith(b"\x89PNG\r\n\x1a\n")
    # IHDR: signature(8) + len(4) + "IHDR" -> width/height at offset 16
    assert struct.unpack(">II", png[16:24]) == (4, 4)


def test_preview_png_float():
    vals = struct.pack(">9f", 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0)
    fits_bytes = make_fits_with_data([
        ("SIMPLE", "T"), ("BITPIX", "-32"), ("NAXIS", "2"),
        ("NAXIS1", "3"), ("NAXIS2", "3")], vals)
    png = fits.preview_png(fits_bytes)
    assert png and png.startswith(b"\x89PNG\r\n\x1a\n")
    assert struct.unpack(">II", png[16:24]) == (3, 3)


def test_preview_png_rejects_non_image():
    assert fits.preview_png(b"GIF89a not a fits file") is None
    hdr_only = make_fits([("SIMPLE", "T"), ("NAXIS", "0")])
    assert fits.preview_png(hdr_only) is None


def test_preview_png_8bit_unsigned():
    # FITS 8-bit pixels are UNSIGNED (128..255 must not flip negative)
    fits_bytes = make_fits_with_data([
        ("SIMPLE", "T"), ("BITPIX", "8"), ("NAXIS", "2"),
        ("NAXIS1", "2"), ("NAXIS2", "2")],
        bytes([0, 128, 255, 10]))
    png = fits.preview_png(fits_bytes)
    assert png and png.startswith(b"\x89PNG\r\n\x1a\n")
    assert struct.unpack(">II", png[16:24]) == (2, 2)


def test_preview_png_downsamples():
    vals = struct.pack(">400h", *range(400))
    fits_bytes = make_fits_with_data([
        ("SIMPLE", "T"), ("BITPIX", "16"), ("NAXIS", "2"),
        ("NAXIS1", "20"), ("NAXIS2", "20")], vals)
    png = fits.preview_png(fits_bytes, max_px=10)
    assert struct.unpack(">II", png[16:24]) == (10, 10)
    # stopwords / junk are not emitted as name candidates
    for bad in ("light", "300s", "fits", "dark", "frame"):
        assert bad not in fits.extract_object_tokens(f"{bad}_M31.fit")