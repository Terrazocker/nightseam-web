// L6 probe 6: tier letters are mode-independent on the REAL payload.
import { readFileSync } from 'node:fs';
import { assignPopularityTiers, tierForRank, TIER_BANDS } from '../../../../core/catalog.js';

const CAT = JSON.parse(readFileSync(new URL('../../../../web/catalog.json', import.meta.url), 'utf8'));
const std = CAT.filter((o) => !o._adv);
const adv = CAT;
console.log('payload', CAT.length, 'standard', std.length, 'advanced', adv.length);

const tStd = assignPopularityTiers(std);
const tAll = assignPopularityTiers(adv);

let mism = 0, fStd = 0;
for (const o of std) {
  if (tStd.get(o.id) !== tAll.get(o.id)) { if (mism < 5) console.log('MISMATCH', o.id, tStd.get(o.id), tAll.get(o.id)); mism++; }
  if (tStd.get(o.id) === 'F') fStd++;
}
console.log('standard rows whose letter differs from the global letter:', mism);
console.log('standard rows landing in F:', fStd);

const dist = {};
for (const [, t] of tStd) dist[t] = (dist[t] || 0) + 1;
console.log('standard tier distribution:', dist);
const distAll = {};
for (const [, t] of tAll) distAll[t] = (distAll[t] || 0) + 1;
console.log('advanced-mode (whole catalog) tier distribution:', distAll);

const ranked = adv.filter((o) => (o.popularity || 0) > 0)
  .sort((a, b) => (b.popularity - a.popularity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
console.log('rank 1..3:', ranked.slice(0, 3).map((o) => `${o.id}/${o.primary_name}/${o.popularity}/${tAll.get(o.id)}`));
console.log('rank 200..201:', ranked.slice(199, 201).map((o) => `${o.id}/${o.popularity}/${tAll.get(o.id)}`));
console.log('unscored rows in the whole payload:', adv.filter((o) => !(o.popularity > 0)).length,
  '-> all must be F:', adv.filter((o) => !(o.popularity > 0)).every((o) => tAll.get(o.id) === 'F'));
console.log('bands:', JSON.stringify(TIER_BANDS), '| tierForRank(101) =', tierForRank(101), '| (0) =', tierForRank(0));
// does the standard set equal the global top 200 by the SAME rule?
const top200 = new Set(ranked.slice(0, 200).map((o) => o.id));
console.log('standard set == global top200 by the same sort:', top200.size === std.length && [...top200].every((i) => std.some((o) => o.id === i)));
