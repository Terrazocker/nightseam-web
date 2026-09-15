/* Lane probe: core/catalog.js maps, ids, searchBlob, wikiTitles, tiers. Read-only. */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const R = fileURLToPath(new URL('../../../../', import.meta.url));
const C = await import(pathToFileURL(R + 'core/catalog.js').href);
const S = await import(pathToFileURL(R + 'core/scoring.js').href);
const j = (x) => JSON.stringify(x);
const out = (t, v) => console.log(t + ' :: ' + j(v));

/* ---- 7. palette coverage + unknown/prototype lookups ---- */
const rows = JSON.parse(readFileSync(R + 'web/catalog.json', 'utf8'));
const types = [...new Set(rows.map((o) => o.otype))].sort();
out('catalog types', types);
out('types missing a label', types.filter((t) => !C.TYPE_LABELS[t]));
out('types missing a colour', types.filter((t) => !C.TYPE_COLORS[t]));
out('palette keys not produced', Object.keys(C.TYPE_LABELS).filter((t) => !types.includes(t)));
for (const t of ['foo', 'toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
  out(`lookup ${t}`, {
    label: C.TYPE_LABELS[t] === undefined ? 'undefined' : typeof C.TYPE_LABELS[t],
    colour: C.TYPE_COLORS[t] === undefined ? 'undefined' : typeof C.TYPE_COLORS[t],
    rendered_label: String(C.TYPE_LABELS[t] || t).slice(0, 40),
    rendered_colour: String(C.TYPE_COLORS[t] || '#fallback').slice(0, 40),
    moonSensitivity: typeof S.moonSensitivity(t),
  });
}
out('template skymap.js:204 for unknown type', (() => {
  const o = { otype: 'foo' };
  return `${o.otype ? C.TYPE_LABELS[o.otype] : 'unknown'}`;   // exact expression, no fallback
})());

/* ---- 1b. the NaN chain from a prototype otype ---- */
const obj = { id: 'u_x', ra_hours: 5, dec_deg: 20, otype: 'toString' };
const step = 6 / 1440, jd0 = 2461305.5;
const n = 12;
const moonAlt = [], moonAz = [];
for (let i = 0; i <= n; i++) { moonAlt.push(40); moonAz.push(180); }
const ctx = { moonAware: true, illum: 1, moonAgeDays: 9.5, filterType: 'lrgb',
              typeF: S.moonSensitivity('toString'), bortleF: 0.76, moonAlt, moonAz };
const st = S.nightStats(obj, jd0, jd0 + n * step, step, 10, null, 52.5, 13.4, ctx);
const stOk = S.nightStats({ ...obj, otype: 'galaxy' }, jd0, jd0 + n * step, step, 10, null, 52.5, 13.4, ctx);
out('moon score with poisoned otype', [st.sClassic, String(st.sMoon), stOk.sMoon]);
out('naive sort with NaN', [{ id: 'a', score: st.sMoon }, { id: 'b', score: stOk.sMoon }]
  .sort((a, b) => b.score - a.score).map((r) => r.id));

/* ---- 6. isCustomId / searchBlob edges ---- */
out('isCustomId', ['u_1', 'u_', 'U_1', 'ngc1', '', null, undefined, 0, {}, ['u_1']]
  .map((v) => [String(v), C.isCustomId(v)]));
out('searchBlob', [
  [{ id: 'ngc1', primary_name: 'X', otype: 'galaxy' }, C.searchBlob({ id: 'ngc1', primary_name: 'X', otype: 'galaxy' })],
  [{ id: 'u_1', primary_name: 0 }, C.searchBlob({ id: 'u_1', primary_name: 0 })],
  [{ id: 'x', other: 'Eagle Nebula' }, C.searchBlob({ id: 'x', other: 'Eagle Nebula' })],
].map((x) => x[1]));
out('searchBlob(null)', (() => { try { return C.searchBlob(null); } catch (e) { return String(e); } })());
out('wikiTitles', [
  { messier: 'M101', ngcic: 'NGC 5457', primary_name: 'M101' },
  { messier: 'Mel 111', ngcic: '', primary_name: 'Coma Star Cluster' },
  { messier: 'M 31', ngcic: 'NGC 224', primary_name: 'Andromeda Galaxy' },
  { messier: 'm42', ngcic: 'NGC 1976', primary_name: 'M42' },
  { messier: 'M31/110', ngcic: '', primary_name: 'x' },
  { wiki: '  ', ngcic: 'IC 434', primary_name: 'Horsehead' },
  { messier: '', ngcic: '', primary_name: '' },
].map((o) => C.wikiTitles(o)));
out('wikiTitles(null)', (() => { try { return C.wikiTitles(null); } catch (e) { return String(e); } })());

/* ---- 5b. real-catalog wiki first candidate ---- */
let firstIsDisplayName = 0, dup = 0;
for (const o of rows) {
  const w = C.wikiTitles(o);
  if (!w.length || new Set(w).size !== w.length) dup++;
  if (w[0] === o.primary_name && !/^(NGC|IC)\s/.test(o.primary_name)) firstIsDisplayName++;
}
out('real catalog: dup/empty lists, display-name-first rows', [dup, firstIsDisplayName, rows.length]);

/* ---- 4. tiers ---- */
const mk = (ids) => ids.map((id, i) => ({ id, popularity: 42 }));
const a = mk(Array.from({ length: 120 }, (_, i) => `o${String(i).padStart(3, '0')}`));
const mapA = C.assignPopularityTiers(a);
const shuffled = a.slice().reverse();
const mapB = C.assignPopularityTiers(shuffled);
let differ = 0; for (const [k, v] of mapA) if (mapB.get(k) !== v) differ++;
out('tier order-independence', [mapA.get('o000'), mapA.get('o099'), mapA.get('o100'), differ]);
out('tier edges', [0, 1, 100, 101, 250, 251, 600, 601, 1500, 1501, 3500, 3501, -1, NaN, undefined, Infinity]
  .map((r) => [String(r), C.tierForRank(r)]));
out('tier order + missing/zero/NaN pop', [C.TIER_ORDER,
  Object.fromEntries(C.assignPopularityTiers([{ id: 'nos', popularity: 100 }, { id: 'mis' },
    { id: 'zero', popularity: 0 }, { id: 'nan', popularity: NaN }, { id: 'str', popularity: '42' }, { id: 'neg', popularity: -5 }]))]);
out('assignPopularityTiers([]) / null', [C.assignPopularityTiers([]).size,
  (() => { try { return C.assignPopularityTiers(null).size; } catch (e) { return String(e); } })()]);
out('tier duplicate ids', (() => {
  const m = C.assignPopularityTiers([{ id: 'dup', popularity: 900 }, { id: 'dup', popularity: 1 }]);
  return [m.size, m.get('dup')];
})());
/* server rule cross-check: score desc, id asc (real payload, web vs whole) */
const main = rows.filter((r) => !r._adv).map((r) => ({ id: r.id, popularity: r.popularity || 0 }));
const whole = rows.map((r) => ({ id: r.id, popularity: r.popularity || 0 }));
const t1 = C.assignPopularityTiers(main), t2 = C.assignPopularityTiers(whole);
let mm = 0; for (const [k, v] of t1) if (t2.get(k) !== v) mm++;
out('mode-independence mismatches', [t1.size, t2.size, mm, [...new Set(t1.values())].sort()]);
