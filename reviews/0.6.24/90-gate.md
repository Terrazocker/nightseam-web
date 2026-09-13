# t9 gate (round 1) — review of `REVIEW-0.6.24.md` against the charter

> **SUPERSEDED — round-2 verdict:** the binding gate for the delivered report is
> `reviews/0.6.24/80-report-review.md` (task t11, verdict **`pass`**, revision 6 pinned).
> This file archives the round-1 gate (revision 2, `needs_revision`) and its
> revision-pinning addendum; both of its findings are closed by the t10 repair.

Gate owner: **review-lead** (task t9, attempt `d9c2f839-a6d3-47ca-bdb9-e44e323c5b34`).

**Gate snapshot (pinned):** `reviews/0.6.24/REVIEW-0.6.24.md` **revision 2**, 437 lines,
67 286 B, mtime 2026-09-12 22:55:49, sha256
`3C93F328B04BA42CEBBC0F911608F2F6F4AFA2D71F874C4A065859C8DCDBF95B`.
The file grew from 367 to 437 lines while this gate ran (the integrator was still
finalising); both findings below were **re-verified against revision 2**, and every
citation in §2 is to a source file, not to report line numbers, so it is unaffected.
Supporting: `70-verification.md` (959 lines) + `07-findings.json` (42 findings,
1 merged, 12 carry-over rows, 15 refuted sub-claims — parsed and counted).
Charter: `reviews/0.6.24/00-charter.md`.

**VERDICT: `needs_revision`** — two report-integrity defects (GATE-01, GATE-02). The
evidence base itself held up under independent spot-checking: nine cited sites opened,
four carry-over rows re-checked against their pinning files, the guards re-run green.

---

## 1. Clause-by-clause charter check

| Charter clause | Result |
| --- | --- |
| §1 scope — subject pinned to `9596878`; in-scope trees only; no production writes | PASS. Revision + `git status --porcelain` = `?? .agent-teams/` + `?? reviews/` at gate time; `git diff --stat` empty. |
| §2 standards priority (invariants > reference anchors > README/contracts > parity) | PASS. Invariants and the anchors decide; `core_fixtures.json` is treated as drift-only, never as correctness authority. |
| §3 evidence bar — file:line at every site, quoted rule, trigger, repro-or-static marker, impact, falsifier | PASS on every citation I opened (nine, below); each ranked row carries a repro command or a numbered read chain, and the genuinely static-only rows carry the marker. |
| §3 drop-never-downgrade, no silent omission | PASS. 0 findings refuted; 15 refuted sub-claims logged in Appendix A; all 42 filed rows present in report and JSON. |
| §3.1 static-only rows excluded from the ranked list | **FAIL — GATE-01.** The §7/Appendix B preamble says its rows are "not admitted to the severity-ranked list", yet five of them are ranked in §3. |
| §4 ID scheme, one ID per defect, XL merged | PASS. `XL-02` = `CO-02`+`TO-01` merged once with both ids preserved; no other duplicate; ids unique. |
| §5 severity scale by impact, concrete ladder | **PARTIAL — GATE-02.** All bands are defensible except one: `PY-04`'s corruption case was never assessed against the `blocker` definition. |
| §6 all 12 carry-over rows resolved with evidence | PASS. 12 rows, none closed, 1 high / 2 medium / 9 low; the four rows I re-checked against pinning files match; the `TL5` and `DS4` wording corrections are correct. |
| §7 coverage minimums / coverage honesty | PASS. §5.1/5.2 state real limits (no browser, no build/release execution, no live network); §5.4/§5.5 correct the record including the false H5 premise from my charter. No lane claimed a file it had not opened in anything I checked. |
| §9 read-only rule + attestation | PASS. No tracked file modified; guards re-run green (§2 #10). |
| §10 t7/t8/t9 contracts | t7: verdict table, refutation log, unranked section present (its §6 scope defect is GATE-01). t8: ranked findings with verdicts, coverage matrix, carry-over table, refutation summary, limits, attestation — all present. |

## 2. Independent spot-checks (my own reads, not the lanes')

| # | Report claim | Opened | Result |
| --- | --- | --- | --- |
| 1 | `PY-04`: `float()` accepts non-finite and no finiteness gate guards the FITS path | `app/fits.py:103-110` (`_parse_value` → `float(v)`), `:121` (`parse_ra_hours` → `float(s)`), `app/server.py:194-200` (`_finite`), `app/ingest.py:121-122/291-292` | MATCH. `_finite` is applied only to API-boundary fields (`server.py:399/464-466/592-594/609`), never to FITS header numbers. |
| 2 | `DE-01`: add path misses `loadNight()` | `static/js/setup.js:216` = `await refreshCatalogMeta(); renderCustomList(); renderTargets();`; grep `loadNight` → `:55/332/338` (+`scheduleLoadNight:171`) | MATCH; no reload on the add path, siblings reload. |
| 3 | `DE-03`: mode switch empties a stroke-less stored profile | `static/js/pano.js:148-157` (clears profile/profile_top → `recomputeProfile()` → `scheduleSave(0)`), twin `:167-175`; web twin `web/horizon.js:1331-1336` | MATCH; the web twin only flips `paintMode` (mask rebuild + commit, no profile clearing). |
| 4 | `CO-01`/`CR3`: fill gate per-bin left edge vs scorer gate continuous azimuth | `core/horizon.js:107-110` (`if (rel > fov) continue`, `rel = ((i*0.5 - azOff) % 360 + 360) % 360`), `:399-404` (`d = ((azDeg - azOff)+360)%360; if (d > fov)`), desktop `static/js/pano.js:680-688` | MATCH; with `azOffset=0.06`, bin 0's `rel = 359.94 > fov` → sentinel while the scorer admits `d ≤ fov` and reads that sentinel column. |
| 5 | `XL-01`: the tag carries stale tokens; the fix is post-tag | `git grep "?v=" v0.6.24 -- web/index.html web/app.js` → `59` + `astro 9/horizon 40/webstore 19/format 16/nightrank 6`; HEAD → `60` + `10/41/20/17/7`; `git tag --contains 208f7d6` empty; `git log v0.6.24..HEAD` = `9596878`, `208f7d6` | MATCH, including the cited `web/index.html:211`. |
| 6 | `TO-07`/`TL5`: behind = WARNING, ahead = ERROR | `scripts/check_release.py:587-591` (ahead → ERROR), `:592-597` (behind → WARNING) | MATCH; the "not a hard error" record correction is right. |
| 7 | `TO-11`: the encoding guard walks the untracked review workspace | `scripts/check_encoding.py:28-30` (`SKIP_TOP` has no `reviews`), `:54` (`rglob`) | MATCH. |
| 8 | `TO-10`/`TS7` and `XL-02` pins | `tests/js/core_fixtures.mjs:24` (`has()` gate), `tests/test_core_fixtures.py:56-58` (`pytest.skip`), `scripts/check_core.py:123-125` (`dirs != [hash_]`), `scripts/build_core.py:96-100` (rmtree) | MATCH. |
| 9 | `DS4` carry-over reopened | `static/js/planning_client.js:256` (`ceilAt(az[base+i])`, worker's r1-rounded azimuth) vs `:407` (`ceilAt(z)`, raw sync azimuth) | MATCH; overturning the lane's "CLOSED" is justified. |
| 10 | §5.3 "verified guard hand-off state" (encoding OK, check_js OK) | re-ran both at gate time | MATCH: `check_encoding: OK` exit 0; `check_js: OK` exit 0 (the 10 `check_js_defs` candidates are the always-exit-0 heuristic). `evidence/captain-deploy-check.md` exists. |

Carry-over rows checked directly against their pinning files: `CR3`, `TL5`, `TS7`,
`DS4`, plus the `XL-02` citations — past the required two.

Count audit: §1.1's totals reconcile with §3.1/§3.2/§3.3, with the new
production/hardening split (25 + 16 = 41) and with the JSON mirror.

---

## 3. Gate findings (repair required)

### GATE-01 — medium — Appendix B declares ranked findings to be "not ranked"

*Report sections (revision 2):* §7 Appendix B preamble (line 388) and its rows
(lines 393-398); source of the wording: `70-verification.md` §6.

Five rows listed there are ranked in the report: `DE-01` (§3.1 #5, high), `DE-03`
(§3.1 #2, high), `WE-03`, `WE-04`, `TO-08` (§3.3, low). A reader of Appendix B would
conclude the review's #2 and #5 high findings are unranked — the opposite of §1.2 and
§3.1. Only `CO-04` is genuinely unranked.

*Required fix:* rescope the appendix (both files) so the "not ranked / not admitted to
the severity-ranked list" preamble covers exactly the genuinely unranked rows
(`CO-04`), and move the ranked rows' commentary into a clearly labelled evidence-depth
table (`Ranked? = yes` column) or into §5.2. While there, align the DE-band count in
`70-verification.md` §6 to `2 high / 3 medium / 10 low` (the report already uses the
right numbers and flags the mismatch).

### GATE-02 — medium — `PY-04`'s severity was never tested against the `blocker` definition

*Report sections (revision 2):* §1.1 (line 51, "No `blocker`-severity finding was
admitted. The only blocker candidate, `XL-01` …"), §1.3, and the same headline in
`70-verification.md` §1.

`PY-04` is described in the same report as "the library-corrupting ingest path": a
user-reachable ingest leaves `inf` in the DB and every later `/api/library` and
`/api/library/imports` request 500s. The charter's `blocker` band is "…in a
user-reachable path; causes data loss/corruption". No lane or verifier assessed
`PY-04` against `blocker`, so the headline rests on an incomplete check.

*Required fix:* in §1.1 (and the verification summary if it keeps the sentence), either
promote `PY-04` to `blocker` with the ladder citation, or record one line explaining
why the corruption stays at `high` (e.g. only the newly ingested frame and its own rows
are affected, no pre-existing library data is destroyed, the rows are removable). No
other row's severity needs to change.

---

## 4. Process notes (no repair required)

- The report's §8 methods note now explains the removed old-name duplicate copies
  (`04-desktop.md` etc.); all canonical contract paths exist and `40-desktop.md` is
  authoritative. Clerical only.
- Charter seed H5 was false; the report corrected it in §5.4/§5.5 instead of filing it —
  correct per the charter (seeds are not findings).
- Gate method: read-only (`read`/`grep`/`git` queries, one JSON parse, two guard runs that
  write nothing into the tree). `git status --porcelain` at gate time =
  `?? .agent-teams/` + `?? reviews/`.
- **Deliverable naming:** `90-gate.md` stays canonical; `80-report-review.md` holds a
  one-line pointer to it (per the captain's instruction), so the two paths can never
  diverge. The gate itself added no other artifact under `reviews/0.6.24/`.

---

## 5. Revision-pinning addendum (added after the captain's revision-policy guidance)

**The r1 verdict above gates `REVIEW-0.6.24.md` revision 2** — 437 lines, 67 286 B,
sha256 `3C93F328B04BA42CEBBC0F911608F2F6F4AFA2D71F874C4A065859C8DCDBF95B`,
mtime 2026-09-12 22:55:49. That revision no longer exists on disk.

**Current artifact when this addendum was written:** revision 4 — 495 lines, 74 003 B,
sha256 `34A53543…`, mtime 23:00:13; `70-verification.md` 69 783 B `8800AB2E`;
`50-tests-tooling.md` 68 000 B `C4D32682`; `07-findings.json` 43 121 B `E893B8F0`
(stable throughout, the anchor the report now cites). The report then moved **again** to
73 872 B / `C2F04863…` (mtime 23:00:37) while this addendum was being written, which
confirms the artifact was still unsettled. The repair round (t10) was still
running and the integrator was still writing, so the artifact is not yet settled: the
**binding verdict is issued under t11 against the settled revision**, with fresh
size+sha256 pins at that time.

**Delta re-check against revision 4** (the items the captain named):

- §1.1 counts unchanged: 42 filed / 41 unique, 6 high / 10 filed–9 unique medium /
  26 low; carry-over 0 closed / 12 open (1 high, 2 medium, 9 low).
- `XL-01` framing unchanged and correct: high, not blocker, with the deploy refutation
  (`app.js?v=60`, live `app.js` sha256 `30F61EE3…D24623` byte-identical to HEAD).
- `DE-03`/`WE-02` framing unchanged and correct: two ranked high findings, no winner,
  owner ruling required before either is repaired (§3.4), with the twin adjudications
  in §3.5.
- Revision note: the header now reads "Revision 4 — adopts a revision policy instead of
  frozen lane-file hashes (§8)… anchors `07-findings.json` (`E893B8F0…`)", and §8
  carries the "as of" note. **This is the correct fix for the stale-hash risk** — the
  frozen table is gone, the stable anchor is named, and post-verification evidence-row
  refreshes are recorded as a process fact that changed no finding id, severity or
  verdict. No finding on this item.
- **Both t9 gate findings are still present in revision 4:** GATE-01 (§7 line 423 and
  its rows) and GATE-02 (§1.1 line 51 / §1.3 line 92). They must be fixed by the repair
  round or t11 fails on them.
