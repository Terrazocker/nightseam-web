# Roadmap

Where NightSeam Web stands and what comes next. Open defects are in
[BUGS.md](BUGS.md); validation receipts in [RELEASES.md](RELEASES.md).

## Status

- **Published:** v0.7.0 (October 19, 2026), after v0.1.1 (October 8) and
  v0.1.0 (October 7). Next release names continue above 0.7.0.
- **In 0.7.0:** the rebuilt horizon editor
  (skyline on a compass grid, overhangs, file import/export) with phone
  sensor capture instead of photos (camera view with an AR overlay, north
  from the compass, the Moon or a landmark, loop closure, share links), the
  coming-night detail card, USNO-anchored twilight checks, timezone
  validation, the October review fixes and a CI workflow. Release names
  continue above the inherited tags, which occupy 0.1.5 through 0.6.36
  ([DECISIONS.md](DECISIONS.md)).
- **Still open after 0.7.0:** owner acceptance of the phone capture, the
  *Phone capture* section of
  [HORIZON_ACCEPTANCE.md](docs/acceptance/HORIZON_ACCEPTANCE.md), including
  the overlay calibration (BUGS.md). The owner chose to release 0.7.0 before
  it (October 19).

## Open work

- **Phone layout and night vision** (October 20, unreleased): the planner's
  own phone layout (bottom tab bar, pinned time slider, setup sheet, two-line
  rows, bottom-sheet details, pinch zoom) and the red night-vision display
  (DESIGN.md, "Phone layout"). Checked in headless Chrome at phone sizes;
  still to be tried by the owner on a real phone, at night, including
  installing it to the home screen and reopening it offline (`web/sw.js`,
  DECISIONS.md 2026-10-20):
  [PHONE_ACCEPTANCE.md](docs/acceptance/PHONE_ACCEPTANCE.md).

- **Horizon sensor capture** ([plan](docs/horizon/HORIZON_SENSOR_CAPTURE_PLAN.md)):
  capture the skyline with the phone's camera view and sensors, remove photo
  placement, and move horizons between devices with a share link. Phase 0
  (sensor probe) passed; phases 1-4 (photos removed, camera capture with an
  AR overlay, north references and loop closure, share link) are merged
  (October 16). The overlay aims with the orientation the
  camera image shows; its scale is measured still by a once-per-phone
  calibration routine (58 deg on the owner's Pixel 7a, October 18), and
  which delay is right is still open (BUGS.md). The owner acceptance
  checklist (phase 5) is written for the owner to run.
- **Horizon pairing** ([plan](docs/horizon/HORIZON_PAIRING_PLAN.md)): the
  desktop shows a QR code, the phone scans it with its camera app, captures,
  and the horizon arrives on the desktop through an end-to-end-encrypted
  relay on nightseam.de (`web/relay.php`) that holds a box for at most 10
  minutes (DECISIONS.md, 2026-10-19). Built and tested on branch
  `horizon-pairing-plan` (October 19): relay, transport, desktop dialog,
  phone banner, publication rule, docs and privacy text. On October 22,
  merged with `main` (PR 5), the hosting probe passed under "served by
  Apache", the owner reviewed the `web/.htaccess` relay section, and the
  branch was published to the test site dev.nightseam.de (RELEASES.md). Not
  on the live site. Next: the *Pairing* acceptance checks with a real phone
  on dev.nightseam.de, then merging PR 5, the live handler switch and a
  release. Short codes and a live mirror are later, separate decisions.
- **Horizon rebuild** ([plan](docs/horizon/HORIZON_REBUILD_PLAN.md)): phases
  1-6 are merged (October 12). Its photo parts are replaced by the
  sensor capture; the skyline model, overhangs and file import/export stay.
  Possible later: several openings per direction. The earlier P3-P7 plan is
  retired ([history](docs/history/HORIZON_GEOGRAPHIC_CALIBRATION_PLAN.md)).

## Proposals (not approved)

These are scoped ideas, not commitments. Each needs an owner decision before
any new external request, CSP entry or formula is added.

- **Planets, then selected comets/asteroids.** Start with the seven planets,
  kept apart from fixed deep-sky catalog IDs. JPL Horizons is the proposed
  reference; agree accuracy targets, local vs. online computation, coordinate
  sharing and cache freshness first. Expired ephemerides must show as
  unavailable, never extrapolate.
- **Seeing.** Cloud, wind and humidity are weather, not seeing. A seeing
  forecast needs a named provider with a supported API, terms and stated
  accuracy; it would stay opt-in and never block planning.

## History

Completed plans, reviews and the previous backlog documents are kept in
[docs/history/](docs/history/README.md).
