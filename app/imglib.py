"""Image-library logic: resolving captures to catalog objects, grouping
ingested frames per object, and computing imaging sessions.

Sessions: frames of one object whose DATE-OBS timestamps are less than 12 h
apart belong to the same session, so a run that crosses midnight is counted
once, not twice.
"""

from __future__ import annotations

import re
import math

from .fits import date_epoch, extract_object_tokens

SESSION_GAP_H = 12.0
MATCH_RADIUS_DEG = 0.75     # max angular distance for coordinate matching


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", str(s or "").lower())


def normalize_catalog(catalog: list[dict]) -> list[dict]:
    """Map catalog rows to one shape whether they come from the database
    (primary_name / size_am) or catalog_data.rows() (primary / size)."""
    out = []
    for o in catalog:
        out.append({
            "id": o.get("id"),
            "primary_name": o.get("primary_name") or o.get("primary"),
            "messier": o.get("messier"),
            "ngcic": o.get("ngcic"),
            "other": o.get("other"),
            "otype": o.get("otype") or o.get("type"),
            "size_am": o.get("size_am") or o.get("size"),
            "ra_hours": o.get("ra_hours"),
            "dec_deg": o.get("dec_deg"),
            "search": o.get("search"),
        })
    return out


def build_catalog_index(catalog: list[dict]) -> dict:
    """Normalized (lowercase, no-space) designation/name -> object id.

    'M101', 'NGC 5457' and 'Pinwheel' all land on 'm101'; 'ngc7000' matches
    the spaced 'NGC 7000' because spaces are stripped on both sides.
    """
    idx: dict[str, str] = {}
    for o in normalize_catalog(catalog):
        keys = [o["messier"], o["ngcic"], o["other"],
                o["primary_name"], o["search"], o["id"]]
        for k in keys:
            if not k:
                continue
            for token in re.split(r"[|/,]", str(k)):
                tok = _norm(token)
                if len(tok) >= 2:
                    idx.setdefault(tok, o["id"])
    return idx


def resolve_object(catalog: list[dict], name_hint: str | None = None,
                   ra_hours: float | None = None,
                   dec_deg: float | None = None) -> dict | None:
    """Best-effort match of a capture to a catalog row.

    Order: designation/common-name tokens from the hint (OBJECT header or
    file name) -> coordinates in the header -> None. The returned dict uses
    the normalized shape (primary_name / size_am / otype / ...).
    """
    rows = normalize_catalog(catalog)
    if not rows:
        return None
    if name_hint:
        idx = build_catalog_index(rows)
        for token in extract_object_tokens(name_hint):
            oid = idx.get(_norm(token))
            if oid:
                return _by_id(rows, oid)
        # prefix fallback: 'andromeda' -> 'andromedagalaxy' (M31)
        for token in extract_object_tokens(name_hint):
            tok = _norm(token)
            if len(tok) < 3:
                continue
            hits = [k for k in idx if k.startswith(tok)]
            if hits:
                best = max(hits, key=len)
                return _by_id(rows, idx[best])
    if ra_hours is not None and dec_deg is not None:
        best, best_d = None, None
        for o in rows:
            r = o["ra_hours"]
            d = o["dec_deg"]
            if r is None or d is None:
                continue
            dist = angular_dist(ra_hours, dec_deg, r, d)
            if dist <= MATCH_RADIUS_DEG and (best_d is None or dist < best_d):
                best, best_d = o, dist
        if best:
            return best
    return None


def _by_id(catalog: list[dict], oid: str) -> dict | None:
    for o in catalog:
        if o["id"] == oid:
            return o
    return None


def angular_dist(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    """Great-circle distance in degrees."""
    p1, p2 = math.radians(dec1), math.radians(dec2)
    dra = math.radians((ra1 - ra2) * 15.0)
    return math.degrees(math.acos(max(-1.0, min(1.0,
        math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dra)))))


def designation_of(row: dict | None, image: dict) -> str:
    """Display designation: 'M31', else 'NGC 224', else the stored name."""
    if row:
        if row.get("messier"):
            return str(row["messier"])
        if row.get("ngcic"):
            return str(row["ngcic"]).split("/")[0]
        return row.get("primary_name") or ""
    return image.get("object_name") or ""


def compute_sessions(images: list[dict]) -> list[dict]:
    """Group frames into sessions (gap < 12 h merges). Frames without a
    parseable date land in one trailing 'undated' session."""
    dated, undated = [], []
    for im in images:
        ep = date_epoch(im.get("date_obs"))
        (dated if ep is not None else undated).append((ep, im))

    sessions: list[dict] = []
    for ep, im in sorted(dated, key=lambda x: x[0]):
        if sessions and sessions[-1]["_end"] is not None and \
                ep - sessions[-1]["_end"] < SESSION_GAP_H * 3600.0:
            s = sessions[-1]
            s["n_images"] += 1
            s["exposure"] += float(im.get("exposure") or 0.0)
            s["_end"] = ep
            if im.get("date_obs"):
                s["end"] = im["date_obs"]
        else:
            sessions.append({
                "start": im.get("date_obs"),
                "end": im.get("date_obs"),
                "n_images": 1,
                "exposure": float(im.get("exposure") or 0.0),
                "_end": ep,
            })
    if undated:
        sessions.append({
            "start": None, "end": None, "n_images": len(undated),
            "exposure": sum(float(im.get("exposure") or 0.0) for _, im in undated),
            "undated": True,
        })
    for s in sessions:
        s.pop("_end", None)
    return sessions


def group_library(images: list[dict], catalog: list[dict]) -> list[dict]:
    """Group ingested frames per object, with totals and sessions."""
    by_key: dict[str, dict] = {}
    for im in images:
        oid = im.get("object_id")
        key = oid or ("u:" + _norm(im.get("object_name") or "").lower() or "?")
        g = by_key.setdefault(key, {
            "object_id": oid,
            "name": None,
            "designation": "",
            "otype": None,
            "size_am": None,
            "ra_hours": None,
            "dec_deg": None,
            "n_images": 0,
            "total_exposure": 0.0,
            "types": {},              # frame type -> {n, exposure}
            "filters": {},            # filter name -> {n, exposure}
            "first": None,
            "last": None,
            "images": [],
        })
        g["n_images"] += 1
        g["total_exposure"] += float(im.get("exposure") or 0.0)
        fr = im.get("imagetyp") or "light"
        t = g["types"].setdefault(fr, {"n": 0, "exposure": 0.0})
        t["n"] += 1
        t["exposure"] += float(im.get("exposure") or 0.0)
        fl = im.get("filter") or "?"
        f = g["filters"].setdefault(fl, {"n": 0, "exposure": 0.0})
        f["n"] += 1
        f["exposure"] += float(im.get("exposure") or 0.0)
        g["images"].append(im)

    objects = []
    rows = normalize_catalog(catalog)
    for g in by_key.values():
        row = _by_id(rows, g["object_id"]) if g["object_id"] else None
        if row:
            g["name"] = row["primary_name"] or g["object_id"]
            g["designation"] = designation_of(row, g["images"][0])
            g["otype"] = row["otype"]
            g["size_am"] = row["size_am"]
            g["ra_hours"] = row["ra_hours"]
            g["dec_deg"] = row["dec_deg"]
        else:
            first = g["images"][0]
            g["name"] = first.get("object_name") or "Unknown object"
            g["designation"] = ""
            g["otype"] = first.get("otype") or None
            g["size_am"] = None
            # fall back to header coordinates when not in the catalog
            g["ra_hours"] = first.get("ra_hours") or row_coord(g, "ra")
            g["dec_deg"] = first.get("dec_deg") or row_coord(g, "dec")
        g["total_exposure"] = round(g["total_exposure"], 1)
        for t in g["types"].values():
            t["exposure"] = round(t["exposure"], 1)
        for f in g["filters"].values():
            f["exposure"] = round(f["exposure"], 1)
        dates = [i.get("date_obs") for i in g["images"] if i.get("date_obs")]
        if dates:
            g["first"], g["last"] = min(dates), max(dates)
        g["sessions"] = compute_sessions(g["images"])
        g["n_sessions"] = len(g["sessions"])
        objects.append(g)

    objects.sort(key=lambda g: (g["name"] or "").lower())
    return objects


def row_coord(g: dict, kind: str):
    """Coordinates of the first image that actually has one."""
    for i in g.get("images", []):
        v = i.get("ra_hours" if kind == "ra" else "dec_deg")
        if v is not None:
            return v
    return None