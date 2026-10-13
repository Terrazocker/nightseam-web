# Roadmap

Where NightSeam Web stands and what comes next. Open defects are in
[BUGS.md](BUGS.md); validation receipts in [RELEASES.md](RELEASES.md).

## Status

- **Published:** v0.1.1 (October 8, 2026), after v0.1.0 (October 7).
- **Next release: 0.7.0.** Release names continue above the inherited tags,
  which occupy 0.1.5 through 0.6.36 ([DECISIONS.md](DECISIONS.md)).
- **On master, unreleased:** the rebuilt horizon editor (skyline on a compass
  grid, photo underlay, skyline detection, overhangs, phone compass, north
  from the Sun), the coming-night detail card, USNO-anchored twilight checks,
  timezone validation, the October review fixes and a CI workflow.

## Before 0.7.0

1. Owner decision: run the horizon real-photo acceptance first
   ([checklist](docs/acceptance/HORIZON_ACCEPTANCE.md)) or release
   with it still open.
2. Curate the 0.7.0 changelog entry, then follow
   [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md): pre-tag check, tag, clean stage,
   publication candidate and separately authorized deployment.

## Open work

- **Horizon rebuild** ([plan](docs/horizon/HORIZON_REBUILD_PLAN.md)): phases
  1-6 are merged (pull request #2) and await the owner's
  [acceptance](docs/acceptance/HORIZON_ACCEPTANCE.md). Possible next:
  several openings per direction. The earlier P3-P7 plan is retired
  ([history](docs/history/HORIZON_GEOGRAPHIC_CALIBRATION_PLAN.md)).
- **Owner gates:** A11Y-001 accessibility acceptance and HOST-DELIVERY-001
  compression ([BUGS.md](BUGS.md)).

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
