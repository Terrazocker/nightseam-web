# NightSeam Web development

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

Implementation/validation checklist: WEB_OPEN_DESIGN_IMPLEMENTATION_PLAN.md.

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
and every highlight (ranked rows, catalog rows, Sky rail) is
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

ftps_deploy.py flattens the recursive tree before dependency-before-HTML ordering.
Private .env/.git and tool files are excluded from both deploy and release helpers.
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
