"""Shadow export: frozen Python server payloads for core comparison (Phase 3)."""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(r"<workspace>\AstroPilot-local")
sys.path.insert(0, str(ROOT))

from app.database import Database  # noqa: E402
from app.nightcalc import compute_night  # noqa: E402

OUT = Path(ROOT) / "logs" / "shadow" / "server_payloads.json"
OUT.parent.mkdir(parents=True, exist_ok=True)


def profile_wall(bottom=0, top=20, az_to=90):
    prof = [-90.0] * 720
    for i in range(720):
        if i * 0.5 < az_to:
            prof[i] = top
    return prof


def profile_sky():
    prof = [90.0] * 720
    top = [-90.0] * 720
    for i in range(720):
        az = i * 0.5
        if 90.0 <= az < 270.0:
            prof[i] = 10.0
            top[i] = 40.0
    return prof, top


CASES = [
    {"name": "berlin-winter", "lat": 52.52, "lon": 13.405, "elev": 34,
     "date": "2026-01-15", "tz": 60,
     "profile": profile_wall(), "profile_top": None, "mode": "obstacle"},
    {"name": "tromso-summer", "lat": 69.65, "lon": 18.955, "elev": 10,
     "date": "2026-06-21", "tz": 120,
     "profile": profile_sky()[0], "profile_top": profile_sky()[1], "mode": "sky"},
    {"name": "sydney-summer", "lat": -33.87, "lon": 151.21, "elev": 20,
     "date": "2026-12-21", "tz": 660, "profile": [], "profile_top": None,
     "mode": "obstacle"},
    {"name": "berlin-dst", "lat": 52.52, "lon": 13.405, "elev": 34,
     "date": "2026-11-01", "tz": 60,
     "profile": profile_wall(), "profile_top": None, "mode": "obstacle"},
]

db_path = OUT.parent / "shadow.db"
if db_path.exists():
    db_path.unlink()
db = Database(db_path)
meta = {o["id"]: o for o in db.all_objects(advanced=True)}

out = {"cases": []}
for c in CASES:
    payload = compute_night(db, c["lat"], c["lon"], c["elev"], c["date"], c["tz"],
                            c["profile"], c.get("profile_top"))
    objects = []
    for o in payload["objects"]:
        m = meta.get(o["id"], {})
        objects.append({**o, "ra_hours": m.get("ra_hours"), "dec_deg": m.get("dec_deg")})
    out["cases"].append({
        "name": c["name"], "lat": c["lat"], "lon": c["lon"], "date": c["date"],
        "tz": c["tz"], "mode": c["mode"],
        "profile": c["profile"], "profile_top": c.get("profile_top"),
        "timeline": payload["timeline"],
        "sun_alt": payload["sun_alt"], "moon_alt": payload["moon_alt"],
        "objects": objects,
    })

OUT.write_text(json.dumps(out), encoding="utf-8")
print("wrote", OUT, "cases:", len(out["cases"]),
      "objects:", sum(len(c["objects"]) for c in out["cases"]),
      "samples:", out["cases"][0]["timeline"]["n"])
