# Open findings

Confirmed, unresolved defects and limitations of NightSeam Web. Planned
features live in [ROADMAP.md](ROADMAP.md); validation receipts in
[RELEASES.md](RELEASES.md). Dated findings and how they were resolved are
archived in [docs/history/BUGS_LOG.md](docs/history/BUGS_LOG.md). Remove an
entry here when it is fixed and record the fix in RELEASES.md.

## Needs the owner

- **Horizon device acceptance.** Touch/pen and keyboard checks of the
  editor on real devices:
  [HORIZON_ACCEPTANCE.md](docs/acceptance/HORIZON_ACCEPTANCE.md), including
  its *Phone capture* section (phase 5 of the
  [sensor capture plan](docs/horizon/HORIZON_SENSOR_CAPTURE_PLAN.md)).
- **Legal pages: deferred by the owner (2026-10-11).** Not release work and
  not to be raised again unless the owner asks. For reference only: the
  Impressum names a pseudonym without a postal address, and the privacy page
  lacks GDPR Art. 13 items.

## Known limitations

- **A11Y-001 — no human screen-reader pass (deferred by the owner,
  2026-10-13).** Automated checks cover keyboard control and focus, dialog
  isolation, accessible names, non-colour summaries, reduced motion and
  enlarged layouts; what a screen reader actually announces and native browser
  zoom are unverified. Steps, if someone qualified runs them later:
  [docs/acceptance/ACCESSIBILITY_ACCEPTANCE.md](docs/acceptance/ACCESSIBILITY_ACCEPTANCE.md).
- **Response headers do not reach page loads.** The host's nginx serves HTML,
  JS, CSS and the large catalog files directly on GET, without consulting
  `.htaccess`; only HEAD requests and some JSON reach Apache (measured
  2026-10-13). So `frame-ancestors`, `nosniff` and the header CSP from
  `web/.htaccess` and `landing/.htaccess` are not delivered with the pages;
  the meta CSP in every page is what browsers enforce. The provider exposes no
  nginx settings, so this stays until hosting changes.

- **Horizon model.** One open interval per direction (above the skyline,
  below any overhang edge): sky seen through gaps above an obstruction, such
  as between branches, cannot be recorded.
- **North in the phone capture.** Without a reference, north comes from
  the phone's compass, averaged once it settles: only as good as that compass
  (5-10 deg off near metal or buildings, measured on a Pixel 7a). *North…*
  sets it from the Moon, the Sun or a landmark instead. The Moon and Sun need
  the observing site to be where the phone is.
- **AR overlay lag (owner, Pixel 7a, 2026-10-15): fix awaiting the owner's
  check.** Measured: the camera image trails the gyroscope by about 210 ms and
  is scaled differently per axis. The capture now aims with the orientation
  the image shows and calibrates delay and scale per device; remove this
  entry once the owner confirms it on the phone.
- **Near-tangent twilight.** When the Sun turns within about 0.01 deg of a
  twilight level, the Sun model and the published tables can disagree on
  whether a spell of a few minutes happens at all (Tromso 2026-09-16: USNO
  lists 5 minutes of astronomical night; the model turns at -17.996 deg). The
  dark window then falls back to the next level for that night.

## Monitoring

- **BROWSER-LOCAL-001.** The local test server's connection queue was raised
  from 5 to 64 after refused module loads; failures are recorded with server
  thread health and failed URLs, never retried or skipped.
- **BROWSER-CI-002.** Two horizon checks at 360 px failed once on Linux CI
  (run 38444781285) and passed on rerun: the phone overflow assertion in
  web-followup-smooth-scrub-and-horizon-scroll and the file-chooser wait in
  web-phase4-responsive-planner. Not reproduced locally, with or without the
  Linux font substitution. If either fails again, treat it as a real defect.
