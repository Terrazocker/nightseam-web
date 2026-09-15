/*
 * L2 probe: edge cases for core/astro.js + core/planning.js.
 *  - poles / near-pole latitudes
 *  - the 0/360 azimuth seam
 *  - polar day and polar night
 *  - extreme + degenerate dates
 *  - NaN / Infinity propagation
 *  - sunCrossings roots: is the crossing altitude actually the threshold?
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const C = await import(pathToFileURL(resolve("core/index.js")).href);
const utc = (y, mo, d, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi));
const J2000 = 2451545.0;
const out = {};

/* --- 1. az range: must be [0, 360) for every lat/dec/time ----------------- */
{
  let bad = [];
  for (const lat of [-90, -89.9, -66.5, 0, 51.5, 66.5, 89.9, 90]) {
    for (const dec of [-90, -45, 0, 45, 90]) {
      for (const ra of [0, 90, 180, 270, 359.99]) {
        for (const jd of [J2000, C.julianDay(utc(2026, 8, 22)), C.julianDay(utc(2100, 1, 1))]) {
          const [alt, az] = C.altaz(ra, dec, jd, lat, 0);
          if (!(az >= 0 && az < 360) || !Number.isFinite(alt)) {
            bad.push({ lat, dec, ra, jd, alt, az });
          }
        }
      }
    }
  }
  out.azRange_bad = bad.slice(0, 5);
  out.azRange_badCount = bad.length;
}

/* --- 2. pole: at lat 90 alt must equal dec and az undefined-ish but finite - */
{
  const jd = C.julianDay(utc(2026, 8, 22, 22));
  out.pole = [0, 45, 90].map((dec) => {
    const [alt, az] = C.altaz(100, dec, jd, 90, 0);
    return { dec, alt, az };
  });
}

/* --- 3. polar day / polar night at 78N (Svalbard) ------------------------- */
{
  const days = [];
  for (const [mo, d] of [[1, 15], [3, 20], [6, 21], [9, 22], [12, 21]]) {
    const noon = utc(2026, mo, d, 12);
    const info = C.nightInfo(noon, 78.22, 15.65, noon);
    const win = C.pickDarkWindow(info, noon, noon);
    days.push({
      date: `${2026}-${mo}-${d}`,
      sunAltAtNoon: +C.sunAlt(C.julianDay(noon), 78.22, 15.65).toFixed(3),
      sunset: info.sunset ? info.sunset.toISOString() : null,
      sunrise: info.sunrise ? info.sunrise.toISOString() : null,
      astroDusk: info.astroDusk ? info.astroDusk.toISOString() : null,
      level: win.level,
      scrubSource: C.scrubWindowMs({
        sunsetMs: info.sunset ? info.sunset.getTime() : null,
        sunriseMs: info.sunrise ? info.sunrise.getTime() : null,
        duskMs: win.dusk.getTime(), dawnMs: win.dawn.getTime(),
        noonMs: noon.getTime(),
      }).source,
    });
  }
  out.svalbard = days;
}

/* --- 4. Tromso 2026-01-15, the documented grazing polar day ---------------- */
{
  const noon = utc(2026, 1, 15, 11);
  const info = C.nightInfo(noon, 69.65, 18.96, noon);
  out.tromso_2026_01_15 = {
    sunset: info.sunset ? info.sunset.toISOString() : null,
    sunrise: info.sunrise ? info.sunrise.toISOString() : null,
    sunsetBeforeSunrise: !!(info.sunset && info.sunrise && info.sunset < info.sunrise),
  };
}

/* --- 5. sunCrossings: does the reported instant actually hit the threshold? */
{
  const rows = [];
  for (const [lat, lon, thr] of [[52.52, 13.4, 0], [52.52, 13.4, -6], [52.52, 13.4, -18], [69.65, 18.96, 0]]) {
    const noon = utc(2026, 8, 22, 12);
    for (const key of ["evening", "morning"]) {
      const info = C.nightInfo(noon, lat, lon, noon);
      const pair = { 0: [info.sunset, info.sunrise], "-6": [info.civilDusk, info.civilDawn], "-18": [info.astroDusk, info.astroDawn] };
      const dt = (pair[String(thr)] || [])[key === "evening" ? 0 : 1];
      if (!dt) { rows.push({ lat, thr, key, dt: null }); continue; }
      const alt = C.sunAlt(C.julianDay(dt), lat, lon);
      rows.push({ lat, thr, key, altMinusThr: +(alt - thr).toFixed(4) });
    }
  }
  out.crossings_residual = rows;
}

/* --- 6. extreme / degenerate dates --------------------------------------- */
{
  const rows = [];
  for (const y of [1, 100, 1582, 1900, 2100, 9999]) {
    try {
      const dt = new Date(Date.UTC(y, 0, 1, 12));
      const jd = C.julianDay(dt);
      const gm = C.gmstDeg(jd);
      const [ra, dec] = C.precessJ2000ToDate(83.63, 22.01, jd);
      const [raB, decB] = C.precessDateToJ2000(ra, dec, jd);
      rows.push({ y, jd, gmst: Number.isFinite(gm) ? +gm.toFixed(4) : String(gm), ra: Number.isFinite(ra) ? +ra.toFixed(4) : String(ra), dec: Number.isFinite(dec) ? +dec.toFixed(4) : String(dec), roundtrip: Number.isFinite(raB) ? +Math.abs(raB - 83.63).toExponential(2) : String(raB) });
    } catch (e) { rows.push({ y, error: String(e) }); }
  }
  out.extremeDates = rows;
}

/* --- 7. NaN / Infinity propagation --------------------------------------- */
{
  const jd = C.julianDay(utc(2026, 8, 22, 22));
  const cases = {
    altaz_nanLat: C.altaz(100, 20, jd, NaN, 0),
    altaz_infLat: C.altaz(100, 20, jd, Infinity, 0),
    altaz_nanRa: C.altaz(NaN, 20, jd, 50, 0),
    altaz_nanDec: C.altaz(100, NaN, jd, 50, 0),
    altaz_infDec: C.altaz(100, Infinity, jd, 50, 0),
    julianDay_invalid: C.julianDay(new Date("nope")),
    gmst_nan: C.gmstDeg(NaN),
    precess_nan: C.precessJ2000ToDate(NaN, 20, jd),
    refraction_nan: C.refractionDeg(NaN),
    refraction_neg99: C.refractionDeg(-90),
    refraction_below: C.refractionDeg(-2),
    refraction_zero: C.refractionDeg(0),
    refraction_above: C.refractionDeg(90),
    sepDeg_pole: C.sepDeg(90, 0, 90, 180),
    sunAlt_nanLat: C.sunAlt(jd, NaN, 0),
    scrubWindow_noNoon: C.scrubWindowMs({}),
    scrubWindow_nulls: C.scrubWindowMs(null),
  };
  out.nanInf = JSON.parse(JSON.stringify(cases, (k, v) => (v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" : Number.isNaN(v) ? "NaN" : v)));
}

/* --- 8. scrub window ordering invariant ---------------------------------- */
{
  const rows = [];
  const cases = [
    { sunsetMs: 100, sunriseMs: 200, duskMs: 150, dawnMs: 250, noonMs: 0 },
    { sunsetMs: 300, sunriseMs: 200, duskMs: 150, dawnMs: 250, noonMs: 0 },   // inverted sun pair
    { sunsetMs: 100, sunriseMs: 400, duskMs: 150, dawnMs: 250, noonMs: 0 },   // sunset before dawn?
    { sunsetMs: 100, sunriseMs: 200, duskMs: null, dawnMs: null, noonMs: 1000 },
    { sunsetMs: null, sunriseMs: null, duskMs: 100, dawnMs: 100, noonMs: 1000 },
    { sunsetMs: 100, sunriseMs: 200, duskMs: null, dawnMs: null, noonMs: null },
  ];
  for (const c of cases) {
    const r = C.scrubWindowMs(c);
    rows.push({ in: c, out: r, ordered: r.startMs < r.endMs });
  }
  out.scrubWindows = rows;
}

console.log(JSON.stringify(out, null, 1));
