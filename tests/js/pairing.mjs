/*
 * Pairing transport contracts in web/pairing.js: ids and keys, the QR
 * address, sealing (a wrong key, another box, the other direction or a
 * changed byte is refused), offers, and that a reply carries exactly the
 * share-link text. Relay calls run against a fetch stub here; the real
 * relay is driven by tests/js/pairing_relay.mjs. Prints one marker line;
 * tests/test_js_behaviour.py asserts it.
 */
import assert from 'node:assert/strict';
import * as P from '../../web/pairing.js';
import * as H from '../../core/horizon.js';

// --- ids, keys and the address ---------------------------------------------
const a = P.newPairing(), b = P.newPairing();
assert.match(a.id, /^[A-Za-z0-9_-]{22}$/, '16 random bytes, base64url');
assert.match(a.key, /^[A-Za-z0-9_-]{43}$/, '32 random bytes, base64url');
assert.notEqual(a.id, b.id);
assert.notEqual(a.key, b.key);

const url = P.pairingUrl('https://nightseam.de/astro/?x=1#horizon', a);
assert.equal(url, `https://nightseam.de/astro/#pair=${a.id}.${a.key}`, 'the key rides in the fragment only');
assert.deepEqual(P.parsePairFragment(new URL(url).hash), { id: a.id, key: a.key });
for (const bad of ['', '#pair=', '#horizon=AAAA', `#pair=${a.id}`, `#pair=${a.id}.short`,
  `#pair=${a.id}x.${a.key}`, `#pair=${a.id}.${a.key}x`, `#pair=${a.id}.${a.key.slice(0, -1)}+`]) {
  assert.equal(P.parsePairFragment(bad), null, `${bad} is not a pairing`);
}

assert.equal(P.relayUrlFor('https://nightseam.de/astro/'), 'https://nightseam.de/astro/relay.php');
assert.equal(P.relayUrlFor('https://nightseam.de/astro/index.html'), 'https://nightseam.de/astro/relay.php');
assert.equal(P.relayUrlFor(`https://nightseam.de/astro/releases/${'a1'.repeat(32)}/index.html`),
  'https://nightseam.de/astro/relay.php', 'every release talks to the one stable relay');
assert.equal(P.relayUrlFor('http://127.0.0.1:8080/#horizon'), 'http://127.0.0.1:8080/relay.php');

// --- sealing ------------------------------------------------------------------
const text = new TextEncoder().encode('a horizon');
const sealed = await P.seal(a, 'reply', text);
assert.equal(sealed[0], P.PAIR_VERSION);
assert.equal(sealed.length, 1 + 12 + text.length + 16, 'version, IV, ciphertext and tag');
assert.deepEqual(await P.unseal(a, 'reply', sealed), text, 'round trip');
assert.notDeepEqual(await P.seal(a, 'reply', text), sealed, 'a fresh IV every time');
await assert.rejects(P.unseal({ id: a.id, key: b.key }, 'reply', sealed), /could not be decrypted/, 'a wrong key is refused');
await assert.rejects(P.unseal({ id: b.id, key: a.key }, 'reply', sealed), /could not be decrypted/, 'another box id is refused');
await assert.rejects(P.unseal(a, 'offer', sealed), /could not be decrypted/, 'an offer is not a reply');
for (const at of [1, 13, sealed.length - 1]) {
  const t = sealed.slice();
  t[at] ^= 1;
  await assert.rejects(P.unseal(a, 'reply', t), /could not be decrypted/, `a changed byte at ${at} is refused`);
}
const v2 = sealed.slice(); v2[0] = 2;
await assert.rejects(P.unseal(a, 'reply', v2), /newer version/);
await assert.rejects(P.unseal(a, 'reply', sealed.slice(0, 20)), /damaged/, 'a cut message is refused');
await assert.rejects(P.seal(a, 'reply', new Uint8Array(P.PAIR_MAX_BODY)), /too large/, 'nothing the relay would refuse is sent');

// --- offers --------------------------------------------------------------------
const site = { name: 'Garten am Hang', lat: 48.137, lon: 11.575, elev: 520, tz: 'Europe/Berlin', id: 's1', extra: 'x' };
assert.deepEqual(P.decodeOffer(P.encodeOffer(site)),
  { site: { name: 'Garten am Hang', lat: 48.137, lon: 11.575, elev: 520, tz: 'Europe/Berlin' } },
  'only name, coordinates, elevation and time zone travel');
assert.deepEqual(P.decodeOffer(P.encodeOffer(null)), { site: null });
assert.deepEqual(P.decodeOffer(P.encodeOffer({ lat: 95, lon: 0 })), { site: null }, 'an impossible site is not offered');
assert.equal(P.decodeOffer(P.encodeOffer({ label: 'x', lat: 1, lon: 2 })).site.tz, null);
for (const [bad, why] of [['{"v":2,"site":null}', 'another version'], ['nope', 'not JSON'],
  ['{"v":1,"site":{"lat":"1","lon":2}}', 'a text latitude'], ['{"v":1,"site":{"lat":1,"lon":200}}', 'a longitude past 180']]) {
  assert.throws(() => P.decodeOffer(new TextEncoder().encode(bad)), Error, `${why} is refused`);
}

// --- the reply is the share link ---------------------------------------------------
const horizon = { name: 'Balkon — Süd', points: [{ az: 10, alt: 12.5 }, { az: 180, alt: 30 }, { az: 300.25, alt: 4 }],
  overhangs: [[{ az: 150, alt: 60 }, { az: 210, alt: 55 }]] };
const link = H.encodeHorizonLink(horizon);
assert.equal(H.decodeHorizonLink(link).overhangs.length, 1, 'the overhang travels too');
const reply = await P.seal(a, 'reply', P.encodeReply(link));
const back = P.decodeReply(await P.unseal(a, 'reply', reply));
assert.equal(back, link);
assert.deepEqual(H.decodeHorizonLink(back), H.decodeHorizonLink(link), 'the same points as the share link');

// --- relay calls against a stub --------------------------------------------------
const calls = [];
let answer = null;
globalThis.fetch = async (u, init) => {
  calls.push({ u, init });
  return answer(u, init);
};
const response = (status, body, headers = {}) => new Response(body ?? null, { status, headers });
const relay = 'https://nightseam.de/astro/relay.php';

answer = () => response(201, null, { 'X-Relay-Remaining': '600', 'X-Relay-State': 'open' });
const opened = await P.openPairing(relay, site, a);
assert.equal(opened.remaining, 600);
assert.equal(calls[0].u, `${relay}?box=${a.id}&op=open`);
assert.equal(calls[0].init.method, 'POST');
assert.equal(calls[0].init.headers['Content-Type'], 'application/octet-stream');
assert.equal(calls[0].init.credentials, 'omit');
assert.deepEqual(P.decodeOffer(await P.unseal(a, 'offer', calls[0].init.body)).site.name, 'Garten am Hang',
  'the offer goes out sealed');
assert.ok(!new TextDecoder().decode(calls[0].init.body).includes('Garten'), 'no site name in the clear');

answer = () => response(204, null, { 'X-Relay-Remaining': '540', 'X-Relay-State': 'connected' });
assert.deepEqual(await P.pollPairing(relay, a), { state: 'connected', remaining: 540 });
answer = () => response(200, reply, { 'X-Relay-Remaining': '500' });
assert.deepEqual(await P.pollPairing(relay, a), { state: 'received', link });
const foreign = await P.seal(b, 'reply', P.encodeReply(link));
answer = () => response(200, foreign);
await assert.rejects(P.pollPairing(relay, a), /could not be decrypted/, 'a reply for another key is refused');

answer = () => response(404, '{"error":"no such box"}');
await assert.rejects(P.pollPairing(relay, a), (e) => e instanceof P.RelayError && e.status === 404 && /expired/.test(e.message));
await P.closePairing(relay, a);   // a failed close is ignored
assert.equal(calls.at(-1).u, `${relay}?box=${a.id}&op=close`);
assert.equal(calls.at(-1).init.method, 'POST');

answer = async () => response(200, await P.seal(a, 'offer', P.encodeOffer(site)), { 'X-Relay-Remaining': '480' });
const offer = await P.readOffer(relay, a);
assert.equal(offer.site.name, 'Garten am Hang');
assert.equal(offer.remaining, 480);
assert.equal(calls.at(-1).init.method, 'GET');

answer = () => response(201, null, { 'X-Relay-Remaining': '470' });
assert.deepEqual(await P.sendReply(relay, a, link), { remaining: 470 });
assert.equal(P.decodeReply(await P.unseal(a, 'reply', calls.at(-1).init.body)), link);
answer = () => response(409, '{"error":"already answered"}');
await assert.rejects(P.sendReply(relay, a, link), /already received/);
answer = () => { throw new TypeError('offline'); };
await assert.rejects(P.readOffer(relay, a), (e) => e.status === 0 && /no connection/.test(e.message));

// --- horizon codes -------------------------------------------------------------------
for (let i = 0; i < 200; i++) {
  const code = P.newShortCode();
  assert.equal(code.length, P.CODE_LENGTH);
  for (const c of code) assert.ok(P.CODE_ALPHABET.includes(c), `${c} is in the alphabet`);
}
assert.ok(!/[01ILO]/.test(P.CODE_ALPHABET), 'no characters that read alike');
assert.equal(P.formatShortCode('K7Q4MX'), 'K7Q-4MX');
for (const typed of ['K7Q-4MX', 'k7q4mx', ' K7Q 4MX ', 'k7q--4mx']) assert.equal(P.parseShortCode(typed), 'K7Q4MX', typed);
for (const bad of ['', 'K7Q-4M', 'K7Q-4MXX', 'K7Q-4M0', 'K7Q-4MI', 'K7Q.4MX', null]) assert.equal(P.parseShortCode(bad), null, String(bad));
const sp = await P.sharePairing('K7Q4MX');
assert.match(sp.id, /^[A-Za-z0-9_-]{22}$/, 'a box id the relay accepts');
assert.match(sp.key, /^[A-Za-z0-9_-]{43}$/, 'a 256-bit key');
assert.deepEqual(await P.sharePairing('K7Q4MX'), sp, 'the same code, the same box and key');
assert.notEqual((await P.sharePairing('K7Q4MY')).id, sp.id);

// An in-memory relay with relay.php's rules for codes: put creates (201) or
// replaces with the same token (204), another token is refused (409); get
// returns the body; drop needs the token.
const stored = new Map();
answer = (u, init) => {
  const q = new URL(u).searchParams, id = q.get('box'), op = q.get('op'), rec = stored.get(id);
  const token = init.headers['X-Share-Token'];
  const left = { 'X-Relay-Remaining': '86400' };
  if (op === 'get') return rec ? response(200, rec.body, left) : response(404);
  if (op === 'drop') {
    if (rec && rec.token !== token) return response(403);
    stored.delete(id);
    return response(204);
  }
  if (rec && rec.token !== token) return response(409);
  stored.set(id, { token, body: new Uint8Array(init.body) });
  return response(rec ? 204 : 201, null, left);
};
const t0 = Date.now();
const share = await P.createShare(relay, link);
assert.match(share.code, new RegExp(`^[${P.CODE_ALPHABET}]{6}$`));
assert.match(share.token, /^[A-Za-z0-9_-]{22}$/, 'a 16-byte token');
assert.ok(share.expires >= t0 + 86400 * 1000 && share.expires <= Date.now() + 86400 * 1000, 'expires in 24 hours');
const put = calls.at(-1);
assert.equal(put.u, `${relay}?box=${(await P.sharePairing(share.code)).id}&op=put`);
assert.equal(put.init.headers['X-Share-Token'], share.token);
assert.ok(!new TextDecoder('latin1').decode(put.init.body).includes(link.slice(0, 12)), 'the horizon travels sealed');
assert.ok(!put.u.includes(share.code), 'the code itself never reaches the relay');

const typed = P.parseShortCode(P.formatShortCode(share.code).toLowerCase());
assert.deepEqual(await P.fetchShare(relay, typed), { link, remaining: 86400 }, 'the typed code gets the horizon');
assert.equal(calls.at(-1).init.method, 'GET');
assert.equal(calls.at(-1).init.headers['X-Share-Token'], undefined, 'looking up needs no token');

const renamed = H.encodeHorizonLink({ ...horizon, name: 'Balkon — Nord' });
await P.updateShare(relay, share, renamed);
assert.equal((await P.fetchShare(relay, share.code)).link, renamed, 'an edit replaces the stored horizon');
await assert.rejects(P.updateShare(relay, { ...share, token: P.newPairing().id }, link), (e) => e.status === 409,
  'only the maker may change it');

const wrongCode = (share.code[0] === '2' ? '3' : '2') + share.code.slice(1);
await assert.rejects(P.fetchShare(relay, wrongCode), (e) => e.status === 404 && /no horizon has this code/.test(e.message));

// a taken code is replaced by a new one
let takenOnce = true;
const plain = answer;
answer = (u, init) => {
  if (takenOnce && new URL(u).searchParams.get('op') === 'put') { takenOnce = false; return response(409); }
  return plain(u, init);
};
const second = await P.createShare(relay, link);
assert.notEqual(second.code, share.code);
answer = plain;

// another key cannot read it; delete needs the token
const sealedBody = stored.get((await P.sharePairing(share.code)).id).body;
await assert.rejects(P.unseal(await P.sharePairing(wrongCode), 'share', sealedBody), /could not be decrypted/);
await P.deleteShare(relay, { ...share, token: second.token });
assert.ok(stored.has((await P.sharePairing(share.code)).id), 'another token cannot delete it');
await P.deleteShare(relay, share);
assert.equal(calls.at(-1).init.method, 'POST');
await assert.rejects(P.fetchShare(relay, share.code), (e) => e.status === 404, 'deleted before it expires');

// --- polling backoff ---------------------------------------------------------------
assert.equal(P.nextPollDelay(0), P.POLL_MS);
assert.equal(P.nextPollDelay(1), 2 * P.POLL_MS);
assert.equal(P.nextPollDelay(20), P.POLL_MAX_MS);

console.log('pairing transport contract held');
