"""Preset imaging rigs: popular smart telescopes (ZWO Seestar, DwarfLab DWARF).

`focal_mm` is the scope's focal length, `sensor_w`/`sensor_h` are the imaging
sensor's active area in millimetres (resolution x pixel pitch), which is all the
frame-coverage estimate needs. The FOV is computed with the same formula as
POST /api/rigs.

Seeding is once per database (settings flag `rigs_preset_seeded`), so a user who
deletes a preset does not get it back on the next start; names that already
exist are skipped, so a hand-made rig is never overwritten.

The web app is static and cannot read Python: web/webstore.js carries the same
list as `DEFAULT_RIGS` - keep the two in sync.
"""

from __future__ import annotations

import math

SEEDED_FLAG = "rigs_preset_seeded"

# name, focal_mm, sensor_w, sensor_h
DEFAULT_RIGS: list[tuple[str, float, float, float]] = [
    # ZWO Seestar — Sony IMX462 (S50) / IMX662 (S30): both 1/2.8", 2.9 um pitch
    ("ZWO Seestar S50", 250.0, 5.57, 3.13),
    ("ZWO Seestar S30", 150.0, 5.57, 3.13),
    ("ZWO Seestar S30 Pro", 150.0, 11.14, 6.26),      # IMX585, 1/1.2"
    # DwarfLab DWARF — IMX678 (DWARF 3), IMX662 (mini), IMX415 (DWARF II)
    ("DwarfLab DWARF 3", 150.0, 7.68, 4.32),
    ("DwarfLab DWARF mini", 150.0, 5.57, 3.13),
    ("DwarfLab DWARF II", 100.0, 5.60, 3.18),
]


def fov_arcmin(focal_mm: float, sensor_mm: float) -> float:
    """Field of view in arcminutes.

    Twin of app.server.fov_arcmin (kept separate so seeding never imports the
    route module); tests/test_rig_presets.py pins the two together.
    """
    return round(2 * math.degrees(math.atan(sensor_mm / 2 / focal_mm)) * 60, 1)


def add_missing(db) -> int:
    """Insert every preset whose name is not stored yet. Returns how many."""
    have = {str(r.get("name", "")).strip().lower() for r in db.rigs()}
    added = 0
    for name, focal, sw, sh in DEFAULT_RIGS:
        if name.strip().lower() in have:
            continue
        db.add_rig(name, focal, sw, sh,
                   fov_arcmin(focal, sw), fov_arcmin(focal, sh))
        added += 1
    return added


def ensure_seeded(db) -> int:
    """Insert the preset rigs into `db` once (settings flag). Returns added."""
    if db.setting(SEEDED_FLAG):
        return 0
    added = add_missing(db)
    db.set_setting(SEEDED_FLAG, 1)
    return added
