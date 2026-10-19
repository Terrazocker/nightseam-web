"""Heuristic review of function identifiers in web modules.
Reports candidates, not hard failures. The import/syntax guards are authoritative.

A call `name(...)` is a candidate when `name` is not declared, imported, a
parameter, a destructured binding, a method definition or a known global in
the same module. Comments, strings, template text and regex literals are
blanked first, keeping line breaks so reported lines match the file.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

JS_DIR = Path(__file__).resolve().parents[1] / "web"

BUILTINS = {
    # language
    "Math", "JSON", "Date", "Number", "String", "Boolean", "Array", "Object",
    "Symbol", "BigInt", "RegExp", "Error", "TypeError", "RangeError",
    "Set", "Map", "WeakMap", "WeakSet", "Promise", "Proxy", "Reflect",
    "isNaN", "isFinite", "parseFloat", "parseInt", "structuredClone",
    "encodeURIComponent", "decodeURIComponent", "queueMicrotask",
    "ArrayBuffer", "DataView", "Float32Array", "Float64Array", "Int8Array",
    "Int16Array", "Int32Array", "Uint8Array", "Uint8ClampedArray",
    "Uint16Array", "Uint32Array", "TextEncoder", "TextDecoder",
    "undefined", "null", "true", "false", "this", "super",
    # keywords that precede a parenthesis
    "if", "for", "while", "return", "new", "typeof", "await", "async",
    "catch", "switch", "case", "function", "export", "import", "const",
    "let", "var", "class", "void", "delete", "yield", "with", "in", "of",
    "instanceof",
    # browser, window and worker scope
    "document", "window", "self", "globalThis", "navigator", "console",
    "location", "history", "performance", "crypto", "screen", "indexedDB",
    "localStorage", "sessionStorage", "fetch", "alert", "confirm", "prompt",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback",
    "cancelIdleCallback", "getComputedStyle", "matchMedia", "postMessage",
    "addEventListener", "removeEventListener", "dispatchEvent", "atob", "btoa",
    "Blob", "File", "FileReader", "FormData", "URL", "URLSearchParams",
    "Headers", "Request", "Response", "AbortController", "Image",
    "ImageData", "OffscreenCanvas", "createImageBitmap", "Worker",
    "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "PointerEvent",
    "ResizeObserver", "IntersectionObserver", "MutationObserver",
    "DOMParser", "DOMRect", "DOMMatrix", "Path2D", "MediaStreamTrackProcessor",
    "RelativeOrientationSensor", "AbsoluteOrientationSensor",
    "DeviceOrientationEvent", "DeviceMotionEvent", "VideoFrame",
}

IDENT = r"[A-Za-z_$][\w$]*"
DECL_RE = re.compile(r"\b(?:function\s*\*?|class|const|let|var)\s+(" + IDENT + ")")
IMPORT_RE = re.compile(r"""import\s*\{([^}]+)\}\s*from|import\s+(\w+)\s+from|import\s+\*\s+as\s+(\w+)""")
# `let a = 1, b` / `const {a, b: c} =` / `const [a, b] =`
DECL_LIST_RE = re.compile(r"\b(?:const|let|var)\s+([^;\n]*)")
FUNC_PARAMS_RE = re.compile(r"\bfunction\b\s*\*?\s*(?:" + IDENT + r")?\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)")
ARROW_PARAMS_RE = re.compile(r"\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*=>|(" + IDENT + r")\s*=>")
CATCH_RE = re.compile(r"\bcatch\s*\(\s*(" + IDENT + r")\s*\)")
# `name(args) {` at a line start or after `{`/`,`: a method definition;
# `get name(` / `set name(` likewise.
METHOD_RE = re.compile(r"(?:^|[{,])\s*(?:static\s+)?(?:async\s+)?\*?(" + IDENT + r")\s*\([^()\n]*\)\s*\{", re.M)
ACCESSOR_RE = re.compile(r"\b(?:get|set)\s+(" + IDENT + r")\s*\(")
CALL_RE = re.compile(r"(?<![\w.$])(" + IDENT + r")\s*\(")

# A `/` after one of these starts a regex literal, not a division.
_REGEX_BEFORE = set("(,=:[!&|?{};+-*%<>~^") | {""}
_REGEX_KEYWORDS = {"return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await"}


def blank(text: str) -> str:
    """Replace comments, string and template text and regex literals with
    spaces, keeping every newline and the code inside `${...}`."""
    out = list(text)
    i, n = 0, len(text)
    stack = []          # template-literal nesting: brace depth per `${`
    depth = 0
    prev = ""           # last significant code token, for regex detection

    def clear(a, b):
        for k in range(a, b):
            if out[k] != "\n":
                out[k] = " "

    while i < n:
        ch = text[i]
        if ch == "/" and text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            clear(i, j); i = j; continue
        if ch == "/" and text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            clear(i, j); i = j; continue
        if ch in "'\"":
            j = i + 1
            while j < n and text[j] != ch and text[j] != "\n":
                j += 2 if text[j] == "\\" else 1
            clear(i, min(j + 1, n)); i = j + 1; prev = "str"; continue
        if ch == "`" or (ch == "}" and stack and depth == stack[-1]):
            if ch == "}":
                stack.pop()
            j = i + 1
            while j < n and text[j] != "`" and not text.startswith("${", j):
                j += 2 if text[j] == "\\" else 1
            if j < n and text.startswith("${", j):
                clear(i, j); stack.append(depth); i = j + 2; prev = "("; continue
            clear(i, min(j + 1, n)); i = j + 1; prev = "str"; continue
        if ch == "/" and (prev in _REGEX_BEFORE or prev in _REGEX_KEYWORDS):
            j, cls = i + 1, False
            while j < n and text[j] != "\n":
                c = text[j]
                if c == "\\":
                    j += 2; continue
                if c == "[":
                    cls = True
                elif c == "]":
                    cls = False
                elif c == "/" and not cls:
                    break
                j += 1
            if j < n and text[j] == "/":
                j += 1
                while j < n and (text[j].isalpha()):
                    j += 1
                clear(i, j); i = j; prev = "str"; continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        if ch.isalnum() or ch in "_$":
            j = i
            while j < n and (text[j].isalnum() or text[j] in "_$"):
                j += 1
            prev = text[i:j]; i = j; continue
        if not ch.isspace():
            prev = ch
        i += 1
    return "".join(out)


def _split_top(text: str, sep: str) -> list[str]:
    parts, depth, start = [], 0, 0
    for k, c in enumerate(text):
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == sep and depth == 0:
            parts.append(text[start:k]); start = k + 1
    parts.append(text[start:])
    return parts


def _bindings(fragment: str) -> set:
    """Names bound by a parameter list or declaration target: defaults are
    dropped, `{ key: name }` binds `name`, nested patterns are followed."""
    names = set()
    for part in _split_top(fragment, ","):
        depth = 0
        for k, c in enumerate(part):            # cut the default at the first top-level `=`
            if c in "([{":
                depth += 1
            elif c in ")]}":
                depth -= 1
            elif (c == "=" and depth == 0 and part[k + 1:k + 2] not in ("=", ">")
                  and part[k - 1:k] not in ("=", "!", "<", ">")):
                part = part[:k]
                break
        part = re.split(r"\s+(?:of|in)\s+", part)[0]       # for (const k of list)
        part = part.strip().lstrip(".").strip()
        if part[:1] in ("{", "[") and part[-1:] in ("}", "]"):
            inner = part[1:-1]
            if part[0] == "{":
                inner = ",".join(_split_top(p, ":")[-1] for p in _split_top(inner, ","))
            names |= _bindings(inner)
        elif re.fullmatch(IDENT, part):
            names.add(part)
    return names


def known_names(code: str) -> set:
    names = set(BUILTINS)
    for rx in (DECL_RE, CATCH_RE, METHOD_RE, ACCESSOR_RE):
        names.update(m.group(1) for m in rx.finditer(code))
    for m in IMPORT_RE.finditer(code):
        if m.group(1):
            for part in m.group(1).split(","):
                names.add(part.strip().split(" as ")[-1].strip())
        names.update(g for g in (m.group(2), m.group(3)) if g)
    for m in DECL_LIST_RE.finditer(code):
        names |= _bindings(m.group(1))
    for m in FUNC_PARAMS_RE.finditer(code):
        names |= _bindings(m.group(1))
    for m in ARROW_PARAMS_RE.finditer(code):
        names |= _bindings(m.group(1)) if m.group(1) is not None else {m.group(2)}
    return names


def candidates(text: str) -> list[tuple[int, str]]:
    code = blank(text)
    names = known_names(code)
    found, seen = [], set()
    for m in CALL_RE.finditer(code):
        ident = m.group(1)
        if ident in names or ident in seen:
            continue
        seen.add(ident)
        found.append((code.count("\n", 0, m.start()) + 1, ident))
    return found


def main(argv: list[str] | None = None) -> int:
    root = Path(argv[0]) if argv else JS_DIR
    problems = 0
    for f in sorted(root.glob("*.js")):
        for line, ident in candidates(f.read_text(encoding="utf-8")):
            print(f"{f.name}:{line}: possibly undefined '{ident}()'")
            problems += 1
    print(f"check_js_defs: {problems} candidate(s)" if problems else "check_js_defs: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
