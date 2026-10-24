# Horizon owner acceptance

The horizon editor ([rebuild plan](../horizon/HORIZON_REBUILD_PLAN.md)),
the phone capture ([sensor capture plan](../horizon/HORIZON_SENSOR_CAPTURE_PLAN.md))
and phone pairing ([pairing plan](../horizon/HORIZON_PAIRING_PLAN.md))
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

1. **First open, compass north.** Open *Capture with phone* (or *Capture* in
   an open horizon's editor) and hold the
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
   the image while moving and catch up when you stop. Before this check,
   run the calibration routine (offered on the first capture, or *North… ›
   Details › Line up the drawing*) and note its result. Still check of
   the scale: *Add point* on a sharp feature, turn until it is near the left
   or right edge and hold still. Target: the dot stays on the feature. Then
   the same with a feature well above the horizon held near the top or
   bottom edge (the up-down scale).
8. **Share to a desktop.** *Share link*, send it to yourself, open it on the
   desktop, *Add horizon*. Target: the same points and overhangs as on the
   phone; the desktop address bar ends in `#horizon`, without the code.
9. **Keyboard and closing.** With a keyboard (or a desktop): Tab reaches every
   control, Enter starts and stops tracing, Escape closes the view, and focus
   returns to *Capture*. The camera stops (its indicator goes
   out) as the view closes.
10. **Wrong site.** With location access allowed, open the capture somewhere
    more than about 100 m from the selected site. Target: the view warns
    that a horizon only holds where it was measured.
11. **First start.** Clear the site's data (or use a fresh browser profile),
    open the capture and answer the camera prompt. Target: the readout
    finds north without reopening the view; if the sensors stay silent for
    3 s, the sensor panel shows its three steps, and *Start the sensors*
    with the phone held still brings the readings. Once north is set, the
    drawing's calibration follows at once (*North is set. Next, …*).
12. **Calibration guide.** Run *Line up the drawing*. Target: step 1 rings
    the cross; step 2 shows *Turn right* with an arrow, a dashed arrow
    towards the amber line and *Stop when your object is on this line*;
    turning left instead says *Other way*; step 3 does the same with *Tilt
    down*.

## Pairing

Run these on nightseam.de once the relay is deployed (phase 5), with the
Pixel 7a and the desktop. The desktop's site is the one you stand at.

1. **End to end.** On the desktop: Horizon, *Get from phone*. Scan the code
   with the phone's own camera app and open the link. Target: the phone's
   address bar ends in `#horizon` (no code), and the *Pairing* section names
   the desktop's site; the desktop says *Phone connected* within about 5 s.
2. **Capture and send.** On the phone: *New horizon* (or pick one), capture a
   stretch of skyline, *Send to desktop*. Target: the phone says it was sent;
   within about 5 s the desktop asks *Add the horizon …? From your phone: …*;
   *Add horizon* adds the same points and overhangs as on the phone.
3. **Refuse.** Pair again, send, and press *Cancel* on the desktop's
   question. Target: no horizon is added.
4. **Cancel and expiry.** Pair again and press *Cancel* on the desktop before
   scanning; then scan the old code. Target: the phone says the pairing has
   expired or was cancelled. Pair once more and wait 10 minutes without
   scanning. Target: the desktop says the code has expired and hides it; the
   phone, opening it, says so too.
5. **Moon on the phone.** While paired, open the capture's *North…* panel.
   Target: the Moon's reference uses the desktop's site (its availability
   matches what the desktop's Sky View shows), and the phone's own sites
   are unchanged afterwards.
6. **Keyboard.** On the desktop, open *Get from phone* with the keyboard.
   Target: focus starts on *Cancel*, Tab stays in the dialog (*Show the
   link*, the code field, *Get*, Cancel), Escape closes it and focus returns
   to *Get from phone*.
7. **Horizon code.** On the phone, *New horizon* and capture a stretch of
   skyline. Target: once it has a point, a code like `K7Q-4MX · 23 h`
   appears beside its name. On the desktop: *Get from phone*, type the code
   in lower case. Target: the desktop asks before adding the same points and
   overhangs.
8. **Edit, wrong code, delete.** Rename the horizon on the phone, wait a few
   seconds and fetch the code again on the desktop. Target: the new name. A
   code with one character changed says no horizon has it. *Delete from the
   server* on the phone. Target: the desktop no longer finds the code; the
   phone offers *Get a code (24 h)*.
9. **After 24 hours.** The next day, open the horizon on the phone. Target:
   *Get a code (24 h)* instead of the code, the old code is not found on the
   desktop, and the button makes a new code that works.

## Devices and accessibility

On the intended touch or pen device, sketch slowly and quickly, drag a point,
interrupt a drag, zoom and pan, and draw an overhang edge. Each gesture should
be one undo step.

On a phone the grid is view-only: dragging pans, tapping adds nothing, and
*Capture* in the editor head is the way to add to the skyline.

With keyboard and the intended screen reader: create a horizon, add points
with Insert, select and move them with the arrow keys, delete
one, undo and redo. Check that focus, the save status and the skyline summary
are announced and understandable.
