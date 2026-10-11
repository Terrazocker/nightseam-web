# NightSeam Web agent instructions

This repository is the NightSeam website: a static browser planner and the
public landing pages. These are the rules and commands for changing it. How the
planner works is in DEVELOPMENT.md; why things are the way they are is in
DECISIONS.md.

## What lives where

| Path | What it is |
|---|---|
| `web/` | The planner, served at `/astro/`. Plain ES modules, no npm or bundler. |
| `landing/` | The public pages, served at `/`. |
| `core/` | The only astronomy, planning, scoring and horizon implementation. |
| `catalog_data/` | Catalog source data, parsers and popularity policy. |
| `scripts/` | Build, guard, release and publication tools (Python). |
| `tests/` | pytest guards, Node tests (`tests/js/`) and browser checks (`tests/browser/`). |

The Windows catalog is an independent sibling repository
(`../Nightseam-catalog`). Do not read its files as build inputs, share
databases or synchronize versions with it. The old `<archive>/Object-Astro`
archive is read-only.

## Never, without the owner saying so in this conversation

- Push, merge, tag, publish or deploy. Credentials never go into Git.
- Change server policy (`.htaccess`, headers); it needs a separate review.
- Update fixtures, baselines or expected values to make a failing test pass.
  The published reference anchors (`tests/js/reference_anchors.mjs`) are the
  correctness authority; frozen fixtures only catch regressions.
- Weaken a check. Browser launch failures are hard infrastructure failures,
  never skips. Never use `no-store` to hide cache-token drift.

## Making a change

1. Read the relevant guide first: DESIGN.md for any UI change, CATALOG.md for
   catalog data, DEVELOPMENT.md for planner internals.
2. Edit sources only. `core/` is baked into `web/core/<hash>/` and `web/core.js`
   by `python scripts/build_core.py`; never edit those generated files, and
   never reimplement core math in `web/`.
3. Bump cache tokens for everything whose bytes changed:
   `python scripts/bump_web_tokens.py`, then record the new verified state with
   `python scripts/check_js_tokens.py --update`. Catalog payload changes bump
   `CATALOG_TOKEN` / `CATALOG_PROVENANCE_TOKEN` and their manifests (CATALOG.md).
4. Run the tests for what you touched while editing; run the full suite once at
   the end.
5. Update the documents your change affects (see "Where things are recorded").

Text files are UTF-8 without BOM. Scratch output goes under ignored `logs/`
(disposable probes through `scripts/scratchspace.py`), never into a user
profile or the repository root. Commits go on a branch, not on `master`.

## Commands

```
python -m http.server 8080 --directory web     # preview the planner
python -m pytest tests/ -q --tb=no             # full Python + Node suite
python scripts/check_js.py                     # JS syntax, imports, tokens
python scripts/check_browser.py --web          # real-Chrome checks
python scripts/check_release.py --allow-dirty --no-stage   # release guards during development
python web/build_web.py catalog                # rebuild the catalog payload
python web/build_web.py version                # bake web/version.json
```

CI (`.github/workflows/checks.yml`) runs the guards, pytest and the browser
suite on every push and pull request; keep it aligned with these commands.
Run pytest and the browser suite one after the other, not in parallel: some
guard tests temporarily replace shipped files. ENVIRONMENT.md covers this
machine's sandbox limits (Chrome named pipes, elevated runs).

## Behaviour that must not regress

**Time and the night**
- Dates are the observing site's calendar date. A night runs from the site's
  local noon to the next site noon; dark windows, the scrubber and the detail
  card all use that night.
- One selected instant drives every view.
- Sun and Moon visibility uses apparent altitude.

**Scoring**
- Every view uses the one shared scoring loop. Windows are half-open and
  clipped to the dark window.
- Popularity only breaks ties and is never shown in the UI.

**Horizons**
- Profiles are stored in world-azimuth bins.
- Stored strokes win over a stored profile; a record without strokes keeps its
  profile. Crops never modify the original photo.
- Editor history stays safe: dirty state, undo/redo and the leave-page warning.

**Catalog**
- Standard catalog IDs are globally unique and stable. The standard 200-object
  selection is deterministic. Source, provenance and displayed counts agree.

**Backups**
- Import validates and stages the whole bundle before writing anything, and
  rolls everything back on failure.

**UI**
- Workbench is the only theme; colors come from the role tokens in
  `web/themes.css`.
- Site, Rig and minimum altitude stay in the top bar; advanced options live in
  the hamburger menu with quiet defaults.
- Keep keyboard access, focus order, accessible names, reduced motion and
  summaries that do not rely on color alone.

## Releases

- Public versions restarted at 0.1.0 (published: 0.1.0, 0.1.1). Inherited tags
  occupy 0.1.5-0.6.36, so the next release is 0.7.0 or higher;
  `scripts/pre_tag_check.py` refuses reused or lower names and must pass before
  tagging. Never retag or delete inherited tags.
- Curate the changelog (`scripts/build_changelog.py`) before the release
  commit. `web/version.json` comes from `git describe --dirty`; never stamp a
  guessed clean version.
- Publication: `python scripts/prepare_publication.py` builds an immutable
  candidate; deploy only a reviewed bundle with
  `python web/ftps_deploy.py publish dist/publication-preview /`.
  RELEASE_WORKFLOW.md has the details.

## Where things are recorded

| Document | Holds |
|---|---|
| BUGS.md | Open findings only; remove an entry when it is fixed |
| ROADMAP.md | Status and next work |
| DEVELOPMENT.md | How the planner currently works |
| DECISIONS.md | Decisions and their reasons |
| RELEASES.md | Actual validation outcomes, never expected ones |
| docs/acceptance/ | Owner acceptance checklists |
| docs/horizon/ | Active horizon plans |
| docs/history/ | Finished plans, reviews and old logs (may mention removed desktop files; this file is the current authority) |

## Subagents

- Bulk reading across several files: use `digest-reader` and ask for a digest
  with file:line references, not file contents.
- Reviews: use `reviewer`. Verify each finding yourself before reporting it.
- Full-suite runs with long output: use `validator`.
- Keep all edits in the main session. Do not run parallel writers: the core
  build and the cache-token baseline are shared by almost every change.
