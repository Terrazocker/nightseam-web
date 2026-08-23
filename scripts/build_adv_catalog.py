"""Generate app/data/openned.csv from the OpenNGC database (one-time dev task).

Source: https://github.com/mattiaverga/OpenNGC (CC BY-SA 4.0) - the complete
NGC/IC deep-sky catalog. Converts OpenNGC rows to AstroPilot's catalog schema
and skips entries that duplicate the curated 197-object catalog.

Run: python scripts/build_adv_catalog.py
"""

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1] if len(sys.argv) > 1
           else r"C:\Users\<user>\AppData\Local\Temp\opencode\NGC.csv")
OUT = ROOT / "app" / "data" / "openned.csv"

sys.path.insert(0, str(ROOT))
from app.catalog_data import rows as curated_rows
from app.fits import parse_ra_hours, parse_dec_deg

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


def build_rows():
    with open(SRC, encoding="utf-8") as f:
        raw = list(csv.DictReader(f, delimiter=";"))

    # curated designations to avoid duplicates in advanced mode
    curated_keys = set()
    for r in curated_rows():
        for k in (r["messier"], r["ngcic"]):
            if k:
                curated_keys.add(re.sub(r"\s+", "", k.lower()))
            if r["ngcic"]:
                curated_keys.add(re.sub(r"\s+", "", r["ngcic"].split("/")[0].lower()))

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
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        f.write("# AstroPilot advanced catalog - derived from OpenNGC "
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