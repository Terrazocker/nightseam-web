# Open findings

Confirmed, unresolved defects and limitations of NightSeam Web. Planned
features live in [ROADMAP.md](ROADMAP.md); validation receipts in
[RELEASES.md](RELEASES.md). Dated findings and how they were resolved are
archived in [docs/history/BUGS_LOG.md](docs/history/BUGS_LOG.md). Remove an
entry here when it is fixed and record the fix in RELEASES.md.

## Needs the owner

- **Horizon real-photo acceptance.** Real panoramas and phone photos with
  known directions, touch/pen input and physical devices for the rebuilt
  editor: [docs/acceptance/HORIZON_ACCEPTANCE.md](docs/acceptance/HORIZON_ACCEPTANCE.md).
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

## Monitoring

- **BROWSER-LOCAL-001.** The local test server's connection queue was raised
  from 5 to 64 after refused module loads; failures are recorded with server
  thread health and failed URLs, never retried or skipped.
- **BROWSER-CI-002.** Two horizon checks at 360 px failed once on Linux CI
  (run 38444781285) and passed on rerun: the phone overflow assertion in
  web-followup-smooth-scrub-and-horizon-scroll and the file-chooser wait in
  web-phase4-responsive-planner. Not reproduced locally, with or without the
  Linux font substitution. If either fails again, treat it as a real defect.
