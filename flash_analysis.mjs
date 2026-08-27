// Analyze: which catalog objects are the flashiest, and preview tonight's top targets.
import * as E from './astro-web/astro.js';

async function main() {
  const CAT = JSON.parse(await (await import('node:fs/promises')).readFile('./astro-web/catalog.json', 'utf8'));

  const flashOf = (o) => {
    const mag = o.vmag;
    const magScore = mag != null ? Math.max(0, Math.min(100, (12 - mag) * 9)) : 0;
    const sm = String(o.size_am || '').split('x');
    let min = 0, max = 0;
    if (sm.length >= 2) { min = parseFloat(sm[0]) || 0; max = parseFloat(sm[1]) || min; }
    else max = parseFloat(sm[0]) || 0;
    const sizeScore = Math.min(40, (Math.max(min, max) / 30) * 40);
    const fame = o.messier ? 15 : (!o._adv ? 8 : 0);
    const typeBoost = { nebula: 6, supernova_remnant: 6, planetary: 5, open_cluster: 4, globular: 3, galaxy: 1, star_cloud: 2, asterism: 0 }[o.otype] || 0;
    return Math.round(Math.min(100, magScore + sizeScore + fame + typeBoost));
  };

  const topFlash = CAT.map((o) => ({ o, f: flashOf(o) }))
    .sort((a, b) => b.f - a.f).slice(0, 15);
  console.log('=== FLASHIEST OBJECTS (static) ===');
  for (const { o, f } of topFlash) {
    console.log(String(f).padStart(3), o.messier || o.ngcic || o.id, '|', o.primary_name.padEnd(26), 'mag', String(o.vmag ?? '—').padStart(4), 'size', (o.size_am || '—').padEnd(9), o.otype);
  }

  // preview tonight's ranking for Berlin, blended with visibility
  const { lat, lon } = { lat: 52.52, lon: 13.4 };
  const now = new Date();
  const info = E.nightInfo(now, lat, lon);
  const startT = info.civilDusk || info.sunset || new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20);
  const endT = info.civilDawn || info.sunrise || new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 5);
  const jd0 = E.julianDay(startT), jd1 = E.julianDay(endT);
  const step = 600 / 86400;
  const n = Math.max(2, Math.round((jd1 - jd0) / step));
  const minAlt = 25;

  const cands = CAT.filter((o) => o.vmag != null && (!o._adv || o.vmag <= 9) && o.vmag < 14);
  const rows = [];
  for (const o of cands) {
    let visN = 0, s = 0, maxAlt = -90;
    const ra = o.ra_hours * 15;
    for (let i = 0; i <= n; i++) {
      const jd = jd0 + i * step;
      const [alt] = E.altaz(ra, o.dec_deg, jd, lat, lon);
      if (alt > maxAlt) maxAlt = alt;
      if (alt >= minAlt) { visN++; s += Math.sin(Math.max(0, Math.min(90, alt)) * Math.PI / 180); }
    }
    const flash = flashOf(o);
    const score = s * (0.45 + 0.75 * (flash / 100));
    rows.push({ o, flash, score, visN, maxAlt });
  }
  rows.sort((a, b) => b.score - a.score);
  console.log('\n=== TOP 15 TONIGHT (Berlin, visibility x flash) ===');
  for (const r of rows.slice(0, 15)) {
    const o = r.o;
    console.log((o.messier || o.ngcic || o.id).padEnd(7), o.primary_name.padEnd(26),
      'flash', String(r.flash).padStart(3), 'vis', String((100 * r.visN / (n + 1)).toFixed(0)).padStart(3) + '%', 'peak', r.maxAlt.toFixed(0) + '°');
  }
}
main();