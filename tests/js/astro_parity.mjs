/*
 * Node harness for the Python <-> JavaScript astronomy parity test.
 *
 * Usage:  node tests/js/astro_parity.mjs <desktop|web|window>
 *         (reads a JSON array of case objects on stdin, writes JSON on stdout)
 *
 *   desktop / web : precession + alt/az (+ gmst, sun, moon for web)
 *   window        : static/js/derive.js's longestRunJS / windowEndISO - the
 *                   clear-window contract shared with app/nightcalc.py
 *
 * tests/test_js_parity.py feeds the same inputs to app/astro.py and to this
 * harness, then compares the numbers. It exists because the three engines
 * (Python, static/js/astro.js, web/astro.js) agreed with each other while all
 * three were wrong (see tests/test_astro.py for the reference values that pin
 * the actual mathematics).
 */
const engine = process.argv[2];
if (!["desktop", "web", "window", "darkwindow", "pick", "crosszone",
     "scoring", "ceil"].includes(engine)) {
  console.error("usage: node astro_parity.mjs <desktop|web|window|darkwindow|pick|crosszone|scoring|ceil>");
  process.exit(2);
}

const mod = engine === "desktop"
  ? await import(new URL("../../static/js/astro.js", import.meta.url).href)
  : engine === "window"
    ? await import(new URL("../../static/js/derive.js", import.meta.url).href)
    : await import(new URL("../../web/astro.js", import.meta.url).href);

const input = await new Promise((resolve, reject) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { buf += c; });
  process.stdin.on("end", () => resolve(buf));
  process.stdin.on("error", reject);
});

const cases = JSON.parse(input);

if (engine === "pick") {
  // unit-test the twilight-preference rule (cascade + polar fallback) with
  // synthetic night info; TZ=UTC makes the fallback times comparable with
  // app/planning.py's local_utc() output
  const info = (flags) => ({
    sunset: flags.sun ? new Date(2026, 5, 21, 19, 0, 0) : null,
    sunrise: flags.sun ? new Date(2026, 5, 22, 4, 0, 0) : null,
    civilDusk: flags.civil ? new Date(2026, 5, 21, 20, 0, 0) : null,
    civilDawn: flags.civil ? new Date(2026, 5, 22, 3, 0, 0) : null,
    nauticalDusk: flags.naut ? new Date(2026, 5, 21, 21, 0, 0) : null,
    nauticalDawn: flags.naut ? new Date(2026, 5, 22, 2, 0, 0) : null,
    astroDusk: flags.astro ? new Date(2026, 5, 21, 22, 0, 0) : null,
    astroDawn: flags.astro ? new Date(2026, 5, 22, 1, 0, 0) : null,
  });
  const day = new Date(2026, 5, 21, 12, 0, 0);
  process.stdout.write(JSON.stringify(cases.map((c) => {
    const w = mod.pickDarkWindow(info(c), day);
    return {
      level: w.level,
      dusk: w.dusk ? w.dusk.toISOString() : null,
      dawn: w.dawn ? w.dawn.toISOString() : null,
      zoneOffsetMin: day.getTimezoneOffset(),
    };
  })));
} else if (engine === "darkwindow") {
  // real night windows for a site that sits in the harness's own zone
  const out = cases.map((c) => {
    const [y, m, d] = c.date.split("-").map(Number);
    const noon = new Date(y, m - 1, d, 12, 0, 0);        // browser-local noon
    const info = mod.nightInfo(noon, c.lat, c.lon);
    const w = mod.pickDarkWindow(info, noon);
    return {
      level: w.level,
      dusk: w.dusk ? w.dusk.toISOString() : null,
      dawn: w.dawn ? w.dawn.toISOString() : null,
      zoneOffsetMin: noon.getTimezoneOffset(),
    };
  });
  process.stdout.write(JSON.stringify({ windows: out }));
} else if (engine === "crosszone") {
  /* A site in another timezone than the browser.
   *
   * Case fields: {date, lat, lon, tz} where tz is the SITE's IANA zone and the
   * PROCESS zone (TZ) is the browser's. Prints the window the web resolves with
   * the SITE-anchored scan (what app.js now passes via siteNoon()) and, for
   * documentation, the window the old browser-anchored scan produced. */
  const tzOffMin = (zone, date) => {
    if (!zone) return null;
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, timeZoneName: "longOffset", hour12: false,
      }).formatToParts(date);
      const p = parts.find((x) => x.type === "timeZoneName");
      if (!p || !p.value) return null;
      if (p.value === "GMT" || p.value === "UTC") return 0;
      const m = p.value.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
      if (!m) return null;
      return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
    } catch { return null; }
  };
  const wallToUtc = (date, zone) => {
    const off = tzOffMin(zone, date);
    if (off == null) return date;
    return new Date(date.getTime() - (off + date.getTimezoneOffset()) * 60000);
  };
  const span = (w) => (w.dusk && w.dawn)
    ? Math.round((w.dawn - w.dusk) / 3600000 * 10) / 10 : null;
  const out = cases.map((c) => {
    const [y, m, d] = c.date.split("-").map(Number);
    const wallNoon = new Date(y, m - 1, d, 12, 0, 0);   // site wall clock
    const info = mod.nightInfo(wallNoon, c.lat, c.lon);
    const browser = mod.pickDarkWindow(info, wallNoon);
    const siteInfo = mod.nightInfo(wallNoon, c.lat, c.lon, wallToUtc(wallNoon, c.tz));
    const site = mod.pickDarkWindow(siteInfo, wallNoon);
    return {
      site: { level: site.level, dusk: site.dusk.toISOString(),
              dawn: site.dawn.toISOString(), spanH: span(site) },
      browserAnchored: { level: browser.level, dusk: browser.dusk.toISOString(),
                         dawn: browser.dawn.toISOString(), spanH: span(browser) },
      zoneOffsetMin: wallNoon.getTimezoneOffset(),
      siteOffsetMin: -tzOffMin(c.tz, wallNoon),      // minutes EAST of UTC
    };
  });
  process.stdout.write(JSON.stringify(out));
} else if (engine === "scoring") {
  /* Compare the moon-aware scoring model of BOTH clients on one input grid.
   * The curves live in static/js/derive.js (desktop) and web/astro.js (web);
   * this mode prints both so the Python test can assert they are identical. */
  const desk = await import(new URL("../../static/js/derive.js", import.meta.url).href);
  const web = await import(new URL("../../web/astro.js", import.meta.url).href);
  const pairs = {
    desktop: {
      MOON_TYPE_FACTOR: desk.MOON_TYPE_FACTOR,
      moonSensitivity: (ot) => desk.moonSensitivity(ot),
      moonMinDist: (f, a) => desk.moonMinDist(f, a),
      effectiveMoonGlow: (i, s, f, a) => desk.effectiveMoonGlow(i, s, f, a),
      moonPenalty: (g, t, b) => desk.moonPenalty(g, t, b),
      bortleMoonFactor: (b) => desk.bortleMoonFactor(b),
    },
    web: {
      MOON_TYPE_FACTOR: web.MOON_TYPE_FACTOR,
      moonSensitivity: (ot) => web.moonSensitivity(ot),
      moonMinDist: (f, a) => web.moonMinDist(f, a),
      effectiveMoonGlow: (i, s, f, a) => web.effectiveMoonGlow(i, s, f, a),
      moonPenalty: (g, t, b) => web.moonPenalty(g, t, b),
      bortleMoonFactor: (b) => web.bortleMoonFactor(b),
    },
  };
  const out = { MOON_TYPE_FACTOR: {}, sensitivity: [], minDist: [], glow: [], penalty: [], bortle: [] };
  for (const [k, v] of Object.entries(pairs.desktop.MOON_TYPE_FACTOR)) {
    out.MOON_TYPE_FACTOR[k] = [v, pairs.web.MOON_TYPE_FACTOR[k]];
  }
  for (const ot of Object.keys(pairs.desktop.MOON_TYPE_FACTOR).concat(["unknown"])) {
    out.sensitivity.push([ot, pairs.desktop.moonSensitivity(ot), pairs.web.moonSensitivity(ot)]);
  }
  for (const f of ["narrowband", "oiii", "lrgb", "other"]) {
    for (const age of [0, 3.7, 7.38, 11, 14.76, 14.9]) {
      out.minDist.push([f, age, pairs.desktop.moonMinDist(f, age), pairs.web.moonMinDist(f, age)]);
      for (const illum of [0, 0.25, 0.62, 1]) {
        for (const sep of [0, 20, 45, 90, 120, 179.9]) {
          out.glow.push([f, age, illum, sep,
            pairs.desktop.effectiveMoonGlow(illum, sep, f, age),
            pairs.web.effectiveMoonGlow(illum, sep, f, age)]);
        }
      }
    }
  }
  for (const g of [0, 0.3, 1]) {
    for (const t of [0.5, 1.0, 1.6]) {
      for (const b of [0.3, 0.64, 1.12]) {
        out.penalty.push([g, t, b, pairs.desktop.moonPenalty(g, t, b), pairs.web.moonPenalty(g, t, b)]);
      }
    }
  }
  for (let bortle = 1; bortle <= 9; bortle++) {
    out.bortle.push([bortle, pairs.desktop.bortleMoonFactor(bortle), pairs.web.bortleMoonFactor(bortle)]);
  }
  process.stdout.write(JSON.stringify(out));
} else if (engine === "ceil") {
  /* Horizon lookup parity: web/horizon.js::ceilFor vs app/nightcalc.ceil_lookup.
   * Case: {mode, profile, profileTop, az} - the profile arrays are 720 numbers
   * or empty, exactly as the API/pano editor produce them. */
  const H = await import(new URL("../../web/horizon.js", import.meta.url).href);
  const out = cases.map((c) => {
    const rec = {
      paintMode: c.mode,
      profile: c.profile,
      profileTop: c.profileTop,
      fov: c.fov == null ? 360 : c.fov,
      azOffset: c.azOffset || 0,
    };
    const r = H.ceilFor(rec, c.az);
    return { ceil: r.ceil, ceilTop: r.ceilTop };
  });
  process.stdout.write(JSON.stringify(out));
} else if (engine === "window") {
  const out = cases.map((c) => {
    const best = mod.longestRunJS(c.flags);
    return {
      best,
      endISO: best ? mod.windowEndISO(c.times, best[1], c.step) : null,
    };
  });
  process.stdout.write(JSON.stringify(out));
} else {
  const out = cases.map((c) => {
    const r = {};
    const [ra, dec] = mod.precessJ2000ToDate(c.ra, c.dec, c.jd);
    r.ra = ra;
    r.dec = dec;
    if (typeof mod.precessDateToJ2000 === "function") {
      const [ira, idec] = mod.precessDateToJ2000(c.ra, c.dec, c.jd);
      r.inv_ra = ira;
      r.inv_dec = idec;
    }
    if (typeof mod.gmstDeg === "function") r.gmst = mod.gmstDeg(c.jd);

    if (engine === "web") {
      const [alt, az] = mod.altaz(c.ra, c.dec, c.jd, c.lat, c.lon);
      r.alt = alt;
      r.az = az;
      const [sra, sdec] = mod.sunRaDec(c.jd);
      r.sun_ra = sra;
      r.sun_dec = sdec;
      const [mra, mdec] = mod.moonRaDec(c.jd);
      r.moon_ra = mra;
      r.moon_dec = mdec;
    } else {
      // the desktop engine takes J2000 coords and precesses once per object at
      // the grid midpoint (derive.js: synthesizeAdvancedTracks) - mirror that
      // usage instead of handing raw J2000 coords to the sample loop
      const [pr, pd] = mod.precessJ2000ToDate(c.ra, c.dec, c.jd);
      const frame = mod.altazFrame(c.lat, c.lon, [c.jd]);
      const [alt, az] = mod.altazFrameApply(frame, pr, pd, 0);
      r.alt = alt;
      r.az = az;
    }
    return r;
  });
  process.stdout.write(JSON.stringify(out));
}
