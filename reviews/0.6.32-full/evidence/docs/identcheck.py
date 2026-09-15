"""Probe: named artifacts/functions the current docs claim exist."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PATHS = [
    "tests/fixtures/core_fixtures.json", "tests/test_core_fixtures.py",
    "tests/js/astro_parity.mjs", "tests/js/derive_window.mjs",
    "tests/js/scrub_degenerate.mjs", "tests/js/night_race.mjs",
    "tests/js/reference_anchors.mjs", "tests/test_reference_anchors.py",
    "tests/test_js_parity.py", "tests/test_core_drift.py",
    "tests/test_paths.py", "tests/test_backup.py", "tests/test_api.py",
    "tests/test_supplement.py", "tests/test_library_ids.py",
    "tests/test_catalog_integrity.py", "tests/test_cache_tokens.py",
    "tests/test_pre_tag_check.py", "tests/test_deploy_order.py",
    "tests/test_rig_presets.py", "tests/test_ui_invariants.py",
    "tests/test_catalog.py", "tests/test_js_syntax_check.py",
    "tests/js/core_d1.mjs", "tests/js/pano_geom.mjs", "tests/js/pano_ui.mjs",
    "tests/js/sky_band.mjs", "tests/js/web_backup.mjs", "tests/js/core_exports.mjs",
    "tests/conftest.py", "scripts/build_core.py", "scripts/build_changelog.py",
    "scripts/check_release.py", "scripts/check_core.py", "scripts/check_js.py",
    "scripts/check_browser.py", "scripts/pre_tag_check.py", "scripts/make_release.py",
    "scripts/match_popularity.py", "scripts/build_adv_catalog.py",
    "core/horizon.js", "core/astro.js", "core/planning.js", "core/visibility.js",
    "core/scoring.js", "core/catalog.js", "core/format.js", "core/time.js",
    "core/index.js", "core/core.manifest.json", "web/core.js", "static/js/core.js",
    "web/build_web.py", "web/ftps_deploy.py", "web/catalog.manifest.json",
    "app/data/supplement.csv", "app/data/openned.csv", "app/popularity_data.py",
    "app/rig_presets.py", "app/imglib.py", "app/catalog_data.py",
    "landing/changelog.json", "ENVIRONMENT.md", "NOTICE", "LICENSE",
    "tests/js/derive_window.mjs", "tests/browser/harness.py",
    "static/js/derive.js", "static/js/planning_client.js", "static/js/planning_worker.js",
    "static/js/pano.js", "web/astro.js", "web/horizon.js", "web/webstore.js",
    "web/nightrank.js", "web/format.js", "web/dragwin.js",
]
for p in PATHS:
    if not (ROOT / p).exists():
        print("MISSING", p)

# functions/identifiers the docs name
IDENT = [
    ("app/paths.py", "safe_rel"), ("app/paths.py", "safe_join"), ("app/paths.py", "safe_token"),
    ("app/catalog_data.py", "LEGACY_ID_MAP"), ("app/catalog_data.py", "STANDARD_TOP_N"),
    ("app/database.py", "migrate_legacy_object_ids"), ("app/database.py", "seed_catalog"),
    ("app/database.py", "_drop_retired_fields"),
    ("core/catalog.js", "assignPopularityTiers"), ("core/catalog.js", "wikiTitles"),
    ("core/astro.js", "precessJ2000ToDate"), ("core/planning.js", "scrubWindowMs"),
    ("core/planning.js", "nightInfo"), ("core/planning.js", "pickDarkWindow"),
    ("core/horizon.js", "cropKeptBand"), ("core/horizon.js", "visibleSkyBands"),
    ("core/horizon.js", "assumedOpenHatchPolys"), ("core/horizon.js", "skyBandPolygons"),
    ("core/horizon.js", "normalizeProfileBins"), ("core/horizon.js", "profileSegments"),
    ("app/server.py", "_effective_min_alt"), ("app/server.py", "min_useful_alt_explicit"),
    ("app/server.py", "PROFILE_BINS"),
    ("scripts/build_core.py", "retention_keep"),
    ("web/horizon.js", "historyLimit"), ("web/horizon.js", "HISTORY_LIMIT"),
    ("web/app.js", "scrubRange"), ("web/app.js", "clampSkyTime"),
    ("web/horizon.js", "exportPanosWithImages"), ("web/horizon.js", "overhangRuns"),
    ("static/js/derive.js", "effectiveMinAlt"), ("static/js/derive.js", "indexRangeFor"),
    ("static/js/util.js", "initFocusTrap"), ("static/js/weather.js", "loadWeather"),
]
for f, name in IDENT:
    p = ROOT / f
    if not p.exists():
        print("MISSING FILE", f)
        continue
    if name not in p.read_text(encoding="utf-8"):
        print("MISSING IDENT", f, name)
print("done")
