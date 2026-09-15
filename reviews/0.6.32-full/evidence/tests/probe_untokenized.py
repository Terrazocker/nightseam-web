"""L7 probe: a web module imported WITHOUT a `?v=` is invisible to
check_js_tokens.py, so nothing enforces the AGENTS.md rule "web/app.js carries a
`?v=` on each import" - and that module's URL never changes for a returning
visitor (the XL-01 user impact).

Runs on a COPY of the guard + the flat web tree under evidence/ (the real repo
is untouched).
"""
from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
TREE = HERE / "tokprobe2"


def main() -> int:
    shutil.rmtree(TREE, ignore_errors=True)
    (TREE / "scripts").mkdir(parents=True)
    (TREE / "web").mkdir(parents=True)
    shutil.copy2(REPO / "scripts" / "check_js_tokens.py", TREE / "scripts")
    for p in list((REPO / "web").glob("*.js")) + list((REPO / "web").glob("*.css")):
        shutil.copy2(p, TREE / "web" / p.name)
    shutil.copy2(REPO / "web" / "index.html", TREE / "web" / "index.html")

    # the slip: a new module imported with no cache token at all
    (TREE / "web" / "newmod.js").write_text("export const x = 1;\n", encoding="utf-8")
    app = TREE / "web" / "app.js"
    app.write_text("import { x } from './newmod.js';\n" + app.read_text(encoding="utf-8"),
                   encoding="utf-8")

    spec = importlib.util.spec_from_file_location("probe_tokens2",
                                                  TREE / "scripts" / "check_js_tokens.py")
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    guard.ROOT = TREE
    guard.WEB = TREE / "web"
    guard.SELF = TREE / "scripts" / "check_js_tokens.py"

    tree = guard.load_web_modules(TREE / "web")
    print("modules the guard looks at:", sorted(tree.tokens))
    print("'newmod.js' seen by the guard:", "newmod.js" in tree.tokens)
    print("scan() findings:", guard.tree_problems(tree, guard.load_baseline()))
    shutil.rmtree(TREE, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
