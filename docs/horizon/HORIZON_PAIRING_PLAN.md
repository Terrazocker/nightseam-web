# Horizon pairing plan

Created October 19, 2026. **Status (October 19):** the owner approved all
phases; phases 1-4 and the documentation part of phase 5 are built and tested
(relay, transport, desktop dialog, phone banner). Phase 0 (the hosting probe:
`relay_probe.php` here and `scripts/relay_probe.py`) and the deployment part
of phase 5 wait for the owner. DECISIONS.md, 2026-10-19, records the decision
and settles the open questions below. **October 24:** horizon codes are built: a
horizon is kept on the relay for 24 hours under a short code (see "Horizon
codes (as built)" at the end; DECISIONS.md, 2026-10-24).

The owner asked for ways to
get a horizon captured on the phone onto the desktop, liked "the desktop
starts it" and short codes, and checked the hosting before this plan was
written. It extends phase 4 (share link) of the
[sensor capture plan](HORIZON_SENSOR_CAPTURE_PLAN.md); the share link, file
import/export and backups all stay.

It reverses one part of the 2026-10-15 decision (DECISIONS.md, "Share links,
not server shortcodes"): nightseam.de holds encrypted data for a few
minutes. The DECISIONS.md entry and the privacy text are written; the
server-policy review comes before anything is deployed.

## The flow

```
Desktop                          Relay (nightseam.de)              Phone
  | makes box id + 256-bit key       |                               |
  | open box, put offer (site) ----->|                               |
  | shows QR: /astro/#pair=<id>.<key>                                 |
  |                                  |      native camera app scans -|
  |                                  |<---- get offer, say hello ----|
  | "phone connected"                |      planner shows the site,  |
  |                                  |      user captures            |
  |                                  |<---- put reply (horizon) -----|
  | polls, gets reply once --------->| box deleted                   |
  | decrypts, "Add this horizon?"    |                               |
```

- The phone needs no QR scanner of its own: the camera apps on Android and
  iOS open a URL from a QR code.
- The QR code carries only the box id and the key, in the fragment, which
  browsers never send to a server. The site travels encrypted through the
  box, so no place name or coordinates end up in the camera app's or the
  browser's history.
- The relay only ever sees ciphertext, the box id, sizes, times and IP
  addresses.

## Hosting (checked by the owner, October 19)

- PHP 8.3 as FPM on Plesk, running as the subscription's system user, today
  "served by nginx". The owner agreed to switch to **FPM application served
  by Apache** so `web/.htaccess` also applies to the relay script. The switch
  is part of the deployment phase, not before: no page uses PHP today.
- `open_basedir` covers the whole webspace root. The owner created the data
  folder `nightseam-relay/` there, next to the document root, so no URL can
  reach it. The script finds it as a sibling of the document root and refuses
  to run if it is missing or inside the document root. The vhost name stays
  out of the repository.
- PHP-FPM runs on demand with at most 10 workers, so the desktop polls with
  short requests; a held-open request would tie up a worker.
- The host runs Imunify. It may flag a PHP script that writes files, or its
  firewall may block opaque binary bodies. Phase 0 tests both.

## Relay

One file, `web/relay.php`, served at a stable `/astro/relay.php` (not inside
a `releases/<hash>/` namespace, so every release talks to the same relay).

| Request | From | Does |
|---|---|---|
| `POST ?box=<id>&op=open` + offer | desktop | creates the box with the encrypted offer; refuses an existing id |
| `GET ?box=<id>&op=offer` | phone | returns the offer and marks the box connected |
| `POST ?box=<id>&op=reply` + reply | phone | stores the encrypted horizon once; refuses a second reply |
| `GET ?box=<id>&op=poll` | desktop | 204 + state (`open`, `connected`) while waiting; 200 with the reply once, then deletes the box; 404 when unknown or expired |
| `POST ?box=<id>&op=close` | desktop | deletes the box (Cancel) |

- Box ids are 16 random bytes (base64url), made by the desktop. Bodies are raw
  binary (`application/octet-stream`), at most 64 KB; a horizon link is at
  most 60,000 characters (`LINK_MAX_CHARS`).
- One file per box, written atomically (temporary file + rename). Boxes expire
  10 minutes after opening; every request sweeps a few expired boxes. At most
  about 200 live boxes, and a small per-IP limit on `open` and `reply`.
- Response headers come from the script: `Cache-Control: no-store` (a
  one-shot dynamic endpoint, not a way to hide cache-token drift),
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src
  'none'`. No CORS headers: only the planner's own origin uses it, and the
  existing `connect-src 'self'` already allows it. `web/.htaccess` needs a
  `FilesMatch` so its `Cache-Control` line does not override `no-store`.
- No logging of bodies. The host's access logs still record the box id and IP
  address; the privacy text says so.

Publication tooling: `scripts/publication_assets.py` publishes everything
except `.htaccess`, HTML and `version.json` into release namespaces. It gains
`web/relay.php` as the one stable-path server file, and a guard refuses any
other `.php` file.

## Client

- `web/pairing.js` (transport, not astronomy, so not in `core/`): box id and
  key generation, AES-GCM-256 through WebCrypto with the box id as additional
  data, and the relay calls. The offer is the site (name, latitude,
  longitude, elevation, timezone); the reply is the existing
  `encodeHorizonLink` text, so validation and size limits are reused through
  `decodeHorizonLink`.
- **QR encoder:** vendored, single file, MIT (Nayuki's QR Code generator or
  Kazuhiko Arase's `qrcode-generator`), rendered as SVG. This would be the
  first third-party code in `web/`; record where it came from, its version and
  its licence.
- **Desktop:** *Get horizon from phone* in the horizon panel opens a dialog:
  the QR code, the link as text, a countdown, a status line (waiting, phone
  connected, received) and Cancel. Polls every 2-3 s with backoff, stops when
  the dialog closes or the box expires. A received horizon goes through the
  same confirmation as `offerHorizonLink`, so nothing is saved before the
  user agrees.
- **Phone:** `app.js` handles `#pair=` next to `#horizon=` and removes the
  fragment at once with `history.replaceState`. A banner says which desktop
  site is waiting. After a capture, or for an existing horizon, *Send to
  desktop* replies; the banner says when it was delivered or expired.
- Keyboard access, focus order, accessible names and reduced motion follow
  DESIGN.md. The status line uses words, not just colour.

## Phases

**Phase 0 — hosting probe (owner present).** A throwaway script, deployed by
hand and removed afterwards, that writes, reads and deletes a file in
`nightseam-relay/`, and accepts a 64 KB binary POST. Run it once under
"served by nginx" and once under "served by Apache", with Imunify active.
Exit: results in RELEASES.md and the handler choice confirmed. Stop and
revisit (Plesk Node.js, or a Cloudflare Worker with a new `connect-src`
origin) if writes or bodies are blocked.

**Phase 1 — relay.** `web/relay.php`, the stable-path publication rule and its
guard, the `.htaccess` exemption. Tests run the script under `php -S`.

**Phase 2 — crypto and protocol.** `web/pairing.js` with Node tests and no UI.

**Phase 3 — desktop dialog.** QR code, polling, receive and confirm.

**Phase 4 — phone pairing mode.** `#pair=` handling, the banner, *Send to
desktop*.

**Phase 5 — policy, docs, deployment.** New DECISIONS.md entry, privacy text
in `landing/privacy.html`, DEVELOPMENT.md, DESIGN.md, HOSTING_CONFIGURATION.md
(the handler and the data folder), a *Pairing* section in
[HORIZON_ACCEPTANCE.md](../acceptance/HORIZON_ACCEPTANCE.md). The handler
switch and the deployment need the owner's go-ahead and the server-policy
review.

**Later, separate decisions:**
- *Short codes* (the phone starts it, the desktop types a code like
  `K7Q-4MX`) reuse the same relay. A short code cannot hold a strong key, so
  either the relay can read those horizons (one read, short expiry, rate
  limits), or the devices run a PAKE (CPace/SPAKE2), which needs both online
  at once and another vendored library.
- *Live mirror:* the phone posts the trace during the sweep and the desktop
  draws it.

## Checks

- Relay (pytest + `php -S`): open, offer, reply, poll once, then gone; second
  reply refused; expired and unknown boxes return 404; size, box-count and
  rate limits; refuses to run when the data folder is missing or inside the
  document root; response headers.
- Node: encrypt/decrypt round trip; a wrong key, another box id or a tampered
  body is rejected; the reply decodes to the same points as the share link.
- Browser, relay stubbed with `page.route`: the dialog shows a QR code and
  polls; a reply asks before adding and a refusal writes nothing; Cancel
  closes the box; the phone page removes the fragment and shows the waiting
  site.
- Owner: Pixel 7a and the desktop, end to end, on nightseam.de; an expired
  QR code says so on both sides.

## Open questions (settled October 19)

- PHP in CI and on this machine: PHP 8.3 CLI is required for the relay tests,
  like Node; CI installs it on the Windows runner (`shivammathur/setup-php`).
- The offered site on the phone: used only for this capture (Moon north,
  site check), never saved.
- Where the received horizon attaches on the desktop: as with a share link,
  a new horizon that becomes the active one.
- How long the host keeps access logs: the website's logs rotate daily and
  are kept for about eight days (already on the privacy page).

## As built (differences from the sketch above)

- `poll` answers 204 with `X-Relay-State` while waiting, as planned; every
  box answer also carries `X-Relay-Remaining` (seconds), which the countdowns
  use. `close` answers 204 even for a box that is already gone.
- `poll` hands out the reply on every poll until the desktop, having
  decrypted it, closes the box: a poll answer lost on the way would otherwise
  lose the horizon (review, October 19).
- The relay also refuses cross-site requests (`Sec-Fetch-Site`), keeps rate
  limits as salted address hashes (30 opens or replies per address, IPv6 per
  /64, per 10 minutes; the salt is replaced daily) and allows 200 live boxes.
  A box's age is its file's modification time, so the sweep only stats files.
- The QR encoder is Kazuhiko Arase's qrcode-generator 2.0.4, vendored
  unchanged as `web/qrcode.js` (a `.js` name, so the cache-token and import
  guards cover it; source and hashes in NOTICE).
- The relay section of `web/.htaccess` also denies every other PHP file.
- *Get from phone* sits with *Draw by hand* and *Import file* in the horizon
  list, since it adds a horizon. On the phone, the *Pairing* section offers
  *New horizon* when there is none yet.

## Horizon codes (as built, October 24)

The owner asked for a code assigned after creation that lasts 24 hours. A
horizon made in the planner (*Draw by hand*, *Capture with phone*, *Import
file*) is stored on the relay once it has a point, under a code like
`K7Q-4MX` (6 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`) shown beside
its name in the editor head. The desktop types the code into the field under
the QR code in *Get from phone*, at any time within the 24 hours, without the
phone.

| Request | From | Does |
|---|---|---|
| `POST ?box=<id>&op=put` + horizon, `X-Share-Token` | the device with the horizon | 201 stores it for 24 h; 204 replaces it (same token); 409 the code is taken |
| `GET ?box=<id>&op=get` | the desktop | 200 the sealed horizon, `X-Relay-Remaining`; 404 |
| `POST ?box=<id>&op=drop`, `X-Share-Token` | the device with the horizon | 204 deletes it; 403 another token |

- The box id is the first 16 bytes of SHA-256 of `nightseam-share-v1:id:<code>`;
  the AES key is PBKDF2-SHA-256 of the code (salt `nightseam-share-v1:key:<code>`,
  100,000 rounds). The body is the share-link text sealed as usual (purpose
  `share`). The code itself never reaches the relay.
- The making device keeps `{ code, token, expires }` per horizon in
  `localStorage` `nightseam_share_codes_v1` (not in backups). Edits and
  renames are sent 1.5 s after the last one; the expiry stays. After 24 hours
  the button reads *Get a code (24 h)*: a new code, never an extension.
  Deleting the horizon or *Delete from the server* drops it at once.
- Relay limits: 1,000 live codes, 30 new codes and 60 lookups (found or not)
  per address per 10 minutes, 64 KB each. Files are `<id>.share` beside the
  boxes, swept by modification time (the making time; edits keep it).
- What the relay could do: the stretched key keeps its files from being
  readable at a glance, but someone holding them could try every code. That
  is weaker than the QR path, whose key never reaches the server.
- Checks: `tests/js/pairing.mjs` (codes, keys, put/get/replace/drop against a
  stub), `tests/js/pairing_relay.mjs` and `tests/test_relay.py` (the real
  relay: expiry, tokens, limits), `web-pairing-short-code` in
  `tests/browser/pairing_checks.py` (automatic code, lookup, rename, renewal,
  deletion).
