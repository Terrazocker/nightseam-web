/* Residual probes: 360 seam continuity + the step=2 azimuth sampling of
 * overhangRuns/assumedOpenRuns vs the all-column hatch/preview.
 * Run: node reviews/0.6.32-full/evidence/core/probe_seam_sampling.mjs */
const ROOT = 'file:///<workspace>/AstroPilot-local/';
const H = await import(ROOT + 'core/horizon.js');
const BINS = 720;
const out = (t, o) => console.log(t + ' ' + JSON.stringify(o));

/* A. stroke crossing the 0/360 seam in a full 360 pano */
{
  const p = { azOffset: 0, altBottom: 0, altTop: 90, fov: 360, paintMode: 'obstacle',
              blockAbove: false, profile: new Array(BINS).fill(H.NO_BLOCK),
              profileTop: new Array(BINS).fill(H.NO_BLOCK) };
  p.strokes = [{ m: 'b', x: 719, y: 180, r: 20 }, { m: 'b', x: 1, y: 180, r: 20 }];
  H.computeProfile(p);
  out('PROBE', { probe: 'A-seam-continuity', wrap: H.wrapsFor(p),
                 c0: p.profile[0], c719: p.profile[719], c360: p.profile[360] });
  // and a partial-FOV record must NOT wrap
  const q = { azOffset: 0, altBottom: 0, altTop: 90, fov: 90, paintMode: 'obstacle',
              blockAbove: false, profile: new Array(BINS).fill(H.NO_BLOCK),
              profileTop: new Array(BINS).fill(H.NO_BLOCK),
              strokes: [{ m: 'b', x: 719, y: 180, r: 20 }] };
  const m = H.rebuildMask(q.strokes, H.wrapsFor(q));
  out('PROBE', { probe: 'A2-partial-fov-no-wrap', wrap: H.wrapsFor(q),
                 paintedCol1: m[180 * 720 + 1], paintedCol700: m[180 * 720 + 700] });
}
/* B. one-column overhang / assumed-open run vs step=2 sampling and the hatch */
{
  const mkP = (topVal, blockAbove) => {
    const p = { azOffset: 0, altBottom: 0, altTop: 90, fov: 360, paintMode: 'sky',
                blockAbove, profile: new Array(BINS).fill(0),
                profileTop: new Array(BINS).fill(90.5) };   // open above everywhere
    p.profileTop[100] = topVal;                              // ONE column with a real top
    return p;
  };
  const ov = mkP(40, true);
  const runs = H.overhangRuns(ov, 2);
  const azOfCol100 = 100 * 0.5 + 0.25;                       // inside the single column
  out('PROBE', { probe: 'B-single-column-overhang', runs,
                 ceilForAtCol: H.ceilFor(ov, azOfCol100),
                 azSampledByRuns: Array.from({ length: 180 }, (_, k) => k * 2).includes(100 * 0.5 + 0.25) });
  const ao = mkP(40, false);
  out('PROBE', { probe: 'B2-single-column-assumed-open', runs: H.assumedOpenRuns(ao, 2),
                 hatchPolys: H.assumedOpenHatchPolys(ao, 720, 56, 0, 90).length,
                 hatchXs: H.assumedOpenHatchPolys(ao, 720, 56, 0, 90).map((r) => r.map((q) => q[0])) });
}
