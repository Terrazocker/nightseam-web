"""D2 contract: rig fields of view are stored in arcminutes; rigs saved in
degrees by older builds convert once when read."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_web_rig_fov_unit_is_arcmin_with_a_legacy_adapter():
    ws = (ROOT / "web" / "webstore.js").read_text(encoding="utf-8")
    assert "export function fovArcmin" in ws
    assert "export function fovDeg" in ws
    assert "fovFrom" not in ws, "the old degree-valued helper must be gone"
    assert "r.fov_unit !== 'arcmin'" in ws, "legacy degree rigs must convert"
    app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    assert "fovArcmin" in app and "fov_unit: 'arcmin'" in app
    assert "rig.fov_w * 60" not in app, \
        "framePct must take arcmin directly (no hidden degree conversion)"
