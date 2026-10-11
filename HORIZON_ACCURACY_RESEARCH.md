# Horizon accuracy: research, changes and remaining work

October 11, 2026. Repository analysis of the current web planner, following the
owner's request to research the math and implement worthwhile improvements.
This is a local development record, not physical accuracy certification.

## What matters most

Two known points can calibrate a level angular panorama. More points can reveal
errors, but cannot repair a wrong projection model by themselves. Supported
projection/leveling and extra fitting/held-out references were implemented under
D/E. P1/P2 now add joint physical orientation and explicit evidence/coverage
policy in local software, pending integrated software gates. Independently
measured real-photo acceptance and P3–P7 remain open. Conservative conversion
into planner bins is implemented.
Sharper labels help placement; they do not increase the mask's angular resolution.

Implemented now: balanced full-360 fitting with visible residuals, versioned
evidence, an extrapolation-sensitivity warning, correct seam handling for
nearly full partial photos, conservative world-bin aggregation and upward skyline
altitude rounding; D/E additionally provide supported source conversion and v4
multi-reference fitting/checks. New v5 orientation evidence preserves original
source rays and jointly fits heading/pitch/roll; legacy linear evidence keeps
its semantics. Unknown source models remain Approximate. Geometry and checking
live in core; previews still require explicit Apply.

## Current P1/P2 boundary: physical fitting and coverage

Supported source geometry defines unit image rays; measured true bearings and
altitudes define unit world directions. The current physical solver aligns these
sets with a rotation, rather than fitting independent pixel-to-degree scales.
Weighted Wahba alignment minimizes squared unit-ray differences (chordal loss).
Optional angular Huber IRLS changes influence while retaining every reference;
reports separately calculate spherical angular error. This distinction matters:
the solver is not an arbitrary distortion fit or direct unconstrained angular
least-squares calibration. Core owns the math; browser code owns collection and
pixel preparation. Evidence v5/backup10 preserve the source/current model,
optional measurement evidence and separate fitting/check roles.

New physical evidence uses a 1° directional acceptance policy. It does not
replace historical per-axis policies or establish a one-degree real-world
accuracy guarantee. Missing measurement errors remain missing; a measurement
group helps identify shared sources but does not remove shared bias. Known
geometry can proceed to review/checking with no fitting references. Checks stay
outside orientation fitting and do not become independent merely by being
held out from the computation.

Unknown horizontal FOV is implemented only for corrected centred square-pixel
rectilinear sources, with four active fitting references and two held-out checks,
a bounded 5–150° search, at least 0.1° held-out improvement and a curvature gate.
The search minimizes fitting-point error; the check set decides whether the
estimated model is accepted. Those checks are therefore not an untouched final
validation set for the selected geometry. Obtain additional
independent measurements before claiming physical accuracy. No lens-distortion,
stitching or nearby-obstacle parallax correction is inferred.

Newly confirmed converted photos default to strict measured coverage; old
records retain legacy assumptions. A shared core query separates evidence
clear/blocked/unknown from policy permission. Strict planning excludes unknown
azimuth/profile coverage and directions outside photographed vertical bounds.
This is a conservative profile summary, not a source-pixel evidence mask or a
multi-opening model. Optional observer/optical-height/capture data records the
viewpoint without correcting geometric displacement. Existing paint cannot be
remapped through a new orientation yet, so such conversions are refused.

Next work is P3 original-photo painting, P4 multiple openings, P5 spatial
uncertainty/margins/capture validity, P6 complete-field/event planning, then P7
integrated acceptance. See the
[geographic plan](HORIZON_GEOGRAPHIC_CALIBRATION_PLAN.md). P1/P2 software outcomes
belong in RELEASES.md; measured photos and physical devices remain owner checks.

## Projection and orientation

Hugin distinguishes normal rectilinear photos, cylindrical panoramas and
equirectangular images. Its optimization adjusts orientation and lens parameters;
these are separate from simply setting an image's direction.
[Hugin input models and optimization](https://hugin.sourceforge.io/docs/manual/Hugin_Photos_tab.html).

For a level equirectangular image, horizontal and vertical coordinates are linear
in longitude and latitude. The image may cover part of a sphere; a wide aspect
ratio alone does not prove full-360 coverage.
[Hugin equirectangular projection](https://hugin.sourceforge.io/docs/manual/Equirectangular.html).

The following formulas/error bounds are our derivations applied to this
repository. Image positions x/y are normalized against the retained original.
The angular working model is (source conversion now precedes this mapping):

```
bearing(x) = wrap(offset + horizontal_span * x)
altitude(y) = top - vertical_span * y
```

For the retained legacy linear model, two complete references determine four scalar parameters if their positions
differ in both axes. Bearings must be unwrapped on a positive-width branch;
choosing the shortest compass arc would miscalibrate views spanning over 180°.
The existing solver correctly retains north-crossing and wide-view branches.

A cylindrical image instead has vertical position proportional to tan(altitude).
This follows by projecting a ray onto a tangent cylinder. A linear angular fit
to cylindrical 0° and 45° references reports about 26.0° at a feature whose actual
height is 30°: about four degrees of systematic error despite exact endpoint fits.
The tangent-cylinder geometry and vertical stretching are described in
[Hugin cylindrical projection](https://hugin.sourceforge.io/docs/manual/Cylindrical_Projection.html).

An ordinary distortion-free photo uses camera rays proportional to
`[(u-cx)/fx, (cy-v)/fy, 1]`. Bearing involves atan2; altitude also depends on the
horizontal component. Camera orientation rotates these rays before world angles
are obtained. Lens distortion introduces further parameters. Two arbitrary
references cannot identify all of those unknowns.
[OpenCV camera model](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html).

Even an equirectangular panorama can be tilted relative to the real horizon.
Pitch/roll require a spherical rotation/remap; independent linear fits cannot
remove that distortion. Leveling and projection conversion should be explicit
operations, validated away from the fitting features.
[Hugin remapping](https://hugin.sourceforge.io/docs/manual/PTStitcher.html).

## Changes implemented in this follow-up

### Known full width: balance the measurements

Previously a known full panorama required bearing agreement within 0.000001°.
Manual clicks and rounded measurements could fail that consistency check.
Evidence v3 now fixes the original width at 360° and estimates the shared offset
from both points with equal weights. Let each proposed offset be
`o_i = bearing_i - 360*x_i`. On their nearby circular branch:

```
d = signed_wrapped_difference(o_2, o_1)
offset = wrap(o_1 + d/2)
```

This minimizes the sum of squared bearing residuals on that branch. Neither
point silently wins. The solver accepts at most 1° residual per point and displays
each signed difference. This is an explicit acceptance policy, not a measured
uncertainty, confidence interval or guarantee. Larger contradictions are rejected.
Unknown-width fits still derive the width rather than constraining it to 360°.

Evidence v2 retains its exact original solver on read/report; v1 remains the
separate-reference model. A newly applied fit writes v3. Backup format 8 protects
these semantics from older readers and still reads formats 1–7. Later manual
changes downgrade the report even if a check remains nearby. The check point is
never included in the fit.

### Reference spacing: show error amplification

The existing 2% separation rejects a singular fit; it does not ensure a useful
scale. At position x, set `t=(x-x1)/(x2-x1)`. If each entered bearing has error at
most epsilon, the fitted angle error can be bounded by:

```
epsilon * (abs(1-t) + abs(t))
```

The same bound applies to entered altitude angles. Points at 45% and 55% yield
10× sensitivity at the image edges: bounded 0.2° input-angle errors could become
2° there, before click error or model error. The report calculates the factor for
the current crop's edges; the review warns when either exceeds 3×. This threshold
is a usability prompt, not a statistical test. Known-width bearing fitting has
factor 1 for bounded angle errors because only the shared offset is fitted.
Click-position errors are not covered by this angle-only bound.

### Seam handling

Previously coverage of 359.5° or more enabled seam copies. A real 359.6° partial
image therefore painted across a missing 0.4° region. Wrapping now requires
coverage numerically equal to 360° (1e-8° tolerance). Full panorama wrapping is
retained; crops and nearly full partial views do not gain opposite-edge paint.

## Sampling follow-up implemented locally

The narrow-obstacle probe below now produces a blocked bin. Derived bins take
the highest obstacle across all overlapping image columns. Sky bins intersect
lower edges and explicit upper ceilings; any empty column blocks. Default
open-above retains its meaning even when raw painted bands are disjoint. Full
seams, exact half-open cell boundaries and the inclusive photo endpoint are
tested. Authoritative no-stroke profiles and legacy migration are unchanged.

Traces now cover the highest connected edge within each mask column, including
sub-column segments, and round altitude upward by less than one calibrated row.
Later brush/eraser operations retain chronology. A crop can change brush-edge
samples within raster resolution. Detailed policy and receipts are in
DEVELOPMENT.md and RELEASES.md. Published astronomy anchors remain unchanged.

Remaining limits include conservative widening within a 0.5° bin, a single
visible interval per image column, and the existing 4° photo-top open heuristic.
These fixes do not remove projection distortion or measurement bias.

## Confirmed findings and remaining accuracy limits

1. **Narrow obstacles disappeared during bin sampling (resolved locally).** Each 0.5° world bin
   previously sampled one mask column. With a 45° photo, eight image columns fit
   within one world bin. A painted column between sample positions can disappear
   from the planner. A direct pure-core probe with only column 3 painted at row
   100 returned zero blocked world bins. The implemented overlap policy above
   corrects it with independent geometry, seam, sky/overhang and browser tests.
2. **Vertical raster rounding (resolved locally).** Row spacing is `(top-bottom)/359`, about 0.167°
   for a 60° view and 0.334° for the supported 120° maximum span. Skyline `ceil(y)`
   understated an obstruction by almost one row. Highest-cell-edge floor(row)
   handling now accompanies the bin fix, keeping explicit brush erasures meaningful.
3. **One independent check is local evidence.** Agreement at one feature does
   not establish correctness elsewhere or detect a bias shared by all readings.
   The current wording preserves that limitation; E now supports multiple held-out
   features, separate from fitting data, with a warning for clustered checks.

## Recommended next work

### Earlier D/E implementation: ray conversion and v4 check logic

This dated section records D/E and legacy v4 behavior; the current P1/P2 boundary
above supersedes its fitting and new-record coverage policy. Source projection
equations and supported conversion limits remain applicable. These are
repository derivations and implementation constraints, not claims of
physical accuracy. For normalized original source pixels x/y, angular panorama
longitude is `lonCenter + (x−0.5)×hfov`, with latitude `top−y×(top−bottom)`.
Cylindrical longitude is the same, but latitude is
`atan((1−y)×tan(top) + y×tan(bottom))`. Ordinary corrected photos use rays
`[(x−0.5)×s, 1, (0.5−y)×s×height/width]`, where
`s=2×tan(hfov/2)`. The rectangular model assumes square pixels, centred optics
and distortion already corrected. Compare the documented projection models:
[Hugin cylindrical](https://hugin.sourceforge.io/docs/manual/Cylindrical_Projection.html),
[Hugin rectilinear](https://hugin.sourceforge.io/docs/manual/Rectilinear_Projection.html).

Rotate source rays into east/north/up using
`Rz(−heading) Rx(pitch) Ry(roll)`. Inverse mapping uses the transpose; working
bearing/altitude rays therefore sample the original photo at the proper pixels.
GPano heading for a cropped photo remains the full panorama's centre orientation;
the retained source longitude offset accounts for the actual cropped rectangle.
This orientation order and metadata semantics follow
[Google Photo Sphere metadata](https://developers.google.com/streetview/spherical-metadata).

The derived working view is an angular rectangle entirely inside photographed
coverage. Coverage uses continuous extrema of source half-plane/latitude bounds,
not only sampled corners or a grid. Upright cylinders retain their exact angular
extent: the nonlinear pixel midpoint must not be used as its altitude midpoint.
Tilted edges can be excluded; excluded azimuth directions block both planning paths.
Vertical image bounds remain calibration bounds rather than automatic ceilings.
The horizon model assumes sky above traced obstacles open; sky-band open-above
also remains unchanged unless explicitly blocked. Those extrapolated altitudes
are not photographically checked, even when the local references agree.
The algorithm is conservative and does not claim a maximum-area rectangle.
Partial tilted panoramas wider than 180° and arbitrary lens/stitching correction
remain unsupported. Existing painted records require a new horizon/redrawing.

V4 equal-weight fitting solves the angular working axes independently, after
mapping each original-pixel reference to the working surface. Confirmed 360°
fixes scale; other widths require a unique valid circular branch. At least two
active points with sufficient spread are required, and worst per-axis fitting
residual must be ≤1°. Excluded references remain recorded. Endpoint seed slack
is scaled by point separation so a noisy endpoint estimate does not discard a
valid least-squares solution. Equal-bearing seam references need explicit full
360° confirmation rather than silently inventing coverage.

Every held-out check is excluded from fitting. The report uses worst absolute
bearing/height errors across checks, so opposite errors cannot cancel. Checks
must be visible and separated from active fit features; clustered checks give
local evidence. Promotion validates first, removes the separate-check role and
requests new checking evidence. Prediction-weight sensitivity is angle-only;
click error, wrong geometry and shared true-north/measurement bias remain outside
that bound. V1–v3 keep their saved semantics; backup9 declares source geometry and
v4 roles. Original bytes, source references, crops and history remain recoverable.

| Order | Improvement | Needed before claiming support |
| --- | --- | --- |
| Complete locally | Conservative mask/bin and skyline-boundary handling | Defined obstacle/sky policy; independent narrow-feature, seam, crop and overhang checks; receipts in RELEASES.md |
| Complete locally (D) | Validated panorama metadata and explicit leveling | Dimension/crop/orientation validation, source retention and bounded rectangular coverage; physical measurements remain needed |
| Complete locally (D) | Cylindrical-to-angular conversion | Nonlinear vertical remap, original-source evidence, independent angle/pixel checks |
| Complete locally (E, legacy v4) | More fitting references and held-out checks | Equal-weight fitting, circular branches, residuals/spread/sensitivity, explicit exclusions and separate check roles |
| Supported subset (D) | Rectilinear camera support | Known FOV/orientation and already corrected centred square-pixel optics; arbitrary distortion remains unsupported |
| Implemented locally, software gates pending (P1/P2) | Physical orientation, optional measurement evidence and coverage policy | Weighted unit-ray fit, separate directional policy, held-out roles, strict new-record coverage; bounded unknown-FOV acceptance uses held-out checks |
| Open (P3/P4) | Source-photo painting and multiple sky openings | Stable source-mask/history migration, shared clear/blocked/unknown queries |
| Open (P5/P6) | Spatial uncertainty and complete camera-field planning | Boundary/capture policy, field geometry and obstruction crossing refinement |
| Open (P7) | Integrated software and physical accuracy acceptance | P1–P6 checks plus independent measured photos and physical-device acceptance |

Google's GPano metadata defines full/cropped dimensions and heading/pitch/roll.
Initial viewer FOV is a viewing preference rather than image coverage. Dimension
and aspect checks are needed before trusting stale metadata; orientation must
follow the specified rotation order.
[Google Photo Sphere metadata](https://developers.google.com/streetview/spherical-metadata).

All bearings must use true north consistently. Magnetic declination changes by
location and time, and local magnetic effects can introduce error. More readings
with the same bias do not remove it. Use independent measurements from the same
observing position as the photograph; height is an angle, not metres.
[NOAA declination guidance](https://www.ngdc.noaa.gov/geomag/help/declinationHelp.html),
[NOAA model limitations](https://www.ncei.noaa.gov/products/world-magnetic-model/accuracy-limitations-error-model).

Real photos, measured bearings, physical touch/pen, native zoom and screen-reader
acceptance remain with the owner as previously requested. Software receipts are
in RELEASES.md; roadmap status is in HORIZON_GEOGRAPHIC_CALIBRATION_PLAN.md and
HORIZON_PANORAMA_SIMPLIFICATION_PLAN.md.

The previously discussed Bourke conversion page was blocked to the research
crawler; this report does not claim to have inspected its contents.
