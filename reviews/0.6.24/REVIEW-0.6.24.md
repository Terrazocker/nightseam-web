# NightSeam 0.6.24 — consolidated full review

| | |
| --- | --- |
| **Reviewed revision** | `9596878` (`git describe` = `v0.6.24-2-g9596878`), version line **0.6.24** |
| **Tree state at review** | clean: `git status --porcelain` = `?? .agent-teams/` + `?? reviews/`; `git diff --stat` empty |
| **Review date** | 2026-09-12 |
| **Revision** | 6 — t11 pre-gate tidy of the two optional nits only: the lane-file provenance note moved out of §5.4 into §8 (nothing in §5.4 was a record correction), and the header/§8 §7.6 wording disambiguated. No finding, severity, verdict, count or ranking changed from revision 5 |
| **Revision history** | 1 (59,484 B) → 2 (**67,286 B, `3C93F328…`** — the revision `t9` gated) → 3 (73,397 B — captain's second guidance: re-read of the refreshed `70-verification.md`, §2.1 twin adjudications) → 4 (73,885 B, `D24A6C99…` — captain's revision-policy instruction: lane-file hash table dropped, stable anchor `07-findings.json` adopted) → 5 (78,864 B, `1DD737F2…` — **the `t10` repair: GATE-01 Appendix B rescoped, GATE-02 both blocker candidates assessed**) → **6 (this revision)**. Revisions 3-4 were captain-directed and revision 5 was the gate repair; **no revision after 2 changed any finding id, severity, verdict, count or ranking** — only provenance/gate wording. `t9`'s pin (`3C93F328`) therefore names revision 2, and this note exists so the advance is documented rather than silent |
| **Nature** | **Review only — no production code was changed.** The only files this review adds live under `reviews/0.6.24/`. `app/`, `core/`, `web/`, `static/`, `tests/`, `scripts/` and `landing/` are untouched. |
| **Sources (canonical)** | The six canonical review files — `00-charter.md`, `10-python.md`, `20-core.md`, `30-web.md`, `40-desktop.md`, `50-tests-tooling.md` — plus the adversarial verification `70-verification.md` (authoritative) and its machine-readable mirror `07-findings.json`. **The review records were edited repeatedly while the review ran** (evidence-row refreshes after the verdicts); this report therefore pins the stable anchor `07-findings.json` rather than lane-file hashes — see §8. Where the JSON and the verification document disagree, the document wins. |
| **Audience** | the owner/lead who will decide what to fix. This file is self-contained: no other file needs to be opened to act on any row below. |

**How the findings were produced.** Five independent lane reviews (Python backend, `core/` JS domain,
`web/` shell, `static/` desktop shell, tests/tooling/release) filed 42 findings; an independent
adversarial verification pass attacked each one with the observation that would have refuted it,
re-ranked by impact, and merged one cross-lane duplicate. Evidence labels used throughout: `[t7]` =
first-hand by the verifier of record; `[v-py] [v-core] [v-web] [v-desktop] [v-to]` = the independent
per-lane verification pass. All quoted commands were re-run at HEAD by one of those two levels.

---

## 1. Executive summary

### 1.1 Counts

| | Filed | Unique | high | medium | low |
| --- | --- | --- | --- | --- | --- |
| Findings | **42** | **41** | **6** | **10 / 9 unique** | **26** |
| Verdicts | 42 CONFIRMED, **0 REFUTED** | | 6 re-ranked upward, 1 reclassified static-only/unranked | | |

The 42 filed rows come from five lanes: PY 7, CO 4, WE+XL 5, DE 15, TO 11. One cross-lane duplicate
(`CO-02` ≡ `TO-01`) is merged as **`XL-02`**, so 41 unique findings stand; both lane ids are preserved
in the tables and in `07-findings.json`. The medium count is 10 rows / 9 unique for that same reason.

Carry-over audit (12 documented items): **0 closed, 12 still open** — 1 high (`CR3` ≡ `CO-01`),
2 medium (`E15`, `PY6` ≡ `PY-06`), 9 low. The lanes' `DS4 = CLOSED` was overturned (see §4). Four of
the twelve duplicate a ranked finding (`CR2`≡`CO-04`, `CR3`≡`CO-01`, `PY6`≡`PY-06`); they are not
double-counted above.

**Exposure split of the 41 unique findings:** 25 are production-facing (a shipped shell — desktop or
web), 12 are release/tooling, 3 are documentation drift, 1 (`CO-04`/`CR2`) is static-only and is not
admitted to the ranked list. Of the 6 high findings, 5 are production-facing and 1 (`XL-01`) is a
release-artifact defect.

**Production-facing set (25):** `PY-01`…`PY-07`, `CO-01`, `WE-01`, `WE-02`, `DE-01`…`DE-15`.
**Hardening/tooling set (16):** `CO-03`, `CO-04` (static-only, unranked), `WE-03`, `WE-04`, `XL-01`,
`XL-02`, `TO-02`…`TO-11`. The project's rule that user-reachable findings are treated differently
from hardening items is respected in the ranking: within every severity band the production-facing
rows come first, and no hardening row outranks a production row of a higher band.

**No `blocker`-severity finding was admitted. Both blocker candidates were assessed explicitly.**

- `XL-01` (release artifact) is **high, not blocker**: the tagged tree carries 0.6.23 tokens naming
  0.6.24 bytes and no guard compares bytes to tokens, but the live deploy is **post-fix** (live
  `/astro/index.html` names `app.js?v=60` and live `app.js` is byte-identical to HEAD, sha256
  `30F61EE3…D24623`), so no user received a stale module set. See
  `reviews/0.6.24/evidence/captain-deploy-check.md` and t7's refutation R2 in Appendix A.
- `PY-04` (non-finite FITS numbers) is **high, not blocker**: the charter's blocker band requires
  "data loss/corruption … in a user-reachable path", and this corruption is **bounded to the frame the
  ingest just wrote and to that frame's own `images` and `import_batches` rows — no pre-existing library
  data is destroyed**, the affected rows are identifiable and removable, and the failure is a persistent
  500 on the Library views rather than loss of the user's prior data. It breaks no trust boundary and no
  release-time guarantee; t7 reached the same conclusion ("a blocker reading was considered and
  rejected"). The full reasoning is in §1.3; the severity stays **high** and no other row changes.

### 1.2 The three things most worth fixing

1. **`PY-04` — stop the library-corrupting ingest path (high, production-facing, cheap fix).**
   A FITS header with a non-finite number is accepted. `OBJCTRA/DEC = inf` 500s the ingest with
   nothing written, but `EXPTIME = 1e400` 500s **after** the frame file, the `images` row and the
   `import_batches` row are already persisted with `inf` — after which `/api/library` and
   `/api/library/imports` return 500 on **every** later request and the export emits a bare
   `Infinity` token. `OBJCTRA = nan` returns 200 and silently files the frame under an unrelated
   object. This is persistent, user-reachable, self-inflicted-from-a-normal-file corruption with a
   two-line class of fix.
2. **`DE-01` — rebuild the night plan after a custom target is added (high, production-facing,
   one-line fix).** `static/js/setup.js:216` refreshes the catalog and the list, but never calls
   `loadNight()`, so the target the user just added is missing from Targets, Tonight and Sky and the
   counter reads "197 of 198 · filtered" until an unrelated reload. The app answers the question the
   user just asked with a plan that omits the answer; every sibling mutator already reloads.
3. **`CO-01` — fix the FOV-edge half-bin so a painted band at the frame start cannot read as clear
   sky (high, production-facing, both shells).** `profileFromMask` fills bins by their left edge
   (`rel > fov`), the scorer gates the continuous azimuth (`d > fov`), so whenever `azOffset` is not
   a multiple of 0.5° — the normal outcome of a crop — the frame's first partial bin keeps the mode
   sentinel. In obstacle mode a painted band there scores as visible; in sky mode it reads fully
   blocked. The unsafe direction AGENTS names ("a blocked target look observable"), ≤0.5° of azimuth
   wide. The inlined scorer copy and the desktop re-implementation must change with it.

**Comparable in impact, listed second because they need a decision or a release step first:**
`DE-03` and `WE-02` are mirror images of the panorama-profile invariant — the web keeps a
stale/discarded derived profile when the editable state loses its strokes, the desktop destroys a
stroke-less stored profile and persists canonical sentinels — so the two shells fail the same
AGENTS.md sentence in opposite directions and **cannot both be right**. This report presents both,
picks no winner, and flags an owner ruling (§3.4) as required before either is edited. `XL-01`
(release-artifact) is high because the release order as documented would ship the stale set, but no
user was affected (live deploy is post-fix).

### 1.3 What this review did **not** find

No blocker, no trust-boundary breach (the 18-string adversarial path table, the ZIP traversal
probes and the `image_dir_ignored` contract all hold), and no refuted finding — the 15 refuted
items in Appendix A are sub-claims, mechanisms and evidence lines whose *corrected* form is what the
ranked list states.

**Both blocker candidates were assessed explicitly, and both stay high.**

- **`XL-01`** (release artifact) — **high, not blocker**: the tagged tree carries 0.6.23 tokens naming
  0.6.24 bytes and no guard compares bytes to tokens, but the live deploy is **post-fix** (live
  `/astro/index.html` names `app.js?v=60` and live `app.js` is byte-identical to HEAD, sha256
  `30F61EE3…D24623`), so no wrong artifact reached users. See `evidence/captain-deploy-check.md` and
  Appendix A/R2.
- **`PY-04`** (non-finite FITS headers) — **high, not blocker.** The charter's blocker band requires
  "data loss/corruption … in a user-reachable path"; the corruption here is **bounded to the frame the
  ingest just wrote and to that frame's own `images` and `import_batches` rows — no pre-existing library
  data is destroyed**, the affected rows are identifiable and removable (and the file itself is the one
  just ingested), and the failure mode is a persistent 500 on the Library views rather than loss of the
  user's prior data. It also breaks no trust boundary and no release-time guarantee; t7 reached the same
  conclusion ("a blocker reading was considered and rejected — the required header class is uncommon
  and recovery does not need a reinstall"). It stays **high** and is the first item in §1.2 precisely
  because the user-visible failure is severe, but promoting it would require the blocker band's
  "destroys data the user already had" element, which this does not meet.

---

## 2. How to read the tables

**Severity** is assigned by **impact**, per the charter's ladder (reproduced here so this file stands
alone):

- **blocker** — breaks a release-time guarantee, a trust boundary or a pinned invariant in a
  user-reachable path; data loss/corruption, a security breach, or ships a wrong artifact.
- **high** — user-reachable incorrect behaviour, or a demonstrated contract/invariant violation with
  a plausible trigger, but no data loss or boundary breach.
- **medium** — real defect on a narrow/unusual path, dev- or tooling-only impact, or a user-visible
  boundary case an existing fallback contains.
- **low** — no behavioural impact: hygiene, maintainability, documentation drift, dead code, an
  untested export, a stale comment.

**Exposure** tags used in the tables: `prod` = user-reachable in a shipped shell; `prod (cosmetic)`,
`prod (a11y)`, `prod (perf)` = shipped but bounded to appearance/accessibility/performance;
`release` = release artifact or release pipeline; `tooling` = dev/test guard quality;
`docs` = comment or string drift; `static-only` = confirmed in code but no shipped producer reaches
it — **only `CO-04` carries this tag, and it is the only unranked finding** (§7.1; the other
static-only *evidence* is an evidence-depth matter for findings that are ranked — §7.2). Anything
tagged `prod*` is what the project treats as user-reachable and is flagged accordingly.

**Ranking** is severity first, then impact within the band: data loss or corruption before wrong
output, wrong output before bounded/cosmetic effects, production before tooling. Every row carries
its reproduction command or the read chain that establishes it; the artifacts live under
`reviews/0.6.24/evidence/` and are indexed in §8.

---

## 3. Verified findings, ranked

### 3.1 High (6)

| # | id | sev | exposure | file:line | impact | reproduction evidence | suggested fix direction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **PY-04** | high | prod | `app/fits.py:108` (`float()` in `_parse_value`), `:121` (`parse_ra_hours`); consumers `app/server.py:194-200` (`_finite`), `app/database.py:24-32` | A FITS header with a non-finite number is accepted. `OBJCTRA/DEC = inf` → ingest 500, nothing written. `EXPTIME = 1e400` → ingest 500 **with** the frame file, the `images` row and the `import_batches` row persisted as `inf`; then `/api/library` 500, `/api/library/imports` 500 on every later request, and the export emits a bare `Infinity` token. `OBJCTRA = nan` → 200, frame silently filed under an unrelated object with the catalog's coordinates. **High, not blocker** — the corruption is bounded to the frame just ingested and that frame's own `images`/`import_batches` rows, no pre-existing library data is destroyed, and the rows are removable (§1.3). | `python reviews/0.6.24/evidence/v7-py-nonfinite-probe.py` (exit 0): cases A/B nothing written; case C file + rows with `inf`, then library/imports 500, export 200. Cross-checked by `[v-py]` (`v7-out-ingest.txt`, `v7-py-probe-out.txt`). | Reject non-finite floats where headers are parsed — mirror `server.py::_finite` in `fits.py::_parse_value` / `parse_ra_hours` / `parse_dec_deg` — make the ingest path all-or-nothing so a rejected header cannot leave a file + rows behind, and validate finiteness at the storage boundary before INSERT. |
| 2 | **DE-03** | high | prod | `static/js/pano.js:148-157` (`setPaintMode`), unfiled twin `:167-175` (`undoPaint`), `:652-659` (`recomputeProfile` blank), `:735-737` (`scheduleSave`) | One click on the editor's mode buttons empties `profile`/`profile_top` and persists the canonical blank for a stroke-less (imported/legacy) horizon — in obstacle mode an all-`-90` profile meaning "nothing blocks". It contradicts the pinned invariant "with NO strokes the stored profile/profileTop are AUTHORITATIVE … Deliberate clearing goes through `clearMask()`, the one place", and silently replaces stored user data. The same defect exists at the unfiled twin site `undoPaint:167-175`. | `[v-desktop]` probe S2 (real module under DOM/canvas stubs): a 720×20 record plus one `#modeSky` click produced a 720×90 profile **and the PUT body carried it**; the web twin (`web/horizon.js:1331-1336`) only flips `paintMode`. | In `setPaintMode()`/`undoPaint`, only flip `paintMode` when the record has no strokes and leave the stored profile/profile_top authoritative; reserve profile clearing for `clearMask()`. **Rule on the `DE-03`/`WE-02` conflict (§3.4) first.** |
| 3 | **WE-02** | high | prod | `web/horizon.js:366-371` (`applySnapshot`), `:933-939` (re-derive gate), `:1056-1076` (undo/redo/Revert), `:1077` (`saveSession`), `:1331-1336` (`#ed-mode`), `:359-363` (`snapshotPano`) | Ordinary editor gestures (undo the first stroke, Revert, or create → "Sky band" → Save) leave a discarded or mode-invalid ceiling in the live record while the UI reports `dirty=false` / "Saved"; it survives Save + reload and flips a target's visibility (probe: an object at alt 30 with min-alt 25 flips visible↔not). Plans then follow a ceiling the user removed or that the mode invalidates — the unsafe direction — and it persists (`web/app.js:521 flushHorizonEdits`). | `node reviews/0.6.24/evidence/we-profile-state-probe.mjs` (exit 3): `afterUndo=29.916` where `-90` is expected, `historyDirty=false`; survives `computeProfile`+Save and a reload; `#ed-mode` → sky on a stroke-less record leaves `-90` while the preview says fully blocked. | Make the persisted profile consistent with the editable state the editor presents: either re-derive when the stroke set becomes empty (and include the profile in the dirty/history baseline), or make the stored profile authoritative and show it in the preview. **This row is the mirror of `DE-03` — see §3.4; do not fix either side before the owner rules.** |
| 4 | **CO-01** (`CR3`) | high | prod | `core/horizon.js:109` (fill gate, per-bin left edge) vs `:402` (scorer gate, continuous azimuth); inlined copy `core/scoring.js:148`; desktop re-implementation `static/js/pano.js:683` | The FOV-edge coverage rule keeps the frame's first partial half-degree bin at the mode sentinel. In obstacle mode a painted band there reads "nothing blocks" and `scoreNightTracks` scores it visible; in sky mode it reads "fully blocked". Triggered whenever `azOffset` is not a multiple of 0.5° — the normal outcome of a crop, where `core/horizon.js:313-315` rounds the kept-band edge to 2 dp. Reachable window ≤0.5° of azimuth at the frame start (a `medium` reading is defensible and is recorded, not averaged away). | `node reviews/0.6.24/evidence/v7-verify-co01.mjs`: fov 45, azOffset 0.06 → `prof[0]=-90` (sentinel) while `prof[1]=45` (painted), `ceilFor(0.07/0.28) = -90`, `ceilFor(0.51) = 45`; `v7-co01b/c.mjs` → `scoreNightTracks` `visN=1 pct=50` with all three samples inside the painted band; `v7-co01.out.txt`. | Make the fill gate and the scorer gate use one bin rule — e.g. fill a bin when its azimuth interval overlaps `[0, fov]`, or gate with the same left-edge/floor-index test. Apply in `core/horizon.js`, the inlined copy `core/scoring.js:146-156`, and the desktop re-implementation `pano.js:683`; add a CR3 regression pin. |
| 5 | **DE-01** | high | prod | `static/js/setup.js:216` (add path, no `loadNight()`), consumers `static/js/targets.js:117-135` | Adding a custom target never rebuilds `S.night`, so the target is absent from Targets/Tonight/Sky and the counter reads "197 of 198 · filtered" until an unrelated reload. The app answers "can I see this target tonight?" with a plan that omits it, in every view. Sibling mutators reload (`setup.js:55/332/338`); the delete path survives only because `targets.js:126` skips ids whose metadata is gone. | `[t7]` read both ends: `setup.js:216` = `await refreshCatalogMeta(); renderCustomList(); renderTargets();`; `[v-desktop]` enumerated every `loadNight`/`scheduleLoadNight` call site (none on the add path). | Call `loadNight()` (or `scheduleLoadNight()`) after a successful add, exactly like the sibling mutators; pin it by asserting `S.night` contains the new `u_` id after the add. |
| 6 | **XL-01** | high | release | `web/index.html:211`, `web/app.js` import tokens; fix commit `208f7d6` (post-tag); guard gap `tests/test_cache_tokens.py:40-61` | The `v0.6.24` tag was cut with stale per-module cache tokens (`app.js?v=59`; astro 9 / horizon 40 / webstore 19 / format 16 / nightrank 6) while those modules' bytes changed — a regression introduced by 0.6.24 itself. The bump is a post-tag commit, and no guard compares changed bytes to tokens, so `test_cache_tokens.py` passed (its register and the sources were stale together). A release built from the tag per the documented order would serve returning visitors stale modules. The live deploy is post-fix, so no user was affected. **High, not blocker**: the tagged tree carries 0.6.23 tokens naming 0.6.24 bytes and no guard compares bytes to tokens, but the live deploy is post-fix (live `index.html` names `app.js?v=60`; live `app.js` sha256 `30F61EE3…D24623` is byte-identical to HEAD). | `[t7]`: `git grep -n "?v=" v0.6.24 -- web/index.html web/app.js` → 59/9/40/19/16/6/17 vs HEAD 60/10/41/20/17/7/17; `git tag --contains 208f7d6` empty; `git log --oneline v0.6.24..HEAD` = `9596878`, `208f7d6`; read-only FTP download: live `index.html` names `app.js?v=60` and `sha256(app.js) = 30F61EE3…D24623` is byte-identical to HEAD. Captain's raw checks and byte copies: `reviews/0.6.24/evidence/captain-deploy-check.md`; t7's refutation R2 (Appendix A). | Re-cut the release carrying the corrected tokens, and close the guard gap: make the cache-token check fail when a changed module's bytes and its token were not bumped in the same commit (the `E15` item), so a tag-time miss cannot pass. |

**Why `XL-01` is high and not medium (t7's actual reasoning, verbatim in substance).** The
process-impact re-rank was considered explicitly: since visitor harm is refuted, the only route to a
lower rung is the medium tier's "dev- or tooling-only impact", and t7 **rejected** it because the
failure mode *if the trigger fires* is user-facing (every returning visitor keeps the old module
graph), the violated rule is a **pinned release guarantee** in AGENTS.md, and the **guard suite
passed a tree that breaks it**. Medium would describe today's *observed* harm, not the defect. The
decision to classify the tag-time token drift as a shipped-artifact risk rather than a cosmetic
record error is therefore deliberate and recorded, not an oversight.

### 3.2 Medium (9 unique / 10 filed rows)

| # | id | sev | exposure | file:line | impact | reproduction evidence | suggested fix direction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **PY-01** | medium | prod (crafted bundle) | `app/backup.py:169-198` (both import loops), `app/database.py:854-869` | Two bundle records that normalize to one target silently clobber one file (the first record's bytes are lost) while the DB keeps **two** rows and the restore reports success. The secondary citation in the lane was wrong (`database.py:505-527` is `active_panorama`; `panoramas()` is `:492-503`) — see Appendix A/R3. | `python reviews/0.6.24/evidence/v7_probe_import.py`: `import -> 200 {"images":2,"library_files":2}`, two rows, one file; case-differing rels `a.fit`/`A.FIT` → stored `content -> b'SECOND'` (FIRST gone) with `/api/library total_images=2`. | Deduplicate normalized targets on the import path (skip or reject the second record) and/or add a uniqueness constraint on the image row key; report the dropped duplicate instead of silently winning. |
| 2 | **PY-03** | medium | prod (import boundary) | `app/database.py:826` (storage), `app/server.py:203-210` (asymmetric validation), `database.py:498` (read), consumers `static/js/pano.js:652/670`, `static/js/main.js:161` | The import boundary validates `profile`/`profile_top` but not `strokes`: `{}`, `"abc"`, `7` and `[{}]*700` are stored. `static/js/pano.js:670` then throws `TypeError: v is not iterable` (the `:652` guard misses these shapes), and a hand-written unparsable `strokes` string 500s `/api/state` and `/api/panoramas`, aborting desktop boot. The reachable half (junk values through the bundle/storage boundary) is confirmed; the `PUT` half was refuted (Appendix A/R4). | `v7_probe_import.py`: `strokes {} -> 200` while `profile=[1,2] -> 400`; node `for (const s of {})` → TypeError; malformed stored row → `/api/state 500`. | Validate `strokes` at the import/update boundary with the same fail-closed shape rule as the profile arrays, and make the panorama read paths tolerant of unparsable JSON so one bad row cannot abort boot. |
| 3 | **PY-06** (`PY6`) | medium | prod (network) | `app/images.py:55-65` (`_context_for`), `:104-128` (`urlopen`), sink `:377` | The unverified TLS context is chosen from the **original** URL's host, and `urlopen` follows a 30x on the same opener, so the allow-listed CDS host can redirect to any host and the relaxed context (`CERT_NONE`, `check_hostname=False`) is applied there. Image bytes only; no user data. Same trust boundary, so medium, not high. | `python reviews/0.6.24/evidence/v7_probe_tls.py`: a 302 from the allow-listed host executes with `ctx is _INSECURE_CTX -> True`; a non-allow-listed first hop gets `ctx=None`; `v7-out-tls.txt`. | Re-check the allow-list on every redirect target (a custom redirect handler that drops the context / aborts off-list), or remove the unverified context and ship the CA bundle; add a pin for the redirect case. |
| 4 | **DE-07** | medium | prod | `static/js/wizard.js:11` (`_formState` module-level, never cleared), `:228` (prefill skipped on replay), `:217` (`restoreForm(1)`), `:62-66` (PUT target resolved at click time) | Replaying the wizard restores the first run's stored name/lat/lon/elev and, because `validate()` resolves its PUT target at click time, **overwrites the currently active site's** coordinates — persisted user data every later planning run then uses. | `[t7]` read chain `wizard.js:11/122/179/217/228/62-66`; `[v-desktop]` `grep _formState` → `:11,200,204,228` (never cleared). | Reset `_formState` when the wizard opens on replay so the active-site prefill (`:228`) runs; consider binding the PUT target when the wizard opens rather than at click time. |
| 5 | **WE-01** | medium | prod (cosmetic) | `web/app.js:942-944` vs desktop `static/js/skyview.js:282-285` | The web Sky View strokes the obstruction silhouette unconditionally. In sky mode an unpainted/out-of-FOV column is `90` → `radiusFor` = 0 = the zenith centre, so the stroked path alternates between the band edge and the centre. No number changes anywhere, and the web side is unpinned (the cross-app test `tests/test_ui_invariants.py:328-339` checks the desktop file only). | `node reviews/0.6.24/evidence/v7-probe-we.mjs`: `111 of 181` sampled azimuths at `r=0`, path crosses the centre twice; same for a fully painted band at `fov=180`. | Gate the `ceilPts` stroke on `activePaintMode() !== "sky"` in `web/app.js`, and extend `test_ui_invariants.py` to assert both apps. |
| 6 | **DE-08** | medium | prod | `static/js/util.js:152-155` (dismiss handler, no `stopPropagation`), `static/js/updater.js:42-45` (listener on the box) | Clicking the update toast's `×` bubbles to the box's own handler, so dismissing the notice opens the download page in an external browser (`window.open(SITE, "_blank")`). Deterministic; no data or product function affected, which is why it is medium and not high. | `[t7]` read both handlers; DOM removal during dispatch does not abort propagation, so the bubble is deterministic (`[v-desktop]` nit: the lane's `util.js:156` is off by one — `appendChild` is `:155`). | Add `stopPropagation()` to the dismiss handler, or bind the box click to the notice body only. |
| 7 | **DE-02** | medium | prod (display-only) | `static/js/pano.js:460-462` (`maskCv` reused by size), `:262-295` (`select()`, no `invalidateMask()`), `:405`, `:447-449` | After switching panorama the editor draws the **previous** panorama's mask over the new photo whenever `W/H` match — the normal case for two panoramas of the same aspect, or both clamped. Stored data is unaffected. | `[v-desktop]` `v7-pano-probe.mjs` (real module under DOM/canvas stubs): `recordSwitchedWithoutInvalidate=true`, `canvasesCreatedOnSecondRender=0`, the drawn mask carries A's stroke; forcing `maskCv=null` rebuilds to 0 arcs. | Call `invalidateMask()` in `select()`, or key the cached mask canvas on the panorama id. |
| 8 | **XL-02** (merged `CO-02` + `TO-01`) | medium | release/tooling | `scripts/build_core.py:96-100` (rmtree of every hash dir), `scripts/check_core.py:123-125` (`dirs != [hash_]`), wiring `scripts/check_js.py:33` and `check_release.py`, false doc lines `AGENTS.md:518` | The documented baked-core N-1 retention policy is unsatisfiable: the baker deletes every existing hash dir and the guard requires exactly one, so a policy-following release step fails `check_core` — while the live `/astro` tree legitimately carries N-1 and N-2 to serve a cached old stub. Separately, `AGENTS.md:518`'s "check_core.py only requires the current dir" (it *forbids* more) and "the deployed `/astro` tree must match" (it legitimately carries more) are both false. | `check_core` on a staged copy with N-1 present → exit 1 `web: baked hash dirs ['79ad99ef15810ca2','97c2e182fb0a5630'] != ['97c2e182fb0a5630']` (+ the static twin); `git ls-tree -d` v0.6.23 → `79ad99ef15810ca2`, v0.6.24/HEAD → `97c2e182fb0a5630`; read-only `ftps_deploy list /astro/core` → **3 dirs**: `97c2e182fb0a5630` (repo-tracked) plus `79ad99ef15810ca2` (N-1) plus the older `784ef08ceaafccf7` — i.e. the deployed tree legitimately carries more than the repo, which is exactly what `AGENTS.md:518`'s "must match" sentence denies. Captain's raw checks: `reviews/0.6.24/evidence/captain-deploy-check.md`. | Pick one and align code, guard and docs: keep N-1 in the baker and relax `check_core` to "current dir required, N-1 allowed", or state current-only retention in `AGENTS.md` and delete the N-1 sentence. Correct the two false doc lines either way. |
| 9 | **TO-02** | medium | tooling | `tests/browser/harness.py:354` (`with sync_playwright()` **outside** the guarded block), `:345-350`, `scripts/check_browser.py:73` | The documented "a browser that cannot launch is a HARD failure (exit 2), never a skip" contract is bypassed: any Playwright driver-start failure escapes as an uncaught exception → exit 1 with no `FATAL` line. Observed here as the sandbox's `WinError 5`, but the defect is independent of that artifact and was reproduced sandbox-free. | `python scripts/check_browser.py --web` → exit 1, uncaught `PermissionError [WinError 5]` from `asyncio/windows_utils.py:144`, 0 `FATAL` lines; `[v-to]` reproduced with a fake driver raising at `:354` and with `playwright` absent (`ModuleNotFoundError` at `:326`), both exit 1. | Move `sync_playwright()` inside the guarded block and map every driver/target-start failure to the documented `return 2`; pin it with a fake driver in `test_browser_gate.py` instead of a source grep. |

### 3.3 Low (26: 25 ranked + `CO-04`, unranked)

| id | exposure | file:line | impact | reproduction evidence | suggested fix direction |
| --- | --- | --- | --- | --- | --- |
| **PY-02** | prod (recovery) | `app/backup.py:91-102` (`_write_safety_copy` returns `None` on any exception), `:137` (copy) vs `:166` (`import_bundle`), `:207` (summary) | The pre-restore safety copy can silently not happen while the restore proceeds, and `auto_backup: null` is returned verbatim; a **directory** at `<db>.backup-auto.zip` reproduces it. The lane's "no caller reads it" sub-claim was refuted (setup.js only drops a reassurance sentence) — see Appendix A/R2. | `python reviews/0.6.24/evidence/v7_probe_backup.py`: `import -> 200 {…,"auto_backup":null}`, `sites before [] after ['Imported']`, `safety zip exists -> False`. | Surface the failure in the import result/UI (or retry under a different name) so a degraded restore is not presented as plain success. |
| **PY-05** | prod | `app/server.py:391` (settings route), `app/database.py:64-66`, `:519` (`set_active_panorama`) | `POST /api/settings {"active_pano_id":"../../evil"}` is accepted; `/api/state` reports it and the id-taking routes 404 it. Addendum: `set_active_panorama` first runs `UPDATE panoramas SET active=0`, so the bogus id also deactivates the real active panorama and the client plans with no horizon (`derive.js:283-284`). No file operation is reachable. | `[v-py]` probe: `POST … -> 200`, `/api/state` reports it, image/PUT routes 404. | Validate `active_pano_id` through `safe_token` at the settings route, as the panorama routes already do. |
| **PY-07** | prod (recovery) | `app/database.py:266` (the one `make_backup()` call site) | The rolling `.backup` copy uses `shutil.copyfile` on the live SQLite file, so it can capture a torn page set: 33/633 torn copies with one concurrent committer. The lane's trigger ("on every boot, while the server thread keeps writing") was refuted — the reachable trigger is a **second process during the boot window** (`main.py:263`); the artifact is regenerated next boot. | `v7_probe_backup.py`: `TORN copies (mixed rows) -> 33/633`, each `integrity='ok' distinct_v=2`, vs a quiescent control `distinct_v=1`. | Use SQLite's backup API (or `VACUUM INTO`) for the rolling copy, or skip it when another instance holds the DB. |
| **CO-03** | tooling | `scripts/check_core.py:141`, `:153`, `:164` (`glob("*.js")`) vs `:199` (`rglob("*.py")`) | The moved-concept and stale-token guards only scan the **top level** of `web/` and `static/js/`, so a re-implementation in a subdirectory passes, and a subdirectory stub importer is invisible (the regex at `:144` requires the literal `./core.js?v=`). Latent: no non-core `.js` subdirectory exists today. | `[v-core]` staged copy: `web/lib/geom.js` + static twin re-implementing `ceilFor`/`computeProfile` → `check_core: OK`; the same body at top level (`web/zzcontrol.js`) → exit 1 `"ceilFor() must live in core/ only"`. | Use `rglob("*.js")` (excluding `core/`) for the moved-concept scan, and match the core stub token on any relative path. |
| **CO-04** (`CR2`) | **static-only — not ranked** | `core/horizon.js:203-206` (`visibleSkyBands`), `:174` (`profileSegments`) | The function named in the AGENTS.md sky-band invariant is the unguarded one: a missing record/profile throws, while all siblings (`ceilFor`, `bandTopFor`, `overhangRuns`, `assumedOpenRuns`, `assumedOpenHatchPolys`) degrade gracefully. No shipped producer reaches it (every path normalizes), so per the charter it is excluded from the ranked list; it carries the `CR2` row in §4. | `node reviews/0.6.24/evidence/v7-co04.mjs`: `visibleSkyBands(null)`/`({})` throw; siblings return `{-90,null}`/`null`/`[]`. | Add the same null/shape guard the siblings have (or route through the shared normalizer) as CR2 defense-in-depth. |
| **WE-03** | docs | `web/app.js:140/142/159`, `web/astro.js:4/73` (same class found in `core/astro.js:10/48/163`, `core/planning.js:4/14/61/84`) | Comments still describe `app/astro.py`, `app/planning.py` and `app/nightcalc.py`, deleted in Phase C. | `git ls-files` has no such files; the core-side occurrence is recorded as a core-lane coverage gap (§5.4). | Delete or correct the comments. |
| **WE-04** | docs | `web/app.js:1988` vs `web/index.html` menu groups | The Setup → Backup hint sends the user to a menu group "Layout" that does not exist (the slider is in **Display**). The lane's supporting grep was false (Appendix A/R7); the claim itself holds. | `[t7]`/`[v-web]` read both files; `web/index.html` groups are Appearance/Display/Advanced/Data/About. | Fix the string to name Display. |
| **DE-04** | prod | `static/js/pano.js:735-737` (900 ms debounce), `:266-268` (`select()` cancels the pending timer instead of flushing) | An edit made inside the auto-save debounce window is silently lost on panorama switch or app close; there is no `beforeunload`/`pagehide` handler in `static/`. | `[v-desktop]` probe S3: `timerPendingAfterGesture=true`, `timerAfterSwitchingRecord=null`, `putSentBeforeSwitchDeadline=0`. | Flush the pending save on `select()` and register a `beforeunload`/`pagehide` flush. |
| **DE-05** | prod | `static/js/pano.js:735-762` (the `try` covers only the PUT; `:759-761` outside) | A failed list fetch rejects unhandled, `Pano.cur` can be `null` (deleted at `:309`), and a concurrent switch can let the refetch + rebind discard a newer panorama's unsaved strokes. | `[v-desktop]` probe S4 (held PUT, then `Pano.cur=null`): `unhandledRejection: Cannot read properties of null (reading 'id')`. | Move the post-await block inside the `try` (or catch it) and re-check the record identity before rebinding. |
| **DE-06** | prod | `static/js/weather.js:34-36`, `:52-57`, `:119-121`, `static/js/header.js:19` | A weather response is written to shared state without checking that its site is still active, so an older response can label the current site with another site's numbers (decorative data only). | `[t7]` read the chain. | Capture the site key before the await and drop the response if the active site changed. |
| **DE-09** | prod | `static/js/header.js:75-81`, `static/js/setup.js:114-144` | A failed settings POST rejects unhandled, so the `prefs:changed` dispatch never runs and the toggle does not re-derive. Neighbouring handlers in the same files do catch. | `[t7]` read; the defect needs a local server failure. | Catch the error, revert the toggle, and dispatch only on success (or dispatch with a rollback). |
| **DE-10** | prod (cosmetic) | `static/js/pano.js:501-517`, `static/index.html:392` | The loupe's crosshair marks the wrong point in the magnifier: the factor is `/Z` instead of `lcv.width/sw`, and the fixed 140×140 backing store is never sized from `sw`. | `[v-desktop]` probe S5: `drawImage(cv,78,28,44,44 → 140×140)` with the marker at `(7.33,7.33)` where the sampled point is `(70,70)`. | Use `lcv.width/sw`, or assign `lcv.width/height` from `sw` so marker and pixel share one transform. |
| **DE-11** | prod (perf) | `static/js/skymap.js:111/173-182/26-30`, `static/js/skyview.js:523/566` | The hover "only redraw on change" identity test compares against the previous render's object, so it can never be false and a point-to-point mousemove redraws (the Sky Map also reallocates its canvas). The lane's "both charts fully redraw on every mousemove" was overstated (Appendix A/R14): no output is wrong. | `[t7]` read; `[v-desktop]` narrowed the render side to compare by value. | Store the hovered object id (or compare by value) and keep the canvas instead of reallocating. |
| **DE-12** | prod | `static/js/skyview.js:127-139`, `static/js/skymap.js:229-240`, `static/js/main.js:24-40` | Each chart builds its legend HTML once, so the other chart's legend disagrees with the shared `S.disabledTypes` filter (`skyview.js:466`, `skymap.js:65`). | `[t7]` read. | Re-render the legend from the shared filter on tab activation and on chip toggle. |
| **DE-13** | prod (a11y) | `static/js/archive.js:436-455` vs `detail.js:137-143`, `weather.js:144-145` | The library-edit dialog cannot be dismissed with Escape (`bindArchive` registers click handlers only; the shared focus trap handles Tab only). | `[t7]` `grep -n "Escape" static/js/*.js` → only `detail.js` and `weather.js`. | Register a keydown handler, or extend the shared modal helper to cover this dialog. |
| **DE-14** | prod | `static/js/detail.js:49` (`if (S.currentId === id)`) vs close paths `:120-124`, `:129-133`, `:137-143` | The "modal closed while fetching" guard tests `S.currentId`, which no close path ever clears, so a fetched blob URL is retained until the next open/close. Bounded, no permanent leak. | `[t7]` read; only `:20` writes `S.currentId`. | Use a per-open token (or clear `S.currentId` on close) so the guard can detect the close. |
| **DE-15** | prod (perf) | `static/js/planning_worker.js:152` (`new Float64Array(total)`), `:170` (filled), transfer list `:195-196` (`altFlat`, `azFlat` only) | The worker allocates and fills a flat `ceil` array (≈23 MB at 12 000 objects × 241 samples in advanced mode) that is never transferred or consumed; consumers read the per-object `o.ceil` rebound at `planning_client.js:256`. | `[v-desktop]` `v7-ceil-probe.mjs` (real worker in-thread): reply `{n:80,count:241,hasCeilInMessage:false}`; no consumer of a flat `res.ceil`. | Drop the allocation, or transfer it and use it. |
| **TO-03** | tooling | `scripts/check_js_syntax.py:233-240`, `scripts/check_js.py:30` | When node is missing the syntax checker prints "skipped" and returns 0, contradicting AGENTS' "a missing node is a hard failure" rule. Reachability narrowed: a node-less box already fails the pytest suite, so "a release with all guards green" cannot happen (Appendix A/R8). | `PATH=C:\Windows\System32 python scripts/check_js_syntax.py` → "node not installed - syntax check skipped", exit 0. | Return a hard failure (or have `check_js.py` treat the skip as a failure) when node is required. |
| **TO-04** (`TL3`) | tooling | `scripts/check_catalog_token.py:40-50` (`_git`/`_git_ok` swallow every failure), `:85-93` (committed-change branch) | The catalog committed-change branch exists and works when git answers, but silently no-ops when git is unusable, and it is never exercised by a test (`tests/test_cache_tokens.py:71-76` patches file paths but leaves `ROOT` real, so `git diff HEAD` inspects a clean repo). | `[v-to]`: `(A)` `_git_ok()=True, scan()=[]`; `(B)` `_git→None` → `_git_ok()=False, scan()=[]` silently; `(D)` a catalog diff without a token bump does raise the expected message. | Make a git-unavailable condition an explicit failure (or a loud skip) and pin the branch with a patched `ROOT`. |
| **TO-05** | tooling | `tests/test_browser_gate.py:56-60`, `tests/test_encoding.py:24-26` | Mutation-proof coverage is incomplete: `check_js_imports` and `check_dom_ids` have zero test hits, `check_encoding` has only a real-tree pin, and the browser-gate exit-2 contract is pinned by a source grep. | `[v-to]` inventory: mutation-proven are `check_core`, `check_js_syntax`, `check_catalog_token` (branches 1-2), `check_release`, `build_changelog`, `pre_tag_check`, `ftps_deploy.upload_order`. | Add mutation/fake-driver pins for the four uncovered guards. |
| **TO-06** | docs | `AGENTS.md:356`, `scripts/check_js_syntax.py:37` | AGENTS.md's tooling claims are stale in two places: the test count (436 claimed, 437 collected) and the claim that the syntax checker covers the core source and both baked trees (its `ROOTS = [static/js, web]` is non-recursive and prints "checked 31 js module(s)"; those trees are covered by other checks instead). | `python -m pytest tests/ -q --collect-only` → 437 collected; the checker's own run output. | Update both AGENTS.md claims, or widen `ROOTS` if the coverage is actually intended. |
| **TO-07** (`TL5`) | tooling (by design) | `scripts/check_release.py:587-591` (ahead = ERROR), `:592-597` (behind = **WARNING**) | A stale `web/version.json` is only a WARNING, so "re-bake on every deploy" has no hard gate; `ns-version.js` *is* hard-checked. The carry-over record's "hard error" wording is wrong and must be corrected. | `[v-to]` ran both pins (`test_web_version_behind_is_only_a_warning` PASS, `test_web_version_ahead_is_an_error` PASS); at HEAD `check_release.py` reports `3 error(s), 0 warnings`. | Either promote the behind case to ERROR, or correct the AGENTS.md carry-over wording to "deliberate WARNING". |
| **TO-08** (`TL4`) | tooling/release | `build.ps1:179-187`, `requirements-dev.txt:5`, `.gitignore` | `build.ps1` has no `--specpath` and invokes PyInstaller on the root `main.py`, so the tool rewrites the **tracked** `NightSeam.spec`; the PyInstaller pin is only `>=6.0`. A regenerated spec dirties the tree → `git describe --dirty` → release abort, conditional on a PyInstaller upgrade changing the emitted spec. | `[t7]` `grep specpath build.ps1` → none; `git ls-files NightSeam.spec` → tracked. Static-only (charter §9.1 forbids running the build). | Pass `--specpath` to a gitignored directory (or stop tracking the spec) and pin PyInstaller exactly. |
| **TO-09** (`TS4`) | tooling | `core/index.js` export surface vs `tests/**` | 12 exported names (8 functions: `clipProfileToFov`, `fmtFov`, `fmtFovPair`, `isCustomId`, `searchBlob`, `sizeArcmin`, `sunAlt`, `sunCrossings`; plus `MASK_H`, `MASK_W`, `SKY_ZOOM_MAX`, `SKY_ZOOM_MIN`) are never named by any test. The core lane's "54 exports" figure is wrong — it is 85 unique names (Appendix A/R11). | `[t7]` core pass and `[v-to]` independently produced the same list over `tests/**`. | Add direct tests for the eight functions, or document them as intentionally unexported. |
| **TO-10** (`TS7`) | tooling | `tests/js/core_fixtures.mjs:24` (`has()` gate), `tests/test_core_fixtures.py:56-58` (`pytest.skip`) | Fixture sections skip silently when a core export disappears, and the MOVED-test mitigation is only partial: a **rename** is caught, but dropping the re-export from `core/index.js` removes the fixture section with both MOVED tests still green. The correctness authority (`reference_anchors.mjs`) still covers GMST/precession. | `[v-to]` mutation: rename `julianDay` → section drops **and** `test_moved_list_*` fails; drop the re-export only → section drops with `missing=set() stale=set()` and both MOVED tests pass. | Make a missing export a hard failure, or assert the expected section list instead of `pytest.skip`. |
| **TO-11** | tooling | `scripts/check_encoding.py:28-30` (`SKIP_TOP` has no `reviews`), `:54` (`root.rglob("*")`) | The shipped-text encoding guard walks the untracked `reviews/` workspace, so review scratch can turn the release JS guard red: during this round `check_js.py` reported every product check OK but `check_encoding: FAIL (31 file(s))`, all offenders under `reviews/0.6.24/evidence/v7-*`. Final state after cleanup: `check_encoding: OK`, `check_js: OK` exit 0. No shipped file was ever affected. | Live reproduction during t7 (`exit 1`), captured in `70-verification.md` §8; final clean run recorded there too. | Add `reviews` (and any other non-shipped top-level dir) to `SKIP_TOP`, or scope the walk to tracked files. |

### 3.4 `DE-03` vs `WE-02` — an owner ruling is REQUIRED (deliberately not resolved here)

Both findings are confirmed and both are ranked high. They are **mirror images of the same AGENTS.md
invariant on opposite shells**: the two shells fail that invariant in **opposite directions**. This
report states both mechanisms and the invariant text, picks **no** winner, and does not imply that
either shell's behaviour is correct.

**The invariant text** (AGENTS.md, "Panorama profile/strokes invariant"): "*strokes WIN when present
… with NO strokes the stored `profile`/`profileTop` are AUTHORITATIVE, so a stroke-less imported
record is never blanked just by opening/saving … Deliberate clearing goes through `clearMask()`, the
one place a stored profile is discarded. A stroke-less profile must not be silently removed - that
could make a blocked target look observable.*"

**Mechanism A — `WE-02` (web, `web/horizon.js`): the profile is kept when it should be re-derived.**
`snapshotPano` (`:359-363`) excludes the profile, `applySnapshot` (`:366-371`) restores
strokes/calibration/mode only, `drawProfile` re-derives only `if (p.strokes.length > 0)` (`:933-939`),
the undo/redo/Revert paths (`:1056-1076`) rebuild only the mask and overlay, and the `#ed-mode`
handler (`:1331-1336`) only assigns `paintMode`. So when the editable state loses its strokes
(undo of the first stroke, Revert) the live record keeps the discarded derived ceiling while `dirty()`
reports `false` ("Saved"), and the mode switch to sky never applies the `90` sentinel on a stroke-less
record — while the preview shows "fully blocked". It survives Save + reload; probe: `afterUndo =
29.916` where `-90` is expected, `historyDirty = false`.

**Mechanism B — `DE-03` (desktop, `static/js/pano.js`): the stored profile is destroyed when it
should be authoritative.** `setPaintMode()` (`:148-157`) empties `profile`/`profile_top` and
`recomputeProfile()` then fills the canonical sentinel for every bin (`:652-659`: `-90` in obstacle
mode, `90` in sky), which `scheduleSave(0)` persists — so one mode click blanks a stroke-less
imported horizon, contradicting "`clearMask()` is the ONE place a stored profile is discarded". The
unfiled twin site `undoPaint` (`:167-175`) does the same. Probe S2: a 720×20 record plus one
`#modeSky` click produced a 720×90 profile and the PUT body carried it.

**Why a ruling is needed — and t7's adjudication.** t7 adjudicated these as **TWO findings, kept
ranked separately** (both high, with a cross-reference), not as one defect and not as duplicates: they
are the *same invariant sentence* violated in **opposite directions** on the two shells. The
adjudication records both sides of the tension rather than resolving it:

- The **"`clearMask()` is the one place"** sentence supports the **web's keep** (the desktop discards a
  stroke-less stored profile, which the invariant forbids).
- The **sky-mode sentinel semantics** — AGENTS.md: "*unpainted sky columns stay at 90*" — supports the
  **desktop's re-blank** (a mode switch changes what the canonical blank must be, so merely keeping the
  old profile leaves a mode-invalid record).

Merging the two would hide the fact that **one fix must first decide the intended semantics**. The
intended semantics must therefore be recorded by the owner **before either shell is repaired**; until
then each lane's proposed fix is the other lane's defect. This report makes no choice between them and
does not imply that either behaviour is correct; neither `DE-03` nor `WE-02` should be "fixed" from
this report alone.

### 3.5 Merged duplicates and cross-lane twin adjudications

t7's §2.1 adjudicates four pairs; the report carries the ruling and its basis verbatim in substance.

| pair | t7 ruling | basis |
| --- | --- | --- |
| `CO-02` ≡ `TO-01` | **ONE defect**, merged as `XL-02` (**medium**) | The same unsatisfiable baked-core N-1 retention policy; t3 owns the baker + live-deploy half, t6 owns the guard wiring (`check_js.py:33`, `check_release.py`) and the false `AGENTS.md:518` sentence. Both lane ids are preserved in `07-findings.json`. |
| `XL-01` ≡ `E15` | **NOT duplicates** — `XL-01` stays a ranked finding, `E15` stays a carry-over row resolving against it | `XL-01` is the concrete 0.6.24 release instance; `E15` is the standing per-module token-discipline gap whose pin (`tests/test_cache_tokens.py:40-61`) is doc==source only. §4 keeps `E15` **open at medium** with `XL-01` as its instance. |
| `DE-03` vs `WE-02` | **TWO findings, kept ranked separately** (both high) with a cross-reference; a ruling is required before either is repaired | The same invariant violated in opposite directions: the web **keeps** a mode-invalid stroke-less stored profile, the desktop **discards** it (data loss). The "`clearMask()` is the one place" sentence supports the web's keep; the sky-mode `90` sentinel supports the desktop's re-blank. See §3.4. |
| `PY-03` vs `WE-02` | **distinct**, both ranked | `PY-03` is the *storage/import* boundary accepting a junk `strokes` shape (the desktop consumer throws at `pano.js:670`; the web twin is guarded by `Array.isArray` at `core/horizon.js:264`); `WE-02` is the *editor* failing to re-derive when strokes disappear. |

`XL-02` is the only merged pair, so the 42 filed rows stand as 41 unique findings. `CO-04`/`CO-01`
are the `CR2`/`CR3` carry-over rows, not duplicates of another finding.

---

## 4. Carry-over audit (all twelve documented items)

Every row was re-checked from the code and the guard, not from the lane's sentence. "Lane said" is
the owner lane's resolution; "verified" is the adversarial result. **No item is closed.** Where the
lane's wording no longer matches the code it is marked *record wrong* rather than SUPERSEDED, since
the underlying item is still open.

| Item | Owner lane(s) | Lane said | Verified | Severity | Pinning file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `CR2` malformed-horizon guards | core (web, desktop consumers) | STILL OPEN low | **STILL OPEN — low, static-only (not ranked)**; unresolved set is `{visibleSkyBands, profileSegments}`; all shipped producers normalize | low | `core/horizon.js:139/174/203`; producers `web/horizon.js:128/255-269` | `CO-04`; `v7-co04.mjs` (null/`{}` throw, siblings degrade) |
| `CR3` FOV-edge half-bin | core (desktop) | STILL OPEN medium | **STILL OPEN — high**, mechanism corrected to the frame-**start** partial bin; the desktop re-implements the same rule | high | `core/horizon.js:109` vs `:402`; `core/scoring.js:148`; `static/js/pano.js:683` | `CO-01`; `v7-verify-co01.mjs` (`prof[0]=-90`, `ceilFor(0.07)=-90`); `v7-co01b/c.mjs` |
| `DS4` worker/sync `max_alt` | desktop | **CLOSED** | **REOPENED — STILL OPEN, low, scope corrected.** `max_alt` really does agree (`r1` is monotone; 0 diffs over 240 × 241); the residual is a worker/sync `ceil`/`ceil_top` divergence caused by the binder re-deriving from the worker's rounded `az` | low | `planning_worker.js:169-170`; `planning_client.js:256` vs `:407` | `v7-ceil-probe.mjs` (516/19 280 samples, 80/80 objects, worst 20°, 0 `visBits`/score diffs) |
| `DS5` worker revive | desktop | STILL OPEN low | **STILL OPEN — low**, dev-hook only: `onerror` keeps the failed Worker and both hooks are gated behind `window.__NS_DEBUG_WORKER`; `workerUsable()` always falls back to the sync planner | low | `planning_client.js:63-67/74-79/97-107/47-49` | `[t7]` read; `t5-ds5-revive.mjs` |
| `TL3` catalog committed-change check | tooling | STILL OPEN (partially superseded) low | **STILL OPEN — low**; the branch exists and works but silently no-ops without git and is never pinned | low | `scripts/check_catalog_token.py:40-50/85-93` | `TO-04`; `[v-to]` probe (A/B/D) |
| `TL4` `--specpath` + PyInstaller pin | tooling | STILL OPEN low | **STILL OPEN — low**; no `--specpath`, tracked `NightSeam.spec`, `pyinstaller>=6.0` | low | `build.ps1:179-187`; `requirements-dev.txt:5` | `TO-08`; static grep + `git ls-files` |
| `TL5` stale `web/version.json` | tooling | STILL OPEN by design low | **STILL OPEN — low by design.** It is a WARNING, not a hard error; the record wording is wrong | low | `scripts/check_release.py:587-591` vs `:592-597` | `TO-07`; both pinning tests PASS at HEAD |
| `TS4` untested exports | tooling | STILL OPEN low | **STILL OPEN — low**; 12 names (8 functions) never named by any test | low | `core/index.js` exports vs `tests/**` | `TO-09`; reproduced independently twice |
| `TS7` fixture `has()` gating | tooling | STILL OPEN mitigated low | **STILL OPEN — low**; the mitigation is only partial (a dropped re-export removes the section with the MOVED tests green) | low | `tests/js/core_fixtures.mjs:24`; `tests/test_core_fixtures.py:56-58` | `TO-10`; `[v-to]` mutation |
| `E15` per-module token discipline | web, tooling cross-check | STILL OPEN medium | **STILL OPEN — medium**; the register pin compares docs to sources only, so a missed bump passes; `XL-01` is a concrete instance of exactly that | medium | `tests/test_cache_tokens.py:40-61` | `XL-01`; `[t7]` git grep at tag vs HEAD |
| `PY6` TLS-redirect hardening | python | STILL OPEN medium | **STILL OPEN — medium**; a local reproduction now exists — the relaxed context reaches the redirect target | medium | `app/images.py:55-65/104-128`; sink `:377` | `PY-06`; `v7_probe_tls.py` / `v7-out-tls.txt` |
| `WB7` bundle-version check | web | STILL OPEN deliberate low | **STILL OPEN — low, deliberate.** `version: 2` is written but never read; the "missing panorama section" half is closed | low | `web/webstore.js:295`; `web/app.js:2101-2103` | `[t7]` read; `web_backup.mjs` exit 0 |

Rows that duplicate a ranked finding: `CR2`≡`CO-04`, `CR3`≡`CO-01`, `PY6`≡`PY-06`. Two rows
(`TL3`, `TL5`) need only a *wording* correction in AGENTS.md; `DS4`'s whole description needs
rewriting (`max_alt` agrees; the residual is `ceil`/`ceil_top`).

---

## 5. Coverage and explicit non-coverage

### 5.1 What was covered

| Lane | Covered | Evidence runs |
| --- | --- | --- |
| Python (`10-python.md`) | every `/api/*` route (31 registrations) with a per-route validation/error sweep; `paths.safe_rel/safe_join/safe_token` on 18 adversarial strings; the import trust boundary end to end (traversal members, path-like ids, `image_dir_ignored`); `ingest.py` streaming/cap/frame layout; `fits.py` parsers incl. hostile `NAXIS`; the additive-migration rule; `images.py` cache/offline/TLS; `main.py` single-instance | lane suite `64 passed` (114 documented env errors, 0 assertion failures); baseline `295 passed, 142 errors`; `py_probes.py` |
| core (`20-core.md`) | every `core/` module read end to end; the bake pipeline and `check_core`/`build_core` guards; the correctness authority `reference_anchors.mjs` | `node tests/js/reference_anchors.mjs` **19/19 ok**, exit 0; the `.mjs` engines; staged-copy guard mutations |
| web (`30-web.md`) | every `web/` module read end to end (index.html 213, app.js 2757, horizon.js 1401, webstore.js 418, astro.js 176 lines); panorama editor model, IndexedDB store, backup/restore, cache tokens | `check_js.py` exit 0; `pano_ui`, `sky_band`, `web_backup`, `core_d1`, `dom_handlers` all exit 0; `we-profile-state-probe.mjs` |
| desktop (`40-desktop.md`) | full reads of `derive`, the night loader/worker, `pano.js`, `wizard.js`, DOM contracts; the two carry-over rows | `check_js.py` exit 0; `night_race`/`derive_window`/`scrub_degenerate`/`worker_lifecycle`/`sync_cache_key`/`sky_band`/`pano_geom`/`dom_handlers` all 0; `test_ui_invariants.py` 26 passed; `check_dom_ids.py` 200 ids / 182 referenced / 0 missing; stub probes S2-S5, `v7-pano-probe.mjs`, `v7-ceil-probe.mjs` |
| tooling (`50-tests-tooling.md`) | the full suite, every guard script, mutation-proof inventory, the release/deploy pipeline and its pins | `pytest --collect-only` 437; `check_js.py`; `check_browser.py --web` (blocked, see below); `check_release.py`; `check_encoding.py` |

### 5.2 What was **not** covered (honest limits)

1. **No real browser ran — both browser gates are blocked by the environment.** `check_browser.py --web`
   dies at the Playwright driver spawn with `PermissionError [WinError 5]` (exit 1; `TO-02` records
   that the documented exit-2 contract is bypassed for exactly this class of failure), and
   `check_browser.py --desktop` cannot run because the sandbox refuses to execute the copied exe
   (`Errno 13` / exit 2); `dist/NightSeam.exe` is out of scope as a build artifact anyway. Consequence:
   **there is no rendered-pixel or real-click evidence anywhere in this review.** `DE-01`…`DE-05`,
   `DE-10` and `DE-15` were driven under DOM/canvas stubs; `DE-06`…`DE-09` and `DE-11`…`DE-14` remain
   reasoning-only; `WE-01`'s visible defect rests on the code chain plus a node probe, and its own
   falsifier (a screenshot showing a clean boundary) was not obtainable. The production smoke
   (`--prod-url`) was not run.
2. **Network-dependent paths.** Live Wikipedia/CDS fetching was not exercised; `PY-06`'s TLS
   behaviour was reproduced locally with a loopback 302 that returns image bytes only. FTP use was
   read-only (`list`/`download` of `/astro`) to settle `XL-01` and `XL-02`; nothing was uploaded.
3. **Build and release execution.** `build.ps1`, `build_core.py`, `make_release.py`, `build_web.py`
   and `ftps_deploy.py` writes were forbidden by the charter, so `TL4`/`TO-08` and the release-order
   claims are static-only. The packed exe was not run, and the advanced (12k) worker build timing on
   real hardware was not benchmarked.
4. **Assets and data.** `web/catalog.json` (3.99 MB) was checked only for its token/sha256 pairing,
   not its content; `DESIGN.md` and the themes were spot-checked (behaviour, not pixels);
   `static/js/skydata.js` decoration values and the `app/catalog_data.py` / `openned.csv` bulk data
   were not audited; `data/`, `dist/` and `logs/` were never touched.
5. **Platform.** `main.py`'s pywebview window and single-instance handoff were read, not driven.

### 5.3 Environment artifacts and the verified guard hand-off state (not product findings)

- **`pytest` (full suite):** `295 passed, 142 errors, 0 assertion failures`; every error is the
  documented `.pytest-tmp` DACL / `WinError 5` fixture-cleanup artifact, and the suite collects
  **437 tests** against the 436 documented in AGENTS.md (`TO-06`). The AGENTS.md workaround
  reproduces as written.
- **`check_encoding` scopes the review workspace (`TO-11`) — history, attributed, not a product
  defect and not a live red guard.** Review scratch written by PowerShell redirection landed inside
  the guard's scan scope (`scripts/check_encoding.py:28-30`, `SKIP_TOP` has no `reviews` entry, with
  `:54` `rglob("*")`), so during the round the offender count churned (1 → 40 files) and `check_js.py`
  reported `check_encoding: FAIL`. **Verified hand-off state (measured by the captain after t7 cleaned
  its scratch, and re-confirmed here):** `reviews/` holds **0 encoding offenders**;
  `python scripts/check_encoding.py` → **OK, exit 0**; `python scripts/check_js.py` → **exit 0**;
  `python -m pytest tests/test_encoding.py` → **1 passed**. No shipped file was ever affected.
- **Playwright driver spawn denial** (named-pipe boundary): the reason the browser lane is empty
  (§5.2 item 1).
- **The documented `basetemp` workaround is stale (documentation claim, no verdict depends on it).**
  t7 ran the AGENTS.md workaround command **verbatim**
  (`python -m pytest tests/ -q --basetemp C:\Users\<user>\AppData\Local\Temp\opencode\pt -p no:cacheprovider`)
  and still measured **295 passed / 142 errors / 0 assertion failures** — i.e. the workaround does not
  remove the `tmp_path`/WinError-5 error set, it only keeps the errors out of the repo-local
  `.pytest-tmp`. The suite is therefore green **on assertions**, not error-free, and the docs should
  say so rather than present the workaround as a clean 436/436.
- **Two documented contract verify commands are unusable as written** (found by the lanes, confirmed by
  t7's reading): `node tests/js/astro_parity.mjs` is a **stdin-driven multi-engine driver** (a bare
  `node` invocation cannot settle anything) and `node tests/js/worker_bridge.mjs` **needs its parent
  runner**. This is a Commands-section inaccuracy, not a product defect; **no verdict depended on
  either engine**.
- **`reviews/` is untracked scratch.** Nothing under it is shipped, and no production file was
  modified anywhere in this review (`git status --porcelain` = `?? .agent-teams/` + `?? reviews/`;
  `git diff --stat` empty).

### 5.4 Record corrections (material to the record, not to any verdict)

1. **Charter §1.1 / H5 premise is false** (Appendix A/R10): the "six root-level scratch scripts plus
   one scratch JSON are committed" claim is wrong — `git ls-files` prints nothing for all seven and
   `git check-ignore -v` shows `.gitignore:25-32`. The coverage-matrix row should be corrected so it
   does not claim committed files that do not exist.
2. **`20-core.md` export count** is wrong: "54 names" is **85 unique names** (8 export blocks,
   identical to `web/core.js`) (R11).
3. **AGENTS.md claims that the code contradicts** — listed in full in §5.5.
4. **Core-lane coverage gap**: the stale Phase-C comments the web lane filed as `WE-03` also live in
   `core/` source (`core/astro.js:10/48/163`, `core/planning.js:4/14/61/84`) and were not filed by
   the owner lane.
5. No lane claimed coverage it did not perform, and no filed claim was silently omitted: all 42 rows
   appear in the verification document and in this report.

(The lane-file naming/removal note that used to sit here is a provenance matter, not a record
correction; it now lives only in §8, where the canonical naming is set out.)

### 5.5 Documentation corrections required (t7-supplied list)

Docs are hardening items, not product findings; they are recorded here because the record is
currently wrong in these places.

| File:line | Current claim | Reality | Source |
| --- | --- | --- | --- |
| `AGENTS.md:518` | "`check_core.py` only requires the current dir." | It **forbids** more than one: `check_core.py:123-125` fails unless `dirs == [hash_]`. | `XL-02` (`CO-02` + `TO-01`) |
| `AGENTS.md:518` | "The deployed `/astro` tree must match." | The deploy legitimately carries 3 hash dirs: `97c2e182fb0a5630` (tracked) + `79ad99ef15810ca2` (N-1) + older `784ef08ceaafccf7`. | `XL-02`; `evidence/captain-deploy-check.md` |
| `AGENTS.md` code-review record, `TL3` row | "Catalog committed-change check" (implied to work) | The branch exists and works when git answers, but silently no-ops when `_git` fails (`check_catalog_token.py:40-50/85-93`) and is never pinned. | `TO-04` / `TL3` |
| `AGENTS.md` code-review record, `TL5` row | Stale `web/version.json` is a "hard error" | It is a deliberate **WARNING**: `check_release.py:587-591` is ERROR only when *ahead*; `:592-597` (behind) warns. | `TO-07` / `TL5` |
| `AGENTS.md:356` and the commands section | `python -m pytest tests/` (436) | **437** collected at HEAD; already stale at the `v0.6.24` tag. | `TO-06` |
| `AGENTS.md` commands section (sandbox note) | The `--basetemp` workaround is presented as giving a clean suite | Running it **verbatim** still yields 295 passed / 142 errors / 0 assertion failures; it only keeps the errors out of the repo-local `.pytest-tmp`. The suite is green on assertions, not error-free. | environment addendum (§5.3) |
| `AGENTS.md` commands section (JS checks) | `node tests/js/astro_parity.mjs` and `node tests/js/worker_bridge.mjs` read as directly runnable | `astro_parity.mjs` is a stdin-driven multi-engine driver; `worker_bridge.mjs` needs its parent runner. No verdict depended on either. | §5.3; lane coverage notes |
| `AGENTS.md` commands section | The syntax checker covers the core source and both baked trees | `check_js_syntax.py:37` `ROOTS = [static/js, web]` is non-recursive ("checked 31 js module(s)"); those trees are covered by other guards. | `TO-06` |
| `AGENTS.md` code-review record, `DS4` row | "Worker/sync `max_alt`" divergence | `max_alt` agrees; the residual is a worker/sync `ceil`/`ceil_top` divergence from the binder's rounded `az`. | carry-over §4 / `R13` |
| `00-charter.md` §1.1 / H5 | "Six root-level scratch scripts + one scratch JSON are committed" | `git ls-files` prints nothing for all seven; `.gitignore:25-32`. | Appendix A / `R10` |
| `20-core.md` coverage table | "`core/index.js` explicit export surface (54 names)" | **85** unique names (8 export blocks), identical to `web/core.js`. | Appendix A / `R11` |

---

## 6. Appendix A — refuted sub-claims (15)

No filed finding was refuted outright. These sub-claims, mechanisms and evidence lines were refuted,
and the corrected form is what the ranked tables above state.

| # | Target | What was refuted | Corrected form |
| --- | --- | --- | --- |
| R1 | `CO-01` | "One extra carried bin at the **right** edge; the scored azimuth inside it reads the clamped column 719 = the far edge of the mask." Refuted by two independent probes: with `azOffset=0` the scorer touches 91 bins like the profile, `ceilFor(45.0)` is not gated (the gate is strict `>`), and column 719 is that frame's own right-edge column (`azOfX(719)=44.9375`). | The defect is the frame-**start** partial bin; `CO-01` stands, re-ranked high with the new mechanism. |
| R2 | `XL-01` | The blocker reading — the tagged tree, or a user-visible stale module set, actually shipped. | Read-only FTP download: live `index.html` names `app.js?v=60`; live `sha256(app.js)` is byte-identical to HEAD. Release-artifact defect stands at **high**; no user was affected. |
| R3 | `PY-01` | Its secondary citation `app/database.py:505-527` is `active_panorama`; `panoramas()` is `:492-503`. | Verdict unaffected. |
| R4 | `PY-03` | "`PUT /api/panorama/{pid}` hands a junk `strokes` through unchanged." It answers **422** (`PanoramaUpdate.strokes: Optional[list]`, `server.py:157`); only junk **lists** pass. | The import-boundary half (the reachable one) is unaffected. |
| R5 | `PY-04` | The nan explanation "every comparison false → the matcher returns None" and the "two different unrelated objects" observation; also "no JSON parser accepts `Infinity`". | `min(1.0, nan) = 1.0 → acos(1.0) = 0.0`, so the first catalog row wins deterministically (`abell21`); Python's `json.loads` does accept `Infinity`. The impact (silent mis-filing with the catalog's coordinates) is confirmed. |
| R6 | `PY-07` | The trigger "on every boot, while the server thread keeps writing". `make_backup()` has one call site (`database.py:266`, end of `Database.__init__`) and uvicorn starts afterwards (`main.py:235→248-249`). | The reachable trigger is a second process during the boot window; the torn-copy mechanism itself is reproduced (33/633). |
| R7 | `WE-04` | The evidence line "`grep -n "Layout" static/` is empty" — there are 20 CSS-class hits. | The finding's narrower claim (no such sentence in the desktop text) holds; verdict unaffected. |
| R8 | `TO-03` | The impact clause "even a release with all guards green". | A node-less machine already fails the pytest suite; the defect (silent skip) stands at low. |
| R9 | `TO-10` | The mitigation claim that `test_core_drift.py` replaces the lost bite. | A rename is caught; dropping a re-export from `core/index.js` removes the fixture section with both MOVED tests green. Severity unchanged. |
| R10 | charter §8/H5 | "Six root-level scratch scripts + one scratch JSON are committed." | `git ls-files` prints nothing for all seven; `.gitignore:25-32`. No finding; the charter §1.1 row must be corrected (§5.4). |
| R11 | `20-core.md` coverage | "`core/index.js` explicit export surface (54 names)". | 8 export blocks, **85 unique names**, identical to `web/core.js`. |
| R12 | `CO-04` | Its reachability as a ranked defect. | Reproducible only with a hand-edited IndexedDB record; no shipped producer emits it → static-only, not ranked (§3.3, Appendix B). |
| R13 | `CAR-DS4` | The lane's "CLOSED" resolution and its premise that both paths pass the raw azimuth to the same lookup. | `max_alt` agrees (r1 is monotone; 0 diffs over 240 × 241), but `planning_client.js:256` feeds the worker's r1-rounded `az` to `ceilAt` while sync passes raw `z` (`:407`), so `ceil`/`ceil_top` diverge on 516/19 280 samples (80/80 objects, worst 20°) with 0 `visBits`/score differences. Item stays **open at low**. |
| R14 | `DE-11` | "Both charts fully redraw on every mousemove." | A move that lands on no point leaves `best = null === *_HOVER` and does not redraw; the render side compares by value (`skyview.js:462`, `skymap.js:69`), so no output is wrong. The guard is still ineffective on point-to-point moves. |
| R15 | `DE-03` | The line reference ":10-13 the mode buttons". | The buttons are `static/index.html:360-361`, bound at `pano.js:35-38`. Verdict unaffected; the same pass also found the **unfiled twin site** `undoPaint:167-175`, now included in the `DE-03` fix note. |

---

## 7. Appendix B — the unranked finding and the evidence-depth notes

Exactly **one** claim is admitted here as *unranked*: `CO-04` (`CR2`), whose code behaviour is
CONFIRMED but whose impact is unreachable from every shipped producer, so per the charter it is not
admitted to the severity-ranked list (it also carries the `CR2` row in §4). **Every other entry in
this appendix is a ranked finding** whose *evidence* is static-only or bounded by the environment; they
are listed for evidence honesty, not to remove them from the ranked list.

### 7.1 Not ranked at a severity: `CO-04` alone

| id | claimed | verdict | why it is not ranked |
| --- | --- | --- | --- |
| `CO-04` (`CR2`) | low | CONFIRMED (code), impact unreachable | The throw is demonstrated with a synthetic record; every shipped producer normalizes (`load`, `normalizePanos`, `newPano`), and only a hand-edited IndexedDB record reaches it. It sits in the low band of §3.3 labelled `static-only — not ranked` and carries the `CR2` carry-over row. |

### 7.2 Evidence depth for findings that **are** ranked

| id | Ranked? | Verified severity | Verdict | Evidence depth and limit |
| --- | --- | --- | --- | --- |
| `DE-01` … `DE-15` | **yes** — §3.1 (`DE-01` #5, `DE-03` #2) and §3.3 | 2 high / 3 medium / 10 low | CONFIRMED | Mechanisms re-derived from source with numbered `file:line` chains; `[v-desktop]` additionally drove the real modules under DOM/canvas stubs for `DE-01`…`DE-05`, `DE-10`, `DE-15`. **No browser could be launched** (§5.2), so `DE-06`…`DE-09` and `DE-11`…`DE-14` are reasoning-only and no real rendering/click evidence exists for the lane. The DE-band count is the per-finding verdict table's 2 high / 3 medium / 10 low (`DE-01`, `DE-03` high; `DE-02`, `DE-07`, `DE-08` medium; the other ten low). |
| `WE-03` | **yes** — §3.3 (low) | low | CONFIRMED | Documentation drift only; `git ls-files` settles it (no runtime path to test). |
| `WE-04` | **yes** — §3.3 (low) | low | CONFIRMED | User-visible string; there is no executable path to exercise. |
| `TO-08` (`TL4`) | **yes** — §3.3 (low) | low | CONFIRMED | Running `build.ps1`/PyInstaller is forbidden by charter §9.1; the static chain (`--specpath` absent, spec tracked) is airtight but never executed. |
| `XL-01` (inferred stale-visitor consequence) | **yes** — §3.1 #6 (high) | high | REPRO via git | The tagged-tree inconsistency is settled by `git grep`/`git tag --contains`; only the *inferred* consequence for a returning visitor is not executable (and the live tree refutes it as a fact). |

**Parallel fix, not ours — and it has landed.** The verification document's §6 had the same defect this
gate found in the first revision of this appendix (a preamble saying every row was not ranked, plus an
older "2 high / 4 medium / 9 low" DE band count). The verifier was asked to fix its own file in
parallel, and **by the time this revision was finalised the fix had landed**: §6 is now titled
"Static-only (reasoning-only) claims — ranked / unranked accounting", states that `static-only` is a
reproduction class and not a ranking decision, carries an explicit "Ranked in the consolidated
report?" column, and gives the corrected desktop band count **2 high / 3 medium / 10 low** — matching
the counts used here and in §1.1. That edit initially left a residue (a duplicate orphan `XL-01`
deploy-order row after §6's closing paragraph, breaking that table's rendering); it was reported to
the captain and to the t11 gate rather than fixed here (the verification file is outside this task's
scope), and a later verifier pass has since removed it — re-checked, the orphan is gone. This report
takes no position on that file beyond recording the state it observed.

`PY-02`, `PY-06` and `PY-07` were filed or flagged static-only by their lanes and were **promoted to
executable reproductions** by the independent passes, so they are ranked normally and are not in this
appendix.

---

## 8. Provenance, methods and artifact index

**Canonical naming (methods note).** The canonical review set is the six files named in the header —
`00-charter.md`, `10-python.md`, `20-core.md`, `30-web.md`, `40-desktop.md`, `50-tests-tooling.md` —
plus `70-verification.md` and `07-findings.json`. The historical task records for t2/t3/t4/t5 also name
`01-python.md`, `02-core.md`, `03-web.md` and `04-desktop.md`; those were **byte-identical duplicate
copies removed during the review** (the captain reports them as hash-verified duplicates of
`20-core.md`, `30-web.md` and `40-desktop.md` respectively, so **nothing was lost** — no finding and no
evidence). They are deleted paths: every citation in this report uses the canonical names above only,
and a reader should not treat the task-record filenames as missing evidence. This is a provenance note,
not a record correction, which is why it lives here and not in §5.4.

**Source revisions — a policy, not a frozen hash table.** The review records were edited several times
while the review ran, so this report pins **one stable anchor and one rule** instead of a table of
volatile lane-file hashes:

- **Authoritative machine-readable record:** `07-findings.json`, **43 121 B, sha256 `E893B8F0…`**
  (unchanged throughout; 42 findings, 41 unique, 6 high / 10 medium / 26 low, the merged `XL-02`
  record, the four `cross_lane_twins` rulings and the 12 carry-over rows). Where any lane file and
  this JSON disagree, `70-verification.md` is authoritative, and where the JSON and the document
  disagree, the document wins.
- **The revisions the findings were verified against** are the ones t7's §7.6 names — §7.6 documents
  t7's pins; this report does not freeze them and re-measures nothing on its own. t7's §7.6 is the
  "as of" pin: it lists the bytes/hashes present when each verdict was written and states that
  `30-web.md` was edited once more afterwards.
- **Post-verification edits are a process fact, and they changed no finding.** After the verdicts were
  written, **web-reviewer refreshed `30-web.md`'s encoding and `XL-01` evidence rows**, and **t7
  refreshed `70-verification.md` and `07-findings.json` in place** (the §2.1 twin adjudications, the
  `XL-01` medium-rejection reasoning, the `R10`–`R15` additions, the environment addendum). In both
  cases **no finding id, severity, verdict or ranking changed** — only provenance/evidence rows moved.
  Later still, `70-verification.md` and `50-tests-tooling.md` grew again (evidence rows only). The
  finding sets were re-checked after every write: `30-web.md` still holds `XL-01` + `WE-01`…`WE-04`,
  `50-tests-tooling.md` still holds `TO-01`…`TO-11`, and `07-findings.json` still reports the counts in
  the anchor above. **Anyone quoting a lane-file hash should re-derive it first**; a stale hash here
  would imply a different revision, which is exactly why this report does not freeze one.

All paths are relative to the repository root; nothing outside `reviews/0.6.24/` was written.

| Artifact | Role |
| --- | --- |
| `reviews/0.6.24/00-charter.md` | the review charter (scope, standards, severity scale, evidence bar) |
| `reviews/0.6.24/10-python.md` | Python/backend lane report (7 findings, PY6 row, route sweep) |
| `reviews/0.6.24/20-core.md` | `core/` lane report (4 findings, CR2/CR3 rows, bake-guard audit) |
| `reviews/0.6.24/30-web.md` | web shell lane report (XL-01, WE-01…WE-04, E15/WB7 rows) |
| `reviews/0.6.24/40-desktop.md` | desktop shell lane report (15 findings, DS4/DS5 rows) |
| `reviews/0.6.24/50-tests-tooling.md` | tests/tooling/release lane report (11 findings, TL3/TL4/TL5/TS4/TS7 rows) |
| `reviews/0.6.24/70-verification.md` | adversarial verification — **authoritative** for every verdict, severity and pin in this report (incl. §2.1 twin adjudications; refreshed in place) |
| `reviews/0.6.24/07-findings.json` | **the stable machine-readable anchor** (43 121 B, sha256 `E893B8F0…`): 42 findings + merged `XL-02` + the four `cross_lane_twins` rulings + 12 carry-over rows + 15 refuted sub-claims |
| `reviews/0.6.24/evidence/captain-deploy-check.md` | the captain's raw deploy checks and byte copies (settles `XL-01` high-not-blocker and the `XL-02` N-1 deploy row) |
| `reviews/0.6.24/evidence/` | every probe, raw output dump and guard-reproduction artifact cited above (`py_probes.py`, `v7_*`, `we-*`, `t5-*`, `v7-*`) |
| `reviews/0.6.24/REVIEW-0.6.24.md` | **this file** — the single consolidated deliverable (revision 4) |

**Read-only attestation.** No tracked file was modified by this review, and nothing under the
untracked `reviews/` scratch is shipped. At integration time and at this revision
`git status --porcelain` = `?? .agent-teams/` + `?? reviews/` and `git diff --stat` is empty; the only
additions are the review artifacts above. `data/`, `dist/` and `logs/` were never written. Network use
was read-only (FTP `list`/`download`, one loopback TLS reproduction). No `git add`/`commit`/`tag`, no
`build.ps1`/`build_core.py`/`make_release.py`/`build_web.py`/`ftps_deploy.py` write was executed.
