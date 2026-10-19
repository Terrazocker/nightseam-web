# Independent website release record

Actual validation outcomes, newest first. Published releases: v0.1.1 (October 8,
2026) and v0.1.0 (October 7, 2026). Entries above the v0.1.1 record are local
development awaiting the next release, 0.7.0. Upload success alone is never
recorded as acceptance.

## Dock geometry wait in the docked-inspector check (BROWSER-CI-003) — October 19, 2026 (branch ccr-9a404934-2ntdx7)

web-docked-inspector-fit-and-tonight-key failed locally 11 times in 53 runs
(Linux container, Playwright Chromium 141), with the same geometry as the
October 18 CI failure. Probes showed the app writing the right dock offset
every time, while Chrome laid the fixed dock out one write behind. The
detailed evidence is in BUGS.md. Setting the dock's own inline `top` did
not help (4 failures in 24 runs) and was reverted. A minimal page with the
same layout did not reproduce it.

Fix (test only): after returning to the page top, the check waits for the
dock's own box to reach the chrome bottom as well as for `--detail-top`;
the assertions are unchanged. DEVELOPMENT.md records the rule for geometry
checks. Planner code is unchanged, so there was no cache-token bump.

Local validation: the check passed 30/30 with the fix; pytest 361 passed,
1 skipped; browser web suite 87/88. The one failure is web-load-smoke,
because this clone has no version tags (the footer shows `NightSeam Web
2d3b587`). The public repository has none yet, so CI fails the same check,
and build_changelog.py --check also fails. Not yet confirmed on Linux CI;
BUGS.md keeps the entry until it is.

## File-chooser wait in the responsive planner check (BROWSER-CI-002) — October 18, 2026 (branch claude/angry-mayer-374852)

web-phase4-responsive-planner timed out waiting for the file chooser after
Enter on the Horizon import label at 360 px on Linux CI three times: runs
38444781285 (passed on rerun), 38467786838 and 39129674772. Each failure
took 32.8 s against about 9 s for a pass, so it stalled at the first
chooser. The failure screenshots show the label still focused.

Cause: the test, not the planner. `expect_file_chooser()` turns on
Playwright's chooser interception with a message it does not wait for, and
Chrome handles that message in the renderer behind queued page work. The
Enter key reaches the page on the higher-priority input queue. On a busy
page the keydown can be handled first: the label's handler runs
`input.click()` with user activation, Chrome opens its own dialog (headless
cancels it), and Playwright never sees a chooser. Reproduced locally with a
probe that keeps the main thread busy for about 1.6 s before the press:
30/30 Enter presses missed the chooser, each with the input clicked and then
cancelled. With a `filechooser` listener registered beforehand, 0/30 missed.

Fix: the check registers a `filechooser` listener right after boot, so
interception is on long before the press. `expect_file_chooser()` and the
Enter press are unchanged, so the check still needs a real chooser from the
keyboard. With the same busy page added before the press as a scratch edit
(not committed), the check passed 3/3 with the listener and failed 2/3
without it, with the CI error. Planner code is unchanged, so there was no
cache-token bump. DEVELOPMENT.md records the rule for file-chooser checks.

Local validation: the unmodified check passed 15/15 before the fix; pytest
358 passed, 1 skipped; browser web suite 87/87. After merging master (pull
request #13): pytest 360 passed, 1 skipped; browser web suite 88/88. Not yet
confirmed on Linux CI.

## Browser harness: no Chrome-refused ports; CI flake recorded — October 18, 2026 (branch horizon-edge-cases)

CI on pull request #12 (run 39150513399) failed one browser check outside
this change, web-docked-inspector-fit-and-tonight-key (BUGS.md
BROWSER-CI-003); guards and pytest passed. Repeating it locally, one of five
runs failed before loading the page with `net::ERR_UNSAFE_PORT`: the OS had
given the test server port 6000, which Chrome refuses. The harness now gives
back any port on Chromium's restricted list and takes another; a new guard
in test_browser_gate.py fails without it. The same review found
BROWSER-CI-002 had recurred on master (run 39129674772); recorded as a real
defect, not investigated here.

## No pull-to-refresh while capturing; tracing hint — October 18, 2026 (branch horizon-edge-cases)

During the Pixel session the planner tab reloaded once by itself, which
throws away a capture in progress. Nothing stopped Chrome's pull-to-refresh
under the full-screen capture view: while it is open, the root element now
carries `cap-open` and `overscroll-behavior: none` (root and body), removed
on close. The editor's *Phone capture* hint still said "turn while you hold
Trace"; it now describes tap to start and stop, and that the Moon or a
landmark gives a more exact north than the compass.

Checks: web-horizon-phone-capture asserts `none` on root and body while the
view is open and `auto` after it closes. pytest 359 passed, 1 skipped;
check_js and check_js_tokens pass; browser web suite 88/88. On the Pixel
(owner): repeated downward swipes on the camera image and both bars left
the capture open, and the page kept the same load throughout (a marker set
before the test was still there).

## Calibration routine for the overlay's scale — October 18, 2026 (branch horizon-edge-cases)

The camera scale is no longer learned from motion. A routine measures it
still, once per phone: offered when the first capture shows a camera image
(*Start* / *Not now*) and under *North… › Details › Line up the drawing*.
Aim at a sharp feature, turn right until it sits on a guide line left of
the cross, then tilt down until it sits on a line above; `guideScale` turns the
measured rotation and the line's offset into the scale. Both steps within
8% keep their mean, else the sideways one. `asked` remembers *Not now*.
The delay is still learned from motion.

Checks: capture_calibration.mjs now tests `guideScale` (exact on synthetic
quaternions; refuses the wrong direction, a turn of about 1 deg and
implausible scales); new web-horizon-capture-calibration-routine walks the
offer, a refused wrong-side tap, both steps to a stored 0.80, no second
offer, and *Not now* remembered. Layout checked at 375 x 812 in the preview
(panel below the crosshair). pytest 359 passed, 1 skipped; check_js and
check_js_tokens pass; browser web suite 88/88. On the Pixel (owner): it
works and measured 58 deg (k 0.902), against 0.88-0.90 from the still A/B
test; the owner found the first wording odd, so the steps now read *Step 1
of 3* with *Start*, *It's on the line* and *Line up the drawing*.

## Camera scale from slow pans only; one vibration per too-fast trace — October 18, 2026 (branch horizon-edge-cases)

After the Pixel session: the capture uses one camera scale for both axes,
starting at the still-measured 0.88, learned only from sideways windows
panned at 15 deg/s or slower on average, as the median of the last nine
(once there are three). The delay is still learned from every good window.
Storage moved to `nightseam_capture_cal_v2`; the per-axis version 1, learned
from any motion, is dropped on load. The too-fast hint vibrates once per
trace; colour and words still show each time.

Checks: new capture_calibration.mjs (`windowScale` refuses fast, weak or
implausible windows; `learnedScale` medians the last nine, needs three);
horizon_ui.mjs drops the version 1 key; web-horizon-phone-capture traces
two too-fast bursts and expects one vibration; the camera-line check reads
59 deg after a reset. pytest 359 passed, 1 skipped; check_js and
check_js_tokens pass; browser web suite 87/87. On the Pixel the slow-pan
learning settled at 0.97 (55 deg) and the owner saw a point's dot land
beyond its pole at the screen edge, so it was replaced the same day by the
calibration routine (next entry).

## Pixel 7a session: haptics, speed hint, camera scale — October 18, 2026 (branch horizon-edge-cases)

Owner on the Pixel 7a (Chrome 155, portrait, daylight), the planner served
from this machine over `adb reverse` and watched through the DevTools socket
with temporary probes (nothing added to the product).

- **Haptics:** start, stop, *Add point* and the too-fast hint each fired
  their pattern; the owner found them fine.
- **Speed hint:** came on at 31-36 deg/s and cleared on slowing, but in two
  fast traces it switched on 9 times (9 triple vibrations).
- **Calibration learned from motion:** after a reset it never settled
  (delay 83-295 ms; long side 48-73 deg sideways, 55-76 deg up-down). A
  controlled run (slow, fast, slow pans; the phone's own rotation rate logged
  beside each 2 s update, the blend undone to get each window's own value):
  sideways scale median 0.87 under 15 deg/s (13 windows), 0.98 at 15-30
  (13), 1.05 at 30-60 (10); slow again went back to 0.75-0.90. Offline, the
  worker's shift estimate on synthetic 108 px profiles is within 1% from
  0.5 px and at most 9% low at 0.1 px, so the speed dependence is not the
  estimator: the camera stream (stabilisation) or the sensor fusion.
- **Still test of the sideways scale** (learning switched off in the tab, a
  point added on a pole, the pole then held near the left and right edge;
  values not named to the owner): 0.75 drew the dot short of the pole, 1.05
  beyond it by about as much, 0.90 very slightly beyond. True value about
  0.88 (59 deg across the long side), close to the old Pixel default 0.864
  and to the slow-pan windows. Up-down not tested. The phone was left at
  0.88 for both axes with learning back on.

## Capture: speed hint, haptics, shorter copy — October 18, 2026 (branch horizon-edge-cases)

While tracing, turning faster than 30 deg/s (gyroscope rate over 250 ms)
turns the crosshair and status line amber with *Too fast (N°/s): turn
slower.*, clearing below 20 deg/s. Where the browser can vibrate, start,
stop, *Add point* and the hint each give a short, distinct vibration. The
capture's messages are shortened to one line where possible, and the
north panel's compass and camera lines and *Reset camera calibration* moved
behind a closed *Details*, so the panel fits a 375 x 812 screen without
scrolling (311 of 364 px). The view's Tab loop now includes the summary.

Checks: web-horizon-capture-references-and-loop asserts the hint during a
67 deg/s turn and that it clears when the phone holds still;
web-horizon-phone-capture records the vibration patterns for start, stop and
point; the compass and camera line checks open *Details* first. Not checked
on a phone. pytest 358 passed, 1 skipped; check_js and check_js_tokens pass;
browser web suite 87/87.

## Capture calibration: capture-timed frames, readout and reset — October 18, 2026 (branch horizon-edge-cases)

Reviewed the phone capture's camera calibration. The motion worker timed
each frame pair by when the frames reached it, so a short gap in delivery
read as fast motion: in a scratch simulation 5 ms of delivery jitter made
the scale 4-10% too large while still passing the 0.85 correlation gate.
Pairs now last as long as the camera's capture timestamps say
(`captureGap`), ending when the later frame arrived, so stored delays stay
comparable. The north panel now ends with a camera line (delay, the long
side's field of view from sideways and from up-down motion, measured or
starting values) and *Reset camera calibration*, below *Compass again /
Close* so those stay in view at 375 x 812.

New checks: horizon_model.mjs times frames with ±6 ms arrival jitter (scale
within 3% by capture time, 0.1% here; 1.7% off by arrival time) and pins
`captureGap`'s fallbacks; web-horizon-capture-shows-what-the-camera-saw
reads the camera line and resets it. Not checked on a phone. pytest 358
passed, 1 skipped; check_js and check_js_tokens pass; browser web suite
87/87.

## Horizon canvas overflow after a narrowing resize (BROWSER-CI-002) — October 18, 2026 (branch horizon-edge-cases)

CI on pull request #11 (run 39125847030) failed the phone overflow
assertion a third time, and the diagnostic added for pull request #10 named
the cause: `canvas#hz-canvas right=860 width=822` at a 360 px viewport. The
editor's `resize()` gives the canvas a pixel width, which overrode the
stylesheet's `width: 100%`. When the page narrowed, the canvas kept its old
width and overflowed until the resize observer's next callback, so any
layout read in between saw a page wider than the screen. The canvas now
also has `max-width: 100%`, so it never shows wider than its box (a box
under the 280 px minimum included). Pointer positions are scaled from the
shown size to drawing coordinates, so taps land correctly while the two
differ.

New assertion in web-horizon-canvas-dpr-resize: narrow the box and measure
in one step, before the observer can run. It failed without the fix
(canvas edge 1032 against a box edge of 484) and passes with it. pytest 358
passed, 1 skipped; check_js and check_js_tokens pass; browser web suite
87/87.

## Horizon edge cases: point limit, decimal commas, names, link size — October 18, 2026 (branch horizon-edge-cases)

Probed the horizon core with Node at its limits. Found and fixed:
- **Point limit cut whole stretches.** The 1440-point limit was applied by
  slicing the azimuth-sorted list, so the high azimuths went. A 3600-line
  treeline file (0.1 deg steps, noisy) imported only 0-143.9 deg with
  nothing reported. Retracing 2 deg near az 100 on a 1430-point horizon
  deleted 22 points at 352-357 deg. Now points over the limit are thinned
  evenly, a new line is thinned to the room left, and the import note says
  how many points were thinned. The treeline keeps 0-359.9 deg (1353 points);
  the retrace keeps every point outside its span.
- **Decimal commas misread.** `90;20,5` read as alt 20 and `180,25<tab>5,5`
  as az 180, alt 25, with nothing skipped. A comma between digits is now a
  decimal where spaces, tabs or semicolons separate the fields; `0,10` still
  reads as two fields.
- **Names cut inside an emoji** stored half a character. Names are now cut
  without splitting one.
- **Oversized links.** The encoder could make a link longer than the reader
  accepts (only with very dense overhangs). It now refuses, and the editor
  says to export a file.

Unchanged after measuring: profile derivation at the largest record (1440
points, 20 overhangs of 1440 points) takes about 5 ms and runs once per
committed edit, not per pointer move. Loop closure with a large closing
error is refused by the capture (3 deg limit).

Checks: horizon_model.mjs adds contracts for each case and fails on the
previous core; pytest 358 passed, 1 skipped; check_js and check_js_tokens
pass; browser web suite 87/87 (web-immutable-publication passes once the new
baked core is staged).

## Landing copy for sensor-captured horizons — October 18, 2026 (branch landing-sensor-copy)

The landing pages still described panoramas and horizon photos, which the
sensor capture (pull request #8) removed. Home, Features, About and Privacy
now describe skylines captured with the phone, drawn by hand or imported;
Features gains a *Horizons* section, and Privacy a *Horizon capture and
share links* disclosure plus a note on the capture's site check. Each privacy
claim was checked against web/capture.js, web/capturemotion.js and
web/horizon.js: the camera image is only shown and measured in a worker,
never stored or sent; the per-phone overlay calibration is in localStorage;
location is read only where already granted and only compared with the
site; a share link carries name, points and overhangs in the fragment and
asks before adding. Object-photo text is unchanged, and the published 0.1.0
summary keeps its wording. `og:image:alt` reads "your own skyline" on all six
pages. The share preview was recaptured from the new Home at 1200x630 in
system Chrome (dark), now `social-preview.png?v=2`. The drafted 0.7.0
summary now describes the capture; north is the compass, the Moon or a
landmark (the Sun was removed on October 15), which BUGS, DEVELOPMENT, the
acceptance checklist and the plan also now say.

Checks: pytest 358 passed, 1 skipped; check_js, check_js_tokens, check_encoding,
build_changelog --check and check_release (no errors; the usual dirty and
version.json warnings) pass; browser web-landing-pages,
web-landing-history-no-js, web-public-design-responsive and
web-immutable-publication pass.

CI on the pull request (run 39122557901): guards and pytest passed; the
browser suite was 86/87. The phone overflow assertion in
web-followup-smooth-scrub-and-horizon-scroll failed again (BROWSER-CI-002,
now an open defect in BUGS.md) with planner code identical to a passing run.
It passed 6/6 locally. The assertion now reports the elements past the
viewport, checked against a page with a forced overflow, and passed 3/3
locally after the change.

## Sun removed, calmer readout, points in the AR view — October 15, 2026 (branch horizon-sensor-plan)

Owner: remove the Sun reference; the readout flashed and jumped between one
and two lines; show the recorded points. The north panel offers the Moon and
a landmark only. The readout is one fixed-width line with one decimal
(`152.0° SSE · alt -12.3°`), updated at most every 120 ms, and the readout and
overlay average the orientation over ±60 ms; recorded directions are not
averaged (averaging them moved a fast-traced peak 1 deg in the loop check).
The overlay draws recorded points as dots. The smoothing window narrows to
stay centred on phones whose camera trails the gyroscope by less than 60 ms
(core `smoothOrientation`, with contracts in horizon_model.mjs: a steady turn
reads where it is, and 10 ms from the newest reading the window narrows).

Checks: phone-capture and references-and-loop read the new format and assert
no Sun button and a drawn dot; mobile-layout asserts one unclipped line at
412, 360 and 813 px wide. Capture checks 8/8.

## Compass warm-up and status line — October 15, 2026 (branch horizon-sensor-plan)

Owner: the mobile-first UI is better; the compass still sometimes needs
*Compass again* on a first open. The editor now runs the compass at 10 Hz
while the Phone capture panel is open, so a capture starts on a settled
compass; the north panel shows the compass's readings a second, settling
and restarts.

New check web-horizon-capture-compass-prewarm (opening the panel starts a
10 Hz compass, closing it stops it, leaving the tab stops it within 2 s and
nothing restarts it); the settling and no-compass checks now also read the
status line. Capture checks 8/8.

## Mobile-first capture view — October 15, 2026 (branch horizon-sensor-plan)

Owner: Sharper motion makes it smoother, but OIS still seems on; asked for a
mobile-first capture UI. Read over USB debugging: Chrome on the Pixel 7a
lists one back camera only ("camera 0, facing back", zoom 1-8x), so the
ultrawide lens without OIS is out of reach and OIS stays.

The capture view now has opaque bars (previously 84% opaque, against the
design guide), the direction in large digits beside *✕ Done*, a short north
button that opens the north panel (which now carries the full account), a
segmented Skyline / Overhang control with Sharper motion beside it, and a
thumb row (Undo, a 64 px brass Start/Stop tracing, Add point). Measured in
the preview at 412x813: top bar 0-154 px, crosshair 371-443, bottom bar from
626, smallest target 44 px; at 813x412 the strip hides and the bars end at
141 and start at 273 around the crosshair at 170-242.

New check web-horizon-capture-mobile-layout (upright and sideways: crosshair
uncovered, every control at least 44 px, the thumb row in order at the
bottom, opaque bars); against the previous layout it fails (no thumb row,
translucent bars).

## Sharper motion toggle; capture focus fix — October 15, 2026 (branch horizon-sensor-plan)

Owner request: a button to turn off OIS. Read over USB debugging, the Pixel
7a's camera in Chrome offers no stabilisation control (capabilities: aspect
ratio, colour temperature, exposure compensation, exposure mode
continuous/manual, exposure time 0.07 ms-16 s, focus, frame rate up to 60,
ISO 45-8982, resize mode, torch, white balance, zoom 1-8x), but reported a
60 ms exposure in the evening light. Added *Sharper motion* (1/60 s, ISO
scaled to keep the light), shown only where manual exposure exists.

Found by the new check: with no north yet (no sensors), Escape did not
close the capture view, because the focused Start tracing button was then
disabled and focus fell out of the view. Escape is now handled while the
view is open wherever focus is, and the view opens on Done when tracing is
not possible yet.

New check web-horizon-capture-sharper-motion (no toggle without manual
exposure; on a Pixel-like camera at 60 ms and ISO 100 it asks for 1/60 s at
ISO 360; off returns to continuous; Escape closes the view). Capture checks
6/6.

## Overlay lag measured and fixed; acceptance checklist — October 15, 2026 (branch horizon-sensor-plan)

Measured on the Pixel 7a with a throwaway probe (frames analysed in a worker
via MediaStreamTrackProcessor, gyroscope at 60.1/s, frames at 27.9/s): the
camera image's motion matches the gyroscope's with correlation 0.92
sideways and 0.86 up-down, trailing it by 225 ms and 195 ms; scale 165.9 and
144.4 analysis px/rad, a long-side field of view of 60.1 and 67.2 deg. A
first probe that analysed frames on the main thread starved the sensors to
14 readings a second and was discarded. The core matcher (matchMotion)
reproduces these numbers from the same recording.

Fix: the capture aims with the orientation from the image's delay ago
(readout, overlay, trace, points, references); the overlay uses a focal
length per axis; web/capturemotion.js (module worker) measures each device
while panning and refines delay and scale (stored per device). Starting
values: 210 ms, 0.864 and 0.752 of the long side. Core angularVelocity and
matchMotion, core 01f2baba433b6810, token 74. Phase 5: the Phone capture
checklist in docs/acceptance/HORIZON_ACCEPTANCE.md (ten checks with targets).

New checks: horizon_model.mjs (angular velocity; a synthetic recording with
a 200 ms delay and 165.5 px/rad is recovered within 10 ms and 3%);
test_ui_invariants (the motion worker closes every frame, uses no storage or
network and posts numbers only); browser
web-horizon-capture-shows-what-the-camera-saw (with a 300 ms delay, a point
added right after a swing lands where the screen still showed; the readout
follows after the delay; the worker receives frames). Without the look-back
that check fails (the point lands at 70 deg instead of 30).

Local validation: pytest 358 passed / 1 skipped; real-Chrome suite 84/84;
check_js, check_core, check_encoding OK; check_release 0 errors. Not yet
checked on the Pixel.

## North references and loop closure (sensor capture phase 3) — October 15, 2026 (branch horizon-sensor-plan)

*North…* in the capture view sets north from the Moon, the Sun (topocentric
apparent positions for the site and the current time, usable 2-60 deg) or a
landmark bearing, replacing the compass for the capture and working without
one; the view says which reference, when, how far the compass was off and
whether the aim read high or low. A skyline trace of a full turn asks
whether it ended where it began; closing removes up to 3 deg of drift by
angle turned, a larger miss is kept as traced. A distance warning appears
where location access is already granted (more than 75 m, or twice the GPS
accuracy, from the site). Core 036d706559462354, token 73.

Found while testing: closeLoop treated half a turn as one (195 deg rounded
to a turn, error -165); it now needs at least 300 deg of net turn.

New checks: horizon_model.mjs (moonDirection equals the topocentric
moonAltAz; references usable only 2-60 deg; referenceOffset; a 2% fast
gyroscope over a full turn closed back onto the truth sample by sample,
clockwise and anticlockwise; half a turn is no loop; siteDistanceM);
browser web-horizon-capture-references-and-loop (no compass: tracing
blocked until a 120 deg landmark sets north; Moon and Sun buttons agree
with the core for now; a turn with 2.4 deg of drift closes and puts a sharp
skyline peak back at its true 300 deg; an 8 deg miss is kept as traced).

Local validation: pytest 358 passed / 1 skipped; real-Chrome suite 83/83;
check_js, check_core, check_encoding OK; check_release 0 errors.

Owner test on the Pixel: the Set north panel covered the crosshair needed to
aim at the Moon. A panel or question now replaces the controls and strip;
the top area is capped at 35% and the bottom at 45% of the screen. The
references check now runs at 412x789 (the Pixel's screen) and asserts the
crosshair is uncovered with the panel and with the loop question open;
against the old layout it fails (bottom area from 346 px over the crosshair
at 359-431 px).

## Settled north, start/stop tracing, line-only overlay, share links — October 15, 2026 (branch horizon-sensor-plan)

Measured on the Pixel 7a over USB debugging (Chrome DevTools socket, a
temporary hook, since removed). First open, compass minus locked north:
9 deg at 2 s, 22 at 3 s, 31 at 4.5 s, 37 at 6 s, 40 at 8 s, 44 from 10 s on;
the old 2 s lock had set north 44 deg off, which looked like "the compass
needs initialising". Overlay frames took a median 0.3-1.6 ms (worst 5 ms)
with the gyroscope at 60 Hz, so drawing is not the overlay's lag. A second
first open, after the settle rule, locked at 3.3 s and matched the live
compass for the whole session (52.1 deg, re-read 52.8). The owner felt the
overlay lag was about the same; still open (BUGS.md).

Changes: north locks once compass minus gyroscope is steady over 3 s
(halves within 1 deg, spread within 4), 20 s fallback; tracing starts and
stops with one button; the overlay draws lines only, for directions in
reach of the camera axis, at 1.5x pixel density; share links (core
encodeHorizonLink/decodeHorizonLink, *Share link* in the editor head,
`#horizon=` addresses offered and confirmed before saving). The owner chose
share links over server-stored shortcodes. Core eb83bc681e04897d, token 72.

New checks: horizon_model.mjs (exact link round trips with a Unicode name,
overhangs to 360 and a 720-point skyline under 4,000 characters; damaged,
truncated, trailing, oversized, newer-version, out-of-range and over-limit
links refused); test_ui_invariants (decode, then ask, then save; the address
is cleared before the offer); browser web-horizon-capture-north-waits-for-compass
(a compass swinging 74 to 30 deg: nothing traceable meanwhile, north 30
after; fails against the old 2 s lock with "north is not set while the
compass still moves"), web-horizon-share-link (share sheet, exact copy after
confirming, address cleared, cancel and damaged links add nothing,
clipboard fallback); web-horizon-phone-capture now starts and stops tracing
with taps.

Local validation: pytest 358 passed / 1 skipped; real-Chrome suite 82/82;
check_js, check_core, check_encoding OK; check_release 0 errors. Owner test
of this build on the Pixel 7a (tracing, overlay, share link to the
desktop): "works as expected".

## Capture AR overlay and compass restart — October 15, 2026 (branch horizon-sensor-plan)

Owner test of phase 2 on the Pixel 7a: tracing "works pretty good"; the
compass did not start on the first open, only after reopening the view.
Changes: the compass sources (AbsoluteOrientationSensor and
`deviceorientationabsolute`) restart while north is missing and no compass
reading arrives, and when a motion permission is granted; the capture works
on quaternions throughout (core orientationQuaternion). New AR overlay over
the video: level horizon with compass marks, the skyline with the ground
below it shaded, overhang edges with the sky above shaded, and the trace in
progress, projected with core cameraProject (assumed 67 deg field of view
along the video's long side). Core d60ae4f80540e013, token 71.

New checks: horizon_model.mjs (orientationQuaternion equals the Euler path;
cameraProject puts the pointed-at direction on the crosshair at three
orientations, east right, up up, a sideways phone sideways, nothing behind);
web-horizon-phone-capture now also checks the overlay (the traced skyline is
drawn under the crosshair, nothing where nothing is recorded); new
web-horizon-capture-compass-restarts (gyroscope first, compass later: north
is found without reopening). With the restart disabled that check fails with
"This device gives no compass direction"; with it, it passes.

Local validation: pytest 357 passed / 1 skipped; real-Chrome suite 80/80;
check_js, check_core, check_encoding OK; check_release 0 errors. Not yet
tried on the Pixel: the compass fix is inferred from the symptom, and the
assumed field of view is unverified.

## Phone camera capture (sensor capture phase 2) — October 15, 2026 (branch horizon-sensor-plan)

New web/capture.js: a full-screen camera view with a crosshair, a live
direction readout and an overview strip; Hold to trace (the keyboard
toggles), Skyline / Overhang, Add point, Undo, Re-read compass, Done. Shape
from RelativeOrientationSensor (fallback `deviceorientation`), north from
the compass averaged once over 2 s while the phone points within 60 deg of
level. It replaces the old Phone compass panel. Core gains
quaternionPointing, circularMean and sweepLine (core 2f72457b28a5e455, token
70).

Found and fixed while testing: a flat sweep simplified to two points 360 deg
apart replaced nothing (sweepLine now keeps steps of at most 90 deg); the
compass often reports before the gyroscope, and that first compass-only
sample pulled north 2.1 deg off (the compass-only fallback now waits a
second and north is re-read when the gyroscope appears); a sensor that has
not measured yet reports a zero quaternion (ignored); the mode buttons
changed their pressed state a frame late (now at once).

New checks: horizon_model.mjs (quaternion path equals the Euler path at five
orientations, circular mean, sweeps across north, back-and-forth redraws,
flat full turns, overhangs split at north); test_ui_invariants (capture.js
never records, grabs frames, stores or sends video and stops its tracks on
close); browser check web-horizon-phone-capture with Chrome's virtual
orientation sensors and a canvas camera stream (north 30 deg within 0.2,
held trace 30-70 deg, Add point, keyboard overhang 180-200 deg, one undo
step, tracks ended on close, focus returned). Chrome's virtual compass
reports 29.95 deg for a set 30 deg (it round-trips through Euler angles).

Local validation: pytest 357 passed / 1 skipped; real-Chrome suite 79/79;
check_js, check_core, check_encoding OK; check_release 0 errors with the new
files staged. Preview at 375 px: the view fills the screen, crosshair
centred, no console errors. Not yet tried on a real phone.

## Horizon photos removed (sensor capture phase 1) — October 15, 2026 (branch horizon-sensor-plan)

Photo placement, Align mode, skyline detection, the landmark and Sun north
tools, the EXIF reader and the horizon photo database are gone; the editor
keeps drawing, overhangs, the points form, the phone compass and file import
(now also by dropping a file; a dropped photo is explained). Records and
format 11 backups with photos restore their skylines and overhangs and drop
the photo fields; the old photo database is deleted on load. Core rebuilt
(f5e6bc7405b26485, token 69) and cache tokens bumped.

Tests replaced, not loosened: the photo placement, detection, align, Sun,
photo restore and unreadable-photo checks went with their features. New:
legacy photo fields dropped in strict and lenient normalization
(horizon_model.mjs), on load and in stored records (horizon_ui.mjs), in
backups and exports, plus a full-storage restore failure (web_backup.mjs);
browser checks web-horizon-has-no-photo-tools, web-horizon-restore-durable
and web-safety-retired-horizon-photos-are-dropped. The rollback, phase 4
layout and file-chooser checks now use a drawn horizon and the Import file
button.

Local validation: pytest 356 passed / 1 skipped (no local popularity
snapshot); check_js, check_core, check_encoding OK; check_release 0 errors
with the new core staged. Real-Chrome suite 77/79 on the first run: the
create-buttons check still expected the removed photo button, and the new
no-photo check did not load the page first. Both test bugs fixed; each then
passed alone (1/1). Preview: the Horizon tab shows Draw by hand and Import
file, Draw and Overhang modes, no console errors.

## Horizon sensor probe, phase 0 (first run) — October 15, 2026 (local development)

Throwaway probe page (ignored logs/sensor-probe/, served to the phone over
`adb reverse`), Pixel 7a, Chrome 155, portrait. Not product code.

- **Available:** RelativeOrientationSensor, AbsoluteOrientationSensor,
  Gyroscope and GravitySensor at a steady 60 Hz; `deviceorientation` and
  `deviceorientationabsolute` (rate drops to 0-10 Hz when the phone is still);
  rear camera via getUserMedia; Wake Lock. Magnetometer is not exposed.
  The quaternion and Euler paths agree within 0.03 deg.
- **At rest, 2 min:** relative orientation did not move upright (0.00 deg)
  and stayed within 0.7 deg lying flat; gyroscope bias 0.04-0.13 deg/min.
  Absolute (compass) orientation wandered 6.4 deg upright and 8.2 deg flat
  with the phone untouched.
- **Aiming, two features 62 deg apart, 5 alternations over 51 s:** relative
  separation 62.1 deg, sd 0.13 deg, return to feature A within 0.4 deg;
  altitude repeat within 0.15 deg. Absolute separation 59.1-60.9 deg
  (sd 0.79) and drifting. A first practice run is not counted.
- **Full turn:** one valid turn (26 s): relative loop error +3.95 deg,
  absolute -5.27 deg; the two disagree by 9.2 deg over the same motion. The
  end aim was off by 2.8 deg in altitude, so the end azimuth error is part of
  both numbers. A second recorded "turn" covered only 15 deg and is
  discarded.
- **GPS, 30 s:** 4 fixes, best accuracy 20 m, one 490 m outlier, fixes
  within 1.4 m of each other.

First-run outcome: the compass is unusable for the shape of a sweep, as
planned; the gyroscope is steady at rest and in back-and-forth aiming. One
sloppy turn could not decide the 2 deg loop gate, so the probe gained a 3x
aiming zoom and rejects partial turns.

Second run, three full turns with the zoom (relative loop error, end-minus-start
altitude as a check on the end aim, compass loop error):

| Turn | Direction | Time | Gyroscope loop error | End altitude off | Compass loop error |
|---|---|---|---|---|---|
| 16:17 | clockwise | 38 s | +5.80 deg | 5.2 deg | +6.65 deg |
| 16:18 | clockwise | 31 s | -1.22 deg | 0.05 deg | -1.31 deg |
| 16:18 | anticlockwise | 25 s | -0.44 deg | 0.22 deg | -7.47 deg |

The two turns that ended on the start feature (altitude within 0.22 deg)
closed within 1.3 deg before any loop correction. The 16:17 turn ended 5 deg
away from its start in altitude, and the compass saw the same +6 deg, so its
error is the end aim, not drift. The three traces did not follow one common
skyline (their altitude paths differ by up to 15 deg), so accuracy part-way
round could not be measured here; it is covered by the landmark check in the
plan's acceptance. Gate passed on this evidence (two clean turns, fast
sweeps): relative orientation stays within 2 deg per sweep without
correction. Chosen API: RelativeOrientationSensor, `deviceorientation` as
fallback.

## Brief twilight spells and same-level dark windows — October 13, 2026 (local development)

sunCrossings now checks each turn between three samples on one side of a
level and, near the level, finds the true extremum and both crossings, so a
dark or bright spell shorter than the 10-minute step is no longer skipped.
pickDarkWindow takes dusk and dawn from the same level. New
tests/js/twilight_brief.mjs (synthetic 4-minute spells, a turn 0.003 deg short
of the level, a mixed-level night) passes; the previous core fails 4 of its 5
cases. The USNO twilight and rise/set anchors no longer excuse any event
shorter than 10 minutes: a miss is allowed only where the model Sun turns
within 0.01 deg of the level. Berlin 2026-07-25 (astronomical) is now found;
Tromso 2026-09-16 remains a near-tangent miss (model -17.996 deg). Frozen
twilight fixtures unchanged (all 30 nights within 2 s).

## Photo cache budget — October 13, 2026 (local development)

The Wikipedia photo cache is capped at 25 MiB: past it, the least recently
viewed photos go until 80% is used, and expired "no photo" answers and
unreadable rows are removed on the same pass. Writes now wait for the
transaction to commit, so a full disk (QuotaExceededError) is seen; it trims
the cache to a quarter of the budget and retries once. New check
web-photo-cache-budget (30 MiB seeded, simulated full disk) passes; against
the previous app.js it fails ("31457373 bytes"). Photo checks 8/8.

## Live hosting measurements — October 13, 2026 (v0.1.1, live)

Browser-like GET requests (`Accept-Encoding: gzip, deflate, br, zstd`) are
Brotli-compressed by nginx: `/` 3,292 -> 1,087 bytes, `/astro/` 15,348 ->
4,465, app.js 205,511 -> 57,654, style.css 67,353 -> 13,719, catalog.json
5,088,280 -> 801,556, catalog-provenance.json 6,739,158 -> 441,764.
HOST-DELIVERY-001 is closed; earlier measurements offered only gzip, which
these files do not get. The same GET responses carry no CSP, frame-ancestors,
nosniff or Referrer-Policy header (nginx-style ETags); those headers appear
only on HEAD requests and on small JSON files that Apache serves. The landing
header change above therefore has no effect on page loads; the meta CSP stays
the enforced policy. Recorded as a hosting limitation in BUGS.md. The owner
deferred the human screen-reader pass (A11Y-001) as a known limitation.

## Landing security headers — October 13, 2026 (local development)

Owner-approved server-policy change: landing/.htaccess sends the landing CSP
plus frame-ancestors 'none', nosniff and the referrer policy. Live check
before deployment: `/` sends none of the three; `/astro/` showed all three, but
only to a HEAD request (corrected in the next entry: GET page loads bypass
.htaccess). New
tests/test_landing_headers.py (2 tests) fails when the header and meta forms
drift (checked with a changed referrer value). Not verified on a live server:
no Apache here. Local validation: pytest 355 passed / 1 skipped; real-Chrome
suite 83/83; check_release 0 errors; check_encoding OK.

## Sunset and sunrise on the published convention — October 13, 2026 (local development)

nightInfo's sunset/sunrise now use the upper limb with standard refraction
(true centre -0.8333 deg, DECISIONS.md). New anchor
usno_planner_sunrise_sunset_2026 against the five USNO 2026 tables, grazing
events under 0.02 deg/min excluded: Berlin bias -1.0 s / RMS 17.7 s, Sydney
2.7 / 17.2, Denver 4.1 / 17.6, Quito 0.3 / 17.5, Tromso 3.6 / 18.7 (worst
40 s). The previous core fails it (Berlin RMS 129 s). Planner preview, Berlin
2026-10-13: Sunset 18:16, Sunrise 07:29; USNO 16:16 / 05:30 UT. Owner-approved
fixture update: only the 48 twilight sunset/sunrise values in
core_fixtures.json were regenerated; dusk and dawn moved by at most 1 s. The
pairing mutation is now caught by the anchor's sunset-before-sunrise rule
(Tromso, night of January 14). Local validation: pytest 353 passed /
1 skipped; real-Chrome suite 82/83 with web-immutable-publication failing
only because the new core files were not yet in Git, 1/1 after staging them;
check_js, check_encoding OK; check_release 0 errors.

## Photo-placement test race — October 13, 2026 (local development)

GitHub CI on the pull request #2 merge to master (b2fbc76, run 38205547153):
guards and pytest passed (353 passed / 1 skipped); the browser suite failed
82/83 in web-horizon-photo-placement ("an ordinary photo starts 60 deg wide:
got '360', want '60'"). The same tree passed 83/83 on the pull request run
(38204733786). Cause: the test helper's waits were already satisfied by the
first photo, so a second upload could be read before its editor rendered. The
helper now waits for the new horizon, named after the file. Local validation:
pytest 353 passed / 1 skipped; real-Chrome suite 83/83.

The first CI run of that fix (pull request #3, run 38444781285) failed 81/83
in two other checks: web-followup-smooth-scrub-and-horizon-scroll ("phone has
no horizontal overflow") and web-phase4-responsive-planner (timeout waiting for
the file chooser after Enter on New from photo). Same runner image as the
green runs; the failed job passed on rerun. Locally both passed 5/5, and 3/3
with the Linux font substitution. Recorded as BROWSER-CI-002.

## Horizon rebuild — October 12, 2026 (pull request #2)

Horizon editor rebuilt around a skyline (phases 1-6 of
[the plan](docs/horizon/HORIZON_REBUILD_PLAN.md)). Local validation on Windows:
pytest 353 passed / 1 skipped (no local popularity snapshot); real-Chrome
suite 83/83; check_release 0 errors; check_js OK. GitHub CI on e0a2c71 (run
38204733786): source guards and pytest passed on Windows, real-browser suite
83/83 on Linux. Owner real-photo and device acceptance is still open.

## First GitHub CI runs, focus and narrow-layout fixes — October 11, 2026 (pull request #1)

GitHub CI on Windows (pull request #1 and branch pushes): the guards job passed
once the local-only tags v0.6.35/v0.6.36 were pushed and pre_tag_check gained
its 0.7.0 floor (6ac1155). The browser job failed one check per run in four
of five runs: net::ERR_NO_BUFFER_SPACE on a single local request (app.js,
plannerstate.js, app.png; keep-alive in 0db089d did not stop it), the
Tonight focus-restore check twice, and the advanced-catalog speed budget
once. The focus failure was a real defect, fixed in 254a859 (focus check
forced to fail first: got 'tab-tonight', want 'synbeta').

The browser job moved to ubuntu-latest (a93f708). Its first run: 115/119, no
network failures; four layout checks failed under Linux's wider default fonts.
Reproduced locally with Verdana/Courier New substituted, fixed in the layout
(catalog count line on phones, landing header at 320 px) and in one
font-dependent measurement, then passed with the substitution and without
it. Local validation after the fix: pytest 378 passed / 1 skipped; real-Chrome
suite 119/119. GitHub CI on a7a240e (run 38162392160): source guards and
pytest passed on Windows (5m20s), real-browser suite passed on Linux (5m45s,
previously about 8.5 minutes on Windows). Two Linux runs, no network failures;
BROWSER-CI-001 is closed and reopens if net::ERR_NO_BUFFER_SPACE recurs.

## Documentation reorganization and website copy — October 11, 2026 (local development)

Root documentation reduced to maintained documents: README and DEVELOPMENT
rewritten as a current entry point and architecture guide, BUGS limited to open
findings, ROADMAP replacing IMPLEMENTATION_PLAN and FUTURE_FEATURE_SCOPE, and
dated plans, reviews and logs moved unchanged to docs/history (pre-split release
receipts archived separately). Public pages: clearer feature and privacy
wording, no Windows-catalog reference, "Email"/disclaimer wording in the
Impressum, release-notes descriptions, and two clarified 0.1.x changelog
summaries. Planner hints no longer mention popularity. No behaviour change
beyond text; stale code comments corrected with token bumps.

Actual checks: pytest 378 passed with the optional-data skip; Chrome 119/119;
check_release --allow-dirty --no-stage 0 errors; check_encoding OK.

## Review backlog fixes — October 11, 2026 (local development)

Resolves the low-severity review backlog listed in BUGS.md: backup site/rig
range validation, slider-representable minimum altitude, one thumbnail
IndexedDB connection, ISO-only weather times (a title-attribute injection was
reproduced and is now covered), scorer/ceilFor element parity, bounded
popularity factor, finite moon-aware scores, blank sky-mode conversion, one
2% check-separation rule, history key removal on undo, reuse of converted
canvases, right-ascension range checks, landing-page document CSP and referrer
policy, and stale comments/dead state. Core rebuilt as b3ca8ecef233213a
(token 65).

Actual checks: pytest 378 passed with the optional-data skip; Chrome 119/119;
check_release --allow-dirty --no-stage 0 errors. No tag or deployment.

## Converted-photo coverage default and switch — October 11, 2026 (local development)

Confirming a converted photo now defaults to inferred-open coverage instead of
strict measured coverage, keeps an already chosen inferred-open/strict policy,
and the photo setup shows a "Sky outside the photo" select that applies
immediately with undo; the advanced evidence select follows it. A new Chrome
check confirms the default, that a target 40 deg up above an ordinary photo's
top edge is allowed when open and excluded when strict, undo of the switch,
both selects in step, and that reconversion keeps an explicit strict choice.

Actual checks: pytest 364 passed with the optional-data skip; Chrome 118/118;
check_release --allow-dirty --no-stage 0 errors. No tag or deployment.

## Published time anchors and coming-night detail card — October 11, 2026 (local development)

Reference anchors add verbatim USNO 2026 yearly rise/set and civil, nautical
and astronomical twilight tables for Berlin, Sydney, Denver, Tromso and Quito.
Core twilight times matched about 10,000 published events at 17.7 s RMS (the
tables' minute rounding) with per-table bias at most 4 s; two grazing nights
with under ten minutes of astronomical darkness are skipped by the 10-minute
scan. Sidereal-rate, solar-longitude and equation-of-centre mutations fail the
new anchors; the 0.020*sin(2g) term is below their resolution.

The detail card's rise, set, culmination and Moon-at-culmination use core
objectNightInfo over the planned night's site noon-to-next-noon span. For M31
from Berlin on 2026-10-11 the card shows 00:27 (12 October) instead of the
previous night's 00:31. Core rebuilt as b5029923cf7ae513 (token 64).

Actual checks: pytest 364 passed with the optional-data skip; Chrome 117/117;
check_release --allow-dirty --no-stage 0 errors; check_encoding OK. No tag,
publication candidate or deployment.

## CI workflow and release-gate fixes — October 11, 2026 (local development)

Commit c4b8606 adds .github/workflows/checks.yml (Windows; guards, changelog
and development release checks, pytest, then the browser suite in its own
job), orders build_changelog.py --check by tag creation and pins the latency
gate's full-replay baseline to cacdacf. The previous entry's note that the
latency failure was load-dependent was wrong; see BUGS.md.

The workflow has not run on GitHub: the branch is not pushed. Its exact
command sequence ran in a fresh detached checkout of c4b8606 on the
development machine: all guards passed, check_release reported 0 errors
(not-a-release-tag warning), pytest 357 passed with the optional-data skip
and Chrome passed 116/116. No tag, publication candidate or deployment.

## Workspace review fixes — October 11, 2026 (local development)

Branch horizon-calibration resolves the four medium review findings recorded in
BUGS.md: timezone validation at every entry point, the converted-photo guard
in Advanced reference setup, refusal of unrecoverable pre-import safety copies
and of photos whose header and decoded sizes differ, and the core-owned
UNKNOWN_HORIZON reason shared by Catalog and the detail panel.

Core rebuilt as 5d524fa6c3d225d9 (token 63, N-1 42ba4edfe51950ef); module
tokens bumped through bump_web_tokens.py and the AGENTS.md register.

Actual checks on the final tree: pytest 355 passed with the existing
optional-data skip; check_js, check_core, check_js_tokens, check_encoding and
check_release --allow-dirty --no-stage passed. Chrome: 114/116 before staging.
web-immutable-publication failed only because the new core tree was untracked
and passed 1/1 once staged. web-horizon-phases12-long-history-latency failed
3/3 on unchanged commit 9e6d3ee as well (load-dependent timing; see BUGS.md).
Four new web-safety Chrome checks passed 4/4 and failed 4/4 with each fix
disabled. This is a development commit without a release tag or deployment.

## Horizon simplification D/E/F — October 11, 2026 (local development)

Owner-authorized D/E adds bounded/validated GPano metadata, supported angular,
cylindrical and corrected centred ordinary-photo conversion/leveling, exact
original-byte retention and original-pixel references. A fully photographed angular
working rectangle shares image/mask/ruler/pointer/crop geometry. Excluded azimuth
directions block batch and detail planning. Vertical photo bounds retain the
existing horizon/open-above assumption; they do not independently verify sky
outside the photograph. Conversion of painted records or authoritative non-empty
profiles is refused with a new-horizon/redraw path. Unknown distortion, fisheye,
arbitrary stitching repair and tilted partial panoramas wider than 180° remain
unsupported. Source/working allocation limits and the known camera assumptions
are documented in DEVELOPMENT.md and HORIZON_ACCURACY_RESEARCH.md.

Evidence v4 provides 2–16 fitting references, retained explicit exclusions and
0–16 held-out checks. Equal-weight fitting rejects conflicting measurements,
poor spread and ambiguous wrap. Review shows signed per-point residuals,
angle-only extrapolation sensitivity, worst independent-check errors and local
spread warnings. Promotion removes the separate-check role after validation.
Legacy v1/v2/v3 keep their original semantics; backup 9 reads formats 1–8 and
validates models/source dimensions/image headers before storage writes.

Independent pure-core anchors cover nonlinear cylindrical angles, pinhole rays,
orientation, continuous rectangular coverage, bounded sampling, upright full 360°
and minimum 5° cylinders, EXIF dimensions, stale/conflicting metadata, noisy
circular-fit seed slack, seam confirmation, exclusions, checks, crop/history and
batch/detail agreement. Five new Chrome cases exercise actual corrected pixels,
original-byte reload/backup, cylindrical leveling/authoring, metadata/tall/large
sources, crop/history, keyboard exclusions, check retention and rejected role
changes. Final full Chrome gate passed **105/105**. Long-session evidence retained
200 trace points and 20,000 corrections: handler median/p95 8/10 ms, next-frame
median/p95 16/27 ms; hardware timing is evidence, not a universal performance promise.

Review corrected upright cylindrical coverage loss, unsafe promotion/replacement
draft changes, same-session check loss, cropped-reference reuse, keyboard focus,
contradictory optional metadata, EXIF header orientation and batch coverage gating.
The first full Chrome run passed 104/105: complete rollback restored all data but
added a null projection field absent from newly created records. Canonical initial
fields fixed that shape discrepancy; the targeted rollback and final full gate pass.

JavaScript gate passed: 52 modules, zero syntax errors/broken imports; core,
encoding, catalog/provenance and token guards pass. Its 42 heuristic name candidates
are advisory. The first full Python run reported 351 passed, 1 failed, 1 existing
optional skip in 138.98 s: the architecture guard's function register omitted the 13
new shared functions. The register was corrected without changing math or fixtures.
The architecture module passed 9/9 in 92.14 s. Final Python suite ran separately
from browser/package checks: **352 passed, 1 existing optional popularity-snapshot
skip**, 151.11 s. Published astronomy anchors and frozen regression fixtures were
not changed to conceal formula differences.

Final development release guard passed with zero errors and the expected dirty
warning. The official version helper stamped v0.1.1-3-gcacdacf-dirty. Prepared
and separately verified the **71-file immutable local candidate** at
dist/publication-preview. No public upload occurred. The local port8083 preview
serves app token196; owner acceptance remains separate as requested.

Pre-stage development guard identified untracked new shipping modules; they were
registered, then the guard passed with zero errors and the expected dirty/untagged
warning. Core token 57 retains current 7ef94c520cf50732 and previous 72241495a84f099d.
The AGENTS token register is aligned. Root relative-link validation covered 21
documents with zero missing targets, excluding the pre-existing historical audit.
No commit, push, tag or public deployment was made. Physical-photo/device/native
zoom/screen-reader acceptance remains with the owner.

## Conservative horizon sampling — October 11, 2026 (local development)

The owner continued the accuracy follow-up. HOR-ACC-001 and HOR-ACC-002 are
resolved locally: each derived 0.5° world bin takes the highest overlapping
obstacle; sky bins intersect lower edges and explicit upper ceilings, while
unpainted overlapping columns block. Default open-above remains unchanged,
including when raw painted bands are disjoint. Skyline cells use the highest
connected segment edge and upward altitude rounding; sub-column traces survive.
Source strokes, ordered erasures, no-stroke profiles and legacy migration remain
intact. Conservative widening, raster crop differences, disconnected sky openings
and the existing 4° photo-top assumption are documented limitations.

Focused validation: 13 tests passed in 3.64 s, including the independent
overlapping-cell oracle, legacy migration mutation contract, narrow-feature,
half-open boundaries, north/full seam, inclusive endpoint, sky/overhang,
sub-column trace, crop and history checks. The focused Chrome case passed,
proving planner lookup, save/reload and backup retain the narrow obstruction.
An earlier targeted run caught the new test's incorrect null-ceiling expectation
and the former exact crop-sample assertion; final checks use the actual
open-above contract and a one-calibrated-row bound for that seam brush case.
Review also caught disjoint-band handling under open-above; it was corrected
before the successful targeted run. Published astronomy anchors are unchanged.

JavaScript gate passed: 48 modules, zero syntax or broken imports; core,
encoding, catalog/provenance and recursive-token guards passed. The existing
39 heuristic undefined-name candidates remain advisory. Pre-stage release guard
refused the 12 untracked generated modules; after registering them, the development
guard passed with zero errors and the expected dirty/untagged warning.
Core token 54 retains current b61383a1eebef985 and previous 15fc8df02902f352.
Current documentation/backlog and AGENTS cache-token register are updated.

Full Chrome gate passed 100/100, including existing calibration, crop/history,
backup rollback, responsive and planner checks. The final long session retained
200 trace points and 20,000 correction dabs: handler median/p95 8/9 ms,
next-frame median/p95 16/20 ms. Warm advanced visibility was 0.3 s.
Root documentation relative-path check: 21 documents, zero missing targets,
excluding the unknown prior audit. Full Python suite ran separately after the
browser gate: 351 passed, 1 existing optional popularity-snapshot skip, 122.01 s.
Final development guard passed with zero errors and the expected dirty warning.
Prepared and separately verified the 68-file immutable local candidate in
dist/publication-preview, truthfully stamped v0.1.1-3-gcacdacf-dirty.
The preview at port8083 serves current app token193. Final encoding guard passed.
No commit, push, tag or public deployment was made.

## Horizon accuracy research and workspace documentation — October 11, 2026

The owner authorized further mathematical research, discretionary improvements,
and a general workspace/documentation review. HORIZON_ACCURACY_RESEARCH.md links
primary Hugin, OpenCV, Google GPano and NOAA references and separates source facts
from repository derivations. No arbitrary confidence percentage was added.

Implemented: evidence v3 fixes confirmed original coverage to 360° and balances
the two measured bearing offsets on their nearby circular branch, with a maximum
1° residual per point. Review shows signed fit residuals and warns above 3×
edge sensitivity to entered angle errors. V2 retains its original exact solver;
V1 remains the separate-reference model. Backup format 8 protects the semantics,
while formats 1–7 remain readable. Independent checks stay out of fitting and
manual drift cannot retain checked status. Seam paint wraps only numerically
full-360 views, fixing near-full partial coverage. The vertical-mask comment now
states the actual calibrated span/359 row spacing.

Confirmed open limits: a pure-core probe of a 45° photo with only row100/column3
painted yielded zero blocked world bins. Representative-column sampling can miss
narrow obstacles; skyline ceil(row) can understate obstruction height by one row.
Conservative obstacle/sky/overhang policy is deferred and documented in BUGS.md.
Projection conversion, leveling, additional fit/check references and physical
acceptance remain open. No astronomy or sampling fixture was changed to conceal
these findings.

Documentation review repaired current Horizon status/navigation, dependency
bootstrap, serial test guidance and provenance-input requirements. README now
maps authority, backlog, architecture, decisions, findings and receipts.
WORKSPACE_DOCUMENTATION_REVIEW.md records the scoped review; the existing unknown
WORKSPACE_AUDIT_REPORT.md was left untouched. Historical desktop/release receipts,
credentials and sibling repositories were not rewritten or used as dependencies.

Confirmed validation:
- Full Python suite: 350 passed, 1 existing optional popularity-snapshot skip,
  123.36 s. Ran separately after JS/browser completion; final boundary and strict
  normalization tests are included.
- Four focused Horizon core modules passed. Added known-width residual, reverse
  order, north-wrap, crop/drift, v2 compatibility, strict v3 normalization,
  near-full seam and sensitivity cases; final full suite includes boundary cases.
- Focused measured-fit browser case passed; full Chrome gate passed 99/99,
  including backup8, save/reload, old Advanced workflow and responsive layouts.
  Test-server connection-reset diagnostics occurred when a client closed a socket;
  they did not produce a failed gate or suppressed launch failure.
- JavaScript gate passed: 48 modules, zero syntax/broken imports; core, encoding,
  catalog/provenance and recursive-token checks passed. There are 39 advisory
  heuristic undefined-name candidates, as before.
- Final browser long session (200 trace points + 20,000 dabs): handler median/p95
  8/11 ms, next-frame median/p95 16/30 ms. Warm advanced visibility was 0.3 s.
- Root documentation relative-path check: 21 documents, zero missing targets,
  excluding the unknown prior audit report. Earlier scoped review scanned 25
  existing documentation files without broken relative links.
- Development release precheck initially refused the 12 newly baked untracked
  core files. They were registered after that pre-stage check; the subsequent
  development guard reported zero errors with the expected dirty/untagged warning.
- Final development guard again reported zero errors. Prepared and separately
  verified a 68-file local immutable candidate in dist/publication-preview, using
  truthful v0.1.1-3-gcacdacf-dirty. Core token 53: current 15fc8df02902f352,
  previous 02ddc8b5c055c4ee. The preview at port8083 serves app token192.

No commit, push, tag or public deployment was made. Changes remain local on
master cacdacf; remaining owner checks and public-host/manual gates stay open.

## Horizon/Panorama simplification A–C — October 11, 2026 (local development)

Implemented the owner's authorized A–C scope: separate sharp ruler margins,
collapsed profile/Advanced controls, and Add horizon photo → two complete known
points → preview → explicit application → optional separate check → drawing →
Save horizon. Drawing defaults to skyline tracing and selected points have a
nearby undoable Remove button. Approximate setup remains available; existing
records and the separate-reference editor remain usable through Advanced.

Core owns the two-axis fitting, bearing unwrapping, original-photo coordinates,
crop composition and report status. Two fitted points establish alignment only;
an independent check reports signed discrepancies without changing the fit.
Unknown/unsupported projections remain approximate. Calibration evidence v2 and
backup format 7 retain complete references; older backups remain readable.
Preview is session-only and applying a valid fit creates one history entry.

Review corrected a missing core helper import, an Advanced mode control attached
from the wrong parent, applied-review wording, repeated application, and missing
immediate markers for draft Advanced picks. Older browser checks were adapted
to deliberate collapsed controls and ruler gutters; no correctness fixture or
timing threshold was relaxed. Cache tokens remained fixed throughout the final
browser run to avoid importing a second editor instance during a test.

Software validation:
- Full Python suite: 350 passed, 1 existing optional popularity-snapshot skip,
  123.67 s. This ran after browser/JavaScript checks to avoid the suite's temporary
  module-removal probes affecting other processes.
- Full Chrome run: 97/98 passed. The remaining reference-marker check failed
  while restoring its test-only canvas instrumentation (a returned native
  function was invoked by the evaluator). Corrected cleanup passed the targeted
  final rerun, 1/1, with no subsequent application changes. All 98 selected cases
  are therefore covered by passing final receipts. An earlier run reported
  92/98 before adapting six old layout/label assertions.
- All five new simple-setup browser cases pass: atomic fit/check/save/reload,
  full panorama/crop/history, preview cancellation/invalid input/uncovered edges,
  picked-point dragging/zoom/phone layouts, and backup v7/approximate projections.
- Final JavaScript check: 48 modules, zero syntax errors or broken imports;
  encoding, catalog/provenance, core and token guards passed. The 39 heuristic
  undefined-name candidates remain advisory.
- A 200-point trace with 20,000 correction dabs measured handler median/p95
  7/9 ms and next-frame median/p95 16/20 ms in the final full browser run.
- Development release guard: zero errors, with the expected dirty/untagged
  development warning. Recursive tokens and current/N−1 core retention pass:
  core token 52, current hash 02ddc8b5c055c4ee, previous 120a347ba746d75c.
- Prepared and independently verified `dist/publication-preview`: 68 immutable
  candidate files stamped from actual `v0.1.1-3-gcacdacf-dirty`, not a new release.

Physical photographs, true-bearing measurements, native zoom, touch/pen and
screen-reader acceptance remain with the owner. D/E projection conversion and
multi-reference fitting are not implemented; final combined F acceptance remains
open. The explicit full-360 consistency policy can reject rounded measurements;
future tolerance must expose residuals rather than imply accuracy.
Changes remain local development on master cacdacf. No commit, push, tag or
public deployment was made for A–C.

## Horizon/Panorama phases 4 and 5 — October 10, 2026 (local development)

Implemented skyline authoring as ordered core mask operations. Click or enter
points, move them by dragging/keyboard/exact percentages, and fill below their
connected straight segments. Later brush/eraser corrections retain precedence
when earlier points move. Dense traces use adaptive markers and only label the
selected point. Full/partial/seam geometry, segment-intersection crops, deep
history, planner fingerprints and backup format 6 preserve authorability.
Formats 1–5 remain readable; malformed/over-limit traces reject before writes.

Sky openings and overhangs retain separate brush/band semantics. Switching from
an obstacle trace asks before removing it and is undoable. Precise-bin Apply
states that it replaces authored paint/traces with the current world profile
and an edited bin, preserving other bins and undo recovery. An unconnected first
point is a session draft, leaving an authoritative stored profile unchanged.
Crop/clear/profile replacement/history restoration discard obsolete drafts.

Review caught and corrected rejected additions moving an old node, selection
being overwritten during control rebuild, ordering of tightly spaced imported
points, numeric tool conflicts and draft coordinates surviving crop. The five
new Chrome cases cover these edges, ordinary tracing/corrections/crop/backup/
reload, keyboard editing, mode confirmation, overhangs, pointer cancellation,
secondary simulated touch/pen, save failure/retry and long-session history.

CAT-PERF-001 was profiled before implementation. An instrumented warm-scrub run
took 2.48 s; Intl formatter construction dominated samples. Bounded per-zone
formatter reuse still calculates offsets at each instant, and memo hits no
longer resolve site noon merely to build their key. Focused unchanged 4× CPU
timing checks passed at 0.30–0.31 s for three scrubs, with final selected-time
row altitudes now verified as well. Scoring and reference fixtures are unchanged.

Final software validation:
- Final Python rerun: 349 passed, 1 existing optional popularity-snapshot skip,
  121.50 s after the phone correction. An earlier run overlapped final source
  review and reported two cache
  guard failures while token updates were pending; corrected tokens passed the
  focused guards and the complete final rerun.
- Final JS: 47 modules, zero broken imports or syntax errors; encoding,
  catalog/provenance, cache-token and core guards passed. The 35 heuristic
  undefined-name candidates are advisory; actual browser imports are checked.
- Focused new browser acceptance: 5/5 passed; final draft/crop/reference-pick
  conflict check also passed after review. A 200-point trace plus 20,000 correction
  dabs measured handler median/p95 8/10 ms and next-frame median/p95 17/31 ms
  on this workstation. No hardware-independent latency guarantee is inferred.
- Initial complete browser run: 92/93 passed. The additional tool explanation
  enlarged the phone toolbar enough to cover a zoom hit target at 360×640.
  Capped its sticky height to 40% of viewport/240px and bumped stylesheet token
  to 61. The exact failed state/calibration/band check passed after correction.
- Development release check (`--allow-dirty --no-stage`): zero errors, with the
  expected dirty/untagged warning. New source/generated assets are registered in
  Git only for tracked-source guards. Superseded staged generated additions were
  removed from the index; the current/N−1 source trees remain available.
- Generated core: 284234714ab8678b, token 50, retaining 4ab75c9cc136a98e.
  Cache register and entry points match; development stamp remains truthful
  0.1.1-3-gcacdacf-dirty. No frozen astronomy fixture was updated.

- Final complete Chrome rerun: 93/93 passed, including the corrected phone hit
  targets, all five new tracing cases, all guided/crop/gesture/DPR cases,
  transactional recovery, planner integration and immutable publication.
  Catalog cached scrubs took 0.30 s at 4× CPU; initial table 0.20 s, complete
  warming 1.44 s. Final long trace/correction metrics: handler median/p95 7/9 ms,
  next-frame median/p95 16/29 ms, maximum 33 ms. Receipts:
  logs/horizon-phases45-browser-{initial,final}.txt; workstation metrics:
  logs/browser/artifacts/horizon-phase45-latency.json. Old failure JSON remains
  historical evidence; the final stdout receipt identifies the successful run.
- Prepared and independently reverified the fresh 67-file combined immutable
  local candidate at dist/publication-preview, described as
  v0.1.1-3-gcacdacf-dirty. Its publication.manifest.json hashes match the reviewed
  working source. No production connection/upload was performed.
- Final staged/unstaged whitespace checks passed. HEAD remains cacdacf.

Phase 4 and the phase 5 software work are complete locally. Real measured
full/partial photographs, physical touch/pen, native browser zoom and intended
assistive technology remain owner acceptance, as requested. The checklist is
HORIZON_PANORAMA_ACCEPTANCE.md. Public release/deployment is separate; no commit,
push, tag or deployment is part of this work.

## Horizon/Panorama phase 3 — October 10, 2026 (local development)

Implemented the authorized guided import/calibration phase. New photographs
start at coverage, then offer true-bearing alignment, two measured altitude
references, independent verification and painting. Existing records open directly
for editing and can review setup. Both full and partial views use exact inputs
with optional fine sliders; North does not need to appear in the image. True
versus magnetic bearing, measured level versus obstruction skyline, and supported
equirectangular versus approximate camera projections are explained in the flow.

Reference evidence is retained against the original photo, deep-copied through
history and preserved by backup format 5. Formats 1–4 remain readable; malformed
evidence rejects staging before writes. Checked status is computed from current
geometry, exact fit references, supported projection/coverage and an independent
check within 1° on both axes. Manual changes and cropped-out alignment references
cannot retain a stale checked claim. Checks show signed bearing/altitude residuals
and never auto-adjust the fitted geometry.

Browser work also fixed cursor-readout wrapping that shifted the image during
the first pointer movement. Entering Paint focuses the canvas, manual width
changes refresh setup, and a reference pick owns its pointer until up/cancel so
another pointer cannot begin painting. Same-record setup drafts/step survive
unrelated rerenders; unapplied drafts are not saved measurement evidence.

Validation:
- Focused source/history/core regression set: 27 passed. Final Python suite:
  348 passed, 1 existing optional local popularity-snapshot skip (145.74 s).
- JS: 45 modules, zero broken imports/syntax errors; encoding, catalog/provenance,
  core and cache-token guards passed. The 29 heuristic undefined-name candidates
  remain advisory rather than semantic failures.
- An initial full browser run passed 86/88. The two failures were old expectations
  for visible fine-angle outputs and backup format 4; the fine controls now require
  opening their disclosure and calibration evidence requires format 5. Updated
  crop checks passed 4/4 without weakening geometry/history/profile assertions.
- In that full run, all three guided-setup cases, all five phase 1/2 cases,
  storage/save-failure recovery and immutable publication passed. The existing
  Catalog timing check passed at 1.99 s, close to its 2 s limit; its prior repeated
  failures on committed HEAD remain unresolved CAT-PERF-001 evidence.
- Final complete browser rerun: 88/88 passed, including off-center zoomed picks,
  exclusive held-pick ownership, keyboard step progression, stable cursor layout,
  stale-calibration rejection, and full/partial setup/history/crop/backup/reload.
  Catalog timing again passed at 1.99 s. No browser launch or request failure
  was skipped. Screenshots: logs/browser/artifacts/horizon-phase3-{vertical-setup,
  checked,mobile}.png.
- Subsequent screenshot review caught missing marker-backdrop palette values
  making L/V/C labels white on white. Replaced them with the canvas surface role;
  final focused guided checks passed 3/3 with all four label/backdrop contrasts
  asserted. The correction changes drawing only; fitted geometry is unchanged.
  Also synchronized the selected horizon's list caption with live mode/coverage,
  so a calibrated partial view cannot retain its import-time 360° caption.
  The final focused guided rerun passed 3/3, including caption consistency;
  UI/cache/calibration Python checks passed 31/31 after the visual corrections.
- Final long-history/large-photo regression retained 20,041 dabs: handler
  median/p95 improved 16/20 ms to 0/1 ms versus committed HEAD; next-frame
  median/p95 was 32/47 ms before and 28/47 ms after. Workstation-specific p95
  remains below 50 ms. Metrics: logs/browser/artifacts/horizon-phases12-latency.json.
- Final development release check (`--allow-dirty --no-stage`): zero errors,
  with the expected dirty/untagged development warning. Diff whitespace check
  passed; source/token/core and immutable-publication validation remain green.
- Generated core is 4ab75c9cc136a98e, token 49, retaining 54493a51996bdd15 as N−1.
  Truthful development stamp: 0.1.1-3-gcacdacf-dirty. No frozen astronomy fixture
  was changed. New source/baked assets are staged only to satisfy tracked-source
  publication guards; the workspace remains uncommitted.

Real full/partial-photo calibration with known references, physical touch/pen
and assistive-technology acceptance remain phase 5. Editable skyline tracing
remains phase 4. No commit, push, tag or deployment is part of this phase.

## Horizon/Panorama phases 1 and 2 — October 10, 2026 (local development)

Implemented the owner's authorized correctness/gesture and readable-editor
phases. Crops now compose normalized source bounds against the retained original
photo, using the same effective band as paint/calibration. Undo/redo and backup
format 4 retain those bounds; v1–v3 remain readable. Calibration stays within
physical bounds and repairs old invalid local/restored spans without replacing
authoritative stroke-less profiles. Minimum-FOV enforcement and rounding have
distinct preview messages.

Painting joins sparse/coalesced pointer samples and applies the shared rasterizer
incrementally. A single owning pointer settles visible partial paint as one
history entry on up/cancel/lost capture/blur; tool/view/history/metadata changes
and teardown settle safely. A late image decode cannot repaint a detached editor
or overwrite a replacement editor's live profile.

Degree rulers/text/grid strokes draw in CSS pixels with DPR scaling and adaptive
ticks. The brush footprint (including seam copies) matches angular paint size;
zoom magnifies it without changing its angles. Same-panorama rerenders retain
view/tool/display settings. Paint/crop/history controls use a bounded opaque sticky
stage toolbar; Display contains grid/opacity controls.

Focused evidence: 23 core/JS/backup/D1/horizon checks and 44 history/UI/cache/core
guard checks passed. Five new browser checks cover repeat-crop original-photo
sampling, real snapshot replacement/restore/reload, sparse/two-pointer/interrupted
gestures, physical calibration bounds, rerendered view state, unobscured controls
at 1366/900/640/360 widths and short heights, and DPR 1/1.5/2 with wide/partial/
portrait images through 8× zoom. Screenshots and the 20,000-dab/4096×1024-upload
HEAD comparison are retained in logs/browser/artifacts/horizon-phases12-*.

Initial full runs exposed outdated source-shape assertions and missing new helper
registration; these were corrected without changing frozen geometry fixtures.
The first browser gate passed 83/85: immutable publication ran before new generated
assets were staged, and the existing 4×-CPU Catalog scrub timing exceeded 2 seconds
while other validation was running. The generated current tree is now staged and
the final gates run sequentially. No threshold/retry/skip suppression was added.

Final validation on the completed local implementation:

- `python -m pytest tests/ -q --tb=no`: 347 passed, 1 existing optional local
  popularity-snapshot skip (139.21 s).
- `python scripts/check_js.py`: passed, including syntax, recursive cache tokens,
  core/catalog guards; 27 advisory heuristic candidates remain non-fatal.
- `python scripts/check_core.py`: passed. Current hash 54493a51996bdd15/token 48
  retains committed previous 8e090bcf870e108d, rather than an intermediate bake.
- Final full `python scripts/check_browser.py --web`: 84/85. All Horizon checks,
  immutable publication and ordinary planner/storage/accessibility checks passed;
  the Catalog timing check alone remains open as CAT-PERF-001 in BUGS.md.
- Final focused Horizon gate: 5/5, including the late-photo redraw regression
  and a latency probe waiting for photo decode before timing. A 20,000-dab
  history/4096×1024 upload measured median synchronous pointer handling 17 ms
  before vs 0–1 ms after (millisecond-resolution browser clock); next-frame
  median 31 vs 28 ms, p95 47 vs 48 ms. The p95 <50 ms workstation target held;
  this does not establish a universal hardware latency ceiling.
- The Catalog timing comparison uses an owned full `git archive HEAD` snapshot
  with generated truthful HEAD version metadata: 2.31 s before vs 2.24 s current,
  against the unchanged 2-second threshold at 4× CPU. Both isolated runs failed
  on timing with no runtime/network errors. No new Horizon regression is inferred
  from this pre-existing issue; full-browser release readiness remains blocked.
- `python scripts/check_release.py --allow-dirty --no-stage`: 0 errors; expected
  dirty development-tag warning. `web/version.json` truthfully describes
  v0.1.1-3-gcacdacf-dirty. No frozen astronomy fixtures were changed.

Transcripts: logs/horizon-phases12-python-final.txt, horizon-phases12-js.txt,
horizon-phases12-browser-final.txt, horizon-phases12-browser-focused-final.txt,
horizon-phases12-catalog-{head,current}.txt and horizon-phases12-release.txt.

Open work: phases 3 (guided import/known-bearing and vertical calibration), 4
(editable skyline tracing and fill) and 5 (physical photo references, touch/pen,
assistive technology, integrated release review). Legacy crops without stored
source bounds cannot be reliably reconstructed and may need reimport/calibration.
This is a local dirty development build, without a release tag or deployment.

## Horizon/Panorama read-only UX review — October 10, 2026

Inspected committed master cacdacf in an isolated local browser using the Berlin
example and an owned synthetic 1600x500 landmarks image. Reviewed import controls,
painting, crop and calibration; no application/core/styles/storage/test code was
changed. No automated suite or real-world photographic calibration was performed.

Confirmed photo/paint misalignment after a roughly 214-degree horizontal crop,
flattened degree labels on a wide image, a 90-to-95-degree altitude range beyond
the top slider limit, and inaccurate minimum-FOV wording for rounded crops.
BUGS.md records HOR-UX-001–004; HORIZON_PANORAMA_IMPROVEMENT_PLAN.md separates
confirmed findings from gesture/performance reproduction still needed and proposes
five ordered phases. logs/horizon-review-crop.jpg preserves the alignment evidence.

Temporary photo/paint existed only on the separate local preview origin. The
owned fixture was removed successfully, the review tab closed and preview server
stopped. No commit, push, tag or deployment is part of this exploratory review.

## Browser monitoring validation — October 10, 2026

Tested BROWSER-LOCAL-001 monitoring against committed master cacdacf without
changing application or harness code. This verifies diagnostics and current
behavior; it does not establish the cause of historical refused module requests.

Actual results (ignored logs/browser-monitoring-*-20261010.*):
- Full Chromium web gate: 80/80 passed, exit 0. No ERR_CONNECTION_REFUSED,
  browser infrastructure failures or handler connection-reset diagnostics in
  this run's transcript.
- Historical Sun/Moon check repeated in ten isolated browser contexts: 10/10
  passed, exit 0. Each recorded a live server with backlog 64 and no natural
  same-origin connection refusal. These are independent trials, not retries of
  failed checks.
- Browser monitoring/gate regressions: 10 passed in 0.15s, including queued
  connection capacity and hard diagnostic/driver exit-code handling.
- Deliberately refused app.js?v=174 in a temporary check. The gate correctly
  failed with exit 1 and preserved the exact module URL, ERR_CONNECTION_REFUSED,
  server thread_alive=true, port and backlog 64 in its JSON diagnostic. The
  probe verified that expected failure and exited 0. This is induced evidence,
  not a natural recurrence.
- Owned probe scratch cleaned successfully; logs/.scratch retains only its
  manager lock. Replay scripts, transcripts and JSON receipts remain under logs/.

BROWSER-LOCAL-001 remains monitoring-only because no natural refusal recurred.
No application fix, release tag, commit, push or deployment was performed in
this validation pass.

## Commit validation — October 10, 2026

Validated the combined remaining-review fixes, scratch lifecycle and documentation
cleanup before committing to master and pushing to GitHub. README now describes
the changes as awaiting a public release. No release tag or public deployment is
part of this commit.

Actual validation (ignored logs/commit-*-20261010.txt):
- Full Python suite: 346 passed, 1 existing optional-data skip in 126.70s.
- Full Chromium web gate: 80/80 passed.
- JavaScript/import/encoding/cache/catalog/core guard passed.
- Development release guard: zero errors, expected dirty-development warning.
- git diff --check passed.

## Prevent repeated test scratch buildup — October 10, 2026 (local)

The documentation cleanup relocated pytest defaults but did not remove the
custom fixture's ignored deletion failures. Replaced those paths and JS syntax/
token guard scratch with scripts/scratchspace.py's owned, locked run lifecycle.
The next allocation reaps abandoned marked runs, preserves concurrent live runs
and unknown evidence, and fails visibly before allocating if cleanup stays
blocked. Read-only files and transient directory locks are retried. JS probes
have no system-temp/profile fallback. Browser per-check artifacts, publication
stages and current plus N-1 core retention were already bounded and remain so.
Dated reports/recovery/deployment evidence remain intentionally retained; this
does not impose a global disk quota on arbitrary developer-created output.

Actual validation (ignored logs/scratch-retention-20261010/):
- Focused scratch/syntax/token regressions: 24 passed in 8.69s. New lifecycle
  tests cover a real crashed child, concurrent live ownership, unknown evidence,
  read-only payloads, persistent cleanup failure/retry and unsafe path refusal.
- Full Python confirmation: 346 passed, 1 existing optional-data skip in 111.29s.
- JavaScript/import/encoding/cache/catalog/core checks passed; development release
  guard passed with zero errors and the expected dirty-version warning.
- After the full suite and simultaneous JS/release guards, logs/.scratch contains
  only its one-byte .manager-lock; no managed payload/run directories remain.
- git diff --check passed. No website assets or core math changed in this pass;
  browser gates were not repeated for test-tool lifecycle changes. Nothing was
  staged, committed, pushed, tagged or deployed.

## Documentation alignment and workspace cleanup — October 10, 2026 (local)

Updated README, release/review guidance, hosting status, design and human
accessibility acceptance to reflect the current implementation. The live release
remains v0.1.1; review phases 1–7 are local and unreleased. Human AT/native zoom,
provider compression and the next release/publication remain pending.
Moved five completed plans/reviews to docs/history with historical banners and
updated references. Corrected a dead link to a former desktop review without
claiming that report exists in the current web tree.

Removed the unused ui-concepts corpus and desktop-only tests/_util.py helper,
plus stale ignored dist candidates, after a verified local archive. All 218
archive entries matched their source SHA-256 before removal and passed subsequent
ZIP/hash verification. Tracked historical assets remain recoverable from Git.
Cleared 69.53 GiB of accumulated disposable test scratch/Python caches; the first
cleanup removed 22,246 files totaling 74,705,079,591 bytes including archived
obsolete files. The local archive occupies 30,542,244 bytes. Recovery snapshots,
deployment rollback/receipts, reference fixtures, validation evidence and core
trees were retained. Pytest basetemp/cache now default to ignored logs paths.
Any scratch generated by the final validation was cleared after the suite exited.

Actual verification (ignored logs/workspace-cleanup-20261010/):
- Full Python suite: 341 passed, 1 existing optional-data skip in 103.27s
  (pytest-full.txt), using the updated pytest paths and no retired desktop helper.
- JavaScript/import/encoding/cache/catalog/core guard passed (check-js.txt).
- Development release guard: zero errors, expected dirty-version warning
  (release-development.txt). No current publication candidate is retained;
  regenerate one from final validated source before publication.
- All 35 local Markdown links across 22 current/history documents resolve;
  archive verification and protected-path checks pass (verification.json).
- git diff --check passed. Browser gates were not repeated for this documentation,
  unused-file and test-path cleanup; the preceding phase 5–7 receipts retain their
  exact browser coverage. No shipped application bytes changed in this pass.

Removal/archive manifests and post-test scratch receipt are local ignored
evidence. Nothing was staged, committed, tagged, pushed or deployed; preceding
uncommitted remediation work remains intact.

## Review phases 5–7 — October 10, 2026 (local development)

Resolved REV-028–038 after master df76fc2. Catalog invalidation precedes new
visibility work; active-site saves refresh the displayed plan and header night
summary. Custom edits invalidate search blobs. Maximum-altitude sorting retains
shared-core maxAlt, warms all matching rows and preserves deterministic name/ID
ties in both directions. Chart states use the canonical visibility reason.

Weather keeps missing values unknown and requires complete selected-night scoring
inputs before showing a rating. Genuine zeros remain valid. Request generations
and site/coordinate/resolved-timezone ownership reject stale success/error
responses, including the first pending request. Provider requests use the exact
planner timezone rather than provider geographic auto. Untouched weather remains
on demand; requested weather follows site edits and timezone changes.

Tonight/Catalog retain native row/cell semantics with named target buttons.
Sort headers and reversal are keyboard controls; Catalog focus and search ranges
survive rerenders. Advanced help now describes switching without a reload.

Validation (ignored evidence under logs/phase567/):
- New original-module probe failed against HEAD's unmodified app: Catalog
  calculation did not settle after a minimum-altitude change (62.3s timeout).
  The corrected regression passes. This is a new reproduction, not a rerun of
  unavailable logs/review probes.
- Full Python confirmation: 341 passed, 1 existing optional-data skip in 118.14s
  (pytest-full-final.txt). Initial run had two pre-tag failures after a final
  app edit invalidated its token baseline; updated tokens and focused pre-tag
  checks pass 7/7, followed by that successful full suite.
- Full Chromium confirmation: 80/80 passed (browser-full-final.txt). Initial
  full run was 77/80: two old focus assertions expected focusable rows, and an
  immutable-candidate/source mismatch occurred during overlapping validation.
  Assertions now expect actual target buttons; the serial full rerun passes.
- After the final immediate-header refresh, focused review checks pass 9/9
  (browser-focused-final.txt), site-time/Moon checks 4/4
  (browser-site-time-final.txt), and actual immutable publication 1/1
  (browser-publication-final.txt). These follow-ups cover the final app token 174;
  the preceding full gate used token 173. No broader coverage is claimed from
  the focused follow-ups.
- Final JavaScript/import/encoding/cache/catalog/core guard passes
  (check-js-header-final.txt); final pre-tag tests pass 7/7 in 1.33s
  (pytest-token-final.txt). Development release guard: zero errors with the
  expected dirty-development warning (release-development-final.txt).
- Desktop/360px Catalog screenshots inspected under logs/browser/artifacts/
  review-phase567-catalog-{desktop,phone}.png. Target actions and sorting remain
  open controls; phone tables scroll inside their named region. Existing
  request-handler connection-reset diagnostics remain in the full browser log;
  they did not fail browser checks or establish a new root cause for BROWSER-LOCAL-001.

Cache tokens: app 174, style 56; recursive references/register and verified
baseline aligned. Version remains truthful 0.1.1-2-gdf76fc2-dirty. Core formulas,
catalog data and frozen fixtures are unchanged by phases 5–7. No commit/tag,
GitHub push or public deployment was performed. Human A11Y-001 acceptance,
HOST-DELIVERY-001 compression, and release/publication remain separate tasks.


## Phase 4 horizon geometry and editor fixes — October 10, 2026 (local development)

Resolved REV-013–019 locally. Landmark normalization reserves suffix space and
terminates for duplicate maximum-length IDs. Crops preserve vertical brush radius,
scale independent horizontal radius, retain original wrapped paint/erase copies in
order, and clear stale derived profiles if every dab clips away. One effective
kept band controls preview, minimum/integer FOV, calibration and transformed
strokes; already narrower frames never expand. Exact world directions survive.

Undo/Redo/Revert synchronize all calibration, landmark, selected-bin and comparison
controls. Valid confidence input immediately belongs to the displayed bin;
selection, rerender, Save and rollback retain its value and history. Checkpoints
settle pending metadata. Space pans only with canvas focus, releases on keyup/blur,
and editor teardown removes keyboard listeners and observers. Native text spaces,
button Space activation and text undo remain available.

Backup exports use format 3 for elliptical dabs; v1/v2 remain readable and earlier
clients refuse v3 rather than silently misinterpret geometry. Imported strokes stay
bounded at 60,000 to accommodate legacy seam copies. Original photographs,
authoritative stroke-less world-bin profiles and frozen fixtures remain intact.

Validation:
- Full pytest: 341 passed / 1 existing optional-data skip in 83.58s,
  logs/phase4/pytest-full-confirmation.txt. The earlier full run also passed
  (pytest-full.txt). Focused geometry/history checks passed 23 tests;
  mutations reject the old infinite loop, vertical scaling, lost seam wrap,
  inconsistent crop band and stale empty-crop profile.
- Original review probes reproduce corrected obstacle/sky-band altitude, seam
  obstruction and 185° world direction: original-review-probes-after.txt.
- Initial focused Chromium editor checks passed 4/4 (browser-focused.txt).
  Coverage includes native Space, pan release/rerenders, stale controls,
  confidence navigation/history, minimum crop band and ellipse backup/reload.
  The first full run passed 73/75 (browser-full.txt): both new reload checks
  incorrectly waited for Tonight while the app correctly restored Horizon.
  Their readiness condition now waits for the actual editor; focused confirmation
  passed 4/4 (browser-focused-confirmation.txt). Final editor controls also enable
  Undo for a first pending metadata edit and disable invalidated Redo; an added
  browser assertion covers that previously missing first-entry case. Final full
  Chromium confirmation passed 75/75 (browser-full-confirmation.txt), including
  the first pending edit, metadata checkpoint/rollback and restored-view reloads.
- JavaScript guard passes (check-js-final.txt); development release guard reports
  zero errors with the expected dirty-version warning (release-check-final.txt).
  The pre-staging guard correctly refused eleven new untracked generated modules;
  they were added to the Git index after that check (release-before-staging.txt).
- Core rebuilt to 8e090bcf870e108d, token 47, retaining 282a2f0070874c8a as N-1.
  App token 171 and importer tokens/AGENTS register align; recursive token update
  is idempotent (cache-final.txt). Ellipse backup confirmation executes before its
  harness exit and passes (ellipse-backup-confirmation.txt).

- Rebuilt and verified the 63-file combined local publication candidate with
  truthful describe v0.1.1-1-g471e64a-dirty (publication-final.txt). Web namespace:
  57e941288c606435fd6b8a623a210831fe9a9a73c20f72d7ce1070a2f265322f;
  landing: 3ad1dd875ec02c1b8d9771a3155f3ffbdc45dbdc4760c8ad5489354a6f6ba710.

No release commit, tag or deployment was performed. BUGS.md retains eleven
unresolved review findings (ten P2, one P3), alongside prior human accessibility
and live host-delivery acceptance items.

## Phase 3 astronomy and site-time fixes — October 10, 2026 (local development)

Resolved REV-005–012 locally. Boot planning uses the active site's calendar date;
wall-field resolution is independent of browser timezone, chooses the earlier
DST overlap occurrence, and shifts forward through gaps. Site midnight/noon,
consecutive noons and polar fallback endpoints resolve separately. Memoization
includes the resolved zone/actual noon; timezone changes invalidate full-day
anchors and date edits reposition selection. Full-day spans follow 23/24/25-hour
site calendar days while dragging retains its anchor through the endpoint.

Canonical lunar coefficients match Meeus tables. Moon altitude now subtracts
sea-level WGS84 observer parallax in the equatorial-of-date frame and refracts
once; phase/elongation remain geocentric J2000. Independent PyEphem/libastro
anchors cover eight dates/sites, distance and observer position; mutations catch
each corrected sign, distance errors and omitted parallax. The historical lunar
fixtures remain byte-identical; both fixture/mutation harnesses now use explicit
independent lunar references instead of accepting a permanently wrong oracle.
Culmination scans the complete site calendar day separately from rise/set, and
its Moon warning uses illumination at culmination with a 0.15 fraction threshold.
The truncated lunar model remains approximate; elevation is still metadata only.

Validation:
- Full pytest: 335 passed / 1 existing optional-data skip in 79.02s:
  logs/phase3/pytest-full-confirmation.txt. The first run's four integration
  failures required registering the new canonical exports, updating adapter
  contracts and the second obsolete lunar oracle comparison; two local HTTP
  checks required socket access. Its receipt remains in pytest-full.txt.
  The focused integration rerun passed 42 checks; final browser wiring passed
  10 checks after the browser completion-state correction.
- Full Chromium gate: 71/71 passed: logs/phase3/browser-full-confirmation.txt.
  The first full run passed 70/71; Catalog's existing advanced-visibility check
  mistook a partial exclusion count for completion while warming still ran.
  It now also waits for progress/busy completion without weakening the visibility
  assertion or adding retries/skips. Isolated confirmation passed in 3.7s;
  both full receipts and browser-catalog-investigation.txt remain available.
  Focused Phase 3 checks corrected test assumptions about selection-relative
  anchors, restored Catalog views and closed details; the final gate asserts
  remote-site boot dates, memo/anchor changes, 23/25h bounds, stable dragging,
  explicit calendar changes, and actual full/new Moon warning colors and text.
- Final JavaScript checks pass; development release gate reports zero errors
  with the expected dirty-version warning. Receipts: check-js-final.txt and
  release-check-final.txt. Recursive token update is idempotent (cache-final.txt).
- Core rebuilt to 282a2f0070874c8a, token 46, retaining 204c232bf69db731 as N-1.
  New generated modules were added to the Git index for the served-file tracking
  gate. App token is 169; importer tokens and AGENTS register are aligned.
- Rebuilt and verified the 63-file combined local publication candidate with
  truthful describe v0.1.1-1-g471e64a-dirty (publication-final.txt). Web namespace:
  83081f455059dc9a26f8c54c3d4353b5e7e2fec5956ed8f46657e935e17cd923;
  landing: d35f37eeb6bdd241873fe7255821c321f4f7adbde9eb311bb486bb21d787a6de.

No release commit, tag or deployment was performed. BUGS.md now retains eighteen
unresolved findings from the original review (sixteen P2, two P3), plus the
existing human accessibility/host-delivery acceptance items.

## Phase 2 release and cache fixes — October 10, 2026 (local development)

Resolved REV-025–027 locally. Both publication builders package complete web and
landing asset/data graphs under content-addressed release paths. Canonical HTML
pins assets while preserving ordinary navigation; catalog, provenance and version
requests resolve beside their module. The FTPS publisher validates local content
before credentials, verifies temporary uploads and the full remote graph, then
atomically renames public entries. Existing immutable bytes must match and old
releases remain available. Raw mutable website upload commands are refused;
changed root server policy requires separate review. No production connection or
host setting was exercised.

The token guard/updater now traverses all HTML roots and recursive imports,
re-exports and literal dynamic imports, including shared landing CSS. It refuses
conflicts, missing/unversioned dependencies and invalid baseline refreshes,
propagates importer changes once, preserves manual advances, uses manifest-owned
core tokens, and is idempotent. Image credits now shares theme token 21. Release
validation and staging enforce Git tracking for all served file types, allow only
generated web/version.json, and refuse symlinks or incomplete bundles.

Validation:
- Full pytest: 323 passed / 1 existing optional-data skip in 77.31s:
  logs/phase2/pytest-full.txt. The 25 new regressions cover upload interruption
  at every transfer, retry, corruption, immutable conflicts, actual Node execution
  of old/new graphs, full inventory tracking, symlinks, missing bundles, preflight
  before credentials, recursive propagation, manual advances, cycles, core tokens
  and historical discovery.
- Focused staged Chromium acceptance: 1/1 passed in 2.0s:
  logs/phase2/browser-staged-verified.txt. It boots Tonight, Catalog and Sky;
  exports pinned provenance; checks pinned version/data/assets; and navigates
  landing and secondary HTML. Initial harness assumptions about the pinned clock,
  existing tab names and static Image credits were corrected; failed focused logs
  remain available in logs/phase2.

- Initial full browser run: 66/67 passed; the existing responsive-planner
  keyboard photo-chooser check timed out without page/console errors:
  logs/phase2/browser-full.txt. Its isolated investigation passed in 8.8s:
  logs/phase2/browser-responsive-investigation.txt. No application changes or
  automatic retries/skips were introduced; the timeout's cause is unconfirmed.
- Final JavaScript gate passed: logs/phase2/check-js-final.txt. Development
  release gate passed with zero errors and the expected dirty-tag warning:
  logs/phase2/release-check-final.txt. A second cache-update run changed nothing:
  logs/phase2/cache-idempotence.txt.

- Repeated full Chromium gate: 67/67 passed, including the photo-chooser check
  and the new staged publication check: logs/phase2/browser-full-confirmation.txt.
- Final combined local candidate prepared and verified: 63 files, 54
  source artifacts, truthful describe v0.1.1-1-g471e64a-dirty:
  logs/phase2/publication-final.txt and dist/publication-preview/publication.manifest.json.
  The FTPS bundle loader independently accepted the complete local payload.
  This local verification performed no FTPS connection or upload.
Cache register/baseline now agree at app 167, horizon 78 and webstore 45.
Core math, generated core trees and reference fixtures remain unchanged.
BUGS.md retains 26 review findings (23 P2, 3 P3) for subsequent phases.
Changes remain local and uncommitted; no tag, publication or remote write occurred.

## Phase 1 integrity fixes — October 10, 2026 (local development)

Resolved REV-001–004 and REV-020–024 locally: verified FTPS peer identity,
transaction-completion storage writes, atomic record/safety replacement, strict
backup reads, durable CSP-compatible panorama photos, preference replacement
and validation, honest save/delete failure handling, safe unique custom IDs,
and full-input RA/Dec parsing. Full restore recovery includes reinitialization,
Tonight rendering and the original dirty editor history. Setup controls serialize
transfers. BUGS.md retains the other 29 review findings for later phases.

Final-source validation:
- 298 pytest tests passed / 1 existing optional local-data skip in 76.26s:
  logs/phase1-pytest-final-source.txt.
- Full real Chromium gate: 66/66 passed, including 13 new integrity checks:
  logs/phase1-browser-final.txt. Isolated checks cover request success followed
  by transaction abort, failed/missing reads, quota failures, current photo
  bytes after reload, complete rollback and dirty undo/redo recovery.
- JavaScript checks passed: logs/phase1-check-js.txt. Development release check
  passed with zero errors; the dirty, untagged HEAD warning is expected:
  logs/phase1-release-check.txt.
- Three offline TLS regressions verify untrusted certificate and wrong-hostname
  rejection before credentials, plus trusted login with encrypted data transfer.
  These tests are included in the full pytest count, not additional tests.

The first full validation exposed outdated test assumptions around durable
preference writes, plain-text error interpolation and strict reload arguments;
the adapters were corrected while retaining behavioral assertions. The browser
gate also caught a 0%-versus-1% Catalog-default regression; the shared preference
schema now preserves the established 1% default. That initial long-running gate
was stopped after the confirmed failure and restarted against corrected source;
logs/phase1-browser-full.txt retains the failed/interrupted attempt. The final
66/66 run completed cleanly.

Cache tokens and all affected served import references are aligned at app 166,
horizon 77 and webstore 44; the verified baseline and AGENTS.md register match.
Core math, generated core trees and reference fixtures were unchanged.
web/version.json truthfully reports 0.1.1-1-g471e64a-dirty. Changes are uncommitted;
no release tag, publication, production FTPS access or deployment was performed.

## Repository review validation — October 9, 2026 (no release)

Reviewed master application source at 471e64a across shared astronomy/time/
scoring, planner orchestration, browser persistence/backup, panorama geometry/
history, accessibility/public pages and catalog/build/release/deployment tools.
38 confirmed findings (4 P1, 30 P2, 4 P3) are recorded in BUGS.md and the detailed
local report logs/review/REVIEW.md. Only review documentation was changed;
application fixes, deployment, remote writes, release commits and actual-repo
tags were not performed. Generated version.json reports the truthful dirty
development describe after documentation edits.

Final review validation: 295 tests passed / 1 existing optional local-data skip
in 77.93s; scripts/check_js.py passed. Transcripts:
logs/review/validation/pytest.log and check-js.log. The unchanged-source setup
baseline also passed the full 53/53 browser gate (logs/environment/browser-check.log);
this was not reclassified as coverage of the newly failing scenarios.
Delegated scoped runs: 88 pipeline tests, 66 astronomy/time/scoring tests and 17
horizon-related tests passed; these overlap the full suite, so their counts are
not additional unique tests. Root's six UI/state/weather probes completed with
diagnostic assertions and saved logs/review/root/results.json. Subsystem reports
link numerical comparisons, offline deployment/token fixtures, real Chromium
accessibility/canvas probes, and real IndexedDB abort/read/quota fault injection.
Normal photo restoration failed under shipped CSP without quota injection.

Independent lunar references (PyMeeus 0.5.12 table coefficients and PyEphem
4.2.1) are installed only in ignored logs/review scratch. Three, not four,
coefficient signs are wrong; line 216's negative sign was independently ruled
correct. Corrected numerical comparisons use an in-memory copy, with no core
or frozen fixture changes. Manual screen-reader/native zoom, other browsers,
live hosting/FTPS behavior and exact absent upstream source-byte reconstruction
remain outside this review. Existing A11Y-001 and HOST-DELIVERY-001 remain open.

## v0.1.1 — released and deployed, October 8, 2026

Owner authorized release/commit/GitHub publication and deployment of the validated
annotation improvements, plus correction of stale overhaul-plan publication prose.
Curated the independent 0.1.1 Changes entry and retained the original 0.1.0 entry.
The inherited tags and independent catalog remain untouched. Human AT/native zoom
and provider compression remain separate open gates.

Final source pytest: 295 passed / 1 existing optional skip in 92.42s. JS/core/
catalog/cache/encoding and development release guards passed. One full browser
run found a Horizon phone assertion measuring two layout generations with
separate locator calls after resize/Save. The captured layout was correct;
wait for pending animation frames and read both rectangles atomically, preserving
the same stacking assertion. Its focused check passed, then the complete browser
gate passed 53/53. Both transcripts are retained in ignored deployment logs.
Release commit 52038830584babcacc541670fe62f791750a665e and new annotated
v0.1.1 tag were pushed to codex/website-phase-two on GitHub. The verified 54-file
publication package and SHA256 assets are attached to the GitHub release.

Authorized production deployment completed: a fresh 260-file backup was hash
verified and re-inventoried before upload. All 54 files uploaded, dependencies
before every HTML entry point; all 54 passed FTPS readback hashes. HTTPS decoded
hashes match for all 52 public files and both entry routes. Live version is clean
0.1.1. Live browser acceptance passed fresh/return planning, 50-row Catalog and
checkbox filters, direct settings controls, simplified Tonight/Sky, one-minute
slider, fresh/cached Wikipedia photos with individual credits, OpenNGC sources,
and all six public pages at 1240/360px. Live Sky/phone Changes screenshots inspected.
All twelve remote core directories remain; no remote files were deleted.

Evidence: logs/deployment-0.1.1-20261007/ (backup, upload/readback, HTTPS/browser
transcripts and deployment-receipt.json; the backup started October 7 and final
publication was October 8). The release archive SHA256 is
c3b96c3529e3c41e7847e4e8d67034528d28f7985a6cd4446ac572cbec0730d4.
Actual cache headers remain correct. HTML/JS/large JSON still do not negotiate
compression, while version/manifests do; HOST-DELIVERY-001 remains open as requested.
Human AT/native zoom remains open. The independent catalog is unchanged.
Current status documentation corrected; prior dated validation remains history.

## Unreleased — compact Sky time rail, October 7, 2026

Removed Sky's duplicated site datetime input and visible range-help row. Date
editing remains in the common top bar. The four twilight labels stack to the
left of the longer slider; Now/Reset remain on the right. The desktop rail is
at most 66px high in acceptance coverage. Phones give the slider its own
full-width row above the compact legend/actions. Selected clock, phase text,
range endpoints, honest polar conditions and accessible range help remain.
Shared site-zone astronomy and one-minute time synchronization are unchanged.

Updated time-pinning fixtures to operate the actual slider with the versioned
webstore site-zone conversion; retained selection and interval coverage.
Desktop/640/360px annotations-sky screenshots inspected. Targeted layout and
six selection checks passed. Full Python suite: 295 passed / 1 existing optional
skip in 99.11s. JavaScript/encoding/cache/core/catalog guards and development
release check passed (0 errors; expected dirty-version warning). Full Chrome
browser gate: 53/53 passed, including interval agreement, one-event time
synchronization, responsive layouts and all selected-target continuity cases. App 164 / style 55 / themes 21 register and public page
references align. Local preview returns HTTP 200 on port 8081. No commit or
deployment; previous uncommitted work preserved.

## Unreleased — simpler overviews and direct settings, October 7, 2026

Removed Tonight's Visibility reason and Rises later columns, leaving rank,
target, relative score, maximum altitude and best usable interval. Header alignment
and narrow-table widths follow those five columns. Removed Sky's visible-now list,
its per-draw sort/filter/DOM rebuilding and obsolete styles; map picking, selected
target reopening, unplotted notices and the full inspector remain synchronized.

Site/Rig words are accessible settings buttons beside independent native selectors.
Site opens the active site's edit form; Rig opens the selected rig's edit form,
or equipment setup if none is active. They use brass hover and keyboard-focus
feedback and preserve Setup return focus. The owner's additional hover request
is included. Filter controls remain: Hα/OIII affect Tonight's score with Moon-aware
ranking enabled while the Moon is up, using the existing global OIII-over-Hα-over-
broadband assumption. Menu help now explains this conditional effect, and a
broadband warning displays BB rather than erroneous NB. Core calculations unchanged.

Final validation: full pytest 295 passed / 1 existing optional skip in 96.94s;
full Chrome browser gate 53/53 passed; JS/encoding/cache/core/catalog guards and
development release check --allow-dirty --no-stage passed with 0 errors and the
expected dirty-version warning. The first full browser run found one interval
test still clicking the removed list; converted it to map picking, verified the
interval check separately, then reran the full gate successfully. No coverage
was dropped. The new acceptance checks five columns, direct active-record forms,
no-rig setup, native rig selection, hover, Enter/Space, returned focus, phone fit,
removed list and correct broadband badges. Existing selection/interval checks use
real map clicks through shared-core positions in isolated browser fixtures.

Desktop/phone simplified-*.png screenshots inspected in logs/browser/artifacts/.
Register/baseline align at app 163, style 54, themes 20, horizon 75; all public
pages reference shared themes 20. Local preview remains on port 8081. Development
version remains v0.1.0-1-g3b02147-dirty. Nothing staged, committed or deployed;
previous uncommitted work preserved and production v0.1.0 unchanged.

## Unreleased — smooth time and Horizon annotation follow-up, October 7, 2026

Both time sliders and the selected-time presentation marker now use one-minute
steps rather than 15 minutes. Model/controls/inspector facts synchronize immediately;
Sky and inspector canvases coalesce time input to one latest-state redraw per frame.
Obsolete Sky frames are cancelled on rerender/route exit and inspector frames on
close. Inspector facts reuse the existing site/date/timezone window memo; core
astronomy, scoring resolution and range/clamping rules remain unchanged.

The whole wide-screen Horizon tools rail now sticks and scrolls within the
viewport, instead of its first card overlapping paint/history controls. Layouts
at 1240px and below return to normal flow. The body grows with content so tall
panoramas do not scroll the common header out of its sticky containing block.
The optional numeric panel has clearer direction/height labels, mode-dependent
upper-edge availability, confidence/comparison help and an explicit explanation
of its existing paint-to-stored-profile transition and Undo/Save. Undo/Redo now
keep the paint-mode selector, block-above checkbox and numeric fields synchronized
with the restored horizon model.

Validation: full pytest 295 passed / 1 existing optional skip in 108.17s; full
Chrome browser gate 52/52 passed; check_js.py and development release check
--allow-dirty --no-stage passed (0 errors; expected dirty-version warning).
The new acceptance exercises both real one-minute keyboard increments, 40 input
events with an open inspector (one paint per canvas at the final time), route
exit with a pending paint, a tall photo at 1894x900 and 1440x700, non-overlapping
rails and keyboard-reachable Save, mode/Undo synchronization, and 360px stacking.
Final desktop/phone screenshots inspected in logs/browser/artifacts/followup-*.png.
Advanced-mode CPU-throttled checks also remain green. No new unresolved finding.

Tokens/register/verified baseline align at app 162, horizon 75, style 53;
themes remains 19. Local preview /astro/ serves the new entry points at port 8081.
Version remains truthfully v0.1.0-1-g3b02147-dirty. Nothing staged, committed,
tagged or deployed; production v0.1.0 is unchanged.

## Unreleased — planner annotation changes, October 7, 2026

Implemented the four owner annotations alongside the existing public header edit:
open checkbox object-type filters with OR selection, modifier-free interaction,
clear selection help and preserved focus; 50-object Catalog pages in an available-
height keyboard-scrollable table; selected-time condition labels instead of the
misleading Rises later status/filter; Sky time controls above the map with matching
top-bar input styling and shared actual-Sun twilight tracks; and removal of
Tonight's duplicate local slider/listener/styles.

Catalog window/clear-window facts now use compact summaries inside the current
revision-keyed observation cache, populated through the existing shared-core page
batch/warm loop. Fresh Catalog entry and date changes therefore do not require
Tonight to supply window facts. Conditions distinguish usability, horizon blocks,
the altitude limit, below-horizon position and the planning window. Tonight's
reason label also respects outside-window conditions when altitude alone clears.
The core formulas, planning-window policy and whole-night ranking are unchanged.

Final validation: full pytest 295 passed / 1 existing optional skip; full Chrome
browser gate 51/51 passed; check_js.py passed; development check_release.py
--allow-dirty --no-stage returned 0 errors, with the expected unreleased/dirty
Git warning. The first pass caught a register entry not yet updated after the
final token bump and two browser-test issues (an obsolete clock-only accessibility
assertion and a missing assertion message); corrected before the clean full rerun.
The new browser acceptance covers independent type clicks/Space/focus, pagination,
fresh Catalog windows, date-change agreement with the full inspector, synchronized
phase tracks and polar daylight without a fictitious night band. Existing checks
cover full-day time ranges, selected-time notifications, storage, photos/credits,
source retries, horizon editing, and public pages.

Inspected actual Catalog/Sky screenshots at 1894x1244 and Sky at 640/360x900 in
logs/browser/artifacts/annotations-*.png. Advanced mode still passes its populated-
horizon/4x-CPU check: first table 0.29s, complete visibility 2.17s, three cached
Catalog scrubs 0.20s. These are local test measurements, not hosting guarantees.
Tokens/register/verified baseline align at app 161, style 52, themes 19; public
pages reference shared themes 19 and retain their public stylesheet token 4.
Version metadata truthfully reports v0.1.0-1-g3b02147-dirty. No changes staged,
committed, tagged or deployed; published v0.1.0 remains unchanged.

## Unreleased — public header planner action, October 7, 2026

All six public pages now show a compact brass Open planner link in the top bar,
aligned with the wordmark and desktop navigation. Phone layouts keep the action
visible beside the native menu, including with JavaScript disabled and the menu
closed. Home and Features retain their existing hero action. The public stylesheet
token moves from 3 to 4 on every entry page and in the AGENTS register.

Validation: pytest 295 passed / 1 existing skip; JavaScript/source guards passed;
the three public-page browser checks passed, including 200% CSS zoom, keyboard
navigation and all six pages at 640, 360 and 320 pixels. Desktop (1894px) and
320px phone screenshots were inspected in logs/header-planner/. This local change
is not committed or deployed; the published immutable v0.1.0 is unchanged.

## Published — NightSeam Web 0.1.0, October 7, 2026

Deployed the immutable v0.1.0 release at commit
39ac0461c0ee4fc564c5e52fa509a896a068d8fb after explicit owner authorization.
GitHub release: https://github.com/Terrazocker/nightseam/releases/tag/v0.1.0.
The host's existing redirect serves the planner at https://www.nightseam.de/astro/.
The independent Windows catalog and remote beta/download archives were untouched.

Before writing, inventoried and backed up 311 files (26,994,503 bytes), including
all ten existing remote core hash directories. Uploaded all 54 release files,
dependencies before HTML, using fresh encrypted FTPS connections. FTPS readback
SHA-256 matches all 54 files; decoded HTTP hashes match 52 readable files and
both entry routes. Live version.json and footer report 0.1.0 / v0.1.0.

Production smoke passed (one local smoke plus one live check, 2/2). Additional
isolated live-browser acceptance verified 16 Tonight rows at the pinned night,
Catalog/Sky/Horizon navigation, a decoded fresh M42 thumbnail, actual NASA/ESA
credit and license, the same cached photo/credit after reload, OpenNGC source
history and return-visit storage. The canonical www origin has no console/page
errors or failed same-origin responses. All six public pages passed at 1240px
and 360px; live screenshots were inspected. The original 295-test/50-browser
release evidence remains the source validation; no shipped implementation changed.

Only after acceptance, checked retired files against their backup hashes and
deleted the 81 explicitly listed JPEGs. image-attributions.json was already
absent. Every pre-existing core directory is retained. Backup, upload, hash,
browser and cleanup receipts live in ignored logs/deployment-0.1.0-20261007/.
No credential values were printed, copied into the repo or included in assets.

Measured live cache policy is correct for entry HTML, versions/manifests and
numeric-token assets. Version/manifests negotiate gzip, but HTML/JS and the large
catalog/provenance JSON responses do not. HOST-DELIVERY-001 remains for supported
Plesk/nginx compression configuration; this is not a failed deployment or a claim
that the local compressed benchmark was observed live. Actual human AT/native
zoom acceptance also remains pending. The release tag and published asset bytes
remain unchanged by this subsequent documentation receipt.

## Release authorization — NightSeam Web 0.1.0, October 7, 2026

The owner authorized the current accepted website overhaul for commit, a fresh
v0.1.0 tag and GitHub release on codex/website-phase-two. The existing private
Terrazocker/nightseam repository remains the remote; master and inherited tags
are preserved. Exact immutable commit/asset hashes and clean-stage validation
are recorded in the GitHub release and its downloadable release manifest.
GitHub publication does not establish a deployment to nightseam.de.

Pre-release review found a packaging issue: regeneration after committing the
81 legacy photo deletions would drop their cleanup paths. The reviewed 82-path
inventory now has a tracked ledger, validated path bounds and regression coverage
for clean regeneration and invalid/duplicate paths. The single public 0.1.0 entry
uses the actual release date, October 7. Planner modules/data are unchanged from
the final 50/50 integrated browser gate; regenerated public history passed both
landing browser checks. Full post-packaging suite: 295 passed, one existing skip
(76.29s). JavaScript/core/catalog/cache guards pass. Human AT/native zoom and live
host acceptance stay open.

## Unreleased — Remaining backlog and integrated review, October 7, 2026

Completed docs/history/WEB_REMAINING_WORK_PLAN.md locally. Optional 6.74 MB provenance no
longer blocks boot; one validated lazy request serves disclosures/export with
timeout, retry, identity/connectivity checks and truthful failure states.
Open disclosures survive refresh. Malformed source fields cannot create an
empty authoritative download. No catalog/provenance bytes or core math changed.
Elevation is explicitly metadata at entry; a browser check proves changing only
elevation preserves planning and persists the recorded value.

Encoding-safe browser diagnostics preserve exit 1 versus exit 2 on cp1252.
The local gate server's listen queue is 64, with liveness/backlog diagnostics.
Paused-accept bursts measured five accepted connections at the old default and
twenty at the new capacity. Historical refusal causation remains unconfirmed;
no retry/skip hides failures. Both integrated runs also printed a request-handler
connection reset during context teardown; it is retained as diagnostic evidence.

Recursive FTPS uploads now flatten/sort all assets before any HTML, including
nested pages. Deployment/release helpers exclude credential files. Both public
trees have prepared gzip and numeric-token cache rules with manifests/HTML
revalidated. The local delivery simulator tests negotiation, ETag/304, cache
reuse/invalidation. Review caught and fixed its per-request cache rebind.
HOSTING_CONFIGURATION.md retains the actual Apache/nginx/live-verification gate.

Comparable Chrome/CDP 5 Mbps/120 ms samples measured slow cold startup
22.240s → 11.154s from lazy sources; slow warm 11.747s → 0.559s. Prepared-policy
local simulation measured 4.091s cold / 0.420s warm and 1,134,682 cold wire bytes
instead of 12,353,745. These are one-sample local measurements with actual HTTP
caching and no request interception; they are not current host results.
docs/history/WEBSITE_FINAL_REVIEW.md records all scenarios and screenshot/copy review.

Final validation: full pytest 288 passed, 1 existing optional-data skip (90.05s).
JS syntax/import/encoding and core/catalog/provenance/cache guards passed for
42 modules. Full browser gate 50/50 passed, including the two new provenance/
elevation checks. Initial gate was 49/50: the older accessibility assertion
assumed synchronous source loading; it now waits for the complete disclosure
and retains both provenance/history assertions. Focused acceptance then passed,
followed by the final full gate. No product error was suppressed.
Development release preflight: 0 errors, expected v0.6.36-dirty warning;
0.1.0 pre-tag and generated history checks pass. Tokens: app158, horizon74,
style50, themes18, core45; register/references/baseline agree.

The verified ignored dist/publication-preview contains 54 files, a SHA-256
manifest, truthful v0.6.36-dirty describe and 82 explicit retired cleanup paths.
It is a local review candidate, not a tagged release. Root docs now consolidate
current authority and historical plans; release/rollback steps are concrete.
All six public pages and all four planner views were inspected at desktop/phone
widths. Real AT/native zoom, clean reviewed commit/tag, publication authorization,
actual hosting headers, live smoke and cleanup remain external/manual gates.
Future ephemeris/seeing/offline proposals are separately scoped, not advertised
as shipped. No Git staging/commit/tag, public deployment or sibling changes.

## Unreleased — Open workspace and advanced Catalog, October 6, 2026

Implemented docs/history/WEB_OPEN_DESIGN_IMPLEMENTATION_PLAN.md using the independent catalog
as a read-only visual reference. Replaced contradictory Workbench overrides with
a shared page surface, unframed workspace sections, transparent actions and
underlined tabs. Retained clear inputs/focus/selection and bounded temporary
dialogs/menus. Opened all four planner views and the full inline/docked inspector;
Horizon canvas backgrounds/grid/profile marks now use semantic roles. Scheduled
and cancelled Horizon container resizing to avoid an observer notification loop.
Public-page composition remains approved; canonical theme references were updated.

Advanced mode changes live instead of reloading the full application/catalog.
Catalog shares a grid snapshot/panorama fingerprint, avoids per-row twilight
rescans, filters search before visibility work and uses one owned/cancellable
background job with small shared-core batches. Page fills use revision/generation
guards. Core astronomy, catalog data and independent desktop files were unchanged
by this task; earlier uncommitted phases remain present.

The populated 720-bin profile benchmark measured first table/full visibility at
1.21s/2.45s before and 0.13s/0.20s after on normal CPU. At 4x CPU slowdown it
measured 6.57s/14.31s before and 0.25s/1.13s after; longest task fell from 5.55s
to 0.11s, with no catalog refetch. These local timings are not network/hardware
guarantees. Final focused acceptance also verified three cached scrubs in 0.12s
at 4x slowdown without recomputing full-night percentages or retaining busy.

Cache tokens: app156, horizon74, themes18; style50 and core45 unchanged by this
task. Public references, AGENTS and verified baseline agree. Validation: full
pytest 271 passed, 1 existing optional-data skip (80.29s); full browser gate
48/48 passed, including live Advanced activation with a populated horizon and
open-workspace/temporary-window boundaries. The subsequently extended focused
scrub/cancellation check passed. JS/import/syntax/encoding/catalog/core/cache
guards passed; development release preflight after pytest: 0 errors, expected
v0.6.36-dirty warning. Diff whitespace check passes with repository CRLF handling.
Desktop/phone captures in ignored logs/phase4/screenshots/ and populated Sky/
Horizon captures in logs/open-design/ were inspected. Manual A11Y-001 acceptance
remains pending. No staging, commit, tag or public deployment.

## Unreleased — Simplify Tonight and filter/editor controls, October 6, 2026

Removed Tonight's overview graph, track checkboxes/legend, unused six-minute
track computation and observer; the brief, selected-time scrub and ranked table
remain. Full target inspectors retain their altitude chart. Removed Horizon's
calibration provenance controls/bindings and their UI-to-model assignment so
existing saved/imported provenance survives Save, history and backups. Actual
calibration and profile/confidence tools remain. Catalog object types now size
to the complete available option count, without a fixed-height scrolling list.

Cache tokens: app155, horizon73, style50; register, references and baseline agree.
Validation: focused full-list/metadata Save/reload browser check passed, desktop/
compact inspector and Tonight fit check passed; full pytest 271 passed, 1 existing
optional-data skip (92.39s); JS/import/syntax/encoding/catalog/core/cache guards
passed. Development release preflight: 0 errors with expected v0.6.36-dirty
warning. Full browser gate: 46/46 passed. Desktop/phone captures in ignored
logs/phase4/screenshots/ were refreshed and inspected. Diff whitespace check
passes. No commit, tag or deployment.

## Unreleased — Sky View single full inspector, October 6, 2026

Removed the duplicate compact target facts and miniature altitude chart. Sky
View now places collapsed chart controls/legend first in the rail, the shared
full inspector next, and visible-now targets below. Target clicks open full
details directly. Closing retains selection and a small reopen action. The
inspector stays inline/complementary at every width, leaving map/time controls
usable and avoiding a second reserved column. Its wrapper survives workspace
rebuilds and is parked outside #view before routes or Setup dialogs take over.
Removed the old theme rail-width override; desktop details now fit their rail.

Cache tokens: app154, style49, themes17; entry points, AGENTS register and verified
baseline agree. No core math changes. Validation: full pytest 271 passed,
1 existing optional-data skip (80.93s); JS/import/syntax/encoding/catalog/core/
cache guards pass; focused selection 6/6, single-inspector lifecycle 1/1,
responsive detail fit 1/1 and interval agreement 1/1 pass. Development release
preflight after pytest: 0 errors, expected v0.6.36-dirty warning; diff whitespace
check passes. An earlier overlapping preflight saw pytest's deliberate invalid
web/lib/geom.js token fixture; pytest removed it and the final preflight is clean.
Visual captures at 1672/1240/360px are in ignored logs/sky-layout/. Full browser
gate: 45/45 passed, including the new single-inspector lifecycle check. No
commit, tag or deployment.

## Unreleased — Phase 4 planner usability and accessibility, October 6, 2026

Implemented readable header groups for observing setup and planned night/time,
without shrinking text to fit; selected time remains visible on phones. Tonight's
table has a named keyboard-accessible horizontal scroll region. The empty
Horizon layout stacks correctly on phones, and upload/import actions are keyboard
reachable without duplicate hidden-file-input stops. Target map labels retain
screen font size while zooming, try nearby bounded positions and avoid each other;
Tonight's end ticks align inward. Sky chart alternatives use the site clock.

Options/Weather expose expanded/control relationships, allow only one panel open
and restore trigger focus on Escape. Setup restores visible opener focus,
including takeover of a wide inspector; both tab strips expose selection/panel
relationships and support arrow/Home/End navigation. Scoped controls and scroll
regions win over global time shortcuts. Modal stops exclude closed disclosures
and unreachable controls; actual modals isolate background roots, while wide
inspectors stay complementary. The trap is active during the first visit too.
Quiet view/site/night/rig announcements replace the whole-dialog live region;
local Setup statuses and validation errors keep their own announcement roles.

Welcome now explains example Berlin coordinates, Options → Setup, optional rig
Frame % estimates and Horizon. Invalid entries are preserved with readable
feedback. Existing selection continuity, scoring, storage/backup and unsaved
horizon-edit contracts are preserved. No core math or public-page redesign was
changed. Final cache tokens: app152, horizon72, style48; references/register and
verified baseline agree.

Final validation: full pytest 271 passed, 1 existing optional-data skip
(80.40 seconds); full browser gate 44/44 passed, exit 0, including five new
Phase 4 checks and the existing six selection checks. JavaScript integrity passed
for 42 modules, with import/syntax/DOM/encoding/catalog/provenance/token/core
guards OK. Development release preflight returned 0 errors with the truthful
v0.6.36-dirty warning. Diff whitespace check passed.

Focused checks and screenshot review caught premature popover closure during
intermediate blur, enlarged-layout table overflow, shortcut interference with
scrolling, empty Horizon column specificity and duplicate upload accessibility
targets; each was corrected before the final gates. The first full browser run
passed 43/44: its Tonight row check assumed every row fit fully on screen despite
allowing internal scrolling. It now validates containment in a named, reachable
scroll region and keeps page-overflow checks; the corrected full gate passed
44/44. A final local-status-role correction was followed by the final gates above.

Eight screenshots cover all four views at 360/1240px; responsive checks also
cover 640/900px and CSS enlargement. Evidence/manual checklist:
logs/phase4/ACCEPTANCE.md and logs/phase4/screenshots/. Phase 4 implementation is
complete locally. A11Y-001 remains open for actual screen-reader/native browser
zoom acceptance; automated evidence does not claim that acceptance. A11Y-002 is
resolved locally. Existing diagnostic-printing/server-refusal findings remain
open. No staging, commit, branch change, release tag or deployment was performed.

## Unreleased — Selection-agent handoff integrated, October 6, 2026

Reviewed logs/target-selection-continuity/REPORT.md and its final browser
transcript. The implementation and six checks were already in the shared working
tree and included in subsequent primary-agent gates; no patch replay or branch
change was needed. Added missing decision/design guidance and recorded the two
unresolved focusability/diagnostic-printing findings. Updated Phase 4 status to
reflect the completed selection, sorting and time-slider naming work.

The agent's historical receipt records 268 pytest passes and one optional skip,
JavaScript guards OK and a final 39/39 browser gate. Its app token142 is
historical; current token145 is preserved. Handoff verification on the current
tree: selection browser checks 6/6 passed; token self-test and guard passed;
diff whitespace check passed. Only documentation changed during integration,
so the latest full product validation below remains applicable. No follow-up
behavior fixes, staging, commit, tag or deployment were performed.

Additional quick verification requested by the owner: 31 focused browser-gate
registration/UI invariant tests passed; JavaScript integrity checks passed for
42 modules (no broken imports or syntax errors), with DOM, encoding, catalog,
provenance, token and core guards OK. Development release preflight returned
0 errors and the expected v0.6.36-dirty warning. The 20 heuristic possible-
undefined candidates are unchanged advisory output, not failed checks. This
quick pass does not replace the full validation or close the recorded follow-ups.

## Unreleased — Catalog sorting and time-slider accessibility, October 6, 2026

Removed the visible Popularity sorting option. Catalog now defaults to Name
ascending and returns to that order when filters are cleared. Internal ranking
and Standard 200 membership are unchanged. The upper time slider has the
accessible name "Selected observing time" and exposes the displayed site clock
through aria-valuetext, including after keyboard changes. App token is145;
entry-point references, register and token baseline are aligned.

Validation: focused UI invariants 24 passed; focused slider and accessibility
browser checks each passed 1/1. Full pytest: 270 passed, 1 existing optional
skip (88.19 seconds). JavaScript/import/DOM/cache/catalog/provenance/core/encoding
guards passed. Development release preflight returned 0 errors with the truthful
v0.6.36-dirty warning.

The full browser gate passed 37/39. A saved-target check assumed M31 was the
first row; corrected its assertion to address M31 explicitly under Name sorting,
and its focused rerun passed 1/1. The single-notification check encountered the
previously recorded local test-server ERR_CONNECTION_REFUSED; its focused rerun
passed 1/1. All 39 cases passed across the full run and those targeted reruns,
without claiming a clean full browser run or resolving BROWSER-LOCAL-001.
Diff whitespace check passed. No commit, tag or deployment was performed.
Broader accessibility work remains outside these two requested fixes.

## Unreleased — Wikipedia-only object photos and brief docs review, October 6, 2026

Removed all 81 legacy object JPEGs (7,562,979 bytes), the bundled attribution
manifest and its obsolete generator. Opening details now loads from the existing
Wikipedia/browser Blob cache directly, without a local-file request first.
Author/license metadata and the exact image file link remain associated with
cached bytes. Missing/transient photos retain the readable placeholder and
retry behavior. Existing cached photos are preserved. The general Image credits
page remains, with online-source guidance instead of the retired inventory.
The asynchronous article link now also checks the active object/open inspector.
App cache token is144 and imagecredits token2; guards/baseline are aligned.

Updated About, Privacy, NOTICE and current architecture/backlog/roadmap guidance.
IMAGE-001 is resolved by removal, without claiming historical usage rights were
verified. Fixed stale HOST-001/Phase 3 and selection-status references, plus an
obsolete desktop FITS grouping reference in DESIGN. Brief review confirms two
existing Phase 4 oddities remain: visible Popularity sorting and the upper time
slider's missing accessible name. No deeper review or unrelated planner fix.

Validation: focused source/image/wiring checks 12 passed; photo browser checks
3/3 passed; full pytest 270 passed, 1 existing optional skip (89.48 seconds).
JavaScript/import/DOM/cache/catalog/provenance/core/encoding guards passed;
development release preflight returned 0 errors with the truthful dirty warning.
The full browser gate passed 38/39 checks; its keyboard close-modes check timed
out waiting for the retired bundled-photo credit link. Replaced that fixture
with controlled Wikipedia image/metadata responses; the focused rerun passed
1/1, preserving its focus-trap/restoration assertions. All 39 cases passed across
the full run and that corrected-fixture rerun. The initial focused photo check
also caught hidden docked placeholders; explicit visibility fixed it before the
final photo/full gates. Diff whitespace check passed.

No commit, tag or deployment was performed. Production copies of obsolete photos
still require removal during an authorized deployment; upload-only cannot delete
them. That cleanup is recorded in Phase 6.

## Unreleased — Owner-confirmed hosting logs, October 6, 2026

Closed HOST-001 for the website configuration confirmed by the owner: daily
rotation, seven retained archives, compression enabled, no email forwarding,
and full IP addresses without anonymization. Privacy documents these settings
alongside the active log and distinguishes separate provider records, without
claiming an exact seven-day deletion deadline. Hosting changes were made by the
owner. Image verification remains open; Phase 3 is complete locally.

Validation: full pytest 270 passed, 1 existing optional skip (78.74 seconds);
public browser checks 2/2 passed; development release preflight 0 errors with
the expected dirty-version warning; diff whitespace check passed. No tag or
deployment was made.

## Unreleased — Public credits wording, October 6, 2026

At the owner's request, removed the popularity-source acknowledgement from About and
NOTICE and its name from the Privacy catalog-request explanation. About now
credits online photos through Wikipedia/Wikimedia and their original creators,
with a simple Image credits link. Individual author/source/license information
and accurate bundled-photo credits remain; catalog data and internal provenance
are unchanged. No image permission or verification status is newly claimed.

Validation: full pytest 270 passed, 1 existing optional skip (81.01 seconds);
final public browser checks 2/2 passed; development release preflight 0 errors
with the expected dirty-version warning; diff whitespace check passed. No
deployment or release tag was made.

## Unreleased — Independent website public history reset, October 6, 2026

After approving the public design, the owner requested a fresh version series
for each independent product. Changes (landing/download.html) and its JSON now
contain only one website 0.1.0 entry, without the former archive. The approved
design remains unchanged. PUBLIC_RELEASES explicitly defines public membership;
regeneration cannot bring back inherited tag history. Legacy summaries remain
internal release-guard evidence and older records remain available in Git.
Current guidance supersedes the public history preservation described below.
No tag, deployment, catalog change or guessed clean version stamp was made.

Validation: focused source/release checks 40 passed; full pytest 270 passed,
1 existing optional snapshot skip (87.14 seconds); full browser gate 39/39 passed,
including static/no-JavaScript history and responsive public pages. Generator
freshness and git diff --check passed. Development release preflight returned
0 errors with the expected truthful v0.6.36-dirty warning. Initial restricted
full runs were interrupted after slow progress; the completed runs used the
documented Windows process-pipe access. Browser server connection-reset messages
did not produce failed checks. Desktop/phone captures were visually inspected
and saved under logs/website-history-reset/.

## Unreleased — Website overhaul Phase 3, October 6, 2026

Implemented the owner-approved sky-map public design locally on the existing
codex/website-phase-two checkout. No deployment, release tag or catalog change.
The separate selection task's files are preserved; Phase 3 does not author its
planner behavior. App token142 resolves a detected cache pairing mismatch in
those existing changes before integrated validation.

All six public pages have a compact plain wordmark, concise introductions,
canonical Workbench colors and a decorative vector sky-map hero. Panorama setup
and calculated visibility lead; the early screenshot-heavy concept was replaced
by the sparse style approved by the owner. No public JavaScript or bundler was
added. Native phone navigation and expandable secondary sections work without
JavaScript. Full privacy/source information and the 46 pre-split release records
remain accessible. Optional first-night guidance is inside Features, not an
exposed Home guide. Shared theme roles are loaded from /astro/themes.css?v=16;
public CSS overrides layout without duplicating the palette or changing planner
styles. Obsolete layered glass/starfield CSS is removed.

The local preview mounts landing/ at / and web/ at /astro/, matching deployment
addresses. Canonical/page-specific metadata and a 1200x630 share preview captured
from the actual implemented Home are included. Public cache references are
style.css?v=3, sky-map.svg?v=1 and social-preview.png?v=1. Core, catalog data,
planner image bytes and image-attribution records are unchanged by Phase 3.

Validation:
- Full pytest: 268 passed, 1 existing optional local snapshot skip; 82.04 seconds.
- Full browser gate: 39/39 passed, exit 0, including six selection-task checks.
- Public acceptance covers all six pages, 360px/640px layouts, expanded content,
  enlarged content via CSS zoom, keyboard phone menus/disclosures, disabled
  JavaScript, at least 4.5:1 base/action text contrast, shared theme/map/share
  resources and static release history. CSS zoom is not a manual native-browser
  zoom or screen-reader acceptance claim; A11Y-001 remains separate.
- Focused history/catalog/browser wiring: 24 passed. Public link, real PNG size
  and preview mount isolation checks: 3 passed.
- JavaScript/import/DOM/cache/core/catalog/provenance/encoding guards: passed.
  The first guard run detected the existing app141 bytes/token mismatch; the
  entry reference moved to142, then bump_web_tokens/check_js_tokens --update
  verified the baseline. No guard was bypassed.
- Static history freshness and git diff --check: passed. Initial Windows output
  writes failed with Errno22 using absolute paths; generator destinations now use
  workspace-relative paths when possible, and unchanged JSON is left untouched.
- Development release preflight (--allow-dirty --no-stage): 0 errors, with the
  expected truthful v0.6.36-dirty warning. No publication artifacts were staged.
- Captured all six public pages at 1366x900 and 360x800. Visual review confirms
  the approved open layout, compact controls and readable decorative treatment.

Local preview: python scripts/preview_site.py --port 8081. Evidence and captures:
logs/website-phase3-implementation/. Public publication dependencies HOST-001
(log retention) and IMAGE-001 (historical photo rights) remain open. The past
intermittent browser startup diagnostic is not declared fixed from this pass.
Phase 3 is complete locally; Phases 4–6 remain the next full roadmap phases.

## Unreleased — Website overhaul Phase 2, October 6, 2026

Implemented locally on codex/website-phase-two, retaining the Phase 1 changes.
No new commit/tag, public deployment or catalog repository change was performed.

Home, Features, About, Privacy and Imprint now describe the independent browser
planner, local saved planning data, loaded-tab offline limits, optional automatic
weather, coordinates/timezone requests and external photo/credit services. The
owner confirmed ZAP-Hosting and no CDN. Existing operator contact is retained;
help uses that route and the source repository remains private. The planner's
About/footer copy is consistent and no longer describes a combined browser port.

Changes keeps its existing route and has generated static notes with native
keyboard disclosures. The two website versions have distinct concise summaries;
all 46 pre-split records are preserved exactly against Git HEAD. There is no
runtime release-data fetch or loading-only no-JavaScript state. The generator
--check validates both JSON and HTML; empty data has an explicit generated state.

Per-image credits identify all 81 exact bundled JPEG hashes. Embedded evidence
identifies DSS2/CDS sources for 44; the other 37 have explicit verification-pending
records. Runtime Wikimedia thumbnails retain their exact file page and available
plain-text author/license metadata with newly cached bytes. Older uncredited
cache records remain unknown. Detailed credits are in the existing source
section so the compact inspector stays compact. Both CSP carriers also allow
the authentic thumb.wikimedia.org host narrowly. New credits use Workbench roles.

Validation:
- Final full pytest: 264 passed, 1 existing optional local popularity-snapshot
  skip; 76.50 seconds. Initial catalog-copy checks exposed the intentionally
  removed duplicate footer claim; the advertised-count register was corrected,
  preserving value checks and their mutation proof.
- JavaScript/import/DOM-ID/encoding/catalog/cache/core guards: passed. Advisory
  undefined-symbol candidates remain informational, including injected fetcher.
- Focused Phase 2 tests: 26 passed; focused final count/credit/UI checks: 38 passed.
- Focused landing browser acceptance: 2/2 passed (all six pages, disabled
  JavaScript, failed JSON tripwires, keyboard disclosures and 360px layout).
- Focused final photo checks: 3/3 passed; compact-inspector check: 1/1 passed.
- Final full browser acceptance: 32/32 passed, exit 0. All registered checks ran
  in one browser/server sequence with no failed-check suppression or skips.
  Failure artifacts now include failed-request URLs to aid future diagnosis.
- Static-history generation check and git diff --check: passed.
- Development source preflight (--allow-dirty --no-stage): 0 errors; expected
  v0.6.36-dirty warning remains. No release artifacts were staged for publication.
- App token140, imagecredits token1, attribution JSON request token1 and public
  stylesheet token2; core/astronomy and catalog source data unchanged in Phase 2.

An initial full browser run exposed overly tall inline image credits; moving
these into the existing source disclosure fixed it. The cached-credit check now
reads through that disclosure. Two later full attempts had a local startup
ERR_CONNECTION_REFUSED before the application booted; that check passed in
isolation. After adding request-failure diagnostics, the final full run passed
32/32. Earlier failed attempts are retained in logs/browser/artifacts and were
not counted as passes or skips. No root cause is confirmed and no startup fix
is claimed; intermittent local infrastructure behavior is BROWSER-LOCAL-001.
One server-side connection reset during context teardown did not cause a
browser-check failure in the final run.

Publication checks remain HOST-001 (log retention) and IMAGE-001 (37 incomplete
source/rights records and applicable DSS survey acknowledgment/rights). Missing
rights have not been asserted or invented. Phase 3 redesign remains unimplemented.

## Unreleased — Website overhaul Phase 1, October 5, 2026

Implemented locally on codex/website-phase-one; no new tag or public deployment.
Shared scoring now bounds half-open observing cells at dawn, prorates partial
cells and selects longest runs by actual duration. Tonight, Catalog, Sky View
and target details use the shared endpoints/durations; chart context no longer
produces an independent detail interval. Dawn is excluded from selected-time
window membership. Grid anchors and astronomy calculations remain unchanged.

Both photo policy carriers permit Wikimedia byte fetches and blob-image display
without broadening script permissions. New strict browser checks verify bundled,
fresh and persisted cached decoding plus unavailable-provider retry recovery.
Browser failure artifacts now live under ignored logs/browser/artifacts.

Validation:
- Full pytest: 256 passed, 1 existing optional popularity-snapshot skip,
  85.18 seconds. No launch failure counted as a skip.
- Full planner browser gate: 30/30 passed, including the Berlin cross-view
  regression and three decoded-photo checks.
- Focused integration: 95 passed, including published reference anchors,
  historical scoring parity, boundary and scoring-coefficient mutations.
- JavaScript/import/encoding/catalog/token/core checks: passed. Existing advisory
  undefined-symbol candidates remain informational; parser/import guards pass.
- Development release preflight (--allow-dirty --no-stage): 0 errors; the
  expected v0.6.36-dirty warning remains. Newly baked core files are registered
  with Git for review; no release staging, commit, tag or upload was performed.
- Frozen scoring fixtures are unchanged. The historical terminal-cell overcount
  is independently reconciled in parity tests, with original score tolerances.
- Core regenerated to 204c232bf69db731, token45; retained predecessor
  d98ff03023ceb3cf. App token138; dependency tokens/register aligned.

An early interval browser attempt raced boot's date-listener installation; its
failure reporting also hit Windows console encoding. The helper now waits for
initialized controls and the requested rendered date; rerun/full gate uses UTF-8
and passes. This was test setup, not an application date defect.

Phases 2–6, including public content/redesign and deployment, remain pending.


## Local 0.6.36 release preparation - October 5, 2026

Final full suite after the checkout fix: 253 passed, one optional local snapshot
provenance skip, no failures (99.59 seconds). All 35 focused seed/provenance,
release and curation checks passed. The website browser gate passed 26/26 in
this pass; the subsequent fix changes checkout attributes, not browser behavior.

The first locally tagged 0.6.35 staging attempt stopped at the provenance guard:
Git's Windows line-ending conversion changed the source sidecar after switching
branches, making it differ from the hash-paired web sidecar. A fresh-checkout
regression reproduced the failure. .gitattributes now preserves exact bytes for
the source provenance JSON and web catalog JSON payloads; the regression restores
committed files with core.autocrlf=true and passes. Catalog payload/provenance
content, hashes, cache tokens and astronomy fixtures were not changed.

The original v0.6.35 tag is preserved and was not pushed or publicly deployed.
The corrected candidate uses a new 0.6.36 entry prepared before its release
commit/tag. Final tagged staging and fresh-checkout outcomes are captured in
ignored logs/repository-split/web-0.6.36-readiness-20261005.json. No public website
publication is authorized or claimed by this local preparation.


## Local 0.6.35 release preparation - October 5, 2026

Fresh full suite: 252 passed, one optional local popularity-snapshot provenance
check skipped because the ignored snapshot is absent (123.96 seconds). No test
failures. The full website browser gate passed 26/26. After correcting the
website-only curated summary, all 23 release tests and seven pre-tag/curation
tests passed. The development release integrity gate passed with zero errors
and the expected dirty/off-tag warning before staging. Logs are under
logs/repository-split/*-20261005.log.

The pending 0.6.35 summary no longer advertises the removed combined Windows
application. Its landing changelog entry is prepared before tagging, so normal
post-tag generation can remain byte-identical. The deferred status-report work
is saved in IMPLEMENTATION_PLAN.md; unresolved acceptance/elevation issues remain
open. RELEASE_WORKFLOW.md records local integration, staging and the separate
publication step. These results do not claim public deployment.


## Repository separation — October 1, 2026

The current codex/direction-b-ui desktop snapshot was extracted to the
independent Nightseam-catalog repository with VERSION 0.1.0. The original
Nightseam-programm repository now owns only the website. The catalog keeps the
same branch name with independent history and no remote; prior combined Git
branches/tags and staged/working changes are saved in ignored recovery bundles
and patches. Desktop source removed from the website has both a committed
extraction snapshot and hash-verified pre-partition recovery copies.

Source data/, packaged dist/data/, the existing executable and build environment
were moved with byte verification. Configured external exposure archives were
not altered. Website catalog generation now uses project-owned neutral data
without an application database, retaining the exact committed payload bytes.
Core baking, guards, tests, browser registration and releases are scoped to
each project; website version history is unchanged. No remote push, upload or
public deployment was performed.

Validation completed October 2, 2026:
- Initial full website pytest run: 249 passed, one optional local-snapshot
  provenance skip, one missing documentation token-register assertion. The
  register was restored from current source and that assertion passed on its
  targeted rerun. The two added seed-tracking/privacy checks and all 23 web
  release checks also passed together (25 checks). No test assertion was
  weakened to conceal the documentation failure.
- Complete website browser gate: 26/26 passed, with the web suite unchanged.
- Final JS/import/DOM/syntax/encoding/core/cache guards passed. The independent
  development release gate reported zero errors; off-tag/generated-version
  warnings are expected before the final local commit/version stamp.
- Seed CSVs preserve exact original bytes and literal search-field whitespace.
  Root-only /data/ ignore rules protect user stores while neutral shipped seeds
  remain tracked; the release guard refuses missing/untracked build inputs.

Receipts from the former combined desktop/web project, before the October 1,
2026 split, are archived in [docs/history/RELEASES_COMBINED_PROJECT.md](docs/history/RELEASES_COMBINED_PROJECT.md).
