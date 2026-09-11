# Panorama editor — design & implementation review

Scope: the WEB horizon/panorama editor (`web/horizon.js` + `web/app.js` horizon view,
`web/style.css`) compared with the DESKTOP editor (`static/js/pano.js`,
`static/index.html` horizon tab). Reviewed 2026-09-11 as part of the 0.6.10 feature
pass. Priorities are about the WEB editor; the desktop is the comparison baseline.

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

## Deferred — prioritised

### P1 (worth doing next, medium size)
- **HiDPI / resize sharpness:** the editor canvas is a fixed 720x360 backing scaled by CSS,
  with no DPR factor, so it is soft on HiDPI and its labels shrink/grow with the container.
  Needs a DPR-aware backing store and a `ResizeObserver` (desktop is DPR+resize aware,
  `static/js/pano.js:432-437`). Medium complexity, touches every transform.
- **Redo / multi-step history:** undo is a single `strokes.pop()` (no redo, destructive
  Clear with no confirmation). Desktop keeps a 60-deep snapshot stack.

### P2 (enhancements)
- **Live profile preview parity:** web already has `#pano-profile`; desktop has no live
  preview — porting the web preview to desktop would help both.
- **Editor zoom/pan + magnifier:** desktop has a loupe (`#loupeCv`, Z=3); the web has no
  zoom. Useful for precise small obstructions.
- **Crop tool:** desktop can trim side bands and recalibrate (`static/js/pano.js:318-361`);
  web has no crop.
- **Unsaved/reset affordances:** the web auto-saves, so a Save/Cancel model does not apply,
  but an explicit "Reset mask" and a "last saved" subtle indicator would reduce anxiety.
- **Duplicate / export one panorama**; show the numeric ceiling under the cursor.

### P3 (polish)
- Guide legend line in the hint text; denser degree labels when zoomed.
- ARIA roles/labels on the canvas and toolbar (focus states, `role="img"` + described-by).
- Profile-preview axis ticks; tool-specific cursors; contrast tuning on the mask overlay.

### Deferred correctness note (not a 0.6.11 blocker)
- **Profile-without-strokes clobber:** `web/horizon.js::drawProfile` now derives the
  in-memory `p.profile` from the stroke mask every frame. A record that carries a
  valid `profile`/`profileTop` but an EMPTY `strokes` array would therefore have its
  stored profile replaced by an empty (all-`NO_BLOCK`) profile in memory, and the
  next save would persist that. Verified that no legitimate production workflow
  produces this shape: `newPano()` starts profile and strokes empty together, every
  paint appends a stroke before the profile is derived, `exportPanos()` always ships
  strokes, and a desktop panorama (absolute-azimuth profile in SQLite) is never
  imported into the web store. Only a hand-edited/foreign backup could hit it, so it
  is deferred; a future guard could drop profile-without-strokes in `importPanos()`
  or keep the stored profile when `strokes.length === 0`.

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
