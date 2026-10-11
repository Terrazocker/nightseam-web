# NightSeam Web

NightSeam is a browser-based deep-sky night planner at
[nightseam.de/astro](https://nightseam.de/astro/). This repository now owns only
the website and landing pages. Astronomy and planning run locally in the browser;
optional images and weather use the documented external services.

The Windows exposure catalog was extracted on October 1, 2026 into the
independent `<workspace>/Nightseam-catalog`
repository, beginning at version 0.1.0. Its source, executable, tests, source
library and packaged library live there. This repository keeps its existing
branch/history and inherited tags. The independent public website series starts
anew at 0.1.0; development version stamps still report truthful git describe.

## Run and check

Use Python, Node.js and installed Chrome. Install the test dependencies first:
`python -m pip install -r requirements-dev.txt`. Website build/catalog tooling
uses the Python standard library; [requirements.txt](requirements.txt) intentionally lists no runtime
packages. See [ENVIRONMENT.md](ENVIRONMENT.md) for Windows browser permissions
and scratch handling; test packages are listed in
[requirements-dev.txt](requirements-dev.txt).

```powershell
python -m http.server 8080 --directory web
python -m pytest tests/ -q --tb=no
python scripts/check_js.py
python scripts/check_browser.py --web
python scripts/preview_site.py --port 8081 --performance
```

Run the full Python suite separately from the other checks. Some drift tests
temporarily replace shipped modules with invalid examples; overlapping source
or browser checks can otherwise report false failures.

No local FastAPI server, SQLite application database, desktop build or sibling
checkout is needed. `web/catalog.json` is a committed browser payload. The catalog contains 12,176 objects. Its
rebuild uses this repository's neutral catalog_data sources and popularity
policy. core/ is the astronomy/planning authority; scripts/build_core.py bakes
only the website's content-hashed core tree.

Read AGENTS.md, DESIGN.md, CATALOG.md and DEVELOPMENT.md. Cache-token, core-drift,
published astronomy anchors and real-browser checks remain release gates.
Publication uses a verified immutable bundle: planner files map beneath /astro
and public pages to /. Assets are installed and verified before atomic entry-HTML
switches; raw mutable website uploads are refused. See
[RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) for candidate preparation and publication.

Current backlog: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Review remediation
phases 1–7 resolve all 38 October 9 findings locally; the final eleven fixes and
their checks are recorded in
[REVIEW_REMAINING_IMPLEMENTATION_PLAN.md](REVIEW_REMAINING_IMPLEMENTATION_PLAN.md)
and [RELEASES.md](RELEASES.md). These changes await a public release.
Horizon simplification A–E and the follow-up accuracy improvements are implemented
locally, including supported photo conversion/leveling and extra fitting/check
references. F's software gates and local candidate are recorded in RELEASES.md;
real-photo/device/accessibility acceptance remains open:
[simplification plan](HORIZON_PANORAMA_SIMPLIFICATION_PLAN.md),
[accuracy research](HORIZON_ACCURACY_RESEARCH.md), and
[owner acceptance](HORIZON_PANORAMA_ACCEPTANCE.md).
The subsequent [geographic P1/P2](HORIZON_GEOGRAPHIC_CALIBRATION_PLAN.md) work is
implemented locally with integrated software gates pending: physical orientation,
optional measurement evidence and explicit coverage policy. P3–P7 remain open.
Completed design plans and the earlier review are indexed in
[docs/history/README.md](docs/history/README.md).
Optional source details load on demand with retry; elevation is recorded metadata
and does not adjust visibility. v0.1.1 is published and deployed, including the
[annotation improvements](docs/history/WEB_ANNOTATION_IMPLEMENTATION_PLAN.md), with verified
live bytes, cache policy and browser acceptance. Full text/large-payload host
compression and human accessibility acceptance remain open; see RELEASES.md.

MIT; see LICENSE and NOTICE for OpenNGC, Wikimedia, Open-Meteo and popularity
data credits. Recovery snapshots of the pre-split branch and working tree are
kept locally in ignored logs/repository-split/.

Disposable test scratch belongs in ignored logs/. Pytest and JS guards recover
abandoned owned runs and report cleanup failures; normal build stages and browser
artifacts replace fixed destinations. Historical evidence is retained deliberately;
see [ENVIRONMENT.md](ENVIRONMENT.md) for the lifecycle and limits.
Obsolete combined-project
concept assets and stale local build candidates were archived during the
October 10 cleanup; see the history index. Rebuild publication candidates from
current sources rather than reusing archived candidates.

## Documentation map

- [AGENTS.md](AGENTS.md): repository boundaries and working/release authority.
- [DESIGN.md](DESIGN.md): current UI rules; [DEVELOPMENT.md](DEVELOPMENT.md): architecture.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): current backlog;
  [BUGS.md](BUGS.md): confirmed unresolved findings.
- [DECISIONS.md](DECISIONS.md): dated technical choices;
  [RELEASES.md](RELEASES.md): actual validation and publication receipts.
- [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md): review/build/publication procedure.
- [WORKSPACE_DOCUMENTATION_REVIEW.md](WORKSPACE_DOCUMENTATION_REVIEW.md): current
  documentation audit; [history index](docs/history/README.md): superseded plans.
