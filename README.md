# NightSeam Web

NightSeam is a browser-based deep-sky night planner at
[nightseam.de/astro](https://nightseam.de/astro/), with its public pages at
[nightseam.de](https://nightseam.de/). It shows when deep-sky targets are
usable from your site and date, above your own skyline. Astronomy and
planning run in the browser; saved data stays in browser storage. Optional
online features are Open-Meteo weather and Wikipedia/Wikimedia object photos.

The Windows image catalog is a separate project with its own versions;
nothing here depends on it.

## Repository layout

| Path | Contents |
|---|---|
| `web/` | The planner (served under `/astro/`): plain ES modules, no bundler |
| `landing/` | The public pages (served at `/`) |
| `core/` | The only astronomy, planning, scoring and horizon implementation; baked into `web/core/<hash>/` |
| `catalog_data/` | Catalog sources, parsers, supplement and popularity policy |
| `scripts/` | Build, guard, release and publication tools (standard library only) |
| `tests/` | pytest, Node (`tests/js/*.mjs`) and real-browser checks (`tests/browser/`) |
| `docs/` | Acceptance checklists, active horizon plans and history |

The catalog contains 12,176 objects. `web/catalog.json` is a committed
payload rebuilt from `catalog_data/` (see [CATALOG.md](CATALOG.md)).

## Run and check

Requires Python, Node.js and an installed Chrome. Clone with the version tags
(a normal `git clone` fetches them): the release checks, the changelog check
and the planner's version display read `git describe`, and fail without tags.

```powershell
python -m pip install -r requirements-dev.txt
python -m http.server 8080 --directory web      # planner at http://localhost:8080
python scripts/preview_site.py --port 8081      # planner and public pages together
```

Checks (all must pass before a commit is called done):

```powershell
python scripts/check_js.py                      # syntax, imports, cache tokens
python scripts/check_core.py                    # baked core matches core/
python scripts/check_release.py --allow-dirty --no-stage
python -m pytest tests/ -q                      # run alone: drift tests swap shipped files
python scripts/check_browser.py --web           # real Chrome; launch failure is exit 2, never a skip
```

The same gates run on GitHub for every pull request and every push to `main`
(`.github/workflows/checks.yml`). After editing `core/`, run
`python scripts/build_core.py`; after any behaviour change, bump cache tokens
with `python scripts/bump_web_tokens.py` (see [AGENTS.md](AGENTS.md)).

## Documentation

| Document | Use it for |
|---|---|
| [AGENTS.md](AGENTS.md) | Rules for changing this repository and the commands to use |
| [DEVELOPMENT.md](DEVELOPMENT.md) | How the planner works: architecture, data flow, storage, horizon model |
| [DESIGN.md](DESIGN.md) | Workbench design system and UI conventions |
| [CATALOG.md](CATALOG.md) | Catalog sources, supplement and rebuild |
| [ROADMAP.md](ROADMAP.md) | Status, the next release and open work |
| [BUGS.md](BUGS.md) | Open defects and known limitations |
| [DECISIONS.md](DECISIONS.md) | Why things are the way they are (newest first) |
| [RELEASES.md](RELEASES.md) | Validation and deployment receipts (newest first) |
| [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) | Tagging, staging and publishing a release |
| [HOSTING_CONFIGURATION.md](HOSTING_CONFIGURATION.md) | Server cache, compression and header policy |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Windows sandbox limits and test scratch handling |
| [docs/](docs/history/README.md) | Acceptance checklists, horizon plans, history |

## Status

v0.1.1 is published. The next release is 0.7.0; see [ROADMAP.md](ROADMAP.md).

## License

MIT; see [LICENSE](LICENSE). [NOTICE](NOTICE) credits OpenNGC, Wikimedia,
Open-Meteo and the popularity data.
