# Adversarial verification — NightSeam 0.6.24 full review (t7, verifier)

**Subject:** the working tree at HEAD `9596878` (`git describe` = `v0.6.24-2-g9596878`),
tracked tree clean (`git status --porcelain` = `?? .agent-teams/` + `?? reviews/`;
`git diff --stat` empty). Review only — no production file was changed.
**Charter:** `reviews/0.6.24/00-charter.md` (t1). Lane inputs: `10-python.md`,
`20-core.md`, `30-web.md`, `40-desktop.md`, `50-tests-tooling.md`.
**Method:** every filed finding was re-derived from the source and, where the
environment allows, re-run by an independent pass that did not read the lane's
probe output: a t7 first-hand pass on the high/medium tier, plus one independent
verification pass per lane (t7's own subagents, whose raw output is under
`reviews/0.6.24/evidence/v7-*`). Each claim was attacked with the observation
that would have refuted it (stated per record). Verdicts use the charter §10
vocabulary; severity is re-assigned by impact per §5.
**Evidence labels:** `[t7]` = first-hand command/read by the verifier of record;
`[v-py] [v-core] [v-web] [v-desktop] [v-to]` = the independent per-lane pass.
Every quoted command was re-run at HEAD; git evidence is reproducible with the
commands shown.

---

## 1. Summary

- **Filed:** 42 findings (PY 7, CO 4, WE 5 incl. `XL-01`, DE 15, TO 11) plus 12
  carry-over rows. **Unique after de-duplication:** 41 (`CO-02` ≡ `TO-01`, merged
  as `XL-02`).
- **Verdicts:** **42 confirmed** — 34 at the lane's asserted severity, **6
  re-ranked upward** (`CO-01`, `CO-02`/`XL-02`, `DE-01`, `DE-03`, `DE-07`,
  `DE-08`), 1 re-classified as `static-only`/unranked (`CO-04`), 1 with a
  corrected trigger at the same severity (`PY-07`). Verified severities across
  the 42 rows: **6 high, 10 medium, 26 low**. In §2's table,
  `repro_class = static-only` is a **reproduction** class (no executable repro in
  this environment), **not** a rank: every CONFIRMED static-only claim is ranked
  at its verified severity, and the only filed claim excluded from the ranked
  list is `CO-04` (impact unreachable — §6). **0 findings fully refuted**;
  **15 refuted sub-claims, mechanism statements or evidence lines** are logged in
  §5 — including one whole mechanism (`CO-01`'s "far edge of the mask" story)
  that was *replaced* by a stronger, reproducible one, and one carry-over
  resolution (`DS4` "CLOSED") that was overturned.
- **Severity changes:** `CO-01` medium→**high** (mechanism rewritten, §5/R1);
  `CO-02`+`TO-01` → merged `XL-02` at **medium** (the charter names this class as
  its medium example; the live deploy mitigates the user-visible half);
  `CO-04` → **static-only**, not ranked (impact unreachable — §6);
  `XL-01` asserted-high / one pass argued blocker → verified **high** (the live
  deploy was independently verified correct, §5/R2); `DE-01` medium→**high**
  (the plan silently omits the just-added target in every view);
  `DE-03` medium→**high** (pinned invariant + stored-data overwrite);
  `DE-07` low→**medium** (the active site's stored coordinates are overwritten);
  `DE-08` low→**medium** (a dismissal opens an external browser tab).
- **No `blocker`-severity finding was admitted.** `XL-01` is the only blocker
  candidate and it is refuted as blocker by evidence (the deployed tree is
  post-fix), not by argument.
- **No lane finding was dropped silently:** every one of the 42 appears below in
  §2/§3, including the one that is not ranked (§6).

### 1.1 Verdict table (all 42, contract order = lane file order)

| id | lane | asserted | verified | verdict | repro_class | regression |
| --- | --- | --- | --- | --- | --- | --- |
| PY-01 | python | medium | medium | CONFIRMED (mechanism narrowed, §5/R3) | repro | pre-existing (<0.6.23) |
| PY-02 | python | low | low | CONFIRMED (static-only → real repro) | repro | pre-existing |
| PY-03 | python | medium | medium | CONFIRMED (one sub-claim refuted, §5/R4) | repro | pre-existing |
| PY-04 | python | high | high | CONFIRMED (nan mechanism corrected, §5/R5) | repro | pre-existing |
| PY-05 | python | low | low | CONFIRMED | repro | pre-existing |
| PY-06 | python | medium | medium | CONFIRMED (was static-only → local repro) | repro (local) | pre-existing |
| PY-07 | python | low | low | CONFIRMED (trigger refuted, §5/R6) | repro | pre-existing |
| CO-01 | core | medium | **high** | **UPGRADED** (mechanism replaced, §5/R1) | repro | pre-existing |
| CO-02 | core | low | **medium** | **UPGRADED**, merged into `XL-02` | repro | pre-existing |
| CO-03 | core | low | low | CONFIRMED | repro | pre-existing |
| CO-04 | core | low | (low) | CONFIRMED, **static-only → not ranked** | static-only | pre-existing |
| XL-01 | web (+tooling) | high | **high** | CONFIRMED (blocker claim rejected, §5/R2) | repro (git) | regression-0.6.24 (missed bump); guard gap pre-existing |
| WE-01 | web | medium | medium | CONFIRMED | repro | pre-existing |
| WE-02 | web | high | high | CONFIRMED | repro | pre-existing |
| WE-03 | web | low | low | CONFIRMED | static-only | pre-existing |
| WE-04 | web | low | low | CONFIRMED (lane evidence line wrong, §5/R7) | static-only | pre-existing |
| DE-01 | desktop | medium | **high** | **UPGRADED** (wrong plan in every view) | static-only | pre-existing |
| DE-02 | desktop | medium | medium | CONFIRMED | static-only | pre-existing |
| DE-03 | desktop | medium | **high** | **UPGRADED** (pinned invariant + stored-data loss) | static-only | pre-existing |
| DE-04 | desktop | low | low | CONFIRMED | static-only | pre-existing |
| DE-05 | desktop | low | low | CONFIRMED | static-only | pre-existing |
| DE-06 | desktop | low | low | CONFIRMED | static-only | pre-existing |
| DE-07 | desktop | low | **medium** | **UPGRADED** (stored coordinates overwritten) | static-only | pre-existing |
| DE-08 | desktop | low | **medium** | **UPGRADED** (unwanted external navigation) | static-only | pre-existing |
| DE-09 | desktop | low | low | CONFIRMED | static-only | pre-existing |
| DE-10 | desktop | low | low | CONFIRMED | static-only | pre-existing |
| DE-11 | desktop | low | low | CONFIRMED | static-only | pre-existing |
| DE-12 | desktop | low | low | CONFIRMED | static-only | pre-existing |
| DE-13 | desktop | low | low | CONFIRMED | static-only | pre-existing |
| DE-14 | desktop | low | low | CONFIRMED | static-only | pre-existing |
| DE-15 | desktop | low | low | CONFIRMED | repro (re-read) | pre-existing |
| TO-01 | tooling | medium | **medium** | CONFIRMED, merged into `XL-02` (= CO-02) | repro | pre-existing |
| TO-02 | tooling | medium | medium | CONFIRMED | repro | pre-existing |
| TO-03 | tooling | low | low | CONFIRMED (reachability narrowed, §5/R8) | repro | pre-existing |
| TO-04 | tooling | low | low | CONFIRMED (TL3, partially superseded) | repro | pre-existing |
| TO-05 | tooling | low | low | CONFIRMED | repro/static | pre-existing |
| TO-06 | tooling | low | low | CONFIRMED (both halves) | repro | pre-existing |
| TO-07 | tooling | low | low | CONFIRMED (TL5, open by design) | repro | pre-existing |
| TO-08 | tooling | low | low | CONFIRMED (TL4, static) | static-only | pre-existing |
| TO-09 | tooling | low | low | CONFIRMED (TS4) | repro | pre-existing |
| TO-10 | tooling | low | low | CONFIRMED (TS7; mitigation only partial, §5/R9) | repro | pre-existing |
| TO-11 | tooling | low | low | CONFIRMED (TL-adjacent; live reproduction in §8) | repro | pre-existing |

No row is `REFUTED`. §5 lists what *was* refuted (sub-claims), §6 what is
static-only.

---

## 2. Merged duplicates

| merged id | parts | owner lanes | note |
| --- | --- | --- | --- |
| `XL-02` | `CO-02` (t3) + `TO-01` (t6) | core + tooling | Same defect: the baked-core N-1 retention policy cannot be satisfied. t3-unique content = the baker (`build_core.py` rmtree's every dir) + the live-deploy check; t6-unique content = the guard wiring (`check_js.py:33`, `check_release.py`) and the doc line `AGENTS.md:518`. Both lanes' ids are preserved in `07-findings.json`. |

No other cross-lane duplicate exists: `XL-01` was filed once (t4) and
cross-checked by t6; `CO-04`/`CO-01` are the `CR2`/`CR3` **carry-over rows**, not
duplicates of another finding; `PY-03` is adjacent to `CR2` but distinct (storage
boundary vs producers), which both passes confirm.

### 2.1 Cross-lane twins adjudicated (captain's open questions)

| pair | t7 ruling | reason |
| --- | --- | --- |
| `CO-02` ≡ `TO-01` | **ONE defect**, merged as `XL-02` | Same unsatisfiable N-1 retention policy; t3 owns the baker + deploy half, t6 owns the guard wiring + the false `AGENTS.md:518` sentence. |
| `XL-01` ≡ `E15` | **NOT duplicates**: one ranked finding + one carry-over row that resolves against it | `XL-01` is the concrete 0.6.24 release instance; `E15` is the standing per-module token-discipline gap whose pin (`tests/test_cache_tokens.py:40-61`) is doc==source only. §4 keeps `E15` open at medium with `XL-01` as its instance. |
| `DE-03` vs `WE-02` | **TWO findings, kept ranked separately** | They are the same invariant sentence violated in *opposite* directions on the two shells: the web keeps a stroke-less stored profile when the mode changes (mode-invalid), the desktop discards it (data loss). The AGENTS "clearMask() is the one place" sentence supports the web's *keep*; the sky-mode sentinel semantics (`unpainted sky columns stay at 90`) support the desktop's *re-blank*. Merging them would hide that one fix must first decide the intended semantics; both stay as filed (desktop high, web high) with a cross-reference, and t8/t9 must record the ruling before either is repaired. |
| `PY-03` desktop half vs `WE-02` | **distinct**, explicitly distinguished | `PY-03` is the *storage/import* boundary accepting a junk `strokes` shape (the desktop consumer then throws at `pano.js:670`); `WE-02` is the *editor* failing to re-derive a profile when strokes disappear. The web twin of `PY-03` is guarded (`core/horizon.js:264` `Array.isArray`), which is the two-shell divergence `PY-03` needed. |

---

## 3. Per-finding records (independent evidence)

### Python lane (`10-python.md`)

**PY-01 — CONFIRMED, medium, repro, pre-existing.** `safe_rel` canonicalization
(`app/backup.py` image loop 184-198, panorama loop 169-182) + `import_bundle`
inserting every record (`app/database.py:854-869`). `[v-py]` reproduced the lane's
own bundle (`import -> 200 {"images":2,"library_files":2}`, two rows, one file) and
then **narrowed the mechanism**: two canonically-equal rels re-read the same ZIP
member, so the image bytes are only lost when the two paths are *different
strings that alias on the filesystem* — case-differing rels
(`…/a.fit` vs `…/A.FIT`) produced `content -> b'SECOND'` (FIRST gone) with
`/api/library total_images=2`. **Refuted:** the cited `database.py:505-527` is
`active_panorama`, not `panoramas()` (real: 492-503) — §5/R3. Impact unchanged
(medium): byte loss + duplicate rows need a crafted/hand-edited bundle.
*Falsifier tested:* if the loop deduplicated normalized targets, the later write
could not clobber.

**PY-02 — CONFIRMED, low, repro, pre-existing.** `_write_safety_copy` returns
`None` on any exception (`app/backup.py:91-102`), the copy precedes
`import_bundle` (:137 vs :166) and the `auto_backup: null` summary is returned
verbatim (:207). `[v-py]` turned the lane's static-only chain into a real repro:
a **directory** at `<db>.backup-auto.zip` → `import -> 200 {…,"auto_backup":null}`,
`sites before [] after ['Imported']`, `safety zip exists -> False`. **Refuted
sub-claim:** `static/js/setup.js:189-191` does read `auto_backup` (it only drops a
reassurance sentence; no warning is shown), so "no caller checks it" is wrong but
the silent-degradation conclusion holds. Low stands (best-effort by design).

**PY-03 — CONFIRMED, medium, repro, pre-existing.** Asymmetric validation:
`_validate_import_profile` rejects `profile=[1,2]`/`profile_top=[1,2]` with
`400 "…must be empty or exactly 720 finite numbers"`, while
`json.dumps(p.get("strokes", []))` (`app/database.py:826`) stores `{}`, `"abc"`,
`7`, `[{}]*700` — all `200`. Consumer half reproduced independently: node
`for (const s of {})` throws `TypeError: v is not iterable` for `{}` and `7`
(`static/js/pano.js:652` guard misses them, loop at 670). Read half: a
hand-written `strokes='{not json'` row → `/api/state 500` + `/api/panoramas 500`
(`json.loads` at `database.py:498`), aborting desktop boot at `main.js:161`.
**Refuted sub-claim (§5/R4):** "PUT /api/panorama/{pid} hands it through
unchanged" — `PUT {"strokes": {"a":1}} -> 422` (pydantic `Optional[list]`,
`server.py:157`); junk *lists* do pass. The lane itself flags that the 500 half
needs malformed storage (no bundle can plant it), which the pass confirms.
Medium stands.

**PY-04 — CONFIRMED, high, repro, pre-existing.** `[t7]` wrote and ran an
independent probe (`reviews/0.6.24/evidence/v7-py-nonfinite-probe.py`, exit 0):
`parse_ra_hours('nan'/'inf'/'-Infinity'/'1e400'/'1e309')` all return non-finite
floats (`app/fits.py:121`, `_parse_value` :108); case A `OBJCTRA='Infinity'` +
unmatchable hint → `ingest 500`, nothing written, `[]` rows; case C
`EXPTIME='1e400'` → `ingest 500` **with** the frame written
(`Andromeda Galaxy/undated/lights/probe.fit`), `images -> [('probe.fit', inf)]`,
`batches -> [('Andromeda Galaxy', inf)]`, and then `/api/library 500`,
`/api/library/imports 500`, `/api/state 200`, `export 200` with the bare
`Infinity` token. `[v-py]` adds `OBJCTRA='nan'` → `200` plus silent mis-filing
under an unrelated catalog object with the catalog's RA/Dec replacing the header's.
**Refuted wording (§5/R5):** the lane's nan explanation ("every comparison false →
matcher returns None") is wrong — `min(1.0, nan) = 1.0 → acos(1.0) = 0.0`, so the
first catalog row wins deterministically (`abell21` ×3); the "two different
objects" observation did not reproduce. "No JSON parser accepts `Infinity`" is an
overstatement (Python's `json.loads` does; JS `JSON.parse` does not). High stands:
user-reachable, persistent 500s on the Library tab + stored `inf`, no boundary
breach. A blocker reading was considered and rejected (the required header class
is uncommon and recovery does not need a reinstall).

**PY-05 — CONFIRMED, low, repro, pre-existing.** `POST /api/settings
{"active_pano_id": "../../evil"} -> 200`, `/api/state` reports it while the
id-taking routes answer `404` (`_pano_or_404`/`safe_token`); an imported bundle's
`settings.active_pano_id` reaches the same state (non-strings are rejected with
`400`, `database.py:64-66`). `[v-py]` addendum: `set_active_panorama` first runs
`UPDATE panoramas SET active=0` (`database.py:519`), so the bogus id also
deactivates the real active panorama and the client plans with no horizon
(`derive.js:283-284`). No file operation reachable → low.

**PY-06 / `PY6` — CONFIRMED, medium, repro (local), pre-existing.** `[t7]`
re-read `app/images.py:56-65/104-128`: the context is chosen from the **original**
URL's host, and `urlopen` follows a 30x on the same opener, so the relaxed context
reaches the redirect target. `[v-py]` replaced the lane's static-only chain with a
local reproduction: a 302 from the allow-listed host to
`https://evil.example.net/…` executes with `ctx is _INSECURE_CTX -> True`
(`verify_mode=0/CERT_NONE`, `check_hostname=False`), while a non-allow-listed
first hop gets `ctx=None`; stdlib path `HTTPSHandler(context=…)` +
`http_error_302 → self.parent.open(…)` with no `_INSECURE_HOSTS` re-check; sink
`images.py:377 cache_path.write_bytes(blob)`. Medium stands (the allow-listed CDS
host must redirect/be compromised; image bytes only, no user data).

**PY-07 — CONFIRMED, low, repro (mechanism), pre-existing, STATED TRIGGER
REFUTED.** `[v-py]` demonstrated the tear with one concurrent committer:
`TORN copies (mixed rows) -> 33/633`, each `integrity='ok' distinct_v=2`, vs a
quiescent control `distinct_v=1`. **Refuted (§5/R6):** the lane's trigger "on
every boot … the server thread keeps writing" is impossible — `make_backup()` has
one call site (`app/database.py:266` at the end of `Database.__init__`) and
`main.py:235 Database() → 236 create_app() → 248-249` starts uvicorn afterwards,
so no writer exists yet. The reachable trigger is a **second process during the
boot window** (`data/instance.json` is written at `main.py:263`, after the
constructor — the code's own comment at `main.py:219-221` names that tear). Low
stands (manual-recovery artifact, regenerated next boot).

### Core lane (`20-core.md`)

**CO-01 / `CR3` — CONFIRMED (mechanism REPLACED), UPGRADED medium→high, repro,
pre-existing.** `[t7]` and `[v-core]` independently re-derived the coverage rule
and both **refuted the lane's right-edge story**: `profileFromMask` fills a world
bin from its **left edge** (`core/horizon.js:107-110`) while `ceilFor`
(`:399-403`) and the scorer (`core/scoring.js:147-148`, `:151-152`) gate the
**continuous** azimuth with `d > fov`. `[t7]`'s own probe
(`v7-verify-co01.mjs`) with a fully painted mask: `fov=45 azOffset=0.06` →
`carriedBins=90`, `prof[0]=-90` (sentinel) while `prof[1]=45` (painted) and
`ceilFor(0.07/0.28) = -90`, `ceilFor(0.51) = 45`; `azOffset=12.3` → `prof[24]=-90`,
`ceilFor(12.31/12.40) = -90`, `ceilFor(12.51) = 45`; `azOffset=0`/`fov=360` → no
gap. So whenever `azOffset` is **not a multiple of 0.5°** (the normal outcome of a
crop: `core/horizon.js:313-315` rounds the kept-band edge to 2 dp), the frame's
first partial half-degree bin keeps the mode sentinel: obstacle mode reads
"nothing blocks" over painted band, sky mode reads "fully blocked" — the unsafe
direction AGENTS names ("a blocked target look observable"). `[v-core]` adds the
shipped-producer chain (`web/horizon.js:1256 cropPano`, `static/js/pano.js:364-370`
2-dp `az_offset`, plus the desktop re-implementation of the same rule at
`pano.js:683`) and a scoring run: `scoreNightTracks` → `visN=1 pct=50` although all
three samples sit inside the painted band. **High** on the rubric (user-reachable
incorrect behaviour, plausible trigger, the charter's own high example class is a
boundary-index scoring bug); the reachable window is ≤0.5° of azimuth at the frame
start, so a `medium` reading is defensible and is flagged for t8 rather than
hidden.

**CO-02 / `TO-01` → `XL-02` — CONFIRMED, medium (merged), repro, pre-existing.**
`[t7]` read `scripts/build_core.py:96-100` (rmtree of **every** existing hash dir
in `web/core` + `static/js/core`) and `scripts/check_core.py:123-125`
(`dirs != [hash_]`); `git ls-tree -d --name-only` gives
`v0.6.23 → 79ad99ef15810ca2`, `v0.6.24`/HEAD → `97c2e182fb0a5630` (18 tracked files,
one dir per tree). `[v-core]` ran the guard on a staged copy with N-1 present:
exit 1, `web: baked hash dirs ['79ad99ef15810ca2','97c2e182fb0a5630'] !=
['97c2e182fb0a5630']` (+ the static twin) — i.e. **following the documented policy
fails the guard**, wired at `scripts/check_js.py:33`/`check_release.py`.
`[t7]` independently listed the live tree:
`python web/ftps_deploy.py … list /astro/core` → `784ef08ceaafccf7`,
`97c2e182fb0a5630`, `79ad99ef15810ca2`; `[v-core]`/`[v-to]` show the N-1 dir serves
`200` while a bogus hash serves `404`. **Two residuals beyond the lane's text:**
the deployed tree also carries `784ef08ceaafccf7`, an **older-than-N-1** dir that
AGENTS.md says to remove at the next re-bake (no guard can see it, because
`check_core.py` only inspects the local tree), and a wiped/re-uploaded `/astro`
would lose the N-1 fallback entirely because the repo cannot carry it. Verified
**medium** (tooling/release-path impact; the live deploy satisfies the stated
purpose, so not high; the charter's own medium example is "a guard that only
checks the current baked-core dir").
`[v-to]` preferred low on the live-deploy evidence — recorded, not averaged: the
repo cannot carry N-1, the official baker removes it, and a policy-following
release step is blocked, which is the medium definition ("dev-/tooling-only
impact"). Doc lines that are **false** and should be corrected: `AGENTS.md`'s
"check_core.py only requires the current dir" (it *forbids* more) and "the
deployed /astro tree must match" (the deploy legitimately carries N-1/N-2).

**CO-03 — CONFIRMED, low, repro, pre-existing.** `[t7]` read
`scripts/check_core.py:141` (`WEB_DIR.glob("*.js")`) and `:163-166`
(`base.glob("*.js")`) against `:157`/`:199` (rglob). `[v-core]` demonstrated it on
a staged copy: `web/lib/geom.js` re-implementing `ceilFor`/`computeProfile`
(+ the static twin) → `check_core: OK` (evaded), while the same body at top level
(`web/zzcontrol.js`) → exit 1 `"ceilFor() must live in core/ only"`; and a
subdirectory stub importer (`../core.js?v=99`) is invisible because the regex at
`:144` requires the literal `./core.js?v=`. No non-core `.js` subdirectory exists
in `web/` or `static/js/` today (`[t7]`: only `core/`, `img/`, `__pycache__/`) →
latent, low.

**CO-04 / `CR2` — CONFIRMED, static-only, not ranked (impact unreachable), repro
of the behaviour.** `[t7]` read `core/horizon.js:202-206`
(`p.profile[col]`/`p.profileTop[col]` unguarded) against the guarded siblings
(`:390-398`, `:421-423`, `:438`, `:459-461`, `:492-494`). `[v-core]`'s probe:
`visibleSkyBands(null)`/`({})`/`{profile:720,sky,no profileTop}` all throw while
the siblings return `{-90,null}`/`null`/`[]`; **reachability refuted from every
shipped producer** (the only caller chain is `skyBandPolygons:229` ←
`web/horizon.js:963` `drawProfile`, which dereferences `p.strokes` first, and
`load`/`normalizePanos`/`newPano` install 720-length arrays). Two corrections to
the lane: `profileSegments` (`:174`) also throws on a null profile, and
`normalizeProfileBins`'s early return on `profileBins === 'world'`
(`core/horizon.js:139`) means `load()` cannot repair such a record. Per charter
§3/§3.1 this is **not admitted to the ranked list** (only a hand-edited
IndexedDB record reaches it) and it carries the `CR2` row in §4.

### Web lane (`30-web.md`)

**XL-01 — CONFIRMED as a release-artifact defect, verified high (blocker claim
rejected), repro (git), regression-0.6.24 for the missed bump.** `[t7]`
independently: `git grep -n "?v=" v0.6.24 -- web/index.html web/app.js` →
`app.js?v=59`, `astro 9 / horizon 40 / webstore 19 / format 16 / nightrank 6`,
`core.js?v=17`; HEAD → `60/10/41/20/17/7` (+ `dragwin 1`, `style 16`, `themes 4`,
`CATALOG_TOKEN '2'`); `git diff --stat v0.6.23 v0.6.24 -- web` shows the module
bytes changed (app.js, astro.js, format.js, horizon.js, nightrank.js,
webstore.js) with unchanged tokens; `git tag --contains 208f7d6` is empty and
`git log --oneline v0.6.24..HEAD` = `9596878`, `208f7d6` (the token fix), so the
bump is **post-tag**. `[v-web]` adds that `git diff v0.6.23 v0.6.24 --
web/index.html` is **empty** (the cached `app.js?v=59` URL is reused exactly) and
that every guard is blind (`test_cache_tokens.py:40-61` compares the AGENTS
register to the sources — both stale at the tag, so it **passed**;
`check_catalog_token.py:86-93` does the byte-vs-token git check for
`catalog.json` only; `check_core.py:143-150` only for core-stub importers).
**Blocker rejected on evidence (§5/R2):** `[t7]` downloaded the live tree
(`web/ftps_deploy.py … download /astro/index.html|app.js`, read-only) —
`app.js?v=60` and `sha256(app.js) = 30F61EE3…D24623` **byte-identical to HEAD**,
confirmed against a second independent copy; the post-fix tree is what is
deployed, so no returning visitor received the stale modules and no wrong
artifact reached users. What remains is a real, demonstrated release-rule
violation with a plausible trigger (deploy from the tag, as the documented order
instructs) and no detecting guard → **high**. **Severity dissent recorded, not
averaged (charter §5):** t4 asserted high (`30-web.md`), t6 asserted medium
(their §5 hand-off, whose stated upgrade path was "the tagged `web/` tree was
uploaded before `208f7d6`"), and t7 verifies high — the FTP evidence answers that
upgrade question **no**, so the verified rank rests on the release-integrity half
(a released tag violated a pinned invariant that no guard can catch), not on
user-reachability. The process-impact re-rank the
captain asked for was considered explicitly: since visitor harm is refuted, the
*only* route to a lower rung is the medium tier's "dev- or tooling-only impact",
and that is rejected because the failure mode if the trigger fires is
user-facing (every returning visitor keeps the old module graph), the violated
rule is a pinned release guarantee, and the guard suite passed a tree that breaks
it. High is the honest rank; `medium` would describe the *observed* harm today,
not the defect.

**WE-01 — CONFIRMED, medium, repro, pre-existing.** `[t7]` read both sides:
`web/app.js:942-944` strokes the `ceilPts` path **unconditionally**, while
`static/js/skyview.js:285` (`if (activePaintMode() !== "sky")`, with the
"spurious inner circle with radial connectors" comment at `:282-284`) suppresses
it. In sky mode an unpainted/out-of-FOV column is `90`
(`core/horizon.js:105`, `:402-403`, `:412`) → `radiusFor(az, 90)` = `R*(1-1)` = 0
= the zenith centre, so the stroked path alternates between the band edge and the
centre. `[v-web]`'s node probe: `111 of 181 sampled az points are at r=0` and the
path crosses the centre twice; the same for a fully painted band at `fov=180`.
Cosmetic, no number changes; the web side is **unpinned** (the cross-app test
`tests/test_ui_invariants.py:328-339` checks the desktop file only). Medium.

**WE-02 — CONFIRMED, high, repro, pre-existing.** `[t7]` read the chain:
`applySnapshot` (`web/horizon.js:366-371`) restores strokes/calibration/mode only;
`drawProfile` re-derives only `if (p.strokes.length > 0)` (`:933-939`);
`doUndo`/`doRedo`/`revertSession` (`:1056-1076`) only rebuild mask + overlay; the
`#ed-mode` handler (`:1331-1336`) only assigns `paintMode`; `saveSession`
(`:1080`) → `core/horizon.js:263-278` keeps the stored profile when stroke-less;
`snapshotPano` (`:360-363`) excludes the profile, so `dirty()=false` ("Saved") on
a modified profile. `[v-web]`'s probe against the **shipped** module:
`afterUndo=29.916…` (expected −90) with `historyDirty=false`; survives
`computeProfile`+Save and a reload; `#ed-mode` to sky on a stroke-less record
leaves `-90` while the preview says "fully blocked" (canonical blank = 90) and an
object at alt 30/min-alt 25 flips visible↔not. The desktop twin does the opposite
on both paths (`static/js/pano.js:148-157`, `:167-175`). High: ordinary editor
gestures (undo the first stroke / Revert; or create → "Sky band" → Save) make
planning follow a discarded or mode-invalid ceiling, the unsafe direction, and it
persists (`app.js:521 flushHorizonEdits`). `tests/js/pano_ui.mjs` pins the
strokes/calibration/dirty part and never the profile, which is why the suite is
green.

**WE-03 — CONFIRMED, low, static-only, pre-existing.** `[v-web]` re-read the
lines: `web/app.js:140`, `:142`, `:159`, `web/astro.js:4`, `:73` name
`app/planning.py` / `app/nightcalc.py` / `app/astro.py`, and
`git ls-files | Select-String 'nightcalc|app/astro\.py|app/planning\.py'` is
empty. **Cross-lane note:** the same stale-oracle class also exists in `core/`
**source** (`core/astro.js:10,48,163`, `core/planning.js:4,14,61,84`), which the
web lane disclaimed as "generated"; that is a core-lane coverage gap (§8), not a
second finding.

**WE-04 — CONFIRMED, low, static-only, pre-existing.** `[t7]`/`[v-web]`:
`web/app.js:1988` says the free-space slider "lives in the hamburger menu under
**Layout**"; `web/index.html` has Appearance/Display/Advanced/Data/About (the
slider is in Display, `:88-93`). **Refuted evidence line (§5/R7):** the lane's
`grep -n "Layout" static/` "is empty" is false (20 CSS-class hits); its narrower
claim (no such sentence in the desktop setup text) is true, so the verdict
stands.

### Desktop lane (`40-desktop.md`)

`[v-desktop]` drove the real modules under DOM/canvas stubs
(`v7-pano-probe.mjs`, `v7-ceil-probe.mjs`), re-ran the lane's two probes
(`t5-grid-probe.mjs`, `t5-ds5-revive.mjs`), `pytest tests/test_ui_invariants.py`
(26 passed) and `check_dom_ids.py` ("200 ids in html, 182 referenced from js",
0 missing). Every DE item is pre-existing: `git diff --stat v0.6.23..HEAD --
static` touches only the crop path (`pano.js`) plus the core re-bake.

**DE-01 — CONFIRMED, UPGRADED medium→high, static-only, pre-existing.** `[t7]`
read both ends: `static/js/setup.js:216` runs `refreshCatalogMeta(); renderCustomList();
renderTargets();` with **no** `loadNight()`, while `targets.js:117-135` returns
early on `!S.night` and otherwise iterates `S.night.objects` and prints
`${rows.length} of ${S.catalog.length} objects … filtered` — so a newly added
custom target is absent from Targets/Tonight/Sky and the counter reads
"197 of 198 · filtered" until an unrelated reload. Sibling mutators do reload
(`setup.js:55/332/338`). `[v-desktop]` enumerated every `loadNight`/
`scheduleLoadNight` call site (`setup.js:55,171,332,338`, `header.js:18,21`,
`pano.js:303,314`, `wizard.js:73`, `main.js:165`) — none is on the add path — and
confirmed the delete half is safe (`targets.js:126`, `skyview.js:461`,
`tonight.js:39`). **High:** the app answers the question the user just asked
("can I see this target tonight?") with a plan that omits it, in every view, from
a normal action; the lane's medium understates a wrong core output.

**DE-02 — CONFIRMED, medium, repro (stubbed DOM), pre-existing.** `[t7]`:
`pano.js:460-461` reuses `Pano.maskCv` whenever `width/height` match, `render()`
draws it at `:462`, and `select()` (`:262-295`) never calls `invalidateMask()`
(defined `:405`). `W = stage.clientWidth-2` and
`H = round(clamp(W*ih, 200, innerHeight*.72))` (`:447-449`), so two panoramas with
the same aspect (or both clamped) get identical `W/H` and the **previous**
panorama's mask is drawn over the new photo until an edit invalidates it.
`[v-desktop]`'s `v7-pano-probe.mjs` (real `pano.js` under DOM/canvas stubs):
`recordSwitchedWithoutInvalidate=true`, `canvasesCreatedOnSecondRender=0`, the
drawn mask carries A's stroke; forcing `maskCv=null` rebuilds to 0 arcs, proving
the cached canvas is A's. Stored data unaffected (display-only). Medium.

**DE-03 — CONFIRMED, UPGRADED medium→high, repro (stubbed DOM), pre-existing.**
`[t7]`: `static/js/pano.js:148-157` `setPaintMode()` sets
`profile=[]; profile_top=[]` and then `recomputeProfile()`, which for a
stroke-less record fills the canonical blank (`:652-659`: `sky ? 90 : -90` for
every bin) and `scheduleSave(0)` persists it — while the module's own comment
(`:646-651`) and the AGENTS invariant say "with NO strokes the stored
profile/profileTop are AUTHORITATIVE … Deliberate clearing goes through
`clearMask()`, the one place a stored profile is discarded". `[v-desktop]`'s probe
S2 drove the real module: a 720×20 record plus one `#modeSky` click produced a
720×90 profile **and the PUT body carried it**; the web twin
(`web/horizon.js:1331-1336`) sets only `p.paintMode` and keeps the stored profile.
One click therefore **destroys** a stroke-less (imported/legacy) horizon and
writes the blank; in obstacle mode the blank is all `-90` ("nothing blocks"), the
unsafe direction. High (pinned-invariant violation that silently replaces stored
data in a user-reachable path). `[v-desktop]` corrections: the lane's ":10-13 the
mode buttons" is wrong (buttons `index.html:360-361`, bound `pano.js:35-38`), and
`undoPaint:167-175` (`:170-171` empties the profile, `:174` schedules the save) is
an **unfiled twin site** with the same defect. **Cross-lane conflict for t8/t9:**
DE-03 and WE-02 are mirror images — WE-02 says the *web* is wrong for **not**
re-deriving on a mode switch and cites `pano.js:148-157/167-175` as the correct
behaviour, while DE-03 says the *desktop* is wrong for destroying the stored
profile. Both cannot be right; the AGENTS "one place" sentence (already present in
`git show v0.6.23:AGENTS.md`) is what DE-03 rests on, so the owner must rule
which side is intended before either is "fixed".

**DE-04 — CONFIRMED, low, repro (stubbed DOM), pre-existing.** `[t7]`: every
gesture schedules a debounced PUT (`pano.js:735-737`, 900 ms) and `select()`
cancels the pending timer (`:266-268`) instead of flushing it; `grep -n
"beforeunload\|pagehide\|onunload" static/js/*.js static/index.html` has no match,
so an edit inside the window is lost on switch or close. `[v-desktop]` probe S3:
`timerPendingAfterGesture=true`, `timerAfterSwitchingRecord=null`,
`putSentBeforeSwitchDeadline=0`. Low (short window), though the loss is silent and
the in-memory copy also dies when the next record's save refetches `S.panos`
(`:759`).

**DE-05 — CONFIRMED, low, repro (stubbed DOM), pre-existing.** `[t7]`: in
`scheduleSave` the `try` covers only the PUT; `S.panos = await api("/api/panoramas")`
and the `Pano.cur` rebind (`:759-761`) run outside it, so a failed list fetch
rejects unhandled, `Pano.cur` can be `null` (deleted at `:309`), and a concurrent
switch lets the refetch+rebind discard the newly opened panorama's in-memory
strokes. `[v-desktop]` probe S4 (held PUT, then `Pano.cur=null`):
`unhandledRejection: Cannot read properties of null (reading 'id')`. Low (needs a
failing server or a switch inside the save window).

**DE-06 — CONFIRMED, low, static-only, pre-existing.** `[t7]`/`[v-desktop]`:
`weather.js:34-36` snapshots the site, `:52-57` writes `WX_STATE` unconditionally
after the await, and `refreshWeatherForSite` (`:119-121`, wired at
`header.js:19`) can start a second request, so an older response can label the
current site with another site's numbers. Decorative data only. Low.

**DE-07 — CONFIRMED, UPGRADED low→medium, static-only, pre-existing.** `[t7]`:
`openWizard()` (`wizard.js:116-124`) resets `_step` only, while `_formState` is
module-level (`:11`) and `saveForm()` (`:179`→`:200-201`) fills it on the first
run; on replay `restoreForm(1)` (`:217`) writes the old values and the active-site
prefill is skipped because `if (!_formState[1] …)` (`:228`) is false, so
`validate()` — which resolves its PUT target at click time (`:62-66`) — overwrites
the **currently active** site's stored name/lat/lon/elev with the first-run
site's. `[v-desktop]` confirmed `_formState` is never cleared (grep: `:11,200,204,228`).
**Medium** (the lane said low): the defect silently rewrites persisted user data
that all planning then uses; the stale values are visible in the fields before
Next, which is why it is not high.

**DE-08 — CONFIRMED, UPGRADED low→medium, static-only, pre-existing.** `[t7]`:
`util.js:152-155` appends the `×` button to the toast box with a click handler
that only calls `box.remove()` (no `stopPropagation`), and `updater.js:42-45`
binds the click on the box itself → clicking `×` on the update notice bubbles and
`window.open(SITE, "_blank")` opens the download page (DOM removal during dispatch
does not abort propagation). Deterministic. **Medium** (the lane said low, the
ladder reserves low for "no behavioural impact"): dismissing a notice causes an
unwanted external navigation, even though no data or product function is
affected. `[v-desktop]` nit: the lane's `util.js:156` is off by one
(`appendChild` is `:155`).

**DE-09 — CONFIRMED, low, static-only, pre-existing.** `[t7]`:
`header.js:75-81` sets `S.cfg.moon_aware` then `await api(...)` **without a
catch**, so a failed settings POST rejects unhandled and the
`prefs:changed` dispatch at `:80` never runs (no re-derive); the same shape is in
`setup.js:114-144`. Neighbouring handlers in the same file do catch. Low (needs a
local server failure).

**DE-10 — CONFIRMED, low, repro (stubbed DOM), pre-existing.** `[t7]`:
`pano.js:501-517` samples `sw = 2*R/Z*dpr` device px into the fixed
`#loupeCv` 140×140 backing store (`static/index.html:392`; `lcv.width/height` is
never assigned from `sw`), but places the crosshair at
`(p.x*dpr - sx)/Z` — the correct factor is `lcv.width/sw`. `[v-desktop]`'s probe
S5: `drawImage(cv,78,28,44,44 → 140×140)` with the marker at `(7.33,7.33)` where
the sampled point is at `(70,70)`. Low (cosmetic).

**DE-11 — CONFIRMED, low, static-only, pre-existing; scope narrowed.**
`[t7]` re-read the chain the lane gives (`skyview.js:523/:566`,
`skymap.js:111/:182`, canvas reallocated at `skymap.js:26-30`): `best` comes from a
point array rebuilt every render while `*_HOVER` holds the previous render's
object, so the identity test is always true and a mousemove that lands on a point
redraws the chart (the Sky Map also reallocates the canvas). `[v-desktop]`
narrowed it: the *render* side compares by value (`skyview.js:462`,
`skymap.js:69`), so the highlight is never wrong, and a move that lands on no
point keeps `best = null === SKY_HOVER` and does not redraw — so the lane's "both
charts fully redraw on every mousemove" is overstated. Low either way
(performance only).

**DE-12 — CONFIRMED, low, static-only, pre-existing.** `[t7]`: each legend's
`innerHTML` (including the `off` classes) is built once in `bindSky`/`bindSkyMap`
(`skyview.js:127-139`, `skymap.js:229-240`); tab activation only calls the
renderers (`main.js:24-40`), and a chip click only toggles the clicked chip, so
the other chart's legend disagrees with the shared `S.disabledTypes` filter
(`skyview.js:466`, `skymap.js:65`). Low.

**DE-13 — CONFIRMED, low, static-only, pre-existing.** `[t7]`: `grep -n "Escape"
static/js/*.js` yields exactly `detail.js:137-143` (detail + sites modals) and
`weather.js:144-145`; `bindArchive()` registers click handlers for
`#libEditClose`/`#libEditCancel`/the backdrop (`archive.js:436-455`) but no
keydown, and the shared focus trap (`util.js:197-217`) handles Tab only. Low
(accessibility).

**DE-14 — CONFIRMED, low, static-only, pre-existing.** `[t7]`:
`detail.js:49` guards the fetched blob with `if (S.currentId === id)`, but the
three close paths (`:120-124`, `:129-133`, `:137-143`) hide the modal, null
`DETAIL` and revoke — never clearing `S.currentId` (only `:20` writes it). Closing
during the ≤8 s upgrade window therefore takes the `else`-less branch and keeps
the blob URL until the next open/close (`:40 revokeImgUrl`). Low (bounded
retention, no permanent leak).

**DE-15 — CONFIRMED, low, repro (in-thread worker), pre-existing.** `[t7]`:
`planning_worker.js:152` allocates `ceil = new Float64Array(total)` and fills it
at `:170`, but the transfer list (`:195-196`) carries only `altFlat`/`azFlat`, so
a flat double array per build (≈23 MB at 12 000 objects × 241 samples in advanced
mode) is allocated and discarded. `[v-desktop]`'s `v7-ceil-probe.mjs` drove the
real worker in-thread: reply `{n:80,count:241,hasCeilInMessage:false}`, and a grep
found no consumer of a flat `res.ceil` (the consumers read the per-object `o.ceil`
that the client rebinds at `planning_client.js:256`). Low (performance only).

**CAR-DS4 — lane's CLOSED OVERTURNED to STILL OPEN (low, corrected scope).**
`[t7]` re-derived the `max_alt` half and it is genuinely closed:
`planning_worker.js:169` rounds `alts[i] = r1(a)` before posting, the binder
copies those rounded values (`planning_client.js:255`) and takes a strict-`>`
argmax (`:259-262`), while the sync path rounds the array but takes the raw argmax
and returns `r1(maxRaw)` (`:404-414`); `x ↦ round(x*10)/10` is monotone
non-decreasing, so `max(rounded) == round(max)` and the two paths agree — `[v-desktop]`'s
grid probe: **0 `max_alt` differences** over 240 objects × 241 samples. The
residual is **not** dead, though: the binder passes the worker's **r1-rounded**
flat `az` to the ceiling lookup (`planning_client.js:256` ← `azFlat` from
`planning_worker.js:169-170`) while the sync path passes the raw `z`
(`planning_client.js:407`), so wherever `floor(r1(z)/0.5) != floor(z/0.5)` (~10 %
of samples, `z` within 0.05° below a bin edge) at a profile step the per-object
`ceil`/`ceil_top` arrays differ — `[v-desktop]` measured **516/19 280 samples
(80/80 objects, worst 20°)**, blocked shape 115 samples/59 objects, with
`visBits`/score differences 0 (the probe's 2°-step profile inflates the rate
versus a real horizon). So: the **description** in AGENTS.md is superseded
(`max_alt` agrees) and the item stays **STILL OPEN at low** as a cosmetic
worker/sync display divergence (consumers of `o.ceil`: `derive.js:170`,
`skyview.js:472`, `detail.js:235/249/316/362`; the `max_i` tie index remains a
dead field, `:262`/`:414` only).

**CAR-DS5 — STILL OPEN, low, confirmed.** `[t7]`: `planning_client.js:63-67`
`onerror` sets `_workerBroken = true` and leaves the failed Worker in place (only
the 120 s timeout path terminates/nulls it, `:74-79`); `__NS_KILL_WORKER` /
`__NS_REVIVE_WORKER` (`:97-107`) are gated behind `window.__NS_DEBUG_WORKER`, so
this is devtools-only, and `workerUsable()` (`:47-49`) always falls back to the
sync builder. Low, dev-hook only — the row stays open as recorded.

### Tooling lane (`50-tests-tooling.md`)

**TO-01 → `XL-02`** — see CO-02 above (merged; the tooling pass independently
reproduced the guard failure on a staged copy, **downgraded to low** on the live
deploy evidence, and corrected `AGENTS.md:518`'s false "only requires the current
dir" claim).

**TO-02 — CONFIRMED, medium, repro, pre-existing.** `[t7]` ran the gate:
`python scripts/check_browser.py --web` → **exit 1** with an uncaught
`PermissionError: [WinError 5]` from `asyncio/windows_utils.py:144` and no
`FATAL` line. Root cause: `tests/browser/harness.py:337-350` wraps only the
server starts in `try`, `with sync_playwright() as p:` (`:354`) is **outside**,
and only the inner `p.chromium.launch` has the documented `return 2`
(`:355-360`); `check_browser.py:73` returns `harness.run(...)` bare. `[v-to]`
reproduced it sandbox-free (fake driver raising at `:354` → exit 1; missing
`playwright` package → exit 1 `ModuleNotFoundError` at `harness.py:326`). The
observed WinError 5 is the documented sandbox artifact; the defect (the
documented exit-2 contract is bypassed for any driver-start failure) is real and
independent of it. Medium (tooling-only; the gate still fails non-zero).

**TO-03 — CONFIRMED, low, repro, pre-existing.** `[t7]` read
`scripts/check_js_syntax.py:233-240`: `if not node: print("…skipped"); return 0`,
and `check_js.py:30` adds that 0 to the hard failures. AGENTS.md says a missing
node is a hard failure "exactly like a browser that cannot launch". `[v-to]`
reproduced it with `PATH=C:\Windows\System32` → "node not installed - syntax check
skipped", exit 0. **Reachability narrowed (§5/R8):** a node-less box already fails
the suite elsewhere (`tests/test_reference_anchors.py` `pytest.fail`s), so "a
release with all guards green" overstates it. Low.

**TO-04 / `TL3` — CONFIRMED (partially superseded), low, repro, pre-existing.**
`[t7]` read `scripts/check_catalog_token.py:85-93`: the committed-change branch
exists and works when git answers, but `_git`/`_git_ok` (`:40-50`) swallow every
failure and return silently. `[v-to]`: `(A)` real env `_git_ok()=True, scan()=[]`;
`(B)` `_git→None` → `_git_ok()=False, scan()=[]` **silently**; `(D)` a catalog
diff without a token bump does raise the expected message. The branch is never
exercised by a test (`tests/test_cache_tokens.py:71-76` patches the three file
paths but leaves `ROOT` real, so `git diff HEAD` inspects the clean repo). Low.

**TO-05 — CONFIRMED, low, mixed repro/static, pre-existing.** `[t7]` read the
pin list; `[v-to]`'s inventory: mutation-proven = `check_core`
(`test_core_drift.py:101-173`), `check_js_syntax` (`test_js_syntax_check.py:78-131`
+ skips), `check_catalog_token` (branches 1-2 only), `check_release`/`build_changelog`
(`test_release_check.py`), `pre_tag_check`, `ftps_deploy.upload_order`
(`test_deploy_order.py:20-25`); **not** proven = `check_js_imports`,
`check_dom_ids` (zero test hits), `check_encoding` (real-tree pin only,
`test_encoding.py:24-26`) and the browser-gate exit-2 contract, whose pin
(`test_browser_gate.py:56-60`) is a source grep. Low (test-quality).

**TO-06 — CONFIRMED, low, repro, pre-existing.** `[t7]`
`python -m pytest tests/ -q --collect-only …` → **437 tests collected**;
AGENTS.md says 436 in two places, and `git diff --stat v0.6.24..HEAD -- tests` is
empty (already stale at the tag). Second half: `check_js_syntax.py:37`
`ROOTS = [static/js, web]` non-recursive (run prints "checked 31 js module(s)")
while AGENTS.md claims the core source and both baked trees are checked by it
(they are covered by `check_js_imports.py` and the `.mjs` engines instead).
`[v-to]`'s full run: `295 passed, 142 errors`, every error the documented
`tmp_path`/WinError 5 environment artifact, 0 assertion failures. **Addendum
(third stale AGENTS claim):** `[t7]` re-ran the documented workaround command
verbatim (`python -m pytest tests/ -q --tb=no --basetemp
C:\Users\<user>\AppData\Local\Temp\opencode\pt -p no:cacheprovider`) and it does
**not** restore a clean run any more — `295 passed, 143 warnings, 142 errors`,
exit 1, every error `PermissionError` in `tmp_path` fixture cleanup. AGENTS.md's
"-> 436/436" for that workaround is therefore stale; recorded as a documentation
claim, not a product finding (the charter excludes the environment artifact
itself).

**TO-07 / `TL5` — CONFIRMED (open by design), low, repro, pre-existing.** `[t7]`
read `scripts/check_release.py:586-591` (ahead ⇒ ERROR) / `:592-597` (behind ⇒
**WARNING**); `[v-to]` ran the real pins
(`test_web_version_behind_is_only_a_warning` PASS,
`test_web_version_ahead_is_an_error` PASS) and at HEAD `check_release.py` reports
`3 error(s), 0 warnings` with no web finding because `compare_versions` uses the
base version. `ns-version.js` **is** hard-checked. The carry-over row's "hard
error" wording is wrong and should read "deliberate WARNING".

**TO-08 / `TL4` — CONFIRMED, low, static-only, pre-existing.** `[t7]`:
`build.ps1` has no `--specpath` (grep: absent) and invokes PyInstaller on the
root `main.py`, so the tool rewrites the **tracked** `NightSeam.spec` in the repo
root; `requirements-dev.txt:5` is `pyinstaller>=6.0`; `.gitignore` ignores only
`*.spec.bak`. A regenerated spec dirties the tree → `git describe --dirty` →
release abort, conditional on a PyInstaller upgrade changing the emitted spec.
Low (release friction, unpinned toolchain).

**TO-09 / `TS4` — CONFIRMED, low, repro, pre-existing.** `[t7]`'s core pass and
`[v-to]` independently produced the same list over all of `tests/**`:
**85 exported names (73 functions), 12 never named** — functions
`clipProfileToFov, fmtFov, fmtFovPair, isCustomId, searchBlob, sizeArcmin, sunAlt,
sunCrossings`; non-functions `MASK_H, MASK_W, SKY_ZOOM_MAX, SKY_ZOOM_MIN`. Low
(coverage gap; no wrong behaviour today).

**TO-10 / `TS7` — CONFIRMED, low, repro, pre-existing; mitigation only partial.**
`[t7]` read `tests/js/core_fixtures.mjs:24` (`has = (n) => typeof C[n] ===
"function"` gating sections `:29-61`) and `tests/test_core_fixtures.py:56-58`
(`pytest.skip`). `[v-to]`'s mutation: renaming `julianDay` drops the `jd` section
**and** fails `test_moved_list_*` (mitigation works); removing the re-export from
`core/index.js` while keeping the definition drops the section with
`missing=set() stale=set()` — both MOVED tests **pass**, so `gmstDeg`/
`precessJ2000ToDate` fixture comparisons can vanish silently. Low (the
`reference_anchors.mjs` correctness authority still covers GMST/precession).

**TO-11 — CONFIRMED, low, repro, pre-existing; reproduced live inside this
review.** `[t7]` `scripts/check_encoding.py:28-30` `SKIP_TOP` has no `reviews`
entry while `:54` walks `root.rglob("*")`. Live state during t7: `check_js.py`
product checks all OK (58 files/0 broken imports, DOM ids, 31 modules/0 syntax
errors, catalog-token OK, core OK) but `check_encoding: FAIL (31 file(s))`, every
offender under `reviews/0.6.24/evidence/` and every one a `v7-*` PowerShell
redirect dump from this verification pass — so the shipped release guard went red
on non-shipped review scratch. `[v-to]` captured the same defect twice more with
different counts: `FAIL (15 file(s))` (11 UTF-16LE dumps under
`evidence/v7-probe/` + 4 UTF-8-BOM dumps at the evidence root) and an earlier
single-file instance (`evidence/_guard_probe.py`), i.e. every writer in the round
hit it. **Deterministic reproduction (needs no transient scratch, verified by
t7):** `python reviews/0.6.24/evidence/probe_tooling.py` section E calls
`check_encoding.scan(root)` on a synthetic root and prints exactly one finding per
planted file — UTF-16LE → `not valid UTF-8: 'utf-8' codec can't decode byte 0xff
in position 0`, UTF-8 BOM → `starts with a UTF-8 BOM`, mojibake →
`double-encoded text (cp1252 mojibake)` — then `scratch dir now empty: []` once
each file is removed. Per charter §9/AGENTS the red state is an artifact, not a
product failure; §8 records the cleanup and the green final state.

---

## 4. Carry-over audit (t7 decisions)

Every row was re-checked from the code/guard, not from the lane's sentence. The
"lane" column is the lane's own resolution, "t7" is the verified one.

| Item | Owner | Lane said | t7 verified | Evidence |
| --- | --- | --- | --- | --- |
| `CR2` malformed-horizon guards | t3 (t4/t5 consumers) | STILL OPEN low | **STILL OPEN (low, static-only)** — unresolved set is `{visibleSkyBands, profileSegments}`; all shipped producers normalize | CO-04; `core/horizon.js:139/174/203`; `web/horizon.js:128/255-269`; `[v-core]` `v7-co04.mjs` |
| `CR3` FOV-edge half-bin | t3 (t5 desktop) | STILL OPEN medium | **STILL OPEN (high)** with the mechanism corrected to the frame-**start** partial bin; the desktop re-implements the same rule (`pano.js:683`) | CO-01; `v7-verify-co01.mjs`; `[v-core]` `v7-co01b/c.mjs` |
| `DS4` worker/sync `max_alt` | t5 | CLOSED | **REOPENED — STILL OPEN (low), scope corrected.** `max_alt` really does agree (r1 monotone; 0 diffs in 240×241); the residual is a worker/sync `ceil`/`ceil_top` divergence (516/19 280 samples, cosmetic display only) created by the binder re-deriving from the worker's rounded `az` | §3 CAR-DS4; `planning_worker.js:169-170`, `planning_client.js:256` vs `:407`; `v7-ceil-probe.mjs` |
| `DS5` worker revive | t5 | STILL OPEN low | **STILL OPEN (low)** — dev-hook only, sync fallback always plans | §3; `planning_client.js:63-67/97-107` |
| `TL3` catalog committed-change check | t6 | STILL OPEN (partially superseded) low | **STILL OPEN (low)** — branch exists and works, silently no-ops without git, never pinned | TO-04; `check_catalog_token.py:40-50/85-93` |
| `TL4` `--specpath` + PyInstaller pin | t6 | STILL OPEN low | **STILL OPEN (low)** — no `--specpath`, tracked `NightSeam.spec`, `pyinstaller>=6.0` | TO-08; `build.ps1:179-187`, `requirements-dev.txt:5` |
| `TL5` stale `web/version.json` | t6 | STILL OPEN by design low | **STILL OPEN (low) by design** — it is a WARNING; the record wording must be corrected | TO-07; `check_release.py:592-597` |
| `TS4` untested exports | t6 | STILL OPEN low | **STILL OPEN (low)** — 12 names / 8 functions, reproduced independently twice | TO-09 |
| `TS7` fixture `has()` gating | t6 | STILL OPEN mitigated low | **STILL OPEN (low)** — mitigation is only partial (dropped re-export) | TO-10; `core_fixtures.mjs:24`, `test_core_fixtures.py:56-58` |
| `E15` per-module token discipline | t4 (t6 cross-check) | STILL OPEN medium | **STILL OPEN (medium)** — register pin is doc==source only; `XL-01` is a concrete instance | XL-01; `tests/test_cache_tokens.py:40-61`; `[t7]` git grep |
| `PY6` TLS-redirect hardening | t2 | STILL OPEN medium | **STILL OPEN (medium)** — local repro now exists; the relaxed context reaches the redirect target | PY-06; `images.py:56-65/104-128`; `[v-py]` `v7-out-tls.txt` |
| `WB7` bundle-version check | t4 | STILL OPEN deliberate low | **STILL OPEN (low, deliberate)** — `version: 2` is written but never read; the "missing pano section" half is closed | `web/webstore.js:295/336-339`; `web/app.js:2103`; `[t7]` |

All 12 rows are accounted for; none is SUPERSEDED except `TL3`/`TL5`, whose
*wording* no longer matches the code (the lane said the same).

---

## 5. Refutation log (claims that did not survive as written)

No filed finding was refuted outright; these **sub-claims, mechanisms and
evidence lines** were refuted, and the corrected form is what §3 records.

- **R1 — `CO-01`'s mechanism.** "One extra carried bin at the right edge, scored
  inside that slice reads the clamped representative column 719 = the far edge of
  the mask." Refuted by two independent probes: with `azOffset=0`, the scorer
  touches 91 bins like the profile (`extra=[]`), `ceilFor(45.0)` is **not** gated
  (the gate is strict `>`), and `col 719` is that frame's own right-edge column
  (`azOfX(719)=44.9375`), so nothing is mis-scored on the right. The finding
  survives as the frame-**start** partial bin (§3 CO-01) and is re-ranked high.
- **R2 — `XL-01` as a blocker.** The blocker reading requires the tagged tree (or
  a user-visible stale module set) to have shipped. Refuted by a read-only FTP
  download: live `/astro/index.html` names `app.js?v=60` and live
  `sha256(app.js)` equals HEAD's byte-for-byte. The release-artifact defect stands
  at **high**; "ships a wrong artifact"/"user-reachable stale delivery" did not
  happen.
- **R3 — `PY-01`'s secondary citation.** `app/database.py:505-527` is
  `active_panorama`/`set_active_panorama`; `panoramas()` is `:492-503`. Verdict
  unaffected.
- **R4 — `PY-03`'s "PUT hands it through unchanged".** `PUT /api/panorama/{pid}`
  with a non-list `strokes` answers **422** (`PanoramaUpdate.strokes:
  Optional[list]`, `server.py:157`); only junk *lists* pass. The import-boundary
  half (the reachable one) is unaffected.
- **R5 — `PY-04`'s nan explanation.** "Every comparison false → the matcher
  returns None" is wrong: `min(1.0, nan) = 1.0 → acos(1.0) = 0.0`, so the first
  catalog row wins deterministically (`abell21` on every run); the lane's "two
  different unrelated objects" did not reproduce. The impact (silent mis-filing
  with the catalog's coordinates) is confirmed and stronger. "No JSON parser
  accepts `Infinity`" is also overstated (Python's `json.loads` does).
- **R6 — `PY-07`'s trigger.** "On every boot … while the server thread keeps
  writing" is impossible: `make_backup()` runs once, from `Database.__init__`
  (`database.py:266`), before `main.py:248-249` starts the uvicorn thread. The
  reachable trigger is a **second process during the boot window**; the torn-copy
  mechanism itself is reproduced (33/633 torn copies with one committer).
- **R7 — `WE-04`'s evidence line.** "`grep -n "Layout" static/` is empty" is
  false (20 CSS-class hits in `static/`). The finding's narrower claim holds.
- **R8 — `TO-03`'s impact clause.** "Even a release with all guards green" cannot
  happen: a node-less machine already fails the pytest suite. The defect (the
  syntax checker silently skips) stands at low.
- **R9 — `TO-10`'s mitigation claim.** The lane said the lost bite is replaced by
  `test_core_drift.py`. Partly true: a **rename** is caught, but dropping the
  re-export from `core/index.js` deletes the fixture section with both MOVED
  tests still green. Severity unchanged (low).
- **R10 — charter §8/H5 premise.** "Six root-level scratch scripts + one scratch
  JSON are committed" is wrong: `git ls-files` prints nothing for all seven and
  `git check-ignore -v` shows `.gitignore:25-32`. Confirmed independently by t7
  and the tooling pass. No finding; the charter's §1.1 row should be corrected so
  the coverage matrix does not claim committed files that do not exist.
- **R11 — `20-core.md` coverage line.** "`core/index.js` explicit export surface
  (54 names)" is wrong: 8 export blocks, **85 unique names** (identical to
  `web/core.js`).
- **R12 — `CO-04`'s reachability as a ranked defect.** Reproducible only with a
  hand-edited IndexedDB record; no shipped producer emits it (§6).
- **R13 — `CAR-DS4`'s "CLOSED" resolution.** The `max_alt` half is closed, but the
  lane's premise ("both paths pass the raw azimuth to the same lookup") is false
  for the client binding: `planning_client.js:256` feeds the worker's
  **r1-rounded** flat `az` to `ceilAt` while the sync path passes raw `z`
  (`:407`), so `ceil`/`ceil_top` diverge on 516/19 280 samples (80/80 objects,
  worst 20°) with 0 `visBits`/score differences. The item stays open at low (§3
  CAR-DS4, §4).
- **R14 — `DE-11`'s "both charts fully redraw on every mousemove".** Overstated:
  a move that lands on no point leaves `best = null === *_HOVER` and does not
  redraw, and the render side compares by value (`skyview.js:462`,
  `skymap.js:69`), so no output is wrong. The guard is still ineffective on
  point-to-point moves.
- **R15 — `DE-03`'s ":10-13 the mode buttons" line reference.** The buttons are
  `static/index.html:360-361`, bound at `pano.js:35-38`. Verdict unaffected; the
  same review also found an **unfiled twin site** (`undoPaint:167-175`).

---

## 6. Static-only (reasoning-only) claims — ranked / unranked accounting

`static-only` is a **reproduction class** in the charter's sense (no command can
settle the claim in this environment), **not** a ranking decision. Every CONFIRMED
`static-only` claim below is **ranked at its verified severity** in the
consolidated report; the only filed claim that is genuinely **unranked** is
`CO-04`, whose impact is unreachable from any shipped producer (charter §3: a
hypothetical requiring an input no code path can produce is dropped unless it is
reachable from a trust boundary). The table accounts for all of them, so no filed
claim is missing and none is double-counted.

| id | asserted → verified | verdict | repro_class | Ranked in the consolidated report? |
| --- | --- | --- | --- | --- |
| `CO-04` (`CR2`) | low → low | CONFIRMED (code), impact unreachable | static-only | **NO** — the only unranked filed claim: the throw is demonstrated with a synthetic record, but every shipped producer normalizes (`load`, `normalizePanos`, `newPano`) and only a hand-edited IndexedDB record reaches it. Carries the `CR2` row in §4. |
| `WE-03` | low → low | CONFIRMED | static-only | **YES** (low) — documentation drift; `git ls-files` settles it. |
| `WE-04` | low → low | CONFIRMED | static-only | **YES** (low) — user-visible string, no executable path. |
| `DE-01` | medium → high | UPGRADED | static-only | **YES** (high) |
| `DE-03` | medium → high | UPGRADED | repro (probe S2, real module under stubs) | **YES** (high) |
| `DE-02`, `DE-07`, `DE-08` | medium / low → medium | CONFIRMED / UPGRADED | static-only | **YES** (medium) |
| `DE-04` … `DE-06`, `DE-09` … `DE-15` | low → low | CONFIRMED | mixed — `DE-04`/`DE-05`/`DE-10`/`DE-15` have probe repros, the rest are reasoning-only | **YES** (low) |
| desktop lane, all 15 | 3 medium / 12 low → **2 high / 3 medium / 10 low** | — | — | **YES** — band count as the t9 gate measured it; `[v-desktop]` drove the real modules under DOM/canvas stubs (`v7-pano-probe.mjs`, `v7-ceil-probe.mjs`) but **no browser could be launched** here (`check_browser.py` dies at the Playwright driver spawn, §3 TO-02), hence the mixed repro classes. |
| `TO-08` (`TL4`) | low → low | CONFIRMED | static-only | **YES** (low) — running `build.ps1`/PyInstaller is forbidden by charter §9.1. |
| `XL-01` (deploy-order half) | — | REPRO via git | repro (git) / static for the browser consequence | **YES** (high) |

`PY-02`, `PY-06` and `PY-07` were filed or flagged static-only by their lanes and
were **promoted to executable reproductions** by the independent passes, so they
are ranked normally.

No claim that could not be reproduced is missing from the ranked-or-refuted
accounting: refuted sub-claims are in §5, the refuted carry-over resolution
(`CAR-DS4`) in §4, and `CO-04` above is the single deliberate exclusion, marked
`static-only` in `07-findings.json` (`counts.static_only_unranked = 1`).

---

## 7. Coverage honesty (spot-checks of the lane Coverage tables)

Each lane's coverage table was checked against the tree; three line-level
corrections and one scope correction are recorded for the captain, all of them
non-material to a verdict but material to the record.

1. **`20-core.md`** — line counts and symbol names are exact (`core/horizon.js`
   512, `core/scoring.js` 197, `check_core.py` 221, `build_core.py` 119); the
   "scoreNightTracks inlines ceilFor" claim is literally true
   (`scoring.js:146-156` ≡ `horizon.js:385-415`). **Wrong:** the "explicit export
   surface (54 names)" figure (85). **Gap:** the same stale-oracle comments the
   web lane filed as WE-03 also live in `core/` source (`core/astro.js:10,48,163`,
   `core/planning.js:4,14,61,84`) and were not filed by the owner lane.
2. **`30-web.md`** — line counts exact (index.html 213, app.js 2757, horizon.js
   1401, webstore.js 418, astro.js 176); ~30 file:line anchors re-derived with no
   wrong numbers; the only false evidence line is WE-04's `grep "Layout" static/`
   (§5/R7). Its "not examined" list is honest.
3. **`50-tests-tooling.md`** — the three spot-checked rows
   (`check_js_syntax` scope, `test_core_drift` mutation classes a-h,
   `check_encoding` pins/scope) are all true. Nits: `test_js_syntax_check.py:210-211`
   should be 210-212; the AGENTS token register is `507-514` (lane wrote 509-514);
   `check_encoding.py` `SKIP_TOP` is 28-30 (lane wrote 28-36). Its H5 refutation
   also corrects the charter's own §1.1 (§5/R10).
4. **`10-python.md`** — the lane's own probe output is byte-reproducible; line
   refs correct except `database.py:505-527` (§5/R3). Its "31 `@app.<verb>`
   registrations", the 18-row adversarial path table and the
   `image_dir_ignored` contract were all independently reproduced.
5. **`40-desktop.md`** — `[v-desktop]`'s spot-check: the `night.js` async row is
   exact (awaits `:40/:42/:63`, re-checks `:41/:44/:64`, catch re-check `:75`,
   busy cleared only by the current load `:69`), the DOM-id row reproduces
   (`check_dom_ids.py` 200/182, 0 missing; `test_ui_invariants.py` 26 passed), and
   the 15 findings' line refs were re-derived with one error (`DE-03`'s
   ":10-13 the mode buttons", §5/R15) and the two carry-over rows are accurate as
   *claims* but `DS4`'s CLOSED was overturned (§3 CAR-DS4). Its "check_js.py exit
   0" evidence row is no longer reproducible at the end of the round — solely
   because `check_encoding` walks the untracked `reviews/` scratch (TO-11), not
   because a shipped file fails.
6. **Deliverable paths and the verified revision.** The canonical lane set is the
   uniform directory the captain states: `10-python.md`, `20-core.md`,
   `30-web.md`, `40-desktop.md`, `50-tests-tooling.md` (+ `00-charter.md`,
   `evidence/`). The earlier `02-core.md` / `03-web.md` / `04-desktop.md` copies
   were removed by their owners; the captain reports the removals as
   hash-verified byte-identical duplicates, so t7's earlier "should have stayed"
   clerical note (charter §1.3) is **withdrawn** — nothing was lost. The lane
   files grew while t7 verified (evidence/appendix sections added), and t7's last
   re-grep (after the final lane write) still finds **exactly the 42 filed
   headings, no new id**, so every verdict above refers to a finding that exists
   in the file it names. **The revision t7's verdicts are pinned to** (measured
   after the last lane write, `Get-FileHash -Algorithm SHA256`, mtime in
   local time):

   | file | bytes | sha256 (first 8) | last write |
   | --- | --- | --- | --- |
   | `10-python.md` | 35 886 | `BFB42EB2` | 22:29:50 |
   | `20-core.md` | 42 541 | `7118CF60` | 22:33:51 |
   | `30-web.md` | 31 583 → **32 536** | `B2641D32` → **`9FEA24EE`** | 22:35:43 → **22:53:30** |
   | `40-desktop.md` | 56 148 | `14A85BA7` | 22:32:10 |
   | `50-tests-tooling.md` | 67 849 | `78521319` | 22:41:05 |
   | `00-charter.md` | 29 016 | `9CA5E756` | 22:22:08 |

   `30-web.md` was edited once more at 22:53:30 (after every verdict here was
   written). `[t7]` re-checked it: the heading set is unchanged — still exactly
   `XL-01` + `WE-01`…`WE-04`, and the five-lane total is still **42** — so the
   verdicts above apply to the same finding blocks; the added bytes are
   evidence/appendix material. Anyone pinning the review should use the second
   (32 536 B / `9FEA24EE`) revision.

   **Discrepancy to fix in the record:** the captain's message quotes
   `20-core FAC26E81…` and `40-desktop 2A17C265…`, which do **not** match the
   bytes on disk for those two files (or their sizes/mtimes above). t7's verdicts
   are pinned to the hashes in this table; anyone reconciling the record should
   re-hash before quoting, because a stale hash implies a different revision.
7. **Two documented verify commands are not runnable as written** (found by the
   lanes, confirmed by t7's reading of the files): `node tests/js/astro_parity.mjs`
   is a stdin-driven multi-engine driver (it expects the harness to feed it a
   mode/argument, so a bare `node` invocation cannot settle anything), and
   `node tests/js/worker_bridge.mjs` needs its parent runner. This is a
   documentation/Commands-section inaccuracy, not a product defect, and it is
   reported here for the captain rather than as a finding — no lane's verdict
   depended on those two engines.

No lane claimed coverage it did not perform. No filed claim was silently omitted
by a lane: all 42 appear here.

---

## 8. Process notes (encoding state, evidence, read-only)

- **`TO-11` reproduced live on this review's own work — a review-harness
  artefact, not a product defect.** During t7, `python scripts/check_js.py`
  reported every product check OK and `check_encoding: FAIL (31 file(s))`, every
  offender a review scratch dump under `reviews/0.6.24/evidence/` written by
  PowerShell `>` redirection (UTF-16LE BOM or UTF-8 BOM) plus three
  cp1252-mojibake grep dumps; the captain's later capture of the same class lists
  16 files, including the desktop lane's `t5-engines.txt`. Root cause is
  `check_encoding.py:28-30` (`SKIP_TOP` has no `reviews` entry) with `:54`
  `root.rglob("*")`: the shipped-text guard polices the review workspace, which
  the charter keeps out of the product, so `check_js.py` (and the final pytest
  run) go red for a reason unrelated to any finding. That is exactly TO-11 made
  concrete; it is attributed here as review-harness scratch, never as a product
  failure. Evidence captured before cleanup: `check_encoding: FAIL (31 file(s))`,
  `exit 1`.
- **Cleanup (t7 scratch only).** t7 re-encoded its own `v7-*` dumps to plain
  UTF-8 (`v7-normalize-scratch.py --apply`: 16 files re-encoded, 3 unrecoverable
  mojibake grep dumps removed) and the per-lane verifiers normalized their own
  scratch too. **Final state after cleanup:**
  `python scripts/check_encoding.py` → `check_encoding: OK`;
  `python scripts/check_js.py` → `check_js: OK`, exit 0 (only the always-exit-0
  `check_js_defs` heuristics listed 10 candidates). No shipped file was ever
  affected: every offender listed during the round was under
  `reviews/0.6.24/evidence/` (counts varied 16–31 as verifiers wrote and
  normalized their scratch — `[v-to]` 28, `[v-desktop]` 18, `[t7]` 31 at capture,
  3 residual mojibake before removal). The captain additionally stripped the six
  core-lane probe files that carried BOMs (`_guard_probe*.py`, `_mut_probe.py`,
  `_sens_probe*.py`) and converted the residual BOM'd dumps with an external
  converter (content preserved, encoding only). Per the captain's instruction the
  three whole-file source copies in evidence (`v7-0623-app.js` 131 308 B,
  `v7-0623-horizon.js` 51 858 B, `v7-0623-astro.js` 7 812 B — the v0.6.23 module
  bodies, already converted to UTF-8) were **deleted**: no verdict depends on
  them, the v0.6.23-vs-v0.6.24 byte change is evidenced by
  `git diff --stat`/`git show`, and whole-file copies do not belong in evidence.
  The two deliberate raw byte copies of the *deployed* app (the XL-01 hash
  comparison) are kept, as the captain's own deploy check keeps them. Root cause
  of the class, per the captain's measurement on this host: PowerShell 5.1 `>`
  redirection and `Out-File -Encoding utf8` both emit UTF-16LE or a BOM, and
  `-Encoding utf8NoBOM` does not exist there — the only reliable fix is to write
  from Python (`open(..., encoding="utf-8", newline="\n")`), which is what the
  final artefacts and the normalizer use. The captain's converter, run over the
  whole `reviews/0.6.24` tree as t7's last write action, reports
  **total offenders: 0**. One leftover t7 scratch directory could **not** be
  removed and is left in place, reported rather than hidden:
  `reviews/0.6.24/evidence/v7-py-tmp/` (the PY-04 probe's throwaway SQLite
  databases + `probe.fit`) carries the sandbox's owner-SID-only DACL on its
  `case-*` child, the same environment trap AGENTS.md documents for
  `.pytest-tmp`; `Remove-Item -Recurse -Force` is denied and approval prompts are
  disabled in this session. It holds no text file the encoding guard inspects, so
  it does not affect the green state. `[t7]` re-verified the end state
  after every writer had stopped: **0** `v7-*` files carry a BOM or a UTF-16
  prefix, `_guard_probe.py` starts with
  `105 109 112` ("imp", BOM-free) and that
  `python -m pytest tests/test_encoding.py -q` → **1 passed**. Any lane claim
  that the guards are currently red is stale evidence and must be re-run before
  it is repeated.
- **Hash-source integrity after the encoding conversions.** Because the dumps'
  bytes changed (encoding only), any hash quoted *of* a `v7-*` file must be
  re-derived. The one byte copy the XL-01 verdict rests on is unaffected:
  `reviews/0.6.24/evidence/v7-deployed-app.js` appears in no conversion list and
  still hashes `30F61EE337D2127D04C24D43AE9CC0A62D8E0C57120E4388149FC7DAD5D24623`,
  identical to HEAD `web/app.js` (re-verified after every conversion and after the
  final lane writes).
- **No `data/`, `dist/`, `logs/` or user-profile write.** Network use was
  read-only (FTP `list`/`download` for the deployed-tree checks in §3 XL-01/CO-02
  and one HTTPS control). No `git add/commit/tag/checkout/stash`, no
  `build.ps1`/`build_core.py`/`make_release.py`/`build_web.py`/`ftps_deploy.py`
  write was run by t7.
- **Read-only attestation.** `git status --porcelain` →
  `?? .agent-teams/` + `?? reviews/`; `git diff --stat` → empty. No tracked file
  changed.

---

## 9. Machine-readable mirror

`reviews/0.6.24/07-findings.json` — one object per filed finding with
`{id, lane, title, severity_asserted, severity_verified, file, line, rule,
evidence_cmd, repro_class, regression, introducing_commit, verdict,
verdict_note}`, plus the merged `XL-02` record (both parts) and the 12
carry-over rows. The JSON is the t8 input; this document is authoritative where
the two disagree.
