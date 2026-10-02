# NightSeam Web agent instructions

This canonical repository now contains only the website and landing pages:
`<workspace>/Nightseam-programm`.
The local Windows catalog is an independent sibling repository at
`<workspace>/Nightseam-catalog`, starting at 0.1.0.
Do not read sibling files as build dependencies, share databases, synchronize
versions or recreate the combined desktop project here. The deprecated
`<archive>/Object-Astro` archive remains read-only.

## Architecture and design

- Read DESIGN.md before UI changes. Workbench is the only theme, with semantic
  role tokens in web/themes.css and canvas adapters. Legacy theme values
  normalize to workbench. No npm or JavaScript bundler is used.
- web/ is the browser planner; landing/ is the public site. core/ is the only
  astronomy/planning implementation. catalog_data/ owns the website's catalog
  source data, parsers and popularity policy, without desktop/storage imports.
- Edit core/ and run python scripts/build_core.py; never manually edit baked
  trees or generated web/core.js. Maintain content hashes, exports, stub token
  pairing and current plus N-1 retention. Never reimplement moved core math.
- Published reference_anchors checks are the correctness authority; frozen
  fixtures are regression evidence. Never update fixtures to hide a formula bug.
- Preserve site-zoned noon/night/scrub rules, selected-time truth, apparent
  altitude Sun/Moon visibility, half-open clear windows, world-bin panorama
  profiles, non-destructive web crops and one shared scoring loop.
- Keep standard catalog IDs global and safe, standard 200 selection deterministic,
  and source/provenance/display counts consistent. Popularity is not visible UI.
- Web backup validates/stages the entire bundle before writing and rolls back
  failures. Stored strokes win over profiles; absent strokes leave authoritative
  profiles intact. Dirty editor history, undo/redo and beforeunload remain safe.
- Advanced options use the hamburger menu with quiet defaults. Site, Rig and
  minimum altitude remain common top-bar controls. Preserve keyboard/focus,
  accessible names, reduced motion and non-color summaries.

## Commands and releases

- Preview: python -m http.server 8080 --directory web.
- Tests: python -m pytest tests/ -q --tb=no; relevant modules while editing,
  full suite once at the end. JS: python scripts/check_js.py.
- Browser: python scripts/check_browser.py --web. Launch failures are hard
  infrastructure failures, never skips. Read ENVIRONMENT.md for named-pipe limits.
- Catalog/version helpers: python web/build_web.py catalog; python
  web/build_web.py version. Both use only this repository.
- Before staging run python scripts/check_release.py with development flags
  when appropriate. Release versions follow this repository's existing tags;
  the catalog's v0.1.0 belongs only to its independent repository.
- Every behavior change bumps the relevant ?v= cache token and entry-point
  references. catalog.json has CATALOG_TOKEN and its manifest; provenance has
  its own token/manifest. Run bump_web_tokens.py and check_js_tokens.py --update
  only after all missed bumps are corrected. Never use no-store to hide drift.
- Curate changelog before a release commit/tag; pre_tag_check.py must pass before
  tagging. Bake web/version.json from truthful git describe including --dirty.
  Do not stamp guessed clean releases or retag old versions.
- Deployment: python web/ftps_deploy.py uploadtree web /astro; landing to /.
  Credentials remain outside Git. Never publish index.html before its modules;
  upload_order puts HTML last. Public deployment requires user authorization.
  No desktop EXE/ZIP/version equality is part of web release validation.

## Current web cache-token register

Keep this register aligned with entry-point references and the core manifest.
Current:
- `web/app.js?v=137`
- `web/astro.js?v=30`
- `web/horizon.js?v=69`
- `web/webstore.js?v=41`
- `web/format.js?v=37`
- `web/nightrank.js?v=29`
- `web/viztheme.js?v=6`
- `web/core.js?v=44`
- `web/style.css?v=44`
- `web/themes.css?v=16`

## Working discipline

Delegate bulk reading touching several files and request a digest, not files.
Keep tool output concise and use explicit UTF-8 without BOM for text rewrites.
Tests and scratch stay in ignored logs/, never in a user profile. Document
confirmed unresolved findings in BUGS.md, architecture in DEVELOPMENT.md,
decisions in DECISIONS.md and actual validation outcomes in RELEASES.md.
Historical combined-project entries may mention removed desktop files; current
commands and authority are this file. Recovery snapshots are ignored local
logs/repository-split/, not release content.
