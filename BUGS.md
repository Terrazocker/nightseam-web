# Open findings

Confirmed, unresolved defects and limitations of NightSeam Web. Planned
features live in [ROADMAP.md](ROADMAP.md); validation receipts in
[RELEASES.md](RELEASES.md). Dated findings and how they were resolved are
archived in [docs/history/BUGS_LOG.md](docs/history/BUGS_LOG.md). Remove an
entry here when it is fixed and record the fix in RELEASES.md.

## Needs the owner

- **A11Y-001 — human accessibility acceptance.** A screen-reader and native
  browser-zoom pass is still outstanding; automated keyboard, contrast and
  responsive checks do not replace it. Steps:
  [docs/acceptance/ACCESSIBILITY_ACCEPTANCE.md](docs/acceptance/ACCESSIBILITY_ACCEPTANCE.md).
- **Horizon real-photo acceptance.** Real panoramas and phone photos with
  known directions, touch/pen input and physical devices for the rebuilt
  editor: [docs/acceptance/HORIZON_ACCEPTANCE.md](docs/acceptance/HORIZON_ACCEPTANCE.md).
- **HOST-DELIVERY-001 — compression.** Live HTML/JS and the two large catalog
  JSON payloads are served without gzip. Enable it through the provider's
  controls and measure real responses ([HOSTING_CONFIGURATION.md](HOSTING_CONFIGURATION.md)).
- **Landing server headers (approved, not live).** `landing/.htaccess` now
  sets the pages' CSP with `frame-ancestors 'none'`, `nosniff` and the
  referrer policy (owner approval 2026-10-13). Close this after the next
  deployment once the live response headers for `/` show all three.
- **Legal pages: deferred by the owner (2026-10-11).** Not release work and
  not to be raised again unless the owner asks. For reference only: the
  Impressum names a pseudonym without a postal address, and the privacy page
  lacks GDPR Art. 13 items.

## Known limitations

- **Horizon model.** One open interval per direction (above the skyline,
  below any overhang edge): sky seen through gaps above an obstruction, such
  as between branches, cannot be recorded.
- **Phone compass.** Readings are only as good as the phone's compass (often
  5-10 deg off near metal or buildings); the landmark correction lasts until
  the page reloads.
- **Photo mapping.** Pixels are treated as square degrees. That is exact for
  equirectangular panoramas and approximate for ordinary photos, increasingly
  towards their edges (about 1 deg at the edge of a 60 deg photo). No fisheye
  or lens correction; full panoramas cannot be rolled, so a tilted 360 deg
  panorama must be levelled in the panorama app.
- **Skyline detection** needs a daylight photo with clear sky. Bright walls,
  clouds, wires and thin branches can pull the line; it is a draft to correct.
- **Twilight scan.** The 10-minute scan skips a night with under ten minutes of
  darkness at a level (two such nights in the 2026 reference tables), and above
  about 84.5 deg latitude pickDarkWindow can pair an astronomical dusk with a
  nautical dawn on the single transition night.
- **Thumbnail cache.** No size limit or eviction; quota errors are ignored.

## Monitoring

- **BROWSER-LOCAL-001.** The local test server's connection queue was raised
  from 5 to 64 after refused module loads; failures are recorded with server
  thread health and failed URLs, never retried or skipped.
- **BROWSER-CI-002.** Two horizon checks at 360 px failed once on Linux CI
  (run 38444781285) and passed on rerun: the phone overflow assertion in
  web-followup-smooth-scrub-and-horizon-scroll and the file-chooser wait in
  web-phase4-responsive-planner. Not reproduced locally, with or without the
  Linux font substitution. If either fails again, treat it as a real defect.
