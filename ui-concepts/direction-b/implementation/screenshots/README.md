# Direction B implementation screenshots

These are viewport captures from the current desktop executable and web shell,
made 2026-09-27 for visual review. They are not pixel-diff fixtures; all
astronomy and catalog values are live app output.

## Capture state

- Site: Black Forest, 48.0° N, 8.2° E, Europe/Berlin (900 m)
- Night: 2026-09-26; selected time: 22:36 local
- Selected target: the current top-ranked object in Tonight and M31 / NGC 224
  in Catalog and Library; Sky View follows its selected visible target
- Minimum altitude: 25°; edge space: 16 px; full-day view: off
- Theme: Workbench
- Desktop library: isolated temporary FITS archive with three M31 sessions,
  light/dark/flat/bias frames, and two additional catalog objects, all imported
  through the normal FITS ingest and session grouping paths
- Horizon editor: isolated synthetic Black Forest ridge image and a saved
  obstruction stroke

## Matrix

- Desktop: Tonight, Catalog, Sky View, Horizon, Import Exposures, Library, Sky
  Map × Workbench × 1672×941, 1240×900, and 900×800 (21 PNGs).
- Web: Tonight, Catalog, Sky View, Horizon × Workbench × 1672×941, 1240×900,
  900×800, 640×900, and 360×800 (20 PNGs).

## Reference and measured first-viewport acceptance

The table compares each concept PNG with the fresh 1672×941 captures. Bounds
are measured in CSS pixels from the viewport origin. A gap is listed when a
required region is missing, outside the first viewport, too small, or lacks
the required row density. Full per-region measurements and responsive overflow
results are in `layout-measurements.json`.

| Screen | Reference → new capture | Measured region bounds and result |
|---|---|---|
| Tonight | [Tonight reference](../../tonight.png) → [desktop](desktop-tonight-workbench-wide-1672x941.png) · [web](web-tonight-workbench-wide-1672x941.png) | PASS<br>desktop brief: 16,102 1268×136 px (in view)<br>desktop plot: 29,322 1242×282 px (in view)<br>desktop scrub: 179,611 1092×18 px (in view)<br>desktop ranked: 30,682 1240×833 px (partial/offscreen)<br>desktop inspector: 1309,232 334×298 px (in view)<br>desktop inspector_chart: 1309,542 334×208 px (in view)<br>desktop inspector_visibility: 1415,398 228×132 px (in view)<br>desktop rows: 4 fully visible of 16<br>web brief: 38,117 1252×132 px (in view)<br>web plot: 39,315 1250×282 px (in view)<br>web scrub: 180,629 1099×16 px (in view)<br>web ranked: 50,704 1228×832 px (partial/offscreen)<br>web inspector: 1331,182 323×155 px (in view)<br>web inspector_chart: 1331,379 323×220 px (in view)<br>web inspector_visibility: 1331,606 323×35 px (in view)<br>web rows: 4 fully visible of 16 |
| Catalog | [Catalog reference](../../catalog.png) → [desktop](desktop-catalog-workbench-wide-1672x941.png) · [web](web-catalog-workbench-wide-1672x941.png) | PASS<br>desktop filter_rail: 16,102 224×515 px (in view)<br>desktop table: 252,151 832×706 px (in view)<br>desktop pager: 252,852 832×44 px (in view)<br>desktop inspector_image: 1109,191 96×84 px (in view)<br>desktop inspector_chart: 1109,501 534×208 px (in view)<br>desktop inspector_visibility: 1215,358 428×132 px (in view)<br>desktop rows: 20 fully visible of 20<br>web filter_rail: 38,150 236×581 px (in view)<br>web table: 305,178 768×623 px (in view)<br>web pager: 288,830 802×33 px (in view)<br>web inspector_image: 1131,197 108×90 px (in view)<br>web inspector_chart: 1131,383 523×220 px (in view)<br>web inspector_visibility: 1131,610 523×35 px (in view)<br>web rows: 20 fully visible of 20 |
| Sky View | [Sky View reference](../../sky-view.png) → [desktop](desktop-sky-view-workbench-wide-1672x941.png) · [web](web-sky-view-workbench-wide-1672x941.png) | PASS<br>desktop disc: 321,102 686×686 px (in view)<br>desktop time_rail: 321,798 686×79 px (in view)<br>desktop summary: 1338,148 306×169 px (in view)<br>desktop chart: 1338,323 306×104 px (in view)<br>desktop visible_list: 1338,465 306×238 px (in view)<br>desktop rows: 8 fully visible of 8<br>web disc: 364,132 655×655 px (in view)<br>web time_rail: 38,814 1306×119 px (in view)<br>web summary: 1371,173 246×157 px (in view)<br>web chart: 1371,336 246×110 px (in view)<br>web visible_list: 1371,500 246×206 px (in view)<br>web rows: 8 fully visible of 8 |
| Horizon | [Horizon reference](../../horizon.png) → [desktop](desktop-horizon-workbench-wide-1672x941.png) · [web](web-horizon-workbench-wide-1672x941.png) | PASS<br>desktop photo_stage: 268,102 1056×352 px (in view)<br>desktop profile: 268,579 1056×231 px (in view)<br>desktop summary: 280,789 1032×13 px (in view)<br>desktop settings_rail: 1336,102 320×821 px (in view)<br>web photo_stage: 255,185 1057×353 px (in view)<br>web profile: 255,550 1057×283 px (in view)<br>web summary: 268,744 1031×34 px (in view)<br>web settings_rail: 1324,150 310×745 px (in view) |
| Library | [Library reference](../../image-catalog.png) → [desktop](desktop-library-workbench-wide-1672x941.png) | PASS<br>desktop object_rail: 28,225 238×160 px (in view)<br>desktop hero_totals: 290,144 1058×122 px (in view)<br>desktop sessions: 303,346 1033×96 px (in view)<br>desktop session_rollup: 1373,189 271×374 px (in view)<br>desktop session_actions: 1373,576 271×73 px (in view)<br>desktop import_area: 290,505 1058×70 px (in view)<br>desktop rows: 3 fully visible of 3 |

## Visual review

Visual review is complete for the nine wide captures against their reference
PNGs. The largest remaining differences are:

1. **Tonight summary and chart hierarchy.** The implementation foregrounds a
   compact fact strip, chart, and ranked table. The reference gives the night
   summary more visual weight with separated time and moon-phase groups, and
   its chart adds visible-interval and obstruction annotations that are not as
   prominent in the current captures.
2. **Catalog filter and row density.** The compact table fits 20 rows, but
   several common names truncate early; some type filters are in a native
   scrolling list or behind “More filters.” The reference gives the filter
   choices more room and presents the object-type controls as visible groups.
3. **Sky View chart footprint.** The desktop chart is narrower than the
   reference and leaves a broad unused gutter; the web time controls occupy a
   separate full-width block below the chart. The reference gives the polar
   chart more of the page and keeps the scrub rail directly beneath it.
4. **Horizon editing surface.** The reference shows the panorama, profile,
   profile statistics, and editing controls together. The desktop capture opens
   the panorama overview and requires entering Edit for the paint workflow; the
   web capture uses a split horizon list/editor layout. Both captures show
   simplified hill/obstacle artwork where the reference uses a photographic
   panorama.
5. **Library session diagnostics.** The implementation shows object totals,
   sessions, frame counts, exposure, and filters, but the selected-session rail
   does not include the reference's per-frame mean, median, deviation, minimum,
   and maximum ADU statistics.

Responsive screenshot captures also include 1240×900 and 900×800 desktop, plus
640×900 and 360×800 web views. `layout-measurements.json` records page-level
horizontal overflow for every capture width.

Filenames use `shell-view-theme-size-widthxheight.png`. Rerun from the repository
root with `python -B ui-concepts/direction-b/implementation/capture_screenshots.py`.
