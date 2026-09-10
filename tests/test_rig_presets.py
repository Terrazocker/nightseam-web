"""Preset rigs: the smart telescopes seeded into a fresh setup.

Seeding happens once per database (settings flag) and never overwrites a rig
the user made under the same name.
"""

import pytest
from fastapi.testclient import TestClient

from app import rig_presets
from app.database import Database
from app.server import create_app, fov_arcmin


@pytest.fixture()
def db(tmp_path):
    return Database(tmp_path / "nightseam.db")


def test_fov_twin_matches_server():
    """rig_presets.fov_arcmin must stay identical to server.fov_arcmin."""
    for _name, focal, sw, sh in rig_presets.DEFAULT_RIGS:
        assert rig_presets.fov_arcmin(focal, sw) == fov_arcmin(focal, sw)
        assert rig_presets.fov_arcmin(focal, sh) == fov_arcmin(focal, sh)


def test_presets_cover_zwo_and_dwarflab():
    names = [n for n, *_ in rig_presets.DEFAULT_RIGS]
    assert any("Seestar" in n for n in names)
    assert any("DWARF" in n for n in names)
    assert len(names) == len(set(names)) >= 4


def test_golden_fov_values():
    # published FOV of the Seestar S50 is ~1.28 deg -> 76.6 arcmin
    assert rig_presets.fov_arcmin(250.0, 5.57) == pytest.approx(76.6, abs=0.2)
    # DWARF 3: 150 mm / 7.68 mm sensor -> ~2.93 deg
    assert rig_presets.fov_arcmin(150.0, 7.68) == pytest.approx(176.0, abs=0.4)


def test_ensure_seeded_adds_presets_once(db):
    added = rig_presets.ensure_seeded(db)
    assert added == len(rig_presets.DEFAULT_RIGS)
    rigs = db.rigs()
    assert [r["name"] for r in rigs] == [n for n, *_ in rig_presets.DEFAULT_RIGS]
    for r in rigs:
        assert r["focal_mm"] > 0
        assert r["sensor_w"] > r["sensor_h"] > 0
        assert r["fov_w"] > r["fov_h"] > 0
    # second start: nothing to do
    assert rig_presets.ensure_seeded(db) == 0
    assert len(db.rigs()) == len(rig_presets.DEFAULT_RIGS)


def test_deleted_preset_stays_deleted(db):
    rig_presets.ensure_seeded(db)
    first = db.rigs()[0]
    db.delete_rig(first["id"])
    assert rig_presets.ensure_seeded(db) == 0
    assert first["name"] not in [r["name"] for r in db.rigs()]


def test_add_missing_refills_deleted_presets(db):
    """The Rigs tab button: seed-once still holds, but a refill is possible."""
    rig_presets.ensure_seeded(db)
    gone = db.rigs()[0]["name"]
    db.delete_rig(db.rigs()[0]["id"])
    assert rig_presets.add_missing(db) == 1
    names = [r["name"] for r in db.rigs()]
    assert len(names) == len(rig_presets.DEFAULT_RIGS)
    assert gone in names
    assert rig_presets.add_missing(db) == 0        # nothing left to add


def test_existing_rig_with_same_name_wins(db):
    db.add_rig("ZWO Seestar S50", 250.0, 6.0, 4.0, 82.5, 55.0)
    rig_presets.ensure_seeded(db)
    rows = [r for r in db.rigs() if r["name"] == "ZWO Seestar S50"]
    assert len(rows) == 1
    assert rows[0]["sensor_w"] == 6.0          # the user's own numbers are kept
    assert len(db.rigs()) == len(rig_presets.DEFAULT_RIGS)


def test_create_app_seeds_presets(tmp_path):
    db = Database(tmp_path / "nightseam.db")
    assert db.rigs() == []                     # a bare Database stays untouched
    with TestClient(create_app(db, prefetch=False)) as c:
        rigs = c.get("/api/state").json()["rigs"]
    assert len(rigs) == len(rig_presets.DEFAULT_RIGS)
    assert rigs[0]["fov_w"] > 0


def test_presets_route_refills(tmp_path):
    db = Database(tmp_path / "nightseam.db")
    with TestClient(create_app(db, prefetch=False)) as c:
        first = c.get("/api/state").json()["rigs"][0]
        assert c.delete(f"/api/rigs/{first['id']}").status_code == 200
        assert len(c.get("/api/state").json()["rigs"]) == len(rig_presets.DEFAULT_RIGS) - 1
        assert c.post("/api/rigs/presets").json()["added"] == 1
        rigs = c.get("/api/state").json()["rigs"]
    assert len(rigs) == len(rig_presets.DEFAULT_RIGS)
    assert first["name"] in [r["name"] for r in rigs]
