# Integrity notes - review process deviations

Recorded during the 0.6.32-full review, in the order observed. These are
deviations by the REVIEW, not product defects.

## 1. A lane wrote a probe artifact into the real `data/panos/` (2026-09-15 19:47:26)

- Observed: `data/panos/ok.jpg`, 1 byte, mtime 2026-09-15 19:47:26 - during the
  review window (lanes were active 19:31-19:48).
- Constraint violated: the review brief forbids writing to `data/`; probes must
  use `logs/` or a temp dir.
- Not affected: `data/nightseam.db` (mtime 2026-09-13 19:27, unchanged),
  `data/nightseam.db.backup`, `data/imgcache/`, `data/*.csv`,
  `data/popularity_snapshot.json` - all unchanged.
- Pre-existing leftovers, NOT from this review (do not attribute these to it and
  do not delete them): `data/panos/40b7ee3dd245297.jpg` and
  `data/panos/e499a564d445615.jpg`, 3 bytes each, both mtime 2026-09-12 - the
  same class of leak from an earlier review session.
- Action: `data/panos/ok.jpg` is to be deleted after all lanes stop, so the
  directory is returned to its pre-review state. Verified pre-review state was
  exactly those two 3-byte files plus the tracked `.gitkeep`.
- Attribution: the responsible lane is the one whose probe restored a bundle
  against the unpatched data directory (checked against the lane reports once
  they are written); it is a probe-isolation failure, not evidence of a product
  vulnerability - a legitimate restore writes panorama payloads into the
  configured `data/panos` by design.

## 2. Evidence-script defect in the pre-existing browser pass (found 19:40)

`evidence/browser_review.py` polls `#topbar` in its `geometry()` helper, but the
web shell has no element with that id (`web/index.html:21` is
`<header class="topbar">`). Every `topbar` value in
`evidence/ui/ui_measurements.json` is therefore `null` and the topbar height was
never measured by that pass. It does not affect the overflow findings, which use
`documentElement.scrollWidth`. The later pass (`evidence/ui_probe.py`) uses
`.topbar` and measured it.

## 3. Screenshots were never interpreted (structural, not a deviation)

The reviewing model has no image input, so all 18 PNGs under `evidence/ui/` are
raw, uninterpreted evidence. Any aesthetic judgement (glare, hierarchy, chart
legibility) is absent from this review and is declared as such in
`50-ui-ux.md` and in the final summary.
