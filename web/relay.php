<?php
/*
 * NightSeam pairing relay: a short-lived mailbox between a desktop and a phone
 * (docs/horizon/HORIZON_PAIRING_PLAN.md).
 *
 * The desktop opens a box with an encrypted offer, the phone reads it and
 * answers once with an encrypted horizon, the desktop collects the answer and
 * the box is gone. Both bodies are AES-GCM ciphertext made in the browser
 * (web/pairing.js); the key travels only in the QR code's fragment, so this
 * script never sees a site or a horizon. It stores one file per box in
 * nightseam-relay/, a sibling of the document root that no URL reaches.
 *
 *   POST ?box=<id>&op=open    body: offer   201; 409 when the id exists
 *   GET  ?box=<id>&op=offer                 200 offer; marks the box connected
 *   POST ?box=<id>&op=reply   body: reply   201; 409 when already answered
 *   GET  ?box=<id>&op=poll                  204 + X-Relay-State while waiting,
 *                                           200 reply (again until closed)
 *   POST ?box=<id>&op=close                 204; the box is deleted (also when gone)
 *
 * The desktop closes the box once it has decrypted the reply, so a poll
 * answer lost on the way does not lose the horizon; expiry removes the rest.
 *
 * Horizon codes keep one encrypted horizon for 24 hours under the box id a
 * short code hashes to (web/pairing.js). The device that made it holds a
 * random token; the file keeps only the token's SHA-256.
 *
 *   POST ?box=<id>&op=put   body + X-Share-Token   201 new; 204 replaced
 *                                                  (same token); 409 taken
 *   GET  ?box=<id>&op=get                          200 the horizon; 404
 *   POST ?box=<id>&op=drop  X-Share-Token          204; 403 another token
 * Unknown or expired boxes answer 404. Every box response carries
 * X-Relay-Remaining (seconds until it expires). No body, IP address or box id
 * is logged here; rate limits keep salted IP hashes (IPv6 by /64) for ten
 * minutes, and the salt is replaced daily.
 */
declare(strict_types=1);

const RELAY_DIR_NAME = 'nightseam-relay';
const BOX_TTL = 600;            // seconds from open to expiry
const MAX_BODY = 65536;         // bytes; a horizon link is at most 60,000 characters
const MAX_BOXES = 200;          // live boxes at once
const RATE_WINDOW = 600;        // seconds
const RATE_LIMIT = 30;          // opens or replies per IP address per window
const SWEEP_MAX = 50;           // expired boxes removed per request
const SALT_TTL = 86400;         // seconds before the rate-limit salt is replaced
const SHARE_TTL = 86400;        // seconds from making a horizon code to its expiry
const MAX_SHARES = 1000;        // live horizon codes at once (at most 64 MB)
const GET_LIMIT = 60;           // code lookups per IP address per window (guessing)

// A warning printed into a response would corrupt a binary body.
ini_set('display_errors', '0');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex');

function fail(int $status, string $message): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message]);
    exit;
}

/** The data folder: nightseam-relay/ next to the document root, never inside it. */
function relay_dir(): string {
    $root = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
    if ($root === false || $root === '') fail(503, 'relay unavailable');
    $dir = realpath(dirname($root) . DIRECTORY_SEPARATOR . RELAY_DIR_NAME);
    if ($dir === false || !is_dir($dir) || !is_writable($dir)) fail(503, 'relay unavailable');
    $inside = rtrim($root, '/\\') . DIRECTORY_SEPARATOR;
    if ($dir === $root || strncmp($dir . DIRECTORY_SEPARATOR, $inside, strlen($inside)) === 0) {
        fail(503, 'relay unavailable');
    }
    return $dir;
}

function box_path(string $dir, string $id): string {
    return $dir . DIRECTORY_SEPARATOR . $id . '.box';
}

function share_path(string $dir, string $id): string {
    return $dir . DIRECTORY_SEPARATOR . $id . '.share';
}

/** Write a file atomically: a temporary file in the same folder, then rename. */
function write_atomic(string $path, string $data): bool {
    $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $data) !== strlen($data)) { @unlink($tmp); return false; }
    if (!rename($tmp, $path)) { @unlink($tmp); return false; }
    return true;
}

function read_box(string $path): ?array {
    if (!is_file($path)) return null;
    $raw = @file_get_contents($path);
    if ($raw === false) return null;
    $box = json_decode($raw, true);
    if (!is_array($box) || !isset($box['opened'], $box['state'], $box['offer'])) return null;
    return $box;
}

/** The file's modification time is the box's opening time, so the sweep
 *  needs only a stat per box, never a read. */
function write_box(string $path, array $box): void {
    if (!write_atomic($path, json_encode($box)) || !@touch($path, (int)$box['opened'])) {
        fail(503, 'relay storage failed');
    }
}

function remaining(array $box, int $now): int {
    return (int)$box['opened'] + BOX_TTL - $now;
}

function read_share(string $path): ?array {
    if (!is_file($path)) return null;
    $raw = @file_get_contents($path);
    if ($raw === false) return null;
    $share = json_decode($raw, true);
    if (!is_array($share) || !isset($share['created'], $share['token'], $share['body'])) return null;
    return $share;
}

/** As for boxes, the modification time is the making time: updates keep it. */
function write_share(string $path, array $share): void {
    if (!write_atomic($path, json_encode($share)) || !@touch($path, (int)$share['created'])) {
        fail(503, 'relay storage failed');
    }
}

/** Remove expired boxes and horizon codes, stray temporary files and stale
 *  rate data; count the live boxes and codes. Stats only: the cost does not
 *  grow with their sizes. */
function sweep(string $dir, int $now): array {
    $live = 0;
    $shares = 0;
    $removed = 0;
    foreach (glob($dir . DIRECTORY_SEPARATOR . '*.box') ?: [] as $path) {
        $opened = @filemtime($path);
        if ($opened !== false && $opened + BOX_TTL > $now) { $live++; continue; }
        if ($removed < SWEEP_MAX) { @unlink($path); $removed++; }
    }
    foreach (glob($dir . DIRECTORY_SEPARATOR . '*.share') ?: [] as $path) {
        $created = @filemtime($path);
        if ($created !== false && $created + SHARE_TTL > $now) { $shares++; continue; }
        if ($removed < SWEEP_MAX) { @unlink($path); $removed++; }
    }
    foreach (glob($dir . DIRECTORY_SEPARATOR . '*.tmp') ?: [] as $path) {
        if ($removed < SWEEP_MAX && $now - (int)@filemtime($path) > 60) { @unlink($path); $removed++; }
    }
    $rates = $dir . DIRECTORY_SEPARATOR . 'rate.json';
    $changed = @filemtime($rates);
    if ($changed !== false && $now - $changed >= RATE_WINDOW) @unlink($rates);
    return [$live, $shares];
}

/** Who a request counts against: the IPv4 address, or the IPv6 /64 network
 *  (one subscriber usually holds a whole /64). */
function client_key(): string {
    $addr = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $bin = @inet_pton($addr);
    if ($bin !== false && strlen($bin) === 16) return bin2hex(substr($bin, 0, 8)) . '::/64';
    return $addr;
}

/** Count this request against its IP address; false when over the limit. */
function rate_ok(string $dir, string $kind, int $now, int $limit = RATE_LIMIT): bool {
    $saltPath = $dir . DIRECTORY_SEPARATOR . 'salt';
    $path = $dir . DIRECTORY_SEPARATOR . 'rate.json';
    $salt = @file_get_contents($saltPath);
    $made = @filemtime($saltPath);
    if ($salt === false || strlen($salt) !== 32 || $made === false || $now - $made >= SALT_TTL) {
        $salt = bin2hex(random_bytes(16));
        write_atomic($saltPath, $salt);
        @unlink($path);   // hashes under the old salt can no longer match
    }
    $who = hash('sha256', $salt . '|' . client_key());
    $rates = json_decode((string)@file_get_contents($path), true);
    if (!is_array($rates)) $rates = [];
    $kept = [];
    foreach ($rates as $key => $times) {
        if (!is_array($times)) continue;
        $times = array_values(array_filter($times, fn($t) => is_int($t) && $now - $t < RATE_WINDOW));
        if ($times) $kept[$key] = $times;
    }
    $key = $kind . ':' . $who;
    $mine = $kept[$key] ?? [];
    if (count($mine) >= $limit) { write_atomic($path, json_encode($kept)); return false; }
    $mine[] = $now;
    $kept[$key] = $mine;
    write_atomic($path, json_encode($kept));
    return true;
}

function read_body(): string {
    $type = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($type !== 'application/octet-stream') fail(415, 'expected application/octet-stream');
    $length = $_SERVER['CONTENT_LENGTH'] ?? '';
    if ($length !== '' && (!ctype_digit((string)$length) || (int)$length > MAX_BODY)) fail(413, 'body too large');
    $in = fopen('php://input', 'rb');
    $body = $in === false ? false : stream_get_contents($in, MAX_BODY + 1);
    if ($body === false) fail(400, 'body unreadable');
    if (strlen($body) > MAX_BODY) fail(413, 'body too large');
    if (strlen($body) < 29) fail(400, 'body too short');   // version, IV and GCM tag at least
    return $body;
}

function send_body(int $status, string $data, int $left): void {
    http_response_code($status);
    header('Content-Type: application/octet-stream');
    header('X-Relay-Remaining: ' . max(0, $left));
    header('Content-Length: ' . strlen($data));
    echo $data;
    exit;
}

function send_empty(int $status, int $left, ?string $state = null): void {
    http_response_code($status);
    header('X-Relay-Remaining: ' . max(0, $left));
    if ($state !== null) header('X-Relay-State: ' . $state);
    exit;
}

$method = (string)($_SERVER['REQUEST_METHOD'] ?? '');
$op = (string)($_GET['op'] ?? '');
$id = (string)($_GET['box'] ?? '');
$methods = ['open' => 'POST', 'offer' => 'GET', 'reply' => 'POST', 'poll' => 'GET', 'close' => 'POST',
            'put' => 'POST', 'get' => 'GET', 'drop' => 'POST'];
if (!isset($methods[$op])) fail(400, 'unknown operation');
if ($method !== $methods[$op]) { header('Allow: ' . $methods[$op]); fail(405, 'wrong method'); }
if (!preg_match('/^[A-Za-z0-9_-]{22}$/D', $id)) fail(400, 'bad box id');
// Reject cross-site requests; the planner itself sends same-origin requests only.
$site = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
if ($site !== '' && $site !== 'same-origin') fail(403, 'cross-site request');

$dir = relay_dir();
$body = $methods[$op] === 'POST' && $op !== 'close' && $op !== 'drop' ? read_body() : '';
$lock = fopen($dir . DIRECTORY_SEPARATOR . 'relay.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX)) fail(503, 'relay busy');
$now = time();
[$live, $shares] = sweep($dir, $now);

if ($op === 'put' || $op === 'get' || $op === 'drop') {
    $spath = share_path($dir, $id);
    $share = read_share($spath);
    if ($share !== null && (int)$share['created'] + SHARE_TTL <= $now) { @unlink($spath); $share = null; }
    if ($op === 'get') {
        // Every lookup counts, found or not: codes are short enough to guess.
        if (!rate_ok($dir, 'get', $now, GET_LIMIT)) fail(429, 'too many requests');
        if ($share === null) fail(404, 'no such code');
        $data = base64_decode((string)$share['body'], true);
        if ($data === false) fail(503, 'relay storage damaged');
        send_body(200, $data, (int)$share['created'] + SHARE_TTL - $now);
    }
    $token = (string)($_SERVER['HTTP_X_SHARE_TOKEN'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{22}$/D', $token)) fail(400, 'bad share token');
    $mine = $share !== null && hash_equals((string)$share['token'], hash('sha256', $token));
    if ($op === 'drop') {
        if ($share !== null && !$mine) fail(403, 'not this code\'s maker');
        @unlink($spath);
        send_empty(204, 0);
    }
    if ($share === null) {
        if (is_file($spath)) fail(409, 'code taken');   // unreadable: never overwritten
        if ($shares >= MAX_SHARES) fail(503, 'relay full');
        if (!rate_ok($dir, 'put', $now)) fail(429, 'too many requests');
        $share = ['created' => $now, 'token' => hash('sha256', $token)];
        $status = 201;
    } elseif (!$mine) {
        fail(409, 'code taken');
    } else {
        $status = 204;
    }
    $share['body'] = base64_encode($body);
    write_share($spath, $share);
    send_empty($status, (int)$share['created'] + SHARE_TTL - $now);
}

$path = box_path($dir, $id);
$box = read_box($path);
if ($box !== null && remaining($box, $now) <= 0) { @unlink($path); $box = null; }

if ($op === 'open') {
    if ($box !== null || is_file($path)) fail(409, 'box exists');
    if ($live >= MAX_BOXES) fail(503, 'relay full');
    if (!rate_ok($dir, 'open', $now)) fail(429, 'too many requests');
    write_box($path, ['opened' => $now, 'state' => 'open', 'offer' => base64_encode($body), 'reply' => null]);
    send_empty(201, BOX_TTL, 'open');
}
if ($op === 'close') { @unlink($path); send_empty(204, 0); }
if ($box === null) fail(404, 'no such box');
$left = remaining($box, $now);

if ($op === 'offer') {
    $offer = base64_decode((string)$box['offer'], true);
    if ($offer === false) fail(503, 'relay storage damaged');
    if ($box['state'] === 'open') { $box['state'] = 'connected'; write_box($path, $box); }
    send_body(200, $offer, $left);
}
if ($op === 'reply') {
    if ($box['reply'] !== null) fail(409, 'already answered');
    if (!rate_ok($dir, 'reply', $now)) fail(429, 'too many requests');
    $box['reply'] = base64_encode($body);
    $box['state'] = 'answered';
    write_box($path, $box);
    send_empty(201, $left, 'answered');
}
if ($op === 'poll') {
    if ($box['reply'] === null) send_empty(204, $left, (string)$box['state']);
    $reply = base64_decode((string)$box['reply'], true);
    if ($reply === false) fail(503, 'relay storage damaged');
    send_body(200, $reply, $left);
}
