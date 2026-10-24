/*
 * The pairing transport (web/pairing.js) against the real relay
 * (web/relay.php under `php -S`), started by tests/test_relay.py, which passes
 * its address in NIGHTSEAM_RELAY_URL: desktop opens, phone reads the offer
 * and answers once, desktop receives and closes, and the box is gone.
 */
import assert from 'node:assert/strict';
import * as P from '../../web/pairing.js';
import * as H from '../../core/horizon.js';

const relay = process.env.NIGHTSEAM_RELAY_URL;
assert.ok(relay, 'NIGHTSEAM_RELAY_URL is set by tests/test_relay.py');

const site = { label: 'Garten am Hang', lat: 48.137, lon: 11.575, elev: 520, tz: 'Europe/Berlin' };
const desktop = await P.openPairing(relay, site);
assert.ok(desktop.remaining > 590 && desktop.remaining <= P.PAIR_TTL_S);
assert.equal((await P.pollPairing(relay, desktop)).state, 'open');

// The phone knows only what the QR code carried.
const phone = P.parsePairFragment(new URL(P.pairingUrl('https://nightseam.de/astro/', desktop)).hash);
const offer = await P.readOffer(relay, phone);
assert.equal(offer.site.name, 'Garten am Hang');
assert.equal(offer.site.tz, 'Europe/Berlin');
assert.equal((await P.pollPairing(relay, desktop)).state, 'connected', 'the desktop sees the phone arrive');

const horizon = { name: 'Balkon', points: Array.from({ length: 360 }, (_, i) => ({ az: i, alt: (i * 7) % 40 })) };
const link = H.encodeHorizonLink(horizon);
await P.sendReply(relay, phone, link);
await assert.rejects(P.sendReply(relay, phone, link), (e) => e.status === 409, 'only one answer');

const got = await P.pollPairing(relay, desktop);
assert.equal(got.state, 'received');
assert.deepEqual(H.decodeHorizonLink(got.link).points, horizon.points);
assert.equal((await P.pollPairing(relay, desktop)).link, got.link, 'kept until the desktop closes the box');
await P.closePairing(relay, desktop);
await assert.rejects(P.pollPairing(relay, desktop), (e) => e.status === 404, 'closed, then gone');

// Cancel deletes the box for both sides.
const other = await P.openPairing(relay, null);
await P.closePairing(relay, other);
await assert.rejects(P.readOffer(relay, other), (e) => e.status === 404 && /expired or was cancelled/.test(e.message));

// A horizon code: stored for 24 hours, changed by its maker, read by anyone
// who types the code, deleted early on request.
const share = await P.createShare(relay, link);
const byCode = await P.fetchShare(relay, P.parseShortCode(P.formatShortCode(share.code)));
assert.deepEqual(H.decodeHorizonLink(byCode.link).points, horizon.points);
assert.ok(byCode.remaining > 86390 && byCode.remaining <= P.SHARE_TTL_S, 'kept for 24 hours');
const edited = H.encodeHorizonLink({ ...horizon, name: 'Balkon 2' });
await P.updateShare(relay, share, edited);
assert.equal((await P.fetchShare(relay, share.code)).link, edited);
await assert.rejects(P.updateShare(relay, { ...share, token: P.newPairing().id }, link), (e) => e.status === 409);
await P.deleteShare(relay, share);
await assert.rejects(P.fetchShare(relay, share.code), (e) => e.status === 404 && /no horizon has this code/.test(e.message));

console.log('pairing relay round trip held');
