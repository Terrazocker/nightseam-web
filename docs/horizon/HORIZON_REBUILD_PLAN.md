# Horizon rebuild plan

Created October 11, 2026. The owner approved this rebuild in conversation: the
editor was too complicated, and the project is treated as fully in
development, so nothing needs to stay backwards compatible. It replaces the
geographic calibration plan (P3-P7), now in `docs/history/` together with the
accuracy research.

Status: phases 1-6 are implemented locally on branch `horizon-rebuild`. Real-photo and device acceptance:
[HORIZON_ACCEPTANCE.md](../acceptance/HORIZON_ACCEPTANCE.md).

## Owner decisions

- A horizon is a skyline on a compass grid. Photos are only a tracing aid.
- Overhangs and balcony openings come after the first version (phase 4).
- Ordinary (non-panorama) photos are supported as partial photos with an
  approximate linear angle mapping.
- Horizons saved by the published 0.1.x builds are dropped, not converted.
  Older backups still restore their sites, rigs, targets and settings; their
  horizon section is ignored.

## Model

```
{ id, name,
  points: [{ az, alt }, ...],     // world azimuth/altitude in degrees, sorted by az
  overhangs: [[{ az, alt }, ...]], // edge lines within 0-360, sky above them blocked
  photo: null | { width, heading, tilt, roll } }
```

- `points` are the only source of truth. The planner's 720-bin world-azimuth
  profile (0.5 deg bins) is derived from them by linear interpolation around
  the full circle. No points means nothing is blocked; one point is a flat
  skyline at that altitude.
- `photo` places the photo on the grid. Pixels are treated as square in
  degrees: `width` is the photo's horizontal angle (360 for a full panorama,
  which then wraps), `heading` the azimuth of the photo centre, `tilt` the
  altitude of the photo centre and `roll` its rotation. The photo bytes stay
  in IndexedDB; the record only says whether one exists.
- Changing the photo placement moves the skyline points with it, so fixing
  north after tracing keeps the trace on the photo.
- Removed: brush/eraser masks, sky-band mode, block-above, crops, the coverage
  policy, calibration evidence (versions 1-5), projection conversion,
  measurement evidence, landmarks, provenance, confidence and the precise
  720-bin table.

## Screen

- Left rail: the horizon list, *New from photo*, *Draw by hand*, *Import file*,
  and *Export file* for the selected horizon. Deleting asks first.
- Toolbar: Draw / Align photo, Undo, Redo, Clear, save status, zoom.
- Canvas: azimuth 0-360 across, altitude -10 to 80 up, photo underneath.
  - Draw: click adds a point, dragging a point moves it, dragging across empty
    grid sketches a line that replaces the points in that azimuth range,
    Delete removes the selected point.
  - Align photo: drag the photo to move it (heading and tilt); drag a level
    handle to rotate it (roll).
- Settings rail: photo width, north direction, tilt and roll as numbers;
  *Set north from a landmark*; *Detect skyline*; remove photo; a points table
  for keyboard entry; display options.
- Edits save automatically. Undo/redo, the dirty state and the leave-page
  warning stay; a failed save keeps the edit dirty and says so.

## Files

- Import parses lines of `azimuth altitude` (space, tab, comma or semicolon
  separated; `#` and `;` comments; other non-numeric lines skipped). This reads
  Stellarium polygonal horizons, N.I.N.A. `.hrz` files and plain lists.
- Export writes the same plain `azimuth altitude` format.

## Phases

1. **Core model and grid editor.** New `core/horizon.js` (points, profile,
   ceiling, photo mapping, file parsing), a generic editor history, simplified
   scoring/visibility/fingerprint, new `web/horizon.js` without photos, backup
   format 11, Sky View cleanup, tests and documentation. The old satellite
   modules, calibration and projection code are deleted.
2. **Photo underlay.** Upload with one width question (2:1 photos default to
   360 deg), photo drawn under the grid, Align mode, numeric placement fields,
   *Set north from a landmark*, points follow the photo.
3. **Skyline detection.** A pure core function finds the sky/ground boundary
   in a daylight photo, column by column, and simplifies it to points the user
   can correct.
4. **Overhangs.** Edge lines over part of the circle (a balcony underside, a
   roof edge, a branch); everything above an edge is blocked. They derive an
   upper-ceiling profile (`profileTop`) that the shared visibility rule, the
   scorer, Sky View and the detail chart already understand. An Overhang mode
   draws and edits them; a numeric form adds a flat one (the same direction
   twice means all the way round).
5. **Phone compass.** On a phone or tablet, the device orientation gives the
   direction the back camera points: add one point, or trace by sweeping
   along the skyline. A landmark sets a correction for compass error and
   magnetic declination.
6. **North from the Sun.** Mark the Sun in a daylight photo; the capture time
   (from EXIF when the photo has it) and the observing site give the Sun's
   direction, which sets the photo's north and tilt.

Still open after phase 6: sky visible through gaps above an obstruction
(between branches), which needs more than one opening per direction.

Each phase ends with the touched tests, the token and core build steps from
AGENTS.md, and updated documents. The full suite runs at the end of the
rebuild.
