"""Fetch object example images with on-disk caching.

Resolution chain per object:
  1. local cache hit
  2. Wikidata P18 image via structured search ("Messier 29" -> Q18823 -> commons file)
  3. Wikipedia REST summary thumbnails for exact titles
  4. DSS2 colour survey cutout at the object's coordinates (hips2fits service)
  5. negative cache (3 days) -> caller renders a placeholder instead

The chain deliberately avoids free-text search: querying plain "M29" used to
return unrelated pages (actors, weapons, routes).
"""

from __future__ import annotations

import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

from .paths import data_dir

CACHE_DIR = data_dir() / "imgcache"
UA = {"User-Agent": "AstroPilot/1.0 (amateur astronomy planner)"}
NEG_TTL = 24 * 3600          # negative cache: 1 day
NEG_VERSION = 2              # bump to invalidate failure markers from older logic
CACHE_VERSION = 2            # bump to invalidate stored IMAGES (e.g. wrongly
                             # resolved ones cached by earlier resolver logic)

# ---- offline handling -------------------------------------------------------
# After repeated network failures we stop trying for a while so an offline
# machine does not sit through timeout after timeout.
_offline_until = 0.0
_consec_fail = 0


def is_offline() -> bool:
    return time.time() < _offline_until


def _note_success():
    global _consec_fail
    _consec_fail = 0


def _note_failure():
    global _consec_fail, _offline_until
    _consec_fail += 1
    if _consec_fail >= 4:
        _offline_until = time.time() + 120     # pause all lookups for 2 min

# the CDS survey server ships an incomplete cert chain on some systems;
# allow it without verification (public GET-only astronomy data service)
_INSECURE_CTX = ssl._create_unverified_context()


def _context_for(url: str):
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    return _INSECURE_CTX if "cds.unistra" in host else None


class Temporary(Exception):
    """Rate limits / server hiccups / network issues -> must NOT be cached."""


# errors that are environmental and worth a retry
TEMP_EXC = (Temporary, urllib.error.URLError, TimeoutError, OSError)


def _http_json(url: str, timeout: float = 6.0):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        if e.code in (403, 429, 500, 502, 503):
            raise Temporary(str(e.code)) from None
        raise


def _http_bytes(url: str, timeout: float = 10.0):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout,
                                    context=_context_for(url)) as r:
            ctype = r.headers.get("Content-Type", "image/jpeg")
            return r.read(), ctype.split(";")[0]
    except urllib.error.HTTPError as e:
        if e.code in (403, 429, 500, 502, 503):
            raise Temporary(str(e.code)) from None
        raise


def _download(url: str, timeout: float = 10.0):
    """Download with one retry after a short pause on transient errors."""
    try:
        return _http_bytes(url, timeout=timeout)
    except TEMP_EXC:
        time.sleep(1.5)
        return _http_bytes(url, timeout=timeout)


def _slug(*parts) -> str:
    s = "-".join(p for p in parts if p).lower()
    return re.sub(r"[^a-z0-9]+", "-", s)[:60] or "x"


# ------------------------------------------------------------------ sources

def _wikidata_thumb(title: str):
    """Image (P18) of the Wikidata entity best matching `title`."""
    try:
        s = _http_json("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
            "action": "wbsearchentities", "search": title, "language": "en",
            "format": "json", "limit": 1, "type": "item"}))
        hits = s.get("search") or []
        if not hits:
            return None
        qid = hits[0]["id"]
        c = _http_json("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
            "action": "wbgetclaims", "entity": qid, "property": "P18",
            "format": "json"}))
        claims = (c.get("claims") or {}).get("P18") or []
        if not claims:
            return None
        val = claims[0]["mainsnak"].get("datavalue", {}).get("value")
        if isinstance(val, dict):            # newer datatypes wrap the name
            val = val.get("time") or val.get("id") or val.get("text")
        if not val:
            return None
        url = ("https://commons.wikimedia.org/wiki/Special:FilePath/"
               + urllib.parse.quote(str(val)) + "?width=640")
        return url
    except TEMP_EXC:
        raise                                  # transient - let callers retry/flag
    except Exception:
        return None


def _wikipedia_thumb(title: str):
    try:
        data = _http_json(
            "https://en.wikipedia.org/api/rest_v1/page/summary/"
            + urllib.parse.quote(title.replace(" ", "_")))
        thumb = data.get("thumbnail", {}).get("source")
        if thumb and thumb.startswith("http"):
            big = thumb.replace("/330px-", "/500px-")
            return big if "/thumb/" in thumb else thumb
    except Exception:
        pass
    return None


def _dss_cutout(ra_hours: float, dec_deg: float, size_arcmin: float | None,
                pixels: int = 512):
    """Real-sky colour cutout from the DSS2 survey around the object's position."""
    try:
        ra_deg = (ra_hours % 24.0) * 15.0
        fov = 0.35
        if size_arcmin:
            fov = max(0.12, min(1.4, float(size_arcmin) * 2.2 / 60.0))
        url = ("https://alasky.cds.unistra.fr/hips-image-services/hips2fits?"
               + urllib.parse.urlencode({
                   "hips": "CDS/P/DSS2/color",
                   "ra": ra_deg, "dec": dec_deg,
                   "width": pixels, "height": pixels,
                   "projection": "TAN", "fov": round(fov, 3), "format": "jpg"}))
        return url
    except Exception:
        return None


# ------------------------------------------------------------------ helpers

def _full_messier(m: str | None):
    if m and m[:1].upper() == "M" and m[1:].isdigit():
        return f"Messier {int(m[1:])}"
    return None


def _first_ngc(n: str | None):
    return n.split("/")[0].strip() if n else None


def _parse_size(size_str: str | None):
    if not size_str:
        return None
    nums = re.findall(r"\d+\.?\d*", str(size_str))
    return max(float(n) for n in nums) if nums else None


# ------------------------------------------------------------------ main entry

_fetch_lock = __import__("threading").Lock()


def fetch_image_cached(obj: dict):
    """Cache-only lookup for table thumbnails - never touches the network.

    Returns (bytes|None, content_type|None); None means the caller should
    render a placeholder immediately. This keeps a 250-row targets table
    instant instead of queueing a Wikipedia/DSS lookup per row behind the
    prefetch thread's lock."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    slug = _slug(obj["id"], obj.get("wiki") or "", obj.get("messier") or "")
    cache_path = CACHE_DIR / f"{slug}.bin"
    meta_path = CACHE_DIR / f"{slug}.json"
    try:
        meta = json.loads(meta_path.read_text())
    except Exception:
        return None, None
    if meta.get("none") or meta.get("v") != CACHE_VERSION:
        return None, None
    try:
        return cache_path.read_bytes(), meta["ctype"]
    except Exception:
        return None, None


def fetch_image(obj: dict, ignore_negative: bool = False):
    """Return (bytes|None, content_type|None). Cached under data/imgcache.

    Network fetching is serialized so interactive requests and the background
    warm-up never burst the remote APIs simultaneously."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    oid = obj["id"]
    wiki = obj.get("wiki")
    messier = obj.get("messier")
    ngcic = obj.get("ngcic")

    slug = _slug(oid, wiki or "", messier or "")
    cache_path = CACHE_DIR / f"{slug}.bin"
    meta_path = CACHE_DIR / f"{slug}.json"

    def cached():
        if not (cache_path.exists() and meta_path.exists()):
            return None
        try:
            meta = json.loads(meta_path.read_text())
        except Exception:
            return None
        if meta.get("none"):
            if (not ignore_negative and meta.get("v") == NEG_VERSION
                    and time.time() - meta.get("ts", 0) < NEG_TTL):
                return (None, None)        # recent, deliberate failure
            return None                    # stale marker -> retry below
        if meta.get("v") != CACHE_VERSION:
            return None                    # image from older resolver logic -> refetch
        return cache_path.read_bytes(), meta["ctype"]

    hit = cached()
    if hit is not None:
        return hit

    if is_offline():
        return None, None                  # in an outage window - placeholder now

    with _fetch_lock:
        hit = cached()                     # someone may have filled it meanwhile
        if hit is not None:
            return hit

        # structured, unambiguous title candidates (best first)
        titles = []
        if wiki:
            titles.append(wiki)
        fm = _full_messier(messier)
        if fm:
            titles.append(fm)
        fn = _first_ngc(ngcic)
        if fn:
            titles.append(fn)

        blob = ctype = None
        temporary_failure = False

        # 1) Wikidata P18 photos - keyed by unambiguous designations
        for t in titles:
            try:
                url = _wikidata_thumb(t)
                if url:
                    blob, ctype = _download(url)
                    if blob and len(blob) > 500 and ctype and ctype != "image/svg+xml":
                        break
                    blob = ctype = None
            except TEMP_EXC:
                temporary_failure = True
            except Exception:
                pass

        # 2) Wikipedia summary thumbnails for exact page titles
        if blob is None:
            for t in titles:
                try:
                    url = _wikipedia_thumb(t)
                    if url:
                        blob, ctype = _download(url)
                        if blob and len(blob) > 500:
                            break
                        blob = ctype = None
                except TEMP_EXC:
                    temporary_failure = True
                except Exception:
                    pass

        # 3) coordinate-based survey cutout - always the right patch of sky
        if blob is None:
            size_am = _parse_size(obj.get("size_am"))
            for pixels in (512, 384):
                url = _dss_cutout(obj.get("ra_hours", 0.0),
                                  obj.get("dec_deg", 0.0), size_am, pixels)
                if not url:
                    continue
                try:
                    blob, ctype = _download(url, timeout=12.0)
                    if blob and len(blob) > 500 and "image" in (ctype or ""):
                        break
                    blob = ctype = None
                except TEMP_EXC:
                    temporary_failure = True
                except Exception:
                    pass

        if blob is not None:
            cache_path.write_bytes(blob)
            meta_path.write_text(json.dumps({"ctype": ctype, "v": CACHE_VERSION}))
            _note_success()
            return blob, ctype

        # only remember failures that are the object's fault; network hiccups retry
        if not temporary_failure:
            meta_path.write_text(json.dumps({"none": True, "ts": time.time(),
                                             "v": NEG_VERSION}))
        else:
            _note_failure()
        return None, None
