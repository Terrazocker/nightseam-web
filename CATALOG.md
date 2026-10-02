# Website catalog pipeline

The browser payload is web/catalog.json, with catalog.manifest.json pairing its
bytes with CATALOG_TOKEN in web/app.js. Provenance is a separate payload and
manifest/token. Source CSVs, popularity and selection policy are owned locally
by catalog_data/ after the desktop split; no application database is required.

```powershell
python web/build_web.py catalog
python scripts/build_catalog_provenance.py
python scripts/check_catalog_token.py
python scripts/check_catalog_provenance.py
python scripts/check_js.py
```

The catalog remains OpenNGC plus the documented 16-object supplement, with
12,176 objects and deterministic standard selection of the 200 most popular
scored objects. Dropped non-objects/duplicates, global IDs, display mappings and
provenance rules remain enforced. Changes to a served payload require its token
and manifest to change in the same commit. Never patch collisions through a
runtime map or use no-store to conceal a missed token bump.

The Windows catalog owns its own copy of the input data and selection policy in
Nightseam-catalog. Changes are no longer automatically shared between projects.
