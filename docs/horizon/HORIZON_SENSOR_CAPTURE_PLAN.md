# Horizon sensor capture plan

Created October 15, 2026. The owner approved this direction in conversation
after testing the photo editor on a Pixel 7a: calibrating photos was too
fiddly (width, tilt and roll found by trial and error before north means
anything), and the earlier map-landmark calibration (pull request #7) did not
work well. Instead of placing photos, the phone measures the skyline
directly. It replaces the photo parts of the
[rebuild plan](HORIZON_REBUILD_PLAN.md); the skyline model, overhangs, the
points form and file import/export stay.

Status: phases 0-4 and the AR overlay (2b) done on October 15
(RELEASES.md); phase 5 (acceptance) remains, with the overlay's lag open. The owner was offered server-stored shortcodes
and chose the share link only.
Work stays on branch `horizon-sensor-plan` (pull request #8) until the
capture works. Phase 0 on the
Pixel 7a the gyroscope-based relative orientation does not drift at rest,
repeats 0.13 deg between two features and closed two carefully aimed full
turns within 1.3 deg before any correction; the compass wanders 6-8 deg at
rest. Gate passed. Sensor API: RelativeOrientationSensor (quaternions,
steady 60 Hz), with `deviceorientation` as the fallback. Not yet measured:
accuracy part-way round a sweep (the landmark check in phase 5) and the
camera axis's altitude bias (the Moon check in phase 3).

## Owner decisions

- Photos are removed from the horizon editor: photo placement, Align mode,
  skyline detection, north from a landmark, north from the Sun and every
  calibration field go.
- A horizon is captured with the phone: a live camera view with a crosshair
  that the user moves along treetops, roofs and edges.
- Only azimuth/altitude points are stored, like a N.I.N.A. horizon file
  (`# Az Alt`, one pair per line). The location comes from the site.
- A horizon reaches another device as a share link that carries the points.
  No server storage for now; a short typed code is reconsidered only if links
  prove clumsy (it would need a server-side store, a hosting review and new
  privacy text).

## Why the photo approach was inaccurate

Measured against a pinhole camera model (scratch calculation, not a test):
the current linear "square degrees" mapping is off by up to 2.4 deg for a
level 65 deg phone photo, 6.3 deg tilted up 15 deg and 12.6 deg tilted up
30 deg. Phone panorama strips open as 60 deg ordinary photos. Each tool
solves at most two of the four placement numbers. Fixing all of this needs
camera models and a fit, which is the complexity the October 11 rebuild
removed. Measuring directions directly avoids the whole problem.

## Model

```
{ id, name,
  points: [{ az, alt }, ...],      // unchanged: world azimuth/altitude, sorted by az
  overhangs: [[{ az, alt }, ...]] } // unchanged
```

- `photo` and `hasPhoto` are removed. Points stay the only source of truth;
  the 720-bin profile is derived as today.
- Nothing about the capture (sensor readings, references, residuals) is
  stored. A capture that is not finished is not saved.

## Sensors: one job each

| Quantity | Source | Expected accuracy |
|---|---|---|
| Altitude (up/down) | Gravity (accelerometer) | about 1 deg |
| Shape of the sweep (turning left/right) | Gyroscope: relative orientation, no magnetometer | small drift, removed by closing the loop |
| North (one offset for the whole capture) | A reference, best first: Moon or Sun, a landmark with a known bearing, the compass averaged over a few seconds | Moon/Sun about 0.5 deg; compass 5-10 deg |

- Today's compass mode follows the magnetometer the whole time
  (`web/horizon.js`, prefers `deviceorientationabsolute`); that is the main
  source of jumps and the 5-10 deg error. Capture uses relative orientation
  for the trace and applies north once.
- **Moon/Sun reference.** The user puts the crosshair on the Moon (or the Sun
  on screen, never by eye) and confirms. The core already computes their
  apparent azimuth/altitude for the site and instant, so this sets north and
  also measures any altitude bias of the camera axis. The capture says which
  reference was used and how far apart two references are, if more than one
  was taken.
- **Closing the loop.** A sweep ends back on its starting feature. The yaw
  difference at the closing point is the gyroscope drift; it is spread over
  the sweep in proportion to the angle turned so far, not to time: phase 0
  showed no drift at rest, so what remains comes with turning. The clean
  phase 0 turns closed within 1.3 deg, so most of a large closing error is
  the user's end aim; the capture should show the closing error and offer a
  redo when it is more than about 3 deg.
- **Screen orientation.** The pointing direction accounts for
  `screen.orientation.angle`; capture works in portrait and landscape.
- **Site check.** The phone's position (Geolocation, already used for new
  sites) is compared with the selected site; a capture far from it warns that
  the horizon only holds where it was measured. The threshold comes from the
  GPS accuracy measured in phase 0.

## Phases

**Phase 0 — sensor probe (Pixel 7a, nothing shipped).** A throwaway local
page, served only to the phone over `adb reverse`, logs: which orientation
events and Generic Sensor classes (`RelativeOrientationSensor`,
`AbsoluteOrientationSensor`) exist, their rates, yaw drift at rest over two
minutes and over a slow full turn, pitch stability, and Geolocation accuracy.
Exit: a written result in RELEASES.md and a choice of sensor API. If relative
yaw drifts more than about 2 deg per full sweep after loop closure, stop and
revisit the plan.

**Phase 1 — remove photos.** Delete photo placement, Align mode, detection,
landmark and Sun north, the photo fields, `nightseam-horizon-photos`
IndexedDB storage (cleared on first load), the EXIF reader and their tests.
Older backups restore their points and overhangs and ignore photos. Done
without a format bump: dropping optional fields is compatible, since a
format 11 reader already accepts records without a photo, so backups stay
format 11. Update DEVELOPMENT.md, DESIGN.md, AGENTS.md (the
"A photo is a tracing aid" rule), BUGS.md (photo and skyline-detection
limitations) and the acceptance checklist.

**Phase 2 — camera capture.** *Capture with phone* opens a full-screen camera
view (`getUserMedia`, rear camera; the video is never recorded, stored or
uploaded) with a crosshair and the live direction. Modes: trace skyline
(press and sweep, release to stop), add a single point, and trace an overhang
edge. Each finished stroke is one undo step and saves at once, as today. The
button is shown only where the camera and orientation sensors exist; desktop
keeps Draw, the points form and file import. Done: the button sits in a
*Phone capture* panel that replaces the old compass panel and starts open on
touch devices; elsewhere it says when there are no readings. Until phase 3,
north is the compass averaged once (2 s, phone near level); the old landmark
correction went with the compass panel.

**Phase 2b — AR overlay (owner request after the first Pixel test).** Draw
the recorded skyline, overhangs, the trace and the level horizon with compass
marks over the camera image. Done with an assumed 67 deg field of view; if the
overlay slides against the scene as the phone turns, the field of view needs
measuring per device (from the video's shift against the gyroscope while
turning, or one landmark at the screen edge). The same Pixel test found that
the compass did not start on the first open; its sources now restart while
north is missing and when a motion permission is granted.

**Phase 3 — north and loop closure.** Done: *North…* sets north from the
Moon, the Sun or a landmark bearing (works without a compass); a full turn
asks whether it ended where it began and closes the loop up to 3 deg of
drift; the site check warns only where location access is already granted.
Planned as follows. Reference step before or after the
sweep (Moon/Sun, landmark bearing, compass average), loop-closure drift
correction and the site check. The editor shows the reference used and the
remaining disagreement in degrees, in words as well as numbers.

**Phase 4 — share link.** *Share link* builds a link to `/astro/` whose
fragment (`#horizon=`) carries a versioned, compact encoding of name, points
and overhangs; the fragment is never sent to the server. On Android it opens the
system share sheet (Web Share), elsewhere it copies the link. Opening a link
validates the payload completely and asks before adding the horizon; nothing
is written silently, and a bad link changes nothing.

**Phase 5 — acceptance.** A new owner checklist replaces the real-photo
section of [HORIZON_ACCEPTANCE.md](../acceptance/HORIZON_ACCEPTANCE.md).

## Checks

- Core: pointing math from orientation quaternions or Euler angles in all four
  screen orientations; loop-closure correction on synthetic drifting sweeps;
  the north offset from a Moon/Sun aim against the core's own position;
  share-link encode/decode round trips, size limits and rejected payloads.
- Browser: capture flow with stubbed sensors and a stubbed camera; capture
  hidden without sensors; link import asks first and rolls back nothing
  because it wrote nothing; backup format 12 and older formats.
- Owner, on the Pixel 7a: capture the same skyline twice (profiles agree
  within 2 deg); re-aim at the Moon after a sweep (within 1 deg); a known
  landmark lands within 1 deg of its map bearing; the share link opens on the
  desktop with identical points; a desktop browser without sensors offers no
  capture.

## Open questions

- Sensor API choice and drift numbers: phase 0.
- Whether a Moon/Sun reference is enough on its own on nights without the
  Moon, or whether bright stars should become a reference later (they would
  need star positions in the core).
- iPhone: `DeviceOrientationEvent.requestPermission` and
  `webkitCompassHeading` paths exist today; iOS capture is tested only if an
  iPhone becomes available.
- Release order: whether 0.7.0 waits for phases 1-4 or ships the current photo
  editor first (see ROADMAP.md).
