/*
 * NightSeam Web - Pairing transport: a horizon from the phone to the desktop.
 *
 * The desktop makes a box id and a 256-bit key, opens a box on the relay
 * (relay.php) with its site as the encrypted offer and shows
 * /astro/#pair=<id>.<key> as a QR code. The phone reads the offer, the user
 * captures, and the phone answers once with the horizon's share-link text
 * (encodeHorizonLink), encrypted with the same key. The relay only ever holds
 * ciphertext; the key stays in the fragment, which browsers never send.
 *
 * Sealed message: version byte 1, a 12-byte IV, then AES-GCM-256 ciphertext
 * and tag. The additional data names the box and the direction, so an offer
 * cannot be passed off as a reply or moved to another box.
 *
 * Transport only, no astronomy and no DOM: Node tests import it directly.
 */

export const PAIR_VERSION = 1;
export const PAIR_TTL_S = 600;          // relay.php BOX_TTL
export const PAIR_MAX_BODY = 65536;     // relay.php MAX_BODY
export const POLL_MS = 2500;
export const POLL_MAX_MS = 15000;

const ID_BYTES = 16;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

/* ------------------------------ encoding ------------------------------ */

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const random = (n) => crypto.getRandomValues(new Uint8Array(n));

/** A fresh pairing: a random box id and key, both base64url. */
export function newPairing() {
  return { id: b64url(random(ID_BYTES)), key: b64url(random(KEY_BYTES)) };
}

/** The planner address the QR code carries. `base` is the planner's own URL. */
export function pairingUrl(base, pairing) {
  const u = new URL(base);
  u.search = '';
  u.hash = `pair=${pairing.id}.${pairing.key}`;
  return u.href;
}

/** Read `#pair=<id>.<key>`; null for anything else or a damaged code. */
export function parsePairFragment(hash) {
  const m = /^#pair=([^.]+)\.(.+)$/.exec(String(hash || ''));
  if (!m || !ID_RE.test(m[1]) || !KEY_RE.test(m[2])) return null;
  return { id: m[1], key: m[2] };
}

/* ------------------------------ sealing ------------------------------ */

async function aesKey(key, use) {
  const raw = fromB64url(key);
  if (raw.length !== KEY_BYTES) throw new Error('the pairing key is damaged');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [use]);
}

const additional = (id, purpose) => new TextEncoder().encode(`nightseam-pair-v${PAIR_VERSION}:${id}:${purpose}`);

/** Encrypt `bytes` for box `id`; `purpose` is 'offer' or 'reply'. */
export async function seal(pairing, purpose, bytes) {
  const iv = random(IV_BYTES);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additional(pairing.id, purpose) },
    await aesKey(pairing.key, 'encrypt'), bytes));
  const out = new Uint8Array(1 + IV_BYTES + ct.length);
  out[0] = PAIR_VERSION;
  out.set(iv, 1);
  out.set(ct, 1 + IV_BYTES);
  if (out.length > PAIR_MAX_BODY) throw new Error('this is too large to send');
  return out;
}

/** Decrypt a sealed message; throws on a wrong key, box, purpose or any change. */
export async function unseal(pairing, purpose, data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 1 + IV_BYTES + 16 || bytes[0] !== PAIR_VERSION) throw new Error('the message is damaged or from a newer version');
  try {
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(1, 1 + IV_BYTES), additionalData: additional(pairing.id, purpose) },
      await aesKey(pairing.key, 'decrypt'), bytes.subarray(1 + IV_BYTES)));
  } catch {
    throw new Error('the message could not be decrypted');
  }
}

/* ------------------------------ messages ------------------------------ */

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** The desktop's offer: its active site (name or label, lat, lon, elev, tz)
 *  or none. Nothing else of the site record travels. */
export function encodeOffer(site) {
  const s = site && num(site.lat, -90, 90) && num(site.lon, -180, 180) ? {
    name: String(site.name || site.label || 'Site').slice(0, 80),
    lat: site.lat, lon: site.lon,
    elev: num(site.elev, -500, 9000) ? site.elev : 0,
    tz: typeof site.tz === 'string' && site.tz ? site.tz.slice(0, 64) : null,
  } : null;
  return new TextEncoder().encode(JSON.stringify({ v: PAIR_VERSION, site: s }));
}

/** Read an offer; throws when it is not one. */
export function decodeOffer(bytes) {
  let d;
  try { d = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch {
    throw new Error('the offer is damaged');
  }
  if (!d || typeof d !== 'object' || d.v !== PAIR_VERSION) throw new Error('the offer is from another version');
  const s = d.site;
  if (s == null) return { site: null };
  if (typeof s !== 'object' || !num(s.lat, -90, 90) || !num(s.lon, -180, 180)) throw new Error('the offered site is damaged');
  return {
    site: {
      name: String(s.name || 'Site').slice(0, 80), lat: s.lat, lon: s.lon,
      elev: num(s.elev, -500, 9000) ? s.elev : 0,
      tz: typeof s.tz === 'string' && s.tz ? s.tz.slice(0, 64) : null,
    },
  };
}

/** A reply carries the horizon's share-link text (ASCII). */
export const encodeReply = (linkText) => new TextEncoder().encode(String(linkText));
export const decodeReply = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

/* ------------------------------ relay ------------------------------ */

/** Thrown for relay answers; `status` is the HTTP status, 0 when offline. */
export class RelayError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** The relay sits at a stable path next to the planner: /astro/relay.php in
 *  production, whatever release folder the page or this module came from. */
export function relayUrlFor(pageUrl) {
  const u = new URL(pageUrl);
  const path = u.pathname.replace(/releases\/[0-9a-f]{64}\/[^/]*$/, '').replace(/[^/]*$/, '');
  return `${u.origin}${path}relay.php`;
}

function messageFor(status) {
  if (status === 404) return 'the pairing has expired or was cancelled';
  if (status === 409) return 'the desktop already received a horizon';
  if (status === 413) return 'the horizon is too large to send';
  if (status === 429) return 'too many pairings from this network; wait a few minutes';
  if (status === 503) return 'the pairing service is not available right now';
  return `the pairing service answered ${status}`;
}

async function call(relay, op, id, body) {
  let res;
  try {
    res = await fetch(`${relay}?box=${encodeURIComponent(id)}&op=${op}`, body === undefined
      ? { method: op === 'close' ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit' }
      : { method: 'POST', cache: 'no-store', credentials: 'omit', body,
        headers: { 'Content-Type': 'application/octet-stream' } });
  } catch {
    throw new RelayError(0, 'no connection to the pairing service');
  }
  const remaining = Number(res.headers.get('X-Relay-Remaining'));
  const info = { status: res.status, state: res.headers.get('X-Relay-State') || null,
    remaining: Number.isFinite(remaining) ? remaining : null };
  if (res.status === 200) info.body = new Uint8Array(await res.arrayBuffer());
  else if (res.status !== 201 && res.status !== 204) throw new RelayError(res.status, messageFor(res.status));
  return info;
}

/** Desktop: open a new box with the site as the offer. */
export async function openPairing(relay, site, pairing = newPairing()) {
  const info = await call(relay, 'open', pairing.id, await seal(pairing, 'offer', encodeOffer(site)));
  return { ...pairing, remaining: info.remaining ?? PAIR_TTL_S };
}

/** Desktop: one poll. Resolves { state, remaining } while waiting, or
 *  { state: 'received', link } with the decrypted share-link text. */
export async function pollPairing(relay, pairing) {
  const info = await call(relay, 'poll', pairing.id);
  if (info.status !== 200) return { state: info.state || 'open', remaining: info.remaining };
  return { state: 'received', link: decodeReply(await unseal(pairing, 'reply', info.body)) };
}

/** Desktop: delete the box (Cancel); errors are ignored. */
export async function closePairing(relay, pairing) {
  try { await call(relay, 'close', pairing.id); } catch { /* it expires anyway */ }
}

/** Phone: read the desktop's offer. Resolves { site, remaining }. */
export async function readOffer(relay, pairing) {
  const info = await call(relay, 'offer', pairing.id);
  return { ...decodeOffer(await unseal(pairing, 'offer', info.body)), remaining: info.remaining };
}

/** Phone: answer once with the horizon's share-link text. */
export async function sendReply(relay, pairing, linkText) {
  const info = await call(relay, 'reply', pairing.id, await seal(pairing, 'reply', encodeReply(linkText)));
  return { remaining: info.remaining };
}

/** The next poll delay: POLL_MS while the relay answers, doubling up to
 *  POLL_MAX_MS after failures. */
export const nextPollDelay = (failures) => Math.min(POLL_MAX_MS, POLL_MS * 2 ** Math.max(0, failures));
