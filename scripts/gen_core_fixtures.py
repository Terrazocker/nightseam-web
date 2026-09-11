"""Generate committed Class P fixtures from the frozen Python oracle.

Phase 2 (NightSeam): concepts 6-8 compare core/ JavaScript against the Python
astronomy that remains authoritative at v0.6.16. This script runs the oracle
over the committed matrix and writes tests/fixtures/core_fixtures.json; the
manifest records the oracle revision, the command and per-concept tolerances.

Usage: python scripts/gen_core_fixtures.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import astro, planning  # noqa: E402  (oracle modules, frozen)

OUT = ROOT / "tests" / "fixtures" / "core_fixtures.json"

# --- the committed matrix ---------------------------------------------------
# name, lat, lon; polar day/twilight, mid-lat, southern, equatorial
SITES = [
    ("berlin", 52.52, 13.405),
    ("tromso", 69.65, 18.955),
    ("longyearbyen", 78.22, 15.63),
    ("sydney", -33.87, 151.21),
    ("nairobi", -1.29, 36.82),
]
DATES = ["2026-01-15", "2026-03-20", "2026-06-21",
         "2026-09-23", "2026-11-01", "2026-12-21"]
# minutes EAST in effect at local noon, per (site, date) - what the client sends
TZ_MIN = {
    "berlin": {"2026-01-15": 60, "2026-03-20": 60, "2026-06-21": 120,
               "2026-09-23": 120, "2026-11-01": 60, "2026-12-21": 60},
    "tromso": {"2026-01-15": 60, "2026-03-20": 60, "2026-06-21": 120,
               "2026-09-23": 120, "2026-11-01": 60, "2026-12-21": 60},
    "longyearbyen": {"2026-01-15": 60, "2026-03-20": 60, "2026-06-21": 120,
                     "2026-09-23": 120, "2026-11-01": 60, "2026-12-21": 60},
    "sydney": {"2026-01-15": 660, "2026-03-20": 660, "2026-06-21": 600,
               "2026-09-23": 600, "2026-11-01": 660, "2026-12-21": 660},
    "nairobi": {d: 180 for d in DATES},
}
# M42, M31, an equatorial point, the south celestial pole area, RA wraparound
POINTS = [(83.822, -5.391), (10.685, 41.269), (0.0, 0.0),
          (0.0, -89.0), (359.5, 45.0)]

TOLERANCES = {
    "jd": 1e-9, "gmst": 1e-9, "precession": 1e-9, "altaz": 1e-9,
    "sun": 1e-9, "moon": 1e-9, "twilight_s": 180.0,
}


def _utc(local_date: str, hh: int, tz_min: int) -> datetime:
    y, m, d = (int(x) for x in local_date.split("-"))
    return datetime(y, m, d, hh, 0, tzinfo=timezone.utc) - timedelta(minutes=tz_min)


def _naive_iso(dt: datetime | None) -> str | None:
    return None if dt is None else dt.replace(tzinfo=None).isoformat(timespec="seconds") + "Z"


def _oracle_revision() -> str:
    try:
        out = subprocess.run(["git", "describe", "--tags", "--always"],
                             cwd=ROOT, capture_output=True, text=True, timeout=30)
        return out.stdout.strip() or "unknown"
    except OSError:
        return "unknown"


def build() -> dict:
    jd_cases, gmst, precession, altaz, sun, moon, twilight = [], [], [], [], [], [], []
    seen_jd = set()

    for site, lat, lon in SITES:
        for date in DATES:
            tz = TZ_MIN[site][date]
            instant = _utc(date, 22, tz)
            jd = astro.julian_day(instant)
            if jd not in seen_jd:
                seen_jd.add(jd)
                jd_cases.append({"iso": instant.strftime("%Y-%m-%dT%H:%M:%SZ"), "jd": jd})
                gmst.append({"jd": jd, "deg": astro.gmst_deg(jd)})
            sun.append({"jd": jd, "ra": astro.sun_ra_dec(jd)[0],
                        "dec": astro.sun_ra_dec(jd)[1]})
            ir, idc = astro.moon_ra_dec(jd)
            moon.append({"jd": jd, "ra": ir, "dec": idc,
                         "illum": astro.moon_illumination(jd),
                         "age": astro.moon_age(jd)})
            for ra, dec in POINTS:
                pra, pdec = astro._precess_j2000_to_date(ra, dec, jd)
                precession.append({"ra": ra, "dec": dec, "jd": jd,
                                   "ra_out": pra, "dec_out": pdec})
                pa, pz = astro.altaz(ra, dec, jd, lat, lon)
                altaz.append({"ra": ra, "dec": dec, "jd": jd, "lat": lat, "lon": lon,
                              "alt": pa, "az": pz})

            y, m, d = (int(x) for x in date.split("-"))
            win = planning.night_window(y, m, d, tz, lat, lon)
            twilight.append({
                "site": site, "lat": lat, "lon": lon, "date": date, "tz_min": tz,
                "level": win["level"],
                "sunset": _naive_iso(win["sunset"]), "sunrise": _naive_iso(win["sunrise"]),
                "dusk": _naive_iso(win["dusk"]), "dawn": _naive_iso(win["dawn"]),
            })

    return {
        "manifest": {
            "oracle": _oracle_revision(),
            "oracle_tag": "v0.6.16",
            "oracle_note": "Python astronomy/planning unchanged since v0.6.16 "
                           "(Phase 2 concepts 1-5 touched JS/core only)",
            "command": "python scripts/gen_core_fixtures.py",
            "tolerances": TOLERANCES,
            "matrix": {
                "sites": [s[0] for s in SITES],
                "dates": DATES,
                "points": len(POINTS),
                "view_full_day": [False, True],
                "note": "catalog identity (curated/advanced/null-mag/composites) "
                        "is pinned by tests/test_catalog_integrity.py",
            },
        },
        "jd": jd_cases,
        "gmst": gmst,
        "precession": precession,
        "altaz": altaz,
        "sun": sun,
        "moon": moon,
        "twilight": twilight,
    }


def main() -> int:
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {sum(len(v) for k, v in data.items() if isinstance(v, list))} cases "
          f"(oracle {data['manifest']['oracle']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
