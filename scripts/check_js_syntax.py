"""Parse every shipped web module and authored/baked core module with Node.

Usage: python scripts/check_js_syntax.py [--path web/app.js]
Exit 0: all modules parse; exit 1: syntax failure; exit 2: infrastructure or CLI
failure. Missing Node, denied process creation or unwritable scratch files are
hard failures, never a skip.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
from scripts.scratchspace import scratch_dir

# The planner's authored flat modules.
ROOTS = [REPO / "web"]

# ... plus the shared core and its baked copies, which are scanned RECURSIVELY:
# `core/` is the authored source and `<app>/core/<hash>/` are byte-for-byte copies
# the browser loads, so a syntax error in any of them ships (TO-06).
CORE_ROOTS = [REPO / "core", REPO / "web" / "core"]

# never shipped / never ours (a --path can point at one of these by accident)
IGNORED_DIRS = {"node_modules", "whale", "dev"}

# Disposable runs under ignored logs/.scratch; persistent lock metadata is tiny.
SCRATCH_PREFIX = "js-syntax-"
CAPTURE_NAME = "node.out"

LINE_RE = re.compile(r"^(?P<file>.+?):(?P<line>\d+)$", re.M)
ERROR_RE = re.compile(
    r"^(?P<kind>(?:Syntax|Type|Range|Reference)?Error):\s*(?P<msg>.+?)\s*$",
    re.M)


# --------------------------------------------------------------------------
# discovery
# --------------------------------------------------------------------------
def _ignored(path: Path, base: Path) -> bool:
    if path.name.endswith(".min.js"):
        return True
    # relative to the scan root AND to the repo: `--path <repo>/web/node_modules`
    # must stay ignored even though node_modules IS that scan root
    for root in (base, REPO):
        try:
            rel = path.resolve().relative_to(root.resolve())
        except (OSError, ValueError):
            continue
        if any(part in IGNORED_DIRS for part in rel.parts[:-1]):
            return True
    return False


def discover(root: Path) -> list[Path]:
    """`*.js` in `root` plus `root/js/*.js` if it exists - the discovery shape
    the sibling checkers use. Non-recursive by design: only shipping modules."""
    if root.is_file():
        return [] if _ignored(root, root.parent) else [root]
    if not root.is_dir():
        return []
    found = sorted(root.glob("*.js"))
    jsdir = root / "js"
    if jsdir.is_dir():
        found += sorted(jsdir.glob("*.js"))
    return [p for p in found if not _ignored(p, root)]


def discover_tree(root: Path) -> list[Path]:
    """Every `*.js` UNDER `root`, recursively.

    The baked core trees live one level down (`<root>/<hash>/*.js`), which the
    flat `discover()` cannot see - the scope gap TO-06 recorded."""
    if not root.is_dir():
        return []
    return [p for p in sorted(root.rglob("*.js")) if not _ignored(p, root)]


def collect(paths: list[str]) -> list[Path]:
    """Modules for the given CLI paths ([] = the default ship set)."""
    if not paths:
        files: list[Path] = []
        for root in ROOTS:
            files += discover(root)
        for root in CORE_ROOTS:
            files += discover_tree(root)
        return list(dict.fromkeys(files))
    files = []
    for raw in paths:
        files += discover(Path(raw))
    # one module can be named twice (e.g. --path web --path web/app.js)
    return list(dict.fromkeys(files))


def shown(path: Path) -> str:
    """Repo-relative posix path when possible, absolute otherwise."""
    try:
        return path.resolve().relative_to(REPO).as_posix()
    except (OSError, ValueError):
        return path.as_posix()


# --------------------------------------------------------------------------
# node
# --------------------------------------------------------------------------
def find_node() -> str | None:
    return shutil.which("node")


def node_usable(node: str) -> str:
    """'' when node runs here, else the reason it cannot be used."""
    try:
        proc = subprocess.run([node, "--version"],
                              stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, timeout=60)
    except OSError as exc:                    # blocked spawn / broken install
        return str(exc)
    except subprocess.TimeoutExpired:
        return "node --version timed out"
    return "" if proc.returncode == 0 else f"node --version exited {proc.returncode}"


def _rewrite(text: str, tmp: Path, label: str) -> str:
    """Node reports the temp copy; print the module that actually ships."""
    for form in (tmp.as_uri(), str(tmp), tmp.name):
        text = text.replace(form, label)
    return text


def check_one(node: str, src: Path, scratch: Path, index: int,
              capture: Path) -> tuple[bool, str]:
    """Copy `src` to a temp `.mjs` (so `import`/`export` are legal to parse)
    and let node check it. Returns (ok, one-line message)."""
    tmp = scratch / f"{index:03d}_{src.name}.mjs"
    label = shown(src)
    tmp.write_bytes(src.read_bytes())
    try:
        # node's diagnostics go to a FILE, never a pipe: piped stdio is denied
        # in the sandbox ("Zugriff verweigert" / WinError 5)
        with open(capture, "w", encoding="utf-8", errors="replace") as fh:
            proc = subprocess.run([node, "--check", str(tmp)],
                                  stdout=fh, stderr=subprocess.STDOUT,
                                  cwd=str(scratch), timeout=120)
    finally:
        tmp.unlink(missing_ok=True)
    if proc.returncode == 0:
        return True, ""
    text = _rewrite(capture.read_text(encoding="utf-8", errors="replace"),
                    tmp, label)
    err = ERROR_RE.search(text)
    line = LINE_RE.search(text)
    where = f"{label}:{line.group('line')}" if line else label
    if err:
        return False, f"{where}: {err.group('kind')}: {err.group('msg')}"
    first = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
    return False, f"{where}: {first or f'node exited {proc.returncode}'}"


# --------------------------------------------------------------------------
# cli
# --------------------------------------------------------------------------
def parse_args(argv: list[str]) -> list[str]:
    """Paths to check; [] means the default ship set."""
    paths: list[str] = []
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg in ("-p", "--path"):
            i += 1
            if i >= len(argv):
                raise ValueError("--path needs a directory or file argument")
            paths.append(argv[i])
        elif arg in ("-h", "--help"):
            print(__doc__.strip())
            raise SystemExit(0)
        elif arg.startswith("-"):
            raise ValueError(f"unknown option {arg!r}")
        else:
            paths.append(arg)               # a bare path works too
        i += 1
    return paths


def main(argv=None) -> int:
    """argv=None -> the default ship set (that is how check_js.py embeds it,
    and it deliberately does NOT read the embedding process's sys.argv)."""
    argv = list(argv) if argv is not None else []
    try:
        paths = parse_args(argv)
    except SystemExit as exc:                       # --help
        return int(exc.code or 0)
    except ValueError as exc:
        print(f"check_js_syntax: {exc}")
        return 2

    if paths:
        missing = [p for p in paths if not Path(p).exists()]
        if missing:                     # a typo must not pass as "clean"
            for raw in missing:
                print(f"check_js_syntax: no such file or directory: {raw}")
            return 2

    files = collect(paths)
    if not files:
        print("check_js_syntax: no js modules found - nothing to check")
        return 0

    node = find_node()
    if not node:
        # TO-03: the repo rule is "a missing node is a HARD failure, never a skip"
        # (AGENTS.md, the same rule as a browser that cannot launch). Returning 0
        # let the aggregate check_js.py report OK while the only JS *parser* in the
        # bundle did nothing.
        print("check_js_syntax FATAL: node is not installed - the JS syntax check "
              "cannot run")
        return 2
    reason = node_usable(node)
    if reason:
        print(f"check_js_syntax FATAL: cannot run node ({reason})")
        return 2

    errors = 0
    checked = 0
    try:
        with scratch_dir('js-syntax') as scratch:
            capture = scratch / CAPTURE_NAME
            for i, src in enumerate(files):
                try:
                    ok, detail = check_one(node, src, scratch, i, capture)
                except (OSError, subprocess.TimeoutExpired) as exc:
                    print(f"SYNTAX  {shown(src)}: cannot check: {exc}")
                    errors += 1
                    continue
                checked += 1
                if not ok:
                    print(f"SYNTAX  {detail}")
                    errors += 1
    except OSError as exc:
        print(f"check_js_syntax FATAL: scratch creation/cleanup failed ({exc})")
        return 2
    print(f"checked {checked} js module(s), {errors} syntax error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
