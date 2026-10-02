"""Read the committed OpenNGC catalog without a runtime database."""
import csv
from pathlib import Path
from . import standard_ids
from .popularity_data import POPULARITY

CATALOG = Path(__file__).parent / "data" / "openned.csv"

def read_catalog(csv_path: Path) -> list[dict]:
    """Parse semicolon CSV with quoted fields and nullable numeric values.
    Blank/comments/malformed rows are skipped, matching the existing payload.
    """
    if not csv_path.is_file():
        return []
    cols = ("id", "primary_name", "messier", "ngcic", "other", "otype",
            "ra_hours", "dec_deg", "vmag", "size_am", "constellation",
            "wiki", "blurb", "search")
    rows: list[dict] = []
    with open(csv_path, encoding="utf-8", newline="") as f:
        for parts in csv.reader(f, delimiter=";"):
            if not parts:
                continue                      # blank line -> [] (was skipped)
            if parts[0].startswith("#"):
                continue                      # comment line
            if len(parts) != len(cols):
                continue
            d = dict(zip(cols, parts))
            try:
                d["ra_hours"] = float(d["ra_hours"]) if d["ra_hours"] else None
                d["dec_deg"] = float(d["dec_deg"]) if d["dec_deg"] else None
                d["vmag"] = float(d["vmag"]) if d["vmag"] else None
            except ValueError:
                continue          # malformed row - skip, don't crash boot
            rows.append(d)
    return rows



_read_catalog_csv = read_catalog

# Preserve the deployed planner's historical score during the repository split.
# The imported local catalog score differs for this one advanced object; this
# does not change which objects belong to the standard 200-object selection.
WEB_POPULARITY_OVERRIDES = {'ngc6542': 3}

def web_rows(csv_path=CATALOG):
    rows = read_catalog(Path(csv_path))
    if not rows:
        raise ValueError(f'Catalog missing or empty: {csv_path}')
    ids = [r['id'] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError('Catalog ids must be globally unique')
    standard = standard_ids(ids)
    output = []
    for advanced in (False, True):
        for row in rows:
            if (row['id'] not in standard) == advanced:
                score = WEB_POPULARITY_OVERRIDES.get(row['id'], POPULARITY.get(row['id'], 0))
                output.append({**row, 'popularity': score, '_adv': advanced})
    return output
