"""Generate app-probe.mjs: web/app.js with ONLY the import specifiers retargeted
(so Node can resolve them from this directory) plus a few test hooks appended.

Nothing else changes: every function body is byte-identical to web/app.js.
Usage: python reviews/0.6.32-full/evidence/web/build_probe_app.py
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = (HERE / ".." / ".." / ".." / ".." / "web" / "app.js").resolve()
OUT = HERE / "app-probe.mjs"

src = SRC.read_text(encoding="utf-8")
assert "from './" in src
out = src.replace("from './", "from '../../../../web/")
out += """
/* --- test hooks appended by build_probe_app.py (no product code changed) --- */
export { loadWikiThumb, boot, reinitUserData, upsertTarget, byId, RIGS, S, applyActiveSite };
export function __setCAT(v) { CAT = v; }
export function __getCAT() { return CAT; }
"""
OUT.write_text(out, encoding="utf-8")
print(f"wrote {OUT} from {SRC} ({len(src.splitlines())} lines)")
