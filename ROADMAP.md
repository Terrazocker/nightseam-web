# Roadmap

Where NightSeam Web stands and what comes next. Open defects are in
[BUGS.md](BUGS.md); validation receipts in [RELEASES.md](RELEASES.md).

## Status

- **Published:** v0.1.1 (October 8, 2026), after v0.1.0 (October 7).
- **Next release: 0.7.0.** Release names continue above the inherited tags,
  which occupy 0.1.5 through 0.6.36 ([DECISIONS.md](DECISIONS.md)).
- **On master, unreleased:** the rebuilt horizon editor (skyline on a compass
  grid, overhangs, file import/export) with phone sensor capture instead of
  photos (pull request #8, merged October 16: camera view with an AR overlay,
  north from the compass, Moon, Sun or a landmark, loop closure, share links),
  the coming-night detail card, USNO-anchored twilight checks, timezone
  validation, the October review fixes and a CI workflow.

## Before 0.7.0

1. Owner acceptance of the phone capture: the *Phone capture* section of
   [HORIZON_ACCEPTANCE.md](docs/acceptance/HORIZON_ACCEPTANCE.md), including
   the overlay-lag fix (BUGS.md). The sensor capture was merged before this
   acceptance, so master no longer has the photo editor.
2. New landing copy: the landing pages still describe panoramas and photos
   (features, privacy and about pages, `og:image:alt`), which master no
   longer has.
3. Revise the drafted 0.7.0 summary (`CURATED` in scripts/build_changelog.py)
   and add its dated `PUBLIC_RELEASES` record, then follow
   [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md): pre-tag check, tag, clean stage,
   publication candidate and separately authorized deployment.

## Open work

- **Horizon sensor capture** ([plan](docs/horizon/HORIZON_SENSOR_CAPTURE_PLAN.md)):
  capture the skyline with the phone's camera view and sensors, remove photo
  placement, and move horizons between devices with a share link. Phase 0
  (sensor probe) passed; phases 1-4 (photos removed, camera capture with an
  AR overlay, north references and loop closure, share link) are merged
  (pull request #8, October 16); the overlay lag is measured and fixed
  (awaiting the owner's check) and the owner acceptance checklist (phase 5)
  is written for the owner to run.
- **Horizon rebuild** ([plan](docs/horizon/HORIZON_REBUILD_PLAN.md)): phases
  1-6 are merged (pull request #2). Its photo parts are replaced by the
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
- **Offline reopening.** Today a loaded tab keeps planning offline, but
  reopening offline is not guaranteed. Supporting it needs a service worker
  with an update policy, complete asset/catalog pairing and storage limits.

## History

Completed plans, reviews and the previous backlog documents are kept in
[docs/history/](docs/history/README.md).
