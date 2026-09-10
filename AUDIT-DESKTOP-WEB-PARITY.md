# NightSeam Desktop ↔ Web — Full Parity Audit

**Date:** 2026-09-10 · **Repo:** `<workspace>\AstroPilot-local` @ `767979c` (post-0.6.9) · **Type:** discovery/report only — nothing was modified, fixed, committed or deployed.

**Method.** Six parallel read-only sub-audits (astronomy engines, night-window/grids, scoring/ranking, state/settings, catalog/panorama/backup, git-history drift) plus a UI feature inventory; every E-class candidate was then verified by reading the exact lines, and two candidates were **measured numerically** with throwaway probes (python `app.planning` vs `node web/astro.js`). The pinned parity suite was re-run: `tests/test_js_parity.py` + `tests/test_horizon_parity.py` → **35 passed** (all currently pinned invariants hold; every divergence below is outside that pinned surface).

Classification legend: **A** intentional product difference · **B** platform/UI/presentation · **C** performance/trade-off · **D** potential bug (unconfirmed intent) · **E** confirmed bug (both apps demonstrably disagree where they should agree) · **F** unknown/insufficient evidence.

---

## 1. Executive summary

**74 meaningful differences** were inventoried:

| Class | Count | Notes |
|---|---|---|
| A — intentional product difference | 27 | mostly web scope cuts (no image catalog, no update checker, no favorites) + documented caps |
| B — platform/UI difference | 17 | defaults (edge/theme/sort/filter checkboxes), storage mechanics, presentation |
| C — performance difference | 9 | grids, caps, pagination, re-render strategies |
| D — potential bug (unconfirmed) | 11 | small, mostly unpinned semantics |
| **E — confirmed bug** | **8** | both apps demonstrably disagree where their own comments claim parity |
| F — unknown | 2 | dead exports, unpinned edge cases |

**Highest-impact confirmed divergences (all measured or line-verified):**

1. **E1 — Polar-twilight night window differs by hours** (measured: Tromsø 2026-05-15 → desktop window 20:00–04:00 = **8.0 h**, web window sunset→sunrise = **2.1 h**, both labeled `fallback`). Affects every high-latitude site in the polar-twilight season; changes % of night, scores and clear windows by up to ~4×.
2. **E3 — "Frame coverage %" numbers mean opposite things** (desktop `object/field` = 139% for M42 in a Seestar rig; web `field/object` = 85%, clamped 0–100). Same boolean outcome, inverted displayed meaning.
3. **E5 — Min-altitude threshold liveness differs** — desktop freezes `S.minAlt` at boot (bortle changes do nothing); web re-derives `17+2·bortle` live.
4. **E2 — Web "Dark time" card uses the astronomical pair even when the real window is nautical/civil** (measured: Berlin 2026-06-21 → desktop shows "2h 42m 21:47–00:29", web shows "— / no full dark night").
5. **E6 — Web "Best targets tonight" top-16 is not visibility-gated** — a below-horizon object can rank #1, while the desktop's top-8 filters to `statusOf == vis`.

Everything under the moon-penalty model, precession, twilight cascade constants, clear-window half-open contract, ceil lookup and cross-zone anchoring is **identical and pinned by tests**. The residual risk is concentrated in the window-selection edge band (polar twilight), display-level statistics, filter-advice, frame coverage, keyboard mapping and one frozen-threshold state bug.

---

## 2. Parity matrix (feature by feature)

### Astronomy calculations

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| Precession (Meeus 21.4, Y-rotation) | `app/astro.py` + `static/js/astro.js` | `web/astro.js` | ✅ 1e-9 pinned | none | — | — |
| GMST / julian day | astro.py:84 / 25 | astro.js:33 / 17 | ✅ pinned | modulo normalization style differs (result-identical) | A | INFO |
| Alt/az + refraction | astro.py:92/116 | astro.js:99/91 | ✅ 1e-9 pinned | `refract=False` path exists only in python (no consumer) | A | INFO |
| Sun position | astro.py:127 | astro.js:123 | ✅ pinned | — | — | — |
| Moon position | astro.py:160 | astro.js:142 | ✅ pinned | — | — | — |
| Moon illumination/age | astro.py:212/225 | astro.js:191/204 | ⚠️ formulas identical | **not numerically pinned** (harness ships ra/dec only) | F | LOW |
| Moon phase label | `util.js phaseName` 5 bands | `moonPhase` 8 bands + icon | ❌ | cosmetic; desktop shows illumination-based name, web elongation-based | A | INFO |
| Rise/set/transit | **none** | `objectDayInfo` (astro.js:402) | ❌ | web-only feature; calendar-day scope (see D8) | A/D | LOW |
| Airmass | none | none | ✅ | absent on both | A | INFO |
| Twilight thresholds (−6/−12/−18, sunset 0°) | planning.py:64-74 | astro.js:299 | ✅ identical, both refracted | — | — | — |
| Twilight cascade (astro→naut→civil→fallback) | planning.py:66-74 | astro.js:320-329 | ✅ pinned | — | — | — |
| Polar fallback window | planning.py:76-80 | astro.js:325-336 | ❌ **E1** | python: fixed 20:00–04:00 whenever no level pair; web: falls back to **sunset→sunrise** first. Measured 8.0 h vs 2.1 h at Tromsø | **bug** | **HIGH** |
| Scan resolution | 10-min + linear refinement, 30 h from local noon | same refinement, 288 steps/48 h from local midnight | ✅ <3 min pinned | — | B | INFO |
| Advanced-track precession epoch | once per object at grid midpoint (derive.js:104) | per sample | ❌ | ~7e-6 deg error ≪ 0.1° rounding; documented | C | INFO |
| Night grid | 6-min, dusk−1 h…dawn+1 h margins | 6-min, exactly dusk…dawn | ⚠️ | sample phase differs; stats clipped to dusk..dawn both sides | B/C | LOW |
| Detail grid | 4-min, dusk−75 min…dawn+45 min | fixed **120 samples**, sunset−1 h…sunrise+1 h | ❌ | step ≈ 6–8 min, night-length-dependent; anchored to sunset, not dark level | C | LOW |
| Moon track | server 6-min grid, rounded 0.1° | raw floats per sample | ⚠️ | ≤0.05° on separation; moon-up gate `>0` can flip at rounding edge | C | LOW |
| Scoring grid denominators | `nightN = i1−i0+1` (lattice from dusk−1 h) | `n+1`, `n=round(span/step)` (anchored at dusk) | ⚠️ | obs % can differ by ±1 sample ≈ up to ~1.5% | C | LOW |

### Night Planner

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| Selected date | `#dateInput`, server reload | `S.date`, client recompute | ✅ | mechanism differs | B | — |
| Selected time ("source of truth") | `S.tIdx` grid index; slider 0..n−1 | `S.skyTime` Date; scrub 0–1440 min/15-min step + datetime-local + Now button | ✅ semantics, ❌ mechanics | grid-bounded vs 24 h reach | B | INFO |
| "Now" handling | `timeIndexFor(now)`, fallback `floor(n·0.45)` outside grid | `new Date()` fallback | ✅ | — | — | — |
| Clear window (half-open) | `longest_run` / `longestRunJS` + `windowEndISO` | inline run tracking, half-open | ✅ pinned | web has no shared helper (3 inline copies) | A | — |
| Best window clipping to dusk..dawn | `nightIndexRange` / server `in_night` | margin-free grid | ✅ | — | — | — |
| % of night | `round(100·visIn/nightN)` | `round(100·visN/(n+1))` | ⚠️ | ±1 sample; see Astronomy row | C | LOW |
| Window duration text | `round((dawn−dusk)/min)` on selected level | "Dark time" card uses **astro pair** | ❌ **E2** | measured: nautical-level night shows "—" on web | **bug** | MEDIUM |
| Busiest hour | desktop-only card (counts unclipped margins, tonight.js:48-54) | none | ❌ | desktop-only; margin contamination | D | LOW |
| Min-alt threshold | `S.minAlt` **frozen at boot** (main.js:53), default 25 | `effectiveMinAlt()` **live** `17+2·bortle` (horizon.js:437) | ❌ **E5** | bortle drag changes thresholds on web only | **bug** | MEDIUM |
| Obstruction handling | server ceil arrays + client statusOf | `Hor.ceilFor` per sample | ✅ pinned | — | — | — |
| ceil_top (sky mode) | shipped only when profile_top present; statusOf **ignores it** | always `< (ceilTop ?? 90.5)` | ❌ **E4** | sky-band overhang shows "Observable" in desktop targets table | **bug** | MEDIUM |
| Ranking (Tonight) | top-8, `statusOf==vis` at tIdx, score+pop | top-16 by score+pop, **no visibility gate** | ❌ **E6** | below-horizon object can top the web list | **bug** | MEDIUM |
| "Rising later" | `best[0] > tIdx` (future clear window), sort by start | `!visNow && maxAlt>0`, sort by transit | ❌ | different predicates and order | D | LOW |
| Tiebreaker | `popularityFactor` 0.3+0.7·log10(pop)/5.2, baked column | identical formula, **live the popularity source fetch** w/ baked fallback | ✅ formula | data source differs (online vs offline) | A | INFO |
| Sort (catalog) | `score` default; score/pct/maxalt/beststart/mag/name fixed direction | `mag` default, sortable headers with direction toggle | ❌ | different views, different defaults | B | LOW |
| Filters | search/type/mag/unblocked(≥18 min)/favorites/constellation | search/chips (all, messier, bright<8, galaxies, nebulae, clusters, custom)/constellation | ❌ | 4 desktop-only filters; web chips unique; search field set differs (D5) | A/D | LOW |
| Advanced mode | 12k objects, **no mag gate anywhere** | 12k objects, Tonight capped mag 9, sky map mag 9.5/1400 rows | ❌ | documented caps; also `vmag != null` drops null-mag curated (D14) | A/D | LOW |
| Pagination | 250 rows/page | 60 rows/page | ❌ | — | C | INFO |
| Detail view | server 4-min grid, vis arrays, moon band, obstruction fill, arrow stepping, Esc | client 120 samples, rise/set/transit + moon-distance rows + 6-band shading | ⚠️ | resolution + feature mix differs; both clip to dusk..dawn | C/A | LOW |
| Auto-refresh | none | Tonight re-renders every 60 s | ❌ | web keeps "visible at" live; desktop manual | C | INFO |

### Moon / scoring

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| MOON_TYPE_FACTOR | derive.js:244 | astro.js:347 | ✅ pinned | — | — | — |
| moonMinDist Lorentzian (60/90/120) | derive.js:158 | astro.js:359 | ✅ pinned + anchored | — | — | — |
| effectiveMoonGlow | derive.js:166 | astro.js:366 | ✅ pinned | — | — | — |
| moonPenalty (0.05 floor) | derive.js:174 | astro.js:373 | ✅ pinned | — | — | — |
| bortleMoonFactor (0.25+0.05b / 0.40+0.12(b−3)) | derive.js:182 | astro.js:379 | ✅ pinned | — | — | — |
| Moon reference instant | middle grid sample of margin-inclusive grid, **2 dp rounded** | exact `(jd0+jd1)/2`, **raw** | ⚠️ | midpoint same within ≤3 min; rounding differs at 3rd decimal | D | INFO |
| Moon track for penalty | server 0.1°-rounded | raw per sample | ⚠️ | see Astronomy row | C | INFO |
| moonAware default | `false` | `false` | ✅ | — | — | — |
| Filter-type base (oiii 90 / ha 60 / bb 120) | `filterType()` from cfg.filters | `fltOiii ? oiii : fltHa ? narrowband : lrgb` | ✅ | equivalent mapping; checkbox defaults differ (see §4) | B | INFO |
| Score formula + rounding | `round(Σ sin(alt)·penalty ·10)/100` | identical | ✅ | — | — | — |
| filterAdvice | recommend NB for nebula/SNR/planetary, warn BB for galaxies/clusters when only NB owned | `filterOwned` badge only if owned; different type map (planetary→OIII, SNR→Ha, star_cloud→L) | ❌ **E7** | different logic, no recommendation/warning on web; nothing pinned | **bug** | LOW-MED |

### Site / location

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| Site model | name/lat/lon/elev | + **per-site tz and notes** | ❌ | web richer | A | INFO |
| Active site | server setting `active_site_id`; delete repoints, never dangles | localStorage pref; delete repoints; **zero sites → stale S.site until reload** | ⚠️ | — | B/D | LOW |
| First site auto-activation | yes (server.py:420) | via welcome flow only | ⚠️ | — | B | INFO |
| No site configured | wizard location step mandatory; **Skip can leave 0 sites → /api/night 400, no recovery** | welcome always skippable; **auto-seeds "Berlin (default)" 52.52/13.4** | ❌ | web can never run site-less | A/D | LOW |
| Timezone (display) | one global `timezone` setting (adv-gated), IANA, empty=machine | global `tz` pref overrides per-site `site.tz`; empty=browser | ⚠️ | desktop has no per-site tz | A | INFO |
| DST handling | `tzOffAt(dateStr)` fixed at local noon of selected date (3-iter fixpoint) | `tzOffMinAt(tz, instant)` per-instant | ⚠️ | equivalent in practice; web more precise near DST edges | A | INFO |
| Cross-zone night anchoring | `local_utc(y,m,d,tz,12)` | `siteNoon()`/`wallToUtc` | ✅ pinned | — | — | — |
| Coordinate validation | server-side, wizard validates | form validation + clamp | ✅ | minAlt persist clamp 5..89 web vs any float desktop (B) | B | INFO |
| Geolocation | wizard button | welcome + site form buttons | ✅ | — | — | — |

### Panorama / obstruction

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| Data model | DB row + file on disk; snake_case | localStorage record, camelCase; photo = memory + IndexedDB JPEG (1400 px, q 0.78) | ⚠️ | storage mechanism | B | — |
| Profile bins | 720, `NO_BLOCK=-90` | 720, `NO_BLOCK=-90` | ✅ | editor writes −99 sentinel (harmless) | A | INFO |
| ceil lookup | `ceil_lookup` (nightcalc.py:28) | `ceilFor` (horizon.js:247) | ✅ pinned ±0.51° | 90.0 vs 90.5 sentinel (equivalent) | A | INFO |
| Ceil application | server ships ceil per sample; client uses for synth | per-sample `ceilFor` everywhere | ✅ | — | — | — |
| Creation | photo upload only (≤60 MB) | photo **or blank sky** | ❌ | web-only blank-sky | A | INFO |
| Mask→profile resolution | **720×180** canvas (pano.js:625) | **720×360** (horizon.js:18) | ❌ | per-row altitude quantization differs; not pinned | D | LOW |
| Crop / replace | yes (crop tool, resets strokes/profile) | **no** | ❌ | desktop-only | A | INFO |
| Loupe / click-to-calibrate-N | yes | no (sliders 5° steps only) | ❌ | desktop-only | A | INFO |
| Undo | 60-step snapshot stack | single-stroke pop | ❌ | web weaker | A | INFO |
| altTop default | DB 60, but editor/import default 45 | 60 | ❌ | minor drift | D | INFO |
| Fallback (no/corrupt pano) | nothing blocks | nothing blocks | ✅ | — | — | — |
| Id validation on import | `safe_token` (rejects non-token) | shape-check only | ⚠️ | no FS risk on web | D | INFO |

### Image Catalog (desktop-only by design)

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| FITS ingest (≤1 GiB, streaming) | full | — | ❌ | web has **no catalog/library at all** (verified: zero hits for ingest/library/fits/reindex in web/) | A | — |
| Archive layout / sessions / frames | full (`<Object>/<session>/<lights|darks|flats|bias>/`) | — | ❌ | A | — |
| Library rollups / reindex / open folder | full | — | ❌ | A | — |
| Export CSV/JSON, edit rename/retype | full | — | ❌ | A | — |
| Sky map (static RA/Dec chart) | desktop-only | — | ❌ | A | — |
| Sky View (polar dome) | payload-driven + constellation/star backdrop + toggles + favorites rings | client-computed, no backdrop, fixed render | ⚠️ | equivalent chart, reduced presentation | A/C | INFO |

### State / persistence / settings

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| Settings storage | SQLite + `/api/state`, `POST /api/settings` (debounced 400 ms) | localStorage `nightseam_prefs_v1` + IndexedDB | ⚠️ | mechanism | B | — |
| User data (sites/rigs/targets) | SQLite | IndexedDB `nightseam-db-v1` | ⚠️ | mechanism | B | — |
| Panos | DB + `data/panos/` files | localStorage + IndexedDB photos | ⚠️ | mechanism | B | — |
| Theme | settings key; head script sync XHR | `nightseam_theme` key; head script sync localStorage | ⚠️ | separate key | B | — |
| Default theme | `""` flat; picker Default/Glass | `dome` Glass; picker Glass/Classic; `""`→classic | ❌ | deliberate design difference | A | — |
| Default edge space | **200 px**, range 0–800 | **14 px**, range 0–300 | ❌ | B | — |
| Default sort | `score` | `mag` | ❌ | session-only both | B | INFO |
| Default filters | broadband **checked** | all **unchecked** (same effective scoring) | ❌ | B | INFO |
| First rig auto-active | yes | no ("none" option) | ❌ | B | INFO |
| Favorites / ★ | server-persisted, filter, rings | **absent** | ❌ | A | — |
| `wizard_done` / wizard replay | yes | inferred from sites store; no replay | ❌ | A | — |
| Update checker | desktop-only (ns-version.js JSONP) | footer version.json only | ❌ | A | — |
| Rig seed-cleanup flags | settings keys | prefs keys | ✅ same semantics | naming differs | A | INFO |

### Backup / export

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| Format | ZIP (setup.json + pano files + library rows+files) | single JSON | ❌ | not cross-importable (different `app` marker, by design) | A | — |
| Pano photos in backup | yes | **no** (hasImage survives, restored pano = blank canvas) | ❌ | data loss on web restore | D | MEDIUM |
| Theme in backup | yes (settings) | **no** (separate LS key) | ❌ | D | LOW |
| Auto safety copy | `<db>.backup-auto.zip` before import | none (confirm dialog only) | ❌ | A/D | LOW |
| Import validation | `safe_rel`/`safe_token`, 1 GiB cap, re-injects local image_dir | `cleanRecord` shape-coercion | ⚠️ | web has no FS risk | A | — |

### UI / workflows

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| Tabs | two tab bars (planner + catalog), in-place | one hash-routed bar (back/forward works) | ❌ | B | — |
| Detail dialog | pre-built modal, hidden class | rebuilt into `#modal` per open | ⚠️ | B | — |
| Toasts | yes (all API failures) | none — `alert()`/confirm/inline/banner | ❌ | B | — |
| Arrow-key scrub | Arrow = **6 min**, Shift = **60 min** (main.js:135) | Arrow = **60 min**, Shift = **10 min** (app.js:2514) | ❌ **E8** | magnitudes swapped; web comment claims desktop parity | **bug** | LOW |
| Escape | closes detail/setup modal + weather | closes weather + menu only | ❌ | D | LOW |
| `n` tab cycle | yes | yes (different order: tonight→sky→catalog→horizon) | ✅ | order differs (desktop has 4+3 tabs) | B | INFO |
| Drag windows (Glass) | dragwin.js | dragwin.js | ✅ | — | — | — |
| Busy chip | night load/import | pct warmup only | ⚠️ | B | INFO |
| Version tag | bottom-right | footer | ⚠️ | B | INFO |
| Empty states | "Nothing observable… scrub the time slider" | "nothing tonight — check again in darker skies" | ⚠️ | wording | B | INFO |
| Image offline | transparent 1×1 placeholder; silent upgrade failure | "photo unavailable (offline?)" + reduced-data mode | ⚠️ | web more informative | B | INFO |
| Weather | identical Open-Meteo chain, same offline message | identical | ✅ | — | — | — |
| Setup dialog | static modal, sites table, per-global tz | rebuilt modal, `SETTINGS_TAB`, sites list+radio, per-site tz | ⚠️ | B | — |
| Horizon editor | photo canvas + loupe + crop + landmark-N + 60-step undo | photo/blank canvas + single undo + profile strip | ❌ | A | — |
| Detail object stepping (arrows) | yes | no | ❌ | A | INFO |

### Error handling / offline

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| No site / invalid site | 400 + toast; possible permanent 0-site state | impossible (Berlin seed) | ❌ | A/D | LOW |
| Failed API call | toast "Request failed" | alert/inline/banner; some silent | ⚠️ | B | — |
| Offline Wikipedia images | server cache + circuit breaker, 8 s abort | bundled jpg + Wikipedia + IndexedDB cache, negative TTL, `prefers-reduced-data` | ⚠️ | both degrade gracefully | A | — |
| Popularity offline | baked column always | live fetch → baked fallback | ✅ | — | — | — |
| Version check offline | silent failure | n/a (static) | ✅ | — | — | — |
| Corrupt pano profile | warn + NO_BLOCK | NO_BLOCK | ✅ | — | — | — |
| Invalid backup | reject with app-marker error + auto-backup first | reject/incomplete import; no auto-backup | ⚠️ | D | LOW |
| Extreme latitude | handled via fallback (but see E1) | handled (but see E1) | ❌ | E1 | **bug** | HIGH |

### Performance

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| Compute location | server (6-min payload) + client stats | 100% client per render (caches: obsCache ≤250k, searchCache) | ⚠️ | C | — |
| Advanced Tonight compute | server tracks, client synthesis (yields every 256) | per-render 12k×121 altaz capped at mag 9 | ⚠️ | documented caps | A/C | — |
| Re-render strategy | DOM patching (targets rows only) | full `#view` innerHTML rebuild per render | ❌ | C | — |
| Pagination | 250/page | 60/page | ❌ | C | — |
| Images | server-cached thumbs (`?thumb=1`, never network) | bundled + Wikipedia + IndexedDB | ⚠️ | C | — |
| Startup | state+catalog+panos fetches | catalog.json (~4 MB) parse + welcome | ⚠️ | C | INFO |
| Auto-refresh | none | Tonight every 60 s + scrub debounce 120 ms | ❌ | C | INFO |

### Build / release

| Feature | Desktop | Web | Same? | Difference | Intentional? | Severity |
|---|---|---|---|---|---|---|
| Version | git-describe / baked | `version.json` (baked, gitignored) | ⚠️ | re-bake on every deploy | A | — |
| Catalog source | DB seed (catalog_data.py) | `web/catalog.json` derived by build_web.py | ✅ | byte-identical by SHA | A | — |
| Cache tokens | n/a (local server) | manual `?v=` per module | ❌ | release risk if forgotten | — | see §10 |
| Duplicated modules | astro/derive/format/horizon/rig presets | twins in web/ | ⚠️ | pinned or drift-prone — see §9 | — | — |

---

## 3. Confirmed bugs (E)

### E1 — Polar-twilight fallback window: desktop 20:00–04:00, web sunset→sunrise
- **Severity:** HIGH · **Class:** E
- **Desktop behavior:** `app/planning.py:76-80` — when no twilight level pair exists, window = fixed 20:00 local → 04:00 next day, `level="fallback"`, **even when sunset/sunrise exist**.
- **Web behavior:** `web/astro.js:325-336` — `pickDarkWindow` falls back to `sunset`/`sunrise` when the level pairs are missing, and only uses 20:00–04:00 when even sunset/sunrise are null. The comment at astro.js:311-315 explicitly claims desktop parity.
- **Expected:** identical window for the same site/date (per the code's own parity contract).
- **Files:** `app/planning.py:76-80` vs `web/astro.js:320-337`.
- **Reproducible:** Tromsø (69.65N, 18.96E), 2026-05-15: desktop `dusk=2026-05-15T18:00:00Z dawn=2026-05-16T02:00:00Z` (8.0 h); web `dusk=21:35:58Z dawn=23:44:11Z` (2.1 h). Both `level="fallback"` — the pinned level-equality test cannot see this.
- **User impact:** at 66–73° latitude in the polar-twilight season (several weeks per year), % of night, scores, clear windows and "Dark time" differ by up to ~4×. Core-promise territory.
- **Fix direction:** align `pickDarkWindow` to planning.py (only use sunset/sunrise when explicitly intended), or document + test the divergence deliberately. Add a pinned test in the polar-twilight band.

### E2 — Web "Dark time" card shows the astronomical pair instead of the selected level
- **Severity:** MEDIUM · **Class:** E
- **Desktop behavior:** Tonight card uses the payload's `dusk/dawn` = the **selected level** (`tonight.js:41-44`).
- **Web behavior:** `app.js:634-635` uses `info.astroDusk/astroDawn` unconditionally → at nautical/civil-level latitudes shows "— / no full dark night" while scoring runs over the nautical/civil window.
- **Expected:** card must reflect the window the numbers are computed on.
- **Files:** `static/js/tonight.js:41-44` vs `web/app.js:634-635`.
- **Reproducible:** Berlin 2026-06-21 (nautical level): desktop "2h 42m 21:47–00:29"; web "— no full dark night".
- **User impact:** headline stat contradicts the ranking above it; confusing at twilight-edge latitudes.

### E3 — "Frame coverage %": reciprocal semantics and different axes
- **Severity:** MEDIUM · **Class:** E (number meaning) + A (fov_w-only simplification, documented)
- **Desktop behavior:** `derive.js:389-401` `frameCoverage` → `max(ow/fw, oh/fh)`, unbounded, "needs ~N frames"; M42 (90×60′) in a 76.6×43.0′ rig → **139%**.
- **Web behavior:** `app.js:230-236` `rigFramePct` → `clamp(100·fov_w·60/size, 0, 100)` — **field/object**, not object/field; M42 → **85%** (and "fits" when ≥100). Also only the larger axis vs `fov_w` (documented).
- **Expected:** the displayed number must mean the same thing in both apps (or be labeled differently).
- **Files:** `static/js/derive.js:389-401` vs `web/app.js:230-236`, `web/format.js:33-37`.
- **User impact:** a user comparing apps sees 139% vs 85% for the same rig/object.

### E4 — Desktop `statusOf` ignores `ceil_top` (sky-mode overhang)
- **Severity:** MEDIUM · **Class:** E
- **Desktop behavior:** targets-table status pills (`derive.js:292-298`) test only `alt <= ceil`; a sky-band overhang (`ceil_top`) object renders **"Observable"** while the same sample's `vis[]` (derive.js:200-201, includes `ceil_top`) is blocked.
- **Web behavior:** no status text exists; every visibility path includes `ceilTop` (`app.js:147,592,1436`).
- **Expected:** status must match the visibility predicate.
- **Files:** `static/js/derive.js:200-201` vs `:292-298`.
- **User impact:** wrong "Observable" label for balcony/overhang panoramas in the targets table and Tonight cards.

### E5 — Desktop min-altitude threshold freezes at boot; bortle changes don't move it
- **Severity:** MEDIUM · **Class:** E
- **Desktop behavior:** `main.js:53` `S.minAlt = cfg.min_useful_alt ?? 25` once; the bortle handler (`header.js:78-89`) never re-derives it. Detail endpoint fallback is a **hard 25.0** (`server.py:507-508`) while `/api/night`'s documented default is `17+2·bortle` (`server.py:332-334`).
- **Web behavior:** `horizon.js:437` `effectiveMinAlt() = minAlt ?? 17+2·bortle` evaluated live; a bortle drag changes the threshold immediately.
- **Expected:** either both re-derive or both freeze; the two desktop fallbacks must agree.
- **Files:** `static/js/main.js:53`, `static/js/header.js:78-89`, `app/server.py:507-508`.
- **User impact:** desktop users dragging Bortle see no change in visibility until they also move the min-alt slider; the two apps disagree on what's observable.

### E6 — Web "Best targets tonight" top-16 is not visibility-gated
- **Severity:** MEDIUM · **Class:** E
- **Desktop behavior:** `tonight.js:67-71` filters `statusOf(x.o, S.tIdx).code === "vis"` then ranks by score+pop, top 8.
- **Web behavior:** `app.js:628` `rows.slice(0,16)` — pure score+pop ranking; a below-horizon or blocked object can top the list even though the web's own comment (app.js:527-531) claims "visible now" semantics.
- **Expected:** the "Best targets tonight" list must only contain objects clear at the selected time (like the desktop and like the web's own "Visible at" list, app.js:629-630).
- **Files:** `static/js/tonight.js:67-71` vs `web/app.js:622-630`.
- **User impact:** the headline recommendation can be unobservable at the shown time — core promise.

### E7 — Filter advice: `filterAdvice` vs `filterOwned` are different logic
- **Severity:** LOW-MEDIUM · **Class:** E/F (nothing pins either)
- **Desktop behavior:** `derive.js:359-379` — recommends narrowband for nebula/SNR/planetary (any of Ha/OIII), warns "broadband ✗" for galaxies/clusters/star_cloud/asterism when only NB owned.
- **Web behavior:** `app.js:239-245` — ownership-only badge; type map differs (planetary→OIII, nebula→OIII, SNR→Ha, star_cloud→L); never recommends an unowned filter, never warns.
- **Expected:** same advice content for the same ownership state, or a documented divergence.
- **Files:** `static/js/derive.js:359-379` vs `web/app.js:239-245`.
- **User impact:** a web user with no Ha/OIII never learns the object needs narrowband; desktop users get a warning the web never shows.

### E8 — Arrow-key scrub magnitudes are swapped
- **Severity:** LOW · **Class:** E (parity comment violated)
- **Desktop behavior:** `main.js:135` Arrow = 1 sample = **6 min**, Shift = **60 min**.
- **Web behavior:** `app.js:2514` Arrow = **60 min**, Shift = **10 min** — and the comment claims "desktop parity".
- **Expected:** same granularity mapping (or explicit divergence).
- **Files:** `static/js/main.js:126-146` vs `web/app.js:2499-2520`.

---

## 4. Potential bugs (D) — unconfirmed

| ID | Difference | Where | Evidence | Impact | Notes |
|---|---|---|---|---|---|
| D1 | Desktop `blocked` statistic counts the **whole payload grid incl. ±1 h twilight margins**; web counts dusk..dawn only | derive.js:217 vs app.js:607 | code read | blocked count can differ by a few samples | margins exist only for chart context → looks like an oversight |
| D2 | obs % denominator alignment (lattice from dusk−1 h vs anchored at dusk) | derive.js:232 vs app.js:614 | code read | up to ~1.5% difference | bounded, not pinned |
| D3 | Moon illum/age reference: middle **grid sample** + 2 dp rounding (server) vs exact midpoint raw (web) | nightcalc.py:87-89 vs app.js:544 | code read | sub-minute instant + 3rd-decimal diff | invisible in practice |
| D4 | Desktop scoring uses 0.1°-rounded server tracks; web raw floats | nightcalc.py:80-85 vs app.js:589 | code read | score diffs ≤ ~0.01; moon-up gate `>0` can flip | bounded |
| D5 | Web search covers otype/constellation/blurb/distance; desktop only names/other/id | app.js:125-133 vs targets.js:67-80 | code read | desktop can't find "nebula" or a constellation name | arguably a desktop gap |
| D6 | Web Escape doesn't close detail/setup modal (desktop does) | app.js:2376/2399 vs detail.js:133-139 | code read | a11y inconsistency | — |
| D7 | `sunCrossings` skips crossings whose previous sample is exactly the threshold (`prevSign !== 0`); python dawn condition is inclusive | web/astro.js:259 vs planning.py:38/45 | code read | measure-zero at real ephemeris | — |
| D8 | Web rise/set/transit are **calendar-day** based — "peaks 45°" can be a daytime culmination; desktop "max tonight" spans the night margins | web/astro.js:402-424 vs nightcalc.py:205 | code read | misleading "peaks" text in web detail | semantic scope, unpinned |
| D9 | Web pano import lacks id token/length validation (desktop `safe_token`) | horizon.js:132-159 vs database.py:673-678 | code read | no FS risk on web; junk ids possible | — |
| D10 | Mask→profile resolution differs: desktop 720×180 (0.5°/row) vs web 720×360 (0.25°/row) | pano.js:625 vs horizon.js:18 | code read | painted profiles quantize differently | not pinned; bin-level equality unproven |
| D11 | Web backup excludes pano photos + theme; no auto-backup | webstore.js:268-281 vs backup.py | code read | restored pano = blank canvas; theme lost; no safety copy | user-data loss on web restore |
| D12 | Web "busiest hour" absent (desktop-only card counts unclipped margins) | tonight.js:47-54 | code read | desktop card can name a twilight-margin hour | minor |
| D13 | Web pct-sort cold-order flip: cache-miss rows pin to bottom, re-render after warmup | app.js:1175-1178,1265 | code read | order flips shortly after render | cosmetic |
| D14 | Web Tonight drops curated objects with null `vmag` (`o.vmag != null`) — silent | app.js:578-579 | code read | a few curated objects never appear on web Tonight | undocumented |
| D15 | Desktop wizard can be skipped to a **permanent 0-site state** (wizard_done blocks re-run; /api/night 400s, no recovery); web always seeds a site | wizard.js:128-131, main.js:69 | code read | desktop dead-end for careless users | desktop-side robustness gap |

---

## 5. Intentional differences (A) — must remain

1. **No Image Catalog / FITS library / sky map / update checker / favorites / wizard replay / native folder picker on the web** — deliberate browser-port scope cuts.
2. **Web default theme = Glass (`dome`); desktop default = flat.** Picker entries differ (Glass/Classic vs Default/Glass). Per DESIGN.md.
3. **Web edge-space default 14 px vs desktop 200 px; slider ranges 0–300 vs 0–800.**
4. **Web Tonight advanced candidates capped at mag 9; sky map capped at mag 9.5 / 1400 rows** — documented responsiveness caps; desktop applies no mag gate (its mag filter lives in Targets).
5. **Web catalog 60 rows/page vs desktop 250; sortable columns with direction toggle.**
6. **Web per-site timezone + notes fields** (desktop: one global tz setting).
7. **Web backup JSON vs desktop ZIP; formats not cross-importable by design.**
8. **Web rise/set/transit, moon-distance rows, 6-band twilight shading, "Now" button, hash routing, error banner, reduced-data image mode** — web-only features.
9. **Desktop moon up/down header text, moon-up band, busiest-hour card, favorites rings, sky-view toggles, constellation/star backdrop, detail object stepping** — desktop-only.
10. **Web popularity tiebreaker uses live the popularity source fetch with baked fallback; desktop uses the baked column** — same formula, different data path.
11. **`phaseName` 5-band vs `moonPhase` 8-band labels; RA/Dec/time formatters differ in shape** (`"16h 41m 42.2s"` vs `"16h 41m 43s"`, `"+36deg 28'"` vs `"+36° 28.0′"`).
12. **Horizon editor scope** (crop/loupe/landmark-N/60-step undo desktop-only; blank-sky web-only).
13. **Rig presets as picker with empty default, first-added-rig auto-active (desktop) vs none (web)** — cosmetic state defaults.
14. **Tabs: two bars + brand toggle (desktop) vs single hash-routed bar (web).**
15. **Web full-view re-render vs desktop DOM patching; web 60 s Tonight auto-refresh; desktop manual scrub.**
16. **Web always has a site (Berlin fallback); desktop wizard location step mandatory.**
17. **Scan-window span (30 h vs 48 h), modulo normalization styles, 90.0 vs 90.5 no-block sentinels, mid-point vs per-sample precession for advanced tracks** — equivalent behavior, different code.

## 6. Constants and defaults — complete list of meaningful differences

| Constant | Desktop | Web | Class |
|---|---|---|---|
| Polar fallback application | 20:00–04:00 whenever no level pair | sunset→sunrise first, 20:00–04:00 only if no sun crossings | **E1 (bug)** |
| Night grid step | 6 min (margins ±1 h) | 6 min (no margins) | B/C |
| Detail grid | 4 min, dusk−75/+45 min | 120 samples, sunset−1 h/+1 h | C |
| Min-alt default | `17+2·bortle` (server), **frozen at boot** | `17+2·bortle` **live** | **E5** |
| Detail-endpoint min-alt fallback | **25.0 hard** | n/a (client always passes) | **E5** |
| `frameCoverage` semantics | object/field, unbounded | field/object, clamped 0–100 | **E3** |
| Arrow-key step | 1 sample (6 min) / Shift 10 (60 min) | 60 min / Shift 10 min | **E8** |
| Tonight list sizes | 8 (vis-gated) / 8 later | 16 (ungated) / 8 / 8 | **E6** |
| Edge space default | 200 px (0–800) | 14 px (0–300) | B |
| Theme default | `""` flat | `dome` Glass | A |
| Default sort | `score` | `mag` | B |
| Default filters | broadband ON | all OFF (same scoring effect) | B |
| First rig | auto-active | none | B |
| minAlt persist clamp | none | 5–89 else null | B |
| Page size | 250 | 60 | C |
| Advanced Tonight cap | none | mag 9 | A (documented) |
| Sky-map caps | none (user slider mag ≤14/16-20) | mag 9.5, 1400 rows | A/C |
| Mask resolution | 720×180 | 720×360 | D |
| altTop default | 45 (editor/import) vs 60 (DB) | 60 | D |
| Moon reference | middle sample, 2 dp | exact midpoint, raw | D |
| Track rounding | alt/az/ceil 0.1–0.01 dp | raw | C/D |
| Blocked-stat scope | payload grid incl. margins | dusk..dawn | D |
| Filter-advice mapping | "narrowband" = Ha∨OIII | OIII/Ha/L per type | **E7** |
| Fallback window 20:00/04:00 | identical constants | identical constants | A |

**Identical and pinned** (no action): twilight thresholds −6/−12/−18/0 (refracted), cascade order, 10-min scan, bortle 4 default, `17+2·bortle` formula, moonAware false, sizeUnit arcmin, min-alt slider 5–70, popularityFactor formula, moon curves (BASE 60/90/120, 0.333, 180, 0.95, 0.05 floor, bortle 0.25+0.05b / 0.40+0.12(b−3)), NO_BLOCK −90, 720 bins, NIGHT_STEP_MIN 6, 20:00–04:00 constants, half-open window contract, 0.51° ceil tolerance.

## 7. Numerical differences (measured)

| Case | Desktop (planning.py) | Web (astro.js) | Delta |
|---|---|---|---|
| Tromsø 69.65N, 2026-05-15 (polar twilight) | 18:00Z–02:00Z+1 (8.0 h, fallback) | 21:35:58Z–23:44:11Z (2.1 h, fallback) | **3.4 h window, 3.7× span** |
| Tromsø 69.65N, 2026-07-30 | 18:00Z–02:00Z+1 (8.0 h) | 21:20:36Z–00:21:31Z+1 (3.0 h) | **2.7× span** |
| Berlin 52.52N, 2026-06-21 (nautical level) | nautical dusk 21:47:06Z, dawn 00:29:39Z | identical dusk/dawn (0 s) — but web **Dark card** shows astro pair → "—" | E2 display |
| Berlin 52.52N, 2026-09-10 | 19:35:37Z / 02:31:33Z | +0.7 s / +0.7 s | ✅ within the <180 s pin |
| Sydney −33.87, 2026-12-21 | 10:49:48Z / 16:56:40Z | +0.6 s / +30.7 s (dawn) | ✅ within pin |

Analytical (code-verified, not run): obs % ±1 sample (~1.5%); score drift ≤ ~0.01 from 0.1° track rounding; moon reference midpoint ≤ 3 min + 2-dp rounding; precession-epoch error ~7e-6° for advanced tracks (negligible).

## 8. UI/UX differences

- **Defaults users immediately see:** web is Glass, 14 px edge, mag-sorted catalog, unchecked filter boxes, 60-row pages, moon-phase card + "no full dark night"; desktop is flat, 200 px edge, score-sorted, 250-row pages, checked broadband.
- **Workflows:** web recomputes in place (instant) with splash on first compute; desktop round-trips to the server (300 ms debounce). Web full-view re-renders (search caret manually preserved); desktop patches rows.
- **Input:** web has a 24 h scrub + datetime-local + Now button; desktop a grid-index slider. Arrow-key granularity is swapped (E8). Escape semantics differ (D6).
- **Feedback:** desktop toasts all failures and shows status pills per row ("Observable/Blocked/Too low/Below horizon"); web has no per-row status, uses alert()/inline/banner, and its chart `warn` state is dead code.
- **Detail:** desktop arrows step through filtered objects; web modal rebuilds per open and offers delete-custom-target, rise/set/transit, moon distance, 6-band twilight shading.
- **Sky View:** desktop has constellation/star backdrop, toggles, mag slider, clickable legend, favorites rings; web fixed render with dashed min-alt ring.
- **Editor:** desktop horizon editor is richer (crop, loupe, landmark-N, 60-step undo, click-to-calibrate); web adds blank-sky creation and a profile strip.

## 9. Error-handling differences

- **No-site state:** desktop can reach a permanent zero-site dead-end (wizard skip + `wizard_done`); web always self-heals with a Berlin site.
- **API failures:** desktop toasts; web alerts inline or silently ignores (weather uses the same silent path as desktop).
- **Offline images:** both degrade; web shows explicit "photo unavailable (offline?)" and honors `prefers-reduced-data`.
- **Backup import:** desktop writes `<db>.backup-auto.zip` first and validates paths/ids; web has a confirm-only dialog and loses pano photos + theme.
- **Corrupt panorama:** both degrade to "nothing blocks".
- **Extreme latitudes:** both "handle" polar cases, but differently (E1) — the one genuine failure-mode divergence.

## 10. Performance differences

- Desktop: server computes grids (payload ~1.5 MB advanced-metadata); client synthesis yields every 256 objects. Web: everything client-side; obsCache (≤250k entries) + searchCache; capped candidates; 120-sample detail charts; 60-row pages.
- Web full-view innerHTML rebuilds per render vs desktop DOM patching; web defers compute 30 ms behind a splash; web auto-refreshes Tonight every 60 s.
- Desktop image thumbs are cache-only; web uses bundled images + Wikipedia + IndexedDB.
- No correctness impact; all classified C.

## 11. Duplication / drift risks

| Duplicated concept | Copies | Pinned? | Risk |
|---|---|---|---|
| Astronomy engine | astro.py · static/js/astro.js · web/astro.js | ✅ (test_js_parity, 1e-9) | low |
| Twilight/window selection | planning.py · web nightInfo/pickDarkWindow | ✅ except **polar band (E1)** | **high in polar season** |
| Clear window | longest_run · longestRunJS · 3 inline copies in app.js | ✅ (window engine) | medium (web inline copies) |
| Scoring loop | nightcalc (ships tracks) · derive.js · **3 separate loops in web/app.js** (tonight 587, detail 1429, computeObs 139) | curves pinned; **loops not** | **high** — a constant or clip change in one loop won't touch the others |
| Ceil lookup | ceil_lookup · derive.js:80-94 · horizon.js ceilFor | ✅ (horizon_parity, 0.51°) | low |
| fmtSize | util.js:162 · format.js | ✅ (size engine) | low |
| Moon phase labels | phaseName (5) · moonPhase (8) | ❌ | already drifted (cosmetic) |
| Filter advice | filterAdvice · filterOwned | ❌ | **already drifted (E7)** |
| Frame coverage | frameCoverage · rigFramePct | ❌ | **already drifted (E3)** |
| Status/visibility | statusOf · vis[] · app.js visNow | ❌ | **drifted (E4)** |
| Rig presets | rig_presets.py · webstore.js DEFAULT_RIGS | ✅ (test_rig_presets) | low |
| Polar charts | skyview.js · web renderSky | ❌ | drift-prone (separate engines) |
| Time formats | util.js fmtT · astro.js fmtTime · app.js fmtClock | ❌ | cosmetic |

## 12. Historical parity issues (v0.5.4 → HEAD)

1. **Web scored over the civil window on a 10-min grid with "now"-moon illumination from 0.5.1 → 0.6.9** (five releases) — the single biggest drift; fixed wholesale in 653e7f1.
2. **Web moon curves lagged the desktop 0.5.11 upgrade by one release (0.5.12)**; the two bortle curves even disagreed numerically during that window (0.55+0.12 vs 0.40+0.12).
3. **Cross-timezone night resolution** wrong for every site outside the browser's zone from 0.5.1; half-fixed 0.5.12, fully fixed 0.6.9 (siteNoon).
4. **Popularity affordances removed web-first (0.6.3), desktop last (0.6.5)** — two releases of one-sided exposure.
5. **Edge-space slider inert at wide viewports** — web-only; first fix (7a20d20) incomplete, real fix aee973d.
6. **Web size column** echoed single-axis sizes verbatim; fixed 73aedc1 (desktop already correct).
7. **Clear-window counting included twilight margins on both sides** until 653e7f1 clipped both to dusk..dawn.
8. **Web moonAware checkbox default ON while the penalty was OFF** (undefined) — display/behavior mismatch fixed 0.6.9.
9. **0.6.6 hidden-attribute CSS trap** (web-only); **0.6.8 orphaned CSS token bump** (process drift).
10. **d34c3f5 cp1252 mojibake** — introduced by 653e7f1's own edits, repaired + redeployed; guard added.
11. **E1's polar band is the latest blind spot**: every previous parity fix targeted the pinned band; the fallback branch itself was never probed.

## 13. Release-risk assessment

- **E1/E2 touch the pinned twilight surface** (`pickDarkWindow`, web/astro.js + planning.py + tests): fixing them requires re-checking `test_web_twilight_choice_rule` and the darkwindow pins — a wrong "fix" can re-break the pinned <180 s agreement.
- **Web fixes need cache-token bumps in the same commit** (`app.js?v=`, `astro.js?v=` — currently 29/4) or returning visitors keep the broken pairing; a fix touching `web/astro.js` must bump both `app.js` and `astro.js` tokens.
- **The web has three inline scoring loops**: any future constant change must hit all three + derive.js, or the catalog % column, Tonight and detail will disagree with each other before the desktop even comes into it.
- **Backup-format drift (web loses pano photos/theme)** is a silent data-loss trap for web users who export/import; document it in the backup dialog or fix it.
- **Coordinated-edit blindness**: `moonIllumination`/`moonAge`/`julianDay` are not numerically pinned — a coordinated wrong change (like the old precession matrix) would pass the suite.
- **Deploy-order rule** (dependencies first, index.html last) and `build_web.py version` re-bake remain mandatory; nothing in this audit changes that.

## 14. Recommended priorities

| Rank | Item | Class | Why |
|---|---|---|---|
| 1 | **E1 polar-twilight fallback** | E, HIGH | measured 8 h vs 2.1 h window; core promise at high latitudes; invisible to the pinned suite |
| 2 | **E3 frame-coverage number semantics** | E, MED | confusing reciprocal number; likely to confuse support/users |
| 3 | **E5 min-alt liveness + 25.0 fallback** | E, MED | desktop freeze is a real state bug; server has two disagreeing defaults |
| 4 | **E6 top-16 visibility gate** | E, MED | headline list can recommend unobservable targets |
| 5 | **E4 statusOf ceil_top** | E, MED | wrong "Observable" labels with sky-mode panoramas |
| 6 | **E2 Dark-time card level** | E, MED | headline stat contradicts the scoring window |
| 7 | **E7 filter advice parity** | E, LOW-MED | two different products' advice; pick one model |
| 8 | **D11 web backup loses pano photos/theme** | D, MED | silent web-side data loss |
| 9 | **E8 arrow-key mapping** | E, LOW | trivial fix, parity comment already claims the wrong thing |
| 10 | **D1/D2/D4 rounding & scope drifts** | D | add pins (blocked scope, obs% denominator, track rounding) |
| 11 | **Pin the unpinned engine surface** (moonIllumination/moonAge/julianDay, formatters) | F | close the coordinated-edit blind spot |

---

*Audit artifacts: sub-agent digests (astronomy, window/grids, scoring, state, catalog/pano/backup, history, UI), verification reads of `planning.py`, `web/astro.js:230-349`, `derive.js:185-410`, `web/app.js:95-274/509-694/2495-2520`, `main.js`, `header.js:20-119`, `tonight.js`, `server.py:485-529`; probes in `%TEMP%\opencode\polar_probe.py` + `web_window_probe.mjs`; parity suite re-run (35 passed). Nothing in the repo was modified.*