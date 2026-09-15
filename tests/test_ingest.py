"""Direct unit tests for the ingest helpers (app/ingest.py)."""

import time

from app.ingest import classify_frame, obj_slug, session_folder_name


# ---------------------------------------------------------------- obj_slug

def test_obj_slug_keeps_safe_chars():
    assert obj_slug("M 31") == "M 31"
    assert obj_slug("NGC 7000/North America") == "NGC 7000North America"
    assert obj_slug("M42!?") == "M42"


def test_obj_slug_empty_falls_back():
    assert obj_slug("") == "misc"
    assert obj_slug("///") == "misc"
    assert obj_slug("   ") == "misc"


# ---------------------------------------------------------------- classify_frame

def test_classify_frame_single_words():
    assert classify_frame("Light") == "light"
    assert classify_frame("dark") == "dark"
    assert classify_frame("FLAT") == "flat"
    assert classify_frame("bias") == "bias"


def test_classify_frame_multi_word_spellings():
    # MaxIm DL / CCDSoft / SBIG write these; they used to land in lights/
    assert classify_frame("Dark Frame") == "dark"
    assert classify_frame("Flat Field") == "flat"
    assert classify_frame("Bias Frame") == "bias"
    assert classify_frame("Light Frame") == "light"
    assert classify_frame("Sky Flat") == "flat"


def test_classify_frame_unknown_defaults_to_light():
    assert classify_frame(None) == "light"
    assert classify_frame("") == "light"
    assert classify_frame("calibration?") == "light"


def test_classify_frame_master_qualifier():
    """PY-09 (review 0.6.32): the letters are reduced and then matched with
    `startswith`, so `"Master Dark"` became `masterdark`, matched neither `dark`
    nor `flat` and fell through to `light` - stacked master calibration frames
    landed in `<object>/<session>/lights/` and were counted as light frames. The
    docstring claims the multi-word spellings are handled, and `fits._STOPWORDS`
    already knows "master"."""
    assert classify_frame("Master Dark") == "dark"
    assert classify_frame("MasterDark") == "dark"
    assert classify_frame("MASTER DARK FRAME") == "dark"
    assert classify_frame("Master Flat") == "flat"
    assert classify_frame("MasterFlat") == "flat"
    assert classify_frame("Master Bias") == "bias"
    # a master LIGHT is still a light, and the plain spellings are unchanged
    assert classify_frame("Master Light") == "light"
    assert classify_frame("Dark") == "dark"
    assert classify_frame("SkyFlat") == "flat"


# ---------------------------------------------------------------- classify_frame

def test_classify_known_types():
    assert classify_frame("light") == "light"
    assert classify_frame("LIGHT") == "light"
    assert classify_frame("L") == "light"
    assert classify_frame("science") == "light"
    assert classify_frame("bias") == "bias"
    assert classify_frame("ZERO") == "bias"
    assert classify_frame("dark") == "dark"
    assert classify_frame("flat") == "flat"
    assert classify_frame("flatfield") == "flat"
    assert classify_frame("skyflat") == "flat"


def test_classify_unknown_defaults_to_light():
    assert classify_frame("object") == "light"
    assert classify_frame("") == "light"
    assert classify_frame(None) == "light"
    assert classify_frame("calibration?") == "light"


# ---------------------------------------------------------------- session_folder_name

def test_session_folder_formats_local_time():
    # 2026-08-22 23:14 UTC depends on the machine zone, but the shape is fixed
    name = session_folder_name(time.mktime((2026, 8, 22, 23, 14, 0, 0, 0, -1)))
    assert len(name) == 15               # YYYY-MM-DD_HHMM
    assert name[4] == "-" and name[7] == "-" and name[10] == "_"
    assert name[:10].count("-") == 2


def test_session_folder_undated():
    assert session_folder_name(None) == "undated"


def test_session_folder_zero_epoch():
    # epoch 0 = 1970-01-01 00:00 UTC -> local may shift the date, shape stays
    assert len(session_folder_name(0.0)) == 15