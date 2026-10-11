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
- **Horizon real-photo acceptance.** Measured photos with independent angular
  references, touch/pen input and physical devices:
  [docs/acceptance/HORIZON_PANORAMA_ACCEPTANCE.md](docs/acceptance/HORIZON_PANORAMA_ACCEPTANCE.md).
- **HOST-DELIVERY-001 — compression.** Live HTML/JS and the two large catalog
  JSON payloads are served without gzip. Enable it through the provider's
  controls and measure real responses ([HOSTING_CONFIGURATION.md](HOSTING_CONFIGURATION.md)).
- **Landing server headers.** The public pages carry a document CSP, but
  framing protection (`frame-ancestors`) and `nosniff` need server headers,
  which require the separate server-policy review.
- **Sunset convention (decision).** Sunset/sunrise labels and the "sun" scrub
  range use the Sun's apparent centre on the horizon, 2-10 minutes earlier than
  the published upper-limb convention weather apps use. The Sun model itself
  matches USNO tables.
- **Legal pages: deferred by the owner (2026-10-11).** Not release work and
  not to be raised again unless the owner asks. For reference only: the
  Impressum names a pseudonym without a postal address, and the privacy page
  lacks GDPR Art. 13 items.

## Known limitations

- **Horizon model.** One sky interval per source column cannot represent
  disconnected vertical openings; the 4 deg photo-top open heuristic and 0.5 deg
  conservative aggregation remain. Under the selectable strict policy an
  unpainted column inside the photo stays excluded (obstacle mode cannot record
  "photographed and clear").
- **Photo geometry.** No fisheye, arbitrary lens distortion or stitching
  repair, and no tilted partial panorama wider than 180 deg. Painted horizons
  cannot be remapped after conversion or reorientation; upload the photo as a
  new horizon instead. Converting photos above about 16.7 MP may exceed iOS
  Safari's canvas limit.
- **Twilight scan.** The 10-minute scan skips a night with under ten minutes of
  darkness at a level (two such nights in the 2026 reference tables), and above
  about 84.5 deg latitude pickDarkWindow can pair an astronomical dusk with a
  nautical dawn on the single transition night.
- **Thumbnail cache.** No size limit or eviction; quota errors are ignored.

## Monitoring

- **BROWSER-LOCAL-001.** The local test server's connection queue was raised
  from 5 to 64 after refused module loads; failures are recorded with server
  thread health and failed URLs, never retried or skipped.
- **BROWSER-CI-001.** One GitHub Windows run (October 11, 2026) failed
  `web-safety-import-refuses-unrecoverable-current-horizons` with Chrome's
  `net::ERR_NO_BUFFER_SPACE` after a reload; the next run of the same code
  passed. The test server now keeps connections alive instead of opening one
  socket per module import. Remove this entry if it does not recur.
