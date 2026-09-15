# Final gate results - NightSeam 0.6.32 full review

Everything below was run by the captain at the end of the review, after all nine
lanes stopped. No lane ran the full suite or the browser gate (the lane briefs
forbade it, and no lane could launch a browser).

## Subject

- `git describe --tags --always` -> **`v0.6.32-3-g3277846`**
- HEAD -> **`3277846 release record: 0.6.32`**
- Tracked tree after every command below -> **clean**; the only untracked entries
  are `REVIEW-PROMPT.md` (user-supplied, never modified) and
  `reviews/0.6.32-full/` (this review).
- `python main.py --version` -> `NightSeam 0.6.32-3-g3277846` (from source).

## Gate prerequisites (verified, not assumed)

| requirement | measured |
|---|---|
| `node` | **v24.19.0** |
| Python | **3.14.7** |
| Chrome (Playwright `channel="chrome"`) | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
| packed exe | `dist\NightSeam.exe`, 19.8 MB, mtime **2026-09-13 22:37:52** |
| exe vs tag | tag `v0.6.32` = commit `2966a3c` at **22:37:08**, i.e. the exe was built **44 s after** the tag. `git diff --stat v0.6.32..HEAD` touches only `RELEASES.md`, `landing/changelog.json`, `tests/browser/desktop_suite.py` - **no shipped module** - so the exe is representative of the shipped desktop code and `--desktop` is a fair test. The gate also picks up the tree's harness, which includes the post-tag flake fix. |
| `pywebview` in this interpreter | **not importable** - `main.py` falls back to browser app-mode, unchanged from the review's start (not a regression; see `DE-03`) |

## 1. `python -m pytest tests/ -q --tb=no`

```
508 passed, 1 warning in 139.34s (0:02:19)
exit code 0
```

The single warning is the third-party `StarletteDeprecationWarning` about
`httpx`/`starlette.testclient`. No `WinError 5` tmp-cleanup noise appeared (the
`tests/conftest.py` `tmp_path` override does its job). **0 assertion failures,
0 errors, 0 skips reported.**

Note: `AGENTS.md` advertises **507** tests in two places; **508** are collected
today. Filed as `DOC-05`.

## 2. `python scripts/check_js.py`

```
checked 76 js files, 0 broken import(s)
desktop: all JS-referenced element ids exist in index.html (202 ids in html, 184 referenced from js)
web:     all JS-referenced element ids exist in index.html (44 ids in html, 115 referenced from js)
checked 76 js module(s), 0 syntax error(s)
check_encoding: OK
check_catalog_token: OK
check_js_tokens self-test: OK
check_js_tokens: OK
check_core: OK
check_js_defs: done, 10 candidate(s)      (heuristic, always exits 0)
check_js: OK
exit code 0
```

Matches the documented scope (76 modules including the retained N-1 baked-core
tree). `check_js_defs` is the documented always-0 heuristic.

## 3. `python scripts/check_browser.py --all`  (needs one unsandboxed command)

```
  [PASS] web     web-load-smoke (1.4s)
  [PASS] web     web-cache-tokens (1.2s)
  [PASS] web     web-horizon-actions-not-full-width (2.1s)
  [PASS] web     web-pano-paint-save-persist (3.3s)
  [PASS] web     web-pano-undo-redo-clear (3.1s)
  [PASS] web     web-pano-storage-quota (2.2s)
  [PASS] web     web-pano-canvas-dpr-resize (2.7s)
  [PASS] web     web-sky-band-no-diagonal-chord (1.2s)
  [PASS] web     web-sun-moon-above-horizon (1.2s)
  [PASS] web     web-scrub-changes-time (1.2s)
  [PASS] web     web-mag-slider-changes-sky (2.5s)
  [PASS] web     web-pano-crop-recalibrate (2.7s)
  [PASS] web     web-catalog-advanced-minvis (3.6s)
  [PASS] web     web-catalog-tier-frame (32.3s)
  [PASS] desktop desktop-boot (1.3s)
  [PASS] desktop desktop-worker-date-change (1.6s)
  [PASS] desktop desktop-worker-kill-sync-fallback (1.7s)
  [PASS] desktop desktop-pref-rescore (1.4s)
  [PASS] desktop desktop-advanced-mode (3.4s)
  [PASS] desktop desktop-catalog-tier-minvis (2.0s)
  [PASS] desktop desktop-scrub-window (1.3s)
  [FAIL] desktop desktop-pano-crop-fov (91.9s)
         TimeoutError: Page.wait_for_function: Timeout 90000ms exceeded.
check_browser: 21/22 passed
exit code 1
```

**Re-run of the single failure** (the project's documented rule is to re-run a
cold-start timeout before investigating):

```
python scripts/check_browser.py --desktop --only pano-crop
  [PASS] desktop desktop-pano-crop-fov (3.0s)
check_browser: 1/1 passed
exit code 0
```

So the gate is **22/22 effectively, 21/22 in one cold run**: the failure is a
PyInstaller cold-start flake (91.9 s vs a 90 s wait, then 3.0 s), not a product
regression. The post-tag commit `d6ace7a` raised this same wait from 30 s to 90 s
and the cold path still exceeds it - filed as `TR-12`.

Two things this gate verified that no lane could:

- the **"progress never moves the layout"** invariant (0.6.31) is genuinely
  exercised - `web-catalog-tier-frame` measures table/column/stats/topbar
  geometry before, during and after a live warm (32.3 s) and passes. The UI
  lane's own attempt at this was inconclusive (no busy state appeared), so the
  gate is what covers it;
- the **desktop worker-kill / sync-fallback** path and the desktop panorama crop
  checks run against the real packed exe.

## 4. Why the browser gate needed an unsandboxed command

Chromium cannot start under the workspace-write sandbox token: its mojo IPC needs
**named pipes**, and the Playwright driver itself needs asyncio **overlapped
pipes** (`_winapi.CreatePipe`, WinError 5). Both were hit during this review (the
captain's own UI probe died on the driver spawn before the escalation; no lane
could escalate at all). This is the measured, documented boundary at
`ENVIRONMENT.md:37-54`, not a defect. `tests/test_browser_gate.py` pins the
exit-2 conversion for exactly this case.

## 5. Tree and data state after the review

- `git status --porcelain` -> `?? REVIEW-PROMPT.md` and `?? reviews/0.6.32-full/`
  only. No tracked file changed; `app/data/openned.csv` was rewritten
  byte-identically once by the docs lane as evidence (`git diff` clean).
- **User data**: `data/nightseam.db` (2026-09-13 19:27), its `.backup`,
  `data/imgcache/`, `data/*.csv` and `data/popularity_snapshot.json` are all
  unchanged. One lane wrote a 1-byte probe artifact, `data/panos/ok.jpg`, during
  the review; it was removed and `data/panos/` returned to its pre-review
  contents (the tracked `.gitkeep` plus two 3-byte `.jpg` files that predate this
  review). See `evidence/INTEGRITY-NOTE.md`.
- No server was left listening on 8407 (or any of 8411/8412/8419); no stray
  NightSeam process; no build, tag, deploy or upload was performed.
