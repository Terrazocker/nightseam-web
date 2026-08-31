"""Tests for the example-image chain (app/images.py) - network fully stubbed.

These exercise the caching, negative-cache and offline-circuit-breaker logic
without ever touching the network: the source resolvers and the downloader
are monkeypatched, and CACHE_DIR points at a tmp dir.
"""

import json
import time

import pytest

import app.images as img

OBJ = {"id": "m31", "wiki": "Andromeda Galaxy", "messier": "M 31",
       "ngcic": "NGC 224", "ra_hours": 0.712, "dec_deg": 41.269,
       "size_am": "190x60"}
JPEG = (b"\xff\xd8" + b"x" * 598)          # 600 bytes, "image/jpeg"
SVG = b"<svg/>"                             # rejected: too small / svg


@pytest.fixture()
def nw(tmp_path, monkeypatch):
    """Stubbed network layer + isolated cache dir; returns call counters."""
    monkeypatch.setattr("app.images.CACHE_DIR", tmp_path / "imgcache")
    # isolate the offline circuit-breaker globals per test (monkeypatch
    # restores the imported values on teardown, so no state leaks between
    # tests even if a test trips the failure counters)
    monkeypatch.setattr("app.images._consec_fail", 0)
    monkeypatch.setattr("app.images._offline_until", 0.0)
    calls = {"download": 0, "wikidata": 0, "wikipedia": 0, "dss": 0}

    def stub_download(url, timeout=10.0):
        calls["download"] += 1
        return JPEG, "image/jpeg"

    monkeypatch.setattr("app.images._download", stub_download)
    monkeypatch.setattr("app.images._wikidata_thumb",
                        lambda title: (calls.__setitem__("wikidata", calls["wikidata"] + 1) or "https://example.invalid/w.jpg"))
    monkeypatch.setattr("app.images._wikipedia_thumb",
                        lambda title: (calls.__setitem__("wikipedia", calls["wikipedia"] + 1) or None))
    monkeypatch.setattr("app.images._dss_cutout",
                        lambda ra, dec, size, pixels=512: None)
    return calls


def test_fetch_cached_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("app.images.CACHE_DIR", tmp_path / "imgcache")
    assert img.fetch_image_cached(OBJ) == (None, None)


def test_fetch_image_wikidata_hit_and_cache(nw):
    blob, ctype = img.fetch_image(OBJ)
    assert blob == JPEG
    assert ctype == "image/jpeg"
    assert nw["wikidata"] == 1            # only the first (best) title tried
    assert nw["download"] == 1

    # second call: served from the on-disk cache, no network at all
    blob2, ctype2 = img.fetch_image(OBJ)
    assert blob2 == JPEG and ctype2 == "image/jpeg"
    assert nw["download"] == 1


def test_fetch_image_negative_cache(nw, monkeypatch):
    # no source resolves -> negative marker written; TTL suppresses retries
    monkeypatch.setattr("app.images._wikidata_thumb", lambda title: None)
    blob, ctype = img.fetch_image(OBJ)
    assert blob is None and ctype is None
    assert nw["download"] == 0

    blob2, _ = img.fetch_image(OBJ)
    assert blob2 is None
    assert nw["download"] == 0             # still no network attempt


def test_fetch_image_ignore_negative_retries(nw, monkeypatch):
    def no_thumb(title):
        nw["wikidata"] += 1
        return None

    monkeypatch.setattr("app.images._wikidata_thumb", no_thumb)
    img.fetch_image(OBJ)                    # writes negative marker
    # ignore_negative=True forces a re-attempt despite the marker
    blob, _ = img.fetch_image(OBJ, ignore_negative=True)
    assert blob is None
    # 2 title candidates ("Andromeda Galaxy", "NGC 224") x 2 attempts
    assert nw["wikidata"] == 4


def test_fetch_image_rejects_small_and_svg(nw, monkeypatch):
    # all three wikidata title candidates yield SVG (rejected); Wikipedia
    # and DSS return nothing -> negative cache; one download per title
    def svg_download(url, timeout=10.0):
        nw["download"] += 1
        return SVG, "image/svg+xml"

    monkeypatch.setattr("app.images._download", svg_download)
    blob, ctype = img.fetch_image(OBJ)
    assert blob is None
    # one download per title candidate: wiki "Andromeda Galaxy" + "NGC 224"
    assert nw["download"] == 2


def test_fetch_image_offline_breaker(nw, monkeypatch):
    monkeypatch.setattr("app.images._offline_until", time.time() + 300)
    blob, ctype = img.fetch_image(OBJ)
    assert blob is None and ctype is None
    assert nw["download"] == 0 and nw["wikidata"] == 0


def test_fetch_image_dss_fallback(nw, monkeypatch):
    """Wikidata and Wikipedia find nothing -> the DSS2 survey cutout is
    used and cached like any other source."""
    monkeypatch.setattr("app.images._wikidata_thumb", lambda title: None)
    monkeypatch.setattr("app.images._wikipedia_thumb", lambda title: None)

    def dss_cutout(ra, dec, size, pixels=512):
        nw["dss"] += 1
        return "https://alasky.cds.unistra.fr/hips-image-services/hips2fits?x=1"

    monkeypatch.setattr("app.images._dss_cutout", dss_cutout)
    blob, ctype = img.fetch_image(OBJ)
    assert blob == JPEG
    assert ctype == "image/jpeg"
    assert nw["dss"] == 1                   # first (512px) attempt succeeded
    assert nw["download"] == 1

    # cached now - no second DSS call or download
    blob2, _ = img.fetch_image(OBJ)
    assert blob2 == JPEG
    assert nw["dss"] == 1 and nw["download"] == 1


def test_fetch_image_temporary_failure_not_cached(nw, monkeypatch):
    # transient errors must NOT write a negative marker (retried next time)
    monkeypatch.setattr("app.images._wikidata_thumb",
                        lambda title: "https://example.invalid/w.jpg")

    def flaky_download(url, timeout=10.0):
        nw["download"] += 1
        raise img.Temporary("503")

    monkeypatch.setattr("app.images._download", flaky_download)
    blob, ctype = img.fetch_image(OBJ)
    assert blob is None and ctype is None
    # no negative marker yet: a later call re-attempts
    assert not list(img.CACHE_DIR.glob("*.json")) or all(
        "none" not in json.loads(p.read_text())
        for p in img.CACHE_DIR.glob("*.json"))


def test_slug_and_fields_sanitized():
    assert img._slug("M 31", "Andromeda", "M 31") == "m-31-andromeda-m-31"
    assert img._full_messier("m31") == "Messier 31"
    assert img._full_messier("NGC 224") is None
    assert img._first_ngc("NGC 224/205") == "NGC 224"
    assert img._parse_size("12.5x8") == 12.5