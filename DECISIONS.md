# Independent website decisions

Decisions are recorded newest first and are not rewritten; a later entry that
supersedes an earlier one says so. Entries about the former desktop app (FITS,
Library, SQLite, desktop CSP) are history only.

## Rules still in force (index)

- **Scope and authority:** one JS core for astronomy and planning (0.6.20);
  published reference anchors over fixtures; Workbench is the only theme;
  global catalog IDs (0.6.12); the website and the Windows catalog are
  independent projects (2026-10-01 split).
- **Time and planning:** site-zoned noon anchoring and calendar dates
  (2026-10-10); bounded, half-open planning intervals (2026-10-05); the detail
  card describes the coming night (2026-10-11, supersedes the calendar-day
  culmination rule); unknown timezones are refused at entry (2026-10-11);
  sunset and sunrise use the published upper-limb convention (2026-10-13).
- **Horizon:** a horizon is skyline points on a compass grid, with a photo
  only as a tracing aid; the profile is derived, edits save automatically, and
  0.1.x horizons are not converted (2026-10-11, "Rebuild the horizon editor",
  supersedes every earlier horizon entry); overhangs, phone-compass capture
  and north from the Sun follow it (2026-10-12); photos are to be replaced by
  phone-sensor capture and share links (2026-10-15, planned).
- **Data and privacy:** transactional, staged backups with rollback; Wikipedia
  is the only object-photo source (2026-10-06); popularity is never visible
  (2026-10-06); the CSP is delivered in the document (0.6.33) and, for the
  landing pages too, as response headers (2026-10-13).
- **Delivery:** cache tokens checked against a verified baseline (0.6.24/25);
  immutable release graphs with older releases retained (2026-10-10); CI runs
  the browser suite on Linux and the rest on Windows (2026-10-11).
- **Releases:** the public history restarted at 0.1.0 (2026-10-06); later
  releases continue at 0.7.0 above inherited tags (2026-10-11).
- **Documentation:** see "Documentation layout" (2026-10-11), which updates the
  older "Docs policy".

## 2026-10-15 — North references and loop closure (sensor capture phase 3)

- **References replace the compass.** The Moon, the Sun or a landmark in the
  crosshair sets north for the rest of the capture; the compass only reports
  how far it was off. Moon and Sun use the observing site and the current
  time (not the planner's selected time), apparent and topocentric, and only
  between 2 and 60 deg altitude: lower they hide behind the horizon, higher
  azimuth means little. The Sun is aimed on the screen only.
- **Loop closure asks first.** Only the user knows whether the crosshair is
  back on the starting point, so a full turn (300 deg net or more) asks. Up to
  3 deg the closing error is drift and is removed by angle turned (phase 0:
  drift comes with turning, clean turns closed within 1.3 deg); more is a
  missed aim and the trace is kept as traced.
- **Site check never prompts.** The distance warning runs only where
  location access is already granted, so the capture adds no permission
  prompt.

## 2026-10-15 — Share links, not server shortcodes; north waits for the compass

- **Transfer.** Asked for "shortcodes for importing on a desktop", the owner
  was offered server-stored codes (a script on nightseam.de holding the
  points for a while, new privacy text, PHP on the host unconfirmed) and
  chose the share link only. NightSeam keeps storing nothing on its server;
  the points travel in the link's fragment through whatever app the user
  shares with. Opening a link only offers the horizon.
- **North.** Measured over USB debugging on the Pixel 7a: a freshly started
  compass swings towards its heading for about 10 s, and the first capture
  locked north 44 deg off. North now locks only once compass minus
  gyroscope is steady over 3 s (halves within 1 deg, spread within 4 deg),
  with a 20 s fallback that says north may be off.
- **Capture controls.** Owner request: tracing starts and stops with one
  button instead of being held, and the AR overlay draws lines only (no
  shading), so the scene stays visible.

## 2026-10-15 — Horizon photos removed; backups stay format 11

Phase 1 of the sensor capture plan. Photo placement, Align mode, skyline
detection, the landmark and Sun north tools, the EXIF reader and the
`nightseam-horizon-photos` database are gone; the database is deleted on
load. Records and backups of builds with photos keep their skylines and
overhangs, and their photo fields (`photo`, `hasPhoto`, `image`) are dropped
without being checked, so a malformed old photo can no longer refuse a
restore. The plan named a backup format 12, but dropping optional fields is
compatible (a format 11 reader already accepts records without a photo), so
the format stays 11. `sunDirection` stays in the core for the capture's north
reference.

## 2026-10-15 — Capture horizons with the phone's sensors, not photos

Owner decision after testing the photo editor on a Pixel 7a: placing photos
was too fiddly (width, tilt and roll by trial and error before north means
anything), and the map-landmark calibration (pull request #7, closed) did not
work well. A scratch comparison with a pinhole camera model put the linear
photo mapping 2.4 deg off for a level phone photo and up to 12.6 deg for one
tilted up 30 deg; fixing that needs camera models and fitting, the complexity
the 2026-10-11 rebuild removed.

- **Capture.** The phone measures directions directly: a live camera view with
  a crosshair, altitude from gravity, the sweep's shape from the gyroscope
  (relative orientation), and north set once from a reference (Moon or Sun,
  a landmark bearing, or the averaged compass), with loop closure removing
  gyroscope drift.
- **Photos removed.** Photo placement, Align mode, skyline detection and the
  landmark and Sun north tools go; only azimuth/altitude points (and
  overhangs) are stored, as in a N.I.N.A. horizon file.
- **Transfer.** A share link carries the points in its fragment, so no server
  storage is needed and the data never reaches the server. A short typed code
  would need a server-side store, a hosting review and new privacy text; it is
  reconsidered only if links prove clumsy.
- **Gate.** A sensor probe on the Pixel 7a comes first; if relative yaw drifts
  more than about 2 deg per sweep after loop closure, the plan is revisited.

Plan: [HORIZON_SENSOR_CAPTURE_PLAN.md](docs/horizon/HORIZON_SENSOR_CAPTURE_PLAN.md).
This supersedes the photo parts of the 2026-10-11 rebuild entry and the
photo-compass parts of the 2026-10-12 entry once phase 1 lands; until then the
shipped behaviour is unchanged.

## 2026-10-13 — Hosting headers, compression and the accessibility pass

Measured the same day: browsers already get Brotli compression, so
HOST-DELIVERY-001 is closed without provider changes. GET page loads are
served by nginx without `.htaccess`, so the response headers in the entry
below (and in web/.htaccess) are not delivered with the pages; the provider
exposes no nginx settings. The header blocks stay in both `.htaccess` files,
and the meta CSP in every page remains the enforced policy. The owner does
not have the expertise for a screen-reader pass and chose to treat
accessibility as covered by the automated checks for now; A11Y-001 is a
known limitation instead of a release gate.

## 2026-10-13 — Security headers for the landing pages

Owner decision after the server-policy review: landing/.htaccess sends the
landing pages' existing CSP plus `frame-ancestors 'none'`, `X-Content-Type-
Options: nosniff` and their referrer policy as response headers, the same
mechanism web/.htaccess uses for /astro/. Browsers ignore frame-ancestors in a
meta CSP and nosniff has no meta form, so these two protections were missing.
Nothing on the pages changes; /astro/ keeps its own policy, which replaces the
inherited one. tests/test_landing_headers.py keeps the header and meta forms
identical apart from frame-ancestors.

## 2026-10-13 — Sunset and sunrise follow the published convention

Owner decision: sunset and sunrise are the instants the Sun's upper limb meets
the horizon with standard refraction, i.e. the true centre at -0.8333 deg, as
in the USNO tables and weather apps. This supersedes the apparent-centre label
kept on 2026-10-11, which read 1-5 minutes earlier at sunset and later at
sunrise than the times users compare against. It changes the Sunset/Sunrise
labels and the slider's sunset-to-sunrise span; the -6/-12/-18 deg twilight
levels, the dark window, scoring and the apparent-altitude Sun visibility rule
are unchanged. The new anchor `usno_planner_sunrise_sunset_2026` compares the
planner's own times with the five USNO tables; grazing polar events below
0.02 deg/min are left out as in the Sun-model check.

## 2026-10-12 — Overhangs, phone compass and north from the Sun

Owner request: the three follow-ups of the horizon rebuild, as phases 4-6.

- **Overhangs block everything above their edge.** One edge line per span
  gives one upper ceiling per direction, which the visibility rule already
  had (`ceilTop`). Per bin the lowest edge altitude counts, the conservative
  choice. Edges never cross north (they are split there), and drawing over an
  existing edge replaces exactly the span drawn. Sky visible through gaps
  above an obstruction (between branches) is still not representable.
- **The compass correction is per session and from one landmark.** Browsers
  give magnetic, often several degrees off, headings; one known direction
  corrects both error and declination without a geomagnetic model. Absolute
  readings are preferred; relative ones are labelled. Because some browsers
  expose `requestPermission` without settling it, only an explicit refusal
  stops the compass.
- **The Sun sets north and tilt.** A marked Sun and its time give a full
  direction, so both are set; width and roll stay. A Sun below the horizon at
  the entered time is refused. EXIF time without an offset is read as site
  time, and the form says so.

## 2026-10-11 — Rebuild the horizon editor around a skyline

Owner decision: the panorama editor was far too complicated (about 176
controls, three calibration systems, two coverage settings and seven drawing
tools) for what it does, which is to say where the sky is blocked. With the
project treated as fully in development, it was rebuilt without backwards
compatibility. Plan: [HORIZON_REBUILD_PLAN.md](docs/horizon/HORIZON_REBUILD_PLAN.md).

- **Model.** A horizon is a name, skyline points (world azimuth/altitude, joined
  by straight lines around the circle) and an optional photo placement (width,
  heading, tilt, roll; pixels treated as square degrees). The planner's 720-bin
  world-azimuth profile is derived from the points and never stored. Each bin
  holds the highest skyline altitude inside it, so a narrow peak is not lost.
- **Photos are a tracing aid.** Changing the placement moves the skyline points
  with the photo. A 2:1 photo starts as a full 360 deg panorama; anything else
  as a 60 deg ordinary photo with an approximate linear mapping (owner choice:
  ordinary photos are supported). A full panorama is never rolled, because its
  tilt on a sphere is a wave rather than a rotation; only partial photos get
  level handles.
- **Editing.** Draw and Align photo modes, a points form for keyboard entry,
  set north from a landmark, daylight skyline detection (a two-class threshold
  per column, median-smoothed, then simplified) and plain azimuth/altitude file
  import/export (Stellarium, N.I.N.A., plain lists).
- **Saving.** Every finished edit saves at once. Undo/redo stay; the dirty state
  now means a save failed, and the leave-page warning follows it.
- **Removed:** brush/eraser masks, sky-band mode and block-above, crops,
  projection conversion, calibration evidence versions 1-5, fitting and check
  points, measurement evidence, coverage policies and the "unknown horizon"
  visibility reason, landmarks, provenance, confidence, the precise-bin table,
  and the P3-P7 plan.
- **Old data.** Horizons stored by the published 0.1.x builds are dropped, not
  converted (owner choice). Backup format 11 replaces the `panos` section with
  `horizons`; formats 1-10 still restore their sites, rigs, targets and
  settings, and the import says their panoramas are not imported.
- **Later:** overhangs and balcony openings (owner choice), a phone-compass
  capture mode, and placing a photo from the Sun's position at capture time.

This supersedes every earlier horizon entry below (strokes and profiles,
crops, guided and physical-orientation calibration, conversion, coverage
evidence and the inferred-open default, the two-point setup, conservative cell
coverage and the evidence semantics). They remain as history.

## 2026-10-11 — CI: browser suite on Linux, one run per change

**Decision.** The browser job runs on `ubuntu-latest`; the source guards and
pytest stay on `windows-latest`. CI runs for every pull request and every push
to `master`, no longer for every push to every branch.

**Why.** On GitHub's Windows runners about every other browser run failed one
check because Chrome reported `net::ERR_NO_BUFFER_SPACE` for a single local
request, each time a different small file (`app.js`, `plannerstate.js`,
`app.png`); the same code passed on rerun and locally. HTTP keep-alive on the
test server did not stop it. The planner runs only in the browser, so the
runner's operating system does not change what the checks test, and the
Windows-specific parts (CRLF checkout, Python tooling) keep their Windows job.
Running pushes and pull requests separately doubled every run; in a private
repository that also doubled the Actions minutes used.

**Rejected.** Retrying a check after a network error (bends the no-retry rule
and would hide real network faults); leaving it and rerunning by hand (trains
people to ignore red CI); a self-hosted runner in WSL (CI would depend on the
development PC being on, and serving from the Windows drive is not faster).

**Consequences.** A branch without a pull request gets no automatic CI run;
start one by hand (workflow_dispatch) if needed. If the Linux job shows a
Linux-only difference (fonts, case-sensitive paths), fix it or revert the
runner. The first Linux run had no network failures but four layout failures
from Linux's wider default fonts; they were real narrow-screen fragilities
(the catalog count line widened phone pages and hid the progress text; the
landing header overflowed at 320 px) and were fixed in the layout, plus one
check that measured a label against a narrow rail. ENVIRONMENT.md describes
how to reproduce Linux font widths locally. One Windows run also missed the advanced-catalog speed budget under
4x CPU throttling; watch whether that recurs on Linux.

## 2026-10-11 — Short AGENTS.md; no hand-kept token register

AGENTS.md is rewritten as short, plain-language rules: what lives where, what
never happens without the owner, the change workflow, commands, behaviour that
must not regress, releases, where things are recorded and which subagent does
what. History, script internals and details the guards already enforce are
left to DECISIONS.md, DEVELOPMENT.md and the scripts.

The hand-maintained cache-token register is removed with its test
(`test_web_token_register_matches_the_sources`). It duplicated the generated
verified baseline in `scripts/check_js_tokens.py`, which already checks every
module's bytes against its token and that all references agree, while
`scripts/check_core.py` checks the core stub token against the manifest. The
register only added a manual step to every change.

## 2026-10-11 — Documentation layout

Keep the root to current, maintained documents: README (entry point and map),
AGENTS (rules and commands), DEVELOPMENT (how the planner works,
rewritten as a current guide), DESIGN, CATALOG, ROADMAP (status and open work;
replaces IMPLEMENTATION_PLAN and FUTURE_FEATURE_SCOPE), BUGS (open findings
only), DECISIONS, RELEASES, RELEASE_WORKFLOW, HOSTING_CONFIGURATION and
ENVIRONMENT. Owner checklists go to docs/acceptance/, active horizon plans to
docs/horizon/, and finished plans, reviews and dated logs to docs/history/
unchanged. RELEASES keeps website receipts; pre-split combined-project receipts
are archived. The older "Docs policy" still holds against separate ARCHITECTURE,
WORKFLOWS, CONTRIBUTING and CHANGELOG files; DEVELOPMENT describes behaviour,
AGENTS stays the authority for rules and commands.

## 2026-10-11 — Converted photos infer open sky above the skyline

Owner decision: confirming a converted photo defaults to inferred-open coverage.
Sky above the recorded skyline counts as clear, including above the photo's top
edge, while directions outside the photographed azimuths stay excluded. This
supersedes the P1/P2 rule that newly confirmed converted photos use strict
measured coverage, which excluded nearly all sky above an ordinary photo's
narrow vertical field. A record whose policy is already inferred-open or
strict-measured keeps it on reconversion; legacy, the default every record
carries, is treated as unchosen. The photo setup shows a "Sky outside the
photo" select (open above the skyline / only what the photo shows / open
everywhere) that applies immediately as one undoable edit; the advanced
coverage evidence select stays in step.

## 2026-10-11 — Detail card describes the coming night; USNO time anchors

Owner decision: the detail card's rise, set and culmination, and the Moon
warning at culmination, belong to the planned night from the site's noon on
the selected date to the next site noon (23/25 h across DST). This supersedes
the 2026-10-10 rule that culmination belongs to the complete calendar day,
whose early hours are the previous night. core objectNightInfo implements it;
objectDayInfo remains for compatibility.

Published twilight and rise/set times are reference anchors: USNO 2026 yearly
tables for five sites, verbatim in tests/fixtures/usno_2026. Minute rounding
limits single events, so the anchors assert per-table bias (8 s), RMS (21 s)
and worst event (100 s). The planner keeps its apparent-centre sunset label;
the rise/set anchor checks the Sun model at USNO's upper-limb instants.

## 2026-10-11 — Continue release names above inherited tags (0.7.0)

The public series restarted at 0.1.0, but inherited tags occupy 0.1.5-0.1.7,
0.2.x, 0.3.x, 0.4.x, 0.5.x and 0.6.0-0.6.36. The owner chose to skip ahead:
the next public release is 0.7.0, and every later release is above the highest
existing tag. Names never collide with or sort inside the inherited history,
so version order and creation order agree again. PUBLIC_RELEASES keeps 0.1.0
and 0.1.1; the ledger jumps from 0.1.1 to 0.7.0. pre_tag_check.py refuses an
existing or lower version before tagging.

## 2026-10-11 — Validate zones at entry; name unknown horizons in core

An unknown IANA zone is refused at every entry point rather than planned in
the browser zone: the site form alerts, a backup site rejects the whole bundle
before confirmation (as invalid settings already did), and an unknown stored
zone activates browser local for planning and weather together.

Unknown-coverage horizon blocks are a core reason, not shell prose. Core's
panoramaVisibilityReason refines BLOCKED_BY_HORIZON to UNKNOWN_HORIZON only
where queryHorizonEvidence finds no evidence, leaving legacy reasons
unchanged. The detail summary names a night "coverage unknown" only when every
horizon-limited sample in its window lacks evidence.

Converted photographs are refined only through source-aware setup; the legacy
linear steps stay reviewable but refuse to apply. Imports refuse photos whose
header and decoded dimensions differ, and backup import refuses to start when
the current data could not be restored by rollback.

## 2026-10-11 — P1/P2 physical orientation and evidence policy

Use supported source rays to fit heading, pitch and roll jointly while keeping
declared geometry fixed. Weighted Wahba fitting minimizes unit-ray chordal loss;
optional angular Huber IRLS reduces influence visibly without deleting evidence.
Report spherical residuals and apply a separate 1° directional policy. Preserve
v1–v4 interpretation and their historical per-axis checks. Do not infer a precision
percentage or independence from the number of points alone.

Evidence v5 and backup 10 preserve source/current models, fit/check roles and
optional source/error/time/group/exclusion metadata. Known geometry proceeds to
review/checking with zero fitting references. Unknown FOV is limited to corrected
rectilinear optics, four fitting points, two held-out checks, 5–150° bounds,
0.1° held-out improvement and bounded curvature. It cannot repair arbitrary
distortion or stitching. Preview and pixel preparation precede one undoable Apply;
painted/profile records cannot be reinterpreted until source painting exists.

Separate evidence state from permission to plan. Newly confirmed converted
photos use strict measured coverage; legacy records keep their assumptions.
Profile-derived unknown coverage is conservatively excluded under strict policy,
without labeling it measured blockage. Both planning paths share this policy.
Optional observer/capture metadata records the viewpoint without claiming a
parallax correction. Keep measurement entry behind Advanced disclosures.

P1/P2 are local software pending integrated gates. P3–P7, owner physical acceptance
and separately authorized publication remain open. Actual receipts belong in
RELEASES.md; dated D/E choices below remain historical compatibility context.

## 2026-10-11 — Supported projection conversion and held-out checks

Use a derived angular working photo so the existing image/mask/ruler/crop/profile
geometry stays coherent. Keep original bytes and references in original source
coordinates. Supported source rays follow GPano east/north/up orientation:
angular, cylindrical and corrected centred square-pixel rectilinear models with
known geometry. Metadata prefills require review and matching decoded dimensions;
stale/conflicting metadata and unsupported models remain explicit prompts.
Preview pixels before Apply, prove the entire working rectangle photographed and
block excluded directions in both planning paths. Cap source/working allocation.
Never silently remap painted records: require a new horizon/redrawing.

Evidence v4 adds equal-weight multi-reference fitting and multiple held-out
checks. Retain explicit exclusions, reject ambiguous wrap/poor spread/conflicting
fits and show each residual plus worst check error. The 1° discrepancy threshold
is a policy, not physical certainty. Checks cannot verify their own fitting
feature; validated promotion removes the check role and requests another check.
Preserve v1–v3 interpretation and declare new geometry/evidence in backup 9.
Original-photo crops and undo/redo share the model, with restore validation before
any store write. No automatic lens/stitching inference or confidence percentage.

F ends at software validation and a verified immutable local review candidate.
Owner photographs, touch/pen, native zoom and screen-reader acceptance remain
separate; publication still needs explicit authorization.

## 2026-10-11 — Conservative horizon cell coverage

Continuing the authorized accuracy work, derive each 0.5° world bin from all
overlapping mask columns. A highest obstacle is safer than a representative
sample that can miss a narrow pole. For sky mode, intersect allowed lower edges
and explicit upper ceilings; an unpainted column blocks. Preserve default
open-above even when raw painted bands do not overlap. Keep the existing 4°
near-photo-top sentinel and one interval per column as documented limitations.

Trace cells use their highest connected edge and upward altitude rounding,
including sub-column segments. Retain inclusive endpoints, ordered corrections,
source/crop evidence, legacy migration and authoritative no-stroke profiles.
Conservative bins may overstate a narrow obstacle's width; crop regridding may
shift brush edges within the calibrated raster resolution. Test independent
geometric overlap and boundary cases instead of rewriting astronomy fixtures.

## 2026-10-11 — Evidence semantics and honest accuracy diagnostics

The owner's accuracy research request authorizes focused improvements. For a
confirmed full-360 original, fit one shared circular offset from both measured
bearings and display the signed residuals. Accept at most 1° per point as an
explicit consistency policy; do not call it a confidence estimate. Version this
behavior as evidence v3 and backup 8 so v2 reading keeps its original exact fit.
Keep the separate check out of the fitting data and retain manual-drift detection.

Expose deterministic edge sensitivity rather than a percentage confidence score.
Warn above 3× input-angle amplification, clearly excluding click/projection error.
Preserve numerical full-width tolerance for seam wrapping; half-bin coverage is
not proof of a full panorama. Correct the misleading fixed vertical-row comment.

Research establishes that projection, orientation and measurement quality are
distinct limits. Document narrow-obstacle aliasing and skyline row bias before
changing planner sampling. A conservative policy needs dedicated obstacle/sky
and overhang acceptance, and must preserve authoritative profiles without strokes.
Do not bolt a nonlinear projection onto only rulers or fit labels; image, points,
mask, crops and planner mapping must use the same transform.

Improve current documentation navigation/setup and retain dated receipts. Do not
rewrite historical desktop/release references or overwrite the unknown existing
WORKSPACE_AUDIT_REPORT.md. New audit findings live in
WORKSPACE_DOCUMENTATION_REVIEW.md, with actual checks in RELEASES.md.

## 2026-10-11 — Two-point setup and a photo-first editor

Implement the owner's authorized phases A–C using existing core/history/skyline
operations. Reserve ruler gutters, default to tracing for obstacles, expose
nearby undoable point removal and collapse specialist editing controls.

Two complete points establish a level/upright angular mapping; a perfect fit is
not an independent check. Preview without mutation, apply in one history step,
retain source-pixel evidence, constrain known full-360 coverage and reject
impossible/poorly separated references. Keep alignment/check status distinct;
unknown projections remain approximate. Preserve legacy evidence and its advanced
editor without inventing missing measurements. Backup format 7 protects new
complete references. Projection conversion/multi-point fitting remain future
phases, physical-photo/device acceptance stays with the owner, and deployment
has not been authorized.

## 2026-10-10 — Ordered editable skyline operations and software acceptance

Implement phase 4 traces inside the existing ordered mask-operation timeline,
rather than a second competing profile. Connected segments fill below; explicit
endpoints avoid assuming unseen terrain or a hidden seam closure. Preserve
later corrections on node edits, deep-copy nested points in history, clip at
crop intersections and protect editable traces with backup format 6. Keep sky
openings separate; an explicit, undoable switch removes obstacle-only traces.
Precise-bin editing visibly replaces paint/trace geometry with world-bin values.
Keep the first unconnected point as a session draft, so starting a trace cannot
clear an authoritative stored horizon. It becomes persisted geometry only with
its second point. Discard obsolete drafts on crop/clear/profile replacement and
history restoration; communicate rejected limits/duplicate horizontal positions.

Profile the existing Catalog acceptance failure before changing its performance
gate. Cache bounded timezone formatter instances, not offsets, and remove
redundant noon resolution from memo hits. Retain the 2-second limit and verify
final selected-time row altitudes to prevent a timing win from stale rendering.

The owner authorized phase 5 software validation/local immutable preparation
and elected to perform real-photo, physical-device and assistive-technology
acceptance themselves. No synthetic test proves a camera's projection or a
physical bearing. Keep these explicit remaining acceptance items; publication
requires its separate authorization.

## 2026-10-10 — Guided calibration with retained measurement evidence

Implement authorized phase 3 as coverage, known true bearing, two measured
altitudes, independent verification and painting. Keep an editable review path
for existing records and exact controls behind disclosure. Picking never paints;
percentage positions provide a keyboard alternative. Use the existing angular
core mapping, without inventing another camera projection or magnetic conversion.

Save bounded reference evidence against the original photograph, include it in
history and backup format 5, and retain older formats. Derive assumed/approximate/
checked status from current geometry and evidence. Only declared equirectangular
images can reach checked references; exact fit references and a spatially
independent check must agree within 1° on both axes. This is a software consistency
check, not proof of physical photograph accuracy. Cropping cannot move references
or preserve a checked current-view claim when alignment points leave the frame.

Preserve unapplied point drafts within a same-record session, refresh coverage
after manual width changes, and move keyboard focus into the canvas on entering
Paint. Reserve cursor-readout space after browser reproduction of a wrapping
readout shifting the canvas during a gesture. Skyline authoring and real-photo/
device/assistive-technology acceptance remain phases 4 and 5. No public release
or deployment is authorized by this implementation.

## 2026-10-10 — Horizon/Panorama correctness before guided calibration

Implement the owner's authorized phases 1/2 with retained original photo bytes
and composed normalized source rectangles, shared incremental rasterization and
CSS-pixel angular rulers. Format 4 prevents older clients from silently discarding
source bounds while formats 1–3 remain importable. Unknown legacy crop bounds
must not be inferred from azimuth/FOV alone; they cannot establish the original
calibration. Invalid legacy altitude spans are repaired at load/restore, keeping
stroke-less profiles authoritative.

Retain visible partial paint as one undoable edit when a gesture is interrupted.
The active pointer owns the gesture; tool/history/view/teardown and metadata
changes settle it. Angular brush size stays fixed under zoom, with an accurately
scaled footprint (including 360° seam copies). Keep view/display state in the
editor session rather than backups/history; moves to another panorama start a
fresh view. A bounded sticky stage toolbar keeps common actions near the photo.
Measure pointer handling and next-frame rendering separately; batch render per
frame and share the replay rasterizer rather than introducing another mask model.
Defer dirty-region complexity unless the recorded latency target needs it.

Guided import/true-bearing calibration, editable skyline traces and real-world
photo/assistive-technology/device acceptance remain phases 3–5. This work does
not authorize a public release/deployment.

## 2026-10-10 — Recover abandoned scratch rather than silently accumulating it

Moving pytest paths under logs did not address ignored deletion failures. Use
one owned scratch manager for pytest and JS guards, with OS locks distinguishing
live runs from crashed owners. Reap only marked inactive scratch before allocation;
fail visibly if cleanup remains blocked. Preserve ownership evidence for retry
and leave unknown data, historical reports, recovery and deployment backups alone.
Normal build stages/artifacts already replace fixed destinations; retain that
behavior and current plus N-1 core trees. Do not claim a global disk cap for
manually saved evidence or arbitrary developer outputs.

## 2026-10-10 — Keep current guidance separate from historical workspace material

Keep the current roadmap, review remediation plan, release workflow and actual
validation receipts at the repository root. Move completed design plans and the
old integrated review to docs/history with an explicit historical banner and
updated references; preserve their dated content.

Retire the unused combined-project concept corpus and desktop FITS test helper
from this web repository. Preserve every byte in a verified ignored local archive
before removal; their tracked history remains in Git. Archive stale local release
candidates too, and regenerate future candidates from validated current sources.
Delete only disposable test scratch/caches; keep recovery snapshots, deployment
rollback backups, reference fixtures, validation evidence and retained core trees.
Route pytest's default basetemp/cache under logs to avoid recreating root scratch.

## 2026-10-10 — Complete remaining Catalog, weather and accessibility review fixes

Resolve REV-028–038 as remediation phases 5–7. Keep one canonical astronomy/
visibility implementation: cache its maximum altitude and translate its reason
codes for the chart. Invalidation must happen before scheduling replacement work.

Weather must not infer good conditions from absent measurements. Require complete
hourly scoring inputs throughout the selected night before presenting a numeric
rating; expose individual available values and known warnings when incomplete.
Use resolved planner timezone for provider wall-hour data. Generation plus active
context ownership protects against stale responses even if requests cannot abort.
Preserve on-demand loading; changing an untouched site never starts weather.

Keep dense tables accessible through native rows/cells and actual buttons within
cells, with native keyboard sort controls. Preserve the open Workbench surface,
target selection, independent Save controls and filter focus during updates.
Human screen-reader/native-zoom acceptance remains separate from browser checks.


## 2026-10-10 — Keep crop angles and editor metadata attached to their source

A horizontal crop changes horizontal dab extent only. Preserve legacy `r` as
vertical radius and add optional `rx`, defaulting to r for existing records.
Keep wrapped seam paint and erasers in order. The minimum crop FOV expands the
kept band visibly inside the source image; one effective band controls preview,
calibration and strokes. Retain integer target FOVs and exact azimuth offsets;
never enlarge a frame already below the minimum. Raster edges remain quantized
to the existing 720×360 mask. Stored world profiles without strokes stay authoritative.

Confidence belongs to the displayed bin at input time. Write valid edits to the
model immediately, treat blank as unassessed, and settle pending metadata before
changing bins or history. Restore every model-dependent control after a snapshot.
Only canvas focus authorizes Space-to-pan; preserve native text/button keys and
remove editor listeners on teardown. Backup format 3 declares elliptical geometry
so earlier builds refuse it instead of misinterpreting it. Continue reading v1/v2.

## 2026-10-10 — Resolve site calendars and distinguish lunar frames

Use Temporal-compatible DST disambiguation: the earlier instant in an overlap,
forward by the gap for nonexistent wall times. Resolve critical calendar fields
without encoding them in the browser's timezone first. Full-day scrubbing spans
consecutive site noons; its elapsed duration follows DST. Calendar edits move
selection to that site's noon; a drag retains its anchor through the endpoint.
Preserve exact site-clock polar fallback endpoints across offset changes.

Retain geocentric J2000 Moon coordinates for phase and elongation. Horizontal
Moon position is observer-relative: subtract the sea-level WGS84 observer in
the equatorial-of-date frame, then apply refraction once. Elevation remains
metadata only. Correct the three Meeus series signs and validate against an
independent model; do not rewrite frozen fixtures containing the shared bug.
The truncated model is sufficient for approximate planning, not occultations.
Culmination belongs to the complete chosen calendar day and its Moon warning
uses the illumination at culmination, with fractions consistently in 0..1.

## 2026-10-10 — Publish complete immutable graphs and retain older clients

HTML-last ordering cannot protect a client whose old HTML loads newly overwritten
JavaScript against older dependencies. Package the full asset/data graph under a
content-addressed directory, verify it before switching public HTML, and retain
previous directories for open tabs and cached pages. Use module-relative data
URLs and explicit HTML asset URLs; a document base element would change ordinary
page and fragment navigation. Verify temporary FTPS uploads before atomic rename,
refuse differing existing immutable bytes, and review root policy changes
separately. Keep real publication behind the owner's existing authorization rule.

Cache tokens remain useful for local/source previews and individual modules.
Discover and update the complete recursive graph rather than assigning versions
from only index.html/app.js. Propagate changes once per importer, preserve an
already advanced token, and keep generated core versions manifest-owned. Treat
ambiguous graphs as errors before edits or baseline refreshes. Release traceability
covers every served file format in both trees, with one explicit generated-version
exception; a clean tag cannot authorize extra untracked publication content.

## 2026-10-07 — Keep one date editor and a compact Sky rail

Date editing belongs in the common top bar. Remove Sky's duplicate datetime
field and visible range note. Put a stacked twilight legend beside the wider
slider, keeping selected-time/phase text and endpoints. Retain the honest range
explanation as accessible help. Phones place the full-width slider above the
compact legend/actions. Site-zone range and one-minute synchronization stay shared.

## 2026-10-07 — Remove repeated overview facts and expose direct editors

Remove Tonight's reason/rise columns and Sky's visible-now list at the owner's
request, preserving detailed selected-target facts and map selection. Keep native
site/rig switching separate from the adjacent settings words; those words open
the active editor and signal pressability with the normal brass hover/focus state.
Preserve filter controls for now: unlike a static NB recommendation, Hα/OIII
change Moon-aware Tonight scoring. Explain the conditional effect and global
priority instead of presenting them as badge-only controls. Correct BB warnings.

## 2026-10-07 — Fine time selection and coherent Horizon rails

Use one-minute slider steps and immediate selected-time synchronization. Batch
canvas work to the latest selection per animation frame instead of drawing every
pointer event; the shared planning window and ranking policy remain unchanged.
Keep the entire Horizon tools rail together when sticky, allow internal scrolling
on short desktop screens, and use normal flow on narrower layouts. A content-height
body keeps the header available throughout tall panoramas. Explain numeric editing
as an optional exact-angle tool, including its existing paint-to-profile transition,
Undo/Save and confidence metadata. History controls must display the restored mode.

## 2026-10-07 — Apply planner annotations and explain current visibility

Replace the native multi-select object-type list with open checkboxes: ordinary
clicks/Space toggle independent types, and no checks means all types. Retain
every option without a nested scrollbar and remove duplicate type-category chips.
Increase Catalog pages to 50 rows. Replace the misleading Rises later status and
filter with the actual selected-time condition and All/Usable/Not usable choices.
Best usable interval remains its own column; it is not an astronomical rise time.
Read those intervals from the current revision-keyed calculation rather than
requiring a prior visit to Tonight.

Move Sky View's time controls above the chart and use common open input styling.
The owner's requested warm-to-dark twilight gradient is a semantic time-track
exception to the ban on decorative gradients. Use actual shared-core Sun altitude
at the active site, with phase text/legend and honest polar/full-day behavior.
Remove Tonight's duplicate local slider; its whole-night ranking and common
selected-time control remain. These choices supersede the older native-select
and below-chart-rail descriptions in the historical decisions below.

## 2026-10-06 — Open planner surface and live catalog modes

Apply the independent catalog's transparent actions, underlined tabs and open
metrics/inner sections throughout the web planner. Use spacing/type/separators
for hierarchy; keep input/focus affordances and bounded temporary dialogs/menus.
Preserve the already approved public-page composition and canonical role palette.

Fix Advanced loading in the web shell without a second astronomy implementation
or a worker: repeated panorama hashing, per-row twilight scans and an unnecessary
application reload were avoidable costs. Reuse each grid fingerprint, share page
batches and own/cancel the warm job. The same populated-profile benchmark measured
normal CPU activation/complete visibility at 1.21s/2.45s before and 0.13s/0.20s
after; 4x CPU slowdown at 6.57s/14.31s before and 0.25s/1.13s after. Longest task
under slowdown fell from 5.55s to 0.11s. These are local Chrome measurements, not
network/hardware guarantees. Baseline/after JSON and the measurement script are
in ignored logs/open-design/. Browser acceptance covers actual live toggles,
populated-profile warming, search/date preservation and superseded work.

On October 1, 2026 the local catalog and website became separate repositories.
Each owns its source dependencies, catalog inputs, tests, builds and release
versions. Both independent products begin their public version series at 0.1.0;
the website reset was requested on October 6. Existing Git history stays intact.
No sibling source imports or symlinks are used. Existing archive paths and both
desktop libraries were preserved. The remaining entries below are historical
decisions from the combined project; references to removed cross-project paths
describe that historical state, not current build requirements.

# DECISIONS.md — why NightSeam works the way it does

## 2026-10-06 — Remove redundant Tonight graph and provenance entry

The owner removed the Tonight overview graph and Horizon calibration provenance
form. Keep Tonight's time control/ranking and the full inspector graph. Remove
unused overview sampling, listeners and styles. Provenance removal is a UI change:
preserve existing imported/saved metadata through Save, history and backup. Grow
Catalog's multiple-select type list to the current complete option count rather
than limiting it to four scrollable rows.

## 2026-10-06 — One full inspector in the Sky View rail

Remove the compact selected-target summary and miniature altitude chart from Sky
View. Reuse the shared full inspector inline in that space, with collapsed chart
controls/legend above and visible-now targets below. Deliberate target clicks
open full details directly; closing, filtering and refreshing retain selection
without reopening. Inline details remain complementary on phones too so users
can operate the map and time controls. Park the shared wrapper outside #view
before replacing its contents or opening Setup; never clone the inspector.

## 2026-10-06 — Phase 4 readable controls and explicit focus behavior

Group observing setup and planned night/time instead of fitting the header by
shrinking text. Keep the clock visible and dense tables scrollable on phones.
Use a shared reachable-control rule for modal trapping and focus restoration;
closed disclosure descendants are excluded. Isolate background controls only
for actual modals, keeping the wide inspector complementary. Popovers expose
their expanded state and return focus on Escape; scoped arrow navigation wins
over global scrub shortcuts. Onboarding describes the real menu and example
site. Quiet status messages cover meaningful changes, without making entire
dialogs live regions. This implements Phase 4; automated evidence does not close
the outstanding real screen-reader/native-zoom acceptance.

## 2026-10-06 — One target identity, explicit inspector visibility (WEB-REV-003)

Tonight, Catalog and Sky View share S.detailId as their selected-target identity;
S.detailOpen separately controls inspector visibility. Closing details or
switching views preserves selection and highlighting. Filters do not replace
the target; deletion or absence from the authoritative catalog clears it.
Sky View and the Tonight overview cannot fabricate a selection. Separate mutable
identities drifted under filters and redraws; explicit visibility keeps a closed
inspector closed through refresh, resize and subscription callbacks.

## 2026-10-06 — Remove visible popularity sorting and name the time slider

The owner requested only these two planner fixes. Remove the Popularity option
and use Name ascending initially and after clearing filters, keeping the visible
selector consistent with actual ordering. This supersedes the historical tier
default without changing internal ranking or Standard membership. Name the top
slider Selected observing time and expose the displayed site clock through
aria-valuetext. Broader manual accessibility acceptance remains open.

## 2026-10-06 — Wikipedia-only object photos

The owner requested removal of the legacy bundled image library. All 81 JPEGs,
their attribution manifest and generator are removed. Opening object details
now reuses the Wikipedia photo cache or fetches a thumbnail directly; it never
probes a local object JPEG. Author/license metadata stays with cached bytes and
the exact file-page link. Existing cached photos remain usable and missing
photos keep their textual placeholder. This supersedes the bundled-image
inventory/verification decisions below and resolves IMAGE-001 by removal,
not by claiming permission for historical images. Branding, decorative public
art and user panoramas are unchanged.

## 2026-10-06 — Owner-confirmed website log configuration

The owner changed Plesk to daily rotation with a maximum of seven log archives,
compression enabled and no email forwarding, and cannot enable IP anonymization.
Privacy documents full IPs and the actual rotation/file-count configuration,
including the current active log. No strict seven-day cutoff, provider-wide
retention rule or anonymization is inferred. HOST-001 is complete for this
owner-confirmed website configuration; hosting settings were changed by the
owner, not by an agent.

## 2026-10-06 — Compact public image credits

At the owner's request, About credits online photos through Wikipedia/Wikimedia
and their original creators, with an Image credits link and individual photo
author/source/license details retained. Bundled photos keep their actual source
terms; they are not relabeled as Wikipedia images. The popularity source acknowledgement
is removed from About and NOTICE; Privacy describes catalog requests without
naming that source. Internal catalog provenance and selection data
are unchanged; no permission grant or mandatory attribution condition was
established in the source review. Existing image verification findings stay open.

## 2026-10-06 — Independent website public history starts at 0.1.0

The owner approved the public design and requested removal of all older Changes
entries after the website/catalog split. The public page and JSON now contain
one website 0.1.0 entry. This supersedes earlier public archive preservation
decisions below. The explicit PUBLIC_RELEASES ledger, rather than inherited Git
tags, determines public membership so regeneration cannot restore old notes.
Legacy summaries remain internal release-guard evidence; Git tags are untouched.
The entry prepares the new series and does not create a tag or publish a release.

One entry per decision that an agent or maintainer would otherwise re-litigate.
Format: **decision** → why → what was rejected → where it is enforced.

`AGENTS.md` states the rules; this file records the reasoning. `CATALOG.md`
covers the data pipeline. `BUGS.md` is the current unresolved backlog. Closed
audit/review bundles were removed from the working tree on 2026-09-17; Git
history, tests and `RELEASES.md` preserve their durable evidence.

---

## 2026-10-01 - FITS identity and nonblocking archive IO

**Decision.** Complete FITS file bytes define identity through SHA-256. Renaming
or selecting another session/frame override does not create another archive
copy or library record. The UI explicitly reports Already imported. Future
calibration sharing and reclassification need separate validated operations.

**Why.** The user requires awareness of previous imports with no duplication.
Destination-based identity would silently multiply identical exposures and
inflate library totals. Hashes imported from a backup are not trusted identity
evidence; local original bytes establish fingerprints.

**Implementation.** Blocking file IO runs in workers under archive-operation
serialization, separate from the short SQLite lock. Indexed candidates replace
full-table per-upload scans. Positive fingerprints are verified against current
original bytes. Reindex refreshes fingerprints after external archive edits.
No SQLite RLock may be held across an await. Missing-original repair preserves
the record and is reported separately from newly imported captures.

## 2026-10-01 - Retired model and cached-core compatibility

**Decision.** The experimental modeled sky-brightness feature was deliberately
removed from both planner shells and shared core. Its controls/data are not part
of the next release, and no modeled value is presented as a measured sky reading.

The narrow `--retire-model-bearing-previous` bake excludes the old model-bearing
tree from local distributions (`previous: null`). Ordinary bakes retain N-1.
The exception does not authorize deleting deployed old trees referenced by
cached stubs. Verify those remote files and keep compatibility trees available
when deploying the retirement; publish modules before HTML. No deployment or
live cached-client compatibility check is performed by this implementation pass.

## 2026-09-27 — Workbench is the only shipped presentation

**Decision.** Workbench is the only presentation in the desktop app and web
planner. There is no theme picker or Glass layout. Both shells use the same
role palette; their component styles remain separate because their DOMs differ.

**Why.** The planning workflow benefits from a restrained instrument-panel
surface: opaque graphite keeps charts and target data legible, brass gives the
user one clear action/focus signal, and the compact layout leaves more room for
the actual night plan. Opaque surfaces and compact controls keep chart and
target information legible.

**Compatibility.** `dome`, `classic`, empty, and unknown values are accepted as
legacy inputs and normalize to `workbench`. Desktop settings and web backups
use the same canonicalization rule, so removing the picker does not strand an
existing preference or backup.

**What was rejected.** Keeping a second selectable presentation would add
duplicate layout overrides and leave visual behavior dependent on a stored
setting. Legacy values remain accepted only at the compatibility boundary.

**Where enforced.** `app/theme.py`, `app/database.py`, `app/server.py`,
`web/webstore.js`, `web/app.js`, `static/js/header.js`, `web/themes.css`,
`static/themes.css`, and the theme migration tests.

---

## Unreleased review decisions - 2026-09-20

This section mixes decisions implemented in the current working tree with
explicitly pending product/architecture choices. Implemented entries are still
not release claims until a tag is made; pending entries must be resolved before
their decision-dependent features are implemented.

### Shared planner-state invalidation

**Decision.** Treat planner state changes as typed invalidation events with a
revision-bearing payload. Panorama/profile edits, site changes, rig changes,
date changes, selected time changes, and planning preferences must publish the
same conceptual contract in both shells. Derived night state and observation
caches must include the relevant revisions instead of relying on object ids
alone.

**Why.** The current shells can display an edited panorama while still showing
derived results from the old profile. This is a correctness problem, not merely
a repaint problem. A single event contract prevents every future consumer from
inventing a second invalidation rule.

**Proposed payload.** `{ kind, revision, causes, siteId, panoId, dateKey }`,
with optional domain revisions for site, rig, panorama, and preferences. A
completed user gesture emits once; pointer samples remain local to the editor.

**What was rejected.** Recomputing on every pointer sample would waste work and
make the UI race its own worker. Invalidating only by panorama id is insufficient
because a restored or edited record can retain the same id.

**Where to enforce.** The shell event adapters belong in `static/js/` and
`web/`; pure revision/key helpers may live in `core/`. `derive.js`,
`planning_client.js`, `web/app.js`, `web/horizon.js`, and the observation caches
must consume the contract. Browser tests must prove that a profile edit changes
dependent results in both shells.

**Working-tree status.** The shared foundation is implemented in
`core/plannerstate.js`; desktop and web now emit the contract for panorama,
site, rig, date, selection, and preference changes. The event model is ready
for future planner consumers. The accessibility foundation now has a 32/32
cross-shell/theme browser matrix; the remaining manual accessibility audit and
the roadmap features below still need their own coverage.

### Panorama persistence boundary

**Decision.** Keep the explicit-save model: edits affect the active in-memory
panorama immediately, while durable storage changes only on Save or when the
user leaves the editor. A page-exit flush is a safety net, not the normal user
interface. Save should remain visibly meaningful and dirty state should be
truthful.

**Why.** This matches the existing design contract, makes undo/redo and Revert
understandable, and gives users a clear persistence boundary for destructive
editor operations.

**What was rejected.** Silent timed autosave makes the Save button ambiguous and
can persist a gesture before the user has reviewed it. If autosave is later
chosen, it must be a deliberate contract change in both shells.

### Site elevation contract — decision still required

**Decision.** Until a defined observer model exists, elevation remains stored
site metadata and must not be described as affecting calculations. A later
observer-model feature may use it for explicitly documented effects such as
horizon dip or atmospheric parameters, but those effects must be implemented in
`core/` and shared by both shells.

**Why.** The current calculation path accepts latitude and longitude but does
not use elevation consistently. Claiming more than the implementation does is
worse than accurately labeling the field as metadata.

**What was rejected.** Adding an unexplained correction in one shell would make
desktop and web disagree and would create no trustworthy reference values.

**Exit condition.** Either remove the claim from user documentation and add a
metadata test, or implement a specified elevation-aware observer model with
reference anchors, migration rules, and parity tests.

### Solar-system ephemeris policy — decision still required

**Recommended direction.** Use a bounded, versioned, offline-capable ephemeris
with explicit date coverage and provenance stored alongside the generated
result. This keeps the planner reproducible and usable without a network
request. The target-result contract should expose the same rise, set,
culmination, altitude, interval, and reason fields as deep-sky targets.

**Alternatives requiring an explicit choice.** A larger, higher-accuracy
bundled model increases artifact size and maintenance cost; an external
provider can improve coverage but requires a cache, offline behavior, source
version display, and defined failure semantics. No planet, comet, or asteroid
implementation should begin until the source, accuracy target, supported date
range, and out-of-range behavior are chosen.

### Unknown theme values during web restore

**Decision.** Normalize legacy, empty, and unknown theme values to Workbench in
web restore, matching desktop settings and the documented compatibility rule.

**Why.** A backup should be deterministic across shells. Keeping the current
theme for an unknown value is defensively conservative, but it makes the same
backup behave differently depending on the user's current preference.

**What was rejected.** Treating `null` as a third semantic theme or allowing
unknown values to pass through to DOM attributes would create compatibility and
styling ambiguity.

**Where to enforce.** Use one canonicalizer in `web/webstore.js`, update the
backup tests, and keep the `data-theme` value fixed to `workbench`.

### Feature-data principle

**Decision.** New planner features should return structured, explainable data
from shared core calculations first, then let each shell format that data for
its UI. Reasons, intervals, provenance, and uncertainty must not be reconstructed
independently in desktop and web presentation code.

**Why.** The planned target-explanation, transit, horizon, and catalog-provenance
features all need the same facts in both shells. Keeping only a final boolean or
formatted sentence in the UI will recreate the parity drift that the shared core
was introduced to prevent.

**Where to enforce.** Add typed/plain-object contracts to `core/`, freeze
fixture-level examples, and require both shells to consume those fields without
duplicating astronomy or planning math.

### Accessibility foundation

**Decision.** Treat charts as visualizations with a parallel semantic surface:
each canvas has an accessible role and a concise live-updated text summary;
planner tabs expose selected state; dialogs dismiss with Escape; focus-visible,
high-contrast, and reduced-motion behavior are explicit in both shells.

**Why.** A canvas can be perfectly legible to a sighted user while exposing no
target state, timing, or editor status to a keyboard or screen-reader user.
The summary is intentionally concise and derived from the same structured
result the chart draws, so it does not become a second planning implementation.

**What remains.** This is the source/UI contract, not a completed conformance
claim. Focus restoration after closing dialogs and menus, dynamic announcements
for long-running planner updates, and manual testing with actual assistive
technology remain required before calling accessibility complete.

**Where enforced.** `static/index.html`, `web/index.html`, both shell chart
renderers, `static/style.css`, `web/style.css`, and the paired browser checks
`desktop-accessibility-essentials` / `web-accessibility-essentials`.

---

## 0.6.33 fix pass — the web policy is enforced from the DOCUMENT, not a header

**Decision.** `web/index.html` carries the policy as
`<meta http-equiv="Content-Security-Policy">`, with the same directives as
`web/.htaccess` except `frame-ancestors`. The production smoke accepts either
carrier (a response header still wins when present) and a missing policy is a hard
failure.

**Why.** Measured 2026-09-17 through Chrome on the live origin: `/astro/` answers
`server: nginx` + `content-type: text/html` with NO policy header and NO meta
policy. nginx serves the document itself, so `web/.htaccess` never applies to it,
and the Plesk console on this host exposes no nginx directive field. The choices
were a meta policy, a hosting-panel action that is not available, or leaving the
public origin with no enforced policy at all while a check claimed otherwise -
which is precisely the false assurance BUG-003 exists to remove.

**What the meta carrier cannot do, stated plainly.** Browsers IGNORE
`frame-ancestors`, `report-uri`/`report-to` and `sandbox` in a meta policy, so
those are omitted there and the check reports them as findings if anyone adds them
(claiming protection that does not exist is the bug, not the workaround). A meta
policy is also weaker than a header in principle: it is parsed with the document,
so a flaw that corrupts the response before the tag could drop it. Against
injected MARKUP it is sound - a `<meta>` placed in `<body>` is ignored - which is
the threat this origin actually faces.

**Required directive that looked like a relaxation.** `style-src 'self' 'unsafe-inline'`
in BOTH carriers. The shell styles several controls with inline `style=`
attributes, and `style-src 'self'` blocks them with NO console message: measured
2026-09-17, the range inputs and theme swatches silently lost their styling while
the page booted normally (`Refused to` messages: 0). Inline STYLE cannot execute,
so this is not the same class of exemption as `script-src 'unsafe-inline'`, which
stays forbidden. The production smoke now measures a computed background on an
inline-styled element, so the failure mode cannot be silent again.

**Rejected.** (a) Leaving it open until the host offers nginx directives - the
exposure is on the user's data today, and the workaround costs one file. (b)
Serving the app through Plesk's Node.js/PHP handlers to gain a header - a large
deployment change for a marginal carrier upgrade. (c) Quietly weakening the smoke
to pass without a policy - that is the defect, restated.

**Enforced by.** `tests/test_prod_csp.py` (both carriers against one rule table,
the no-header-only-directive rule, and the shared directives), and `web-prod`,
which reads the live carrier and measures the inline-style outcome.

## 0.6.33 fix pass — the Tonight view publishes what the SCRUBBER names

**Decision (BUG-005).** `web/app.js` publishes `#view[data-ns-gen]` /
`[data-ns-sel]` after every completed Tonight paint. `data-ns-sel` is the selected
instant on the scrubber's OWN grid (`scrubTimeMs`), and the browser check polls
`wait_tonight_after(gen, sel=<requested instant>)` until the view carries exactly
that value. `applyTonightMarker()` publishes the generation plus `Date.now()` -
deliberately a value a wait can never match - whenever the paint does not belong
to the current selection.

**Why.** The check slept a nominal 120 ms while the app debounced the same 120 ms
and then deferred its ranking by another tick, so it sampled the previous
selection about as often as the new one (25/26 full-sequence failures, green in
isolation). Waiting for "a newer paint" is not enough either: the boot sequence
can leave a stale marker behind, and a check that accepted any generation bump
sampled whatever happened to be on screen.

**Found by turning the check on (three real defects, all fixed at the source).**
(1) `renderTonight` captured `S.skyTime` when it was CALLED, but its compute runs
~30 ms later - a selection clamped in between painted cards for the old instant;
it now reads the live value inside the deferred callback. (2) `clampSkyTime()`
announced `sky:time` only when it CHANGED the time, so at boot the announcement
landed before the scrub listener was registered and both the slider and the
Tonight view kept the PRE-clamp selection; it now announces unconditionally
(`syncScrub()` re-pins the slider from the current range on every announcement).
(3) `#tb-scrub` is `<input type="range" step="15">`, so the browser SNAPS what
`syncScrub()` writes (write 204, DOM 210) and a scrub writes that snapped value
back into `S.skyTime` - a marker publishing raw milliseconds could never equal
what the scrubber names (measured 6 minutes apart).

**Rejected.** (a) Comparing raw milliseconds - mismatch by construction for any
page loaded at a non-zero second, and by one step for any load whose offset is not
a multiple of 15. (b) Publishing the raw `S.skyTime` and teaching the check to
tolerate a step of slop - that is a sleep by another name; the check must demand
the exact instant it requested. (c) Polling "rows changed" - the lists can be
identical between two adjacent samples, so it cannot distinguish "painted" from
"stale". (d) Only clearing the marker on a moved selection - a waiting check would
then hang on a boot-time stale paint instead of reporting it.

**Enforced by.** `web-tonight-render-marker-converges` and the corrected
`web-tonight-pool-includes-unmagnituded-standard-rows` in the browser gate
(`--web`: 18/18), plus `tests/test_tonight_marker.py` for the offline contract
(including that the two sides agree on the attribute names).

## 0.6.33 fix pass — a restore is staged, not streamed into place

**Decision.** `apply_import_zip` runs three phases in a fixed order: (1) validate
the ENTIRE bundle with `database.prepare_import_bundle` (a side-effect-free
function the transaction also uses, so the pre-flight check and the insert loop
cannot disagree); (2) stage every payload into `<target>.import-<n>.part` on the
destination filesystem while moving any file it would replace into a
`payload.journal` directory beside it; (3) run the database transaction, and only
on success swap the staged files in and delete the journal. Any exception before
the swap restores the journal and removes the staged files.

**Why.** The audit reproduced the failure shape: `_write_payloads` ran BEFORE
`Database.import_bundle` did its own validation, so a bundle with a valid
colliding payload plus one invalid record replaced the user's file
(`ORIGINAL` -> `REPLACED`) and then reported "the import failed" - which reads as
"nothing happened". Validation had to move before the first write, and "written
first" was not enough on its own: PY-03's temp-file-then-rename made ONE file
atomic, not the RESTORE.

**Rejected.** (a) A second validation copy inside `backup.py` - two predicates
drift, which is exactly how PY-06/SP-05 happened; the shared function is used by
both callers. (b) Backing up the whole payload tree (a full copy of a multi-GB
image library before every restore) - the journal holds only the files this
restore actually replaces. (c) Hidden `.bak` copies next to the payloads - the
panorama/library readers would have to learn to skip them, and a crashed restore
would leave disguised payload files behind; one `payload.journal` directory is
obvious and removable. (d) Making the zip extraction itself transactional - the
zip is untrusted input, so validating it up front is both simpler and safer than
rolling back arbitrary writes.

**Enforced by.** `tests/test_backup.py` (the rejected-restore cases assert both
the database rows AND the payload bytes are unchanged, and that no `.part` file or
journal survives), plus the existing PY-03/SP-01/PY-06 cases which stay green.

## 0.6.33 fix pass — the desktop CSP allowlists the bootstrap by hash

**Decision.** `app/server.py::CSP_HEADER` is
`script-src 'self' 'sha256-lOMdolhkUqnnqFBUwwNKJYbMdAlQvEBKqybJqHdppbw='` - no
`'unsafe-inline'`. The two inline `onerror=` thumbnail fallbacks in
`static/js/targets.js` and `static/js/tonight.js` became `addEventListener`
handlers so nothing else needs the exemption. `tests/test_update_check_csp.py`
recomputes the hash from `static/index.html` and fails if either side drifts.

**Why.** `'unsafe-inline'` in `script-src` also permits inline EVENT HANDLERS.
With it, an attribute that reached the DOM unescaped executed: the audit rendered
the imported custom id `u_x" onmouseover="globalThis.__pwned=1` as a working
handler through `static/js/setup.js`. Two independent fixes were needed, and both
shipped: never let untrusted data into the database unvalidated (the `u_` + token
rule, `imagetyp` normalization), and never allow the markup to execute even if it
gets there (attribute escaping, no inline handlers, a script-src that forbids
inline code).

**Rejected.** (a) Keeping `'unsafe-inline'` and relying on the escaping alone -
one missed `esc()` would be a live XSS again. (b) Moving the desktop theme
bootstrap out of `index.html` into a module - it must run before first paint, and
`main.js` runs after; the hash costs nothing and matches what `web/.htaccess`
already does for the web shell. (c) Dropping `style-src 'unsafe-inline'` too -
inline STYLE cannot execute, and the shipped themes plus the JS use `style=`
throughout the UI.

**Enforced by.** `tests/test_update_check_csp.py::test_the_desktop_csp_hashes_the_one_inline_bootstrap`,
`tests/js/dom_escape.mjs` (mutation-proven: removing one `esc()` fails it) and the
browser gate.

## 0.6.33 fix pass — imported record ids are tokens, not just prefixed

**Decision.** An imported custom target id must start with `u_` AND satisfy
`paths.safe_token()` (`database.custom_id_problem`, used by both the pre-flight
validation and the insert loop). An imported image `imagetyp` is normalized
through `ingest.classify_frame` at the boundary, so only light/dark/flat/bias can
be stored.

**Why.** Both values are interpolated into HTML ATTRIBUTES by the desktop shell
(`data-delcust="${o.id}"`, and the archive's per-session type rollup in a `title`),
and `imagetyp` is free-form TEXT in the database. The `u_` prefix was the only
rule, so `u_x" onmouseover="..."` was accepted and executed.

**Rejected.** (a) Escaping only in the renderers - it leaves the hostile value in
the database, where the next renderer (or an export/import round trip) reads it
again. (b) Rejecting an `imagetyp` the classifier does not recognize - the FITS
path has always mapped an unknown IMAGETYP to `light`, and turning that into a
hard import failure would reject bundles this app itself exported from an older
library. (c) A new "unknown" frame class - it would change the library's grouping
and `lights/` folder mapping for a value that has never had one.

**Enforced by.** `tests/test_backup.py` (the id table and the hostile-imagetyp
round trip) and `tests/js/dom_escape.mjs` (the rendering half, independent of the
boundary).

## 0.6.33 fix pass — the production smoke reads the DOCUMENT's CSP

**Decision.** `scripts/check_browser.py --prod-url` reads
`Content-Security-Policy` from the `page.goto()` response only. A missing document
policy is a hard failure; the `version.json` / `catalog.manifest.json` fallback is
gone. The document rule drops the web shell's inline-bootstrap-hash requirement
(the entry point may be the static desktop shell) but keeps every other policy
rule.

**Why.** A CSP protects only the response that carries it. Measured 2026-09-15:
`/astro/` and `/astro/app.js` served no policy while `/astro/version.json` did, so
the old fallback reported "the host applies the policy we ship" for a deployment
where every browser ran the HTML unprotected. That is worse than no check: it is
false assurance about the exact property the check exists to prove.

**Rejected.** (a) Deleting the production smoke - the host-layer gap would then be
invisible. (b) Keeping the fallback and adding a warning - warnings in a gate log
are not evidence. (c) Fixing it in `web/.htaccess` alone - nginx serves
`.html`/`.js`/`.css` itself on this host, so the Apache file never sees the
document (this is why the fix is an nginx directive plus a strict check).

**Enforced by.** `tests/test_prod_document_csp.py` (the rule table, the
`document=True` call site, and the absence of any other-path probe) and, live,
`--prod-url https://nightseam.de/astro/` - which now FAILS until the nginx
directive is applied. That failure is the point.

---

## 0.6.32 — No distance field, and the image lookup uses the designation

**Decision (a).** `distance` is gone from the catalogue: out of
`build_adv_catalog.py`'s row layout, out of the CSV and the hand-kept supplement,
out of the seeder's INSERT and column reader, out of the API payload and both
detail views. `Database._drop_retired_fields()` strips it from `SELECT *`
results, so an existing user database (whose table still carries the column -
user schemas are never re-shaped) cannot ship it either.

**Why.** It was ALWAYS empty - the curated list that once filled it was deleted in
0.6.26 - and OpenNGC has no distance column. Measured on the shipped sources:
`Pax` exists for 709 of 12,160 rows and for galaxies it is a foreground star's
parallax (M31: 6.0 mas => 167 pc against a true 780 kpc); `Redshift` covers 10,626
rows but is not a distance - M101's z gives 11 Mly against a true 23 Mly, M31 and
M33 are blueshifted (a naive conversion yields a negative distance), and 2,893
rows sit below z = 0.01 where peculiar motion dominates. A field that can only be
filled with a wrong number is worse than no field.

**Rejected.** (a) Filling it from `Pax` for the ~630 plausible rows: nothing tells
the user whether a parallax belongs to the object or to a star in front of it.
(b) Filling it from redshift with H0 = 70: defensible for distant galaxies, wrong
by 2x for exactly the famous nearby ones. (c) Keeping the empty column "for
later" - the empty column is what prompted the question.

**Decision (b).** The Wikipedia lookup tries the full designation first.
`core/catalog.js::wikiTitles()` returns the stored `wiki` title (none ships any
more), then `Messier N`, then the NGC/IC designation, then the display name; both
shells skip DISAMBIGUATION pages, and the detail view's Wikipedia link uses the
same first candidate (the web then rewrites it to the canonical title the API
returns, post-redirect).

**Why.** The display name of a Messier row without a common name IS the bare
`M101`, and `M101` on Wikipedia is a disambiguation page (motorways, highways, a
rifle). Measured: `Messier 101` and `NGC 5457` return BOTH a Wikidata P18 image
and a Wikipedia thumbnail; `M101` returns a Wikidata image but no page image - so
the old single-shot lookup gave up and the user saw "no photo on Wikipedia".

**Rejected.** (a) Free-text search - the module's own history (unrelated pages for
"M29") and the repo's rule against fuzzy matching. (b) Remembering a rate-limited
attempt as "no photo": probing showed the 6th rapid request returns HTTP 429, and
the web used to cache that as definitive for 30 days; it now stores only a
definitive failure and says "unavailable right now" otherwise.

**Enforced by.** `test_wiki_titles_avoid_the_messier_disambiguation_trap` (the
`wikititles` engine), `tests/test_catalog_integrity.py` (no editorial columns in
the CSV), `tests/test_supplement.py`, and the `data`/`col` test tuples.

## 0.6.31 — Progress must not move the layout

**Decision.** A live status may change its TEXT, never the geometry. The
catalog's count and progress live in a fixed-height row with a reserved status
width; the web table uses `table-layout: fixed` so a cell filling in ("…" → "42%")
cannot resize a column; the busy chip sits in a reserved `.busy-slot` in the
topbar of BOTH shells, and the slot reserves its HEIGHT as well as its width
(because at 1366 px the topbar already wraps, so an empty slot is a zero-height
row); the desktop's `#resultCount` is a fixed-width right-aligned block.

**Why.** Measured before/after: the desktop topbar grew 93 → 111 px whenever the
busy chip appeared, pushing the whole app down; the catalog table widened the PAGE
to 721 px at a 360 px viewport; the percentage columns redistributed on every
cell update. Only reserving WIDTH is not enough - the wrapping topbar made the
slot's height the real culprit.

**Enforced by.** `test_progress_and_status_never_move_the_layout` plus the browser
checks, which MEASURE table top, column widths, stats-row height and topbar height
before/while/after progress runs.

---

## 0.6.29 — Supplement batch 2: the popular targets OpenNGC's *scope* excludes

**Decision.** `app/data/supplement.csv` gained nine rows (16 total, catalogue
12,176): the Tulip Nebula (`sh2-101`), Simeis 147 / Spaghetti (`sh2-240`), the
Flying Bat + Squid (`sh2-129`), the Dolphin Head (`sh2-308`), the Lion Nebula
(`sh2-132`), Barnard 150 / Seahorse (`b150`), LBN 437, LDN 1622 and the Pipe
Nebula (`pipe`).

**Why these nine.** They are the first tier of a checklist of ~70 famous hobby
targets the shipped catalogue could not answer for. Every one is absent from
OpenNGC **structurally** (Sharpless/Barnard/LDN/LBN designations are outside its
NGC/IC + addendum scope) rather than dropped by the type filter, and the popularity source
already ranks every one of them - all nine above the Standard-mode cut
(`STANDARD_TOP_N` = 200), so the app's own popularity data selects them into
Standard mode with no hand-made rule. The same checklist cleared the catalogues
everybody asks about: Messier is 109/110 (M102 is upstream `Dup` of M101),
Caldwell's non-NGC members are already in the addendum (`c9` Cave, `c41` Hyades,
`c99` Coalsack, plus `c14` as a pair row), the Small Magellanic Cloud is
`ngc292`, M24 is `ic4715` and the Witch Head is `ngc1909` (upstream's IC 2118 is
the `Dup` pointer at it).

**Magnitude policy: `vmag` stays EMPTY.** An extended or dark nebula has no
credible integrated V magnitude, and the pre-0.6.26 curated list's proxies
(Barnard's Loop "5.0") are exactly the editorial data 0.6.26 removed. Empty is
also what the shipped addendum already does for `b33` (Horsehead), `c9`, `c99`
and `mel111`. The consequence is intended, not a bug: per `magVisible`, a row
with no magnitude appears only once the magnitude slider is at its maximum, so
these are plan-able at full depth and never at a brighter limit.

**Naming rule (id care).** Use the object's own catalogue designation when it has
one (`sh2-101`, `b150`, `lbn437`, `ldn1622`); use a NAME token when the identity
*is* a proper name with no single catalogue number (`pipe`). Every alternative
designation goes into `other`, so search still finds it. Never add an id whose
hyphen/space-stripped form equals another row's id: `M2-9` (Minkowski's
Butterfly) normalizes to `m29` = NGC 6913, so it is NOT usable as an id and needs
the alias treatment if it is ever added.

**Provenance.** Astrometry is SIMBAD ICRS/J2000 (`Sh2-101`, `Sh2-240`, `Sh2-129`,
`Sh2-308`, `Sh2-132`, `Barnard 150`, `LDN 1622`, `LBN 437`, and `NAME the Pipe
Nebula`, whose 240x180 arcmin size is a measurement citing 2018MNRAS.474.4672L).
Sizes are published values (Sharpless 1959, Lynds 1965 LBN, Wikipedia); LDN 1622
has NO published angular size, so its `size_am` is empty (like `c99`).
`distance`/`wiki`/`blurb` stay empty - the catalogue carries no prose.

**Rejected.** (a) Leaving the objects out because OpenNGC does not list them -
the app is a planner, not an OpenNGC mirror. (b) Bulk-importing Sharpless/LDN:
Sh2 alone is 313 objects and LDN is 1,800+, their positions come from papers with
their own licensing (not OpenNGC's CC BY-SA), and they are overwhelmingly not
hobby targets. (c) Inventing magnitudes to make them visible at the default limit
(see the magnitude policy). (d) Raising `STANDARD_TOP_N` so the nine displace
nobody - rejected for now: 200 is the documented promise, and the ranking is what
makes the displacement defensible (these nine are genuinely more observed than
the nine they replace).

**Enforced by.** `tests/test_supplement.py` (membership, types, no editorial
text, no invented magnitude, searchable designations, the normalization guard),
the advertised size in `tests/test_catalog_integrity.py`, `CATALOG.md`.

## 0.6.28 — The catalogue is OpenNGC *plus* a documented supplement (batch 1)

**Decision.** `app/data/supplement.csv` was introduced with seven objects OpenNGC
cannot represent (Medusa Nebula, Headphone Nebula, Barnard's Loop, Alpha Persei
Cluster, Sadr region/IC 1318, M40, M73) - objects it either lacks or files as
non-objects. 0.6.29 added batch 2 above; total catalogue: 12,176.

**Why.** They are real, plan-able targets that the pre-0.6.26 curated list
carried, and OpenNGC either lacks them or files them as non-objects (`IC 1318`
is typed `*` for gamma Cyg, `M73` `Other`, `M40` `**`). Dropping them silently
made the app worse at the exact moment it became more complete.

**Rejected.** (a) Staying "OpenNGC only" and losing the objects. (b) Editing the
OpenNGC CSVs. (c) A second curated list - the supplement is data in the
catalogue's own column layout, appended by the generator, with its own test that
pins the exact membership.

**Enforced by.** `tests/test_supplement.py` (membership, types, no editorial
text), the advertised size in `tests/test_catalog_integrity.py`, `CATALOG.md`.

## 0.6.28 — Keep the editorial text gone, keep popularity as it is

**Decision.** The catalogue carries no blurbs, distances or Wikipedia titles;
popularity is not refreshed on a schedule or checked for staleness.

**Why.** OpenNGC has no prose, and inventing a second prose source would
re-introduce exactly the curated/OpenNGC split the 0.6.26 rebuild removed. The
The popularity source ranking moves slowly (a live refresh shifted scores by ~0.5 % and no
standard-mode member for score reasons), so a refresh is a deliberate act, not a
chore.

**Superseded in 0.6.33.** The network refresh implementation and `--live` flag
were removed completely. The committed popularity data is a frozen snapshot;
`scripts/match_popularity.py --live` now exits 2 instead of fetching.

**Rejected.** Re-attaching the old curated prose as a decoration layer (kept as
an option, not taken); a staleness warning in the guards.

## 0.6.26 — The catalogue IS OpenNGC; standard mode is the 200 most popular

**Decision.** The 197-row hand-curated list is deleted. Every row comes from
OpenNGC (`NGC.csv` + `addendum.csv`, then the supplement); `objects` holds the
200 highest-scoring objects and `advanced_objects` the rest.

**Why.** Two sources meant two truths for the same object (positions, types,
sizes), a hand-maintained dedup rule between them, and a catalogue that could not
be reproduced from its sources - the committed CSV could not even be regenerated
by its own script.

**Rejected.** (a) Keeping both lists. (b) Standard mode = a brightness cut
(arbitrary and not what "popular" means). (c) Standard mode = everything (loses
the point of a quiet default view). (d) Merging curated text into OpenNGC rows
(rejected with it).

**Enforced by.** `Database.seed_catalog()` (one CSV fills both tables),
`tests/test_catalog_integrity.py`, `tests/test_catalog.py`
(`standard_ids`), `CATALOG.md`.

## 0.6.26 — The seeder compares id SETS, not counts

**Decision.** `seed_catalog()` rebuilds both tables whenever the stored ids
differ from what the CSV + popularity rule select.

**Why.** A count check cannot see a popularity change (still 200 rows, different
200) and cannot repair an old curated-era database. Both tables are pure seed
data, so a rebuild is safe and needs no migration.

**Rejected.** Insert-only seeding with a version stamp in `settings`; a real SQL
migration.

**Enforced by.** `tests/test_advanced_catalog.py`
(`test_a_pre_openngc_database_is_rebuilt_on_open`,
`test_reseeding_is_idempotent`).

## 0.6.26/0.6.27 — Popularity must be deterministic

**Decision.** `scripts/match_popularity.py` scores the **highest** match over
every designation of a row, normalizes padded numbers, and carries a small alias
table for cross-catalogue names.

**Why.** The old matcher iterated a `set` and broke on the first hit, so M27 came
out as 73,260 (`M 27`) or ~4 (`NGC 6853`) depending on `PYTHONHASHSEED` - the
standard-mode selection built on it was not reproducible. Padding and naming
differences silently cost famous objects their score (the LMC, the Horsehead).

**Rejected.** Designation priority lists (fragile); fixing it by freezing one
lucky output.

**Enforced by.** `scripts/match_popularity.py` docstrings,
`tests/test_catalog.py` (identity, not numbers), `CATALOG.md`.

## 0.6.27 — Legacy library ids are migrated; unknown ones re-resolve at display

**Decision.** `LEGACY_ID_MAP` (114 entries) + `Database.migrate_legacy_object_ids()`
rewrite stored `images`/`import_batches` ids on first open; `app/imglib.py`
additionally re-resolves an id the catalogue does not know from the capture's own
OBJECT header/coordinates.

**Why.** A capture stores the id it resolved to at ingest time, so the catalogue
switch would otherwise show an existing library as "Unknown object". The two
mechanisms cover different cases: known renames are rewritten once, unknowns (a
build that is gone, a hand-edited library) are resolved for display.

**Rejected.** Leaving it to the user's `/api/library/reindex`; a migration that
touches user data beyond the two id columns.

**Enforced by.** `tests/test_library_ids.py`.

## 0.6.27 — The scoring-parity fixture carries its own inputs

**Decision.** `tests/fixtures/scoring_goldens.json` stores the 697 input objects
its stats were captured for.

**Why.** The engine used to rebuild its inputs from `web/catalog.json`, so any
catalogue change looked like a scoring regression - removing the curated list
"failed" the proof without a single scoring change.

**Rejected.** Regenerating the goldens (destroys the pre-change baseline).

**Enforced by.** `tests/test_scoring_parity.py`, `tests/js/scoring_parity.mjs`.

## 0.6.24/0.6.25 — Cache tokens are verified against a baseline, not a tag

**Decision.** `scripts/check_js_tokens.py` embeds a `{module: {token, sha256}}`
baseline; bytes changed while the token still equals the baseline token = FAIL.
Refreshing is only via `--update`, which refuses while a missed bump exists.

**Why.** v0.6.24 shipped 0.6.23 tokens naming 0.6.24 bytes, so returning visitors
kept every old module; no guard could see it. Comparing against `HEAD` or a tag
misses the post-tag repair shape and depends on release timing.

**Rejected.** Auto-bumping tokens in a build step; trusting review.

**Enforced by.** the guard's `--self-test`, `tests/test_cache_tokens.py`,
`tests/test_pre_tag_check.py`.

## 0.6.25/0.6.27 — `tests/conftest.py` overrides `tmp_path`

**Decision.** The fixture uses `logs/.pytest-tmp` (gitignored, sandbox-owned)
instead of pytest's basetemp.

**Why.** Under the agent sandbox `--basetemp=.pytest-tmp` can acquire an
owner-SID-only DACL, so every `tmp_path` test ERRORS at cleanup with WinError 5 -
an environment artifact that made the suite look broken (142 errors, 0 assertion
failures). Keeping the workaround in `conftest.py` means a plain
`python -m pytest tests/` is clean, instead of needing a scratch plugin that a
fresh clone would not have.

**Rejected.** Committing the plugin and a `-p` flag; adding `-p no:cacheprovider`
to every documented command.

**Enforced by.** `tests/conftest.py` (documented) + `AGENTS.md`.

## 0.6.20 — One JS core; Python astronomy deleted (Phase C)

**Decision.** `core/` is the only astronomy/planning implementation; `/api/night`
and `/api/object/{oid}` are gone; Python is storage/platform/IO.

**Why.** Three implementations of the same formulas had drifted (an X-axis
precession bug survived in all three because the regression goldens came from the
same lineage).

**Rejected.** Keeping the Python oracle behind a flag.

**Enforced by.** `scripts/check_core.py` (`MOVED_PY`), `tests/test_core_drift.py`,
`tests/js/reference_anchors.mjs` as the correctness authority.

## 0.6.12 — Catalogue ids are globally unique

**Decision.** An id is unique across curated + advanced rows together; both the
generator and the schema enforce it.

**Why.** Two rows sharing one id made the web `byId` map and `db.get_object()`
disagree about which object the id named.

**Rejected.** Deduplicating at runtime with a map.

**Enforced by.** `_assert_global_unique`, `tests/test_catalog_integrity.py`.

## Docs policy

**Decision.** `AGENTS.md` is canonical for invariants, commands, release and
deploy. `CATALOG.md` covers the data pipeline. `DECISIONS.md` (this file) records
reasoning. `README.md` is the user-facing feature list, `DESIGN.md` the UI
language. `BUGS.md` is the only active defect backlog. Closed review artifacts
belong in Git history, not in the working tree.

**Rejected on purpose.** A `WORKFLOWS.md` and an `ARCHITECTURE.md`: both would
duplicate sections of `AGENTS.md` and drift out of sync, which is worse than not
having them. A `CONTRIBUTING.md` and a second `CHANGELOG.md`: no external
contributors, and `landing/changelog.json` + the `CURATED` table in
`scripts/build_changelog.py` already are the changelog.

## CO-07 - the two shells' "% of night" windows are NOT identical (documented, not unified)

**Measured during the 0.6.32 review (the report is retained in Git history):** the web
scores on a dusk-anchored 6-min grid; the desktop clips its noon-anchored
241-sample grid to `dusk..dawn`. The denominators differ by one sample (80 vs
79) and 20-66 of the 200 standard-mode rows differ by up to 4 pp (Berlin
2026-09-22, Berlin 2026-06-21, Tenerife). Since 0.6.30 the web's Min-visibility
gate keys on the WEB number, so list membership can differ between the shells.

**Decision: document the divergence rather than unify it in a fix batch.** The
two candidate fixes (snap the web's scoring window to whole noon-grid steps, or
pass the core an explicit sample range) both CHANGE user-visible planning numbers
on the public web app, and the second reaches into the time model that the scrub,
the charts and the tier/min-visibility browser checks are built on. That is a
release-level change with its own release note, not a correctness patch.

**Consequence:** `AGENTS.md`'s claim that "the web scores the same window as the
desktop on a 6-min grid" was FALSE and has been replaced with the measurement
above. Both shells still compute every number inside `dusk..dawn` (that
invariant holds); they merely sample that window on different phases.

## 0.6.33 batch - other decisions taken while fixing the 0.6.32 review

- **`CD-05` matcher fix without a re-bake.** The deterministic tie-break is fixed
  in `scripts/match_popularity.py` (highest score wins; equal score -> first in
  source order), but `app/popularity_data.py` is deliberately NOT regenerated:
  on the shipped snapshot the only affected key is `ngc6542` (3 -> 115), which is
  far outside the standard-mode cut. Re-baking would rewrite a tracked module and
  can re-select standard mode, so it stays a separate, deliberate act.
- **`SP-02` CSP keeps `script-src 'unsafe-inline'`.** `static/index.html`'s
  synchronous theme bootstrap (`XMLHttpRequest GET /api/state`) must run before
  first paint, so inline script stays permitted; remote script is still fully
  blocked (`'self'`), the JSONP path is gone, and the update check now runs
  server-side via `POST /api/update-check`. Verified against the real server:
  the header is served, the inline bootstrap runs, and an inline `onerror=`
  attribute still fires (so the two `onerror=` fallbacks in
  `static/js/{targets,tonight}.js` keep working - the feared "cosmetic
  regression" does not exist).
  **Audit correction, 2026-09-17:** permitting inline handlers is now a real
  security boundary, not only a cosmetic choice. Imported custom IDs and FITS
  `imagetyp` values can reach unescaped HTML attributes. BUG-002 remains open;
  the replacement direction is DOM/attribute-safe rendering plus a hashed
  bootstrap and removal of `'unsafe-inline'`.
- **`CD-02` ships the `search` column, at a size cost.** `web/catalog.json` grows
  from 3,834,258 to 5,088,280 bytes (+33%) because the OpenNGC `search` blob is
  now in the payload; that is what makes 25 rows (e.g. `tarantula`,
  `coathanger`, `silver coin`) findable on the web. It is text, so gzip absorbs
  much of it, but the trade is deliberate and worth re-measuring if the payload
  is ever streamed.

## Shell unification pass (0.6.33 work tree) - one rule, one loop, one codebase

The owner's directive: the web shell is further along and more current, both
shells should run on mostly the same code so a change lands in both at once, and
the BETTER implementation is used for both - but only where it works in a
browser too, and never at the cost of a regression.

**What was unified (real cross-shell code, not prose):**

- `core/visibility.js::inTonightPool(vmag, isAdv, advCap)` +
  `vmagKnownAndUnder` + `ADV_TONIGHT_MAG_CAP` + `TONIGHT_MAG_UNCAPPED` - which
  objects may reach the Tonight list is ONE rule now, called by
  `web/app.js::renderTonight` and `static/js/tonight.js::renderTonight`. This
  FIXES a defect rather than only deduplicating: the web's inline
  `o.vmag != null` dropped 45 of the 200 standard-mode objects (IC 1396, the
  Running Man, NGC 281, the Flame, the Tulip, Simeis 147, the Double Cluster,
  the Pipe Nebula, ...) while the comment above it claimed desktop parity. The
  unknown-magnitude answer is deliberately YES - the same reasoning as
  `magVisible`'s "a no-magnitude object shows at the slider maximum".
- `core/scoring.js::scoreNightTracks(..., ctx.range = [lo, hi])` - the scoring
  SPAN is a parameter, so the desktop (241-sample noon->noon payload for its
  charts, clipped to dusk..dawn) and the web (grid == the dark window, no range)
  run the SAME loop. `derive.js::recomputeNightDerived` no longer owns a second
  aggregation; that second loop is what let CO-07 drift. The desktop's
  `best`/`best_above`/`score`/`score_moon` contracts and the
  `tests/js/scoring_parity.mjs` characterization goldens are preserved
  bit-for-bit (`bestStart` is captured incrementally, never recomputed as
  `jd - run*step`).

**What deliberately did NOT move into `core/`:**

- **CSS.** `web/style.css` + `web/themes.css` and `static/style.css` +
  `static/themes.css` share the Workbench role language, not the files. The two
  shells have different DOMs (a 6-pane tab app vs a JS-rendered single view),
  so a shared stylesheet would be a rewrite with no correctness gain. There is
  one structural style; legacy theme values normalize at load boundaries.
- **Storage, backup and data delivery.** IndexedDB + `localStorage` versus
  SQLite + FastAPI is a platform split, not duplication. The web's
  stage-validate-commit restore remains the stronger model. **Audit correction,
  2026-09-17:** the desktop's payload-first path is not atomic: a later database
  validation failure can leave an existing payload overwritten. BUG-001 and
  BUG-004 require side-effect-free preflight plus payload rollback; the safety
  copy alone is recovery evidence, not atomicity.
- **The advanced-mode magnitude cap.** The web caps the Tonight pool at mag 9
  because scoring ~5,900 objects per repaint is not viable in a browser. That is
  a PERFORMANCE parameter, so it is passed in per shell (`TONIGHT_MAG_UNCAPPED`
  on the desktop, which carries the whole catalog in its payload anyway) instead
  of being duplicated as a second inline expression. Same rule, different
  budget.
- **The grid anchor (CO-07).** Still open on purpose: aligning the web's grid to
  the desktop's noon->noon payload would move user-visible web numbers
  (`% of night`, the scores, the clear window). The divergence is now confined to
  the anchor, because the arithmetic is shared.

**Consequence: no two shells, one codebase for the domain.** The rule for the
next change is the same as the one this pass followed: if a decision can be
expressed as a pure function of data, it belongs in `core/` and both shells call
it; if it needs the DOM, storage or a network, it stays in the shell and gets a
parity pin instead.

### The scoring grid anchor stays as it is (CO-07, closed as DECIDED)

The two shells score the same dark window with slightly different sample sets:
the desktop's payload grid is a 24 h noon->noon day for its charts and is clipped
to dusk..dawn (87 samples at 47.5 N on 2026-03-14), while the web's grid IS
dusk..dawn and lands on 88. That one sample moves `% of night` by a point and a
score by up to 0.07 on 12 of 14 probed rows (and 20-66 of 200 standard rows by up
to 4 pp in the original 0.6.32 survey).

**Rejected: aligning either side.** Re-anchoring the web's grid to noon->noon
changes numbers the web has shipped for releases (and its `View full day` span),
while re-anchoring the desktop's payload breaks the chart margins and the
`scrubgrid` contract. Both are user-visible behaviour changes traded for a 1 pp
cosmetic difference.

**Rejected: making the desktop pass a sample list instead of an index range.**
It would let both engines share identical sample times, but it changes the
already-characterized `tests/js/scoring_parity.mjs` goldens for no user-visible
gain.

**What WAS done (shell-unification pass):** the arithmetic is shared
(`core/scoring.js::scoreNightTracks` with `ctx.range`), so the divergence is
confined to the ANCHOR - a grid choice each shell makes for its own rendering -
instead of living in two independent aggregation loops. Pinned as "one loop, one
span parameter" and documented as a deliberate anchor difference.

### The repository ships a web CSP policy file

`web/.htaccess` sets `default-src 'self'`, `script-src 'self'` plus the SHA-256
of the ONE inline theme bootstrap (deliberately NOT `'unsafe-inline'`:
`tests/browser/harness.py` recomputes the hash, and the web shell has no inline
handler at all), `style-src 'self'`, `img-src 'self' data:
https://upload.wikimedia.org`, `connect-src 'self' https://en.wikipedia.org
https://api.open-meteo.com`,
plus `base-uri`/`form-action`/`frame-ancestors`/`object-src` and
`Referrer-Policy`/`X-Content-Type-Options`. The desktop has carried an equivalent
policy in `app/server.py` since SP-02; the STATIC shell is the public origin and
had none, which is the wrong way round.

The file is deployed by hand (the FTPS uploader skips dotfiles).
`tests/test_prod_csp.py` pins the policy content and inline hash offline. **Audit
correction, 2026-09-17:** the current production smoke does not prove document
protection; it accepts a policy found on a JSON response when the HTML lacks the
header. BUG-003 requires the live HTML response itself to carry the policy.

### Cache-token register history (moved out of AGENTS.md)

AGENTS.md no longer carries a register (2026-10-11); this is the historical
cascade record. Every core re-bake moves the stub
token and changes the bytes of every module importing it, so those tokens move in
the same commit:

* 0.6.32-review fixes touched `core/horizon.js`, `core/astro.js`,
  `core/catalog.js`, `core/scoring.js`, `core/time.js` -> stub 24 -> 25.
* CR3 (CO-01, review 0.6.24) touched `core/horizon.js` + `core/index.js` ->
  stub 17 -> 19.
* the WE-03 comment corrections -> stub 19 -> 20 (that re-bake exercised the N-1
  retention: the manifest now records `previous` and BOTH trees stay in place).
* shell-unification pass: `core/visibility.js` + `core/scoring.js` +
  `core/index.js` -> stub 26 -> 33 across the intermediate bakes (25..32), each
  one cascading the web tokens; `core/panohistory.js` was added in the same pass
  (10 core modules now).
* the tagged v0.6.24 register was 60/10/41/17/7/20 with stub 17; 0.6.23 (live)
  was 59/9/40/16/6/19.

### The deployed CSP is limited by the host's nginx front end (measured)

`web/.htaccess` sets the policy, but on the live host **nginx serves
`.html`/`.js`/`.css` itself** and never reaches Apache for those paths, so the
directives arrive only where nginx proxies (measured 2026-09-15:
`/astro/version.json` carries `Content-Security-Policy` + `Referrer-Policy` +
`X-Content-Type-Options`; `/astro/`, `/astro/app.js` and `/astro/style.css` carry
none). `mod_headers` is working - the path split is the host's architecture, not
a broken config, and it is the same reason `web/ftps_deploy.py` uploads the file
by hand (the uploader skips dotfiles).

To cover the HTML, the policy has to be added at the nginx layer
(Plesk: domain -> Apache & nginx Settings -> Additional nginx directives), e.g.
`add_header Content-Security-Policy "<the same policy>" always;`. That is a
host-side action outside this repo.

Current release-gate behavior is therefore insufficient: `web-prod` probes other
paths and can pass on the JSON-only header. The replacement decision is to treat
deployment as observable release state: the main document response must carry a
valid policy or the production smoke fails. The policy's content and hash remain
pinned offline by `tests/test_prod_csp.py`.


## The carried-over four: what each turned out to be (0.6.35 working tree)

The 0.6.20/0.6.24 reviews deferred four S4 items. Reassessing them in 0.6.35
confirmed two and refuted the details of two, which is the reason this entry
exists: a deferred item is a hypothesis, not a finding, and two of these were
described in a way that would have sent a maintainer to the wrong place.

**CR2 - "malformed horizon guards: defense-in-depth, all shipped producers
normalize before preview."** The premise was wrong. `visibleSkyBands` had been
fixed (CO-04), but a probe of the whole family found `skyBandPolygons` and
`profileSegments` still threw on 7 malformed shapes, and the desktop editor
passes `profileTop` - so a sky-mode record with no top array crashed a render
pass, exactly the outcome the guards are for. Bigger: `ceilFor` validated the
profile's LENGTH but not its ELEMENTS, so a 720-long array holding NaN returned
`ceil: NaN` - and that function's own comment names the hazard (`alt > NaN` is
false, so every object at that azimuth reads as blocked and vanishes from the
planning). "Producers normalize" is not a boundary when the values are STORED and
EDITABLE. Decision: every entry point returns its empty sentinel; the contract is
pinned by `tests/js/horizon_degrade.mjs`.

**DS4 - "worker/sync diverge on max_alt (rounded vs raw argmax); one-sample/0.05
deg difference near ties; cosmetic."** Two separate things were conflated. The
night and detail payloads use DIFFERENT grids by design (6 min noon-anchored vs
4 min dusk-anchored), so their peaks legitimately differ and that is not a
defect. The real one was internal to the detail payload: it took the argmax over
the 2-dp-ROUNDED array while the night path used the raw argmax, so `max_time`
and `max_alt` could describe different samples. Fixed to the raw argmax.
**Measured limit of the fix:** because `round2(max(raw)) >= round2(raw[j])` for
every j, the rounded argmax can only land at or BEFORE the raw one, so the
reported peak VALUE is identical either way - only WHICH of several equal-valued
samples `max_time` names can differ. The shipped ic434 row holds a single sample
at its detail maximum over four dates, so no live fixture separates the two. The
pin therefore asserts the user-visible contract (the two fields describe one
sample; the peak is not below the grid's own maximum) and the engine records the
limit instead of inventing a fixture that cannot exist in the data.

**DS5 - "worker revive: sync fallback always planned; dev-hook-only impact."**
Correct that it was dev-hook-only, wrong that it was therefore harmless: the hook
is the app's declared recovery path and it was broken. `_worker.onerror` set
`_workerBroken` but left the DEAD Worker in `_worker`; `__NS_REVIVE_WORKER`
clears the flag, so the next build handed the corpse to `postMessage`. The kill
hook was already correct - which is precisely why the existing browser check
passed while this path was dead. Decision: extract `onWorkerError`, terminate and
null like the timeout path and the kill hook, and drive the REAL path from a
browser check with a genuine `ErrorEvent` (`__NS_FAIL_WORKER`, inert unless
`__NS_DEBUG_WORKER`).

**WB7 - "bundle version still ignored (forward-compat choice)."** Correct, and
the choice was the wrong one: a bundle from a LATER build was accepted and its
fields read under this build's rules, so a misreading was reported to the user as
a successful restore. Decision: `stageBackup` refuses a version above
`BUNDLE_VERSION` with a message that says to update; v1 (no stamp, same field
layout) and v2 still restore; an unusable stamp is refused rather than crashing.
A future incompatible format gets an explicit migration hook instead of silent
best-effort parsing.

**Why all four are closed rather than deferred again.** Each now has a
mutation-proven pin: reverting the guard makes the engine fail (verified for the
two CR2 guards, the DS5 disposal, the DS4 argmax and the WB7 version check).
That is the standard `BUGS.md` sets for closing a finding, and it is what was
missing when these were first carried over.

## Catalog provenance stays in a deterministic sidecar (CP-01, 2026-09-20)

The catalog's 14-column planning row remains the stable identity/data contract.
Source audit data belongs in `catalog_provenance.json`, generated from the
exact OpenNGC inputs plus `app/data/supplement.csv`. Every row records its
source file and byte-level `sha256:<digest>` version, aliases, structured
designation history, and a mapping note when NightSeam's display or supplement
rule changes the source representation. The top-level catalog hash is the
generated `openned.csv` hash, so a provenance export can be reproduced and
checked without embedding the large raw source files in the application.

**Rejected: putting aliases and provenance into every catalog row.** It would
expand both the desktop seed and the roughly 4 MB web payload, make the
planner's hot path carry audit-only text, and couple future provenance changes
to the catalog schema. The sidecar is loaded once, shown in the detail view,
and downloadable as a complete audit artifact instead.

**Rejected: using a mutable upstream release label as the version.** OpenNGC
downloads can change without a stable label being available in the local input.
The exact source-file SHA-256 is unambiguous; the sidecar also retains the
human source URL and license for attribution.

Both copies are byte-identical and checked against the catalog id set, the
desktop CSV hash, a manifest, and `CATALOG_PROVENANCE_TOKEN`. A future rebuild
must bump that token and refresh the generated baseline in the same change.


## 2026-10-05 — Bounded observing intervals and unchanged astronomy anchors

Phase 1 corrects WEB-REV-001. A scoring node owns a positive-duration half-open
cell [jd, jd + step), clipped to the authoritative night bounds. A terminal node
at or after dawn owns no observing time. Partial first/final cells contribute
proportional score and duration; the longest run is chosen by elapsed time.
Sampling origins, precession midpoint, astronomical calculations and published
reference anchors remain unchanged. Full-grid altitude/blocked diagnostics still
use the original track nodes. No CO-07 grid alignment is introduced.

Best-window endpoints and visible minutes come from core/scoring.js in every
view. Detail charts retain wider context/hover samples, but those samples no
longer establish a separate usable interval or duration. Selected-time window
membership excludes dawn consistently with the half-open contract.

Frozen scoring goldens retain their original bytes and historical terminal-node
count. The parity runner independently reconstructs those historical counters,
checks bounded counters against a direct-sample oracle, and subtracts only the
independently calculated terminal contribution from frozen scores with the
original tolerances. Scoring-coefficient and terminal-overcount mutations must
fail. This is an intentional correction of elapsed-time aggregation, not a
replacement of astronomy evidence.

For WEB-REV-002, both document and server policies narrowly permit thumbnail
fetches to https://upload.wikimedia.org and blob: image display. Script policy
remains unchanged. Controlled browser checks require decoded images through
fresh and persisted-cache paths and verify graceful unavailable/retry behavior.


## 2026-10-06 — Honest browser-product copy and static release history

The public product is the independent browser planner. The separate Windows
catalog remains local-only; no new catalog download or public repository is
implied. Astronomy calculations and saved planning data are local, while hosting,
optional weather and external photos involve online requests. Offline reopening
is not promised. Owner-confirmed hosting is ZAP-Hosting without a CDN; unknown
log retention remains an explicit publication dependency.

Keep /download.html as the compatible Changes route. Generate usable release
HTML at build time, retain the JSON record, use native disclosures and preserve
all pre-split history. A tag identifies release history, not deployment status.
This removes the loading/fetch/no-JavaScript failure surface without introducing
a bundler, server or extra release-status network dependency.

Per-image credits identify actual bytes and available evidence. DSS institutional
survey terms are not replaced with a blanket Commons/public-domain claim. Missing
source/rights remain pending. Runtime Wikimedia credits refer to the exact file,
store provider author/license metadata with new cached photos, and render as
plain text with host-restricted source links. Detailed credit information belongs
in the existing source disclosure, so attribution does not enlarge the compact
photo area. Preserve current source-repository privacy and established contact.


## Public design approval and implementation — October 6, 2026

The owner approved a sparse Home with panorama/visibility messaging and a subdued
sky-map background, followed by matching concepts for Features, About, Changes,
Privacy and Imprint. This supersedes the first Phase 3 concept's planner
screenshots, metric strips and exposed setup guide. Detailed facts are retained
behind native disclosures; optional first-night guidance is in Features.

Implement the visual blueprint in HTML/CSS and a small decorative vector, not a
bitmap of generated page text or invented numerical chart results. Reuse canonical
Workbench roles. Keep site and planner mounted independently at their existing
public addresses, within this website repository. The catalog stays separate.
No deployment, release tag or new public catalog offer is authorized by design
approval. HOST-001 and IMAGE-001 were later resolved by owner-confirmed logging
and removal of the legacy bundled inventory; the dated observations above
describe their earlier state.

## October 7, 2026 — Remaining website pass

Keep optional catalog source history outside the startup critical path. Load it
when the user opens Catalog details or exports provenance, with one validated
request and an explicit retry path. Do not parallel-fetch all optional audit
data at startup: that still competes for bandwidth before usable planning.
Planning rows, source bytes/IDs, standard membership and core math stay unchanged.

DEC-003 is resolved as metadata-only elevation for the current product. Adding a
horizon dip silently would change the relationship to the owner's painted local
obstructions. State the actual limitation beside elevation entry and prove the
existing invariant; a future physical-model change needs deliberate new scope.

Prepare compression and long caching only for versioned assets; revalidate entry
points, versions and manifests. The Plesk Apache/nginx arrangement is not inferred
from local behavior. Publishable configuration and a faithful local simulator
provide a concrete review result; actual host response headers still need live
acceptance after authorized deployment. No no-store workaround is used.

Complete local preparation on the existing dirty branch without manufacturing a
clean 0.1.0 build. The public ledger starts at 0.1.0 by owner request; inherited
v0.6.x tags remain historical and git-describe truth remains v0.6.36-dirty here.
A new reviewed clean commit/tag and explicit deployment authorization are distinct
steps. Recursive upload ordering puts every asset before every HTML page, and
the review manifest lists exact retired files without deleting anything remotely.

Established backlog fixes and review are this pass's implementation scope. New
ephemeris/seeing/offline capabilities are separately defined in
FUTURE_FEATURE_SCOPE.md with source/accuracy/provider requirements. The optional
scope question received no reply; no speculative integration is advertised as
shipped. Real Windows assistive-technology/native zoom acceptance is retained
explicitly because this environment cannot operate/listen to the required AT.

## October 7, 2026 — GitHub release authorization

The owner authorized committing and releasing the current website to GitHub.
Use the fresh independent v0.1.0 tag and current codex/website-phase-two branch;
preserve the remote master branch and every inherited tag. This GitHub release
does not establish production deployment or close the human accessibility gate.
Release preparation found that a cleanup inventory derived from git diff HEAD
would vanish after committing deletions. Keep its 82 exact reviewed paths in a
tracked ledger and validate allowed file paths; regenerate the clean publication
snapshot without losing that later deployment/rollback evidence.

## October 7, 2026 — Authorized production deployment

Publish exactly the immutable v0.1.0 assets, preserving the existing www redirect,
all old core hash directories and unrelated beta/download archives. Inventory and
hash the rollback backup before uploading, put dependencies before every HTML
page, read back deployed bytes, and accept real fresh/cached photos/credits and
site layouts before exact retired-file cleanup. The credential file stays external;
an ignored adapter reads its short field names in memory without altering it.

The measured cache policy is correct. Compression works for small version/manifest
JSON but not the observed HTML/JS/large JSON. Record that boundary as
HOST-DELIVERY-001 for provider controls/support instead of modifying the released
assets, inventing a performance result or assuming nginx honors every filter.
Deployment receipt documentation is a follow-up to the immutable release tag;
it does not create or retag a new software release.

## October 10, 2026 — Phase 1 integrity fixes

Keep backup format 2 and its legacy format-1 compatibility. Missing settings
restore defaults; malformed consumed settings and canonical/duplicate custom
IDs reject the bundle before mutation. User-created target IDs retain their
`u_` namespace. RA/Dec parsing consumes the full input and preserves documented
sexagesimal carries such as `+22 0 60`.

Treat transaction completion as the persistence authority. Replace browser
records and safety metadata atomically, and refuse incomplete record/photo reads
as backup sources. Keep photo restoration asynchronous and decode embedded data
locally under the existing CSP. Preserve the original editor history on a failed
whole-app restore, while successful restores start a fresh editor history.

Disable Setup controls throughout backup transfer to serialize user edits with
snapshot collection and restore. Report write failures and preserve form input;
do not present unsaved records or requested preferences as committed state.
Include reinitialization and synchronous Tonight acceptance in the recovery path.

Authenticate FTPS server certificates and hostnames with inherited/system trust.
Phase 1 validation uses offline TLS and isolated browser storage; it does not
publish, create a release tag, or change the astronomy core. The remaining review
phases retain their recorded scope.
