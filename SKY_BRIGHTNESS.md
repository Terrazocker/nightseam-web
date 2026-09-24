# Zenith sky brightness

NightSeam now has an independent EOG/VIIRS estimate of a site's clear-sky
zenith brightness. It is deliberately separate from the manually chosen
Bortle class: the estimate is a data-backed site signal, while Bortle remains
the user's planning preference and fallback. It is display-only for now; it
does not silently change ranking or overwrite Bortle.

## Data flow

The input is an EOG Annual VNL `average-masked` radiance GeoTIFF in
`nW/cm²/sr`, together with its `cf_cvg` and `cvg` coverage grids. EOG documents
the product as a 15-arcsecond EPSG:4326 grid covering 75°N to 65°S. The builder
reduces it to a 0.25° pack (about 5 MiB before transport compression), keeps
coverage quality, and writes one copy for each shell. The raw EOG files are not
bundled or downloaded by NightSeam.

Install the optional offline build dependencies and run:

```text
python -m pip install -r requirements-lightpollution.txt
python scripts/build_skybrightness.py \
  --radiance VNL_average-masked.tif \
  --cf-cvg VNL_cf_cvg.tif \
  --cvg VNL_cvg.tif \
  --year 2024 \
  --out web/skybrightness.eog.bin \
  --out static/skybrightness.eog.bin
```

The EOG `.gz` wrapper must be unpacked before rasterio reads the GeoTIFF. The
generated `.bin` and sidecar metadata are deployment data, not source code;
keep them outside Git unless a specific release deliberately includes a
regional pack.

## Provider boundary

Both shells read `web/skybrightness.providers.json` or
`static/skybrightness.providers.json`. EOG is the safe default and remains
available even when the manifest is missing. A provider entry names its pack,
sidecar, core model and model version; the loader rejects an unknown model and
falls back to EOG if an optional pack cannot be loaded. The Advanced menu's
Sky brightness source selector is persisted per shell and does not reload or
affect astronomical planning.

NASA Black Marble v1 can be enabled by deploying a compatible
`skybrightness.blackmarble.bin` and its `.json` sidecar beside the shell and
changing the `blackmarble` manifest entry from `enabled: false` to `true`.
The current application contract supports the legacy global
`blackmarble-zenith-v1` pack only. The regional
`blackmarble-lpm-compatible` packs from the LightMap research project require
source-size, terrain and other sidecars and are not silently presented as the
same provider. Raw NASA archives and the multi-gigabyte 30-arcsecond pack do
not belong in the application repository or default deployment.

The result object includes `provider`, `providerLabel`, `model`,
`modelVersion`, `sourceYear`, `sourceSDS`, `effectiveResolutionM`, `coverage`,
`lowConfidence` and the complete loaded sidecar as `metadata`. This is
intentional: a UI value without its source/model identity is not sufficient for
comparison or troubleshooting. The bundled EOG pack is still display-only;
no provider automatically changes Bortle, target ranking or a calibration
constant.

The loader cache identity includes provider id, model/version, source year,
source SDS, native resolution, effective resolution, pack URL and sidecar URL.
Changing any of those manifest fields causes a fresh decode, and a sidecar that
disagrees with the declared model/version/source identity is rejected. This is
deliberate protection against silently reusing an old pack after a data refresh.

## Research handoff

The companion LightMap project contains the complete model-selection evidence,
raw-radiance and resolution benchmarks, NPS/TESS reports, and the remaining
promotion work:

`<workspace>\Nightseam-lightmap\LightMap\CURRENT_STATE.md`

Its separate active work list is:

`<workspace>\Nightseam-lightmap\LightMap\TODO.md`

Those documents are the source of truth for whether a future NASA provider
should be promoted. This application document describes only the runtime
provider contract and its safety boundary.

## Independent model

For every covered source cell within 300 km, the shared `core/skybrightness.js`
model applies the distance-dependent exponent published for the simplified
VIIRS sky-glow model:

```text
alpha(d) = 2.3 * (d / 350 km)^0.28
```

The area-scaled EOG radiance is then weighted by `d^-alpha`. The published
VIIRS-to-all-sky calibration and the published ALR/ZLR relationship convert
that sum to an artificial zenith light-pollution ratio (ZLR). Total zenith
brightness is then expressed as magnitude per square arcsecond using the
171 µcd/m² natural-zenith reference. The result includes source-cell count,
coverage confidence, ZLR, total mpsas, and a plain quality band:

* `good`: ZLR < 0.1
* `moderate`: 0.1–0.7
* `poor`: 0.7–4
* `bright`: 4 or more

Those boundaries are interpretation bands from the published sky-quality
model, not Bortle lookup values. A zero radiance value is not accepted as
proof of darkness when the coverage grid says that the area was unobserved;
the estimate is marked unavailable or low-confidence instead.

## Validation boundary

Lorenz is not an input, dependency, runtime fallback, or shipped asset. It is
only an external comparison source. After building an EOG pack, create an
operator-owned CSV with `lat,lon,lorenz_mpsas` reference values and run:

```text
node scripts/validate_skybrightness.mjs \
  --pack web/skybrightness.eog.bin \
  --points lorenz-check.csv
```

The validator reports bias, mean absolute error, RMS error, and each point;
the reference file stays outside the product. This keeps the product model
independent while giving us a repeatable way to see where the simplified model
diverges from the Lorenz rendering. It is not a promise that the two maps
should match: they use different source processing, atmospheric assumptions,
and output definitions.

## Known limits

This is a clear-sky annual light-pollution estimate, not a live sky meter. It
does not model tonight's clouds, haze, snow reflectance, local shielding,
topography, lamp spectrum, or time-of-night dimming. It should be used to
compare observing sites and to inform a suggested darkness class, while the
weather panel and the user's Bortle choice remain separate inputs.

Sources: [EOG VIIRS Nighttime Lights](https://eogdata.mines.edu/products/vnl/),
[EOG license](https://eogdata.mines.edu/files/EOG_products_CC_License.pdf),
[Elvidge et al. Annual VNL series](https://doi.org/10.3390/rs13050922), and
[Duriscoe et al. simplified VIIRS sky-glow model](https://doi.org/10.1016/j.jqsrt.2018.04.028).
