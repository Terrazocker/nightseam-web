/* Lane probe step 2: does the web's core/catalog.js::searchBlob cover the
 * SERVER's `search` column (what the desktop filter matches on)? */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const R = fileURLToPath(new URL('../../../../', import.meta.url));
const C = await import(pathToFileURL(R + 'core/catalog.js').href);
const here = new URL('.', import.meta.url);
const search = JSON.parse(readFileSync(fileURLToPath(new URL('_search_col.json', here)), 'utf8'));
const payload = JSON.parse(readFileSync(R + 'web/catalog.json', 'utf8'));
const blobs = new Map(payload.map((o) => [o.id, C.searchBlob(o)]));
const missing = [];
for (const [id, s] of Object.entries(search)) {
  const web = blobs.get(id) || '';
  for (const tok of String(s).split(/[|,]/).map((t) => t.trim().toLowerCase())) {
    if (tok && tok.length > 2 && !web.includes(tok)) missing.push([id, tok, String(s).slice(0, 60)]);
  }
}
console.log('DB rows:', Object.keys(search).length, 'payload rows:', payload.length);
console.log('search tokens absent from the web blob:', missing.length);
for (const m of missing.slice(0, 8)) console.log('   ', JSON.stringify(m));
