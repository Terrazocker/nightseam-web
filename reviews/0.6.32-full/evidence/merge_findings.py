"""Merge the lane reports into findings.json (review tooling, not product code).

Parses every `reviews/0.6.32-full/<nn>-<lane>.md` lane report written by a lane
reviewer and emits one JSON document plus a warning list for anything that does
not parse.

Lane reports are LLM-written and drift, so the parser is deliberately tolerant of
the shapes actually observed:
  * `- file:line: ...`            (colon inside the key)
  * `- `path/a.py:12`, `b.js:3``  (a bare file-reference bullet, no key)
  * `- impact / mechanism: ...`   (two canonical fields joined by a slash)
  * `- impact: ...` / `- requiredFix: ...` (the canonical shape)
  * wrapped continuation lines
Anything still unrecognized is reported with its line number rather than dropped,
and every finding is checked for the fields the review's own evidence standard
demands.

    python reviews/0.6.32-full/evidence/merge_findings.py [--json OUT]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REVIEW = ROOT / "reviews" / "0.6.32-full"

HEAD = re.compile(
    r"^###\s+(?P<id>[A-Za-z]{2,4}-\d+)\s+"
    r"(?P<sev>blocker|high|medium|low|nit)\s+"
    r"(?P<verdict>CONFIRMED|SUSPECTED)\s*[-:]?\s*(?P<title>.*)$",
    re.IGNORECASE,
)
KEYVAL = re.compile(r"^([A-Za-z][A-Za-z ]*(?:\s*/\s*[A-Za-z][A-Za-z ]*)*)\s*:\s*(.*)$")
FILELINE = re.compile(r"^file(?::line)?\s*:\s*(.*)$", re.IGNORECASE)
SECTION = re.compile(r"^##\s+(?P<name>.+?)\s*$")
FIX_INLINE = re.compile(r"\s(?:requiredFix|required fix|fix)\s*:\s*", re.IGNORECASE)
# One bullet may pack several fields inline:
#   "- `a/b.py:12` - impact: ... requiredFix: ... - counterArgument: ..."
#   "- evidence (`log.txt`): ..."        (parenthetical label)
INLINE_KEY_ALT = (
    r"(?:file|impact|mechanism|evidence|repro|requiredFix|required fix|fix|"
    r"counterArgument|counter argument|note)"
)
INLINE_KEY = re.compile(
    r"(?:^|(?<=[\s\-]))"
    r"(" + INLINE_KEY_ALT + r"(?:\s*/\s*" + INLINE_KEY_ALT + r")*)"
    r"\s*(?:\([^)]*\))?\s*:\s*",
    re.IGNORECASE,
)
LEAD_KEY = re.compile(r"^(file|files|repro|reproduction)\b[:\s]\s*(.*)$", re.IGNORECASE)


def split_inline(body: str) -> list[tuple[str | None, str]]:
    """Split a bullet into (canonical key | None, text) segments.

    A None key marks the fragment before the first recognized field marker - for
    the lanes that write "- `path:line` - impact: ..." that fragment is the file
    reference. A slash-joined key pair ("impact / mechanism:") yields one segment
    per key with the same text.
    """
    marks = list(INLINE_KEY.finditer(body))
    if not marks:
        return [(None, body)]
    segs: list[tuple[str | None, str]] = []
    if marks[0].start() > 0:
        segs.append((None, body[:marks[0].start()]))
    for idx, m in enumerate(marks):
        end = marks[idx + 1].start() if idx + 1 < len(marks) else len(body)
        text = body[m.end():end]
        keys = [norm_key(q) for q in m.group(1).split("/")]
        if keys and all(keys):
            for k in keys:
                segs.append((k, text))
        else:
            segs.append((None, m.group(1) + ": " + text))
    return segs
PATHLIKE = re.compile(
    r"[\w./\\-]+\.(?:py|js|mjs|css|html|json|md|ps1|spec|ini|txt|csv|yml|yaml|gitignore)"
    r"(?::\d+)?",
    re.IGNORECASE,
)

CANON = {
    "file": "file", "files": "file", "location": "file", "locations": "file",
    "impact": "impact", "effect": "impact",
    "mechanism": "mechanism", "cause": "mechanism", "why": "mechanism",
    "evidence": "evidence", "proof": "evidence",
    "repro": "repro", "reproduction": "repro", "steps": "repro", "reproduce": "repro",
    "requiredfix": "requiredFix", "fix": "requiredFix",
    "counterargument": "counterArgument", "counter": "counterArgument",
    "regression": "regression", "confidence": "confidence",
    "severity": "severityNote", "note": "note", "notes": "note",
    "doc": "doc", "reality": "reality", "context": "file",
    "test": "evidence", "tests": "evidence", "measured": "evidence",
}

REQUIRED = ["file", "impact", "mechanism", "evidence", "repro", "requiredFix", "counterArgument"]

# Captain's adversarial re-verification of every blocker/high finding, recorded
# verbatim from evidence/verify/VERIFICATION.md. These are the only findings the
# captain reproduced personally rather than accepting from a lane.
CAPTAIN_VERIFIED = {
    "PY-01": (
        "UPHELD as blocker. Independently reproduced with a different "
        "construction (evidence/verify/verify_py01_captain.py, public API only): "
        "route 200 {\"ok\":true}; files 2 -> 1; destination EXPTIME 60.0 -> 120.0; "
        "two rows aliasing NGC 7000/2026-08-22_2314/lights/Light_001.fit. "
        "Counter-argument defeated: app/ingest.py:88-89 uniquifies to _2 for "
        "ingest, so the rename-merge overwrite contradicts the module's own rule, "
        "and no safety copy covers library edits."
    ),
    "UI-01": (
        "UPHELD as high. Reproduced by the captain in two independent browser "
        "passes (different scripts): docW 548 at 320/360/400/480, clean at 600+. "
        "Mechanism read from CSS: .topbar-right has no flex-wrap "
        "(web/style.css:72) with a nowrap child (style.css:74); dome hides that "
        "child below 900 px (themes.css:341)."
    ),
}


def norm_key(k: str) -> str | None:
    k = k.strip().lower().rstrip(".")
    return CANON.get(k) or CANON.get(k.replace(" ", ""))


def looks_like_file(body: str) -> bool:
    if len(body) > 400:
        return False
    # a bare backticked citation such as "`.gitignore:11-23` (...)" - the
    # extension list below cannot match a leading-dot filename
    if body.lstrip().startswith("`") and re.search(r":\d+", body):
        return True
    if not PATHLIKE.search(body):
        return False
    head = body.lstrip("`* ").split(":")[0].lower()
    if head.startswith(("impact", "evidence", "repro", "required", "counter", "mechanism")):
        return False
    return True


def parse_report(path: Path) -> tuple[list[dict], list[str], dict]:
    findings: list[dict] = []
    warnings: list[str] = []
    refuted: list[str] = []
    not_checked: list[str] = []
    lines = path.read_text(encoding="utf-8").splitlines()
    cur: dict | None = None
    section = ""
    last_key: str | None = None

    def assign(key: str, val: str) -> None:
        nonlocal last_key
        val = val.strip()
        if not val:
            return
        cur[key] = (cur[key] + "; " + val).strip("; ") if cur.get(key) else val
        last_key = key

    def flush() -> None:
        nonlocal cur, last_key
        if cur is None:
            return
        # A compacted lane report may fold the fix into the tail of another
        # field ("... repro: <steps>. requiredFix: <fix>"). Move it back, keeping
        # the text verbatim - the parser relocates, it never rewrites.
        if not cur.get("requiredFix"):
            for k in list(cur):
                if k in ("id", "severity", "verdict", "title", "lane", "_line"):
                    continue
                mm = FIX_INLINE.search(cur[k])
                if mm and mm.start() > 30:
                    tail = cur[k][mm.end():].strip()
                    if tail:
                        cur["requiredFix"] = tail
                        cur[k] = cur[k][:mm.start()].strip()
                        break
        missing = [f for f in REQUIRED if not cur.get(f)]
        if missing:
            # recorded per finding so findings.json is self-documenting about
            # which prose field a lane omitted (relocated/absent, never invented)
            cur["missingFields"] = missing
            warnings.append(f"{path.name}:{cur['_line']} {cur['id']} missing {', '.join(missing)}")
        cur.pop("_line", None)
        if cur["id"] in CAPTAIN_VERIFIED:
            cur["captainVerification"] = CAPTAIN_VERIFIED[cur["id"]]
        findings.append(cur)
        cur = None
        last_key = None

    for i, raw in enumerate(lines, 1):
        s = raw.strip()

        m = HEAD.match(s) if s.startswith("###") else None
        if m:
            flush()
            cur = {
                "id": m.group("id").upper(),
                "severity": m.group("sev").lower(),
                "verdict": m.group("verdict").upper(),
                "title": m.group("title").strip().strip("-:").strip(),
                "lane": path.stem,
                "_line": i,
            }
            continue
        if s.startswith("###"):
            # a sub-heading such as "### Cross-referenced, NOT filed" ends the
            # current finding; the prose under it is not part of any finding
            flush()
            section = s.strip("# ").strip().lower()
            continue

        sm = SECTION.match(raw)
        if sm:
            flush()
            section = sm.group("name").strip().lower()
            continue

        if cur is None:
            if s.startswith(("-", "*")):
                item = f"[{path.stem}] " + s.lstrip("-* ").strip()
                if section.startswith("refuted"):
                    refuted.append(item)
                elif section.startswith("not checked"):
                    not_checked.append(item)
            elif section.startswith("not checked") and s:
                not_checked.append(f"[{path.stem}] {s}")
            continue

        if not s:
            last_key = None
            continue

        if s.startswith(("-", "*")):
            body = re.sub(r"^[-*]\s+", "", s).strip()
            # a lane may bold the key ("**impact**: ...") - normalise that to the
            # plain "impact: ..." shape before matching keys
            norm = re.sub(r"^\*\*(.+?)\*\*\s*:?", r"\1:", body).strip()
            for key, text in split_inline(norm):
                text = text.strip(" -").strip()
                if not text:
                    continue
                if key == "doc":
                    # docs lane cites "doc: <doc path> vs reality: <code path>"
                    assign("file", text)
                    assign("doc", text)
                    continue
                if key:
                    assign(key, text)
                    continue
                # fragment before the first marker: usually the file reference,
                # or a colon-less "repro <cmd>"
                lm = LEAD_KEY.match(text)
                if lm:
                    assign(norm_key(lm.group(1)) or "repro", lm.group(2))
                    continue
                fm = FILELINE.match(text)
                if fm and (PATHLIKE.search(fm.group(1)) or "`" in fm.group(1)):
                    assign("file", fm.group(1))
                    continue
                if looks_like_file(text):
                    assign("file", text)
                    continue
                km = KEYVAL.match(text)
                if km:
                    # a lane may join two canonical fields with a slash:
                    # "impact/mechanism: ..." or "impact / mechanism: ..."
                    parts = [q.strip() for q in km.group(1).split("/")]
                    keys = [norm_key(q) for q in parts]
                    if keys and all(keys):
                        for k in keys:
                            assign(k, km.group(2))
                        continue
                    label = km.group(1).strip().rstrip(":").strip()
                    # A compacted report may carry a whole sub-note as its own
                    # bullet ("Cross-lane note ...", "Settling the prior probe
                    # ..."). Keep it verbatim in `notes` rather than polluting the
                    # previous field.
                    if len(label) > 22 or any(w in label.lower() for w in
                                              ("note", "settling", "disclosure", "cross-lane")):
                        assign("notes", text)
                        continue
                    warnings.append(
                        f"{path.name}:{i} unrecognized bullet key {km.group(1)!r} in {cur['id']}")
                if last_key:
                    cur[last_key] = (cur[last_key] + " " + text).strip()
                else:
                    warnings.append(
                        f"{path.name}:{i} unattached bullet in {cur['id']}: {text[:60]!r}")
            continue

        if last_key:
            cur[last_key] = (cur[last_key] + " " + s).strip()
        else:
            warnings.append(f"{path.name}:{i} unattached line in {cur['id']}: {s[:60]!r}")

    flush()
    return findings, warnings, {"refuted": refuted, "not_checked": not_checked}


# Findings that are true statements but are NOT product defects: coverage limits
# of the review. Moved out of the findings list (and out of the severity counts)
# into `reclassified`, keeping the text.
RECLASSIFIED = {
    "DE-03": (
        "Coverage gap, not a defect: the packed dist/NightSeam.exe and the "
        "browser gate could not run inside that lane's sandbox (named/overlapped "
        "pipes, ENVIRONMENT.md:37-77) - an environment limit of the review. The "
        "captain ran scripts/check_browser.py from an escalating session instead; "
        "see gate.md."
    ),
}


# Findings the core lane PROVED but did not number: two are prose inside CO-07's
# block / the "Not checked" section, one is a cross-lane note the owning lane
# never filed. Recovered by the captain so the record is complete. Each is
# attributed; nothing here is invented - the text is condensed from the lane's own
# report and, for CO-10, verified by the captain by reading the cited lines.
RECOVERED_FINDINGS = [
    {
        "id": "CO-08", "lane": "20-core", "severity": "medium", "verdict": "CONFIRMED",
        "recoveredFrom": "20-core.md 'Not checked' section, lines 253-261 (a reproduced "
                         "delegate medium that was never given a finding number)",
        "title": "an aggressive panorama-band crop re-rasterizes scaled strokes at the "
                 "original brush radius, growing unpainted columns until a Blocked target "
                 "reads as Observable",
        "file": "`web/horizon.js:1267` -> `core/horizon.js:398-408` -> `cropStrokes:355-369`",
        "impact": "cropping a panorama to a narrower band scales the existing strokes but "
                  "keeps the original brush radius, so widening the visible azimuth per "
                  "pixel leaves gaps in the painted band. Measured at the default brush "
                  "r=28: 11 of 91 in-frame bins lost, and a column that was "
                  "{\"code\":\"blk\",\"text\":\"Blocked\"} (ceil 37.10) becomes "
                  "{\"code\":\"vis\",\"text\":\"Observable\"} (ceil -90). A target the user "
                  "marked as blocked by an obstacle is then planned as observable - the "
                  "same class of silent safety inversion the panorama editor exists to "
                  "prevent.",
        "mechanism": "`cropStrokes` transforms stroke geometry into the new frame but does "
                     "not scale the brush radius with the horizontal scale factor, so the "
                     "stroke mask no longer covers the band it covered before the crop.",
        "evidence": "`node reviews/0.6.32-full/evidence/core/probe_moneyshot.mjs` -> "
                    "`lost 11 of 91 in-frame bins; first hole az 52 / alt 30 BEFORE "
                    "{\"code\":\"blk\",\"text\":\"Blocked\"} ceil 37.10 / AFTER "
                    "{\"code\":\"vis\",\"text\":\"Observable\"} ceil -90`.",
        "repro": "`node reviews/0.6.32-full/evidence/core/probe_moneyshot.mjs` (reachable "
                 "while `p.strokes` is non-empty).",
        "requiredFix": "scale the rasterization brush radius by the same horizontal factor "
                       "applied to the stroke geometry in `cropStrokes`, then re-derive the "
                       "profile - or refuse a crop that would thin the painted band below "
                       "the brush pitch.",
        "counterArgument": "a real pointer drag paints densely enough that a user may never "
                           "produce the gap, and the lane did not build the end-to-end "
                           "browser scenario with a realistic pitch, so the practical "
                           "frequency is unmeasured. The mechanism and the Blocked -> "
                           "Observable transition are both reproduced, which is what makes "
                           "this a finding rather than a suspicion.",
    },
    {
        "id": "CO-09", "lane": "20-core", "severity": "low", "verdict": "CONFIRMED",
        "recoveredFrom": "20-core.md lines 177-195 (the 'Scoring/catalogue delegate "
                         "digest', prose rather than a numbered finding)",
        "title": "type lookups use plain object literals, so a crafted `otype` of "
                 "`\"toString\"` reaches `Object.prototype` and defeats the fallback",
        "file": "`core/catalog.js:10-25`, `core/scoring.js:15-19,29`, `static/js/skymap.js:204`",
        "impact": "a setup bundle carrying `otype: \"toString\"` survives the import "
                  "(`app/database.py:986` stores it verbatim) and every `X[t] || fallback` "
                  "returns an inherited `Object.prototype` member instead of falling back: "
                  "the type cell renders native function source and the moon-aware score "
                  "becomes `NaN`.",
        "mechanism": "`TYPE_LABELS`, `TYPE_COLORS` and `MOON_TYPE_FACTOR` are object "
                     "literals, so a key that collides with `Object.prototype` is truthy "
                     "before the `||` fallback is reached.",
        "evidence": "`core/catalog.js:10-25`, `core/scoring.js:15-19,29`, "
                    "`static/js/skymap.js:204`; `app/database.py:986` stores `otype` verbatim.",
        "repro": "import a bundle whose custom/panorama record carries `otype: \"toString\"`, "
                 "then open the object's type cell and enable moon-aware ranking.",
        "requiredFix": "`Object.assign(Object.create(null), {...})` for the three maps (or "
                       "`Object.hasOwn` before the lookup) plus a `|| \"unknown\"` at "
                       "`static/js/skymap.js:204`.",
        "counterArgument": "every in-app producer clamps `otype`, so the worst case is "
                           "garbled text plus a ranking key that is never rendered; the lane "
                           "notes the calibration should rise if setup bundles are treated as "
                           "untrusted, which this review does treat them as.",
    },
    {
        "id": "CO-10", "lane": "20-core", "severity": "low", "verdict": "CONFIRMED",
        "recoveredFrom": "20-core.md lines 205-208, a cross-lane note the web lane never "
                         "filed; verified by the captain at the cited lines",
        "title": "the web sky chart excludes no-magnitude ADVANCED rows at every slider "
                 "position, contradicting the shared magnitude rule",
        "file": "`web/app.js:869-870` (comment stating the rule at `:862-867`)",
        "impact": "`base.filter((o) => o._adv && o.vmag != null && magVisible(...))` drops "
                  "every advanced object without a measured magnitude unconditionally, so "
                  "those objects never reach the Sky View chart - not even with the "
                  "magnitude slider at its maximum, where the documented rule says they "
                  "should appear. The 9 batch-2 supplement objects (0.6.29) deliberately "
                  "ship `vmag` empty and are advanced-mode-only, so the newest additions "
                  "cannot be plotted; the Targets list still shows them, which is the "
                  "workaround.",
        "mechanism": "the standard branch at `:869` uses only `magVisible(o.vmag, S.skyMag, "
                     "magMax)` (which admits no-magnitude rows at the maximum), while the "
                     "advanced branch at `:870` adds an explicit `o.vmag != null` guard "
                     "before it - the extra guard is what breaks parity.",
        "evidence": "`web/app.js:868-872` read by the captain; the comment at `:865-867` "
                    "states \"Objects with no measured magnitude show only at the slider "
                    "maximum\", and `AGENTS.md` pins the rule as filtering EVERY object. "
                    "No test covers the advanced branch (the `mag` engine tests the shared "
                    "helper, not this call site).",
        "repro": "open the web planner in advanced mode, set the target list's "
                 "magnitude/visibility controls to maximum, and look for a `vmag`-empty "
                 "object (e.g. `sh2-240`) on the Sky View chart - it is in the Targets "
                 "table but absent from the chart. Static reading of `:868-872` is "
                 "sufficient to confirm; the browser run was not repeated for this item.",
        "requiredFix": "drop the extra `o.vmag != null` guard so the advanced branch uses "
                       "the same `magVisible(o.vmag, S.skyMag, magMax)` call as the "
                       "standard branch (the 1400-object brightness cap can stay).",
        "counterArgument": "the guard may be a deliberate responsiveness bound for the "
                           "advanced pool, and the comment's \"additionally capped at 1400 "
                           "by brightness\" shows intent to restrict that branch - but the "
                           "cap alone would not require excluding no-magnitude rows, and "
                           "nothing in `AGENTS.md` or a test declares this exception, so it "
                           "is an undocumented divergence rather than a stated policy.",
    },
    {
        "id": "TR-12", "lane": "captain-gate", "severity": "low", "verdict": "CONFIRMED",
        "recoveredFrom": "captain's gate run (filed by the captain; no lane ran the gate)",
        "title": "the desktop pano-crop browser check still times out on a cold first "
                 "launch, even after the post-tag 30 s -> 90 s wait fix",
        "file": "`tests/browser/desktop_suite.py` (the crop check's upload wait); post-tag "
                "commit d6ace7a 'browser gate: the desktop crop check's upload wait is "
                "flaky at 30 s'",
        "impact": "`python scripts/check_browser.py --all` reports 21/22 with "
                  "`desktop-pano-crop-fov` failing at 91.9 s, while an immediate re-run of "
                  "the same check passes in 3.0 s. Whoever runs the documented release "
                  "checklist on a cold machine gets a red gate and must know the re-run "
                  "rule to tell a flake from a regression - which is exactly what a release "
                  "gate exists to remove.",
        "mechanism": "the PyInstaller onefile exe unpacks into %TEMP% on first launch; after "
                     "the 14 web checks have just run, that first desktop launch exceeds the "
                     "check's 90 s `wait_for_function`. Raising the wait from 30 s (d6ace7a) "
                     "moved the threshold without removing the cold-start dependency, and the "
                     "cold path is now measured at ~92 s - above the new limit.",
        "evidence": "`python scripts/check_browser.py --all` -> `[FAIL] desktop "
                    "desktop-pano-crop-fov (91.9s)` / `TimeoutError: "
                    "Page.wait_for_function: Timeout 90000ms exceeded` / `check_browser: "
                    "21/22 passed` (exit 1); immediately afterwards `python "
                    "scripts/check_browser.py --desktop --only pano-crop` -> `[PASS] desktop "
                    "desktop-pano-crop-fov (3.0s)`, `1/1 passed`. The other 21 checks passed "
                    "in the same run.",
        "repro": "clear the PyInstaller unpack cache (%TEMP%\\_MEI*) or use a cold machine, "
                 "run `python scripts/check_browser.py --all`, then re-run the single check "
                 "immediately - fail then pass.",
        "requiredFix": "warm the exe once before the timed checks (a `--version` or boot "
                       "smoke on its own, outside the wait), or set that wait above the "
                       "measured 91.9 s cold start, so a red gate means a real regression.",
        "counterArgument": "ENVIRONMENT.md and AGENTS.md document the cold-start re-run rule, "
                           "so a maintainer is expected to know it, and the check itself is "
                           "correct - it passes. That makes this maintenance noise rather "
                           "than a product defect, hence low.",
    },
    {
        "id": "UI-05", "lane": "55-ui-visual", "severity": "medium", "verdict": "CONFIRMED",
        "recoveredFrom": "vision-routed visual pass (3 agents on "
                         "deepseek/deepseek-v4-flash-vision-exp reading the 18 screenshots); "
                         "captain traced the CSS mechanism",
        "title": "the classic theme renders the panorama editor's Name field and PAINT "
                 "select as native WHITE boxes on a dark panel",
        "file": "`web/horizon.js:507` (`#pano-name`), `web/horizon.js:617` (`#ed-mode`) vs "
                "`web/themes.css:194-196` and `web/style.css:427,516`",
        "impact": "in Classic the editor's Name input and PAINT select are bright white "
                  "rectangles with dark text on the dark navy panel - the brightest objects "
                  "on the page. The app is used dark-adapted beside a telescope, so this is "
                  "a glare source exactly where the user is working, and it is a same-width "
                  "inconsistency: at 1366 the dome shot has both controls dark with light "
                  "text (`web-dome-horizon-1366.png` vs `web-classic-horizon-1366.png`).",
        "mechanism": "`web/themes.css:194-196` is a broad dome-only rule "
                     "(`html[data-theme=\"dome\"] input:not([type=\"range\"]):not([type=\"checkbox\"]), "
                     "html[data-theme=\"dome\"] select`). The base stylesheet styles text "
                     "inputs and selects only through narrow class-scoped selectors "
                     "(`web/style.css:427` `.btnrow`, `:516` `.top-prefs`, `:288` `.cat-bar`, "
                     "`:47-51` `.planner-controls`). `#pano-name` and `#ed-mode` match none of "
                     "them, so Classic falls through to user-agent form styling while dome is "
                     "rescued by its broad rule.",
        "evidence": "three vision agents independently: 'the classic theme's NATIVE WHITE text "
                    "input and paint-mode select ... a bright glare source at night', and "
                    "'bright WHITE box with dark text ... unstyled browser controls rather than "
                    "themed inputs' (`web-classic-horizon-360.png`); Name x~106-221, PAINT "
                    "x~57-256 in the 1366 shot.",
        "repro": "switch to Classic, open Horizon & Obstacles, and look at the Name field and "
                 "the PAINT select.",
        "requiredFix": "add the missing controls to the base rules, e.g. `#pano-name, #ed-mode "
                       "{ background: var(--panel); border: 1px solid var(--line); color: "
                       "var(--txt); }` in `web/style.css`, or move dome's broad rule into the "
                       "base stylesheet and keep only overrides in the theme. `style.css?v=21` "
                       "must be bumped in the same commit.",
        "counterArgument": "AGENTS.md calls Classic 'a flat fallback, not a second design "
                           "language', so it is allowed to look plainer - but a fallback that "
                           "emits an unthemed white control is unstyled, not plain, and the "
                           "identical controls are correct in the default theme.",
    },
    {
        "id": "UI-06", "lane": "55-ui-visual", "severity": "low", "verdict": "CONFIRMED",
        "recoveredFrom": "vision-routed visual pass (horizon set)",
        "title": "the panorama editor legend promises a green alt-0 horizon guide that is not "
                 "drawn, and keys none of the painted state",
        "file": "the legend text rendered by `web/horizon.js` vs the canvas drawn via "
                "`core/horizon.js`",
        "impact": "the legend reads 'Guides: amber = azimuth (N/E/S/W), green dashed = horizon "
                  "(alt 0), blue = altitude', but no green pixels exist on the canvas in either "
                  "theme or width; the alt-0 position coincides with the plot's bottom border in "
                  "the same blue as the frame, so the horizon line is indistinguishable from the "
                  "frame. The legend also explains only the guides: there is no key for the "
                  "blocked band colour and none for the assumed-open hatch, so a user cannot "
                  "decode blocked vs open sky from the editor itself.",
        "mechanism": "the legend enumerates three guide colours; the alt-0 guide is drawn at the "
                     "plot edge where it visually merges with the frame, and the band/hatch fills "
                     "are not listed in the key.",
        "evidence": "`web-dome-horizon-1366.png` and `web-classic-horizon-1366.png` - 'no green "
                    "pixels present'; the legend quoted verbatim by the vision agent.",
        "repro": "open Horizon & Obstacles at 1366 and look for the green dashed alt-0 line, then "
                 "read the legend.",
        "requiredFix": "draw the alt-0 guide in the legend's green (distinct from the frame) or "
                       "correct the legend, and add blocked-band and assumed-open entries to the "
                       "key.",
        "counterArgument": "nothing is painted in any captured screenshot (a blank panorama), so "
                           "the band/hatch entries may appear only once a mask exists and I could "
                           "not capture that state. The green-guide mismatch is independent of "
                           "that and was observed in a clean state.",
    },
    {
        "id": "UI-07", "lane": "55-ui-visual", "severity": "low", "verdict": "CONFIRMED",
        "recoveredFrom": "vision-routed visual pass (horizon set)",
        "title": "the panorama editor's zoom cluster is drawn over the chart, covering the top "
                 "gridline and the 300 deg region",
        "file": "`web/horizon.js:680-683` (`ed-zoom-out` / `ed-zoom-label` / `ed-zoom-in` / "
                "`ed-fit`)",
        "impact": "the '- 1.0x + Fit' pill overlays the plot's top-right corner at both 1366 and "
                  "360, crossing the border and covering the top gridline and the region where "
                  "the 300 deg guide runs; at 360 the pill spans roughly a third of the canvas "
                  "width, hiding the area a user would paint near 300-360 deg.",
        "mechanism": "the cluster is positioned over the canvas rather than outside it, and its "
                     "box is not excluded from the painted region.",
        "evidence": "`web-dome-horizon-1366.png` (pill x~1170-1300, y~836-872; plot top border "
                    "y~840), `web-classic-horizon-1366.png` (same), `web-dome-horizon-360.png` "
                    "(pill covers about a third of a ~330x160 canvas).",
        "repro": "open the editor and look at the canvas's top-right corner at 1366 and 360.",
        "requiredFix": "move the cluster above or below the canvas, or reserve space so it never "
                       "overlaps paintable area.",
        "counterArgument": "it is a floating control and small at 1366; at 360 it is not small, "
                           "but the guides stay usable and nothing is lost permanently - hence "
                           "low.",
    },
    {
        "id": "UI-08", "lane": "55-ui-visual", "severity": "low", "verdict": "CONFIRMED",
        "recoveredFrom": "vision-routed visual pass (all three sets independently)",
        "title": "the Rig select and the Weather chip truncate mid-word at every tested width, "
                 "including where there is free space",
        "file": "`web/index.html:32-34` (`#rigSelect`; `max-width: 170px` at `web/style.css:55`, "
                "110px in dome at `web/themes.css:331`) and `web/index.html:55-57` (`#btnWeather` "
                "/ `#wxChip`)",
        "impact": "the Rig select shows 'None - no frame cove' or 'None - no frame co' - cut "
                  "mid-word with no ellipsis, so the user never sees 'coverage'. The Weather chip "
                  "shows 'Weather - cl...' at 320, 360, 768, 900 and 1366, i.e. even with the "
                  "whole toolbar row empty beside it, reducing the condition word (the reason to "
                  "look at the chip) to two letters at every width.",
        "mechanism": "both controls have a fixed max-width smaller than their own content, and "
                     "the chip's truncation is its own width rather than the row's.",
        "evidence": "reported in eight separate screenshots across both themes "
                    "(`web-dome-tonight-320/360/768`, `web-classic-tonight-320/360/768`, "
                    "`web-dome-tonight-900`, `web-dome-horizon-360`); 'the truncation is a fixed "
                    "chip width, not a lack of room'.",
        "repro": "load the planner at any width and read the two topbar controls.",
        "requiredFix": "let both controls size to their content (raise max-width, or use "
                       "`text-overflow: ellipsis` with a `title`) and check the chip's own width "
                       "rather than the row's.",
        "counterArgument": "both carry `title=` tooltips, so the text is reachable on hover - but "
                           "not on touch and not at a glance at night, and a mid-word cut with no "
                           "ellipsis reads as a rendering fault.",
    },
    {
        "id": "UI-09", "lane": "55-ui-visual", "severity": "low", "verdict": "CONFIRMED",
        "recoveredFrom": "vision-routed visual pass (compact set)",
        "title": "classic at 320 garbles the Min alt row and lets target rows overflow their card",
        "file": "shared topbar markup `web/index.html:38-43` under the classic stylesheet; target "
                "rows `.pick li` (`web/style.css:236`)",
        "impact": "at 320 Classic breaks the label into 'Min' / 'alt' and the value into '25' / "
                  "'auto (bortle)' on separate lines with the slider pushed aside, while dome at "
                  "the same 320 renders the identical row on one line. Classic's target rows also "
                  "run past their section card to the page edge with the altitude values drawn on "
                  "the card's right border, which dome does not do at those widths.",
        "mechanism": "the base stylesheet has no narrow-width rules for the min-alt row and no "
                     "inline-size constraint on `.pick li`; the width comes from the content "
                     "rather than the card.",
        "evidence": "two vision agents independently with coordinates: label stacked at y~270-305, "
                    "card right border ~x=300 while the row band runs to x=548 "
                    "(`web-classic-tonight-320.png`, `web-classic-tonight-360.png`).",
        "repro": "Classic theme at 320 and 360 px.",
        "requiredFix": "give the min-alt row the same wrap/shrink rules at narrow widths in the "
                       "base stylesheet and constrain `.pick li` to the card's inline size; the "
                       "same base-stylesheet gap causes UI-01, so fixing that properly likely "
                       "fixes this too.",
        "counterArgument": "320 px is the narrowest phone still in use and Classic is the fallback "
                           "theme - but the cause is shared with UI-01, which is a high finding.",
    },
]


def subject() -> dict:
    """Revision under review, recorded next to the findings for traceability."""
    import subprocess

    def git(*args: str) -> str:
        try:
            return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                                  text=True, timeout=20).stdout.strip()
        except Exception:
            return ""

    return {
        "describe": git("describe", "--tags", "--always"),
        "head": git("log", "-1", "--format=%h %s"),
        "tracked_tree": git("status", "--porcelain") or "clean",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=str(REVIEW / "findings.json"))
    args = ap.parse_args()

    reports = sorted(p for p in REVIEW.glob("*.md")
                     if not p.name.startswith(("00-", "REVIEW-", "gate", "55-")))
    if not reports:
        print("no lane reports found", file=sys.stderr)
        return 2

    all_findings: list[dict] = []
    warnings: list[str] = []
    refuted: list[str] = []
    not_checked: list[str] = []
    for p in reports:
        f, w, extra = parse_report(p)
        all_findings.extend(f)
        warnings.extend(w)
        refuted.extend(extra["refuted"])
        not_checked.extend(extra["not_checked"])
        print(f"{p.name}: {len(f)} findings, {len(w)} warnings")

    ids = [f["id"] for f in all_findings]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        warnings.append(f"duplicate finding ids across lanes: {', '.join(dupes)}")

    for extra in RECOVERED_FINDINGS:
        all_findings.append(dict(extra))

    # The core lane's delegate digest reports the WEB-side mirror of the desktop
    # search defect; the lane itself asked for a merge rather than a second id.
    for f in all_findings:
        if f["id"] == "CD-02":
            f["crossReference"] = (
                "Web-side mirror, merged here rather than filed twice: "
                "`core/catalog.js:36-40` + `web/build_web.py:31-34` - `searchBlob` never "
                "indexes the row's `search` column and the web payload does not ship it, so "
                "25 rows are findable on the desktop but not on the web by common name "
                "(reported by the core lane's catalogue delegate, "
                "`('tarantula' -> [\"ngc2070\"] desktop vs [] web)`). Fix both together: add "
                "`search` to `build_web.py::COLS` (with a `CATALOG_TOKEN` bump) and to "
                "`searchBlob`."
            )

    reclassified = []
    for f in list(all_findings):
        if f["id"] in RECLASSIFIED:
            all_findings.remove(f)
            f["reclassReason"] = RECLASSIFIED[f["id"]]
            reclassified.append(f)
            not_checked.append(f"[{f['lane']}] {f['id']} (filed by the lane, "
                               f"reclassified by the captain): {RECLASSIFIED[f['id']]}")

    counts = {"total": len(all_findings)}
    for sev in ("blocker", "high", "medium", "low", "nit"):
        counts[sev] = sum(1 for f in all_findings if f["severity"] == sev)
    counts["confirmed"] = sum(1 for f in all_findings if f["verdict"] == "CONFIRMED")
    counts["suspected"] = sum(1 for f in all_findings if f["verdict"] == "SUSPECTED")
    counts["refuted"] = len(refuted)

    doc = {
        "review": "NightSeam 0.6.32 full review",
        "generated_by": "reviews/0.6.32-full/evidence/merge_findings.py",
        "subject": subject(),
        "counts": counts,
        "findings": all_findings,
        "reclassified": reclassified,
        "refuted": refuted,
        "not_checked": not_checked,
        "parse_warnings": warnings,
    }
    Path(args.json).write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(counts, indent=1))
    if warnings:
        print(f"\n{len(warnings)} parse warnings:", file=sys.stderr)
        for w in warnings[:40]:
            print("  " + w, file=sys.stderr)
    print(f"\nwrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
