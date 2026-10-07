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

```powershell
python -m http.server 8080 --directory web
python -m pytest tests/ -q --tb=no
python scripts/check_js.py
python scripts/check_browser.py --web
python scripts/preview_site.py --port 8081 --performance
```

No local FastAPI server, SQLite application database, desktop build or sibling
checkout is needed. `web/catalog.json` is a committed browser payload. The catalog contains 12,176 objects. Its
rebuild uses this repository's neutral catalog_data sources and popularity
policy. core/ is the astronomy/planning authority; scripts/build_core.py bakes
only the website's content-hashed core tree.

Read AGENTS.md, DESIGN.md, CATALOG.md and DEVELOPMENT.md. Cache-token, core-drift,
published astronomy anchors and real-browser checks remain release gates.
Web deployment remains web/ to /astro and landing/ to /. No deployment or
remote repository change was performed as part of the split.

Current backlog: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). The open design,
Advanced Catalog, startup and local release preparation passes are complete.
[WEBSITE_FINAL_REVIEW.md](WEBSITE_FINAL_REVIEW.md) records the integrated review;
[WEB_REMAINING_WORK_PLAN.md](WEB_REMAINING_WORK_PLAN.md) records completed work
and the remaining external/manual gates.
Optional source details load on demand with retry; elevation is recorded metadata
and does not adjust visibility. Live compression/cache verification and human
accessibility acceptance remain explicit publication checks.

MIT; see LICENSE and NOTICE for OpenNGC, Wikimedia, Open-Meteo and popularity
data credits. Recovery snapshots of the pre-split branch and working tree are
kept locally in ignored logs/repository-split/.
