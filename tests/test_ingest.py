"""Direct unit tests for the ingest helpers (app/ingest.py)."""

import asyncio
import time

import pytest

from app import ingest
from app.database import Database
from app.fits import date_epoch
from app.ingest import (_session_dir, classify_frame, obj_slug,
                        session_folder_name)
from _util import make_fits


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


def test_images_for_object_returns_only_matching_rows_in_id_order(tmp_path):
    db = Database(tmp_path / "session-queries.sqlite3")
    try:
        rows = [
            ("a.fit", "Known", "known"),
            ("b.fit", "Mystery", "other"),
            ("c.fit", "Mystery", None),
            ("d.fit", "Known", "known"),
        ]
        for filename, name, oid in rows:
            db.conn.execute(
                "INSERT INTO images(file,orig_name,object_id,object_name,"
                "ingested_at) VALUES(?,?,?,?,?)",
                (filename, filename, oid, name, "2026-08-22T00:00:00"))
        db.conn.commit()

        assert [r["file"] for r in db.images_for_object("known", "Known")] == [
            "a.fit", "d.fit"]
        # The unresolved-name branch retains the original exact-name filter;
        # it includes rows even if they carry an object_id.
        assert [r["file"] for r in db.images_for_object(None, "Mystery")] == [
            "b.fit", "c.fit"]
        assert db.images_for_object(None, "mystery") == []

        id_plan = " ".join(str(r[3]) for r in db.conn.execute(
            "EXPLAIN QUERY PLAN SELECT * FROM images "
            "WHERE object_id=? ORDER BY id", ("known",)))
        name_plan = " ".join(str(r[3]) for r in db.conn.execute(
            "EXPLAIN QUERY PLAN SELECT * FROM images "
            "WHERE object_name=? ORDER BY id", ("Mystery",)))
        assert "idx_images_object_id_id" in id_plan
        assert "idx_images_object_name_id" in name_plan
    finally:
        db.conn.close()


def test_unresolved_session_lookup_joins_exact_name_even_with_existing_id(tmp_path):
    db = Database(tmp_path / "session-name.sqlite3")
    archive = tmp_path / "archive"
    archive.mkdir()
    old_date = "2026-08-22T23:00:00"
    try:
        db.add_image({
            "file": "Mystery/old.fit", "orig_name": "old.fit",
            "object_id": "a-different-resolved-id", "object_name": "Mystery",
            "date_obs": old_date, "ingested_at": "2026-08-22T23:00:00",
        })
        selected = _session_dir(
            db, archive, "Mystery", None, "Mystery", "2026-08-23T01:00:00")
        assert selected.name == session_folder_name(date_epoch(old_date))
    finally:
        db.conn.close()


def test_session_override_skips_database_lookup(tmp_path):
    class NoLookup:
        def images_for_object(self, object_id, object_name):
            raise AssertionError("explicit sessions must bypass auto-lookup")

    archive = tmp_path / "archive"
    assert _session_dir(NoLookup(), archive, "M31", "ngc224", "M31", None,
                        "2026-08-22_2000") == archive / "M31" / "2026-08-22_2000"


def test_stream_to_uses_one_mib_reads_and_preserves_bytes(tmp_path):
    archive = tmp_path / "archive"
    archive.mkdir()
    target = archive / "frame.fit"
    first = b"FITS header bytes"
    payload = bytes(i % 251 for i in range((2 << 20) + 17))

    class Upload:
        def __init__(self, data):
            self.data = data
            self.read_sizes = []

        async def read(self, size):
            self.read_sizes.append(size)
            result, self.data = self.data[:size], self.data[size:]
            return result

    upload = Upload(payload)
    stored = asyncio.run(ingest._stream_to(archive, target, upload, first))
    assert stored == "frame.fit"
    assert upload.read_sizes == [1 << 20] * 4
    assert target.read_bytes() == first + payload


def test_ingest_read_failure_after_chunk_removes_partial_file(tmp_path):
    db = Database(tmp_path / "partial-ingest.sqlite3")
    archive = tmp_path / "archive"
    archive.mkdir()
    header = make_fits([("SIMPLE", "T"), ("OBJECT", "'M31'")])

    class FailingUpload:
        filename = "partial.fit"
        size = None

        def __init__(self):
            self.read_sizes = []
            self.body_reads = 0

        async def read(self, size):
            self.read_sizes.append(size)
            if len(self.read_sizes) == 1:
                return header
            self.body_reads += 1
            if self.body_reads == 1:
                return bytes(1 << 20)
            raise RuntimeError("injected upload read failure")

    upload = FailingUpload()
    try:
        with pytest.raises(RuntimeError, match="injected upload read failure"):
            asyncio.run(ingest.ingest_one(db, [], archive, upload))
        assert upload.read_sizes == [ingest.HEADER_READ, 1 << 20, 1 << 20]
        assert list(archive.rglob("partial.fit")) == []
        assert db.images() == []
    finally:
        db.conn.close()
