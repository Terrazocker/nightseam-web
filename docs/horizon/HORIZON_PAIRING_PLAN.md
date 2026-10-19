# Horizon pairing plan

Created October 19, 2026. Proposed, not started. The owner asked for ways to
get a horizon captured on the phone onto the desktop, liked "the desktop
starts it" and short codes, and checked the hosting before this plan was
written. It extends phase 4 (share link) of the
[sensor capture plan](HORIZON_SENSOR_CAPTURE_PLAN.md); the share link, file
import/export and backups all stay.

It reverses one part of the 2026-10-15 decision (DECISIONS.md, "Share links,
not server shortcodes"): nightseam.de would hold encrypted data for a few
minutes. That needs a new DECISIONS.md entry, privacy text and a
server-policy review before anything is deployed.

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

## Open questions

- PHP in CI and on this machine: is `php` available for the relay tests on
  the Windows runner and locally, or does the relay test run only on Linux?
- The offered site on the phone: use it only for this capture (Moon north,
  site check), or offer to save it as a site.
- Where the received horizon attaches on the desktop: the site that started
  pairing, or the current selection, as the share link does today.
- How long the host keeps access logs (for the privacy text).
