"""L7 probe: prove check_js_syntax.py and check_encoding.py really detect what
they claim - entirely OFF the repo tree (probe files live under evidence/).

  * check_js_syntax.py --path <file> must exit 1 for a syntax error, 2 for a
    path that does not exist (documented), 0 for a clean file.
  * check_encoding.scan(root=<probe dir>) must report non-UTF8, a UTF-8 BOM,
    C1 controls and a cp1252 mojibake cluster - and must NOT report clean text.
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
PROBE = HERE / "syntaxprobe"
ENC = HERE / "encprobe"


def syntax(path: Path) -> tuple[int, str]:
    r = subprocess.run([sys.executable, str(REPO / "scripts" / "check_js_syntax.py"),
                        "--path", str(path)], capture_output=True, text=True,
                       cwd=str(REPO))
    return r.returncode, (r.stdout + r.stderr).strip()


def load_encoding():
    spec = importlib.util.spec_from_file_location(
        "probe_check_encoding", REPO / "scripts" / "check_encoding.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    PROBE.mkdir(parents=True, exist_ok=True)
    good = PROBE / "good.js"
    good.write_text("export const a = 1;\n", encoding="utf-8")
    # a duplicate `const` is the measured case the guard's docstring names
    bad = PROBE / "bad.js"
    bad.write_text("const a = 1;\nconst a = 2;\nexport { a };\n", encoding="utf-8")
    for label, p in (("clean file", good), ("duplicate const", bad),
                     ("missing path", PROBE / "nope.js")):
        rc, out = syntax(p)
        print(f"[syntax] {label} -> exit {rc}: {out.splitlines()[-1] if out else ''}")

    ENC.mkdir(parents=True, exist_ok=True)
    (ENC / "clean.py").write_text("# em dash: \u2014 degree: \u00b0\n",
                                  encoding="utf-8")
    (ENC / "notutf8.py").write_bytes(b"# \xe4\xf6\xfc latin-1\n")
    (ENC / "bom.py").write_text("# bom\n", encoding="utf-8-sig")
    (ENC / "c1.txt").write_text("# control \u0085 here\n", encoding="utf-8")
    # cp1252 mojibake: UTF-8 bytes of U+2014 read as cp1252 -> "â€""
    (ENC / "mojibake.md").write_text("# dash \u00e2\u20ac\u201d here\n",
                                     encoding="utf-8")
    mod = load_encoding()
    findings = {p.name: why for p, why in mod.scan(ENC)}
    for name in sorted(p.name for p in ENC.iterdir()):
        print(f"[encoding] {name}: {findings.get(name, 'OK (not reported)')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
