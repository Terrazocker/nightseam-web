# Development log (archived)

Moved from DEVELOPMENT.md on 2026-10-11: dated implementation notes, newest
first. Some statements were superseded later; the current architecture guide
is DEVELOPMENT.md.

Original title: NightSeam Web development

## Geographic evidence and physical orientation — October 11, 2026 (P1/P2)

This section describes the current local P1/P2 implementation. Its integrated
software gates are pending; RELEASES.md records actual outcomes. The D/E section
below describes the earlier v4/backup9 boundary retained for compatibility.

Calibration evidence v5 retains the original source model, fitted/current model,
original-source fitting/check coordinates and optional measurement source,
angular error, capture time, measurement group and exclusion reason. Known
geometry has no fabricated fitting references: confirming supported geometry can
proceed directly to review and held-out checking. Older evidence v1–v4 retains
its solver/report semantics; unconverted linear calibration remains available.
Backup 10 validates and preserves v5 and coverage evidence before any writes,
while retaining older supported bundle formats. Model, calibration and coverage
evidence participate in editor history and transactional restore.

Core owns source rays, heading/pitch/roll fitting and reports. Fixed-geometry
orientation uses weighted Wahba alignment of unit rays: the optimized loss is
chordal, with optional angular Huber IRLS. Reports use stable spherical angular
errors, show retained points' influence and keep held-out checks outside fitting.
New orientation evidence uses a separate 1° directional acceptance policy;
the historical 1° per-axis policy is unchanged for legacy evidence. Missing
measurement error is not invented, and shared measurement groups do not establish
independent accuracy. These diagnostics are not confidence percentages.

Unknown FOV is a constrained option for corrected centred square-pixel
rectilinear sources only. It requires at least four active fitting references
and two held-out checks, searches 5–150°, and requires at least 0.1° held-out
improvement plus bounded curvature. Other projection geometry stays fixed.
The FOV search minimizes fitting-point error; its held-out acceptance gate uses
the check set. Additional untouched measurements are needed for final physical
validation of the accepted geometry.
It does not infer lens distortion, arbitrary stitching or viewpoint parallax.

Coverage evidence version1 stores legacy/inferred-open/strict-measured policy,
optional observing latitude/longitude/optical height and capture date. Older
records default to legacy behavior. Newly confirmed converted photos infer open
sky above the skyline (inferred-open) unless the record already has a chosen
non-legacy policy; the photo setup's "Sky outside the photo" select switches it. The core evidence query distinguishes clear/blocked/unknown
from the policy permitting or excluding that direction; unknown is not measured
obstruction. Both detailed and batch planning use the same policy-aware horizon
limits and shared scoring loop. Strict mode excludes missing azimuth/profile
coverage and altitudes outside photographed bounds. These profile-derived states
are conservative summaries, not a source-pixel evidence mask or multiple sky
openings. Observer metadata does not apply a parallax correction.

The guided route confirms geometry before alignment or checking. Browser code
collects evidence and prepares corrected pixels; previews leave the live model,
history and planner unchanged until one atomic Apply. Original photo bytes and
source positions remain retained. Existing strokes/non-empty profiles still
prevent physical conversion/reorientation: painting is not remapped. P3–P7 and
owner real-photo/device acceptance remain open in the geographic plan.

## Supported source projection and multiple references — October 11, 2026

`core/horizonprojection.js` owns source-ray geometry, continuous angular-rectangle
coverage, bounded header/GPano parsing and forward/inverse source mappings.
`web/horizonphoto.js` only decodes, bilinearly resamples and presents preview/apply.
`photoModel` version1 retains source type/dimensions/coverage, heading/pitch/roll,
source longitude centre/top/bottom and the derived angular `working` rectangle.
`photoSource` retains original dimensions and detected/missing/invalid metadata.
New JPEG/PNG imports store exact original bytes in IndexedDB and embed those bytes
in backups. Earlier compressed previews cannot recover discarded detail.

The source world frame is east/north/up, using GPano rotation
Rz(−heading) Rx(pitch) Ry(roll). Angular sources use linear longitude/latitude;
cylindrical height interpolates tan(altitude); ordinary corrected photos use a
centred square-pixel pinhole with known horizontal FOV. Focal length alone is not
treated as adequate calibration. GPano full/cropped dimensions must match actual
decoded dimensions and the full 2:1 sphere; conflicting/stale data is a prompt.
Initial viewer FOV is ignored. EXIF orientation affects JPEG header dimensions.
Metadata and headers are limited to the first 1 MB, source 32 MP, working 2 MP and
2400px per dimension; image bytes retain the existing 25 MB import limit.

Conversion preserves a fully photographed angular rectangle, proved using
continuous extrema rather than a sparse grid. Upright angular/cylindrical sources
retain their actual horizontal coverage and planner-supported vertical bounds.
Tilted views may lose edge coverage. Tilted partial angular/cylindrical sources
wider than 180° are refused; full 360° sources remain supported. Corrected ordinary
FOV is limited to 150°. Unknown distortion, fisheye and stitching repair remain
unsupported. Outside converted azimuth coverage, detailed and batch planning block.
Vertical photo bounds remain drawing/calibration bounds: the existing horizon
model assumes sky above traced obstacles open, or above a sky band when blockAbove
is off. That extrapolation is not photographic verification; image top must not
silently become an overhang ceiling.
Existing strokes or a non-empty authoritative profile prevent conversion: create
a new horizon/redraw. Preview and pixel preparation precede one undoable Apply.

The working canvas is memory-only and is regenerated from original bytes. Photo,
paint, ruler and pointer geometry share this angular surface. `sourceRect` crops
that surface non-destructively; v4 references remain original-source pixels and
can stay outside a retained crop. History includes `photoModel`; source metadata
and original bytes are immutable for the record. Planner revisions include the
model. Backup normalization validates all models/source headers/dimension matches
before any storage writes, preserving the complete bundle recovery boundary.

Calibration evidence v4 adds 2–16 fitting references, explicit exclusions and
0–16 separate checks. Fitting is equal-weight least squares per angular axis;
confirmed full 360° fixes horizontal scale and fits circular offset. The solver
rejects ambiguous bearing branches, upright/range violations, poor spread and
any active fit residual above 1° per axis. Endpoint seeds include residual slack
scaled by reference separation. Original-source points map to working angles
before fitting. Legacy v1/v2/v3 retain their previous solver/report semantics;
normal two-point unconverted fits still write v3.

Reports show all signed fitting residuals, worst held-out errors, spatial spread
and angle-only edge sensitivity from absolute least-squares prediction weights.
No statistical confidence is inferred. Checks never participate in fitting;
each must be visible, at least 2% away from every active fit feature, and agree
within 1° per axis. Clustered checks describe local evidence. Promotions and
replacements validate before changing live roles or drafts. Manual drift
downgrades the report. Backup 9 declares these schemas and still reads 1–8.
Software receipts are in RELEASES.md; physical acceptance remains with the owner.

## Accuracy follow-up — October 11, 2026

The earlier calibration evidence v3 retains the v2 complete-reference shape but
changes known-360 fitting to equal-weight circular offset estimation. The width
stays fixed, each bearing residual is bounded to 1° and signed residuals are
reported. Read/report dispatches by evidence version: v2 retains its old exact
solver and v1 its separate-reference model. Explicitly applying a fresh fit
writes v3; simply opening an old record does not migrate its geometry.
Backup format 8 declares this semantic change and reads formats 1–7.

photoCalibrationReport also exposes per-reference angle residuals and edge
sensitivity from absolute interpolation coefficients. The bound is for entered
angle errors only; it is not a confidence interval and excludes click/projection
error. The review shows it when either factor exceeds 3×. The independent check
is still held out of fitting, and manual geometry drift downgrades status.

wrapsFor now requires |fov−360|≤1e−8 rather than ≥359.5. Nearly full partial
photos therefore retain real seam gaps. Original source rectangles, crop/history
and authoritative stroke-less profiles are unchanged. Derived-mask sampling and
skyline row rounding are now corrected as described below.

### Conservative derived horizon profiles

Each world bin covers [i×0.5°, (i+1)×0.5°). Every positively overlapping mask
column participates, including both photo edges at a nonaligned full-360 seam.
The scorer's inclusive right photo endpoint retains the final source column.
Obstacle bins take the highest painted altitude. Sky bins take the highest lower
edge and lowest upper edge, preserving the per-column 4° near-top open sentinel.
Any unpainted overlapping column blocks sky. Empty band intersections block only
with blockAbove; default open-above ignores the upper ceiling as before.
Column extrema are summarized in one sequential mask scan before aggregation.

Skyline rasterization uses the highest continuous segment edge within a column
footprint and floors its row, rounding obstruction altitude upward by less than
one calibrated row. Segments narrower than a column remain visible; inclusive
integer endpoints and ordered later erasers remain intact. Crop regridding can
shift brush edges within raster resolution. This is a conservative 0.5° planning
policy, not proof of photographic accuracy or support for disconnected vertical
openings. No-stroke authoritative profiles and representative-column legacy
migration remain unchanged. Independent cell-overlap tests and browser
save/reload/backup acceptance are recorded in RELEASES.md.

Current navigation starts in README.md. Dated entries below remain evidence of
earlier implementations, not current format/token authority. See AGENTS.md for
current tokens, IMPLEMENTATION_PLAN.md for backlog, and RELEASES.md for checks.

## Horizon simplification A–C — October 11, 2026

Separate top/left ruler canvases occupy 23px/43px CSS grid gutters around the
photo canvas. That canvas remains the shared image/mask/pointer rectangle;
aspect, inverse zoom/pan, traces and reference markers retain one transform.
Rulers are DPR-aware and do not cover photo pixels. Profile/advanced disclosures
start closed and preserve their state on same-record rerenders. Opening the
profile resizes/redraws it.

Core returns atomic two-point previews from complete original-photo
`{x,y,azimuth,altitude}` references. Positive increasing-x bearing branches are
enumerated within 5–360° original coverage, including spans above 180° and north
crossing. Equal-bearing seam endpoints require confirmed full coverage; known
360° is a constraint, not a width to silently refit. Existing core helpers enforce
vertical/physical bounds. Failed fits never mutate the panorama; source bounds
compose the current cropped mapping.

Evidence version 2 retains two complete references, coverage, projection, a
full-360 constraint and an optional held-out check. Legacy version 1 remains
readable without fabricated measurements. Backup format 7 protects complete
references from older readers; staging/rollback and deep history stay intact.
A supported fit reports `aligned`; only a separate in-crop check away from both
fitted x/y coordinates can report `checked` within the existing 1° threshold.
Unknown/other projections remain approximate; manual drift invalidates claims.

`web/horizonsimple.js` handles picking/dragging, angle entry, non-mutating preview,
explicit apply, optional checking and drawing. Owned reference gestures never
paint. Numeric photo positions remain a keyboard alternative. Separate legacy
coverage/bearing/height setup remains an Advanced adapter. Skyline tracing is the
normal obstacle tool, with brush corrections and sky-band modes still available.
A selected visible node has nearby Remove point using the same undoable removal
as keyboard/advanced controls. Projection conversion/multiple references remain D/E.

## Horizon/Panorama phases 4 and 5 — October 10, 2026

An ordered stroke operation `{m:'trace', points:[[x,y], ...]}` represents a
piecewise-linear skyline in the existing 720×360 mask space. Core validates
finite, strictly increasing x positions, at most 256 points per trace; backup
normalization bounds records to 32 traces. Fill covers connected columns only,
from the interpolated skyline down. Edges and full-panorama seam endpoint heights
are explicit. A new trace follows existing paint; editing it preserves its
timeline position, so later brush/eraser corrections win. Legacy circles and
ellipses keep their original rasterization and order.

`web/horizontrace.js` owns pointer/keyboard/numeric interaction and CSS-pixel
markers, while rasterization and crop intersection live in `core/horizon.js`.
Crop intersects trace segments with the effective kept band and transforms
their points alongside dabs. Deep history copies nested point arrays; planner
revisions fingerprint them. No-geometry records keep authoritative world-bin
profiles. Clear removes every operation; precise-bin Apply replaces authored
geometry with the current world profile plus the edited bin, undoably.
The first new point stays in session UI as an unsaved draft until connected to
a second point; it cannot erase a legacy authoritative profile. Drafts do not
enter backups or dirty history. Removing a filled trace down to one point
removes that operation undoably and keeps the remaining point as a draft.
Rejected duplicate/limit additions never capture a point drag. Imported closely
spaced nodes retain strict ordering on movement; tool changes cancel crop/picks.
Crop, Clear, exact-profile replacement and history restoration discard obsolete
drafts; structural changes reconcile trace selection before another edit.

Traces are obstacle-only. Switching to visible sky explicitly removes traces
after confirmation, retains/reinterprets brush dabs, and is one undo step.
Sky-band painting and block-above semantics remain unchanged. Backup format 6
protects trace authorability from older clients; formats 1–5 remain readable.
Malformed trace data, including discarded-ID records, rejects before writes.

CAT-PERF-001 CPU profiling showed repeated Intl formatter construction dominating
warm scrubs. `core/time.js` retains at most 32 per-zone offset formatters, while
each instant still resolves its own offset. The presentation night-window memo
tests cheap date/site/resolved-zone identity before computing site noon. Scoring,
twilight policy, selected-time altitude and DST disambiguation are unchanged.

## Horizon/Panorama phase 3 — October 10, 2026

`web/horizonsetup.js` owns the editable import/setup sequence; `web/horizon.js`
adapts it to the shared canvas transform, gesture settlement, live planner and
history. New photos start at coverage; blank/existing records open for painting.
Setup step/drafts are session presentation state, preserved on same-record
rerenders. Entering Paint focuses the canvas; percent-position inputs provide
a keyboard alternative to point picking. Exact numeric inputs and fine sliders
share one geometry mutation path. Coverage controls refresh after manual width
changes, and readout space is reserved to prevent pointer-induced canvas movement.

`core/horizoncalibration.js` is the only measurement/fit/check implementation.
The version-1 `calibration` object carries projection, original-image angular
coverage, one bearing reference, two altitude references and an independent
check with both known angles. Points use normalized original-photo coordinates;
the source rectangle projects them into the current view. Altitude uses the
existing `MASK_H - 1` convention. The two vertical points must be at least 2%
of the visible image height apart. Fits reject reversed/degenerate scales or
physical overflow before mutation. Bearing alignment wraps true north; magnetic
readings require the user's correction, without an implicit declination model.

Calibration status is derived, never stored as a trusted flag. Checked references
require a declared equirectangular projection, unchanged confirmed coverage,
exact retained fit references and a separate in-frame check within 1° in both
axes. The check is at least 2% across from the bearing point and 2% vertically
from each altitude point. Unknown/other projections stay approximate. Manual
geometry changes invalidate a stale fit. Crops preserve original reference
identity, but references outside the retained frame require another check.

History deep-copies the evidence, alongside geometry and source bounds. Backup
format 5 carries it; v1–v4 remain readable with missing evidence defaulting to
unassessed. Malformed/future evidence rejects the complete panorama section
before store writes, including records otherwise dropped for invalid IDs.
The existing transactional restore/rollback and authoritative stroke-less
profiles are preserved. Synthetic tests establish software geometry only;
physical full/partial-photo, device and assistive-technology acceptance is open.

## Horizon/Panorama phases 1 and 2 — October 10, 2026

The photo's `sourceRect` stores normalized `{x,y,w,h}` against the retained
original image. `cropPano` composes it from the effective kept band used for
paint/calibration. Drawing and aspect fitting sample that region; image bytes
remain unchanged. History snapshots include the rectangle and old snapshots
default to the complete image. Backup format 4 carries it, rejects malformed
rectangles before writes, and keeps v1–v3 imports readable. Existing cropped
records without source bounds cannot be reconstructed reliably; they default
to the full original rather than guessing a physical calibration.

Shared `normalizePanoCalibration` keeps bottom within −30…85°, top within
bottom+5…90°. Local and backup loading repair old out-of-bounds calibration,
recomputing only records with strokes; stroke-less profiles remain authoritative.
`applyDabToMask` is the original rasterizer factored for both replay and incremental
edits. `strokeSegment` interpolates overlapping dabs, retaining paint/erase order
and legacy ellipse compatibility. Rendering batches at most once per frame;
mask image/profile derivation runs only when dirty. History still commits once
per gesture, with visible partial paint retained on cancellation/lost capture/blur.
Only the owning pointer edits a gesture; teardown/view/history/tool changes settle it.

Rulers/text/grid widths are in CSS pixels under DPR scaling, projected from the
same angular view as photo/mask. Tick density adapts to zoom, with a fallback
direction label. Brush preview shows the actual angular ellipse and seam copies;
brush angular size remains constant under zoom. Same-panorama editor rerenders
retain zoom/focus/brush/eraser/grid/opacity outside persistent edit history.
Paint/crop/history controls are in a bounded sticky toolbar above the image;
grid/opacity controls use the closed Display disclosure. The long-history browser
probe records handler and next-frame latency separately against committed HEAD,
with a 20,000-dab history and a 4096×1024 upload. Initial visible-frame target is
p95 below 50 ms on this workstation, with at least a twofold handler improvement;
hardware-specific milliseconds are reported rather than asserted as a CI guarantee.

## Disposable test scratch lifecycle — October 10, 2026

scripts/scratchspace.py owns marked run directories under ignored logs/.scratch.
Pytest keeps one locked session with per-test children; JS syntax/token probes
own separate locked runs. A small manager lock serializes creation, orphan
recovery and final removal. OS locks release if a process crashes, allowing the
next allocation to recover its abandoned payload. Concurrent live runs remain
locked and are skipped; unmarked/unknown directories are never inferred disposable.
Resolved paths must remain in repository logs, without redirected scratch bases.

Deletion retries transient directory locks and read-only files. A persistent
cleanup failure remains visible and prevents allocating another run, with its
ownership marker retained for retry. No system-temp/profile fallback exists for
these probes. Browser per-check artifacts overwrite stable filenames, publication
builders replace fixed stages, and core retention stays current plus N-1.
Historical transcripts, archives and rollback backups are intentionally retained;
this lifecycle is not a blanket logs purge or a total disk quota.

## Catalog context, weather ownership and table controls — October 10, 2026

Planner invalidation precedes replacement Catalog scheduling. Every owned batch
checks its epoch/view before publishing or repainting. The night-summary cache
retains canonical maxAlt for maximum-altitude sorting; missing statistics sort
last, and both directions use ascending name/ID ties. Custom-target in-place
updates explicitly invalidate their cached search blob. Active-site saves refresh
the displayed view and header night summary only after persistence succeeds.
Chart state translation
uses core visibilityReason, with no shell-specific astronomy predicate.

Weather responses belong to an immutable site ID/coordinates/resolved-zone key
and request generation. Active-context changes invalidate pending requests even
before the first response; loaded or requested weather follows the new context,
while untouched on-demand weather does not fetch. Requests use the planner's
exact resolved timezone, including its browser fallback, rather than provider
geographic auto. Same-context date/name changes can reuse multi-day data.

Null, blank, non-numeric and non-finite readings remain unavailable; zero is a
valid measurement. An hourly quality score requires cloud cover, precipitation
probability/amount, temperature/dew-point spread and a clarity proxy (visibility
or aerosol). All selected-night rows must have these inputs for a night score.
Incomplete data stays explicit; known rain/storm warnings remain visible.
Missing optional air data cannot erase valid forecast/visibility information.

Tonight/Catalog use native table rows/cells and named target buttons within
cells. Row pointer activation delegates to the same target action; Save remains
independent. Sortable headings contain native buttons and expose aria-sort.
Catalog restores focus by stable control ID and preserves search selection range
and direction across rerenders, including asynchronous calculation completion.


## Horizon crop geometry and editor history — October 10, 2026

core/horizon.js rasterizes legacy circular dabs (`r`) and cropped ellipses
(`rx` horizontal, `r` vertical). cropKeptBand returns an effective `{x,w}` band:
expand to min(45°, old FOV), round the target FOV without exceeding the source,
then derive the pixel width and clamp the left edge. The preview and cropPano use
that same band. Calibration keeps full-precision azimuths so every transformed
stroke retains its world direction. Before leaving 360° wrap, materialize each
old dab's relevant ±720 copies in chronological paint/erase order. Repeated
crops scale only rx; all-clipped stroke geometry deliberately becomes blank.
Existing stroke-less profiles remain authoritative and clip in world-bin space.
The panorama planning fingerprint includes rx. History snapshots preserve it.

web/horizon.js keeps the displayed confidence bin separate from the next selected
azimuth. Valid input updates that bin immediately; selection/blur/history/save
settle a single metadata entry. History restoration synchronizes calibration,
landmarks, bin fields, comparison and mask together. Same-panorama rerenders
retain the saved baseline and history; checkpoints settle pending metadata before
recovery captures them. Editor teardown removes keyboard listeners and observers.
Space is a canvas-only pan modifier and releases on keyup or focus loss.

webstore exported backup format 3 for this earlier crop fix; the subsequent
Horizon/Panorama phases 1/2 use format 4 as described above. Older clients reject
unsupported newer versions, preventing silent loss of rx or photo source bounds.
Normalization retains rx and bounds imported lists at 60,000 dabs, enough for
three seam copies of the former 20,000-dab bound. Photo bytes are unchanged.
Node regressions and mutations cover geometry/normalization; Chromium checks
cover native keyboard behavior, history controls, confidence recovery and crop
backup/reload through the actual editor.

## Site calendar and lunar observer coordinates — October 10, 2026

core/time.js resolves wall calendar fields encoded with Date.UTC by verifying
candidate offsets around the intended wall time. Overlaps choose the earlier
instant; nonexistent times move forward through the gap. webstore's
wallFieldsToUtc is the shell adapter for critical planning: constructing a
browser-local Date first can normalize a requested hour in the host's DST gap.
The wall-Date API remains a display adapter with that native Date limitation.
Site midnight, noon, next noon and 20:00→04:00 polar fallback endpoints are
resolved independently. Core fallback functions accept explicit endpoints;
legacy callers supplying only noon retain their fixed-offset behavior.

The app initializes S.date after applying its boot site, keys night memoization
by resolved zone/actual noon, and keeps the scrub anchor stable within its
calendar noon-to-next-noon range, including the drag endpoint. Zone changes
invalidate the anchor; date edits reposition selection to the chosen site noon.
Full spans contain 23 or 25 elapsed hours across DST without changing scoring.
objectDayInfo now belongs to core/astro.js: culmination scans the complete
site calendar day separately from rise/set's midnight ±12h search. Since
October 11, 2026 the detail card uses objectNightInfo instead: rise, set and
culmination within the planned night's site noon-to-next-noon span.

The shared lunar state holds equatorial-of-date coordinates and a truncated
Meeus table 47A distance. moonRaDec exposes geocentric J2000 coordinates for
phase/elongation. moonAltAz subtracts the sea-level WGS84 observer vector in
the of-date frame before horizontal conversion and one refraction correction.
All browser Moon altitude/separation/scoring samples use that shared function.
Site elevation remains metadata only. This is an approximate planning model,
not a precision ephemeris. Independent PyEphem 4.2.1/libastro reference numbers
in reference_anchors.mjs cover multiple dates/sites, distance and true altitude;
mutations prove each corrected sign and observer parallax have test coverage.
The erroneous frozen lunar fixture section stays intact as historical evidence;
its test explicitly delegates correctness to independent lunar references.

## Immutable publication and recursive cache graph — October 10, 2026

scripts/publication_assets.py owns the served inventory for web/ and landing/,
with the existing tooling/credential exclusions. Every served file must be
tracked by Git except generated web/version.json; symlinks are forbidden.
The release gate, make_release.py and prepare_publication.py share this rule.

Each source tree is packaged into releases/<SHA-256>/ with the complete code,
data, core hash directories, CSS and images. The hash covers format, canonical
source paths and bytes; landing also incorporates the web namespace so its
shared theme stays pinned. Canonical HTML and snapshot HTML use absolute asset
URLs under /astro/releases/ or /releases/. Navigation links/fragments retain
canonical page locations. Same-origin share images also use immutable URLs.
Catalog, provenance and version fetches use new URL(..., import.meta.url), so
already loaded modules continue reading their own snapshot after publication.
The canonical version endpoint remains available for status checks.

prepare_publication.py records source and payload hashes, namespace metadata,
truthful development describe and the existing reviewed cleanup ledger. verify
rebuilds the expected payload deterministically and rejects drift, omissions,
extras and symlinks. make_release.py uses the same format for tagged planners.
FTPS publish validates the entire local bundle before credentials, uploads via
verified temporary files plus atomic rename, verifies the complete remote graph,
then switches canonical HTML atomically per page. Existing immutable files must
match; old namespaces are retained. Root .htaccess changes require separate
review instead of silently altering old clients' delivery policy. Atomic FTP
rename support is required; live host behavior has not been exercised.

scripts/web_asset_graph.py discovers JS/CSS from every web/landing HTML root and
recursively follows static imports, re-exports and literal dynamic imports. Live
and historical guards share this traversal. Each target has one numeric token;
missing targets, conflicting references and unversioned mutable dependencies
fail. Hashed core modules are intentionally untokened. bump_web_tokens.py edits
all incoming references in memory to a fixed point, advancing each changed
importer once relative to the verified baseline and preserving manual advances.
core.js always uses core/core.manifest.json's token. A second run changes nothing;
check_js_tokens.py --update still refuses to certify an invalid graph.

## Planner annotation interactions — October 7, 2026

Catalog types are checkbox inputs inside #cat-type, combined with OR. Empty
selection means all types. Search, catalog shortcuts and other filters still
intersect normally. Remove redundant galaxy/nebula/cluster shortcut chips; restore
keyboard focus after rebuilding type/visibility/pager controls. Pages contain 50
objects; a named keyboard-scrollable table uses its measured document position
to limit desktop height, with a 65dvh cap on narrow layouts and no fixed minimum.

Catalog best-window and clear-window filtering read compact night summaries
stored with pct/blk in obsCache. The existing revision-sensitive observation key
owns these facts; Catalog no longer reads a stale or absent Tonight result for
them. Page fills update both percentages and window cells; full-pool warming
handles the clear-window filter as well as percentage gating/sorting. Selected
conditions still use shared visibilityReason at S.skyTime, including planning
window, minimum altitude and horizon. Unknown windows show an ellipsis until
computed. Catalog no longer presents a best-window start as Rises later.

Sky time controls precede the chart. Both time ranges receive the same cached
96-segment Sun-altitude gradient keyed by UTC range and site coordinates. Shared
E.sunAlt supplies the astronomy; semantic scrub colors and CSS interpolation only
map those values to presentation. Selection updates phase text/accessibility
without rebuilding the gradient. Polar fallback/full-day ranges retain their
existing core policy and actual Sun phase; the caption acknowledges a missing
sunset/sunrise pair. Tonight retains the common top-bar scrub and render freshness
markers; its removed local slider has no remaining listener or style. Its reason
column now respects outside-window conditions even when geometric altitude clears.

## Open workspace and advanced Catalog — October 6, 2026

Workbench component rules in themes.css now use one page surface, transparent
workspace sections/actions, underlined navigation and quiet row/rail separators.
Inputs keep identifiable boundaries and focus; actual dialogs/popovers remain
opaque and bounded. Docked/inline inspectors belong to the page. Horizon canvas
backgrounds/grids/profile marks consume vizTheme roles. Its container observer
schedules a cancellable animation frame rather than synchronously resizing the
observed element, avoiding a ResizeObserver notification loop.

Advanced mode updates the active catalog and tier map live; the full catalog was
already loaded in either mode, so activation no longer reloads JSON, storage or
planner state. One short-lived observation-grid snapshot carries a cache prefix
including exact night endpoints/site/minimum altitude and the panorama content
fingerprint. The fingerprint is computed once per grid, not per object. Grids
are not retained across edits; existing planner revision invalidation remains.
Catalog formatting/filtering/page filling/warming share that snapshot. Search
narrows the pool before selected-time visibility work.

One owned background warm job per compatible grid merges newly requested
objects, skips already cached page results, yields between small 32-object core
nightStatsBatch calls and updates the current status element. Cancellation clears
its timer/status/busy state. Page fills use shared-core batches with page/revision
generation guards. Search, planner changes and mode changes supersede work safely;
completion refreshes only Catalog. Astronomy formulas and baked core are unchanged
by this task. The independent catalog repository is only a visual reference.

Implementation/validation checklist: docs/history/WEB_OPEN_DESIGN_IMPLEMENTATION_PLAN.md.

## Phase 4 planner controls and focus — October 6, 2026

The header groups observing setup separately from night/time; fonts remain
readable, the clock stays visible and controls wrap at narrow widths. Tonight's
table scrolls within a named keyboard region. The empty Horizon layout stacks
on phones too. Sky target labels use screen coordinates, fixed font sizes and
near-dot placement bounded by the viewport; chart summaries use the site clock.

reachableControl/dialogStops exclude hidden, inert, disabled and closed-disclosure
content. One keyboard handler is installed before onboarding and wraps only
modal dialogs; the wide inspector stays complementary. Modal background roots
are inert while open and restored before opener focus. Setup owns a separate
return-focus reference, preserves its selected tab and exposes tab/panel links.
Options/Weather synchronize expanded state and close/restore on Escape. Focus
exit is checked on the next task so intermediate browser blur cannot hide the
next control before it receives focus. Scoped navigation suppresses global time
shortcuts. File inputs remain hidden behind reachable upload/import actions.

Setup coordinate notes/rig estimates use local status regions; target validation
errors use an alert. Removing the whole-dialog live region does not remove those
individual messages from announcement semantics.

The first visit explains example coordinates, Options → Setup, optional rig
coverage and Horizon. Validation preserves invalid entries and reports a readable
status. A small live region announces view/site/night/rig changes; slider values
use aria-valuetext rather than announcing every drag through the whole dialog.
Storage, astronomy authority and horizon edit/backup contracts are unchanged.
Five Phase 4 browser checks cover controls, disclosures, first visit, four-view
responsive/enlarged layouts and zoomed map labels. Real assistive-technology and
native browser zoom acceptance remain separate manual release checks.

## Catalog sorting and top time-slider accessibility — October 6, 2026

Catalog starts in Name ascending order; Clear filters restores that same order.
Popularity is not offered as a visible sorting choice. Standard membership and
internal ranking inputs are unchanged. The top time slider has the accessible
name Selected observing time; syncScrub updates aria-valuetext with the same
site-zoned fmtClock value displayed next to it, including keyboard changes.

The website and landing pages are developed and released independently of the
Windows catalog. The split on October 1, 2026 preserves the current web code,
core astronomy authority, catalog payload, provenance and existing Git history.
The public website version series starts anew at 0.1.0 by owner request on
October 6, 2026; inherited tags remain historical development evidence.

web/app.js orchestrates a vanilla ES-module application. web/webstore.js owns
browser persistence and transactional backup; web/horizon.js owns panorama
editing and display adapters. Pure calculations live only in core/. Its hash
manifest and generated web/core tree are owned by this repository.

catalog_data/ contains the former pure catalog inputs/policy and a web-owned
loader. web/build_web.py catalog regenerates the payload from those sources,
without SQLite, main.py or a sibling checkout. Regeneration must preserve IDs,
type mappings, deterministic standard/advanced membership and cache/provenance
manifests. Version stamping uses this repository's Git history.

The desktop app/, static/, local data, executable/build environment, calibration
imports and API tests moved to Nightseam-catalog. No local desktop server or
database remains a website dependency. Requirements here are for build/test
tooling only; serving web/ needs a static HTTP server.

See AGENTS.md for checks, cache tokens, core retention and deployment order.
Historical implementation/release entries describe their original combined
project state and are not current architecture instructions.


## Phase 1 observing-time and photo contracts — October 5, 2026

computeNightTracks retains jd0/jd1 alongside the existing sample nodes. Shared
scoreNightTracks clips each cell to these bounds and optional ctx.window exact
bounds; ctx.range remains an inclusive grid-index selector. bestStart/bestEnd,
bestMinutes, visibleMinutes and windowMinutes are authoritative time values.
visN/bestRun count positive-duration cells; pct and scores use their actual time.
Raw altitude, transit and full-grid blocked metrics preserve the original grid.
Manually supplied legacy tracks without jd1 retain their implicit grid extent.

Tonight, Catalog and Sky View use core endpoints. Target details call nightStats
on the same six-minute dark-window grid; their wider chart samples are visual
context only. New source tests cover partial/terminal cells, longest-run duration,
Berlin dusk/dawn, zero duration, exact clipping and polar fallback. The browser
web-interval-view-agreement check compares all four displays using isolated data.

Photo policy is kept aligned in web/index.html and web/.htaccess. Three strict
web-photos checks use controlled Wikipedia/Wikimedia responses
to verify decoded fresh/cached images, persisted IndexedDB cache and failed-fetch
retry. Expected unavailable requests are handled explicitly; unrelated console
or response errors are not blanket-suppressed. Browser failure artifacts now
use ignored logs/browser/artifacts rather than tests/browser/artifacts.


## Phase 2 public information and image attribution — October 6, 2026

scripts/build_changelog.py owns both landing/changelog.json and the marked
release-history region in landing/download.html. --check detects curation gaps
and stale generated JSON/HTML. PUBLIC_RELEASES explicitly owns public membership:
the fresh website series currently contains only 0.1.0, without a legacy archive.
Inherited Git tags cannot repopulate this ledger. Legacy CURATED summaries remain
internal evidence for existing release guards; future website releases need both
their curated summary and a public ledger entry. Notes are escaped text generated
statically, with no runtime release fetch or claim of deployment/tag creation.

web/imagecredits.js?v=2 supplies exact-file credits for online thumbnails.
The legacy 81-photo library, image-attributions.json and bundled-credit generator
were removed by owner request on October 6. Every object now reuses its existing
Wikipedia Blob cache or requests a thumbnail directly when details open, with
no local image probe. Missing photos remain a text placeholder and Wikipedia
link; transient failures remain retryable. The static image-credits.html page
explains individual credits and has no legacy photo inventory.

For external photos, the authentic Wikimedia URL identifies the exact file page.
Optional Wikipedia imageinfo metadata supplies plain-text author/license fields.
Attribution is persisted with each newly cached Blob and remains available after
reload. Old cached Blobs without evidence remain explicitly unattributed; no
source is guessed from an object name. Metadata failure does not block the image.
Detailed credits live in the inspector's existing source disclosure, preserving
compact images and chart placement. Refresh preserves both photo and credit nodes.

CSP narrowly permits upload.wikimedia.org and thumb.wikimedia.org for photo bytes
and blob: display; script restrictions are unchanged. Browser checks use controlled
metadata/thumbnail responses and open the source disclosure to verify actual
cached credit accessibility. Public-page checks cover all six pages, native
static history, disabled JavaScript, failed JSON tripwires and 360px layout.

Public information names owner-confirmed ZAP-Hosting/no CDN. The owner confirmed
daily rotation, seven archived log files and full IPs without anonymization;
Privacy records the configuration without an exact deletion-period guarantee.
The removed legacy photo inventory no longer creates a publication dependency;
runtime credits describe the exact online file and available evidence. Help uses the
existing Imprint operator contact; the source repository remains private.


## Phase 3 public page architecture — October 6, 2026

All six landing pages use data-theme=workbench and load /astro/themes.css?v=18
before landing/style.css?v=3. Public-site selectors override shared component
layout without copying the canonical role palette or changing planner styles.
The old layered glass/starfield CSS is removed. Native details provide phone
navigation and secondary feature/credit/privacy sections;
no public JavaScript, npm or bundler is added.

landing/sky-map.svg?v=1 contains a reusable decorative symbol referenced by each
hero. Its geometry is illustrative; aria-hidden and pointer-events:none keep it
out of interaction/assistive content. Role colors inherit into the symbol. The
approved map motif is confined to public heroes, with opaque body sections.

scripts/preview_site.py mounts landing/ at / and web/ at /astro/, matching the
FTPS deployment layout. Preview with python scripts/preview_site.py --port 8081.
Public browser checks use the same handler, including the canonical theme path.
The standard handler normalizes paths within each mount rather than exposing
repository files. Existing planner-only preview remains supported.

Each page has a canonical address, page-specific metadata and a shared social
preview captured from the implemented Home at 1200x630. Before changing that
preview, capture the actual page and bump its token across all six heads.
Generated release history follows the independent public ledger and is validated
by build_changelog.py --check. The generator only writes changed output and uses
workspace-relative destinations where available for this Windows environment.


## Planner target-selection state (WEB-REV-003) — October 6, 2026

Tonight, Catalog and Sky View share ONE selected-target identity and ONE
inspector. `S.detailId` is the authoritative identity and outlives the
inspector; `S.detailOpen` is the only evidence that the inspector is showing.
Ownership: `selectTarget()`/`clearSelection()` are the only writers of
`S.detailId`, `openDetail()`/`closeDetail()` the only writers of `S.detailOpen`,
and every highlight (ranked rows, catalog rows, Sky chart) is
derived from `S.detailId`. Sky View keeps no local
selection ids and no fallback auto-selection: closing the inspector preserves
identity and highlighting, view switches close the inspector without reopening,
filters never clear a selection (an unplotted target keeps truthful facts and
says it is not plotted), and only a target that left the authoritative catalog
clears the selection and closes the inspector. Behavioral checks live in
tests/browser/selection_checks.py (registered from scripts/check_browser.py).

Sky View hosts the same #modal inside #sky-detail-host, rather than duplicating
selected-target facts and a miniature chart beside a second dock. The full panel
uses detail-inline and complementary semantics at every width, with no reserved
body.detail-open margin or modal background isolation. Chart controls/legend
come first and start collapsed; map clicks open the full inspector. The former
visible-now list was removed at the owner's request on October 7.
parkDetailModal() moves the shared wrapper back to document.body before a Sky
workspace rebuild, route replacement or Setup takeover. Reattachment preserves
the existing photo node and redraws the full graph for the available width.
Closed details remain closed, with identity/highlight and a small reopen action.
The web-sky-single-inspector browser check covers these lifecycle transitions.

Sky date editing uses the common top bar only. Its compact rail contains a
stacked phase legend, expanding slider and Now/Reset controls. The range policy
caption remains accessible without a visible second help row. Browser fixtures
set a site-local minute through the real slider and versioned webstore conversion.

Tonight has a compact brief, common top-bar selected-time control and ranking.
The overview chart and its track sampling/checkbox state/resize observer were
removed; the full target inspector retains its altitude graph. Catalog's open
checkbox type filter shows every available type, with no inner scroll.
Horizon no longer exposes calibration provenance fields or writes provenance
from UI controls. Saved/imported provenance remains in the model, normalization,
history and backups; confidence editing and real calibration controls remain.
web-planner-simplified-panels checks full list fit and Save/reload preservation.

## Startup, delivery and local publication — October 7, 2026

Boot loads the authoritative planning catalog but does not fetch its optional
6.74 MB source sidecar. loadCatalogProvenance() owns one shared request, aborts
after 30 seconds, validates schema/count/IDs and the displayed source field
types, and caches only a valid result. Disclosure and export share this request;
failure is retryable and never creates an empty authoritative export. Async
disclosure updates check target identity and node connectivity. A refreshed
inspector preserves the open disclosure and reuses already loaded data.

Site elevation is persisted metadata. Setup and welcome describe that limitation
at entry; changing elevation alone leaves ranking and visibility unchanged.
Manual world-bin horizon profiles remain the obstruction authority.

web/.htaccess and landing/.htaccess prepare gzip and token-aware cache policy.
HOSTING_CONFIGURATION.md describes the real Apache/nginx boundary and live checks.
scripts/preview_site.py --performance simulates these delivery rules locally via
static_delivery.py: gzip negotiation, shared mtime/size-keyed compression cache,
ETag/304, immutable numeric-token assets and revalidated HTML/version/manifests.
It is a test aid, not a production server or proof of enabled hosting settings.
Chrome benchmarks use actual HTTP caching and CDP throttling without request
routing, which would disable the browser cache. Evidence stays in ignored logs.

The browser gate's local server uses a 64-connection listen queue and records
thread liveness, queue and failed URLs. Encoding-safe diagnostics preserve check
failure versus infrastructure failure exit categories. No retries/skips conceal
launch or module failures. Historical refusal causation remains unconfirmed.

The original dependency-before-HTML recursive upload is superseded by the
immutable publication workflow above. Private .env/.git and tool files are excluded from both deploy and release helpers.
scripts/prepare_publication.py creates/verifies a SHA-256 manifest for both public
trees in ignored dist/publication-preview; it never connects, commits or tags.
The manifest identifies the actual source describe and lists retired server paths
from the tracked scripts/publication_cleanup.json ledger, independent of whether
the deletions have already been committed. RELEASE_WORKFLOW.md owns publication,
clean tagging, backup and rollback. Keep the catalog repository independent.

## Slider and Horizon annotation follow-up — October 7, 2026

Range controls and the Tonight presentation marker share a one-minute UI step.
The shared core owns scrub windows/clamping; no scoring step or astronomy formula
changes. Sky time events synchronize controls immediately, then use one pending
animation frame per chart/inspector to draw the latest S.skyTime. Sky frames are
cancelled on rerender and route exit; inspector frames are cancelled on close.
The inspector's selected-time facts reuse the existing date/site/timezone night
window memo rather than rescanning Sun crossings during each input event.

Horizon tools use one bounded sticky rail on wide screens, with normal flow at
1240px and below. Its first card is no longer independently sticky. The document
body grows with content so long source-aspect panoramas cannot end the header's
sticky containing block early. Precise-value help describes the existing 720
world-direction bins and authoritative-profile transition without changing it.
History restoration synchronizes the mode selector, block-above checkbox and
numeric fields with the restored model.

## Simplified overviews and direct settings — October 7, 2026

Tonight renders five columns without display-only visibility-reason/rise cells.
Shared night statistics, core scores and inspector facts remain intact. Sky time
draws synchronize the selected-target placeholder directly; the visible-now DOM,
ranking/filter pass and styles were removed. Map hit testing still uses skyItems,
and inspector closing falls back to its reopen action or the chart for focus.
Selection checks now use actual map clicks computed from shared core altitude/
azimuth in isolated test fixtures, retaining every continuity/deletion check.

The Site/Rig context words are buttons separate from named native selectors.
They select the Setup tab before rendering and open the active record's existing
edit form. No active rig opens the Rigs list without creating a record. Setup's
existing return-focus and background isolation apply to these entries too.

The filter controls retain their existing semantics: ownership badges plus a
global imaging-filter assumption (OIII, else Hα, else broadband) for Tonight's
Moon-aware score. Without Moon-aware ranking, they do not affect score/order.
They do not change geometric visibility or clear intervals. Broadband ownership
alone changes advice rather than selecting a different scoring assumption. Menu
help states this, and broadband warning badges render BB instead of erroneous NB.

## Deployment credential file format

The standard web/ftps_deploy.py helper accepts UTF-8 text with exact, case-sensitive
KEY=value fields: FTP_HOST, FTP_USER, FTP_PASS and optional FTP_PORT (default 21).
It splits at the first equals sign, ignores blank/comment lines, strips whitespace,
and does not remove quotes around values. Keep values unquoted. Explicit FTPS and
encrypted data transfer are enabled by the helper; no protocol field is needed.
Pass an external credential file using --env PATH; its extension may be .txt.
Credentials stay outside Git and are never included in publication archives.

The October 7 deployment used an ignored in-memory adapter for the owner's existing
short Name/Pwd format and the established Plesk endpoint. The provided credential
file was not rewritten or copied into this repository. Never print its contents.

## Durable browser storage and complete restore — October 10, 2026

`webstore.js` settles writes on IndexedDB transaction completion, not request
success. `writeStaged` replaces sites, rigs and custom targets in one transaction;
`restoreBackup` includes the pre-import safety snapshot in that transaction.
An abort preserves every original record and the previous safety metadata.
`allStrict` and the `{strict: true}` record readers reject incomplete reads.
Backup collection and import reinitialization use these strict readers; ordinary
startup readers retain their tolerant behavior.

`normalizeWebPrefs` defines the shared preference defaults and validates every
setting consumed by the planner. Import staging rejects malformed known values,
unsafe or duplicate custom target IDs, and invalid target coordinates before
writes. Legacy omitted settings acquire current defaults. Ordinary preference
edits merge; `replacePrefs` restores a complete snapshot and resets omitted
settings. Both preference operations preserve live state on persistence failure.

Panorama restoration is asynchronous. Embedded image data is decoded locally,
without a CSP-controlled fetch. Image replacement uses one IndexedDB transaction;
the panorama localStorage write occurs while that transaction can still abort.
A later transaction abort restores the previous localStorage records. Callers
await the committed result. Photo export prefers the current in-memory image and
rejects missing or unreadable photographs instead of dropping them from safety
snapshots. Successful replacement invalidates old editor references; a whole-app
rollback reattaches the captured dirty baseline and undo branch.

The app validates the incoming bundle, collects a complete safety snapshot, and
locks Setup controls during transfer. Records, photos, preferences, theme,
reinitialization and immediate Tonight rendering share the recovery boundary.
Post-commit failures restore the complete snapshot; rollback failures are reported
explicitly and retain safety storage. Record forms and ordinary preference controls
report failed persistence before changing the displayed model. Restoring no sites
uses an explicit transient Berlin default and clears the former site's selector.

FTPS uses `ssl.create_default_context()` for certificate and hostname verification
before credentials, and retains inherited/system CA trust. The configured FTP host
must match the certificate. TLS regressions use real offline MemoryBIO handshakes;
they do not contact a deployment endpoint.
