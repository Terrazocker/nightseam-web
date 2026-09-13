# t11 gate — round-2 review of `REVIEW-0.6.24.md` against the charter

Gate owner: **review-lead** (task t11, attempt `1e329e1a-e5a3-4978-b0b1-24fc630c27b8`).

## VERDICT: `pass`

**Gate snapshot (pinned).**

| | file | bytes | sha256 (first 8) | lines | mtime |
| --- | --- | --- | --- | --- | --- |
| gate START | `REVIEW-0.6.24.md` | 78 864 | `1DD737F2…` | 544 | 23:03:49 (revision 5) |
| gate CLOSE | `REVIEW-0.6.24.md` | **79 130** | **`323159B2…`** | **547** | **23:05:55 (revision 6 + §7 sentence fix)** |

The file moved **twice** during the gate. **Delta re-checked at both steps**: revision 6
(78 864 → 79 014 B) is the integrator's "t11 pre-gate tidy of the two optional nits" (the
lane-file provenance note moved out of §5.4 into §8; the header/§8 §7.6 wording
disambiguated); the second write (79 014 → 79 130 B) corrected §7's sentence about the
verification file's orphan row, which the verifier had already removed. The repaired sections
(§1.1, §1.3, §7) and the ranked tables were re-read at each revision; **no finding id,
severity, verdict, count or ranking changed** — confirmed against the stable anchor
`07-findings.json` (43 121 B / `E893B8F0…`, unchanged since 22:51:08 across every round).

Supporting documents at gate close: `70-verification.md` 71 292 B / `1B145CFC…`;
lane files `00-charter` `9CA5E756`, `10-python` `BFB42EB2`, `20-core` `7118CF60`,
`30-web` `9FEA24EE`, `40-desktop` `14A85BA7`, `50-tests-tooling` `C4D32682`.

---

## 1. Clause-by-clause charter check

| Charter clause | Result |
| --- | --- |
| §1 scope — subject pinned to `9596878`; in-scope trees only; no production writes | PASS. Header pins revision + tree state; `git status --porcelain` at close = `?? .agent-teams/` + `?? reviews/`, `git diff --stat` empty. |
| §2 standards priority (invariants > reference anchors > README/contracts > parity) | PASS, unchanged from round 1. |
| §3 evidence bar — file:line at every site, quoted rule, trigger, repro-or-static marker, impact, falsifier | PASS on every citation opened this round (below); ranked rows carry repro commands or numbered read chains; static-only rows carry the marker *and* are explicitly accounted for in §7.2 / verification §6. |
| §3 drop-never-downgrade; no silent omission | PASS. 0 findings refuted; 15 refuted sub-claims in Appendix A; all 42 filed rows present in report and JSON; `CO-04` is the single deliberate unranked exclusion, labelled. |
| §3.1 static-only excluded from the ranked list | **PASS — GATE-01 closed** (§2 below). |
| §4 ID scheme, one ID per defect, XL merged | PASS. `XL-02` merged once, both ids kept; no other duplicate; the four twin adjudications in §3.5 match t7 §2.1. |
| §5 severity scale by impact | **PASS — GATE-02 closed.** Both blocker candidates assessed explicitly against the ladder; all other bands defensible. |
| §6 all 12 carry-over rows resolved with evidence | PASS. 12 rows, 0 closed (1 high `CR3`, 2 medium `E15`/`PY6`, 9 low); row-for-row identical to `70-verification.md` §4 (item, status, severity, correction); `TL5` and `TS7` pins re-opened this round, `CR3`/`DS4`/`XL-02` pins verified in round 1 on unchanged sources. |
| §7 coverage minimums / coverage honesty | PASS. §5.1/5.2 state the real limits (no browser, no build/release execution, no live network); §5.3 records the guard hand-off; §5.4/§5.5 are corrections/withdrawals; no lane claimed coverage it did not perform. |
| §9 read-only rule + attestation | PASS. No tracked file modified; guards re-run at gate close: `check_encoding: OK` exit 0, `check_js: OK` exit 0 (`check_catalog_token: OK`, `check_core: OK`). |
| §10 t7/t8/t9 contracts | PASS. t7: verdict table, refutation log, corrected §6 accounting. t8/t10: ranked findings with verdicts, coverage matrix, carry-over table, refutation summary, limits, attestation. |

## 2. Gate-finding closure

**GATE-01 (was: Appendix B declared five ranked rows "not ranked") — CLOSED, both halves.**

- Report §7 is now "Appendix B — the unranked finding and the evidence-depth notes": the
  preamble (line 450) states that **exactly one** claim is unranked (`CO-04`), §7.1 holds
  `CO-04` alone, and §7.2 is an evidence-depth table with an explicit **`Ranked?`** column
  (`yes` for `DE-01`…`DE-15`, `WE-03`, `WE-04`, `TO-08`, `XL-01`, each with its section and
  verified severity). The rest of the report's "not ranked / unranked" references now
  attach to `CO-04` only (lines 144, 191, 199, 431, 441, 460).
- Verifier half (`70-verification.md` §6) — **landed and confirmed by me**: the section is
  now "Static-only (reasoning-only) claims — ranked / unranked accounting", it states that
  `static-only` is a *reproduction class*, not a ranking decision, carries the
  "Ranked in the consolidated report?" column, and gives the corrected desktop band count
  **2 high / 3 medium / 10 low**. The `XL-01` orphan duplicate row is **gone** (grep for
  `deploy-order half` returns one occurrence, inside the table at line 830).
- The report also records the fix and its history at lines 471-482.

**GATE-02 (was: `PY-04` never assessed against the `blocker` band) — CLOSED.**

- §1.1 (lines 52-65): "Both blocker candidates were assessed explicitly" — `XL-01` and
  `PY-04`, each with a stated `high, not blocker` reason; the `PY-04` reason cites the
  charter's blocker wording and names the bound (corruption confined to the frame just
  ingested and that frame's own `images`/`import_batches` rows; no pre-existing library data
  destroyed; rows identifiable and removable).
- §1.3 (lines 106-122) repeats the assessment with the same reasoning, and the `PY-04` row
  in §3.1 (line 161) carries the "**High, not blocker**" note with the §1.3 pointer.
- No count, severity or ranking changed; the headline is now supported by an explicit check.

## 3. Independent spot-checks this round

| # | Finding / row | Opened | Result |
| --- | --- | --- | --- |
| 1 | `WE-02` (web keeps a discarded derived profile) | `web/horizon.js:366-371` (`applySnapshot`) | MATCH — restores `azOffset`/`altBottom`/`altTop`/`fov`/`paintMode`/`strokes`/`blockAbove`, **not** the profile; with `snapshotPano` excluding it, the mechanism holds. |
| 2 | `DE-02` (previous panorama's mask drawn) | `static/js/pano.js:459-462`; grep `invalidateMask` | MATCH — mask canvas reused when `width`/`height` match; call sites `72/153/172/194/390/398/660/729`, **none inside `select()` (262-295)**. |
| 3 | `TO-02` (exit-2 contract bypassed) | `tests/browser/harness.py:345-360`, `:391-400` | MATCH — `with sync_playwright()` (:354) sits under a `try` whose only companion is `finally:` (:392), so a driver-start failure escapes as an uncaught exception instead of the documented `return 2`; the guarded blocks are the pre-check (:345-350) and the launch try (:355-360). |
| 4 | `PY-03` (asymmetric validation) | `app/server.py:203-210` (`_check_profile`) | MATCH — validates the profile arrays only (rule shared with the import boundary via `database.profile_values_ok`); no equivalent for `strokes`. |
| 5 | Carry-over `TL5` (WARNING by design) | `scripts/check_release.py:587-597` | MATCH — ahead = `ERROR`, behind = `WARNING`. |
| 6 | Carry-over `TS7` (fixture `has()` gating) | `tests/js/core_fixtures.mjs:24`; `tests/test_core_fixtures.py:56-58` | MATCH — `has()` gate + `pytest.skip` when a section is absent. |

Round-1 citations re-confirmed as still standing (their source files are unchanged — the tree
is clean): `PY-04` (`app/fits.py:103-110/121`; `_finite` only on API-boundary fields),
`DE-01` (`static/js/setup.js:216` vs `:55/332/338`), `DE-03` (`pano.js:148-157/167-175` vs
`web/horizon.js:1331-1336`), `CO-01` (`core/horizon.js:107-110` vs `:399-404` +
`pano.js:680-688`), `XL-01` (tag tokens 59/9/40/19/16/6 vs HEAD 60/10/41/20/17/7; `208f7d6`
post-tag), `TO-07`, `TO-10`, `TO-11`, `DS4` pins. Counts audit: §1.1 (42 filed / 41 unique;
6 high / 10 filed–9 unique medium / 26 low; exposure split 25/12/3/1 = 41) reconciles with
§3.x, §7.2 and `07-findings.json`.

## 4. Non-blocking observation (recorded, no repair required)

1. `REVIEW-0.6.24.md:540` — the artifact-index row still calls this file "(revision 4)" while
   the header (line 8) says **revision 6**; the revision-history row (line 9) is correct and
   complete (1→6, including t9's `3C93F328` = revision 2). Cosmetic self-label drift: it
   claims no hash and no verification basis, and the report's own policy anchors identity on
   `07-findings.json`, so it is not a gate failure. A one-word edit fixes it.

Earlier observation 2 (the §7 sentence claiming an orphan `XL-01` row still sat in
`70-verification.md` §6) was **fixed during this gate**: the sentence now records that the
residue was reported and that "a later verifier pass has since removed it — re-checked, the
orphan is gone", which my own check confirms (exactly one occurrence of `deploy-order half`,
inside the table at `70-verification.md:830`).

## 5. Method and attestation

- Gate method: read-only throughout — `read`/`grep` at the cited lines, read-only `git`
  queries, `Get-FileHash`, and two guard runs that write nothing into the tree
  (`check_encoding.py`, `check_js.py`).
- Read-only attestation at gate close: `git status --porcelain` = `?? .agent-teams/` +
  `?? reviews/`; `git diff --stat` empty. No production file was touched by this gate.
- Superseded material: the round-1 gate (revision 2, `needs_revision`) is archived at
  `reviews/0.6.24/90-gate.md`, which points here for the binding verdict.
