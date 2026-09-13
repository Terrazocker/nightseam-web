"""Catalog policy: the object-type vocabulary and the standard-mode selection.

The catalog DATA is OpenNGC - `app/data/openned.csv`, built by
`scripts/build_adv_catalog.py` from `database_files/NGC.csv` + `addendum.csv`.
There is NO hand-curated object list any more (the 197-object list that used to
live here was removed): every row in either mode is an OpenNGC object.

What this module owns is the policy both shells share:

  * `TYPE_LABELS` - the object-type vocabulary an OpenNGC type is mapped into
    (`core/catalog.js` documents the same palette), and
  * `STANDARD_TOP_N` / `standard_ids()` - standard mode is the N MOST POPULAR
    objects (`app/popularity_data.py`), advanced mode is the whole catalog.
    Popularity itself stays INVISIBLE in both UIs (it is a silent ranking
    tiebreaker, pinned by `tests/test_ui_invariants.py`) - it only decides
    WHICH objects the standard list contains.
"""

TYPE_LABELS = {
    "globular": "Globular cluster",
    "open_cluster": "Open cluster",
    "nebula": "Nebula",
    "planetary": "Planetary nebula",
    "galaxy": "Galaxy",
    "supernova_remnant": "Supernova remnant",
    "asterism": "Asterism / double star",
    "star_cloud": "Star cloud",
}

# Standard mode = this many objects, by the popularity source popularity. Advanced mode
# adds every other OpenNGC object; the two tables are disjoint, so the catalog
# is exactly `openned.csv` either way.
STANDARD_TOP_N = 200


def standard_ids(ids, popularity=None, top_n: int = STANDARD_TOP_N) -> set[str]:
    """The standard-mode id set: the `top_n` most popular objects.

    Deterministic (score descending, then id ascending) and conservative: an
    object with no score is not "popular" and never becomes standard, so a
    catalog with fewer than `top_n` scored objects simply has a smaller standard
    list rather than a list padded with unscored rows.

    `popularity` defaults to the shipped table - pass a dict to test the rule.
    """
    if popularity is None:
        from .popularity_data import POPULARITY as popularity
    ranked = sorted(((popularity.get(i, 0), i) for i in ids),
                    key=lambda pair: (-pair[0], pair[1]))
    return {oid for score, oid in ranked[:top_n] if score}
