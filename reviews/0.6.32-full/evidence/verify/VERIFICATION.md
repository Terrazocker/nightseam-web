# Adversarial verification record (captain)

Every `blocker` and `high` finding is re-verified here by the captain, not by the
lane that filed it. The rule from the review brief: a high/blocker only stands if
an independent attempt to reproduce it succeeds, and the strongest counter-
argument is defeated rather than noted.

## PY-01 - blocker - `/api/library/edit` silently overwrites a same-named frame

**Verdict: UPHELD as blocker. Independently reproduced.**

Lane evidence: `evidence/python/` (its own probe).
Captain's independent reproduction: `evidence/verify/verify_py01_captain.py`.

Deliberately built differently from the lane's probe - it uses only the public
HTTP API and manufactures the collision with documented calls:

1. ingest an unresolved object (`Unk B`, EXPTIME 60) -> folder `Unk B/`
2. `POST /api/library/edit {"name":"Unk B","new_name":"NGC 7000"}` -> folder
   `NGC 7000/` now exists (destination)
3. ingest a second unresolved object (`Unk C`, EXPTIME 120) with the SAME file
   name `Light_001.fit` and the same `DATE-OBS`
4. `POST /api/library/edit {"name":"Unk C","new_name":"NGC 7000"}`
   -> `old != new` and `new.exists()` -> the `app/ingest.py:215-221` merge branch

Observed (`VERDICT` block of the probe output):

| measurement | value |
|---|---|
| route status | `200 {"ok":true,"name":"NGC 7000"}` |
| files under the archive | 2 before -> **1 after** |
| destination frame `EXPTIME` | **60.0 before -> 120.0 after** (original bytes destroyed) |
| DB rows | 2 rows, both `file = NGC 7000/2026-08-22_2314/lights/Light_001.fit` |
| row metadata | one row still claims `exposure 60.0` for a file whose header says 120.0 |

So: unrecoverable frame bytes, silent success, and two rows aliasing one path -
the library now reports a frame that no longer exists with metadata that
contradicts the file on disk.

**Counter-argument tested and defeated.** The defence is "merging into an
existing folder is the documented intent of `rename_archive_folder`, and the user
typed the target name". Three things defeat it:

1. The sibling code path in the SAME module establishes the opposite convention:
   `app/ingest.py:88-89` does `while target.exists(): target = sub /
   f"{stem}_{n}{suffix}"` - ingest never overwrites, it uniquifies to
   `Light_001_2.fit`. The rename-merge path is the only one that clobbers, so it
   contradicts the project's own rule rather than implementing a policy.
2. "Merging" is not what happens: the destination frame is *replaced*, and the
   docstring (`app/ingest.py:206-209`) only promises not to strand stored paths.
3. The UI posts with no confirmation (`static/js/archive.js:286-302`) and
   `tests/test_api.py:287-304` only covers a rename to a FRESH name, so nothing
   tells the user a same-named frame may be destroyed.

No rollback exists on this path: the `<db>.backup-auto.zip` safety copy is
written by the IMPORT route only, so a library edit has no recovery at all. That
is what makes this a blocker rather than a medium.

## UI-01 - high - classic theme forces a 548 px minimum page width

**Verdict: UPHELD as high. Independently reproduced twice.**

Two separate browser passes, different scripts, agree: `docW = 548` at viewports
320/360/400/480 with `document.documentElement.scrollWidth === 548` (never
overflowing at 600+), worst element `body>.topbar>.topbar-right` at `L22 R548
W526`. Mechanism confirmed by reading the CSS, not by inference: `.topbar-right`
has no `flex-wrap` (`web/style.css:72`) while its child `.nightinfo` is
`white-space: nowrap` (`style.css:74`); dome masks it by hiding that child below
900 px (`web/themes.css:341`). Counter-argument ("Classic is only a fallback")
does not defeat it: Classic is one of two shipped, user-selectable themes and the
project's own gate tests a 360 px viewport.

## Adjustments made during verification (captain's rulings)

- **PY-03 (medium) stands, but not as data loss.** The lane settled it against
  the pre-existing evidence probe: `AGENTS.md` scopes staged-commit + rollback to
  the WEB `restoreBackup`, and promises the Python path only a best-effort
  `<db>.backup-auto.zip`, which the lane verified still holds the PRE-import state
  (sites `['Original']`, no panoramas). So the defect is a misleading status code
  and a partially-applied restore, not unrecoverable loss. Kept at medium.
- **DE-03 is reclassified out of the findings.** It is a true and useful statement
  ("the packed exe and the browser gate could not run in that lane's sandbox") but
  it is a coverage limit of the review, not a defect of the product. Moved to the
  not-checked list; the captain ran the browser gates from the escalating session.
- **CD-01 and CD-07 stay separate.** Captain-verified: `static/index.html:129` is
  a *user-visible* stale count (12,160 vs the shipped 12,176 rows) while
  `web/app.js:255` is a code comment. Same root cause, different audience and
  severity; cross-referenced rather than merged, so the user-facing one keeps its
  medium severity.
- **DOC-02 independently confirmed by the captain** before the lane filed it: the
  boot fetch is real (`web/app.js:98`, called unconditionally at `:2521`) and
  The popularity source appears in no user-facing page, while `landing/privacy.html:37-52`
  enumerates the planner's other network calls.
