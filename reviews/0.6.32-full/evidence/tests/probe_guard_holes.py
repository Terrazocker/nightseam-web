"""L7 probe: demonstrate two guard blind spots with TEMPORARY files in web/.

Both guards are text-based; the probe writes throw-away modules into web/, runs
the two guards, and removes them in a finally block. Positive controls prove the
guards DO fire on the ordinary form, so the hole is the specific syntax, not the
whole guard.

  1. scripts/check_core.py: a moved core concept re-implemented as an
     object-literal PROPERTY (`name: (...) => ...`) or on the same line as `{`
     is not reported.
  2. scripts/check_js_imports.py: a broken RE-EXPORT (`export {x} from './gone.js'`)
     is not reported (only `import ... from` is scanned).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WEB = REPO / "web"

PROBE_A = WEB / "zz_l7_probe_a.js"   # moved concept as an object property
PROBE_B = WEB / "zz_l7_probe_b.js"   # positive control: `function name(`
PROBE_C = WEB / "zz_l7_probe_c.js"   # broken re-export
PROBE_D = WEB / "zz_l7_probe_d.js"   # positive control: broken import


def run(script: str) -> tuple[int, str]:
    r = subprocess.run([sys.executable, str(REPO / "scripts" / script)],
                       capture_output=True, text=True, cwd=str(REPO))
    return r.returncode, (r.stdout + r.stderr).strip()


def main() -> int:
    try:
        PROBE_A.write_text(
            "// probe: a second implementation of a core concept, object style\n"
            "export const SUN = {\n"
            "  precessJ2000ToDate: (jd) => jd + 1,\n"
            "};\n", encoding="utf-8")
        rc, out = run("check_core.py")
        print(f"[1] check_core with the object-property form -> exit {rc}")
        print("    " + out.replace("\n", "\n    "))

        PROBE_B.write_text("export function precessJ2000ToDate(jd) { return jd; }\n",
                           encoding="utf-8")
        rc, out = run("check_core.py")
        print(f"[1c] positive control (function form) -> exit {rc}")
        print("    " + out.replace("\n", "\n    "))
        PROBE_B.unlink()

        PROBE_C.write_text("export { nothing } from './does-not-exist-l7.js';\n",
                           encoding="utf-8")
        rc, out = run("check_js_imports.py")
        print(f"[2] check_js_imports with a broken RE-EXPORT -> exit {rc}")
        print("    " + out.replace("\n", "\n    "))

        PROBE_D.write_text("import { nothing } from './does-not-exist-l7.js';\n",
                           encoding="utf-8")
        rc, out = run("check_js_imports.py")
        print(f"[2c] positive control (import form) -> exit {rc}")
        print("    " + out.replace("\n", "\n    "))
    finally:
        for p in (PROBE_A, PROBE_B, PROBE_C, PROBE_D):
            p.unlink(missing_ok=True)
    st = subprocess.run(["git", "status", "--porcelain", "--", "web"],
                        capture_output=True, text=True, cwd=str(REPO))
    print("[cleanup] git status --porcelain -- web:", repr(st.stdout.strip()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
