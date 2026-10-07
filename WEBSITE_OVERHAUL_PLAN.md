# NightSeam website overhaul plan

Proposal — October 5, 2026. Review evidence:
logs/website-review-20261005/REVIEW.md. Defects remain recorded in BUGS.md.
This plan covers the browser planner and public pages in this repository.
The independent local catalog, its data and its versions remain outside scope.
Phases 1–3 are implemented and validated locally. Phase 4 implementation is
complete locally; real assistive-technology/native-zoom acceptance remains pending.
Phase 5 is implemented locally; Phase 6 local review/release preparation is
complete. Human acceptance, clean release actions and authorized publication
remain explicit external gates; see WEB_REMAINING_WORK_PLAN.md and RELEASE_WORKFLOW.md.
no public deployment has been performed for this overhaul.

## Phase 1 — Correctness and photo reliability (completed locally October 5)

Purpose: establish trustworthy planning results before redesigning or capturing
new product screenshots. Deliver the following as two independently reviewable
slices, starting with the planning-window correction.

1. Reproduce the Berlin October 5 dawn overrun in a regression test. Specify a
   bounded, half-open interval contract, including a partial final sample,
   without moving the deliberate scoring-grid anchor.
2. Correct core/scoring.js and regenerate the baked core through build_core.py.
   Align Tonight, Catalog, Sky View and detail windows/durations with the same
   contract; avoid separate mathematical workarounds in each view.
3. Test full-clear nights, dawn boundaries, partial final samples and polar
   fallback. Preserve published reference anchors; investigate fixture changes
   rather than updating evidence to conceal a formula bug.
4. Narrowly align HTML and server photo policies with Wikimedia fetches and
   blob-image display. Preserve useful unavailable-photo behavior.
5. Test bundled, fresh external and cached photos with controlled responses and
   actual image decoding assertions. Do not suppress failures of this path.
6. Update affected cache tokens/register/manifests and defect records.

Done when: no usable interval exceeds the authoritative night bounds; views
agree on times and durations; astronomy anchors and relevant regression checks
pass; fresh/cached photo paths work and external failure remains graceful.

## Phase 2 — Accurate product information and release history (completed locally October 6)

Purpose: explain the current independent browser product truthfully.

1. Correct Home, Features and About: browser planner, local saved planning data,
   account-free use, online weather/photos and offline limitations. Do not
   promise offline reopening without an implemented and verified mechanism.
2. Remove current combined-desktop download promotion. The catalog is local-only;
   retained old downloads must be clearly historical, never a new catalog offer.
3. Draft consistent Privacy copy covering hosting, coordinates/timezone sent to
   weather services, photo requests and optional automatic weather loading.
   Confirm hosting/CDN, retention and contact facts with the owner before the
   text is considered ready to publish; do not invent provider facts.
4. Make Changes consistent across navigation and home cards. Preserve the old
   download.html route if a canonical route changes.
5. Show the fresh independent website 0.1.0 entry, as requested October 6.
   Remove older public notes and the archive; retain historical evidence in Git.
   Do not imply deployment or tag creation from a locally prepared entry.
6. Generate useful static release content, with explicit optional-enhancement
   error/empty states and usable no-JavaScript behavior. Validate landing pages.
7. Correct website-owned notices, browser-port wording and credits. Establish
   per-image attribution and verified help/source destinations. Decide public
   source access before promising a public repository.

Done when: product/service claims match behavior, release history works without
JavaScript, the independent public ledger is consistent, navigation works and owner facts
are confirmed or explicitly recorded as unresolved publication dependencies.

## Phase 3 — Public-page redesign and first-night guidance (completed locally October 6)

Purpose: explain the browser product in the sparse Workbench style approved by
the owner, with panorama setup and calculated visibility first.

The owner approved revised Home and five matching public-page concepts on
October 6. This approval superseded the original screenshot-heavy direction.

1. Implement compact navigation, plain wordmark, clear active-page links and a
   single Home action; phone navigation remains usable without JavaScript.
2. Use a subdued decorative sky-map motif behind hero text. Preserve flat role
   surfaces and readable text; keep generated concept imagery as design evidence,
   not calculated astronomy or rendered page content.
3. Apply the same typography/separators to Features, About, Changes, Privacy and
   Imprint. Preserve complete privacy/source facts through native disclosures.
4. Put optional first-night guidance in the secondary Features disclosure. Avoid
   visible setup guides and screenshot showcases, as requested by the owner.
5. Keep the existing Changes route with only the fresh website 0.1.0 entry,
   following the owner's October 6 reset request. Keep empty/no-JavaScript states
   useful and prevent inherited Git tags from restoring old public records.
6. Verify desktop/phone, enlarged content, keyboard menus/disclosures, contrast,
   reduced motion and deployment links. Capture the implemented public pages and
   a truthful Home share preview; maintain canonical/page-specific metadata and
   public cache tokens.

Done when: all six public pages match the approved direction, 360px pages and
expanded disclosures have no horizontal overflow, native navigation works with
JavaScript disabled, contrast/link/history checks pass and the final full
regression/browser gates pass. Public deployment remains separately authorized.

## Phase 4 — Planner layout, selection and accessibility (implemented locally October 6)

Purpose: improve operation across desktop and phone without disrupting saved data.

1. Completed locally: separate selected-target state from inspector visibility. Closing details
   should preserve selection across Catalog and Sky View; define when changes
   in data/filters replace or clear selection.
2. Completed locally: remove visible Popularity sorting; use Name ascending initially and after clearing filters.
   Preserve deterministic Standard membership and internal approved tie-breaking.
3. Completed locally: header groups observing setup separately from night/time;
   readable controls wrap and the clock remains visible on phones. Advanced
   options stay in the menu. Dense Tonight data scrolls within its own region.
4. Completed locally: expanded/control relationships, popover/Setup return focus,
   focusability-aware modal traps and background isolation. Both tab strips
   support scoped keyboard navigation without accidentally scrubbing time.
5. Completed locally: onboarding explains Options → Setup, Berlin example and
   optional rig coverage; validates without replacing entered coordinates.
   Phone Horizon stacks correctly; map labels keep fixed font size and stay
   inside edges, and chart text alternatives use the site clock.
6. Five focused checks cover popovers/Setup, disclosure traps, first visit,
   four-view responsive/enlarged layouts and map zoom labels. Existing selection
   and general keyboard checks remain. Screenshot review provides visual evidence.
   Real screen-reader and native browser-zoom acceptance remain open (A11Y-001)
   for integrated release acceptance; automation alone cannot close them.

Done when: selection survives inspector closure/view changes, Popularity is absent
from UI, common controls remain reachable, focus follows visible state and time
controls have useful accessible names. Preserve selected-time truth, horizon
history/undo, reduced motion, non-color summaries and backup compatibility.

## Phase 5 — Measured startup improvements (implemented locally October 7)

Purpose: reduce waiting based on comparable measurements, not assumptions.

1. Establish cold/warm and slower-network baselines: actual transferred bytes,
   compression and time until usable planning.
2. Determine which provenance data is required immediately and which can load
   on demand; investigate parallel independent loading where appropriate.
3. Implement only supported improvements with loading/retry/error behavior.
   Preserve IDs, counts, provenance authority and Standard membership.
4. Prepare compression/cache configuration compatible with the actual host and
   measure the same scenarios again. Server changes stay local until deployment
   is authorized. Never use no-store to hide token drift.

Done when: before/after evidence demonstrates improvement and catalog/provenance
checks pass. Failed optional loads must not prevent otherwise usable planning.

## Phase 6 — Integrated acceptance and release (local preparation complete October 7)

Purpose: deliver a verified, reviewable overhaul and then publish if authorized.

1. Review all public pages and planner views at desktop/phone widths, keyboard,
   zoom, first visit and return visit. Verify sites/rigs/panoramas and backup
   compatibility with isolated data.
2. Run relevant tests while editing; run the full suite once at the end, plus
   JavaScript, planner browser, landing-page and applicable release/cache/core
   checks. Browser launch failures remain infrastructure failures, never skips.
3. Record actual outcomes in RELEASES.md, architecture in DEVELOPMENT.md,
   decisions in DECISIONS.md and unresolved defects in BUGS.md.
4. Curate distinct release notes, pass pre-tag checks and prepare a new clean
   web release. Keep version/git-describe truthful and never retag old releases.
5. Stage modules before HTML, retain current plus N-1 core assets and preserve
   older production core files needed by cached clients. Prepare rollback steps.
   Include removal of obsolete production object JPEGs and the old attribution
   manifest in the authorized deployment cleanup; upload-only does not delete
   existing server files. They are already removed from this checkout.
6. Request explicit public-deployment authorization for the concrete result.
   After authorized publication, smoke-check live pages, versions, caching,
   photo policy and representative planning results.

Done when: the local release passes acceptance and is ready to publish. Public
completion additionally requires authorized deployment and live smoke checks.

## Dependencies and deferred work

Phase 1 is complete locally: bounded intervals and photo reliability passed
256 tests (one existing optional skip) and all 30 browser checks. Phase 2 is also
complete locally: 264 tests passed (one existing optional skip), and the final
full browser run passed 32/32 checks. Corrected copy, static release history and
per-image credit status are implemented. Earlier intermittent local startup
failures remain recorded in BUGS.md/RELEASES.md; no check was skipped or suppressed.

The owner confirmed ZAP-Hosting/no CDN; existing contact is retained and source
access remains private. HOST-001 is complete with owner-confirmed daily
rotation and seven retained log archives, without IP anonymization. IMAGE-001
is resolved by removing the legacy 81-photo library; objects use Wikipedia
thumbnails, browser caching and individual credits. Public deployment requires
separate authorization.
Phase 3 is complete locally: 268 tests passed (one existing optional skip),
and all 39 browser checks passed. Final evidence is recorded in RELEASES.md.
Phase 4 implementation is complete locally, including the preserved selection
task, sorting, time-slider semantics, header, onboarding and keyboard fixes.
A11Y-001's real screen-reader/native-zoom acceptance remains open. The selection
handoff's focusability and diagnostic-printing findings are fixed locally. A
local server queue weakness is mitigated; historical refusal causation remains
unconfirmed and is retained as monitoring work rather than claimed resolved.
Phase 5 startup work and Phase 6 local acceptance/release preparation are complete.
v0.1.0 was tagged, released on GitHub and deployed after authorization on October 7.
Live hashes, caching, smoke, layouts and exact legacy cleanup passed. Human AT/native
zoom and full text/large-payload hosting compression remain open.
Current backlog authority: IMPLEMENTATION_PLAN.md; final review: WEBSITE_FINAL_REVIEW.md. Actual gate outcomes are recorded in RELEASES.md.
Phase 3 layouts are approved and implemented in the sparse Workbench style.
Offline reopening is a separate feature decision, not part of correcting copy.

Elevation is now explicitly metadata-only and current backlog/version/release
authority is consolidated. FUTURE_FEATURE_SCOPE.md defines the ephemeris/seeing/
offline proposals; catalog-only work remains in the independent repository. No dates are promised before
implementation evidence establishes effort. Use a dedicated codex/ branch when
implementation begins and preserve existing review documentation.
