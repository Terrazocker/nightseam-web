# Panorama editor — design & implementation review

Scope: the WEB horizon/panorama editor (`web/horizon.js` + `web/app.js` horizon view,
`web/style.css`) compared with the DESKTOP editor (`static/js/pano.js`,
`static/index.html` horizon tab). Originally reviewed 2026-09-11 for the 0.6.10 feature
pass; the coordinate P0/P1 fixes landed then and the **UX redesign** (history, Save/dirty,
DPR/resize, zoom/pan, guides, cursor) landed in the following pass. Priorities are about
the WEB editor; the desktop is the comparison baseline.

## Coordinate system (verified)

- Mask is 720 x 360 (`MASK_W`, `MASK_H`); 720 profile bins at 0.5 deg, `NO_BLOCK = -90`.
- Azimuth is FOV-relative: `d = ((az - azOffset) % 360 + 360) % 360`, then
  `x = d / fov * MASK_W`. `ceilFor()` uses exactly this to pick the bin.
- Image y = 0 is `altTop`, y = `MASK_H-1` is `altBottom`
  (`row = (altTop - alt) / (altTop - altBottom) * (MASK_H-1)`), i.e. vertical is inverted.
- North = azimuth 0 at the left edge when `azOffset = 0`; the mask wraps at 360.

## Implemented in this pass

### P0 — correctness

1. **Sky-mode "open above" was lost.** A visible-sky band painted to the top of the
   frame still stored a numeric `profileTop`, so every object ABOVE the band was
   treated as blocked — the sky straight overhead disappeared from planning.
   *Evidence:* desktop emits the `90.5` sentinel when `eTop >= altTop - 4`
   (`static/js/pano.js:669-677`); web `computeProfile` never did.
   *Fix:* `profileFromMask()` now emits `90.5` in the same window. Regression-tested.
2. **Azimuth/cardinal labels were mis-scaled for partial FOVs.** The N/E/S/W hints used
   `(x/360)*MASK_W`, ignoring `fov`, so on any non-360 panorama the compass was wrong —
   a user could calibrate against a wrong direction.
   *Evidence:* old `web/horizon.js:550-552`.
   *Fix:* guides use `xOfAz()` (FOV-relative), the same transform as `ceilFor()`.

### P1 — usability

3. **No alignment guides / degree markings.** Only 7 unlabeled horizontal lines existed.
   *Fix:* vertical azimuth guides every 30 deg (majors N/E/S/W every 90 deg) and
   horizontal altitude guides every 15 deg with degree labels; the `alt = 0` horizon
   baseline is emphasized and the centre azimuth of a partial pano is marked. All drawn
   with `xOfAz` / `rowOfAlt`, i.e. the exact calibration transform.
4. **No cursor coordinate readout.** Precision editing was guesswork.
   *Fix:* `cursor: az X° · alt Y°` readout via `azOfX()` / `altOf()`.
5. **360 deg seam was not wrapped while painting.** A stroke across the left edge left a
   gap at the right edge; the wrapped profile then had a spurious step.
   *Evidence:* desktop wraps dabs (`static/js/pano.js:392-405, 412`); web did not.
   *Fix:* `rebuildMask(strokes, wrap)` paints each dab at x±MASK_W when `fov >= 359.5`.
6. **Jank while painting.** Every pointer sample rebuilt the full mask AND wrote the whole
   panorama set to localStorage (`overlay → drawProfile → computeProfile`). On long
   strokes this caused dropped pointer samples.
   *Fix:* the overlay derives the profile from the already-built mask
   (`profileFromMask`, in-memory); persistence happens once per stroke end / save.

## UX redesign (implemented)

Interaction model: the editor is one session with an explicit saved baseline.

**Phase 1 (must-have)**
- **Undo/redo history:** JSON snapshots of the EDITABLE state (strokes + calibration +
  paint mode), ONE entry per gesture (committed on pointer up), bounded
  (`HISTORY_LIMIT`), redo invalidated by a new edit; `snapshotPano`/`historyCommit`/
  `historyUndo`/`historyRedo`/`historyMarkSaved`/`historyDirty`.
- **Confirmed Clear:** an in-page `confirmDialog` (Cancel / Clear), never a blocking
  `alert`; the clear is one undoable history entry.
- **Revert:** restores the last saved state (discarding unsaved edits) and is itself
  undoable.
- **Dirty state:** a "Saved" / "Unsaved changes" / "Saving…" / "Save failed" chip and a
  highlighted Save; `historyDirty` clears when the state returns to the marked baseline
  (so undoing all changes returns to "Saved").
- **DPR-aware rendering + responsive resizing:** the canvas backing store follows the
  displayed size and `devicePixelRatio`, with a `ResizeObserver`; all drawing stays in
  the 720x360 logical space, so guides, hit-testing and `ceilFor` share one transform.

**Phase 2 (high value)**
- **Zoom/pan (presentation-only):** `editorClampZoom` (1..8), `editorViewMatrix`,
  `editorScreenToBase`, `editorClampFocus`; wheel = zoom-to-cursor, middle-drag or
  Space+drag = pan, Fit resets. Stored geometry never changes.
- **Guide hierarchy:** guides densify with zoom (10 deg az / 5 deg alt at zoom >= 3);
  majors stay N/E/S/W + the emphasized `alt = 0` horizon line.
- **Cursor readout:** `az 123.5° SE · alt +12.3°`, with an "outside image" marker beyond
  the mask; uses the same `azOfX`/`altOf` transform as the guides.
- **Magnifier:** evaluated and NOT added - zoom/pan already provides the precision the
  desktop loupe gave, without a second rendering path.

Edits apply to planning IMMEDIATELY (in-memory `activePano`) but persist only on Save;
`flushHorizonEdits()` runs on panorama switch / create / navigating away and a
`beforeunload` guard covers closing the tab, so an edit is never silently lost. Pinned by
`tests/js/pano_ui.mjs` + `tests/test_ui_invariants.py`.

## Deferred — prioritised

### P2 (enhancements)
- **Crop / FOV editing:** desktop can trim side bands and recalibrate
  (`static/js/pano.js:318-361`); the web has none. Deferred as a separate follow-up - it
  needs a crop UI plus a recalibration flow, and half-implementing it would risk the
  azimuth mapping.
- **Live profile preview parity:** web has `#pano-profile`; desktop has none - porting the
  web preview to desktop would help both.
- **Duplicate / export one panorama**; show the numeric ceiling under the cursor.

### P3 (polish)
- Profile-preview axis ticks; richer ARIA (the canvas is already focusable and buttons are
  labelled); contrast tuning on the mask overlay.

### Resolved — profile-without-strokes invariant (data/backup pass)
- **Canonical invariant:** strokes WIN when present (the profile is re-derived
  from the mask); with NO strokes the stored `profile`/`profileTop` are
  AUTHORITATIVE, so a stroke-less imported record is never blanked by opening or
  saving it. Enforced at every boundary: `web/horizon.js::computeProfile` /
  `drawProfile` and `static/js/pano.js::recomputeProfile` keep the stored profile
  when `strokes` is empty; `normalizePanos()` re-derives only when strokes exist;
  `clearMask()` (web `clearMask`, desktop `clearMask`) is the ONE deliberate
  blanking path. Rationale: silently deriving an empty profile from an empty mask
  could remove a real obstruction and make a blocked target look observable.
  Regression: `tests/js/web_backup.mjs` (both directions) and
  `tests/test_ui_invariants.py::test_desktop_robustness_invariants`.

## Web <-> desktop feature matrix

| Feature | Web | Desktop |
|---|---|---|
| Persistence | localStorage + IndexedDB photo | SQLite + `/api/panorama*` (server) |
| Crop / recalibrate | no | yes |
| Magnifier loupe | no | yes |
| Landmark-bearing calibration (numeric) | no | yes |
| Undo | pop only | 60-deep stack |
| Seam wrap | **yes (new)** | yes |
| Sky "open above" 90.5 | **yes (new)** | yes |
| Alignment guides | **yes (new)** | yes (elevation 15 / az 30) |
| Cursor az/alt readout | **yes (new)** | no |
| Live profile preview | yes | no |
| Drag & drop / blank sky | yes | no |
| Privacy (no upload) | yes | n/a (local app) |
| DPR + resize sharpness | no | yes |

Not changed by design: the web stores FOV-relative profile bins internally
(`col = d/fov*720`) while the desktop stores absolute-azimuth bins (`i*0.5`). Both are
self-consistent with their own `ceilFor`/`ceil_lookup` lookup and the parity test only
exercises `fov=360, azOffset=0`; the two JSON representations are not interchangeable for
partial panoramas. Making them interchangeable is a larger, data-migrating change and was
deliberately NOT attempted here.
