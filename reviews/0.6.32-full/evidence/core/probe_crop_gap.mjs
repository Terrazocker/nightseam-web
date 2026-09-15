/* Probe: does a horizontal crop keep a CONTINUOUS painted band continuous?
 * core/horizon.js::cropStrokes scales x by 1/frac but leaves the brush radius
 * (and the y geometry) unchanged, and cropPano then RE-RASTERIZES the strokes
 * (computeProfile -> rebuildMask), so the dab pitch grows by 1/frac while the
 * dab radius does not.
 * Run: node reviews/0.6.32-full/evidence/core/probe_crop_gap.mjs
 */
const ROOT = 'file:///<workspace>/AstroPilot-local/';
const H = await import(ROOT + 'core/horizon.js');
const BINS = 720;
const out = (t, o) => console.log(t + ' ' + JSON.stringify(o));

/** one continuous drag: dabs every `pitch` mask px along alt `alt`, radius r */
function drag(p, x0, x1, alt, pitch, r) {
  const y = H.rowOfAlt(p, alt);
  const st = [];
  for (let x = x0; x <= x1; x += pitch) st.push({ m: 'b', x, y, r });
  return st;
}
const band = (prof) => prof.map((v) => v !== 90).reduce((a, b) => a + (b ? 1 : 0), 0);

for (const [mode, blank] of [['sky', 90], ['obstacle', H.NO_BLOCK]]) {
  for (const [pitch, r] of [[3, 12], [6, 12], [3, 6]]) {
    const p = {
      azOffset: 0, altBottom: 0, altTop: 90, fov: 360, paintMode: mode,
      blockAbove: false,
      profile: new Array(BINS).fill(blank), profileTop: new Array(BINS).fill(H.NO_BLOCK),
    };
    p.strokes = drag(p, 100, 500, 30, pitch, r);
    H.computeProfile(p);
    const before = p.profile.slice();
    const beforeBands = band(before);
    for (const w of [360, 240, 180, 90]) {
      const q = JSON.parse(JSON.stringify(p));
      q.strokes = p.strokes.map((s) => ({ ...s }));
      q.profile = p.profile.slice(); q.profileTop = p.profileTop.slice();
      H.cropPano(q, { x: 100, w }, 720);
      const fov = q.fov, az = q.azOffset;
      const inside = [];
      for (let i = 0; i < BINS; i++) if (H.fovBinRel(i, az, fov) !== null) inside.push(i);
      const holes = inside.filter((i) => q.profile[i] === blank);           // unpainted now
      const hadBand = inside.filter((i) => before[i] !== blank);
      const lost = holes.filter((i) => before[i] !== blank);
      const gain = inside.filter((i) => q.profile[i] !== blank && before[i] === blank);
      out('PROBE', {
        mode, pitch, r, keepW: w, scale: +(720 / w).toFixed(2), fov, az,
        beforeBandsInFrame: hadBand.length, afterBandsInFrame: inside.length - holes.length,
        lostBands: lost.length, gainedBands: gain.length,
        sampleLost: lost.slice(0, 3).map((i) => ({ i, az: i * 0.5, before: before[i], after: q.profile[i] })),
        beforeBandsTotal: beforeBands,
      });
    }
  }
}

/* money shot: obstacle mode, an object at alt 20 in a lost column */{
  const p = {
    azOffset: 0, altBottom: 0, altTop: 90, fov: 360, paintMode: 'obstacle',
    blockAbove: false,
    profile: new Array(BINS).fill(H.NO_BLOCK), profileTop: new Array(BINS).fill(H.NO_BLOCK),
  };
  p.strokes = drag(p, 100, 500, 30, 3, 12);
  H.computeProfile(p);
  const azPick = 170;   // world azimuth well inside the kept band [50, 250]
  const beforeCeil = H.ceilFor(p, azPick);
  H.cropPano(p, { x: 100, w: 180 }, 720);   // keep 90 deg -> scale 4
  const afterCeil = H.ceilFor(p, azPick);
  out('PROBE', {
    probe: 'money-shot-obstacle', az: azPick, alt: 20,
    before: { ceil: beforeCeil.ceil, visible: 20 > beforeCeil.ceil },
    after: { ceil: afterCeil.ceil, visible: 20 > afterCeil.ceil },
    fov: p.fov, azOffset: p.azOffset,
  });
}
/* DEFAULT web brush (#ed-brush value=28 -> r=28 mask px), realistic drag pitch */
for (const [mode, blank] of [['obstacle', H.NO_BLOCK], ['sky', 90]]) {
  for (const pitch of [8, 14]) {
    const p = {
      azOffset: 0, altBottom: 0, altTop: 90, fov: 360, paintMode: mode,
      blockAbove: false,
      profile: new Array(BINS).fill(blank), profileTop: new Array(BINS).fill(H.NO_BLOCK),
    };
    p.strokes = drag(p, 100, 500, 30, pitch, 28);
    H.computeProfile(p);
    const beforePre = p.profile.slice();
    for (const w of [180, 90]) {
      const q = JSON.parse(JSON.stringify(p));
      q.strokes = p.strokes.map((s) => ({ ...s }));
      q.profile = p.profile.slice(); q.profileTop = p.profileTop.slice();
      H.cropPano(q, { x: 100, w }, 720);
      const inside = [];
      for (let i = 0; i < BINS; i++) if (H.fovBinRel(i, q.azOffset, q.fov) !== null) inside.push(i);
      const lost = inside.filter((i) => q.profile[i] === blank && beforePre[i] !== blank);
      out('PROBE', {
        probe: 'default-brush-28', mode, pitch, keepW: w, scale: +(720 / w).toFixed(1),
        fov: q.fov, inFrameBins: inside.length, lostBands: lost.length,
        lostPct: +(100 * lost.length / inside.length).toFixed(1),
      });
    }
  }
}
/* same for sky mode: a lost column becomes fully blocked (90) */
{
  const p = {
    azOffset: 0, altBottom: 0, altTop: 90, fov: 360, paintMode: 'sky',
    blockAbove: false,
    profile: new Array(BINS).fill(90), profileTop: new Array(BINS).fill(H.NO_BLOCK),
  };
  p.strokes = drag(p, 100, 500, 30, 3, 12);
  H.computeProfile(p);
  const azPick = 170;
  const before = H.ceilFor(p, azPick);
  H.cropPano(p, { x: 100, w: 180 }, 720);
  const after = H.ceilFor(p, azPick);
  out('PROBE', { probe: 'money-shot-sky', az: azPick, before, after });
}
