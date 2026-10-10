# Website implementation and final review

> Historical plan/review, archived October 10, 2026. Dated instructions
> below describe an earlier implementation pass. Current authority:
> [roadmap](../../IMPLEMENTATION_PLAN.md),
> [review remediation](../../REVIEW_REMAINING_IMPLEMENTATION_PLAN.md),
> [validation receipts](../../RELEASES.md) and
> [release workflow](../../RELEASE_WORKFLOW.md).

Publication follow-up, October 8: annotation improvements are released on GitHub
and deployed as v0.1.1. 295 Python tests and 53 browser checks passed. All uploaded
files/entry routes passed live hash verification; live desktop/phone pages,
planner controls and fresh/cached photos/credits passed. RELEASES.md is the receipt
and IMPLEMENTATION_PLAN.md the current backlog. Human AT/native zoom and provider
compression remain open. The original review below is dated pre-publication
evidence; its old screen descriptions/counts are not current status.

Publication follow-up, October 7: v0.1.0 is now on GitHub and deployed after
owner authorization. RELEASES.md records complete backup/hash/live-browser and
legacy cleanup evidence. Live caching passed; full text/large-payload compression
and human AT/native zoom remain open. The pre-publication review below is retained
as dated evidence, not the current deployment status.

October 7, 2026. Reviewed the existing uncommitted overhaul plus the remaining
website pass on codex/website-phase-two. No public deployment, clean release tag
or commit was performed. The independent Windows catalog was not changed.

## Result

The established local website backlog is implemented. Phases 1–5 are complete
locally; Phase 6's local review and publication preparation are complete, with
the final browser gate receipt in RELEASES.md. Manual accessibility and actual
publication/hosting acceptance remain explicit gates below.

The approved sparse public design and open planner workspace are retained.
Optional provenance no longer blocks startup. Details/export share one validated
retryable source request; malformed metadata cannot produce an empty export.
Elevation's metadata-only role is visible at entry and verified invariant.
Browser diagnostics preserve failure categories on restrictive consoles. The
local server handles a larger module-import connection burst and records health.
Recursive deployment orders dependencies before every HTML entry point and
excludes credentials. Both public trees have prepared compression/cache rules.

## Page-by-page review

Captured and inspected all six public pages at 1240px and 360px, plus all four
planner views at those widths. Public page widths exactly match both viewports.
The browser suite additionally checks intermediate widths, enlarged content,
disclosures, keyboard/focus and first/return visit with isolated data.

| Area | Review outcome |
| --- | --- |
| Home | Panorama and calculated visibility lead; concise copy, one primary action, subdued decorative map. |
| Features | Three main benefits; additional tools/guidance behind native disclosure. |
| About | Browser-local planning and separate Windows catalog described accurately; source information remains available. |
| Changes | One static independent 0.1.0 entry; no legacy list or startup fetch. |
| Privacy | Local storage, external photo/weather requests and owner-confirmed hosting/logging separated clearly. |
| Imprint | Established operator contact retained; readable layout and reachable footer. This visual/copy review does not establish legal sufficiency. |
| Tonight | Open night brief, selected clock/scrub and ranked table; the removed overview graph stays absent. |
| Catalog | Open filter rail, all object types visible, results/inspector selection retained; optional source details load on demand. |
| Sky View | One full inspector, collapsed chart controls/legend first; map and time controls remain usable. Nearby map labels remain readable at constant font size. |
| Horizon | Open editor/empty state; saved profile/history/crop behavior preserved and calibration provenance inputs remain absent. |

Phone dense tables deliberately scroll inside named keyboard-reachable regions;
screenshots show only their first columns at rest, without horizontal page overflow.
Long map labels compete for limited phone space, so zoom/selection and the visible
target list remain the detailed navigation paths; no new clipping/interaction
regression was found in this pass. Popovers and actual dialogs retain opaque
boundaries; workspace sections share the page surface.

Evidence: ignored logs/remaining-work/*-{1240,360}.png and public-review.json;
planner captures in logs/phase4/screenshots/. Existing populated-editor/selected
inspector evidence remains in logs/open-design/ and logs/sky-layout/.

## Startup measurements

One comparable Chrome sample per scenario, same machine, actual browser caching,
5 Mbps/120 ms throttled connection, measured until the first usable Tonight.
These are local evidence, not guaranteed timing or current production results.
Request interception was excluded because it disables the browser cache.

| Delivery / scenario | Before | Lazy sources | Lazy sources + local hosting-policy simulation |
| --- | ---: | ---: | ---: |
| Local cold | 1.289 s | 1.193 s | 1.277 s |
| Local warm | 0.264 s | 0.154 s | 0.157 s |
| Slow cold | 22.240 s | 11.154 s | 4.091 s |
| Slow warm | 11.747 s | 0.559 s | 0.420 s |
| Cold encoded transfer | 12,353,745 B | 5,617,145 B | 1,134,682 B |

The 6,739,158-byte provenance sidecar is absent from usable startup requests.
Catalog/provenance payload bytes and membership are unchanged. Compression
benefits depend on enabling/verifying the prepared policy on the actual host.
Benchmark captures: logs/remaining-work/before-startup.json,
after-lazy-startup.json, after-delivery-startup.json and startup_profile.py.

## Findings corrected during this pass

- Startup fetched optional source history before setting up usable planning.
- Source loading/export needed shared ownership, malformed-field validation,
  retry and preservation of an open disclosure across inspector refreshes.
- The compression simulator initially rebound its shared cache per request;
  review corrected shared ownership and added reuse/invalidation coverage.
- Recursive deployment could publish nested HTML before sibling dependencies;
  the new regression checks a global recursive ordering.
- Credential-file exclusion differed between staging and upload; helpers now agree.
- An older accessibility assertion expected synchronous provenance after opening
  details. The full gate caught it; the check now waits for the complete source
  disclosure and retains its original source/history assertions.
- Current docs mixed old combined release commands/version assumptions with the
  independent website. The current roadmap/release workflow now has one authority;
  dated release records remain historical evidence.

## Validation and reviewable publication result

Full pytest: 288 passed, one existing optional-data skip. JS syntax/import/encoding,
core/catalog/provenance/cache guards passed. Development release preflight has
zero errors with its truthful dirty warning; 0.1.0 pre-tag/history checks pass.
Final integrated browser gate: 50/50 passed. RELEASES.md records the initial
49/50 run and corrected asynchronous source-disclosure wait as well.

dist/publication-preview contains 54 SHA-256-verified files across landing/ and
web/, with a local-review-candidate manifest, actual v0.6.36-dirty describe,
82 exact retired production cleanup paths and older remote core retention.
It is a concrete local snapshot, not a tagged/published 0.1.0 release.
RELEASE_WORKFLOW.md describes clean release, dependency ordering, backup and
rollback. There were no production mutations or credential reads.

## Remaining gates and separately scoped features

1. Human screen-reader/native browser zoom acceptance (A11Y-001), using
   ACCESSIBILITY_ACCEPTANCE.md. Current automation cannot operate/listen to AT;
   keyboard/contrast/enlarged-content evidence is not that human acceptance.
2. Reviewed clean commit/new tag and separately authorized publication. Then
   actual Apache/nginx cache/compression checks, production smoke and retired-file
   cleanup. No local simulation proves live settings; HOSTING_CONFIGURATION.md
   gives the required observations.
3. Monitor BROWSER-LOCAL-001. A queue-capacity weakness was demonstrated and
   mitigated, but exact historical refusal causation is unconfirmed. Integrated
   runs also printed a request-handler connection reset during context teardown;
   it is retained as evidence, with no blanket exception suppression.
4. FUTURE_FEATURE_SCOPE.md defines proposed ephemeris, seeing and offline work
   for a separate product decision. No new provider/accuracy promise was invented.

The owner's daily/seven-archive logging confirmation and removal of legacy
bundled images already close HOST-001 and IMAGE-001 locally. Their earlier
publication blockers must not be reintroduced from historical documentation.
