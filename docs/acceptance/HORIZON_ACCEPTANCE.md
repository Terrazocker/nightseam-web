# Horizon owner acceptance

The horizon editor ([rebuild plan](../horizon/HORIZON_REBUILD_PLAN.md)) and
the phone capture ([sensor capture plan](../horizon/HORIZON_SENSOR_CAPTURE_PLAN.md))
have software checks in pytest and the browser suite. These real-world checks
are the owner's. Record the device, browser, site, time and what you
observed; actual outcomes go in RELEASES.md.

The real-photo checks were removed on October 15, 2026: the owner found photo
calibration too fiddly on a Pixel 7a, and horizon photos were replaced by the
phone capture.

## Phone capture

**Before you start.** Set the observing site in the top bar to where you
stand (the Moon reference is computed for it). From a map, note the
true bearing of two landmarks you can see from there, ideally 60° or more
apart: a chimney, a mast, a church tower, a gap between trees. Reload the
planner, so the first check really is a first open.

1. **First open, compass north.** Open *Capture with the camera* and hold the
   phone upright and still. It should say the compass is settling, then show
   a direction within about 15 s, without *Re-read*. Put the cross on landmark
   A and note the reading. Target: within 10° of its map bearing (phone
   compasses are rough; note how far off it is).
2. **North from a landmark.** *North…*, type landmark A's bearing, put the
   cross on it, *Landmark is in the cross*. Put the cross on landmark B.
   Target: B reads within 1° of its map bearing.
3. **North from the Moon** (when it is 2–60° up; the panel says whether it
   is). Put the cross on its centre and tap *Moon is in the cross*. Then aim at landmark A. Target: A reads within 1° of its
   map bearing, and the panel's altitude note stays under 0.5°.
4. **Skyline, full turn, loop closed.** Start tracing on landmark A, turn once
   slowly along the skyline back to A, stop with the cross on A, *Yes, close
   the loop*. Target: "Loop closed" with 1.5° or less of drift. The skyline in
   the editor follows the real one. Starting and stopping each give a short
   vibration; turning quickly turns the crosshair amber with *Too fast*, and
   it clears once you slow down.
5. **Repeatability.** Do step 4 a second time into a new horizon. Target: the
   two skylines in the editor agree within 2° wherever the skyline is sharp
   (rooftops, masts).
6. **Overhang.** Switch to *Overhang*, trace the underside of a balcony, eave
   or branch. Target: an overhang edge where it is, one undo step.
7. **AR overlay.** Hold still with the recorded skyline in view. Target: it
   lies on the real skyline at the crosshair and still lies on it near the
   screen edges. Pan slowly and quickly. Note whether the lines trail behind
   the image while moving and catch up when you stop. Then open *North…*
   and *Details*, and note the camera line: after half a
   minute of slow panning and tilting it should say *measured on this
   phone*, and its two angles (sideways, up-down) should agree within a few
   degrees. If the overlay is off, *Reset camera calibration*, pan again and
   note both lines.
8. **Share to a desktop.** *Share link*, send it to yourself, open it on the
   desktop, *Add horizon*. Target: the same points and overhangs as on the
   phone; the desktop address bar ends in `#horizon`, without the code.
9. **Keyboard and closing.** With a keyboard (or a desktop): Tab reaches every
   control, Enter starts and stops tracing, Escape closes the view, and focus
   returns to *Capture with the camera*. The camera stops (its indicator goes
   out) as the view closes.
10. **Wrong site.** With location access allowed, open the capture somewhere
    more than about 100 m from the selected site. Target: the view warns
    that a horizon only holds where it was measured.

## Devices and accessibility

On the intended touch or pen device, sketch slowly and quickly, drag a point,
interrupt a drag, zoom and pan, and draw an overhang edge. Each gesture should
be one undo step.

With keyboard and the intended screen reader: create a horizon, add points
through *Points by numbers*, select and move them with the arrow keys, delete
one, undo and redo. Check that focus, the save status and the skyline summary
are announced and understandable.
