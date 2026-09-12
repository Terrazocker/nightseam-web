"""Timezone arithmetic: core/time.js against absolute IANA-rules goldens.

Phase 2, concept 3 (Class J - no Python implementation is authoritative; the
client computes the offset and sends it). The goldens below are published IANA
tzdb rules for the 2026 transition dates (EU: last Sundays of March/October;
US: second Sunday of March / first Sunday of November; AU: first Sundays of
April/October), including fractional offsets (+05:45 Nepal, +12:45 Chatham).

Pinned: the local-noon offset (the API convention, minutes EAST), the
instant offset (DST-aware), the wall<->UTC shift inverse, and that both shells
delegate to the core instead of keeping private Intl parsing.
"""

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "tests" / "js" / "astro_parity.mjs"

# (tz, date) -> minutes EAST of UTC in effect at local noon
_NOON_GOLDENS = {
    ("Europe/Berlin", "2026-01-15"): 60,
    ("Europe/Berlin", "2026-03-29"): 120,       # spring-forward day, noon is CEST
    ("Europe/Berlin", "2026-06-21"): 120,
    ("Europe/Berlin", "2026-10-25"): 60,        # fall-back day, noon is CET
    ("Europe/Berlin", "2026-12-21"): 60,
    ("America/Los_Angeles", "2026-01-15"): -480,
    # transition-day quirk, PRESERVED from the desktop algorithm: the UTC-noon
    # iteration walks "UTC + east", which for western zones samples just before
    # the 10:00Z switch, so the spring-forward day reports the pre-switch -480
    # (Berlin, an eastern zone, reports the post-switch value). Characterized,
    # not "fixed": this phase allows no user-visible change.
    ("America/Los_Angeles", "2026-03-08"): -480,
    ("America/Los_Angeles", "2026-06-21"): -420,
    ("America/Los_Angeles", "2026-11-01"): -420,
    ("Australia/Sydney", "2026-01-15"): 660,
    ("Australia/Sydney", "2026-04-05"): 600,
    ("Australia/Sydney", "2026-06-21"): 600,
    ("Australia/Sydney", "2026-10-04"): 660,
    ("Australia/Sydney", "2026-12-21"): 660,
    ("Asia/Kathmandu", "2026-01-15"): 345,
    ("Asia/Kathmandu", "2026-06-21"): 345,
    ("Pacific/Chatham", "2026-01-15"): 825,     # +13:45, southern DST
    ("Pacific/Chatham", "2026-06-21"): 765,     # +12:45, standard
    ("UTC", "2026-06-21"): 0,
}

# (tz, UTC instant) -> minutes EAST at that instant
_INSTANT_GOLDENS = {
    ("Europe/Berlin", (2026, 1, 15, 12)): 60,
    ("Europe/Berlin", (2026, 6, 21, 12)): 120,
    ("America/Los_Angeles", (2026, 1, 15, 12)): -480,
    ("America/Los_Angeles", (2026, 6, 21, 12)): -420,
    ("Australia/Sydney", (2026, 6, 21, 12)): 600,
    ("Asia/Kathmandu", (2026, 6, 21, 12)): 345,
    ("Pacific/Chatham", (2026, 1, 15, 12)): 825,
}

def _ms(parts):
    return int(datetime(*parts, tzinfo=timezone.utc).timestamp() * 1000)


def _run_node(cases):
    node = shutil.which("node")
    if not node:
        pytest.fail("node is not installed - timezone core cannot be checked")
    try:
        proc = subprocess.run(
            [node, str(HARNESS), "timezone"],
            input=json.dumps(cases), capture_output=True, text=True,
            encoding="utf-8", timeout=120, cwd=str(ROOT),
            env={**os.environ, "TZ": "UTC"})
    except OSError as exc:          # sandboxed environments deny pipe creation
        pytest.fail(f"cannot spawn node here: {exc}")
    assert proc.returncode == 0, f"harness failed: {proc.stderr[-2000:]}"
    return json.loads(proc.stdout)


def test_local_noon_offsets_match_iana_rules():
    zoom = list(_NOON_GOLDENS)
    cases = [{"tz": tz, "date": d} for tz, d in zoom]
    got = _run_node(cases)
    for (tz, d), have in zip(zoom, got):
        assert have == _NOON_GOLDENS[(tz, d)], (tz, d, have)


def test_instant_offsets_match_iana_rules():
    cases, wants = [], []
    for (tz, parts), want in _INSTANT_GOLDENS.items():
        cases.append({"tz": tz, "ms": _ms(parts)})
        wants.append(want)
    got = _run_node(cases)
    for (tz, parts), want, have in zip(_INSTANT_GOLDENS, wants, got):
        assert have == want, (tz, parts, have, want)


def test_wall_utc_shift_is_an_inverse():
    cases = []
    for tz, parts in _INSTANT_GOLDENS:
        cases.append({"kind": "wall", "tz": tz, "ms": _ms(parts)})
    got = _run_node(cases)
    for (tz, parts), res in zip(_INSTANT_GOLDENS, got):
        assert res["back"] == _ms(parts), (tz, parts, res)
        want_wall = _ms(parts) + _INSTANT_GOLDENS[(tz, parts)] * 60000
        assert res["wall"] == want_wall, (tz, parts, res)


def test_shells_delegate_timezone_math_to_core():
    util = (ROOT / "static" / "js" / "util.js").read_text(encoding="utf-8")
    assert "zoneOffsetAtLocalNoon(effZone(), dateStr)" in util, \
        "desktop tzOffAt must delegate to core/time.js"
    assert "timeZoneName" not in util, "desktop kept a private Intl parser"
    ws = (ROOT / "web" / "webstore.js").read_text(encoding="utf-8")
    assert "offsetEastMin(tzName, date.getTime())" in ws, \
        "web tzOffMinAt must delegate to core/time.js"
    assert "wallFromUtcMs" in ws and "utcFromWallMs" in ws
    assert "timeZoneName" not in ws, "web kept a private Intl parser"
