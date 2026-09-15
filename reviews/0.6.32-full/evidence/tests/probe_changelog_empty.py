"""L7 probe: does the curation gate block an EMPTY curated entry?

Every gate tests MEMBERSHIP (`version in CURATED`), while the generator uses
TRUTHINESS (`if summary:`). A placeholder entry - the natural "add the key now,
write the text later" slip the release order asks for - therefore passes
pre_tag_check and check_release, is skipped by the generator, and leaves the
public "What's new" without the release. Pure functions, no tree mutation.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]


def load(name: str, rel: str):
    spec = importlib.util.spec_from_file_location(name, REPO / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    bc = load("probe_build_changelog", "scripts/build_changelog.py")
    pt = load("probe_pre_tag_check", "scripts/pre_tag_check.py")

    print("real CURATED['0.6.32'] empty?", not bc.CURATED.get("0.6.32", "").strip())
    print("pre_tag_check.check('9.9.9') with no key:", pt.check("9.9.9"))

    saved = dict(bc.CURATED)
    try:
        bc.CURATED["9.9.9"] = ""          # the placeholder slip
        pt._load = lambda name: bc if name == "build_changelog" else None
        print("pre_tag_check.check('9.9.9') with an EMPTY entry:", pt.check("9.9.9"))
        tags = ["v9.9.9", "v0.6.32", "v0.6.31"]
        backlog, older = bc.split_uncurated(tags, bc.CURATED)
        print("split_uncurated backlog for v9.9.9 with an EMPTY entry:", backlog)
        entries = bc.build_entries(tags, lambda t: "2026-01-01", bc.CURATED)
        print("generated changelog versions:", [e["version"] for e in entries])
        print("=> the release is 'curated' for every gate but absent from the page")
    finally:
        bc.CURATED.clear()
        bc.CURATED.update(saved)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
