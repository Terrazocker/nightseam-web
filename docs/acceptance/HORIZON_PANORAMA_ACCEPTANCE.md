# Horizon/Panorama remaining owner acceptance

The earlier phases and simplification A–E are implemented locally. F's software
receipts are in RELEASES.md.
The owner elected to handle the following real-world checks. The immutable local
review candidate is `dist/publication-preview`; public publication is a separate
decision.

## Real photographs

Use one level, upright full equirectangular panorama and one partial photograph.
Record the original coverage/projection, two recognizable features' true bearings
and altitude angles, and a separate check feature's bearing/altitude
before entering setup. Correct magnetic readings to true north first. A roof or
tree outline is not a level reference. An ordinary unsupported camera projection
should remain approximate, even if a local reference agrees.

For D/E, also use a cylindrical panorama with trustworthy source geometry and,
if available, an ordinary lens-corrected photo with known horizontal coverage and
orientation. The ordinary model assumes centred square-pixel optics. Review the
detected metadata or enter those known parameters under Photo geometry / leveling;
preview the corrected view before applying. Confirm features across the whole
retained view, including near edges and different heights. Tilted edges may be
excluded; the planner must block those directions. Use a new unpainted horizon
for conversion. Do not interpret a successful conversion as lens/stitching repair.

1. Import each image, confirm its photo type/known full coverage, and mark the two
   complete measured reference points. Review the calculated alignment before
   applying it; the preview must not change live planning. For the partial view,
   North need not appear. Separate legacy references remain under Advanced setup.
   New full-360 fits balance both measured bearings and show their residuals;
   each must be within the app's 1° acceptance policy. This policy is not a
   measurement accuracy guarantee. Investigate systematic discrepancies rather
   than rounding input measurements to force agreement.
2. Compare the withheld check feature with the overlay and displayed signed
   discrepancies. Record measured and displayed values; investigate discrepancies
   rather than adjusting the check reference to match the fit.
3. Trace a roof/tree outline, adjust a point, and use brush/eraser for a local
   correction. Confirm the planner blocks the corresponding direction and height.
   For a balcony/overhang, use Sky band with block above band, rather than a skyline.
4. Crop, undo/redo, save/reload and restore a backup. Confirm recognizable features,
   trace/corrections and planner obstruction remain aligned. Review calibration
   again if a fit reference was cropped out.
5. Add independently measured extra fitting points and at least two held-out
   checks spread across bearing/height. Review each fit residual and worst check
   discrepancies. Exclude a suspect measurement explicitly and record why.
   Promote a check only intentionally; it must lose its check role, and another
   independently measured feature should replace it. Agreement among biased
   measurements is not proof of accuracy.

## Physical devices and accessibility

On the intended touch/pen device, trace and paint slowly and quickly, interrupt
a drag, introduce a second touch, zoom/pan and resume. Check point selection,
footprints, visible partial edits, one-step undo and reachable Save controls.
On the intended browser/display, check native zoom, resizing and readable rulers.

With keyboard and the intended screen reader, select the authoring tool, create
and adjust points through the named percent fields, use point selection and
arrow/Delete keys on the image, undo/redo, review calibration and save. Confirm
focus, tool/dirty/save feedback and degree/profile descriptions are understandable.

Record device/browser/assistive technology, photo provenance, known measurements,
observed values and any issue. Automated synthetic pointer events and accessibility
tree checks provide software evidence; these items establish actual-device and
physical-photo acceptance.
