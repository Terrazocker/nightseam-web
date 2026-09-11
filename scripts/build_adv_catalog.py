"""Generate app/data/openned.csv from the OpenNGC database (one-time dev task).

Source: https://github.com/mattiaverga/OpenNGC (CC BY-SA 4.0) - the complete
NGC/IC deep-sky catalog. Converts OpenNGC rows to NightSeam's catalog schema
and skips entries that duplicate the curated 197-object catalog.

Run: python scripts/build_adv_catalog.py [path/to/NGC.csv]
"""

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# NGC.csv is not bundled (CC BY-SA download, ~2.8 MB): fetch it from
# https://github.com/mattiaverga/OpenNGC and pass the path - or drop it at
# data/NGC.csv (gitignored) and run the script with no argument.
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "NGC.csv"
OUT = ROOT / "app" / "data" / "openned.csv"

sys.path.insert(0, str(ROOT))
from app.catalog_data import rows as curated_rows
from app.fits import parse_ra_hours, parse_dec_deg


def _load_source() -> list[dict]:
    """Read the OpenNGC CSV (checked at call time, not import time, so the
    pure helpers below stay importable in tests without the source present)."""
    if not SRC.is_file():
        raise SystemExit(
            f"OpenNGC source not found: {SRC}\n"
            f"  download NGC.csv from https://github.com/mattiaverga/OpenNGC\n"
            f"  and pass it as the first argument (or place it at data/NGC.csv)")
    with open(SRC, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter=";"))

TYPE_MAP = {
    "G": "galaxy", "GPair": "galaxy", "GTrpl": "galaxy", "GGroup": "galaxy",
    "GCl": "globular", "OCl": "open_cluster", "Cl+N": "open_cluster",
    "PN": "planetary", "SNR": "supernova_remnant",
    "Neb": "nebula", "HII": "nebula", "EmN": "nebula", "RfN": "nebula",
    "*Ass": "asterism",
}
SKIP_TYPES = {"Dup", "*", "**", "Other", "NonEx", "Nova"}


def fmt_desig(name: str) -> str:
    """'NGC0224' -> 'NGC 224', 'IC0001' -> 'IC 1'."""
    m = re.match(r"^([A-Z]+)(\d+)$", name)
    return f"{m.group(1)} {int(m.group(2))}" if m else name


def _desig_keys(text: str) -> set[str]:
    """Normalized id keys covered by a curated designation.

    Handles a single designation ('NGC 224' -> ngc224), slash pairs
    ('NGC 650/651' -> ngc650, ngc651) and numeric ranges
    ('NGC 2237-2246' -> ngc2237 .. ngc2246). Expanding the range to EVERY
    member number is essential: the old code only took the first '/' segment,
    so a range like 'NGC 7317-7320' never matched the advanced member row
    'ngc7317' and that collision leaked into the shipped catalog (two rows
    sharing one id)."""
    keys: set[str] = set()
    m = re.match(r"^([A-Za-z]+)\s*(.*)$", (text or "").strip())
    if not m:
        return keys
    base_prefix = m.group(1).lower()
    for part in re.split(r"[/,]", m.group(2)):
        part = part.strip()
        if not part:
            continue
        mm = re.match(r"^(\d+)\s*(?:-\s*(\d+))?$", part)
        if mm:                                   # '650/651' carries the prefix
            prefix, start = base_prefix, int(mm.group(1))
            end = int(mm.group(2)) if mm.group(2) else start
        else:                                    # a full designation, e.g. 'M31'
            full = re.match(r"^([A-Za-z]+)\s*(\d+)\s*(?:-\s*(\d+))?$", part)
            if not full:
                continue
            prefix, start = full.group(1).lower(), int(full.group(2))
            end = int(full.group(3)) if full.group(3) else start
        if end < start or end - start > 5000:    # refuse broken/absurd ranges
            end = start
        for n in range(start, end + 1):
            keys.add(f"{prefix}{n}")
    return keys


def _assert_global_unique(advanced: list[dict]) -> None:
    """Fail loudly if the resulting catalog has duplicate ids.

    Uniqueness must hold across curated + advanced TOGETHER, not merely within
    each source: a `build_web.py catalog` / desktop UNION that repeats an id
    makes the web `byId` map and `db.get_object()` disagree about which object
    an id names. Raise instead of shipping that."""
    from collections import Counter
    ids = [r["id"] for r in curated_rows()] + [r["id"] for r in advanced]
    dupes = sorted(k for k, v in Counter(ids).items() if v > 1)
    if dupes:
        raise SystemExit(
            f"catalog id collision across curated+advanced: {dupes}\n"
            f"  expand the curated designation in _desig_keys() or skip the "
            f"advanced duplicate - do not ship two rows with one id")


def build_rows():
    raw = _load_source()

    # every designation (incl. every number inside a curated range) that the
    # curated catalog already covers, so advanced members do not duplicate it
    curated_keys = set()
    for r in curated_rows():
        curated_keys |= _desig_keys(r["messier"] or "")
        curated_keys |= _desig_keys(r["ngcic"] or "")

    out = []
    seen = set()
    for r in raw:
        if r["Type"] in SKIP_TYPES or not r["Name"]:
            continue
        ngcic = fmt_desig(r["Name"])
        key = re.sub(r"\s+", "", ngcic.lower())
        if key in curated_keys or key in seen:
            continue
        seen.add(key)

        oid = key
        messier = f"M{int(r['M'])}" if r["M"].strip() else ""
        common = (r["Common names"] or "").strip()
        primary = common.split("|")[0].strip() or ngcic
        otype = TYPE_MAP.get(r["Type"], "galaxy")
        ra_h = parse_ra_hours(r["RA"])
        dec_d = parse_dec_deg(r["Dec"])
        if ra_h is None or dec_d is None:
            continue
        vmag = (r["V-Mag"] or r["B-Mag"] or "").strip()
        vmag = round(float(vmag), 1) if vmag else None
        maj, mnr = (r["MajAx"] or "").strip(), (r["MinAx"] or "").strip()
        if maj:
            size = f"{float(maj):g}"
            if mnr:
                size += f"x{float(mnr):g}"
        else:
            size = ""
        const = (r["Const"] or "").strip()
        ids = (r["Identifiers"] or "").strip()[:140]
        search = " | ".join(x for x in (
            oid, ngcic, (common or "").lower(), (messier or "").lower(),
            ids.lower()) if x)
        out.append({
            "id": oid, "primary_name": primary[:120], "messier": messier,
            "ngcic": ngcic, "other": ids, "otype": otype,
            "ra_hours": round(ra_h, 5), "dec_deg": round(dec_d, 5),
            "vmag": vmag, "size_am": size, "constellation": const,
            "distance": "", "wiki": "", "blurb": "", "search": search,
        })
    return out


def main():
    rows = build_rows()
    _assert_global_unique(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        f.write("# NightSeam advanced catalog - derived from OpenNGC "
                "(https://github.com/mattiaverga/OpenNGC, CC BY-SA 4.0)\n")
        f.write("# Columns: id;primary_name;messier;ngcic;other;otype;"
                "ra_hours;dec_deg;vmag;size_am;constellation;distance;"
                "wiki;blurb;search\n")
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        for r in rows:
            w.writerow([r["id"], r["primary_name"], r["messier"], r["ngcic"],
                        r["other"], r["otype"], r["ra_hours"], r["dec_deg"],
                        r["vmag"], r["size_am"], r["constellation"],
                        r["distance"], r["wiki"], r["blurb"], r["search"]])
    types = {}
    for r in rows:
        types[r["otype"]] = types.get(r["otype"], 0) + 1
    print(f"wrote {OUT} with {len(rows)} objects")
    print("types:", types)
    print("with vmag:", sum(1 for r in rows if r["vmag"]),
          "| faintest:", max((r["vmag"] for r in rows if r["vmag"]), default="-"))


if __name__ == "__main__":
    main()