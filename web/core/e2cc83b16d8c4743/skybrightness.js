/*
 * NightSeam core - independent EOG/VIIRS zenith sky-brightness estimate.
 *
 * This is deliberately not a copy of the Lorenz atlas.  The input is an
 * EOG Annual VNL average-masked radiance grid and the model is a compact
 * neighborhood/scattering estimate based on Duriscoe et al. (2018): each
 * source cell contributes upward radiance with a distance-dependent Walker
 * exponent, and the result is calibrated to a zenith light-pollution ratio.
 *
 * The data-pack decoder is pure as well.  Network, filesystem and DOM work
 * belongs in the two shells; this file only validates bytes and performs the
 * shared math.
 */

export const SKY_BRIGHTNESS_MODEL = "eog-zenith-v1";
export const SKY_BRIGHTNESS_PACK_MAGIC = "NSLPACK1";
export const SKY_BRIGHTNESS_PACK_VERSION = 1;
export const EOG_NATIVE_RES_ARCSEC = 15;
export const EOG_RADIUS_KM = 300;

/* Duriscoe et al. use 171 micro-cd/m² as the natural zenith reference.  The
   conventional luminance-to-SQM conversion is
   cd/m² = 1.08e5 * 10^(-0.4*mpsas). */
export const NATURAL_ZENITH_LUMINANCE_UCD = 171;
export const MPSAS_ZERO_LUMINANCE_CD_M2 = 1.08e5;
export const NATURAL_ZENITH_MPSAS =
  Math.log10(NATURAL_ZENITH_LUMINANCE_UCD * 1e-6 /
             MPSAS_ZERO_LUMINANCE_CD_M2) / -0.4;

/* The calibration constant is the published radiance -> ALR fit.  The table
   below is the published ALR/ZLR relationship used to turn the same weighted
   source contribution into a zenith contribution.  Keeping both constants
   visible makes the approximation auditable instead of hiding it in a
   location-specific "Bortle" lookup. */
export const EOG_ALR_CALIBRATION = 562.72;
const ALR_ZLR = Object.freeze([
  [3, 1.87], [5, 2.15], [10, 2.66], [20, 2.96], [30, 3.07],
  [40, 3.08], [50, 3.07], [60, 3.02], [70, 3.15], [80, 3.07],
  [90, 2.99], [100, 2.91], [110, 2.82], [120, 2.75], [130, 2.67],
  [140, 2.59], [150, 2.51], [160, 2.41], [170, 2.33], [180, 2.23],
  [300, 1.66],
]);

const DEG = Math.PI / 180;
const EARTH_RADIUS_KM = 6371.0088;

function finite(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function normLon(lon) {
  let v = lon % 360;
  if (v < -180) v += 360;
  if (v >= 180) v -= 360;
  return v;
}

function lonDelta(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Great-circle distance in kilometres. */
export function skyDistanceKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(finite)) return NaN;
  const p1 = lat1 * DEG, p2 = lat2 * DEG;
  const dp = (lat2 - lat1) * DEG;
  const dl = lonDelta(lon2, lon1) * DEG;
  const h = Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}

/** The fitted distance-dependent Walker exponent from the SALR paper. */
export function eogWalkerAlpha(distanceKm) {
  const d = Math.max(1, finite(distanceKm) ? distanceKm : 1);
  return 2.3 * Math.pow(d / 350, 0.28);
}

/** Published ALR/ZLR ratio, linearly interpolated in log-distance space. */
export function eogAlrZlrRatio(distanceKm) {
  const d = Math.max(3, Math.min(300, finite(distanceKm) ? distanceKm : 3));
  if (d <= ALR_ZLR[0][0]) return ALR_ZLR[0][1];
  for (let i = 1; i < ALR_ZLR.length; i++) {
    const [d1, r1] = ALR_ZLR[i - 1];
    const [d2, r2] = ALR_ZLR[i];
    if (d <= d2) {
      const t = (Math.log(d) - Math.log(d1)) /
                (Math.log(d2) - Math.log(d1));
      return r1 + (r2 - r1) * t;
    }
  }
  return ALR_ZLR[ALR_ZLR.length - 1][1];
}

/** Convert a zenith artificial-light ratio into total zenith mpsas. */
export function zenithMpsasFromZlr(zlr) {
  if (!finite(zlr) || zlr < 0) return null;
  return NATURAL_ZENITH_MPSAS - 2.5 * Math.log10(1 + zlr);
}

/** Convert a zenith ratio into the four user-facing quality bands. */
export function zenithQualityForZlr(zlr) {
  const z = Math.max(0, finite(zlr) ? zlr : Infinity);
  if (z < 0.1) return "good";
  if (z < 0.7) return "moderate";
  if (z < 4) return "poor";
  return "bright";
}

function emptyEstimate(reason, radiusKm) {
  return {
    available: false,
    reason,
    model: SKY_BRIGHTNESS_MODEL,
    radiusKm,
    sourceCells: 0,
    coverage: 0,
    artificialZlr: null,
    zenithMpsas: null,
    quality: "unknown",
  };
}

function finishEstimate(weightedZlr, weightedRadiance, weightSum,
                        coverageSum, sourceCells, radiusKm) {
  if (!sourceCells || !(weightSum > 0)) {
    return emptyEstimate("no-covered-eog-cells", radiusKm);
  }
  const zlr = Math.max(0, weightedZlr);
  const coverage = clamp(coverageSum / weightSum, 0, 1);
  return {
    available: true,
    model: SKY_BRIGHTNESS_MODEL,
    radiusKm,
    sourceCells,
    coverage,
    weightedRadiance,
    artificialZlr: zlr,
    zenithMpsas: zenithMpsasFromZlr(zlr),
    quality: zenithQualityForZlr(zlr),
    lowConfidence: coverage < 0.75,
  };
}

/**
 * Estimate zenith brightness from independent EOG-like samples.
 *
 * Each sample's `radiance` is an area-normalized sum of native EOG cell
 * radiances for that source cell.  `coverage` is 0..1 and is used only as a
 * confidence weight; it never manufactures light where EOG has no coverage.
 */
export function estimateZenithSkyBrightness(samples, siteLat, siteLon,
                                             options = {}) {
  const radiusKm = finite(options.radiusKm) ?
    Math.max(1, options.radiusKm) : EOG_RADIUS_KM;
  if (!Array.isArray(samples) || !finite(siteLat) || !finite(siteLon)) {
    return emptyEstimate("invalid-input", radiusKm);
  }
  let weightedZlr = 0, weightedRadiance = 0;
  let weightSum = 0, coverageSum = 0, sourceCells = 0;
  for (const s of samples) {
    if (!s || !finite(s.lat) || !finite(s.lon) || !finite(s.radiance)) continue;
    const coverage = clamp(finite(s.coverage) ? s.coverage : 1, 0, 1);
    if (coverage <= 0 || s.radiance < 0) continue;
    const d = skyDistanceKm(siteLat, siteLon, s.lat, s.lon);
    if (!finite(d) || d > radiusKm) continue;
    const alpha = eogWalkerAlpha(d);
    const weight = Math.pow(Math.max(1, d), -alpha);
    const ratio = eogAlrZlrRatio(d);
    const radiance = s.radiance;
    weightedRadiance += radiance * weight;
    weightedZlr += radiance * weight / (EOG_ALR_CALIBRATION * ratio);
    weightSum += weight;
    coverageSum += weight * coverage;
    sourceCells++;
  }
  return finishEstimate(weightedZlr, weightedRadiance, weightSum,
                        coverageSum, sourceCells, radiusKm);
}

function checkGrid(grid) {
  if (!grid || !finite(grid.minLon) || !finite(grid.minLat) ||
      !finite(grid.stepLon) || !finite(grid.stepLat) ||
      !(grid.stepLon > 0) || !(grid.stepLat > 0) ||
      !Number.isInteger(grid.width) || !Number.isInteger(grid.height) ||
      grid.width < 1 || grid.height < 1 ||
      !grid.radiance || grid.radiance.length !== grid.width * grid.height) {
    return false;
  }
  return !grid.coverage || grid.coverage.length === grid.width * grid.height;
}

/** Estimate directly from a decoded regular grid. */
export function estimateZenithSkyBrightnessFromGrid(grid, siteLat, siteLon,
                                                     options = {}) {
  const radiusKm = finite(options.radiusKm) ?
    Math.max(1, options.radiusKm) : EOG_RADIUS_KM;
  if (!checkGrid(grid) || !finite(siteLat) || !finite(siteLon)) {
    return emptyEstimate("invalid-grid-or-site", radiusKm);
  }
  const minLat = grid.minLat;
  const maxLat = minLat + grid.height * grid.stepLat;
  if (siteLat < minLat - grid.stepLat || siteLat > maxLat + grid.stepLat) {
    return emptyEstimate("site-outside-eog-coverage", radiusKm);
  }
  const lon0 = normLon(siteLon);
  const rows = Math.ceil(radiusKm / (111.32 * grid.stepLat)) + 1;
  const rowAtSite = Math.floor((siteLat - minLat) / grid.stepLat);
  const firstRow = Math.max(0, rowAtSite - rows);
  const lastRow = Math.min(grid.height - 1, rowAtSite + rows);
  let weightedZlr = 0, weightedRadiance = 0;
  let weightSum = 0, coverageSum = 0, sourceCells = 0;
  for (let row = firstRow; row <= lastRow; row++) {
    const lat = minLat + (row + 0.5) * grid.stepLat;
    const lonKm = Math.max(1, 111.32 * Math.cos(lat * DEG));
    const cols = Math.ceil(radiusKm / (lonKm * grid.stepLon)) + 1;
    const siteCol = Math.floor((lon0 - grid.minLon) / grid.stepLon);
    for (let k = -cols; k <= cols; k++) {
      let col = siteCol + k;
      col = ((col % grid.width) + grid.width) % grid.width;
      const lon = grid.minLon + (col + 0.5) * grid.stepLon;
      const d = skyDistanceKm(siteLat, lon0, lat, lon);
      if (!finite(d) || d > radiusKm) continue;
      const idx = row * grid.width + col;
      const radiance = Number(grid.radiance[idx]);
      if (!finite(radiance) || radiance < 0) continue;
      const scale = finite(grid.coverageScale) && grid.coverageScale > 0
        ? grid.coverageScale : 1;
      const coverage = grid.coverage
        ? clamp(Number(grid.coverage[idx]) / scale, 0, 1) : 1;
      if (coverage <= 0) continue;
      const alpha = eogWalkerAlpha(d);
      const weight = Math.pow(Math.max(1, d), -alpha);
      const ratio = eogAlrZlrRatio(d);
      weightedRadiance += radiance * weight;
      weightedZlr += radiance * weight / (EOG_ALR_CALIBRATION * ratio);
      weightSum += weight;
      coverageSum += weight * coverage;
      sourceCells++;
    }
  }
  return finishEstimate(weightedZlr, weightedRadiance, weightSum,
                        coverageSum, sourceCells, radiusKm);
}

function readAscii(bytes, offset, length) {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

/** Decode the compact little-endian EOG pack produced by the build script. */
export function decodeSkyBrightnessPack(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 64) {
    throw new Error("sky-brightness pack is too short");
  }
  const bytes = new Uint8Array(buffer);
  if (readAscii(bytes, 0, 8) !== SKY_BRIGHTNESS_PACK_MAGIC) {
    throw new Error("unknown sky-brightness pack");
  }
  const view = new DataView(buffer);
  const version = view.getUint16(8, true);
  const headerBytes = view.getUint16(10, true);
  if (version !== SKY_BRIGHTNESS_PACK_VERSION || headerBytes < 64 ||
      headerBytes > buffer.byteLength) {
    throw new Error("unsupported sky-brightness pack version");
  }
  const minLon = view.getFloat64(12, true);
  const minLat = view.getFloat64(20, true);
  const stepLon = view.getFloat64(28, true);
  const stepLat = view.getFloat64(36, true);
  const width = view.getUint32(44, true);
  const height = view.getUint32(48, true);
  const radianceOffset = view.getUint32(52, true);
  const coverageOffset = view.getUint32(56, true);
  const count = view.getUint32(60, true);
  if (![minLon, minLat, stepLon, stepLat].every(finite) ||
      !(stepLon > 0) || !(stepLat > 0) || !width || !height ||
      count !== width * height || radianceOffset < headerBytes ||
      coverageOffset < radianceOffset + count * 4 ||
      coverageOffset + count * 2 > buffer.byteLength) {
    throw new Error("invalid sky-brightness pack header");
  }
  const radiance = new Float32Array(count);
  const coverage = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    radiance[i] = view.getFloat32(radianceOffset + i * 4, true);
    coverage[i] = view.getUint16(coverageOffset + i * 2, true);
  }
  return { version, minLon, minLat, stepLon, stepLat, width, height,
           radiance, coverage, coverageScale: 65535 };
}
