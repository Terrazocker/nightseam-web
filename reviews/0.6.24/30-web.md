# Web lane review — web/ static shell (t4, web-reviewer)

**Subject:** NightSeam working tree at HEAD `9596878` (`git describe` = `v0.6.24-2-g9596878`),
tracked tree clean. Charter: `reviews/0.6.24/00-charter.md`.
This file (`reviews/0.6.24/30-web.md`) is the canonical lane deliverable: the t4
task contract names this path and its acceptance check tests it, so the charter
§1.3 sketch (`03-web.md`) is superseded for this lane. No duplicate file exists
(per the captain's clerical-path ruling).

**Method:** read every shipped `web/` module and the baked stub it consumes;
checked the documented contracts in `AGENTS.md` §"Web app (`web/`)" against the
code; ran the JS guards/engines below; reproduced the state defects with a
standalone probe against the SHIPPED modules (`reviews/0.6.24/evidence/we-profile-state-probe.mjs`).
Review only — no production file was touched.

**Machine-readable mirror:** findings `07-findings.json` (t7 verifier).

**Result:** 4 findings — 2 high (`XL-01` stale 0.6.24 cache tokens at the tag, shared
with t6; `WE-02` profile not re-derived when the editor's strokes disappear),
1 medium (`WE-01` sky-mode Sky View silhouette stroke), 2 low (`WE-03` stale
Phase-C comments, `WE-04` "Layout" menu hint); 3 carry-over rows resolved (E15
STILL OPEN, WB7 STILL OPEN deliberate, CR2 STILL OPEN defense-in-depth with no
reachable web throw). WE-02 reproduces deterministically against the shipped
modules; no blocker asserted.

---

## 1. Coverage

| Examined | How |
| --- | --- |
| `web/index.html` (213 lines) | full read; token strings, DOM ids, progressive-disclosure defaults, a11y attributes |
| `web/app.js` (2757 lines) | full read in slices (1-540, 553-752, 755-1092, 1089-1200, 1200-1269, 1274-1441, 1441-1520, 1520-1749, 1749-1794, 1793-1852, 1858-1977, 1978-2085, 2085-2313, 2380-2757) |
| `web/horizon.js` (1401 lines) | full read (1-120, 120-179, 180-399, 400-599, 600-819, 900-1029, 1030-1104, 1100-1399); editor model, history, persistence, crop, backup normalize/apply |
| `web/webstore.js` (418) | full read: IndexedDB open/migration, rig FOV arcmin adapter (D2), timezone helpers, backup stage/write/restore |
| `web/astro.js` (176) | full read: sun/moon altaz wrappers, `aboveHorizon` re-export, scrub step constants |
| `web/format.js`, `web/nightrank.js`, `web/dragwin.js`, `web/core.js` | full read |
| `web/style.css`, `web/themes.css` | grepped the contract rules (`main` max-width, `.btnrow`/`.action-row .btn`, `.legend .dot.hatch`, `--edge`), `test_ui_invariants.py` cross-read |
| `web/catalog.manifest.json`, `web/core.js`, `core/core.manifest.json`, `web/version.json` | read; `sha256(catalog.json)` recomputed |
| cache tokens | every `?v=` in `web/` (`grep '\\?v=[0-9]+'`), `CATALOG_TOKEN`, `app.js?v=` in index.html, core stub token vs manifest, AGENTS register, `git log/diff v0.6.23..HEAD -- web` |
| backup path | `collectBackup`/`stageBackup`/`writeStaged`/`restoreBackup`/`exportPanosWithImages`/`normalizePanos`/`applyPanosSnapshot` + the `applyWebSnapshot` caller (app.js:2086-2152) |
| contracts verified as HELD | sun/moon chart uses `sunAltAz`/`moonAltAz` only, gated by `aboveHorizon` (app.js:1008-1041, 1536-1571); `clampSkyTime()` at boot (2753) and on `refreshView` (1802), on `viewFullDay` toggle (2640), after arrow scrub (2708); `scrubRange()` uses the shared `scrubWindowMs`/`scrubBounds` with the site noon (194-211); sky-band open-above default + `90.5` sentinel + `blockAbove` opt-in (horizon.js:616, 972-994, 1339-1344; core/horizon.js:406-412); `overhangRuns`/`assumedOpenHatchPolys` used per contiguous run and built in BIN space (app.js:978-1000, horizon.js:976); continuous right-button erase as ONE gesture + `contextmenu` suppressed (horizon.js:1152-1162, 1193, 1218-1220); `profileBins:'world'` conversion at the storage boundary (horizon.js:128, 269); `fovArcmin` arcmin + `fov_unit:'arcmin'` marker on every write (webstore.js:129-143, 185-194; app.js:2224, 2265); `cropPano` non-destructive (horizon.js:1248-1262 + core `cropKeptBand`/`cropStrokes`/`clipProfileToFov`); backup truthfulness (`hasImage` from real bytes, `version:2`, theme, stage-validate-then-write + rollback + `meta/safety`); `magVisible` + `skyClampZoom` re-exported from core and used by the chart (format.js:12-16, app.js:847-852, 1233-1238); IndexedDB migration path (`nightseam-db-v1` v1, stores created in `onupgradeneeded`, `onblocked` rejects; `nightseam-images`, `nightseam-panoimg`); progressive-disclosure defaults (`viewFullDay` off, adv off, Setup in the Data menu, `#rigSelect` in the topbar) |
| panorama editor model (end to end) | verified line by line: edits mutate the LIVE record so planning sees them immediately (`web/horizon.js:577`, `783`, `1113-1118`; consumers `web/app.js:174,590,917,1441`) and only `updatePano`→`save()` persists (`web/horizon.js:348-350`, `1077-1091`); one history entry per gesture (commit on pointer-up only: `1205-1217`, calibration `change` not `input`: `1326-1330`, mode/blockAbove: `1331-1344`); redo invalidated by a new edit (`web/horizon.js:383-391`); dirty baseline moves only on a REAL write (`histMarkSaved` after `updatePano` returned true: `1083-1089`, `410-415`); `flushHorizonEdits()` on panorama switch/delete/create (`516,522,530`) and on leaving the tab (`web/app.js:521`); `beforeunload` guard (`web/horizon.js:465-473`); Clear uses the in-page `confirmDialog` and is undoable (`1093-1104`, `680-703`) — all HELD except the profile state (WE-02) |
| **Not examined (with reason)** | `web/catalog.json` (3.99 MB data; only its token/sha256 pairing checked); `web/build_web.py`/`web/ftps_deploy.py` (tooling/release lane t6); the baked `web/core/<hash>/` *sources* (generated from `core/`, core lane t3 — I consumed the stub's export list only); visual rendering in a real browser (see the environment note in §4); `DESIGN.md` (no UI structure claim contradicted by the code was found; the split/glass CSS was only spot-checked) |

Every `web/` module was read end to end; nothing in the shipped tree is unreviewed
except the two tooling files and the generated catalog/baked-tree bytes listed above.

---

## 2. Findings

### XL-01 — the `v0.6.24` tag was cut with stale per-module cache tokens; the bump is a post-tag commit and no guard can catch it

- **id:** XL-01 · **lanes:** `web` (t4, owner of the token contract) + `tooling` (t6, owner of the guard/release pipeline) · **severity (asserted):** high (a blocker reading is defensible — see impact) · **confidence:** high
- **file:line:** `web/index.html:211` (`app.js?v=60` today, `?v=59` at the tag), `web/app.js:11-20` (today: astro 10 / horizon 41 / webstore 20 / dragwin 1 / format 17 / nightrank 7 / core 17), `web/core.js:2` (stub → `core/97c2e182fb0a5630`, i.e. token 17), `tests/test_cache_tokens.py:40-61` (the only automated token guard), `scripts/check_js.py` (guard list), `AGENTS.md` §"Versioning and release" (the rule)
- **rule violated:** `AGENTS.md` §"Versioning and release" → "Web cache-busting is manual, per module AND for the catalog data file." … "Bump the token of every module whose BEHAVIOUR changed (comment-only edits do not) **in the SAME commit as the change**, and bump BOTH the entry point and the dependency."
- **what is wrong:** the 0.6.24 crop commit `7e73d98` changed the bytes of `web/app.js`, `web/horizon.js` and — through the core re-bake 16→17 — `web/astro.js`, `web/format.js`, `web/nightrank.js`, `web/webstore.js`, but only the `core.js?v=` import URLs were bumped. The tagged commit `25a19bb` therefore ships an `index.html` naming `app.js?v=59` and an `app.js` importing `astro.js?v=9`, `horizon.js?v=40`, `webstore.js?v=19`, `format.js?v=16`, `nightrank.js?v=6` — every URL unchanged although its response bytes changed. The fix (`208f7d6`) is a *post-tag* commit (and had to re-write the AGENTS register in the same commit). Nothing in the guard suite compares a changed module to its token, so the tag passed `check_js.py` and `tests/test_cache_tokens.py` while being internally inconsistent.
- **trigger / reachability:** a returning visitor of `/astro` who cached the 0.6.23 responses for those URLs (every visitor who has used the app before). The unchanged URLs make the browser keep the cached module set → the 0.6.24 crop UI is not delivered; and if a cached `core.js?v=16` stub resolves to the previous baked dir (`web/core/79ad99ef15810ca2`, no longer in the tree — seed H1) and that dir is not on the server, the module graph 404s (blank page). Reachable for returning visitors only; a fresh visitor (or a cache-cleared reload) gets the correct modules.
- **reproduction (paste-ready, from the repo root):**

  ```text
  $ git log --oneline v0.6.24..HEAD
  9596878 landing: changelog 0.6.24
  208f7d6 web: bump 0.6.24 module cache tokens (core re-bake 16->17 + crop UI)

  $ git show v0.6.24:web/index.html | Select-String 'app\.js\?v='
  <script type="module" src="app.js?v=59"></script>

  $ git show v0.6.24:web/app.js | Select-String '\./(astro|horizon|webstore|format|nightrank|core)\.js\?v='
  import * as E from './astro.js?v=9';
  import * as Hor from './horizon.js?v=40';
  import * as WS from './webstore.js?v=19';
  ... from './format.js?v=16';
  import { nightStats, sampleVisible } from './nightrank.js?v=6';
  ... from './core.js?v=17';          <- only the core URL was bumped

  $ git diff --stat v0.6.23 v0.6.24 -- web
   web/app.js | 4 +-, web/astro.js | 6 +-, web/core.js | 2 +-,
   web/core/{79ad99ef15810ca2 => 97c2e182fb0a5630}/… , web/format.js | 2 +-,
   web/horizon.js | 122 +- , web/nightrank.js | 2 +-, web/webstore.js | 2 +-
  (the byte change is present; the tokens are not)

  $ git diff --stat v0.6.24 HEAD -- web
   web/app.js | 10 +++---,  web/index.html | 2 +-     <- the ENTIRE post-tag delta is the token fix
  ```

  Timeline (`git log -4 --format='%h %cI %s'` vs the release bake): `7e73d98` 17:58:49+02:00 (behaviour + re-bake, tokens stale) → `25a19bb` 18:02:08+02:00 (**tag** `v0.6.24`) → `web/version.json` `built 2026-09-12T16:02:43+00:00` = **18:02:43+02:00** (the step-4 `build_web.py version` bake, 35 s after the tag, with the stale tokens) → `208f7d6` 18:06:07+02:00 (token bump, post-tag).
- **impact:** the released/baked 0.6.24 web tree does not match its own cache-busting guarantee; a returning visitor keeps the previous module set, so the release's headline feature (non-destructive crop) is invisible until their cache expires, and a fresh deploy without the N-1 baked core dir can fail to load. I assert **high**: HEAD (the review subject) is consistent, the deploy step may have picked up the post-tag commit, and the harm is stale delivery rather than corruption/data loss — but the charter's blocker clause ("ships a wrong artifact / release must not go out") applies to the *tagged* tree, so the verifier may upgrade.
- **falsifier:** re-run `git show v0.6.24:web/index.html` and `git show v0.6.24:web/app.js`: if the tagged tokens are `60/10/41/20/17/7`, the finding is refuted. If `208f7d6` were an ancestor of `v0.6.24` (`git tag --contains 208f7d6` non-empty), the same-commit rule would be satisfied.
- **history:** new in this review. Related, NOT a duplicate: seed H2 (HEAD is 2 commits past the tag) and carry-over E15 (whose "register pin covers documentation" description this finding substantiates). The guard/release half is t6's.
- **dissent recorded (t6, tooling-reviewer):** t6 independently reproduced the timeline (`git diff --stat v0.6.24..HEAD -- web` = `web/app.js` 10 +- / `web/index.html` 2 +-, 2 files, 6 insertions / 6 deletions; tag `25a19bb` 18:02:08+02; bake 18:02:43+02 with a clean `describe`; fix `208f7d6` 18:06:07+02) and reads the severity as **medium**, because the repair landed before the documented step-6 upload, so a live mixed-version breakage is not demonstrated — the "high" path requires the tagged `web/` tree to have been uploaded before `208f7d6`. That is the same reasoning that keeps my "blank page" branch conditional (see *impact*). I do not re-rank my own assertion here: `XL-01` stays asserted **high**, **medium is a defensible read**, and the charter leaves the re-rank to the t7 verifier, who must record the reason.
- **t7 verdict (recorded here for provenance):** verified **HIGH**, ranked once from this file; the user-harm half is settled by t7's read-only FTP check (the live `/astro` index names `app.js?v=60` and the live `app.js` sha256 equals HEAD), i.e. the stale-token tree was NOT what went live — no blocker. The guard-gap half (no bytes-vs-token comparison) is confirmed as pre-existing.

---

### WE-01 — the Sky View strokes the obstruction silhouette in sky mode, which the desktop deliberately suppresses

- **id:** WE-01 · **lane:** web · **severity (asserted):** medium · **confidence:** high (code); medium (that the invariant is scoped to this widget)
- **file:line:** `web/app.js:917-944` (primary: `ctx.stroke()` at 942-944, fed by `ceilPts` at 924-928 and `radiusFor` at 919-923); counterpart `static/js/skyview.js:282-293` (`if (activePaintMode() !== "sky")` gate + its explanatory comment); `core/horizon.js:105,115,406-412` (sky-mode sentinel 90 for unpainted columns)
- **rule violated:** `AGENTS.md` §"Sky-chart silhouette + right-click erase (0.6.13 follow-up)": "Sky mode NEVER strokes the silhouette outline (the fully-blocked 89 deg columns drew a spurious centre ring + radial connector); the outline is obstacle-mode only in BOTH apps (`activePaintMode() !== "sky"` / `paintMode() === "obstacle"`)."
- **what is wrong:** `renderSky()` builds the silhouette from `Hor.ceilFor(pano, az).ceil` and (a) fills it for every paint mode, then (b) strokes the curve unconditionally. In sky mode a blocked column is `profile[col] = 90` (`profileFromMask` fills `sky ? 90 : NO_BLOCK`; unpainted columns and columns outside the calibrated FOV keep it), and `radiusFor(az, 90)` maps to `R * (1 - 90/90) = 0`, i.e. the zenith centre. So the stroked path alternates between the painted band edge and the centre at every blocked column — exactly the "spurious inner circle with radial connectors" the desktop suppresses with `if (activePaintMode() !== "sky")`.
- **trigger / reachability:** Horizon tab → select/create a **sky-band** panorama that has at least one fully blocked column (paint the band over part of the azimuth range, or crop it so columns outside the new FOV stay at 90) → open **Sky View**. On every render of that view with such a pano; no other precondition.
- **reproduction (paste-ready):** `node reviews/0.6.24/evidence/we-profile-state-probe.mjs` section C prints
  `C skyBand(bandBottom=20) az0 ceil=20 r=77.78 | az270 ceil=90 r=0 (r=0 => the zenith centre)`, deriving `r` exactly as `web/app.js:921`. Numbered chain: (1) `core/horizon.js:105` fills a sky-mode profile with 90 → (2) `ceilFor` returns `{ceil: prof[col]}` for sky mode (`core/horizon.js:406-412`) → (3) `web/app.js:927` keeps it (`ceil > NO_BLOCK + 0.5` is true for 90) → (4) `web/app.js:921` yields radius 0 → (5) `web/app.js:942-944` strokes that path in sky mode, while `static/js/skyview.js:285` skips it.
- **impact:** the chart's blocked-region boundary is drawn as spokes running from the band edge into the zenith (a "triangle"/star pattern) instead of a clean edge; the shaded region itself is correct and no number changes. Cosmetic but user-visible in the main chart, and a web↔desktop parity break for a contract the repo states absolutely.
- **falsifier:** if the AGENTS sentence is read as scoped to the two panorama *editors* (its cited gates `paintMode() === 'obstacle'` and `activePaintMode() !== "sky"` are editor-local functions), the Sky View is out of scope and this drops or stays an Observation; a screenshot showing a clean boundary would also refute it (the browser gate could not run here — §4).
- **history:** new.

---

### WE-02 — the web panorama editor never re-derives the profile when the editable state loses its strokes (undo/Revert, paint-mode switch), so planning follows discarded or mode-invalid paint

- **id:** WE-02 · **lane:** web · **severity (asserted):** high · **confidence:** high
- **file:line:** `web/horizon.js:366-371` (`applySnapshot` restores strokes/calibration/mode/blockAbove only), `web/horizon.js:933-939` (`drawProfile` re-derives **only when `strokes.length > 0`**), `web/horizon.js:1056-1069` (`doUndo`/`doRedo`), `web/horizon.js:1070-1076` (`revertSession`), `web/horizon.js:1331-1336` (`#ed-mode` change handler), `web/horizon.js:1077-1091` (`saveSession` → `computeProfile` keeps the stored profile when stroke-less); core contract `core/horizon.js:252-262` (comment), `263-278`, `105,115` (sky sentinel); desktop parity `static/js/pano.js:148-157` and `167-175`
- **rule violated:** `AGENTS.md` §"Panorama profile/strokes invariant": "strokes WIN when present (the profile is derived from the mask); with NO strokes the stored `profile`/`profileTop` are **AUTHORITATIVE** … A stroke-less profile must not be silently removed"; and §"Web panorama editor model (0.6.x redesign)": "Revert restores the last saved state and is also undoable" / "`historyDirty` clearing when the state returns to the `historyMarkSaved` baseline". Code contract quoted at `core/horizon.js:252-262`.
- **what is wrong:** the profile is derived live in exactly one place — `drawProfile()` — and only while strokes exist (`web/horizon.js:935-939`). Every path that removes the strokes leaves the last DERIVED profile in the live record, which is the object planning reads (`Hor.activePano()`; `web/app.js:174`, `590`, `917`, `1441`):
  1. **undo/Revert to a stroke-less baseline** (`applySnapshot` sets `p.strokes = o.s` and never touches `p.profile`): the authoritative stored profile is gone, `historyDirty` is false ("Saved"), and `ceilFor` keeps returning the discarded ceiling. Reachable as "paint a fresh/blank panorama → Undo" and "Save → paint → Revert".
  2. **paint-mode switch to sky on a stroke-less record** (the handler only assigns `p.paintMode`): the stored profile keeps the obstacle sentinel (`NO_BLOCK`), so `ceilFor` reports `-90` ("nothing blocks") for columns the invariant says must be `90` ("unpainted sky columns block fully"), while `visibleSkyBands` — the editor's own preview — reports those columns as fully blocked. `ceilFor`'s malformed-profile fallback returns `90` for sky mode, confirming the intent.
  The desktop does the opposite on both paths: `setPaintMode` and `undoPaint` clear `profile`/`profile_top` and re-derive.
- **trigger / reachability:** (a) any user who undoes/reverts the first paint of a record whose saved state has no strokes (a fresh/blank panorama, a cleared one, a crop of a stroke-less one, or an imported legacy one); (b) any user who switches Paint to "Sky band" on a stroke-less record and presses Save. Both are ordinary editor actions; no crafted input needed.
- **reproduction (paste-ready):** `node reviews/0.6.24/evidence/we-profile-state-probe.mjs` (exit 3) prints
  `A saved=-90 painted=21.727 afterUndo=21.727 strokes=0 dirty=false` and
  `B skyModeStoredProfile=-90 previewVisibleBand=no expectedSentinel=90`, i.e. (A) after undo the ceiling is still the painted `21.727` instead of the authoritative `-90` while the editor reports clean, and (B) a sky-mode stroke-less column reports `-90` instead of `90` although the preview shows it blocked. The probe imports the shipped `web/horizon.js` (localStorage/window stubs only).
- **impact:** (a) a horizon the user explicitly discarded still drives the plan for the rest of the session, with the editor saying "Saved" (and a later Save persists it) — a blocked target can look observable, or an open one blocked, in the Tonight/Catalog/Sky numbers; (b) a "sky band" panorama built without painting blocks nothing at all, the unsafe direction the profile invariant exists to prevent. (a) is the more likely of the two; both come from the same missing invalidation.
- **falsifier:** if `applySnapshot`/`doUndo`/`revertSession` or the `#ed-mode` handler cleared or re-derived `p.profile` (the probe would print `afterUndo=-90`, `skyModeStoredProfile=90`, exit 0), the finding would be refuted. If the profile were part of the history snapshot, case (a) would also vanish.
- **history:** new; `tests/js/pano_ui.mjs` pins the strokes/calibration/dirty part of the model but never asserts the profile state, which is why the suite stays green.

---

### WE-03 — stale comments in the web shell still describe the Python modules deleted in Phase C

- **id:** WE-03 · **lane:** web · **severity (asserted):** low · **confidence:** high
- **file:line:** `web/app.js:138-142` ("astronomical twilight first (app/planning.py), then nautical … (nightcalc.py's night grid)"), `web/app.js:158-161` ("the same one app/planning.py uses"), `web/astro.js:4` ("Faithful JS port of NightSeam's pure-Python engine (app/astro.py + planning.py + nightcalc.py concepts)"), `web/astro.js:73` ("exactly like app/astro.py's sun_ra_dec / moon_ra_dec")
- **rule violated:** `AGENTS.md` §"Phase C (0.6.20): Python astronomy removed" — `app/astro.py`, `app/planning.py`, `app/nightcalc.py` are DELETED and "astronomy math must NOT reappear outside `core/`"; standard 3 (the code's own contract comments) — a comment that sends a reader to a file that does not exist.
- **what is wrong:** four comments in the shipped web shell name retired Python modules as the current implementation/oracle of the twilight, fallback and sun/moon logic, while the actual implementation is `core/planning.js` + `core/astro.js` reached through `web/astro.js`.
- **trigger / reachability:** static documentation; any maintainer reading the module.
- **reproduction:** `git ls-files | Select-String 'nightcalc|app/astro\.py|app/planning\.py'` returns nothing; the quoted lines are at the `file:line` sites above. (The baked `web/core/<hash>/*.js` carry the same class of stale "`app/planning.py` is the authoritative oracle" comments, but those are generated from `core/` — core lane t3.)
- **impact:** none at runtime; documentation drift only, exactly the `low` tier. A grep for the planning algorithm is misdirected.
- **falsifier:** if those modules still existed in `app/` (`git ls-files app/`), the comments would be accurate; they do not exist.
- **history:** new.

---

### WE-04 — the Setup › Backup hint sends the user to a menu group that does not exist ("Layout" vs "Display")

- **id:** WE-04 · **lane:** web · **severity (asserted):** low · **confidence:** high
- **file:line:** `web/app.js:1988` (user-visible string); contradicting source `web/index.html:88` (`<h4>Display</h4>`, the group that holds "Free space per side" + "View full day"); same stale wording in the CSS comment `web/style.css:185` (not user-visible)
- **rule violated:** `AGENTS.md` §"UI philosophy (progressive disclosure)" → "**Menu groups/labels (BOTH apps):** *Appearance* (theme); *Display* (free space per side, **View full day**, object size units); *Advanced* …; *Data* …; *About*."
- **what is wrong:** the Backup pane's help text says the free-space slider "lives in the hamburger menu under **Layout**", but no menu group is called Layout; the control is in the group labelled **Display** (`web/index.html:88-93`). The wording predates the group rename and was not updated with it.
- **trigger / reachability:** Setup… → Backup tab; the sentence is rendered in the primary dialog. Any user looking for the layout control is sent to a label they cannot find.
- **reproduction:** `grep -n "Layout" web/app.js` → `1988: … under <b>Layout</b>.`; `grep -n "<h4>" web/index.html` → `Appearance / Display / Advanced / Data / About` (no Layout). (The desktop's own setup text carries no such sentence: `grep -n "Layout" static/` is empty.)
- **impact:** cosmetic/UX wording only, no behaviour; the `low` tier ("documentation drift"). A one-word text fix.
- **falsifier:** if the hamburger menu contained a group labelled "Layout" (`web/index.html`), the sentence would be correct.
- **history:** new.

---

## 3. Carry-over audit (my rows)

| Item | Owner | Verdict | Evidence |
| --- | --- | --- | --- |
| `E15` per-module token discipline | t4 (web), t6 cross-check | **STILL OPEN** | The register pin (`tests/test_cache_tokens.py:40-61`) asserts AGENTS register == the actual tokens; it cannot see a module whose BYTES changed with an unchanged token, and no other guard does either (`python scripts/check_js.py` runs imports / dom-ids / syntax / encoding / catalog-token / core / defs — none compares bytes to tokens). The carry-over description ("register pin exists; git-based checker is test-quality", `BATCH3-REPORT.md:31`) matches the code, so it is not SUPERSEDED — and XL-01 is a concrete 0.6.24 instance of the missed bump (tag `v0.6.24` = `25a19bb` ships `app.js?v=59` + `astro.js?v=9` … while those files' bytes had changed; fixed post-tag in `208f7d6`). Today's HEAD token set is correct: index.html `app.js?v=60`, app.js imports 10/41/1/17/7/20 + core 17, `CATALOG_TOKEN='2'`, `style.css?v=16`, `themes.css?v=4`, `core/core.manifest.json` token 17, `sha256(web/catalog.json)` = `catalog.manifest.json`.sha256. |
| `WB7` bundle-version check (forward-compat choice) | t4 (web) | **STILL OPEN (deliberate, low)** | `stageBackup` checks only `data.app !== 'nightseam-web'` (`web/webstore.js:336-339`) and never reads the `version: 2` field `collectBackup` writes (`web/webstore.js:295`); a future-format bundle is accepted with its unknown fields silently dropped. The *other* half of the original finding — a bundle without a pano section wiping the horizons — is CLOSED: `web/app.js:2101-2103` throws `missing panorama section` before any write (pinned by `tests/test_ui_invariants.py:452`). No user-reachable harm in the current version; the record's "forward-compat choice" wording is accurate, so I keep it as a low carry-over rather than SUPERSEDED. |
| `CR2` malformed-horizon guards | t3 (core), t4/t5 consumers | **STILL OPEN (low, defense-in-depth) — no reachable web throw found** | Shipped web producers DO normalize before any preview: `web/horizon.js:128` (`load()` → `normalizeProfileBins` on every stored record) and `web/horizon.js:255-269` (`normalizePanos` blanks a non-720 `profile`/`profileTop` and re-derives from strokes for every imported record); planning-side `ceilFor`/`bandTopFor` already degrade a malformed record to "nothing blocks"/sky-90 (`core/horizon.js:390-403`). The residual gap is `normalizeProfileBins`'s early return for records already marked `profileBins:'world'` (`core/horizon.js:138-139`): a record with that marker and a `profile` that is missing/not 720 passes through and `profileSegments`/`visibleSkyBands` would throw a TypeError in the editor preview (`core/horizon.js:176`, `203`). No shipped producer emits that shape (hand-edited localStorage only), so it is NOT filed as a ranked finding — the carry-over stays open as defense-in-depth, consistent with `BATCH3-REPORT.md:21`. |

---

## 4. Evidence commands and observed results

| Command | Result |
| --- | --- |
| `python scripts/check_js.py` | exit 0: `checked 58 js files, 0 broken import(s)`; web/desktop DOM ids all exist; `checked 31 js module(s), 0 syntax error(s)`; `check_encoding: OK`; `check_catalog_token: OK`; `check_core: OK`; `check_js: OK` (+10 heuristic `check_js_defs` candidates, exit 0 by design) |
| `node tests/js/pano_ui.mjs` | exit 0 — `pano ui contract held` |
| `node tests/js/sky_band.mjs` | exit 0 — `sky-band contract held` |
| `node tests/js/web_backup.mjs` | exit 0 — `web backup integrity held` |
| `node tests/js/core_d1.mjs` | exit 0 — `core D1 contract held` |
| `node tests/js/dom_handlers.mjs` (extra) | exit 0 — E5/E8/E9 handler contracts held (stderr shows the documented Node-side `/api/state` Invalid-URL noise from the desktop harness import, harmless) |
| `node reviews/0.6.24/evidence/we-profile-state-probe.mjs` | exit 3 — reproduces WE-02 (A, B) and WE-01 (C); output quoted in the finding blocks |
| `(Get-FileHash web/catalog.json -Algorithm SHA256).Hash` | `f0b2d026eba83249fd0e1d67cb89e6a06d985acb3da292eb9e3554853cb93242` == `web/catalog.manifest.json`.sha256 (token `2` == `CATALOG_TOKEN`) |
| `python scripts/check_encoding.py` (guard scope) | At the time of my evidence run: exit 0, `check_encoding: OK`. Scope note: `scripts/check_encoding.py:51-58` rglobs the **repo root** and skips only `SKIP_TOP` (`.git`, build/data/dist/logs, …), so `reviews/` is NOT skipped and every lane artefact with a `.md`/`.mjs`/`.py`/`.txt` suffix is policed by the shipped-text guard (t6's TO-11). **Re-checks later the same session: exit 1, `check_encoding: FAIL (16 file(s))`, then `FAIL (15 file(s))` (t6's independent check) and `FAIL (8 file(s))` (my last re-check) as t7 rewrites/removes its dumps — the count churns while the verifier works, the class and the attribution do not** — every offender is another lane's evidence dump under `reviews/0.6.24/evidence/` (`v7-*.txt`, `v7-probe/*.txt`: UTF-16LE `0xFF` at offset 0 or a UTF-8 BOM, i.e. PowerShell `>` redirection), NONE of them mine. My artefacts stay clean (byte-checked now: `30-web.md` and `we-profile-state-probe.mjs` carry no BOM, no C1/cp1252 bytes). Reported to the verifier and the captain at once so the final suite is not read as a product failure. **CLOSED green:** after t7 re-encoded those dumps (`v7-normalize-scratch.py --apply`, 16 files) and the captain stripped six core-lane probe BOMs, I re-verified independently — `python scripts/check_encoding.py` exit 0 `check_encoding: OK`, `python -m pytest tests/test_encoding.py -q` → `1 passed`. The guard-scope gap itself (t6's TO-11: `reviews/` is absent from `SKIP_TOP`) remains a low finding in t6's lane, not a web defect. |
| `python scripts/check_js.py` (re-run after t6's probe file) | exit 0 at that moment — `check_encoding: OK`, `check_js: OK`; the BOM failure t6 reported for `reviews/0.6.24/evidence/_guard_probe.py` no longer reproduces (that file is BOM-free, byte-checked). It went RED in between for the unrelated `v7-*` evidence dumps in the row above (never for any `web/` source), and my final independent re-run is green again: `check_encoding: OK`, `check_catalog_token: OK`, `check_core: OK`, `check_js: OK`, exit 0. |
| `python scripts/check_browser.py --web` | **could not run in this sandbox**: Playwright's driver spawn fails with `PermissionError: [WinError 5] Zugriff verweigert` (named-pipe/`CreateFile` denial, the documented sandbox boundary family). No browser evidence was obtained; WE-01 therefore rests on the code chain + probe, and no rendering was visually confirmed. Not filed as a product finding (AGENTS.md environment artifact). |

---

## 5. Observations (severity-less — the integrator must not rank these)

1. `web/app.js:1180-1183` adds an anonymous `window` `pointerup` listener on every `renderSky()` and never removes it, unlike `skyTimeHandler`/`skyResizeHandler` (1240-1253). Impact is nil today (the handler only clears `SKYV.drag`), but a long session accumulates one closure per Sky-View render — the same leak class the resize listener comment (1246-1248) says was fixed.
2. `web/app.js:1444,1451-1461` mixes a live "Right now"/moon-distance readout (`new Date()`) with the selected `S.skyTime` used by the chart and the observability line. Deliberate labelling, not filed.
3. `web/dragwin.js:36-43`: the `if (!modal || isInteractive(...)) { if (isInteractive(...)) return null; }` block is dead logic — `!modal` falls through and would dereference `null` at line 57, but `#modal .modal-head` guarantees the ancestor, so it is unreachable. Style only.
4. `web/app.js:2120,2131,2147,2150,2185-2187,2254` use native `alert`/`confirm` in the Setup flows, while the editor's Clear uses the in-page `confirmDialog` (`web/horizon.js:1093-1104`). The AGENTS "never `alert`/`confirm`" sentence sits in the Clear/panorama-editor invariant and both apps use native dialogs elsewhere (e.g. `static/js/setup.js:181`), so this is consistent, not a violation.

---

## 6. Read-only attestation

`git status --porcelain` at the end of this lane's work (expected: `?? .agent-teams/` plus the `reviews/` additions; nothing else):

```text
?? .agent-teams/
?? reviews/
```

No file outside `reviews/0.6.24/` was created, modified or deleted; no git/build/deploy command was run (only read-only `git log`/`show`/`diff`/`ls-files`/`status`/`rev-parse`).
