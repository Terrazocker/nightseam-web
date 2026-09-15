#!/usr/bin/env python3
"""Match the OpenNGC catalog (app/data/openned.csv) against the popularity source
popularity scores and write `app/popularity_data.py`.

The scores are used for TWO things (see `app/catalog_data.py`): the silent
ranking tiebreaker and the standard-mode selection (the N most popular objects),
so the match must be REPRODUCIBLE - it is: every designation of an object is
considered and the highest score wins (see `match_objects`).

Usage:
  python scripts/match_popularity.py                 # fetch, then write the module
  python scripts/match_popularity.py --cached        # use data/popularity_snapshot.json
  python scripts/match_popularity.py --print         # print the dict instead of writing
"""

import csv
import json
import ssl
import urllib.request
import re
import sys
from collections import defaultdict

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "app" / "data" / "openned.csv"
POPULARITY_URL = "https://popularity-source.invalid/"
OUTPUT_JSON = Path(r"<workspace>\AstroPilot-local\reviews\0.6.32-full\evidence\catalog\popularity_cache_copy.json")
OUTPUT_MODULE = Path(r"<workspace>\AstroPilot-local\reviews\0.6.32-full\evidence\catalog\popularity_shadow_99991.py")


def fetch_popularity():
    """Fetch the popularity source popularity JSON."""
    print("Fetching the popularity source popularity data...")
    try:
        # Try with default SSL
        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            POPULARITY_URL,
            headers={"User-Agent": "Mozilla/5.0 (compatible; NightSeam/1.0)"}
        )
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"  Fetched {len(data)} entries from the popularity source")
            return data
    except Exception as e:
        print(f"  SSL fetch failed: {e}")
        # Try with relaxed SSL
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(
                POPULARITY_URL,
                headers={"User-Agent": "Mozilla/5.0 (compatible; NightSeam/1.0)"}
            )
            with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                print(f"  Fetched {len(data)} entries (relaxed SSL)")
                return data
        except Exception as e2:
            print(f"  Relaxed SSL also failed: {e2}")
            return None


def load_cached_snapshot():
    """Try to load cached the popularity source data."""
    import os
    if os.path.exists(OUTPUT_JSON):
        print(f"Loading cached the popularity source data from {OUTPUT_JSON}")
        with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"  Loaded {len(data)} entries from cache")
        return data
    return None


def normalize(s):
    """Normalize a string for matching: lowercase, strip spaces/hyphens/dots and
    LEADING ZEROS inside numbers.

    The padding matters: the popularity source keys the Large Magellanic Cloud as
    'PGC 17223' while OpenNGC lists it as 'PGC 017223' - without this the LMC
    (and ~1,259 other padded the popularity source keys) never matched, so the standard
    'most popular' list lost one of its most famous objects. Only zeros that
    START a number are dropped ('ngc7000' stays 'ngc7000')."""
    if not s:
        return ""
    s = s.lower().strip()
    s = re.sub(r'[\s\-\.\(\)]+', '', s)
    return re.sub(r"(?<![0-9])0+(?=\d)", "", s)


# Objects whose OpenNGC designation is NOT the name the popularity source keys them under.
# Verified against data/popularity_snapshot.json - each target below exists there and
# names the same object (The popularity source lists no Hyades entry at all, so that one
# simply has no score).
POPULARITY_ALIASES = {
    "b33": "BARNARD 33",            # OpenNGC's short form of the Horsehead
    "mel111": "CL MELOTTE 111",     # Coma Star Cluster
    "cl399": "CL COLLINDER 399",    # Brocchi's Cluster / Coathanger
    "ngc5866": "M 102",             # the Spindle Galaxy (modern M102 identity)
}


def extract_designations_from_csv_row(row):
    """Extract all possible matching designations from a CSV row."""
    designations = set()
    
    # The id field (e.g., "ngc7000", "ic10")
    csv_id = row.get("id", "")
    if csv_id:
        designations.add(normalize(csv_id))
        designations.add(csv_id.lower().strip())
    
    # primary_name (e.g., "NGC 7000", "IC 10")
    primary = row.get("primary_name", "")
    if primary:
        designations.add(normalize(primary))
        designations.add(primary.lower().strip())
    
    # ngcic column (e.g., "NGC 7000", "IC 10")
    ngcic = row.get("ngcic", "")
    if ngcic:
        designations.add(normalize(ngcic))
        designations.add(ngcic.lower().strip())
    
    # messier column
    messier = row.get("messier", "")
    if messier:
        designations.add(normalize(messier))
        designations.add(messier.lower().strip())
    
    # other identifiers (comma-separated list)
    other = row.get("other", "")
    if other:
        for alt in other.split(","):
            alt = alt.strip()
            if alt:
                designations.add(normalize(alt))
                designations.add(alt.lower().strip())
    
    # search column (pipe-separated)
    search = row.get("search", "")
    if search:
        for term in search.split("|"):
            term = term.strip()
            if term:
                designations.add(normalize(term))
                designations.add(term.lower().strip())
    
    # objects the popularity source keys under a different designation (see the table)
    for desig in list(designations):
        alias = POPULARITY_ALIASES.get(desig)
        if alias:
            designations.add(normalize(alias))

    # Remove empty strings
    designations.discard("")
    return designations


def build_popularity_index(tel_data):
    """Build lookup index from the popularity source data."""
    index = {}  # normalized_name -> (original_name, score)
    
    for entry in tel_data:
        name = entry.get("name", "")
        score = entry.get("popularity", entry.get("score", 0))
        
        if not name:
            continue
        
        norm = normalize(name)
        if norm and norm not in index:
            index[norm] = (name, score)
        
        # Also try variations
        # The popularity source uses "NGC 7000" format, try "ngc7000" too
        stripped = norm
        if stripped not in index:
            index[stripped] = (name, score)
    
    return index


def match_objects(csv_rows, tel_index):
    """Match CSV objects against the popularity source data - DETERMINISTICALLY.

    An object carries several designations and the popularity source may know more than
    one of them with DIFFERENT scores (M27 = NGC 6853: "M 27" 73260 vs "NGC
    6853" 4). The old code iterated a `set` and broke on the first hit, so the
    score depended on PYTHONHASHSEED: two runs of the same input produced
    different popularity tables, and the standard-mode selection built on them
    was not reproducible. Every designation is now considered and the HIGHEST
    score wins; ties go to the lexicographically smallest key, so the result is
    stable across processes and machines.
    """
    matches = {}
    match_details = []

    for row in csv_rows:
        csv_id = row.get("id", "")
        if not csv_id:
            continue

        designations = sorted(extract_designations_from_csv_row(row))
        best = None                     # (score, key, original name)
        for desig in designations:
            hit = tel_index.get(desig)
            if hit is None:
                continue
            orig_name, score = hit
            if best is None or score > best[0]:
                best = (score, desig, orig_name)

        if best is not None:
            score, desig, orig_name = best
            matches[csv_id] = score
            match_details.append({
                "csv_id": csv_id,
                "primary_name": row.get("primary_name", ""),
                "source_name": orig_name,
                "score": score,
                "matched_via": desig,
            })

    return matches, match_details


def read_csv():
    """Read the openned.csv file."""
    rows = []
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            line = line.strip()
            if not line:
                continue
            parts = line.split(";")
            if len(parts) < 10:
                continue
            row = {
                "id": parts[0],
                "primary_name": parts[1],
                "messier": parts[2],
                "ngcic": parts[3],
                "other": parts[4],
                "otype": parts[5],
                "ra_hours": parts[6],
                "dec_deg": parts[7],
                "vmag": parts[8],
                "size_am": parts[9] if len(parts) > 9 else "",
                "constellation": parts[10] if len(parts) > 10 else "",
                "wiki": parts[11] if len(parts) > 11 else "",
                "blurb": parts[12] if len(parts) > 12 else "",
                "search": parts[13] if len(parts) > 13 else "",
            }
            rows.append(row)
    return rows


def write_module(matches) -> None:
    """Write `app/popularity_data.py` (sorted by id, with its provenance)."""
    lines = [
        '"""The popularity source popularity scores for the OpenNGC catalog.',
        "",
        "One entry per catalog id, used for TWO things:",
        "  * the SILENT ranking tiebreaker (visibility decides, popularity separates",
        "    equals - the number is never shown in either app), and",
        "  * the STANDARD-MODE selection (`app/catalog_data.STANDARD_TOP_N`: the N",
        "    most popular objects are the standard catalog, the rest are advanced).",
        "",
        "GENERATED - do not hand-edit. Re-run:",
        "",
        "    python scripts/match_popularity.py            # fetch + rewrite this file",
        "    python scripts/match_popularity.py --cached   # use data/popularity_snapshot.json",
        "",
        "Every designation of every `app/data/openned.csv` row is matched against",
        "the popularity source table and the HIGHEST score wins (`match_objects`), so the",
        "result does not depend on set/hash order and the standard-mode selection is",
        "reproducible.",
        '"""',
        "POPULARITY = {",
    ]
    for oid in sorted(matches):
        lines.append(f"    {oid!r}: {matches[oid]},")
    lines.append("}")
    OUTPUT_MODULE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_MODULE} ({len(matches)} entries)")


def main():
    argv = sys.argv[1:]
    use_cache = "--cached" in argv
    to_stdout = "--print" in argv

    # 1. Read CSV
    print(f"Reading {CSV_PATH}...")
    csv_rows = read_csv()
    print(f"  Total rows in openned.csv: {len(csv_rows)}")

    # 2. Fetch or load the popularity source data
    tel_data = None if use_cache else fetch_popularity()
    if tel_data is None:
        tel_data = load_cached_snapshot()
    
    if tel_data is None:
        print("ERROR: Could not fetch or load the popularity source data")
        sys.exit(1)
    
    # Cache it
    import os
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(tel_data, f, indent=2)
    print(f"  Cached the popularity source data to {OUTPUT_JSON}")
    
    # 3. Inspect the popularity source data structure
    if tel_data:
        sample = tel_data[0] if isinstance(tel_data, list) else list(tel_data.items())[:3]
        print(f"  Sample entry: {json.dumps(sample, indent=2)[:500]}")
        if isinstance(tel_data, dict):
            print(f"  Keys sample: {list(tel_data.keys())[:10]}")
    
    # 4. Build index
    if isinstance(tel_data, list):
        tel_index = build_popularity_index(tel_data)
    elif isinstance(tel_data, dict):
        # Might be {name: score} or {name: {score: X}} etc.
        tel_index = {}
        for k, v in tel_data.items():
            if isinstance(v, (int, float)):
                score = v
            elif isinstance(v, dict):
                score = v.get("popularity", v.get("score", 0))
            else:
                continue
            norm = normalize(k)
            if norm:
                tel_index[norm] = (k, score)
    else:
        print("ERROR: Unexpected the popularity source data format")
        sys.exit(1)
    
    print(f"  the popularity source index: {len(tel_index)} normalized entries")
    
    # Show some sample keys
    sample_keys = list(tel_index.keys())[:15]
    print(f"  Sample normalized keys: {sample_keys}")
    
    # 5. Match
    print("\nMatching objects...")
    matches, details = match_objects(csv_rows, tel_index)
    
    # 6. Report
    total = len(csv_rows)
    matched = len(matches)
    rate = (matched / total * 100) if total else 0
    
    print(f"\n{'='*60}")
    print(f"RESULTS")
    print(f"{'='*60}")
    print(f"Total rows in openned.csv: {total}")
    print(f"Total matches found: {matched}")
    print(f"Match rate: {rate:.2f}%")
    
    # Top 20 by score
    sorted_matches = sorted(details, key=lambda x: x["score"], reverse=True)[:20]
    print(f"\nTop 20 matched objects by the popularity source popularity score:")
    print(f"{'Rank':<5} {'CSV ID':<20} {'Primary Name':<20} {'The popularity source Name':<25} {'Score':<10} {'Matched Via'}")
    print("-" * 100)
    for i, m in enumerate(sorted_matches, 1):
        print(f"{i:<5} {m['csv_id']:<20} {m['primary_name']:<20} {m['source_name']:<25} {m['score']:<10} {m['matched_via']}")
    
    # 7. Output
    scored = {oid: s for oid, s in matches.items() if s and s > 0}
    print(f"\n{'='*60}")
    print(f"POPULARITY ({len(scored)} scored entries"
          f"{'; %d zero-score rows dropped' % (len(matches) - len(scored)) if len(matches) != len(scored) else ''})")
    print(f"{'='*60}")
    if to_stdout:
        print("POPULARITY = {")
        for csv_id in sorted(scored):
            print(f"    {csv_id!r}: {scored[csv_id]},")
        print("}")
    else:
        write_module(scored)

    return scored


if __name__ == "__main__":
    main()
