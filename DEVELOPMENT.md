# NightSeam Web development

The website and landing pages are developed and released independently of the
Windows catalog. The split on October 1, 2026 preserves the current web code,
core astronomy authority, catalog payload, provenance and existing web history.

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
