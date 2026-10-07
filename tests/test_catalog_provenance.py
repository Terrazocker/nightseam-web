"""Catalog provenance sidecar, export and cache-integrity contracts."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path




ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DATA = ROOT / "catalog_data" / "data"


def _load_script(name: str):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_provenance_sidecars_are_identical_and_cover_the_catalog():
    web = (WEB / "catalog-provenance.json").read_bytes()
    source = (DATA / "catalog_provenance.json").read_bytes()
    assert web == source
    payload = json.loads(web)
    catalog = json.loads((WEB / "catalog.json").read_text(encoding="utf-8"))
    objects = payload["objects"]
    ids = {row["id"] for row in catalog}
    assert payload["schema_version"] == 1
    assert payload["catalog"]["row_count"] == len(ids)
    assert set(objects) == ids
    csv_sha = hashlib.sha256(
        (DATA / "openned.csv").read_bytes()).hexdigest()
    assert payload["catalog"]["sha256"] == csv_sha
    assert all(record["source_version"].startswith("sha256:")
               for record in objects.values())
    assert all(isinstance(record["aliases"], list)
               and isinstance(record["designation_history"], list)
               for record in objects.values())
    assert objects["ngc1976"]["source"] == "OpenNGC"
    assert objects["ngc1976"]["source_version"].startswith("sha256:")
    assert objects["m40"]["source"] == "NightSeam supplement"


def test_provenance_cache_guard_is_clean():
    guard = _load_script("check_catalog_provenance.py")
    assert guard.scan() == []


def test_provenance_guard_accepts_tokened_abort_options_only():
    guard = _load_script('check_catalog_provenance.py')
    assert guard._FETCH_RE.search("fetch('catalog-provenance.json?v=' + CATALOG_PROVENANCE_TOKEN, { signal: controller.signal })")
    assert not guard._FETCH_RE.search("fetch('catalog-provenance.json?v=1', { signal: controller.signal })")
